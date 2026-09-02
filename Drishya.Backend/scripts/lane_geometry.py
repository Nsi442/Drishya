"""
Reading a lane CSV and walking it.

Shared by csv-telemetry-feeder.py (which posts to the API) and
csv-rds-feeder.py (which writes to the database directly). Two copies of an
interpolation that could disagree is precisely the drift this project has been
bitten by before -- the seeder and the ETA engine each estimating arrival
independently, and disagreeing by nine hours on the 840 km lane. One
implementation, imported twice.

Haversine in a client script is fine; the rule against it applies to the
backend, where PostGIS is already in the query path and a second implementation
could disagree with it. Nothing computed here is stored or compared against a
PostGIS result -- it only decides where to place the next fix.
"""

import csv
import math

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
