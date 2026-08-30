-- Run this ONCE against a fresh Neon database, before the first deploy.
--
--   psql "postgresql://USER:PASSWORD@HOST/DB?sslmode=require" -f db/neon-setup.sql
--
-- or paste it into the SQL Editor in the Neon console.
--
-- WHY THIS EXISTS
-- PostGIS ships with Neon but is not enabled in a new database. Flyway's V1
-- migration runs CREATE EXTENSION IF NOT EXISTS postgis, which succeeds if the
-- application's role is allowed to create extensions and fails the whole
-- migration if it is not. Doing it here first means V1 becomes a no-op either
-- way, and the same migration set runs unchanged locally and on Neon.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Confirm before deploying. If this returns no rows, nothing else will work:
-- every geofence check and every lane calculation in this system is a PostGIS
-- query, and the schema will not even parse without the geography type.
SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis';

-- Sanity check that the geography type and a real distance calculation work.
-- Expect roughly 25 km — Pune to Talegaon on the seeded lane.
SELECT round(
    ST_Distance(
        ST_SetSRID(ST_MakePoint(73.8567, 18.5204), 4326)::geography,
        ST_SetSRID(ST_MakePoint(73.6750, 18.7350), 4326)::geography
    )::numeric / 1000, 1) AS pune_to_talegaon_km;

-- NOTE ON POSTGRES VERSION
-- Create the Neon project on PostgreSQL 16 to match docker-compose.yml. Neon
-- offers newer majors, and a query that behaves on 17 locally and differently
-- on 16 in production is exactly the fault that surfaces the morning of a
-- review. Keep the two in step, whichever version you pick.

-- NOTE ON CONNECTION STRINGS
-- Neon gives you two. Use the DIRECT one for this application, not the pooled
-- one: the pooler is PgBouncer in transaction mode, which breaks the
-- server-side prepared statements Hibernate uses. A long-lived JVM holding a
-- five-connection Hikari pool does not need an external pooler.
--
-- The JDBC form Spring wants is not what the console shows. Convert:
--   console   postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/drishya?sslmode=require
--   JDBC url  jdbc:postgresql://ep-xxx.ap-southeast-1.aws.neon.tech/drishya?sslmode=require
--   username  user
--   password  pass
-- The credentials go in Render's environment, never in the URL and never here.
