#!/usr/bin/env python3
"""
Drive a consignment from source to destination by feeding a CSV of waypoints
into a deployed Drishya, from a laptop, over HTTP.

    python csv-telemetry-feeder.py route  --shipment SHP-1042 -o lane.csv
    python csv-telemetry-feeder.py feed   --shipment SHP-1042 --csv lane.csv

WHY THIS TALKS TO THE API AND NOT TO THE DATABASE
-------------------------------------------------
The obvious shape for "a Python script that feeds the RDS instance" is
psycopg2 and an INSERT. It does not work here, for two independent reasons,
and both are deliberate:

  1. RDS is not publicly reachable. It sits in the stack's own VPC with
     PubliclyAccessible: false, and its security group admits exactly one
     source -- the API instance's security group, not a CIDR. A connection
     from a desktop does not get refused, it hangs until it times out, which
     reads like a wrong password rather than like a closed door.

  2. An INSERT would produce a moving dot and nothing else. Writing a
     positions row does not evaluate the geofences, so no GATE_IN or DOCK_IN
     event is raised; it does not run FeatureBuilder, so predictedAt never
     moves; it does not update the trip's last-fix time, so the staleness
     guard eventually declares the vehicle lost while rows are still
     arriving. Every number on the page would sit frozen beside a marker
     that is visibly travelling -- which is a worse demo than no demo.

POST /api/v1/trips/{tripId}/positions is the ingest path the whole system is
built around, it is reachable on port 80 through nginx, and it does all of
the above. So this script is an HTTP client.

WHAT THE CSV SUPPLIES, AND WHAT IT DOES NOT
-------------------------------------------
The CSV supplies GEOMETRY: an ordered list of lat/lon waypoints from origin to
fulfilment centre. It does not supply motion. Timing comes from --speed-kmph
and --time-scale, and the script walks the polyline at that speed, exactly as
the server-side simulator does.

That split is on purpose. A CSV that also carried timestamps would be a second
author of the arrival estimate, and this project has already been bitten by
that: the browser simulation and the ETA engine both wrote predictedAt with no
arbiter, and a consignment came to show "108 h late" from seeded timestamps
days in the past. The engine owns the estimate. This script reports position.

Standard library only -- no pip install on a machine that just wants to run it.
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
from lane_geometry import (  # noqa: E402
    LaneError, bearing_deg, cumulative, haversine_km, point_at_km, read_csv)

# Mirrors TripSimulationService, so a laptop-fed trip and a server-fed one move
# at the same rate and a viewer cannot tell which is which by watching.
DEFAULT_SPEED_KMPH = 52.0
DEFAULT_TIME_SCALE = 60.0
FIX_INTERVAL_SIMULATED_S = 30.0
MAX_FIXES_PER_BATCH = 500          # the endpoint's own @Size cap


# --- HTTP -------------------------------------------------------------------

class Api:
    def __init__(self, base_url, insecure=False):
        self.base = base_url.rstrip("/")
        self.token = None
        self.ctx = ssl._create_unverified_context() if insecure else None

    def _call(self, method, path, body=None):
        url = self.base + path
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        if self.token:
            req.add_header("Authorization", "Bearer " + self.token)
        try:
            with urllib.request.urlopen(req, timeout=45, context=self.ctx) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:800]
            raise SystemExit(
                "%s %s -> HTTP %s\n%s\n\n"
                "A 401 here is an expired or wrong token; a 403 is the right token "
                "in the wrong role (ingest and trip-start are VENDOR_ADMIN or "
                "DISPATCHER); a 404 on a shipment id usually means it belongs to "
                "another tenant, which this API reports as absent rather than "
                "forbidden." % (method, url, e.code, detail))
        except urllib.error.URLError as e:
            raise SystemExit(
                "Could not reach %s (%s).\n"
                "Check the host is up and that you are using http:// -- this "
                "deployment has no certificate." % (url, e.reason))

    def login(self, email, password):
        self.token = self._call("POST", "/api/auth/login",
                                {"email": email, "password": password})["token"]

    def shipment(self, shipment_id):
        return self._call("GET", "/api/shipments/" + shipment_id)

    def trips_for(self, shipment_id):
        return self._call("GET", "/api/v1/trips/by-shipment/" + shipment_id) or []

    def start_trip(self, shipment_id, vehicle, driver_id=None):
        return self._call("POST", "/api/v1/trips/from-shipment/" + shipment_id,
                          {"vehicleRegistration": vehicle, "driverId": driver_id})

    def ingest(self, trip_id, fixes):
        return self._call("POST", "/api/v1/trips/%s/positions" % trip_id,
                          {"positions": fixes})


# --- csv --------------------------------------------------------------------

def read_csv(path):
    """
    Accepts lat/lon or lat/lng, case-insensitively, with any other columns
    present and ignored. A header is required -- guessing which of two numeric
    columns is the latitude is how a lane ends up drawn across the Arabian Sea.
    """
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise SystemExit("%s has a header but no rows." % path)

    keys = {k.strip().lower(): k for k in rows[0].keys() if k}
    lat_key = keys.get("lat") or keys.get("latitude")
    lon_key = keys.get("lon") or keys.get("lng") or keys.get("longitude")
    if not lat_key or not lon_key:
        raise SystemExit(
            "%s needs a latitude and a longitude column. Found: %s\n"
            "Accepted names: lat/latitude and lon/lng/longitude."
            % (path, ", ".join(rows[0].keys())))

    points = []
    for n, row in enumerate(rows, start=2):     # line 1 is the header
        try:
            lat, lon = float(row[lat_key]), float(row[lon_key])
        except (TypeError, ValueError):
            raise SystemExit("%s line %d: latitude and longitude must be numbers."
                             % (path, n))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise SystemExit("%s line %d: %s,%s is not on Earth." % (path, n, lat, lon))
        # Consecutive duplicates make a zero-length segment, which is a divide
        # by zero in the interpolation and contributes nothing to the shape.
        if not points or (lat, lon) != points[-1]:
            points.append((lat, lon))

    if len(points) < 2:
        raise SystemExit("%s describes a single place, not a journey." % path)
    return points


def cmd_route(api, args):
    """Dump a shipment's own route to CSV, so there is something real to feed."""
    shipment = api.shipment(args.shipment)
    route = shipment.get("route") or []
    if len(route) < 2:
        raise SystemExit("%s has no stored route to export." % args.shipment)

    with open(args.out, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["lat", "lon", "note"])
        for i, p in enumerate(route):
            note = ""
            if i == 0:
                note = (shipment.get("origin") or {}).get("name", "origin")
            elif i == len(route) - 1:
                note = (shipment.get("destination") or {}).get("name", "destination")
            w.writerow([p["lat"], p["lng"], note])

    total = cumulative([(p["lat"], p["lng"]) for p in route])[-1]
    print("Wrote %d waypoints (%.1f km) to %s" % (len(route), total, args.out))
    print("Edit it freely, then: feed --shipment %s --csv %s" % (args.shipment, args.out))


def resolve_trip(api, args):
    if args.trip:
        return args.trip

    active = [t for t in api.trips_for(args.shipment)
              if t.get("status") in ("in_transit", "at_gate", "at_dock", "planned")]
    if active:
        trip = active[0]
        print("Reusing trip %s (%s) on %s"
              % (trip["tripId"], trip["status"], trip.get("vehicleRegistration")))
        return trip["tripId"]

    if not args.vehicle:
        raise SystemExit(
            "No active trip on %s, and no --vehicle given to start one.\n"
            "Pass --vehicle MH12AB1234 (any registration in the fleet directory)."
            % args.shipment)

    detail = api.start_trip(args.shipment, args.vehicle, args.driver)
    trip_id = detail["trip"]["tripId"]
    print("Started trip %s on %s" % (trip_id, args.vehicle))
    return trip_id


def warn_if_far_from_origin(api, shipment_id, first_point):
    """
    Swapped lat/lon columns are the mistake this script invites, and for an
    Indian lane the range check cannot see it: latitude 18 and longitude 73 are
    both valid latitudes, so the file parses cleanly and the vehicle sets off
    across Central Asia. The shipment knows where it starts, so ask it.
    """
    try:
        origin = (api.shipment(shipment_id) or {}).get("origin") or {}
        gap = haversine_km(first_point, (origin["lat"], origin["lng"]))
    except (KeyError, TypeError, SystemExit):
        return
    if gap > 50:
        print("WARNING: the CSV starts %.0f km from %s, the shipment's origin."
              % (gap, origin.get("name", "its origin")))
        print("         If this is an Indian lane, check the columns are not "
              "swapped -- lat 18 / lon 73 both parse as valid latitudes.\n")


def cmd_feed(api, args):
    try:
        points = read_csv(args.csv)
    except LaneError as e:
        raise SystemExit(str(e))
    cum = cumulative(points)
    total_km = cum[-1]
    if args.shipment:
        warn_if_far_from_origin(api, args.shipment, points[0])
    trip_id = resolve_trip(api, args)

    # One wall-clock tick covers this much simulated ground.
    km_per_tick = args.speed_kmph * args.time_scale * (args.interval / 3600.0)
    fixes_per_tick = max(1, int(round(
        args.interval * args.time_scale / FIX_INTERVAL_SIMULATED_S)))
    fixes_per_tick = min(fixes_per_tick, MAX_FIXES_PER_BATCH)

    eta_min = (total_km / args.speed_kmph) * 60.0 / args.time_scale
    print("%.1f km over %d waypoints -> about %.1f real minutes at %gx"
          % (total_km, len(points), eta_min, args.time_scale))
    print("Posting %d fixes every %gs to %s/api/v1/trips/%s/positions"
          % (fixes_per_tick, args.interval, api.base, trip_id))
    print("Ctrl-C to stop; the trip stays where it is and this resumes with "
          "--from-km.\n")

    travelled = args.from_km
    sent = 0
    heading = bearing_deg(points[0], points[1])
    while travelled < total_km:
        step = km_per_tick / fixes_per_tick
        fixes = []
        now_ms = int(time.time() * 1000)

        for i in range(fixes_per_tick):
            travelled = min(total_km, travelled + step)
            here = point_at_km(points, cum, travelled)
            ahead = point_at_km(points, cum, min(total_km, travelled + 0.05))
            # At the destination the lookahead clamps onto the current point and
            # the bearing collapses to 0.0 -- due north, stated as confidently as
            # a real heading. Hold the last real one instead.
            if ahead != here:
                heading = bearing_deg(here, ahead)
            # Stamped backwards across the interval so the batch looks like a
            # buffer emptied on reconnect rather than a burst at one instant.
            offset = int((fixes_per_tick - 1 - i) * (args.interval * 1000.0 / fixes_per_tick))
            fixes.append({
                "lat": round(here[0], 6),
                "lon": round(here[1], 6),
                "speedKmph": round(args.speed_kmph, 1),
                "headingDeg": round(heading, 1),
                "deviceTimestamp": now_ms - offset,
                # Never "browser". These fixes are generated, and the evidence
                # pack is a chargeback artefact -- a simulated trace presented
                # as observed truth is the one thing the source column exists
                # to prevent.
                "source": "simulated",
            })
            if travelled >= total_km:
                break

        ack = api.ingest(trip_id, fixes)
        sent += ack.get("accepted", 0)
        pct = 100.0 * travelled / total_km
        last = fixes[-1]
        print("  %5.1f%%  %8.1f/%.1f km  %.4f,%.4f  accepted %d%s"
              % (pct, travelled, total_km, last["lat"], last["lon"],
                 ack.get("accepted", 0),
                 "  REJECTED %d %s" % (ack["rejected"], ack.get("rejections"))
                 if ack.get("rejected") else ""))

        if travelled >= total_km:
            break
        time.sleep(args.interval)

    print("\nArrived. %d fixes accepted over %.1f km." % (sent, total_km))
    print("The geofence evaluation runs after the response, so give it a few "
          "seconds before checking for the gate and dock events.")


def main():
    p = argparse.ArgumentParser(
        description="Feed a CSV lane into a deployed Drishya as live telemetry.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Set DRISHYA_URL, DRISHYA_EMAIL and DRISHYA_PASSWORD to avoid "
               "repeating them.")
    p.add_argument("--base-url", default=os.environ.get("DRISHYA_URL", "http://localhost:8080"))
    p.add_argument("--email", default=os.environ.get("DRISHYA_EMAIL", "priya@anandauto.example"))
    p.add_argument("--password", default=os.environ.get("DRISHYA_PASSWORD", "drishya"))
    p.add_argument("--insecure", action="store_true",
                   help="Skip certificate verification. Only for a self-signed host.")

    sub = p.add_subparsers(dest="command", required=True)

    r = sub.add_parser("route", help="Export a shipment's route as a CSV to edit and feed.")
    r.add_argument("--shipment", required=True)
    r.add_argument("-o", "--out", default="lane.csv")

    f = sub.add_parser("feed", help="Walk a CSV lane, posting positions as it goes.")
    f.add_argument("--csv", required=True)
    g = f.add_mutually_exclusive_group(required=True)
    g.add_argument("--shipment", help="Reuse its active trip, or start one with --vehicle.")
    g.add_argument("--trip", help="Feed this trip id directly.")
    f.add_argument("--vehicle", help="Registration to start a trip on, if none is active.")
    f.add_argument("--driver", help="Optional driver id for a new trip.")
    f.add_argument("--speed-kmph", type=float, default=DEFAULT_SPEED_KMPH)
    f.add_argument("--time-scale", type=float, default=DEFAULT_TIME_SCALE,
                   help="Simulated seconds per real second. 60 = a minute a second.")
    f.add_argument("--interval", type=float, default=5.0,
                   help="Real seconds between batches.")
    f.add_argument("--from-km", type=float, default=0.0,
                   help="Resume this far along the lane.")

    args = p.parse_args()
    api = Api(args.base_url, args.insecure)
    api.login(args.email, args.password)

    if args.command == "route":
        cmd_route(api, args)
    else:
        try:
            cmd_feed(api, args)
        except KeyboardInterrupt:
            print("\nStopped. Resume with --from-km <the km shown above>.")
            sys.exit(130)


if __name__ == "__main__":
    main()
