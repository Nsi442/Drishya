-- GiST indexes on every geography column.
--
-- Hibernate's schema generation does not create these — it has no idea a
-- geography column wants a different index type than a varchar — so they are
-- declared here and only here.
--
-- Without them ST_DWithin degrades to a sequential scan. That is invisible on
-- four fulfilment centres and fatal on a positions table, because the geofence
-- check runs once per ingested point: at one fix every ten seconds per vehicle,
-- a demo with twenty vehicles is already scanning the whole table 120 times a
-- minute.

-- The geofence check joins against this: for each incoming position, which
-- site is it within geofence_radius_m of.
CREATE INDEX idx_fc_dock_location_gist
    ON fulfilment_centres USING GIST (dock_location);

-- Used when placing a shipment's origin onto a known lane.
CREATE INDEX idx_lane_origin_point_gist
    ON lanes USING GIST (origin_point);

-- Used to find which segment a vehicle is currently on, which is what makes
-- the remaining-distance half of the ETA computable.
CREATE INDEX idx_lane_segment_geometry_gist
    ON lane_segments USING GIST (geometry);

-- The big one. Every ingested position is tested against the geofences.
CREATE INDEX idx_position_location_gist
    ON positions USING GIST (location);

-- Ingest is append-only and always in roughly ascending received order, which
-- is the access pattern BRIN is built for: a fraction of the size of a btree
-- for the "what arrived recently" scans the aggregation job runs nightly.
-- The per-trip replay path keeps its btree (idx_position_trip_time) — BRIN is
-- no use for that, since one trip's rows are scattered across the table.
CREATE INDEX idx_position_received_brin
    ON positions USING BRIN (received_at);
