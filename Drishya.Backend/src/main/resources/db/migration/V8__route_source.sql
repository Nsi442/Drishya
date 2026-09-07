-- Where a consignment's route came from.
--
-- Since RoutePlanner landed, `route` and `distance_km` mean one of two quite
-- different things. Either OSRM answered and they describe the road a lorry
-- drives, or it did not and they describe a curve drawn between two points. A
-- 128 km straight line and a 153 km road sat in the same column with nothing to
-- tell them apart, which is the same fault `positions.source` exists to prevent:
-- a generated figure that reads as an observed one.
--
-- The default is SYNTHETIC rather than NULL, and it is deliberate. Every row
-- that exists when this migration runs was built by GeoUtil.buildRoute, so
-- SYNTHETIC is not a placeholder for "unknown" — it is the truth about all of
-- them. Backfilling with NULL would have made the honest answer indistinguishable
-- from the absent one.
ALTER TABLE shipments
    ADD COLUMN route_source character varying(16) NOT NULL DEFAULT 'SYNTHETIC';

-- Stored as the enum's NAME, matching how Hibernate persists every other enum
-- in this schema and how positions.source is constrained. The wire value the
-- browser sees is lower case and comes from @JsonValue, not from here.
ALTER TABLE shipments
    ADD CONSTRAINT shipments_route_source_check
    CHECK (route_source::text = ANY (ARRAY['ROAD'::character varying,
                                           'SYNTHETIC'::character varying]::text[]));

COMMENT ON COLUMN shipments.route_source IS
    'ROAD when the route and distance came from the routing service, SYNTHETIC '
    'when they were drawn by GeoUtil.buildRoute. Both fill the same columns, so '
    'without this a drawn distance is indistinguishable from a measured one.';

-- Finding the ones still to be re-routed is the only query this column is asked
-- in bulk, and it is answered from the index rather than by reading the table:
-- once most rows are ROAD, the partial index holds only the remainder.
CREATE INDEX idx_shipments_route_source_synthetic
    ON shipments (route_source)
    WHERE route_source = 'SYNTHETIC';
