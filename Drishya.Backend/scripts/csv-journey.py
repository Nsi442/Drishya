#!/usr/bin/env python3
"""
Book consignments from a CSV and drive them to the fulfilment centre, over HTTP.

    python csv-journey.py --csv shipments.csv
    python csv-journey.py --template          # writes a starter CSV and stops

One row of CSV is one consignment. For each row the script does exactly what a
person does in the vendor portal -- fills in the New shipment form, submits it,
then dispatches the vehicle -- and afterwards reports the truck's position every
few seconds until it reaches the dock.

WHY THIS NEEDS NOTHING INSTALLED
--------------------------------
Standard library only, and plain HTTP to the public site. No AWS CLI, no
credentials, no database driver, no port-forward, no shell on any server. It
runs on a locked-down desktop that has Python and a browser and nothing else.

That is possible because it goes through the API rather than at the database.
The API is the public face of the deployment on port 80; RDS is not reachable
from anywhere except the instance, by design. Talking to the API is also the
only way the rest of the platform notices: an INSERT moves a dot and nothing
else, whereas POST /api/v1/trips/{id}/positions evaluates the geofences, raises
GATE_IN and DOCK_IN, and asks the ETA engine to re-predict. The screen stays
coherent because every write goes the same way the browser's would.

WHAT THE CSV CARRIES, AND WHAT IT DOES NOT
------------------------------------------
The CSV carries the CONSIGNMENT -- what is being moved, how much of it, where
to, and on whose truck. It does not carry the route or any timestamps.

The route comes back from the API in the created consignment: the platform
draws it at booking, and re-deriving it here would put a second author on the
same line. Timing comes from --speed-kmph and --time-scale, for the same reason
the arrival estimate has one owner. This script reports position; the engine
decides what that means.

Rows may leave fc, vehicle and driver blank. Blank means "pick a sensible one",
and for the vehicle that means one whose rating actually covers the load --
booking 1800 kg onto an 850 kg truck is rejected by the API, correctly, and
guessing wrongly on the user's behalf is a worse failure than choosing well.
"""

import argparse
import csv
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lane_geometry import bearing_deg, cumulative, haversine_km, point_at_km  # noqa: E402

DEFAULT_SPEED_KMPH = 52.0
DEFAULT_TIME_SCALE = 60.0
FIX_INTERVAL_SIMULATED_S = 30.0
MAX_FIXES_PER_BATCH = 500

TEMPLATE = """\
reference,commodity,cartons,weight_kg,value_inr,priority,fc,vehicle,driver,seal_number,invoice_no
PO-9001,Brake assemblies,120,650,480000,high,FC Bhiwandi,,,SL-9001,INV/26-27/9001
PO-9002,Wiring harnesses,80,400,210000,normal,FC Manesar,,,SL-9002,INV/26-27/9002
PO-9003,Clutch plates,200,780,655000,normal,FC Whitefield,,,SL-9003,INV/26-27/9003
"""


# --- HTTP -------------------------------------------------------------------

class Api:
    """
    Thin client over urllib.

    <p>urllib rather than requests because a corporate desktop that cannot run
    the AWS CLI generally cannot pip install either. It honours http_proxy and
    https_proxy from the environment on its own, which is what such a desktop
    usually needs.
    """

    def __init__(self, base_url, insecure=False, proxy=None):
        self.base = normalise_base_url(base_url)
        self.token = None
        self.ctx = ssl._create_unverified_context() if insecure else None
        handlers = []
        if proxy:
            handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
        self.opener = urllib.request.build_opener(*handlers) if handlers else None

    def _open(self, req, timeout):
        if self.opener:
            return self.opener.open(req, timeout=timeout)
        return urllib.request.urlopen(req, timeout=timeout, context=self.ctx)

    def call(self, method, path, body=None, timeout=45, retries=2):
        """
        One request, with a bounded retry for a dropped connection.

        <p><b>A lost response is not a failed request.</b> "An existing
        connection was forcibly closed" arrives from getresponse(), after the
        request has been sent and quite possibly acted upon -- a trip started
        this way was found alive on the server afterwards, with only the reply
        lost in transit. So a retry can repeat work that already happened.

        <p>Retries are therefore for reads and for writes the server itself
        makes safe to repeat. Anything that would create a second consignment
        passes retries=0 and the caller decides; see book().

        <p>ConnectionResetError is an OSError, not a URLError. Catching only
        the latter let a single dropped packet end the whole run with a
        traceback, losing the rows that had not been reached yet.
        """
        url = self.base + path
        data = json.dumps(body).encode() if body is not None else None

        attempt = 0
        while True:
            req = urllib.request.Request(url, data=data, method=method)
            req.add_header("Content-Type", "application/json")
            req.add_header("Accept", "application/json")
            if self.token:
                req.add_header("Authorization", "Bearer " + self.token)
            try:
                with self._open(req, timeout) as r:
                    raw = r.read().decode()
                    return json.loads(raw) if raw else None

            except urllib.error.HTTPError as e:
                # The server answered. That is not a transport problem and
                # repeating it would get the same answer.
                raise ApiError(method, url, e.code, e.read().decode(errors="replace")[:600])

            except urllib.error.URLError as e:
                # Never reached the server: no host, refused, proxy in the way.
                raise SystemExit(
                    "Could not reach %s (%s).\n\n"
                    "Check the address is http:// and not https:// -- this deployment has\n"
                    "no certificate. On a corporate desktop you may also need a proxy:\n"
                    "    set HTTPS_PROXY=http://your.proxy:8080\n"
                    "or pass --proxy http://your.proxy:8080" % (url, e.reason))

            except OSError as e:
                # Reset, timeout, broken pipe -- mid-flight, outcome unknown.
                attempt += 1
                if attempt > retries:
                    raise TransportError(method, url, e)
                wait = 2 ** attempt
                print("  ... connection dropped on %s %s (%s); retrying in %ds"
                      % (method, path, type(e).__name__, wait))
                time.sleep(wait)

    def login(self, email, password):
        auth = self.call("POST", "/api/auth/login",
                         {"email": email, "password": password})
        self.token = auth["token"]
        # The signed-in account, kept because it already answers "which vendor
        # is this?" -- orgId on a vendor account is the tenant id. There is no
        # /api/auth/me to ask afterwards.
        self.user = auth.get("user") or {}
        return self.user


def normalise_base_url(raw):
    """
    Check the address before it is used, not on the first failed request.

    <p>Pasting a URL after typing the scheme yields http://http://host, which
    urllib reports as a name it could not resolve -- naming the doubled string
    but not the doubling. Caught here, it says what is wrong.
    """
    url = (raw or "").strip().rstrip("/")
    if not url:
        raise SystemExit("--base-url is empty. Pass the site address.")

    if url.count("://") > 1:
        fixed = url[url.rindex("://") - 4:] if url.rindex("://") >= 4 else url
        raise SystemExit(
            "The address has the scheme twice:\n    %s\n\n"
            "You probably meant:\n    %s" % (url, fixed))

    if not url.startswith(("http://", "https://")):
        raise SystemExit(
            "The address needs a scheme:\n    http://%s" % url)

    return url


class TransportError(Exception):
    """
    The connection failed mid-request, so whether the server acted is unknown.

    <p>Deliberately not an ApiError: an ApiError carries the server's own
    answer and is final, while this one means the caller may need to go and
    look at what actually happened.
    """

    def __init__(self, method, url, cause):
        self.method, self.url, self.cause = method, url, cause
        super().__init__("%s %s failed in transit (%s). Whether the server "
                         "acted on it is unknown." % (method, url, cause))


class ApiError(Exception):
    def __init__(self, method, url, code, detail):
        self.code = code
        self.detail = detail
        try:
            parsed = json.loads(detail)
            self.message = parsed.get("message") or detail
        except Exception:
            self.message = detail
        super().__init__("%s %s -> HTTP %s: %s" % (method, url, code, self.message))


# --- reference data ---------------------------------------------------------

def load_reference(api):
    """
    Fetched once, exactly as the browser does after sign-in.

    <p>A row can then name a fulfilment centre "FC Bhiwandi" rather than
    "fc-bhiwandi", which is the difference between a CSV somebody can edit and
    one they have to be given.
    """
    ref = {
        "fcs": api.call("GET", "/api/fulfilment-centres") or [],
        "vehicles": api.call("GET", "/api/vehicles") or [],
        "drivers": api.call("GET", "/api/drivers") or [],
        "vendors": api.call("GET", "/api/vendors") or [],
    }
    for key in ref:
        if isinstance(ref[key], dict):            # a paged response
            ref[key] = ref[key].get("content", [])
    return ref


def pick(rows, wanted, fields):
    """Match a row by id or by any of `fields`, case- and space-insensitively."""
    if not wanted:
        return None
    needle = wanted.strip().lower()
    for row in rows:
        if str(row.get("id", "")).lower() == needle:
            return row
    for row in rows:
        for f in fields:
            value = str(row.get(f) or "").lower()
            if value and (value == needle or needle in value or value in needle):
                return row
    return None


def choose_vehicle(vehicles, wanted, weight_kg, line, taken):
    if wanted:
        v = pick(vehicles, wanted, ["regNumber", "type"])
        if not v:
            raise RowError(line, "no vehicle matching %r" % wanted)
        if v.get("capacityKg", 0) < weight_kg:
            raise RowError(line, "%s is rated %d kg and the row carries %d kg. "
                                 "Leave the vehicle column blank to have one chosen."
                                 % (v.get("regNumber"), v["capacityKg"], weight_kg))
        return v

    # Blank: the smallest truck that can actually take the load, preferring one
    # this run has not already used.
    #
    # Smallest rather than first, so a 400 kg row does not consume the only
    # large vehicle and strand a later row that needs it. Unused rather than
    # simply smallest, because without that every row picks the same truck and
    # a CSV of three consignments dispatches three trips on one vehicle -- which
    # the API permits (its double-start guard is per consignment, not per
    # vehicle) and which reads on the map as one lorry in three places.
    fits = sorted((v for v in vehicles if v.get("capacityKg", 0) >= weight_kg),
                  key=lambda v: v["capacityKg"])
    if not fits:
        biggest = max((v.get("capacityKg", 0) for v in vehicles), default=0)
        raise RowError(line, "no vehicle in the fleet can carry %d kg "
                             "(the largest is rated %d kg)." % (weight_kg, biggest))
    for v in fits:
        if v["id"] not in taken:
            return v
    # More rows than trucks. Reusing one is better than failing the row, and the
    # caller is told rather than left to notice on the map.
    print("  note    every vehicle that can carry %d kg is already out; "
          "reusing %s" % (weight_kg, fits[0]["regNumber"]))
    return fits[0]


class RowError(Exception):
    def __init__(self, line, message):
        self.line = line
        super().__init__("row %d: %s" % (line, message))


# --- booking ----------------------------------------------------------------

def read_rows(path):
    """
    Load the consignment rows.

    <p>The two ways this goes wrong on a fresh machine are a file that was
    never created and a file saved as .csv.txt by a Windows dialog with
    extensions hidden. Both used to surface as a bare FileNotFoundError
    traceback, which names the file but not what to do about it.
    """
    try:
        with open(path, newline="", encoding="utf-8-sig") as fh:
            rows = list(csv.DictReader(fh))
    except FileNotFoundError:
        hint = ""
        folder = os.path.dirname(os.path.abspath(path)) or "."
        try:
            near = [f for f in os.listdir(folder)
                    if f.lower().startswith(os.path.basename(path).lower())]
            if near:
                hint = "\n\nThere is a %s here -- Windows hides extensions, so a file\n" \
                       "saved from a browser often ends up named that way. Rename it." % near[0]
        except OSError:
            pass
        raise SystemExit(
            "No such file: %s\n\n"
            "Create a starter one first:\n"
            "    python %s --template%s"
            % (path, os.path.basename(sys.argv[0]), hint))
    except IsADirectoryError:
        raise SystemExit("%s is a folder, not a CSV file." % path)

    if not rows:
        raise SystemExit("%s has a header but no rows." % path)
    return rows


def as_int(row, key, line, default=0):
    raw = (row.get(key) or "").strip()
    if not raw:
        return default
    try:
        return int(float(raw))
    except ValueError:
        raise RowError(line, "%s must be a number, not %r" % (key, raw))


def book(api, ref, row, line, vendor_id, taken_vehicles, taken_drivers):
    weight = as_int(row, "weight_kg", line)
    if weight <= 0:
        raise RowError(line, "weight_kg must be greater than zero.")

    fc = pick(ref["fcs"], row.get("fc"), ["name", "city"]) or (
        ref["fcs"][0] if ref["fcs"] else None)
    if not fc:
        raise RowError(line, "no fulfilment centres are available.")

    vehicle = choose_vehicle(ref["vehicles"], row.get("vehicle"), weight, line,
                             taken_vehicles)
    taken_vehicles.add(vehicle["id"])

    driver = pick(ref["drivers"], row.get("driver"), ["name", "phone"])
    if not driver:
        # The driver already on that vehicle, if the directory knows one.
        driver = next((d for d in ref["drivers"]
                       if d.get("vehicleId") == vehicle["id"]), None)
    if not driver or driver["id"] in taken_drivers:
        driver = next((d for d in ref["drivers"]
                       if d.get("available") and d["id"] not in taken_drivers), driver)
    if not driver:
        driver = next((d for d in ref["drivers"] if d.get("available")), None)
    if not driver:
        raise RowError(line, "no driver available.")
    taken_drivers.add(driver["id"])

    priority = (row.get("priority") or "normal").strip().lower() or "normal"

    payload = {
        "reference": (row.get("reference") or "").strip() or None,
        "vendorId": vendor_id,
        "fcId": fc["id"],
        "vehicleId": vehicle["id"],
        "driverId": driver["id"],
        "commodity": (row.get("commodity") or "").strip() or "General cargo",
        "cartons": as_int(row, "cartons", line, 1) or 1,
        "weightKg": weight,
        "valueInr": as_int(row, "value_inr", line, 0),
        "priority": priority,
        "sealNumber": (row.get("seal_number") or "").strip() or None,
        "invoiceNo": (row.get("invoice_no") or "").strip() or None,
    }

    try:
        # retries=0: repeating this could book the consignment twice, and a
        # duplicate on the vendor's board is worse than a row that failed
        # loudly. If the connection drops, look for it rather than resend.
        shipment = api.call("POST", "/api/shipments", payload, retries=0)
    except ApiError as e:
        raise RowError(line, e.message)
    except TransportError:
        found = find_recent_booking(api, payload)
        if found:
            print("  note    connection dropped, but %s was booked; continuing"
                  % found["id"])
            return found, fc, vehicle, driver
        raise RowError(line, "the connection dropped while booking and no "
                             "matching consignment was created. Re-run this row.")

    return shipment, fc, vehicle, driver


def find_recent_booking(api, payload):
    """
    Did the booking we lost the reply to actually happen?

    <p>Matched on the vendor's own reference rather than on a server id we
    never received. Only consignments still in CREATED are considered: an
    older one with the same reference has already been dispatched and is not
    what this run just made.
    """
    try:
        listing = api.call("GET", "/api/shipments/all") or []
    except (ApiError, TransportError):
        return None
    rows = listing if isinstance(listing, list) else listing.get("content", [])

    reference = payload.get("reference")
    for s in rows:
        if s.get("status") != "created":
            continue
        if reference and s.get("reference") == reference:
            return s
        if not reference and s.get("commodity") == payload.get("commodity") \
                and s.get("cartons") == payload.get("cartons"):
            return s
    return None


# --- driving ----------------------------------------------------------------

def start_trip(api, shipment_id, vehicle, driver):
    """
    Dispatch the vehicle, tolerating a reply that never arrives.

    <p>This is the call that failed in practice: the connection was reset
    while the response came back, and the trip was found alive on the server
    afterwards. Retrying blindly would have hit the API's own double-start
    guard and read as an error; asking what exists is both safer and truer.
    """
    try:
        trip = api.call("POST", "/api/v1/trips/from-shipment/" + shipment_id,
                        {"vehicleRegistration": vehicle["regNumber"],
                         "driverId": driver["id"]}, retries=0)
        return trip["trip"]["tripId"]
    except (TransportError, ApiError) as e:
        existing = api.call("GET", "/api/v1/trips/by-shipment/" + shipment_id) or []
        active = [t for t in existing
                  if t.get("status") in ("active", "planned", "at_gate", "at_dock")]
        if active:
            print("  note    dispatch reply was lost, but trip %s is running; "
                  "continuing" % active[0]["tripId"])
            return active[0]["tripId"]
        raise


def driving_route(shipment, fc):
    """
    The booked route, with the receiving bay appended.

    <p>A shipment's stored route ends at the site CENTROID, which on a large
    plot is a couple of hundred metres from the bays -- inside the arrival
    geofence and outside the dock one. A vehicle driven to the last stored point
    therefore raises GATE_IN and then sits there, and the consignment never
    reads as docked. TripSimulationService appends the same point server-side
    for the same reason.
    """
    route = [(p["lat"], p["lng"]) for p in (shipment.get("route") or [])]
    if len(route) < 2:
        return route

    dock_lat, dock_lng = fc.get("dockLat"), fc.get("dockLng")
    if dock_lat is not None and dock_lng is not None:
        dock = (dock_lat, dock_lng)
        if haversine_km(route[-1], dock) > 0.001:
            route.append(dock)
    return route


class Journey:
    """One consignment, from booked to docked."""

    def __init__(self, shipment, trip_id, route, speed_kmph):
        self.shipment_id = shipment["id"]
        self.reference = shipment.get("reference") or shipment["id"]
        self.trip_id = trip_id
        self.route = route
        self.cum = cumulative(route)
        self.total_km = self.cum[-1]
        self.speed = speed_kmph
        self.travelled = 0.0
        self.heading = bearing_deg(route[0], route[1])
        self.sent = 0
        self.done = False

    def tick(self, km_this_tick, fixes):
        """Advance and return this tick's fixes, ready to post."""
        step = km_this_tick / fixes
        batch = []
        now_ms = int(time.time() * 1000)
        for i in range(fixes):
            self.travelled = min(self.total_km, self.travelled + step)
            here = point_at_km(self.route, self.cum, self.travelled)
            ahead = point_at_km(self.route, self.cum, min(self.total_km, self.travelled + 0.05))
            if ahead != here:
                self.heading = bearing_deg(here, ahead)
            batch.append({
                "lat": round(here[0], 6),
                "lon": round(here[1], 6),
                "speedKmph": round(self.speed, 1),
                "headingDeg": round(self.heading, 1),
                "deviceTimestamp": now_ms - (fixes - 1 - i) * 1000,
                # Never "browser". The evidence pack is a chargeback artefact
                # and a generated trace must not be admissible as observed.
                "source": "simulated",
            })
            if self.travelled >= self.total_km:
                self.done = True
                break
        return batch

    @property
    def pct(self):
        return 100.0 * self.travelled / self.total_km if self.total_km else 100.0


# --- main -------------------------------------------------------------------

def run(api, args):
    rows = read_rows(args.csv)
    print("Signing in as %s" % args.email)
    user = api.login(args.email, args.password)
    vendor_id = args.vendor_id or user.get("orgId")

    ref = load_reference(api)
    if not vendor_id:
        # Fall back to the only vendor this account can see. A vendor's own
        # listing is scoped to itself, so a single row is the caller.
        if len(ref["vendors"]) == 1:
            vendor_id = ref["vendors"][0]["id"]
        else:
            raise SystemExit(
                "Could not work out which vendor to book as. Pass --vendor-id.")
    print("Booking as vendor %s — %d fulfilment centres, %d vehicles, %d drivers known\n"
          % (vendor_id, len(ref["fcs"]), len(ref["vehicles"]), len(ref["drivers"])))

    journeys, failures = [], []
    taken_vehicles, taken_drivers = set(), set()
    for n, row in enumerate(rows, start=2):        # line 1 is the header
        try:
            shipment, fc, vehicle, driver = book(api, ref, row, n, vendor_id,
                                                 taken_vehicles, taken_drivers)
            print("  booked  %-11s %-14s %s -> %s on %s"
                  % (shipment["id"], shipment.get("reference") or "",
                     shipment["origin"]["name"], shipment["destination"]["name"],
                     vehicle["regNumber"]))

            if args.book_only:
                continue

            trip_id = start_trip(api, shipment["id"], vehicle, driver)

            route = driving_route(shipment, fc)
            if len(route) < 2:
                failures.append("row %d: %s was booked without a route to drive."
                                % (n, shipment["id"]))
                continue

            journeys.append(Journey(shipment, trip_id, route, args.speed_kmph))
            print("  started %-11s trip %s, %.0f km\n"
                  % (shipment["id"], trip_id, journeys[-1].total_km))

        except (RowError, ApiError, TransportError) as e:
            failures.append("row %d: %s" % (n, e) if not isinstance(e, RowError) else str(e))
            print("  FAILED  %s" % e)

    if args.book_only:
        print("\n%d booked, %d failed. Nothing dispatched (--book-only)."
              % (len(rows) - len(failures), len(failures)))
        return

    if not journeys:
        raise SystemExit("Nothing to drive. Fix the rows above and run again.")

    km_per_tick = args.speed_kmph * args.time_scale * (args.interval / 3600.0)
    fixes_per_tick = max(1, min(MAX_FIXES_PER_BATCH, int(round(
        args.interval * args.time_scale / FIX_INTERVAL_SIMULATED_S))))
    longest = max(j.total_km for j in journeys)

    print("Driving %d consignment(s). Longest is %.0f km, about %.1f real minutes at %gx."
          % (len(journeys), longest,
             (longest / args.speed_kmph) * 60.0 / args.time_scale, args.time_scale))
    print("Positions every %gs. Ctrl-C stops; the trips stay where they are.\n"
          % args.interval)

    try:
        while any(not j.done for j in journeys):
            for j in journeys:
                if j.done:
                    continue
                batch = j.tick(km_per_tick, fixes_per_tick)
                try:
                    # Position batches ARE safe to repeat: the trace is
                    # append-only telemetry and a duplicated fix costs a
                    # slightly denser line, not a wrong one.
                    ack = api.call("POST", "/api/v1/trips/%s/positions" % j.trip_id,
                                   {"positions": batch}, retries=3)
                except ApiError as e:
                    print("  %-11s ingest rejected: %s" % (j.shipment_id, e.message))
                    j.done = True
                    continue
                except TransportError as e:
                    # One consignment losing its connection must not stop the
                    # others, and the trip stays where it is either way.
                    print("  %-11s %s" % (j.shipment_id, e))
                    j.done = True
                    continue
                j.sent += ack.get("accepted", 0)
                last = batch[-1]
                print("  %-11s %5.1f%%  %7.1f/%.0f km  %.4f,%.4f  +%d%s"
                      % (j.shipment_id, j.pct, j.travelled, j.total_km,
                         last["lat"], last["lon"], ack.get("accepted", 0),
                         "  ARRIVED" if j.done else ""))
            if any(not j.done for j in journeys):
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped. %d consignment(s) left mid-route; their trips remain open."
              % sum(1 for j in journeys if not j.done))
        sys.exit(130)

    print("\nAll arrived.")
    for j in journeys:
        print("  %-11s %-14s %d fixes over %.0f km" % (j.shipment_id, j.reference,
                                                       j.sent, j.total_km))
    if failures:
        print("\n%d row(s) did not run:" % len(failures))
        for f in failures:
            print("  " + f)
    print("\nGeofence evaluation runs after each response, so give it a few seconds\n"
          "before checking the gate and dock events on the consignment.")


def main():
    p = argparse.ArgumentParser(
        description="Book consignments from a CSV and drive them to the FC.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Set DRISHYA_URL, DRISHYA_EMAIL and DRISHYA_PASSWORD to avoid "
               "repeating them. Standard library only -- nothing to install.")
    p.add_argument("--csv", help="One consignment per row.")
    p.add_argument("--template", action="store_true",
                   help="Write a starter shipments.csv and exit.")
    p.add_argument("--base-url", default=os.environ.get("DRISHYA_URL", "http://localhost:8080"))
    p.add_argument("--email", default=os.environ.get("DRISHYA_EMAIL", "priya@anandauto.example"))
    p.add_argument("--password", default=os.environ.get("DRISHYA_PASSWORD", "drishya"))
    p.add_argument("--vendor-id", default=os.environ.get("DRISHYA_VENDOR"),
                   help="Book as this vendor. Derived from the account if omitted.")
    p.add_argument("--proxy", default=None, help="http://host:port, for a corporate desktop.")
    p.add_argument("--insecure", action="store_true", help="Skip certificate verification.")
    p.add_argument("--book-only", action="store_true",
                   help="Create the consignments but do not dispatch or drive them.")
    p.add_argument("--speed-kmph", type=float, default=DEFAULT_SPEED_KMPH)
    p.add_argument("--time-scale", type=float, default=DEFAULT_TIME_SCALE,
                   help="Simulated seconds per real second. 60 = a minute a second.")
    p.add_argument("--interval", type=float, default=5.0,
                   help="Real seconds between position batches.")
    args = p.parse_args()

    if args.template:
        path = args.csv or "shipments.csv"
        if os.path.exists(path):
            raise SystemExit("%s already exists; not overwriting it." % path)
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(TEMPLATE)
        print("Wrote %s. Edit it, then:\n    python %s --csv %s"
              % (path, os.path.basename(__file__), path))
        return

    if not args.csv:
        raise SystemExit("Pass --csv <file>, or --template to write a starter one.")

    api = Api(args.base_url, args.insecure, args.proxy)
    run(api, args)


if __name__ == "__main__":
    main()
