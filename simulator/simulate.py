#!/usr/bin/env python3
"""
Drishya vehicle simulator.

Walks a GeoJSON route, posting position batches to the API as it goes.

Hardware is out of scope for this project: there is no device, no firmware and
no MQTT. This script is the only thing that ever produces SIMULATED fixes, and
every point it sends is labelled as such all the way through the database and
back out of the API. That labelling is not bookkeeping — the evidence pack is a
chargeback dispute artefact, and a trace generated here must never be capable of
being presented as something a driver's phone reported from the cab.

Usage
-----
    # one vehicle, real time
    python simulate.py --shipment SHP-24025

    # a six-hour run replayed in three minutes, four vehicles on the lane
    python simulate.py --shipment SHP-24025 --vehicles 4 --time-scale 120

    # against a deployed API
    python simulate.py --shipment SHP-24025 --api-url https://api.example.com

Realism, and why it is not optional
-----------------------------------
A vehicle that travels at exactly the posted speed and never stops proves
nothing: the ETA engine looks accurate because there is nothing to be wrong
about, and the dead-zone handling is never exercised. So a run injects

  * speed variance around the segment mean,
  * one traffic stall,
  * one network dead zone, where fixes are still *taken* but not *sent* until
    coverage returns and the whole buffer goes up at once.

That last one is the interesting case. It is why positions carry a device
timestamp separate from the server receive time, and running it is the only way
to find out whether the rest of the system actually honours the difference.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("This needs the requests library:  pip install requests")


DEFAULT_API = "http://localhost:8080"
EARTH_RADIUS_M = 6_371_000


# --------------------------------------------------------------------------- #
# geometry
# --------------------------------------------------------------------------- #

def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Metres between two (lat, lon) pairs."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def interpolate(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    """A point t of the way from a to b. Linear is fine over a few kilometres."""
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def bearing_deg(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlon = math.radians(b[1] - a[1])
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def load_route(path: Path) -> list[tuple[float, float]]:
    """
    Reads a GeoJSON LineString into (lat, lon) pairs.

    GeoJSON stores coordinates as [lon, lat] — the opposite of how they are
    written everywhere else — so this is the one place the swap happens.
    """
    data = json.loads(path.read_text(encoding="utf-8"))

    if data.get("type") == "FeatureCollection":
        geometry = data["features"][0]["geometry"]
    elif data.get("type") == "Feature":
        geometry = data["geometry"]
    else:
        geometry = data

    if geometry["type"] != "LineString":
        sys.exit(f"{path}: expected a LineString, found {geometry['type']}")

    return [(lat, lon) for lon, lat in geometry["coordinates"]]


# --------------------------------------------------------------------------- #
# the run
# --------------------------------------------------------------------------- #

@dataclass
class Options:
    api_url: str
    token: str
    shipment_id: str
    route: list[tuple[float, float]]
    speed_kmph: float
    time_scale: float
    interval_s: float
    batch_size: int
    stall: bool
    dead_zone: bool
    verbose: bool


@dataclass
class Vehicle:
    """One simulated truck, running on its own thread."""

    index: int
    registration: str
    options: Options
    trip_id: str = ""
    session: requests.Session = field(default_factory=requests.Session)

    # --- api -------------------------------------------------------------- #

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.options.token}",
            "Content-Type": "application/json",
        }

    def start_trip(self) -> bool:
        url = f"{self.options.api_url}/api/v1/trips/from-shipment/{self.options.shipment_id}"
        try:
            r = self.session.post(url, headers=self._headers(),
                                  json={"vehicleRegistration": self.registration}, timeout=30)
        except requests.RequestException as e:
            print(f"[{self.registration}] could not reach the API: {e}")
            return False

        if r.status_code >= 400:
            print(f"[{self.registration}] could not start a trip: {r.status_code} {r.text[:200]}")
            return False

        self.trip_id = r.json()["trip"]["tripId"]
        lane = r.json()["trip"].get("laneCode") or "(no lane matched)"
        print(f"[{self.registration}] trip {self.trip_id} started on lane {lane}")
        return True

    def post(self, batch: list[dict]) -> None:
        if not batch:
            return
        url = f"{self.options.api_url}/api/v1/trips/{self.trip_id}/positions"
        try:
            r = self.session.post(url, headers=self._headers(),
                                  json={"positions": batch}, timeout=30)
            if r.status_code == 202:
                body = r.json()
                if body.get("rejected"):
                    print(f"[{self.registration}] {body['rejected']} fixes rejected: "
                          f"{body.get('rejections')}")
                elif self.options.verbose:
                    print(f"[{self.registration}] {body['accepted']} fixes accepted")
            else:
                print(f"[{self.registration}] ingest returned {r.status_code}: {r.text[:200]}")
        except requests.RequestException as e:
            # Deliberately not retried. A dropped batch here is indistinguishable
            # from the dead zone below, and the system is supposed to cope with
            # both — silently retrying would hide whether it does.
            print(f"[{self.registration}] batch lost: {e}")

    def complete_trip(self) -> None:
        url = f"{self.options.api_url}/api/v1/trips/{self.trip_id}/complete"
        try:
            self.session.post(url, headers=self._headers(), timeout=30)
            print(f"[{self.registration}] trip complete")
        except requests.RequestException as e:
            print(f"[{self.registration}] could not close the trip: {e}")

    # --- the drive --------------------------------------------------------- #

    def run(self) -> None:
        if not self.start_trip():
            return

        opts = self.options
        route = opts.route
        rng = random.Random(1000 + self.index)

        total_m = sum(haversine_m(route[i], route[i + 1]) for i in range(len(route) - 1))

        # Where the two disruptions land, as a fraction of the journey. Kept
        # away from the ends so neither collides with departure or arrival.
        stall_at = rng.uniform(0.25, 0.45) if opts.stall else 2.0
        dead_from = rng.uniform(0.55, 0.70) if opts.dead_zone else 2.0
        dead_to = dead_from + 0.06

        buffer: list[dict] = []       # fixes taken but not yet sent
        pending: list[dict] = []      # fixes held back by the dead zone
        travelled = 0.0
        leg = 0
        leg_offset = 0.0
        stalled_done = False

        # Vehicles leave a few minutes apart rather than in convoy.
        stagger = self.index * 90 / max(opts.time_scale, 1)
        if stagger:
            time.sleep(stagger)

        while leg < len(route) - 1:
            a, b = route[leg], route[leg + 1]
            leg_m = haversine_m(a, b)
            fraction = travelled / total_m if total_m else 0

            # Speed for this tick: the configured mean, wobbled. Real traffic is
            # never steady, and a perfectly steady vehicle makes the ETA engine
            # look better than it is.
            speed = max(5.0, rng.gauss(opts.speed_kmph, opts.speed_kmph * 0.18))

            # One stall. Not a breakdown — a jam, which is the common case and
            # the one the segment history is supposed to have learned about.
            if opts.stall and not stalled_done and fraction >= stall_at:
                stalled_done = True
                stall_minutes = rng.randint(8, 20)
                print(f"[{self.registration}] stalled in traffic for {stall_minutes} min "
                      f"at {fraction:.0%} of the route")
                for _ in range(stall_minutes):
                    buffer.append(self._fix(interpolate(a, b, leg_offset / leg_m if leg_m else 0),
                                            0.0, bearing_deg(a, b)))
                    self._tick(60)
                self._flush(buffer, pending, fraction, dead_from, dead_to)

            step_m = speed * 1000 / 3600 * opts.interval_s
            leg_offset += step_m
            travelled += step_m

            while leg_offset >= leg_m and leg < len(route) - 1:
                leg_offset -= leg_m
                leg += 1
                if leg >= len(route) - 1:
                    break
                a, b = route[leg], route[leg + 1]
                leg_m = haversine_m(a, b)

            if leg >= len(route) - 1:
                break

            point = interpolate(a, b, min(1.0, leg_offset / leg_m if leg_m else 0))
            buffer.append(self._fix(point, speed, bearing_deg(a, b)))

            fraction = travelled / total_m if total_m else 0
            if len(buffer) >= opts.batch_size:
                self._flush(buffer, pending, fraction, dead_from, dead_to)

            self._tick(opts.interval_s)

        # Final approach: sit on the dock coordinate long enough for the
        # geofence to see a genuine transition rather than a single fly-by fix.
        for _ in range(3):
            buffer.append(self._fix(route[-1], 0.0, 0.0))
            self._tick(opts.interval_s)

        buffer.extend(pending)
        pending.clear()
        self._flush(buffer, pending, 1.0, 2.0, 2.0)
        self.complete_trip()

    # --- helpers ----------------------------------------------------------- #

    def _fix(self, point: tuple[float, float], speed: float, heading: float) -> dict:
        return {
            "lat": round(point[0], 6),
            "lon": round(point[1], 6),
            "speedKmph": round(speed, 1),
            "headingDeg": round(heading, 1),
            # Wall-clock, always. Even under --time-scale the fix claims the
            # moment it was taken: the server rejects clocks more than a few
            # minutes out, and more importantly a timeline is only readable if
            # its timestamps are real.
            "deviceTimestamp": int(time.time() * 1000),
            "source": "SIMULATED",
        }

    def _flush(self, buffer: list[dict], pending: list[dict],
               fraction: float, dead_from: float, dead_to: float) -> None:
        """
        Sends what is buffered — unless the vehicle is in the dead zone, in
        which case the fixes are held and go up in one burst when coverage
        returns. The fixes are still *taken* throughout; only delivery stops.
        """
        if dead_from <= fraction <= dead_to:
            if not pending:
                print(f"[{self.registration}] entered a network dead zone at {fraction:.0%}")
            pending.extend(buffer)
            buffer.clear()
            return

        if pending:
            print(f"[{self.registration}] back in coverage, sending {len(pending)} "
                  f"buffered fixes as one catch-up batch")
            buffer[:0] = pending
            pending.clear()

        self.post(list(buffer))
        buffer.clear()

    def _tick(self, seconds: float) -> None:
        """Sleeps the scaled equivalent of `seconds` of driving."""
        time.sleep(seconds / max(self.options.time_scale, 0.001))


# --------------------------------------------------------------------------- #
# entry point
# --------------------------------------------------------------------------- #

def authenticate(api_url: str, email: str, password: str, role: str) -> str:
    if email:
        r = requests.post(f"{api_url}/api/auth/login",
                          json={"email": email, "password": password}, timeout=30)
    else:
        r = requests.post(f"{api_url}/api/auth/demo-login", json={"role": role}, timeout=30)

    if r.status_code >= 400:
        sys.exit(f"Could not sign in: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


def main() -> None:
    here = Path(__file__).parent
    p = argparse.ArgumentParser(description="Drive simulated vehicles into a fulfilment centre.")
    p.add_argument("--api-url", default=DEFAULT_API,
                   help="API base URL. Point this at the deployed environment to "
                        "prove the hosted path works (default: %(default)s)")
    p.add_argument("--shipment", required=True, help="Shipment id to run a trip against")
    p.add_argument("--route", type=Path, default=here / "routes" / "pune_to_bhiwandi.geojson",
                   help="GeoJSON LineString to follow (default: %(default)s)")
    p.add_argument("--vehicles", type=int, default=1, help="Concurrent vehicles on the lane")
    p.add_argument("--speed", type=float, default=52.0, help="Mean speed in km/h")
    p.add_argument("--time-scale", type=float, default=1.0,
                   help="Replay multiplier. 120 turns a six-hour run into three minutes")
    p.add_argument("--interval", type=float, default=30.0,
                   help="Simulated seconds between fixes")
    p.add_argument("--batch-size", type=int, default=6, help="Fixes per request")
    p.add_argument("--no-stall", action="store_true", help="Skip the traffic stall")
    p.add_argument("--no-dead-zone", action="store_true", help="Skip the coverage gap")
    p.add_argument("--email", default="", help="Sign in as a specific user")
    p.add_argument("--password", default="drishya")
    p.add_argument("--role", default="vendor_admin", help="Demo role when no email is given")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args()

    if not args.route.exists():
        sys.exit(f"No such route file: {args.route}")

    route = load_route(args.route)
    token = authenticate(args.api_url, args.email, args.password, args.role)

    options = Options(
        api_url=args.api_url.rstrip("/"),
        token=token,
        shipment_id=args.shipment,
        route=route,
        speed_kmph=args.speed,
        time_scale=args.time_scale,
        interval_s=args.interval,
        batch_size=args.batch_size,
        stall=not args.no_stall,
        dead_zone=not args.no_dead_zone,
        verbose=args.verbose,
    )

    print(f"Route {args.route.name}: {len(route)} points, "
          f"{sum(haversine_m(route[i], route[i + 1]) for i in range(len(route) - 1)) / 1000:.1f} km")
    print(f"{args.vehicles} vehicle(s) at {args.speed:.0f} km/h, "
          f"time scale {args.time_scale:g}x")
    print("Every fix is labelled SIMULATED and is not evidence of anything.\n")

    threads = []
    for i in range(args.vehicles):
        vehicle = Vehicle(index=i, registration=f"MH-12-SIM-{4400 + i}", options=options)
        t = threading.Thread(target=vehicle.run, name=vehicle.registration, daemon=True)
        t.start()
        threads.append(t)

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        print("\nStopped. Trips left open will be closed by the scheduler.")


if __name__ == "__main__":
    main()
