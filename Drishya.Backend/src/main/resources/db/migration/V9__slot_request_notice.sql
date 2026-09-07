-- Remembers that the receiving desk has already been told a lorry is close.
--
-- The approach job runs every minute, and the condition it tests — "arriving
-- within the hour, with no dock slot booked" — stays true for that whole hour.
-- Without a marker the desk would be told sixty times about one lorry, which is
-- how a notification channel stops being read.
--
-- On the trip rather than the shipment because the trip is the journey: a
-- consignment re-dispatched after a cancelled run is a new trip and deserves to
-- be announced again, while the shipment id has not changed.
--
-- Nullable, and null means "not yet told" rather than "unknown". Every trip in
-- flight when this migration runs is genuinely un-notified, because nothing has
-- ever sent this notice before.
ALTER TABLE trips
    ADD COLUMN slot_request_notified_at timestamp(6) with time zone;

COMMENT ON COLUMN trips.slot_request_notified_at IS
    'When the fulfilment centre was told to book a dock slot for this trip. '
    'Null means it has not been told. Set once, so the hour-long window during '
    'which the trip qualifies produces one notice rather than one per cycle.';
