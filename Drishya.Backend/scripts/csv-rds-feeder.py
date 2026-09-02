#!/usr/bin/env python3
"""
Write a CSV lane straight into the RDS positions table, from a laptop, as SQL.

    pip install psycopg2-binary

    # terminal 1 -- the tunnel (see aws/rds-logs.sh for the exact command)
    aws ssm start-session --target i-... \
      --document-name AWS-StartPortForwardingSessionToRemoteHost \
      --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5432"]}'

    # terminal 2 -- the feed
    export PGPASSWORD=...            # from .aws-secrets.env
    python csv-rds-feeder.py --shipment SHP-1042 --csv lane.csv

WHAT THIS IS FOR, AND WHAT IT IS NOT FOR
-----------------------------------------
This is the "prove rows are landing in RDS" path. It opens a Postgres
connection and INSERTs, so every write appears in the RDS log, in
pg_stat_activity, and in a SELECT count(*). That is the whole point of it.

It is NOT the path that makes the screen work. An INSERT into positions is not
what the application does when a fix arrives -- PositionIngestService also
evaluates the geofences, raises GATE_IN and DOCK_IN, and asks the ETA engine to
re-predict. None of that happens here. The marker will move and every other
number on the page will sit exactly where it was.

That is a deliberate split, not an oversight. csv-telemetry-feeder.py posts the
same lane to POST /api/v1/trips/{id}/positions and produces a coherent screen.
Use this one to demonstrate the database; use that one to demonstrate the
product. Running both against the same trip at once will interleave two
vehicles into one trace, so pick one.

WHY THE CONNECTION IS TO localhost
-----------------------------------
RDS is not publicly reachable -- PubliclyAccessible is false and the database
security group admits one source, the API instance's security group, referenced
as a group rather than a CIDR. The SSM port-forward above makes the instance a
network pipe and nothing more: no code runs there, and this script speaks
Postgres wire protocol directly to RDS. Closing that terminal closes the hole.

Making RDS publicly accessible instead would also work and needs no tunnel, but
it leaves a database listening on the internet for the life of the demo, and a
home IP allow-list rots the first time the ISP rotates the address.
"""

import argparse
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lane_geometry import LaneError, cumulative, read_csv, walk  # noqa: E402

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    raise SystemExit(
        "psycopg2 is not installed. This is the one script in the repository "
        "that needs it:\n\n    pip install psycopg2-binary\n")

DEFAULT_SPEED_KMPH = 52.0
DEFAULT_TIME_SCALE = 60.0
FIX_INTERVAL_SIMULATED_S = 30.0

# UPPERCASE, unlike the JSON wire value.
#
# PositionSource carries @JsonValue("simulated") for the API, but Hibernate
# persists the enum by NAME and the table has
#   CHECK (source IN ('SIMULATED', 'BROWSER'))
# so 'simulated' from a hand-written INSERT is rejected by the constraint. The
# wire vocabulary and the storage vocabulary are not the same vocabulary, and
# this is the one place in the system where a script has to know both.
DB_SOURCE = "SIMULATED"


def connect(args):
    try:
        return psycopg2.connect(
            host=args.host, port=args.port, dbname=args.dbname,
            user=args.user, password=args.password, connect_timeout=10)
    except psycopg2.OperationalError as e:
        raise SystemExit(
            "Could not connect to %s:%s -- %s\n\n"
            "If this timed out rather than being refused, the SSM tunnel is not "
            "up. RDS does not accept connections from anywhere but the API "
            "instance's security group, so without the port-forward there is "
            "nothing listening on localhost:%s to talk to."
            % (args.host, args.port, str(e).strip(), args.port))


def resolve_trip(conn, args):
    """Reuse an active trip on the shipment, or create one."""
    with conn.cursor() as cur:
        if args.trip:
            cur.execute("SELECT id, shipment_id FROM trips WHERE id = %s", (args.trip,))
            row = cur.fetchone()
            if not row:
                raise SystemExit("No trip %s in the database." % args.trip)
            return row[0]

        cur.execute(
            "SELECT id, status FROM trips "
            "WHERE shipment_id = %s AND status IN ('PLANNED', 'ACTIVE') "
            "ORDER BY started_at DESC NULLS LAST LIMIT 1",
            (args.shipment,))
        row = cur.fetchone()
        if row:
            print("Reusing trip %s (%s)" % (row[0], row[1]))
            return row[0]

        # tenant_id is NOT NULL and is the whole basis of isolation in this
        # schema, so it is derived rather than invented -- a trip stamped with
        # the wrong tenant is invisible to its own vendor and visible to
        # somebody else.
        #
        # It comes from shipments.vendor_id. There is no tenant_id column on
        # shipments: a vendor IS a tenant here, which TripService states as
        # trip.setTenant(shipment.getVendor()) and enforces on read as
        # s.getVendor().getId().equals(tenantId). Nor is there a lane_id on
        # shipments -- the lane lives on the trip and is left null, as
        # TripService leaves it when the shipment carries no lane.
        cur.execute("SELECT vendor_id FROM shipments WHERE id = %s",
                    (args.shipment,))
        row = cur.fetchone()
        if not row:
            raise SystemExit(
                "No shipment %s. Check the id from the browser URL -- and note "
                "that the seeder rebuilds this database on every container "
                "boot, so an id from before a redeploy will not exist."
                % args.shipment)
        tenant_id = row[0]
        if not tenant_id:
            raise SystemExit(
                "Shipment %s has no vendor, so there is no tenant to stamp the "
                "trip with." % args.shipment)

        if not args.vehicle:
            raise SystemExit(
                "No active trip on %s, and no --vehicle given to start one.\n"
                "Pass --vehicle MH12AB1234." % args.shipment)

        trip_id = "trip-" + uuid.uuid4().hex[:8]
        cur.execute(
            "INSERT INTO trips (id, shipment_id, tenant_id, "
            "vehicle_registration, driver_id, status, started_at) "
            "VALUES (%s, %s, %s, %s, %s, 'ACTIVE', now())",
            (trip_id, args.shipment, tenant_id, args.vehicle, args.driver))
        conn.commit()
        print("Created trip %s on %s (tenant %s)" % (trip_id, args.vehicle, tenant_id))
        return trip_id


def main():
    p = argparse.ArgumentParser(
        description="Feed a CSV lane into RDS as direct INSERTs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Reads PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD when the "
               "matching flag is not given.")
    p.add_argument("--host", default=os.environ.get("PGHOST", "localhost"))
    p.add_argument("--port", type=int, default=int(os.environ.get("PGPORT", 5432)))
    p.add_argument("--dbname", default=os.environ.get("PGDATABASE", "drishya"))
    p.add_argument("--user", default=os.environ.get("PGUSER", "drishya"))
    p.add_argument("--password", default=os.environ.get("PGPASSWORD"))
    p.add_argument("--csv", required=True)

    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--shipment")
    g.add_argument("--trip")
    p.add_argument("--vehicle", help="Registration, if a trip must be created.")
    p.add_argument("--driver")

    p.add_argument("--speed-kmph", type=float, default=DEFAULT_SPEED_KMPH)
    p.add_argument("--time-scale", type=float, default=DEFAULT_TIME_SCALE)
    p.add_argument("--interval", type=float, default=5.0)
    p.add_argument("--from-km", type=float, default=0.0)
    args = p.parse_args()

    if not args.password:
        raise SystemExit(
            "No password. Set PGPASSWORD or pass --password.\n"
            "It is the DbPassword line in .aws-secrets.env -- which is "
            "gitignored, and must stay that way.")

    try:
        points = read_csv(args.csv)
    except LaneError as e:
        raise SystemExit(str(e))
    cum = cumulative(points)
    total_km = cum[-1]

    conn = connect(args)
    with conn.cursor() as cur:
        cur.execute("SELECT current_database(), inet_server_addr(), version()")
        db, addr, ver = cur.fetchone()
        print("Connected to %s at %s" % (db, addr or "localhost via tunnel"))
        print("  %s" % ver.split(",")[0])

    trip_id = resolve_trip(conn, args)

    km_per_tick = args.speed_kmph * args.time_scale * (args.interval / 3600.0)
    fixes_per_tick = max(1, int(round(
        args.interval * args.time_scale / FIX_INTERVAL_SIMULATED_S)))

    eta_min = (total_km / args.speed_kmph) * 60.0 / args.time_scale
    print("%.1f km over %d waypoints -> about %.1f real minutes at %gx"
          % (total_km, len(points), eta_min, args.time_scale))
    print("INSERTing %d rows every %gs into positions for %s\n"
          % (fixes_per_tick, args.interval, trip_id))

    sent = 0
    try:
        for batch in walk(points, cum, args.from_km, km_per_tick, fixes_per_tick):
            rows = []
            now = time.time()
            for i, (lat, lon, heading, travelled) in enumerate(batch):
                # Stamped backwards across the interval so the batch reads like
                # a buffer emptied on reconnect, not a burst at one instant.
                offset = (len(batch) - 1 - i) * (args.interval / len(batch))
                rows.append((trip_id, lon, lat, heading, args.speed_kmph,
                             now - offset, DB_SOURCE))

            with conn.cursor() as cur:
                # ST_MakePoint takes LONGITUDE FIRST. Reversing it is silent --
                # the geography type accepts it, the insert succeeds, and the
                # vehicle appears off the coast of Somalia.
                psycopg2.extras.execute_batch(cur, """
                    INSERT INTO positions
                        (trip_id, location, heading_deg, speed_kmph,
                         device_timestamp, received_at, source)
                    VALUES (%s,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                            %s, %s, to_timestamp(%s), now(), %s)
                """, rows)
            conn.commit()

            sent += len(rows)
            lat, lon, _, travelled = batch[-1]
            print("  %5.1f%%  %8.1f/%.1f km  %.4f,%.4f  +%d rows (%d total)"
                  % (100.0 * travelled / total_km, travelled, total_km,
                     lat, lon, len(rows), sent))

            if travelled >= total_km:
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        conn.commit()
        print("\nStopped after %d rows. Resume with --from-km <the km above>." % sent)
        conn.close()
        sys.exit(130)

    with conn.cursor() as cur:
        cur.execute("SELECT count(*), min(received_at), max(received_at) "
                    "FROM positions WHERE trip_id = %s", (trip_id,))
        count, first, last = cur.fetchone()
    conn.close()

    print("\nArrived. %d rows inserted this run; %d on trip %s, spanning %s to %s."
          % (sent, count, trip_id, first, last))
    print("No geofence, event or ETA work ran -- this wrote rows and nothing "
          "else. Use csv-telemetry-feeder.py for a coherent screen.")


if __name__ == "__main__":
    main()
