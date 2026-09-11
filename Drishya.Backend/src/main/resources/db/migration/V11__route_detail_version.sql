-- How detailed the stored route is, so a coarser one can be found and redone.
--
-- WHY A VERSION AND NOT A MEASUREMENT. The routes already on the site are all
-- routeSource = ROAD, so the backfill — which looks for SYNTHETIC — would never
-- touch them, and improving how routes are FETCHED would have changed nothing
-- that was already booked. Something has to say "this one was built by the old,
-- coarser request".
--
-- The tempting alternative is to infer it: too few points for the distance,
-- or too long a gap between consecutive ones. That is a guess whose threshold
-- has to stay provably below whatever the new request produces, or the job
-- re-routes the same rows forever against somebody else's free server. A
-- version terminates exactly once per row, by construction.
--
-- 1 is "fetched with OSRM overview=simplified and thinned by even stride":
-- measured on the deployed site, a 1,242 km journey stored as 23 points with
-- a single 255 km straight in it.
ALTER TABLE shipments
    ADD COLUMN route_version integer NOT NULL DEFAULT 1;

-- A drawn curve has no detail to be stale about; it is found by routeSource.
-- Marking it current keeps it out of the version-based half of the query.
UPDATE shipments SET route_version = 2 WHERE route_source = 'SYNTHETIC';
