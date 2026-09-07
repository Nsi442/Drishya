-- Lets the database store the alert type the code already knows about.
--
-- AlertType.SLOT_REQUIRED was added for the approaching-arrival notice, and the
-- wire value was matched in the frontend's constants.js — the two-file change
-- this project's guide prescribes for any enum. That guide is about the browser
-- contract, and it is not the whole contract: Hibernate persists this enum by
-- NAME, and alerts.type carries a CHECK constraint listing the names it accepts.
-- A value missing from that list is not rejected at compile time, at start-up,
-- or by any test that does not insert one. It fails at the moment the feature
-- first does its job.
--
-- It failed loudly and in the worst possible way. The insert aborted the
-- surrounding transaction, every later statement in that scheduled run died
-- with "current transaction is aborted", and the job still logged that it had
-- notified the receiving desk. An enum whose values are constrained in the
-- schema is a THREE-file change: the Java enum, the frontend vocabulary, and a
-- migration.
ALTER TABLE alerts DROP CONSTRAINT alerts_type_check;

ALTER TABLE alerts
    ADD CONSTRAINT alerts_type_check
    CHECK (type::text = ANY (ARRAY['DELAY'::character varying,
                                   'DOOR_OPEN'::character varying,
                                   'TEMPERATURE'::character varying,
                                   'SHOCK'::character varying,
                                   'DOCUMENT'::character varying,
                                   'DETENTION'::character varying,
                                   'ROUTE_DEVIATION'::character varying,
                                   'DEVICE_OFFLINE'::character varying,
                                   'SLOT_CHANGE'::character varying,
                                   'SLOT_REQUIRED'::character varying,
                                   'ARRIVAL'::character varying]::text[]));
