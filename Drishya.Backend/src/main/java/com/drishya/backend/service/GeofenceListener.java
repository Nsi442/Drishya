package com.drishya.backend.service;

import com.drishya.backend.domain.FulfilmentCentre;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.TripEvent;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.domain.enums.TripEventType;
import com.drishya.backend.repo.FulfilmentCentreRepository;
import com.drishya.backend.repo.TripRepository;
import com.drishya.backend.service.eta.EtaService;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns a stream of position fixes into gate and dock events.
 *
 * <p><b>The distance test runs in PostGIS.</b> Not a Haversine in Java: the
 * database has the spheroid, the GiST index, and one implementation of the
 * question that every other part of this system also asks.
 *
 * <p><b>Events are written on transition only.</b> This is the whole difficulty
 * of the feature. A vehicle that parks inside the fence keeps reporting fixes
 * inside the fence — at one fix every ten seconds, a ninety-minute unload is 540
 * positions, every one of them "inside". Writing an event per fix produces a
 * timeline nobody can read and a gate time buried 540 rows deep. So the trip
 * remembers which zone its last fix was in, and only a change writes anything.
 *
 * <p><b>Ordered, and one batch at a time.</b> The transition rule only makes
 * sense over a sequence, so the whole batch is walked here in device-time order
 * inside a single transaction. An earlier version published one event per fix
 * and let the async listeners run concurrently; they each read the trip's last
 * zone before any of them wrote it, so a single approach produced four GATE_IN
 * rows and a negative turnaround. The row lock below closes the same race
 * between two batches arriving for one trip at once — two vehicles' worth of
 * catch-up traffic landing together is exactly when it would happen.
 *
 * <p>The zone lives on the trip rather than in memory because ingest is
 * stateless and may be served by any instance, and because a restart mid-unload
 * must not re-fire GATE_IN.
 */
@Component
public class GeofenceListener {

    private static final Logger log = LoggerFactory.getLogger(GeofenceListener.class);

    /** Outside every fence. */
    private static final String ZONE_OUTSIDE = "OUTSIDE";

    /**
     * Metres from the bays at which a vehicle counts as docked rather than
     * merely on site. Tighter than the site geofence by design: the gap between
     * the two is the yard, and time spent in it is the queue the ETA engine
     * predicts.
     */
    private static final int DOCK_RADIUS_M = 60;

    private final FulfilmentCentreRepository centres;
    private final TripRepository trips;
    private final EtaService eta;

    public GeofenceListener(FulfilmentCentreRepository centres, TripRepository trips,
                            EtaService eta) {
        this.centres = centres;
        this.trips = trips;
        this.eta = eta;
    }

    /**
     * Runs after the ingest transaction commits, on another thread.
     *
     * <p>AFTER_COMMIT so a rolled-back batch never produces a gate event for a
     * position that does not exist. Async so ingest has already returned 202.
     * REQUIRES_NEW because the originating transaction is over — without it
     * these writes would have no transaction to join.
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onPositions(PositionRecorded batch) {
        try {
            evaluate(batch);
        } catch (Exception e) {
            // A geofence failure must never affect ingest, which has already
            // committed and returned. Losing a gate event is bad; losing the
            // position that proves the vehicle was there is worse.
            log.error("Geofence evaluation failed for trip {}: {}",
                    batch.tripId(), e.getMessage(), e);
        }
    }

    private void evaluate(PositionRecorded batch) {
        // Locked for the duration: two concurrent batches for one trip would
        // otherwise both read the same starting zone and both act on it.
        Trip trip = trips.findByIdForUpdate(batch.tripId(), batch.tenantId()).orElse(null);
        if (trip == null) {
            return;
        }

        String zone = trip.getLastZone() == null ? ZONE_OUTSIDE : trip.getLastZone();
        boolean changed = false;

        for (PositionRecorded.Fix fix : batch.fixes()) {
            String next = zoneOf(fix);
            if (next.equals(zone)) {
                continue; // Still where it was. Nothing to record.
            }
            applyTransition(trip, zone, next, fix);
            zone = next;
            changed = true;
        }

        if (changed) {
            trip.setLastZone(zone);
            trips.save(trip);
        }
    }

    /**
     * Which zone a fix falls in: OUTSIDE, GATE:fcId or DOCK:fcId.
     *
     * <p>One indexed spatial query answers the first question; the dock refines
     * it only once the vehicle is known to be on site, so the tighter distance
     * is measured at most once per fix rather than against every site.
     */
    private String zoneOf(PositionRecorded.Fix fix) {
        Optional<FulfilmentCentre> site = centres.findEnclosingGeofence(fix.lat(), fix.lon());
        if (site.isEmpty()) {
            return ZONE_OUTSIDE;
        }
        FulfilmentCentre fc = site.get();
        Double metres = centres.distanceToDockMetres(fc.getId(), fix.lat(), fix.lon());
        boolean atDock = metres != null && metres <= DOCK_RADIUS_M;
        return (atDock ? "DOCK:" : "GATE:") + fc.getId();
    }

    private void applyTransition(Trip trip, String from, String to, PositionRecorded.Fix fix) {
        boolean wasOnSite = !ZONE_OUTSIDE.equals(from);
        boolean wasAtDock = from.startsWith("DOCK:");
        boolean isOnSite = !ZONE_OUTSIDE.equals(to);
        boolean isAtDock = to.startsWith("DOCK:");
        String fcId = isOnSite ? to.substring(to.indexOf(':') + 1) : null;

        // --- arriving on site ------------------------------------------------
        // Guarded on gateInAt as well as the zone, so a vehicle that drifts out
        // of the fence on a scattered fix and back in does not gate in twice.
        // The first crossing is the one that counts in a dispute.
        if (isOnSite && !wasOnSite && trip.getGateInAt() == null) {
            trip.setGateInAt(fix.deviceTimestamp());
            Double metres = centres.distanceToDockMetres(fcId, fix.lat(), fix.lon());
            trip.addEvent(new TripEvent(TripEventType.GATE_IN, fix.deviceTimestamp(),
                    "Arrived at fulfilment centre gate")
                    .with("fcId", fcId)
                    .with("distanceToDockM", metres == null ? null : Math.round(metres))
                    .with("source", fix.source().wire())
                    .with("positionId", fix.positionId()));
            advance(trip, ShipmentStatus.AT_GATE);
            log.info("Trip {} gated in at {}", trip.getId(), fcId);
        }

        // --- reaching a bay --------------------------------------------------
        if (isAtDock && !wasAtDock && trip.getDockInAt() == null) {
            trip.setDockInAt(fix.deviceTimestamp());
            trip.addEvent(new TripEvent(TripEventType.DOCK_IN, fix.deviceTimestamp(),
                    "Docked and unloading")
                    .with("fcId", fcId)
                    .with("queueMinutes", queueMinutes(trip))
                    .with("source", fix.source().wire())
                    .with("positionId", fix.positionId()));
            advance(trip, ShipmentStatus.AT_DOCK);
            log.info("Trip {} docked in at {}", trip.getId(), fcId);

            // The moment of truth. Everything predicted for this trip is now
            // scorable against what actually happened, which is the only reason
            // the accuracy endpoint can report a number rather than a claim.
            eta.scoreOnArrival(trip.getId(), fix.deviceTimestamp());
        }

        // --- leaving the bay -------------------------------------------------
        // Recorded even when the vehicle only moves back into the yard, because
        // this is what closes the turnaround the shared dock history learns
        // from. Requires a dock-in to have happened first: without that guard a
        // stray fix could close a turnaround that never opened.
        if (wasAtDock && !isAtDock && trip.getDockInAt() != null && trip.getDockOutAt() == null) {
            trip.setDockOutAt(fix.deviceTimestamp());
            trip.addEvent(new TripEvent(TripEventType.DOCK_OUT, fix.deviceTimestamp(),
                    "Left the bay")
                    .with("turnaroundMinutes", trip.turnaroundMinutes())
                    .with("source", fix.source().wire()));
            log.info("Trip {} docked out after {} min", trip.getId(), trip.turnaroundMinutes());
        }
    }

    /** Gate-in to dock-in: the yard queue, which is the half a route planner misses. */
    private Long queueMinutes(Trip trip) {
        if (trip.getGateInAt() == null || trip.getDockInAt() == null) {
            return null;
        }
        return java.time.Duration.between(trip.getGateInAt(), trip.getDockInAt()).toMinutes();
    }

    /**
     * Moves the shipment forward, never backward. A vehicle rolling a few metres
     * off the dock must not demote the shipment from AT_DOCK to AT_GATE — the
     * ordinal comparison is what stops the timeline oscillating.
     */
    private void advance(Trip trip, ShipmentStatus target) {
        var shipment = trip.getShipment();
        if (shipment != null && shipment.getStatus().ordinal() < target.ordinal()) {
            shipment.setStatus(target);
        }
    }
}
