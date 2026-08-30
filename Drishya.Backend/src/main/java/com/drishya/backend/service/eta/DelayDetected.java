package com.drishya.backend.service.eta;

import java.time.Instant;

/**
 * Raised once, the first time a trip is predicted to miss its booked slot.
 *
 * <p><b>This event is the product.</b> Everything else in the system exists to
 * make it possible to raise: the geofence establishes where the vehicle is, the
 * pooled lane history establishes how fast the road is running, the pooled dock
 * history establishes how long the yard is taking. The point of all of it is to
 * say "this delivery will be forty minutes late" while there is still time to
 * telephone the fulfilment centre and move the slot — rather than discovering it
 * when the vehicle is turned away at the gate, or worse, on a payment statement
 * six weeks later with the dispute window already closed.
 *
 * <p>An event rather than a direct call so the notification path stays
 * pluggable, and so a failure to notify cannot roll back the prediction that
 * detected the delay.
 */
public record DelayDetected(
        String tripId,
        String shipmentId,
        String tenantId,
        /** What the platform now believes. */
        Instant predictedDockInAt,
        /** What was agreed at booking. Never moves. */
        Instant slotEndAt,
        long lateByMinutes,
        /** Which engine called it, so a false alarm can be attributed. */
        String modelVersion) {
}
