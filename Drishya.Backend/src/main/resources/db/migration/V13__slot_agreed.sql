-- Whether the delivery window was agreed at booking, or is waiting to be set.
--
-- The booking form no longer asks the vendor for a slot — only for the pickup.
-- Something still has to set promisedAt, because it is the fixed point every
-- delay figure is measured against, and the create-time fallback is now plus
-- 36 hours: on a 127 km lane that is so generous every consignment arrives
-- early and the product demonstrates nothing.
--
-- TripService books a real window from the ETA engine's own estimate when the
-- driver sets off — the first moment the engine can be asked at all, since
-- FeatureBuilder needs a trip. It needs to know which consignments to do that
-- for, and it cannot tell by looking: create() writes slotStart from the
-- fallback too, so "no slot" and "a slot nobody chose" are the same row.
--
-- Hence a flag rather than an inference. Existing rows were all booked with a
-- slot the vendor chose, so they are agreed and are never touched: promisedAt
-- still never moves once it means something.
ALTER TABLE shipments
    ADD COLUMN slot_agreed boolean NOT NULL DEFAULT true;
