-- Run this ONCE against a fresh RDS instance, before the first deploy.
--
--   psql "postgresql://drishya:PASSWORD@HOST:5432/drishya?sslmode=require" \
--        -f db/rds-setup.sql
--
-- The host is the DbEndpoint output of the CloudFormation stack. RDS is not
-- publicly reachable by design, so run this from the EC2 instance the stack
-- creates — it is the only thing the database's security group admits:
--
--   aws ssm start-session --target <InstanceId>
--   sudo dnf install -y postgresql16
--
-- WHY THIS EXISTS
-- V1__extensions.sql runs CREATE EXTENSION IF NOT EXISTS postgis, and names
-- this file. On RDS the PostGIS extension is available but not enabled in a new
-- database, and enabling it needs rds_superuser — which the master user has and
-- a least-privilege application role would not. Doing it here first means V1 is
-- a no-op either way, and the same migration set runs unchanged locally, on
-- Neon and on RDS.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Confirm before deploying. If this returns no rows, stop: every geofence check
-- and every lane calculation in this system is a PostGIS query, and the schema
-- will not even parse without the geography type.
SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis';

-- Sanity check that the geography type and a real distance calculation work.
-- Expect roughly 25 km — Pune to Talegaon on the seeded lane.
SELECT round(
    ST_Distance(
        ST_SetSRID(ST_MakePoint(73.8567, 18.5204), 4326)::geography,
        ST_SetSRID(ST_MakePoint(73.6750, 18.7350), 4326)::geography
    )::numeric / 1000, 1) AS pune_to_talegaon_km;

-- NOTE ON POSTGRES VERSION
-- The stack asks RDS for PostgreSQL 16 to match docker-compose.yml, and lets
-- RDS choose the minor. A query that behaves on 17 locally and differently on
-- 16 in production is exactly the fault that surfaces the morning of a review.
-- Keep the two majors in step, whichever you pick.

-- NOTE ON WHO THE APPLICATION CONNECTS AS
-- It connects as the master user this file is run by. That matches
-- docker-compose, where one role owns everything, and it keeps the deploy to
-- one credential.
--
-- A least-privilege application role is the better shape for anything real, and
-- is the reason V1 is written to tolerate the extension already existing. If you
-- add one, create it here — after the extension, because it cannot create the
-- extension itself:
--
--   CREATE ROLE drishya_app LOGIN PASSWORD '...';
--   GRANT ALL ON SCHEMA public TO drishya_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT ALL ON TABLES TO drishya_app;
--
-- then point SPRING_DATASOURCE_USERNAME at it. Flyway needs to create tables,
-- so it is not a read-only role.

-- NOTE ON CONNECTION STRINGS
-- The JDBC form Spring wants is not what the RDS console shows. Convert:
--   console   drishya.abc123.ap-south-1.rds.amazonaws.com:5432
--   JDBC url  jdbc:postgresql://drishya.abc123.ap-south-1.rds.amazonaws.com:5432/drishya
--
-- sslmode is not in the URL because the stack leaves RDS inside its own VPC and
-- nothing outside reaches it. Add ?sslmode=require if you ever make the
-- instance publicly accessible — and think hard before you do.
