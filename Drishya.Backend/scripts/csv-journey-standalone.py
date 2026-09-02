#!/usr/bin/env python3
"""
Book consignments from a CSV and drive them to the fulfilment centre, over HTTP.

    python csv-journey-standalone.py --csv shipments.csv
    python csv-journey-standalone.py --template          # writes a starter CSV and stops

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
import math
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

# --- lane geometry, inlined -------------------------------------------------
#
# GENERATED. In the repository this lives in lane_geometry.py, shared with
# csv-rds-feeder.py and csv-telemetry-feeder.py so the three cannot disagree
# about where a vehicle is. It is copied in here only so this file can be
# moved to a machine that cannot reach GitHub as ONE file rather than two.
#
# Edit lane_geometry.py, never this copy, and regenerate with:
#     python Drishya.Backend/scripts/make-standalone.py

EARTH_RADIUS_KM = 6371.0088


def haversine_km(a, b):
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def bearing_deg(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlon = math.radians(b[1] - a[1])
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def cumulative(points):
    """Distance along the polyline at each vertex. First entry is always 0."""
    out = [0.0]
    for i in range(1, len(points)):
        out.append(out[-1] + haversine_km(points[i - 1], points[i]))
    return out


def point_at_km(points, cum, km):
    """Interpolate a position `km` along the polyline, clamped at both ends."""
    if km <= 0:
        return points[0]
    if km >= cum[-1]:
        return points[-1]
    for i in range(1, len(cum)):
        if cum[i] >= km:
            span = cum[i] - cum[i - 1]
            t = 0.0 if span == 0 else (km - cum[i - 1]) / span
            (lat1, lon1), (lat2, lon2) = points[i - 1], points[i]
            return (lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t)
    return points[-1]


class LaneError(Exception):
    """A CSV that cannot be read as a journey. Callers turn this into an exit."""


def read_csv(path):
    """
    Accepts lat/lon or lat/lng, case-insensitively, with any other columns
    present and ignored. A header is required -- guessing which of two numeric
    columns is the latitude is how a lane ends up drawn across the Arabian Sea.
    """
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise LaneError("%s has a header but no rows." % path)

    keys = {k.strip().lower(): k for k in rows[0].keys() if k}
    lat_key = keys.get("lat") or keys.get("latitude")
    lon_key = keys.get("lon") or keys.get("lng") or keys.get("longitude")
    if not lat_key or not lon_key:
        raise LaneError(
            "%s needs a latitude and a longitude column. Found: %s\n"
            "Accepted names: lat/latitude and lon/lng/longitude."
            % (path, ", ".join(rows[0].keys())))

    points = []
    for n, row in enumerate(rows, start=2):     # line 1 is the header
        try:
            lat, lon = float(row[lat_key]), float(row[lon_key])
        except (TypeError, ValueError):
            raise LaneError("%s line %d: latitude and longitude must be numbers."
                            % (path, n))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise LaneError("%s line %d: %s,%s is not on Earth." % (path, n, lat, lon))
        # Consecutive duplicates make a zero-length segment, which is a divide
        # by zero in the interpolation and contributes nothing to the shape.
        if not points or (lat, lon) != points[-1]:
            points.append((lat, lon))

    if len(points) < 2:
        raise LaneError("%s describes a single place, not a journey." % path)
    return points


def walk(points, cum, from_km, km_per_tick, fixes_per_tick):
    """
    Yield (lat, lon, heading, travelled_km) for one tick's worth of fixes.

    Heading is held across the arrival: at the destination the lookahead clamps
    onto the current point and the bearing collapses to 0.0 -- due north, stated
    as confidently as a real heading.
    """
    total = cum[-1]
    travelled = from_km
    heading = bearing_deg(points[0], points[1])
    step = km_per_tick / fixes_per_tick

    while travelled < total:
        batch = []
        for _ in range(fixes_per_tick):
            travelled = min(total, travelled + step)
            here = point_at_km(points, cum, travelled)
            ahead = point_at_km(points, cum, min(total, travelled + 0.05))
            if ahead != here:
                heading = bearing_deg(here, ahead)
            batch.append((here[0], here[1], heading, travelled))
            if travelled >= total:
                break
        yield batch

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
        self.base = base_url.rstrip("/")
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

    def call(self, method, path, body=None, timeout=45):
        url = self.base + path
        data = json.dumps(body).encode() if body is not None else None
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
            raise ApiError(method, url, e.code, e.read().decode(errors="replace")[:600])
        except urllib.error.URLError as e:
            raise SystemExit(
                "Could not reach %s (%s).\n\n"
                "Check the address is http:// and not https:// -- this deployment has\n"
                "no certificate. On a corporate desktop you may also need a proxy:\n"
                "    set HTTPS_PROXY=http://your.proxy:8080\n"
                "or pass --proxy http://your.proxy:8080" % (url, e.reason))

    def login(self, email, password):
        auth = self.call("POST", "/api/auth/login",
                         {"email": email, "password": password})
        self.token = auth["token"]
        # The signed-in account, kept because it already answers "which vendor
        # is this?" -- orgId on a vendor account is the tenant id. There is no
        # /api/auth/me to ask afterwards.
        self.user = auth.get("user") or {}
        return self.user


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
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
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
        shipment = api.call("POST", "/api/shipments", payload)
    except ApiError as e:
        raise RowError(line, e.message)

    return shipment, fc, vehicle, driver


# --- driving ----------------------------------------------------------------

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

            trip = api.call("POST", "/api/v1/trips/from-shipment/" + shipment["id"],
                            {"vehicleRegistration": vehicle["regNumber"],
                             "driverId": driver["id"]})
            trip_id = trip["trip"]["tripId"]

            route = driving_route(shipment, fc)
            if len(route) < 2:
                failures.append("row %d: %s was booked without a route to drive."
                                % (n, shipment["id"]))
                continue

            journeys.append(Journey(shipment, trip_id, route, args.speed_kmph))
            print("  started %-11s trip %s, %.0f km\n"
                  % (shipment["id"], trip_id, journeys[-1].total_km))

        except (RowError, ApiError) as e:
            failures.append(str(e))
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
                    ack = api.call("POST", "/api/v1/trips/%s/positions" % j.trip_id,
                                   {"positions": batch})
                except ApiError as e:
                    print("  %-11s ingest rejected: %s" % (j.shipment_id, e.message))
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
