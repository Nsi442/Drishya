-- Drishya core schema.
--
-- Generated once from the JPA entity model, then checked in as the authority.
-- From here on the entities follow the migrations, not the other way round:
-- Hibernate ddl-auto is off, and a mapping change unaccompanied by a migration
-- is a bug rather than a schema update.
--
-- Timestamps are `timestamp with time zone` throughout. A vehicle crossing a
-- state line at 23:50 and a review being run in a different zone are both
-- ordinary, and a naive timestamp makes both wrong in ways nobody notices until
-- the evidence pack is questioned.
--
-- Enum columns are varchar with a CHECK rather than a native Postgres enum:
-- adding a value to a native enum needs ALTER TYPE, which will not roll back
-- inside a transactional migration.

CREATE TABLE alerts (
    acknowledged boolean NOT NULL,
    is_read boolean,
    raised_at timestamp(6) with time zone,
    message character varying(1000),
    acknowledged_by character varying(255),
    fc_id character varying(255),
    id character varying(255) NOT NULL,
    severity character varying(255),
    shipment_id character varying(255),
    title character varying(255),
    type character varying(255),
    vendor_id character varying(255),
    CONSTRAINT alerts_severity_check CHECK (((severity)::text = ANY ((ARRAY['CRITICAL'::character varying, 'WARNING'::character varying, 'INFO'::character varying])::text[]))),
    CONSTRAINT alerts_type_check CHECK (((type)::text = ANY ((ARRAY['DELAY'::character varying, 'DOOR_OPEN'::character varying, 'TEMPERATURE'::character varying, 'SHOCK'::character varying, 'DOCUMENT'::character varying, 'DETENTION'::character varying, 'ROUTE_DEVIATION'::character varying, 'DEVICE_OFFLINE'::character varying, 'SLOT_CHANGE'::character varying, 'ARRIVAL'::character varying])::text[]))));

CREATE TABLE app_users (
    driver_id character varying(255),
    email character varying(255) NOT NULL,
    id character varying(255) NOT NULL,
    initials character varying(255),
    language character varying(255),
    name character varying(255),
    org_id character varying(255),
    org_name character varying(255),
    password_hash character varying(255) NOT NULL,
    phone character varying(255),
    role character varying(255),
    tenant_id character varying(255),
    title character varying(255),
    CONSTRAINT app_users_role_check CHECK (((role)::text = ANY ((ARRAY['VENDOR_ADMIN'::character varying, 'DISPATCHER'::character varying, 'DRIVER'::character varying, 'FC'::character varying])::text[]))));

CREATE TABLE appointments (
    cartons integer NOT NULL,
    decided_at timestamp(6) with time zone,
    end_at timestamp(6) with time zone,
    proposed_start timestamp(6) with time zone,
    requested_at timestamp(6) with time zone,
    start_at timestamp(6) with time zone,
    note character varying(1000),
    decided_by character varying(255),
    dock_id character varying(255),
    fc_id character varying(255),
    fc_name character varying(255),
    id character varying(255) NOT NULL,
    rejection_reason character varying(255),
    shipment_id character varying(255),
    status character varying(255),
    vehicle_reg character varying(255),
    vendor_id character varying(255),
    vendor_name character varying(255),
    CONSTRAINT appointments_status_check CHECK (((status)::text = ANY ((ARRAY['REQUESTED'::character varying, 'CONFIRMED'::character varying, 'REJECTED'::character varying, 'ALTERNATIVE'::character varying, 'COMPLETED'::character varying])::text[]))));

CREATE TABLE carriers (
    cost_per_trip integer NOT NULL,
    on_time_pct integer NOT NULL,
    trips_this_month integer NOT NULL,
    id character varying(255) NOT NULL,
    name character varying(255));

CREATE TABLE dock_turnaround_history (
    hour_bucket integer NOT NULL,
    mean_queue_minutes double precision NOT NULL,
    mean_turnaround_minutes double precision NOT NULL,
    sample_count integer NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    day_type character varying(255) NOT NULL,
    fc_id character varying(255) NOT NULL,
    id character varying(255) NOT NULL,
    CONSTRAINT dock_turnaround_history_day_type_check CHECK (((day_type)::text = ANY ((ARRAY['WEEKDAY'::character varying, 'WEEKEND'::character varying])::text[]))));

CREATE TABLE docks (
    active boolean NOT NULL,
    max_vehicle_length_ft integer NOT NULL,
    fc_id character varying(255) NOT NULL,
    id character varying(255) NOT NULL,
    name character varying(255),
    type character varying(255),
    CONSTRAINT docks_type_check CHECK (((type)::text = ANY ((ARRAY['STANDARD'::character varying, 'CONTAINER'::character varying])::text[]))));

CREATE TABLE drivers (
    available boolean NOT NULL,
    rating double precision NOT NULL,
    trips_completed integer NOT NULL,
    licence_expiry timestamp(6) with time zone,
    id character varying(255) NOT NULL,
    language character varying(255),
    name character varying(255),
    phone character varying(255),
    vehicle_id character varying(255));

CREATE TABLE eta_predictions (
    error_minutes double precision,
    predicted_queue_minutes double precision,
    remaining_distance_m double precision,
    actual_dock_in_at timestamp(6) with time zone,
    confidence_high_at timestamp(6) with time zone,
    confidence_low_at timestamp(6) with time zone,
    made_at timestamp(6) with time zone NOT NULL,
    predicted_dock_in_at timestamp(6) with time zone NOT NULL,
    id character varying(255) NOT NULL,
    model_version character varying(255) NOT NULL,
    trip_id character varying(255) NOT NULL);

CREATE TABLE fulfilment_centres (
    closing_hour integer NOT NULL,
    dock_count integer NOT NULL,
    geofence_radius_m integer NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    opening_hour integer NOT NULL,
    city character varying(255),
    id character varying(255) NOT NULL,
    name character varying(255),
    dock_location geography(Point,4326));

CREATE TABLE incidents (
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    photos integer NOT NULL,
    at timestamp(6) with time zone,
    description character varying(2000),
    id character varying(255) NOT NULL,
    location_source character varying(255),
    reported_by character varying(255),
    shipment_id character varying(255),
    status character varying(255),
    type character varying(255),
    CONSTRAINT incidents_type_check CHECK (((type)::text = ANY ((ARRAY['BREAKDOWN'::character varying, 'ACCIDENT'::character varying, 'ROUTE_BLOCK'::character varying, 'DETENTION'::character varying, 'OTHER'::character varying])::text[]))));

CREATE TABLE lane_segments (
    default_speed_kmph double precision NOT NULL,
    length_m double precision NOT NULL,
    seq integer NOT NULL,
    id character varying(255) NOT NULL,
    lane_id character varying(255) NOT NULL,
    name character varying(255),
    geometry geography(LineString,4326) NOT NULL);

CREATE TABLE lanes (
    distance_km double precision,
    code character varying(255),
    fc_id character varying(255) NOT NULL,
    id character varying(255) NOT NULL,
    origin_name character varying(255),
    origin_point geography(Point,4326));

CREATE TABLE positions (
    heading_deg double precision,
    speed_kmph double precision,
    device_timestamp timestamp(6) with time zone NOT NULL,
    id bigint NOT NULL,
    received_at timestamp(6) with time zone NOT NULL,
    source character varying(255) NOT NULL,
    trip_id character varying(255) NOT NULL,
    location geography(Point,4326) NOT NULL,
    CONSTRAINT positions_source_check CHECK (((source)::text = ANY ((ARRAY['SIMULATED'::character varying, 'BROWSER'::character varying])::text[]))));

CREATE TABLE receiving_exceptions (
    impact_min integer NOT NULL,
    raised_at timestamp(6) with time zone,
    resolved_at timestamp(6) with time zone,
    detail character varying(1000),
    resolution_note character varying(1000),
    fc_id character varying(255),
    fc_name character varying(255),
    id character varying(255) NOT NULL,
    owner character varying(255),
    severity character varying(255),
    shipment_id character varying(255),
    status character varying(255),
    title character varying(255),
    type character varying(255),
    vendor_id character varying(255),
    vendor_name character varying(255),
    CONSTRAINT receiving_exceptions_severity_check CHECK (((severity)::text = ANY ((ARRAY['CRITICAL'::character varying, 'WARNING'::character varying, 'INFO'::character varying])::text[]))),
    CONSTRAINT receiving_exceptions_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'INVESTIGATING'::character varying, 'RESOLVED'::character varying])::text[]))),
    CONSTRAINT receiving_exceptions_type_check CHECK (((type)::text = ANY ((ARRAY['LATE_ARRIVAL'::character varying, 'DOCUMENT_MISMATCH'::character varying, 'TEMPERATURE_BREACH'::character varying, 'QUANTITY_SHORTAGE'::character varying, 'UNSCHEDULED_ARRIVAL'::character varying, 'DAMAGE'::character varying])::text[]))));

CREATE TABLE segment_speed_history (
    hour_bucket integer NOT NULL,
    mean_speed_kmph double precision NOT NULL,
    sample_count integer NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    day_type character varying(255) NOT NULL,
    id character varying(255) NOT NULL,
    segment_id character varying(255) NOT NULL,
    CONSTRAINT segment_speed_history_day_type_check CHECK (((day_type)::text = ANY ((ARRAY['WEEKDAY'::character varying, 'WEEKEND'::character varying])::text[]))));

CREATE TABLE sensor_readings (
    duration_min integer,
    reading_value double precision NOT NULL,
    scheduled boolean,
    id bigint NOT NULL,
    recorded_at timestamp(6) with time zone,
    kind character varying(255),
    shipment_id character varying(255) NOT NULL,
    CONSTRAINT sensor_readings_kind_check CHECK (((kind)::text = ANY ((ARRAY['TEMPERATURE'::character varying, 'HUMIDITY'::character varying, 'SHOCK'::character varying, 'DOOR'::character varying])::text[]))));

CREATE TABLE shipment_documents (
    pages integer NOT NULL,
    size_kb integer NOT NULL,
    expires_at timestamp(6) with time zone,
    uploaded_at timestamp(6) with time zone,
    id character varying(255) NOT NULL,
    note character varying(255),
    number character varying(255),
    shipment_id character varying(255) NOT NULL,
    status character varying(255),
    type character varying(255),
    CONSTRAINT shipment_documents_status_check CHECK (((status)::text = ANY ((ARRAY['VALID'::character varying, 'EXPIRING'::character varying, 'MISMATCH'::character varying, 'MISSING'::character varying, 'PENDING'::character varying])::text[]))),
    CONSTRAINT shipment_documents_type_check CHECK (((type)::text = ANY ((ARRAY['EWAY'::character varying, 'INVOICE'::character varying, 'GST'::character varying, 'LR'::character varying, 'ASN'::character varying, 'POD'::character varying])::text[]))));

CREATE TABLE shipment_events (
    at timestamp(6) with time zone,
    id bigint NOT NULL,
    detail character varying(255),
    label character varying(255),
    shipment_id character varying(255) NOT NULL,
    stage character varying(255),
    CONSTRAINT shipment_events_stage_check CHECK (((stage)::text = ANY ((ARRAY['CREATED'::character varying, 'DOCS_PENDING'::character varying, 'IN_TRANSIT'::character varying, 'AT_GATE'::character varying, 'AT_DOCK'::character varying, 'DELIVERED'::character varying, 'EXCEPTION'::character varying, 'CANCELLED'::character varying])::text[]))));

CREATE TABLE shipment_route (
    lat double precision NOT NULL,
    leg_index integer NOT NULL,
    lng double precision NOT NULL,
    shipment_id character varying(255) NOT NULL,
    CONSTRAINT shipment_route_leg_index_check CHECK ((leg_index >= 0)));

CREATE TABLE shipments (
    cartons integer NOT NULL,
    delay_min integer NOT NULL,
    dest_lat double precision,
    dest_lng double precision,
    distance_km integer NOT NULL,
    grn_damaged_cartons integer,
    grn_expected_cartons integer,
    grn_received_cartons integer,
    origin_lat double precision,
    origin_lng double precision,
    pod_cartons_received integer,
    pod_photos integer,
    pos_lat double precision,
    pos_lng double precision,
    progress double precision NOT NULL,
    remaining_km integer NOT NULL,
    speed_kmph integer NOT NULL,
    temperature_controlled boolean NOT NULL,
    weight_kg integer NOT NULL,
    booked_at timestamp(6) with time zone,
    delivered_at timestamp(6) with time zone,
    gate_in_at timestamp(6) with time zone,
    gate_out_at timestamp(6) with time zone,
    grn_checked_at timestamp(6) with time zone,
    pickup_at timestamp(6) with time zone,
    pod_received_at timestamp(6) with time zone,
    pod_signature_at timestamp(6) with time zone,
    predicted_at timestamp(6) with time zone,
    promised_at timestamp(6) with time zone,
    slot_end timestamp(6) with time zone,
    slot_start timestamp(6) with time zone,
    updated_at timestamp(6) with time zone,
    value_inr bigint NOT NULL,
    grn_note character varying(1000),
    pod_damage_note character varying(1000),
    cancelled_reason character varying(255),
    commodity character varying(255),
    delay_reason character varying(255),
    dest_name character varying(255),
    dock_id character varying(255),
    driver_id character varying(255),
    eway_bill_no character varying(255),
    fc_id character varying(255) NOT NULL,
    grn_checked_by character varying(255),
    grn_decision character varying(255),
    grn_documents_verified character varying(255),
    id character varying(255) NOT NULL,
    invoice_no character varying(255),
    origin_name character varying(255),
    pod_receiver_name character varying(255),
    priority character varying(255),
    reference character varying(255),
    seal_number character varying(255),
    status character varying(255),
    vehicle_id character varying(255),
    vendor_id character varying(255) NOT NULL,
    pod_signature oid,
    CONSTRAINT shipments_grn_decision_check CHECK (((grn_decision)::text = ANY ((ARRAY['ACCEPTED'::character varying, 'PARTIAL'::character varying, 'REJECTED'::character varying, 'PENDING'::character varying])::text[]))),
    CONSTRAINT shipments_priority_check CHECK (((priority)::text = ANY ((ARRAY['NORMAL'::character varying, 'HIGH'::character varying])::text[]))),
    CONSTRAINT shipments_status_check CHECK (((status)::text = ANY ((ARRAY['CREATED'::character varying, 'DOCS_PENDING'::character varying, 'IN_TRANSIT'::character varying, 'AT_GATE'::character varying, 'AT_DOCK'::character varying, 'DELIVERED'::character varying, 'EXCEPTION'::character varying, 'CANCELLED'::character varying])::text[]))));

CREATE TABLE tenants (
    avg_detention_min integer NOT NULL,
    doc_accuracy_pct integer NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    on_time_pct integer NOT NULL,
    rejection_rate_pct integer NOT NULL,
    created_at timestamp(6) with time zone,
    city character varying(255),
    contact character varying(255),
    id character varying(255) NOT NULL,
    name character varying(255),
    slug character varying(255),
    status character varying(255));

CREATE TABLE trip_events (
    at timestamp(6) with time zone NOT NULL,
    id bigint NOT NULL,
    label character varying(255),
    trip_id character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    payload jsonb,
    CONSTRAINT trip_events_type_check CHECK (((type)::text = ANY ((ARRAY['DEPARTED'::character varying, 'GATE_IN'::character varying, 'DOCK_IN'::character varying, 'DOCK_OUT'::character varying, 'DELAY_PREDICTED'::character varying, 'DOC_REJECTED'::character varying])::text[]))));

CREATE TABLE trips (
    dock_in_at timestamp(6) with time zone,
    dock_out_at timestamp(6) with time zone,
    ended_at timestamp(6) with time zone,
    gate_in_at timestamp(6) with time zone,
    started_at timestamp(6) with time zone,
    driver_id character varying(255),
    id character varying(255) NOT NULL,
    lane_id character varying(255),
    last_zone character varying(255),
    shipment_id character varying(255) NOT NULL,
    status character varying(255),
    tenant_id character varying(255) NOT NULL,
    vehicle_registration character varying(255),
    CONSTRAINT trips_status_check CHECK (((status)::text = ANY ((ARRAY['PLANNED'::character varying, 'ACTIVE'::character varying, 'COMPLETED'::character varying, 'ABANDONED'::character varying])::text[]))));

CREATE TABLE vehicles (
    battery_pct integer NOT NULL,
    capacity_kg integer NOT NULL,
    cost_per_trip integer NOT NULL,
    last_ping timestamp(6) with time zone,
    carrier_id character varying(255),
    device_status character varying(255),
    id character varying(255) NOT NULL,
    reg_number character varying(255),
    type character varying(255),
    CONSTRAINT vehicles_device_status_check CHECK (((device_status)::text = ANY ((ARRAY['ONLINE'::character varying, 'OFFLINE'::character varying, 'LOW_BATTERY'::character varying])::text[]))));


-- surrogate keys -------------------------------------------------------------
-- The four append-only, high-volume tables. Identity rather than a UUID: these
-- are written far more often than they are referenced, and a monotonic bigint
-- keeps the btree appending at one end instead of fragmenting across it.
ALTER TABLE positions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE sensor_readings ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE shipment_events ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE trip_events ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;

-- primary keys --------------------------------------------------------------
ALTER TABLE alerts ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);
ALTER TABLE app_users ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);
ALTER TABLE appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
ALTER TABLE carriers ADD CONSTRAINT carriers_pkey PRIMARY KEY (id);
ALTER TABLE dock_turnaround_history ADD CONSTRAINT dock_turnaround_history_pkey PRIMARY KEY (id);
ALTER TABLE docks ADD CONSTRAINT docks_pkey PRIMARY KEY (id);
ALTER TABLE drivers ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);
ALTER TABLE eta_predictions ADD CONSTRAINT eta_predictions_pkey PRIMARY KEY (id);
ALTER TABLE fulfilment_centres ADD CONSTRAINT fulfilment_centres_pkey PRIMARY KEY (id);
ALTER TABLE incidents ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);
ALTER TABLE lane_segments ADD CONSTRAINT lane_segments_pkey PRIMARY KEY (id);
ALTER TABLE lanes ADD CONSTRAINT lanes_pkey PRIMARY KEY (id);
ALTER TABLE positions ADD CONSTRAINT positions_pkey PRIMARY KEY (id);
ALTER TABLE receiving_exceptions ADD CONSTRAINT receiving_exceptions_pkey PRIMARY KEY (id);
ALTER TABLE segment_speed_history ADD CONSTRAINT segment_speed_history_pkey PRIMARY KEY (id);
ALTER TABLE sensor_readings ADD CONSTRAINT sensor_readings_pkey PRIMARY KEY (id);
ALTER TABLE shipment_documents ADD CONSTRAINT shipment_documents_pkey PRIMARY KEY (id);
ALTER TABLE shipment_events ADD CONSTRAINT shipment_events_pkey PRIMARY KEY (id);
ALTER TABLE shipment_route ADD CONSTRAINT shipment_route_pkey PRIMARY KEY (leg_index, shipment_id);
ALTER TABLE shipments ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);
ALTER TABLE tenants ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);
ALTER TABLE trip_events ADD CONSTRAINT trip_events_pkey PRIMARY KEY (id);
ALTER TABLE trips ADD CONSTRAINT trips_pkey PRIMARY KEY (id);
ALTER TABLE vehicles ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);

-- uniqueness ----------------------------------------------------------------
ALTER TABLE app_users ADD CONSTRAINT app_users_email_key UNIQUE (email);
ALTER TABLE dock_turnaround_history ADD CONSTRAINT uq_fc_hour_day UNIQUE (fc_id, hour_bucket, day_type);
ALTER TABLE lanes ADD CONSTRAINT lanes_code_key UNIQUE (code);
ALTER TABLE segment_speed_history ADD CONSTRAINT uq_segment_hour_day UNIQUE (segment_id, hour_bucket, day_type);
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_key UNIQUE (slug);

-- foreign keys ---------------------------------------------------------------
-- Renamed from Hibernate's generated fk<32 hex> names, which tell a reader
-- nothing and change whenever a mapping is touched.
ALTER TABLE app_users ADD CONSTRAINT fk_app_users_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE dock_turnaround_history ADD CONSTRAINT fk_dock_turnaround_history_fc_id FOREIGN KEY (fc_id) REFERENCES fulfilment_centres(id);
ALTER TABLE docks ADD CONSTRAINT fk_docks_fc_id FOREIGN KEY (fc_id) REFERENCES fulfilment_centres(id);
ALTER TABLE drivers ADD CONSTRAINT fk_drivers_vehicle_id FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);
ALTER TABLE eta_predictions ADD CONSTRAINT fk_eta_predictions_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id);
ALTER TABLE lane_segments ADD CONSTRAINT fk_lane_segments_lane_id FOREIGN KEY (lane_id) REFERENCES lanes(id);
ALTER TABLE lanes ADD CONSTRAINT fk_lanes_fc_id FOREIGN KEY (fc_id) REFERENCES fulfilment_centres(id);
ALTER TABLE positions ADD CONSTRAINT fk_positions_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id);
ALTER TABLE segment_speed_history ADD CONSTRAINT fk_segment_speed_history_segment_id FOREIGN KEY (segment_id) REFERENCES lane_segments(id);
ALTER TABLE sensor_readings ADD CONSTRAINT fk_sensor_readings_shipment_id FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE shipment_documents ADD CONSTRAINT fk_shipment_documents_shipment_id FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE shipment_events ADD CONSTRAINT fk_shipment_events_shipment_id FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE shipment_route ADD CONSTRAINT fk_shipment_route_shipment_id FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE shipments ADD CONSTRAINT fk_shipments_driver_id FOREIGN KEY (driver_id) REFERENCES drivers(id);
ALTER TABLE shipments ADD CONSTRAINT fk_shipments_fc_id FOREIGN KEY (fc_id) REFERENCES fulfilment_centres(id);
ALTER TABLE shipments ADD CONSTRAINT fk_shipments_vehicle_id FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);
ALTER TABLE shipments ADD CONSTRAINT fk_shipments_vendor_id FOREIGN KEY (vendor_id) REFERENCES tenants(id);
ALTER TABLE trip_events ADD CONSTRAINT fk_trip_events_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id);
ALTER TABLE trips ADD CONSTRAINT fk_trips_driver_id FOREIGN KEY (driver_id) REFERENCES drivers(id);
ALTER TABLE trips ADD CONSTRAINT fk_trips_lane_id FOREIGN KEY (lane_id) REFERENCES lanes(id);
ALTER TABLE trips ADD CONSTRAINT fk_trips_shipment_id FOREIGN KEY (shipment_id) REFERENCES shipments(id);
ALTER TABLE trips ADD CONSTRAINT fk_trips_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE vehicles ADD CONSTRAINT fk_vehicles_carrier_id FOREIGN KEY (carrier_id) REFERENCES carriers(id);

-- indexes -------------------------------------------------------------------
CREATE INDEX idx_alert_raised ON alerts (raised_at);
CREATE INDEX idx_alert_shipment ON alerts (shipment_id);
CREATE INDEX idx_appt_dock_time ON appointments (dock_id, start_at);
CREATE INDEX idx_appt_fc ON appointments (fc_id);
CREATE INDEX idx_eta_scoring ON eta_predictions (actual_dock_in_at);
CREATE INDEX idx_eta_trip_made ON eta_predictions (trip_id, made_at);
CREATE INDEX idx_exc_fc_status ON receiving_exceptions (fc_id, status);
CREATE INDEX idx_lane_fc ON lanes (fc_id);
CREATE INDEX idx_position_trip_time ON positions (trip_id, device_timestamp);
CREATE INDEX idx_reading_shipment ON sensor_readings (shipment_id, kind);
CREATE INDEX idx_segment_lane_seq ON lane_segments (lane_id, seq);
CREATE INDEX idx_trip_event_trip ON trip_events (trip_id, at);
CREATE INDEX idx_trip_event_type ON trip_events (type);
CREATE INDEX idx_trip_shipment ON trips (shipment_id);
CREATE INDEX idx_trip_status ON trips (status);
CREATE INDEX idx_trip_tenant ON trips (tenant_id);
