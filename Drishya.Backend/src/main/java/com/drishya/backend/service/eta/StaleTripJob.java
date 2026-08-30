package com.drishya.backend.service.eta;

import com.drishya.backend.domain.Position;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.TripEvent;
import com.drishya.backend.domain.enums.TripEventType;
import com.drishya.backend.domain.enums.TripStatus;
import com.drishya.backend.repo.PositionRepository;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.TripRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Closes trips that stopped reporting and were never finished.
 *
 * <p><b>Why this had to exist.</b> Nothing in the system ever ended a trip that
 * simply went quiet. A trip started for a demo and abandoned stayed ACTIVE
 * indefinitely, and the ETA scheduler dutifully recomputed it every sixty
 * seconds — for days — against a booked slot that had long closed. The result
 * on screen was a consignment reporting itself <i>85 hours late</i> with
 * complete confidence, from a position fix four days old.
 *
 * <p>Every individual number in that chain was correct. The system had no way
 * to say "I have lost this vehicle", so it expressed ignorance in the language
 * of precision, which is the worst thing a prediction system can do: absurd
 * output is how people learn to stop believing the screen, including on the
 * occasions it is right.
 *
 * <p>ABANDONED rather than COMPLETED, deliberately. The consignment did not
 * arrive as far as anyone knows, and recording it as delivered would corrupt
 * both the on-time scorecard and the pooled dock history. The positions it did
 * report stay valid — the road still taught us how long that stretch took.
 */
@Component
public class StaleTripJob {

    private static final Logger log = LoggerFactory.getLogger(StaleTripJob.class);

    /**
     * No fix for this long and the trip is presumed dead.
     *
     * <p>Much longer than the two hours at which predictions stop, and
     * deliberately so: those are different judgements. Two hours means "do not
     * predict from this", which is reversible the moment a fix arrives. A day
     * means "this is not coming back", which is not.
     */
    private static final Duration ABANDON_AFTER = Duration.ofHours(24);

    /** Matches FeatureBuilder.MAX_FIX_AGE: past this we no longer predict. */
    private static final Duration STALE_FIX_AGE = Duration.ofHours(2);

    private final TripRepository trips;
    private final PositionRepository positions;
    private final ShipmentRepository shipments;

    public StaleTripJob(TripRepository trips, PositionRepository positions,
                        ShipmentRepository shipments) {
        this.trips = trips;
        this.positions = positions;
        this.shipments = shipments;
    }

    /**
     * Every fifteen minutes. Frequent enough that a demo left running overnight
     * is tidy by morning, rare enough to be invisible.
     */
    @Scheduled(fixedDelay = 900_000, initialDelay = 120_000)
    @Transactional
    public void abandonStaleTrips() {
        Instant now = Instant.now();
        List<Trip> active = trips.findAllActiveAcrossTenants();
        int abandoned = 0;

        for (Trip trip : active) {
            Instant lastSignal = lastSignalOf(trip);
            if (lastSignal == null) {
                // Never reported at all. Measured from when it started, or it
                // would be abandoned the instant it was created.
                lastSignal = trip.getStartedAt();
            }
            if (lastSignal == null
                    || Duration.between(lastSignal, now).compareTo(ABANDON_AFTER) <= 0) {
                continue;
            }

            long hours = Duration.between(lastSignal, now).toHours();
            trip.setStatus(TripStatus.ABANDONED);
            trip.setEndedAt(now);

            // Clear the consignment's stale belief too.
            //
            // Abandoning the trip alone was not enough, and that gap is what a
            // user actually saw: the trip was correctly closed while the
            // shipment kept the predictedAt and delayMin written days earlier,
            // so the list still read "108 h late" with a confident ETA. The
            // prediction lives in two places — the trip's latest EtaPrediction
            // and these two denormalised fields on the shipment — and only
            // clearing one leaves the other speaking for a vehicle nobody can
            // find.
            //
            // predictedAt goes to null rather than to promisedAt: the honest
            // statement is "no current estimate", and copying the promise back
            // over it would quietly claim the delivery is on time.
            Shipment shipment = trip.getShipment();
            if (shipment != null) {
                shipment.setPredictedAt(null);
                shipment.setDelayMin(0);
                shipment.setDelayReason("Tracking lost — no position for " + hours + " hours");
                // Off the happy path but not cancelled: the goods may well be
                // fine, we simply cannot see them. EXCEPTION is what the
                // exception queue is for, and it stops the consignment sitting
                // in the in-transit list looking healthy.
                if (shipment.getStatus() == ShipmentStatus.IN_TRANSIT) {
                    shipment.setStatus(ShipmentStatus.EXCEPTION);
                }
                shipment.setUpdatedAt(now);
            }
            trip.addEvent(new TripEvent(TripEventType.DELAY_PREDICTED, now,
                    "Tracking lost — no position for " + hours + " hours")
                    .with("lastSignalAt", lastSignal.toEpochMilli())
                    .with("hoursSilent", hours)
                    .with("outcome", "abandoned"));
            trips.save(trip);
            abandoned++;

            log.info("Trip {} abandoned after {}h without a position", trip.getId(), hours);
        }

        if (abandoned > 0) {
            log.info("Closed {} stale trip(s) of {} active", abandoned, active.size());
        }
    }

    /**
     * Repairs consignments still advertising an arrival with no live trip.
     *
     * <p>A second sweep because the first only looks at ACTIVE trips. A trip
     * abandoned on an earlier run — or ended any other way — leaves the
     * shipment's denormalised prediction behind it, and nothing else owns
     * clearing that. This is self-healing rather than a migration: it fixes the
     * rows that already drifted and any that drift later, whatever the cause.
     */
    @Scheduled(fixedDelay = 900_000, initialDelay = 150_000)
    @Transactional
    public void clearOrphanedPredictions() {
        List<Shipment> orphaned = shipments
                .findWithOrphanedPrediction(Instant.now().minus(STALE_FIX_AGE)).stream()
                // A delivered consignment's predictedAt is history, not a claim
                // about the future, so it is left alone.
                .filter(s -> s.getStatus() != ShipmentStatus.DELIVERED
                        && s.getStatus() != ShipmentStatus.CANCELLED)
                .toList();

        for (Shipment s : orphaned) {
            s.setPredictedAt(null);
            s.setDelayMin(0);
            if (s.getDelayReason() == null || s.getDelayReason().isBlank()) {
                s.setDelayReason("No live trip — estimate withdrawn");
            }
            if (s.getStatus() == ShipmentStatus.IN_TRANSIT) {
                s.setStatus(ShipmentStatus.EXCEPTION);
            }
            s.setUpdatedAt(Instant.now());
            shipments.save(s);
        }

        if (!orphaned.isEmpty()) {
            log.info("Withdrew {} stale arrival estimate(s) with no live trip", orphaned.size());
        }
    }

    /** The most recent thing this trip did, by device time. */
    private Instant lastSignalOf(Trip trip) {
        return positions.findByTripIdOrderByDeviceTimestampDesc(trip.getId(), Limit.of(1))
                .stream()
                .findFirst()
                .map(Position::getDeviceTimestamp)
                .orElse(null);
    }
}
