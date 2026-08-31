-- Server-side vehicle simulation, so a trip keeps moving with no browser open.
--
-- WHY THIS IS A TABLE AND NOT A FIELD ON trips
-- A simulation is not a property of a trip: most trips will never have one, a
-- trip driven by simulator/simulate.py or by a real device must have none, and
-- the columns here (speed, time scale, how far along the polyline we are) are
-- meaningless for those. Hanging them off trips would put five always-null
-- columns on the hottest table in the system and invite the reading that a
-- trip without them is somehow incomplete.
--
-- WHY THE PROGRESS IS PERSISTED RATHER THAN HELD IN MEMORY
-- The same reason trips.last_zone is: the process may restart. Render's free
-- tier spins a service down after fifteen idle minutes, and an in-memory ticker
-- would lose every running vehicle on the way down and silently never resume
-- them. Progress in the database means a wake picks up where it left off, and
-- means the ticker is not the owner of state it cannot survive.
--
-- travelled_km rather than a 0..1 fraction: the tick advances by distance at a
-- speed, and storing the fraction would mean multiplying and dividing by the
-- route length on every tick to get back to the quantity the physics is
-- actually in. The fraction is derived at read time instead.
CREATE TABLE trip_simulations (
    trip_id character varying(255) NOT NULL,

    -- Denormalised from the trip for exactly the reason trips.tenant_id is
    -- denormalised from the shipment: the tick and every scoped read filter on
    -- it, and a join away is one refactor away from being forgotten.
    tenant_id character varying(255) NOT NULL,

    status character varying(255) NOT NULL,

    -- How far along the shipment's own route polyline the vehicle has driven.
    travelled_km double precision NOT NULL,
    route_km double precision NOT NULL,

    speed_kmph double precision NOT NULL,

    -- Simulated seconds per real second. 1.0 drives the lane in real time;
    -- the UI default compresses it so a 130 km lane is watchable in a meeting.
    time_scale double precision NOT NULL,

    started_at timestamp(6) with time zone NOT NULL,

    -- The tick advances by the real time elapsed since this, not by a fixed
    -- step. A missed tick — GC pause, a spin-down, a slow query — then costs
    -- the vehicle nothing: it covers the ground it should have covered rather
    -- than falling permanently behind the clock.
    last_tick_at timestamp(6) with time zone NOT NULL,

    ended_at timestamp(6) with time zone,

    CONSTRAINT trip_simulations_status_check
        CHECK (status IN ('RUNNING', 'ARRIVED', 'STOPPED'))
);

-- The trip id is the primary key, which is what makes "one simulation per
-- trip" a database guarantee rather than a check the service remembers to do.
-- Two clicks on Start trip cannot produce two vehicles on one polyline.
ALTER TABLE trip_simulations ADD CONSTRAINT trip_simulations_pkey PRIMARY KEY (trip_id);

ALTER TABLE trip_simulations ADD CONSTRAINT fk_trip_simulations_trip_id
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE trip_simulations ADD CONSTRAINT fk_trip_simulations_tenant_id
    FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- The tick reads only the running ones, every few seconds, forever. This is the
-- one query that must not become a sequential scan of every simulation ever run.
CREATE INDEX idx_trip_sim_status ON trip_simulations (status);

COMMENT ON TABLE trip_simulations IS
    'Server-side vehicle simulation driving a trip along its shipment route. '
    'Every position it produces is labelled SIMULATED, like simulate.py.';
