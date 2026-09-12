package com.drishya.backend.service.eta;

import com.drishya.backend.domain.EtaPrediction;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.TripEvent;
import com.drishya.backend.domain.enums.TripEventType;
import com.drishya.backend.repo.EtaPredictionRepository;
import com.drishya.backend.repo.TripRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Produces a prediction for a trip, stores it, and says so when it means the
 * booked slot is going to be missed.
 *
 * <p><b>Every prediction is written, including the wrong ones.</b> A system that
 * keeps only its current estimate can never answer "how good is this?", and an
 * accuracy claim nobody can reproduce is worth nothing in a review. When a trip
 * finally docks, {@link #scoreOnArrival} walks back over everything that was
 * predicted for it and records the error against each one.
 *
 * <p>The models are tried in {@code @Order} — the ONNX model first if one has
 * been trained, then the heuristic, which always answers. That ordering is the
 * fallback chain, not a preference: a model that returns nonsense declines, and
 * the next one is asked.
 */
@Service
public class EtaService {

    private static final Logger log = LoggerFactory.getLogger(EtaService.class);

    private final List<EtaModel> models;
    private final FeatureBuilder featureBuilder;
    private final EtaPredictionRepository predictions;
    private final TripRepository trips;
    private final ApplicationEventPublisher events;

    /**
     * @param models injected in {@code @Order}, so the trained model — when
     *     there is one — is offered the prediction before the heuristic.
     */
    public EtaService(List<EtaModel> models, FeatureBuilder featureBuilder,
                      EtaPredictionRepository predictions, TripRepository trips,
                      ApplicationEventPublisher events) {
        this.models = models;
        this.featureBuilder = featureBuilder;
        this.predictions = predictions;
        this.trips = trips;
        this.events = events;
    }

    /**
     * Recomputes and stores the estimate for one trip.
     *
     * @return the stored prediction, or empty if the trip cannot be predicted —
     *     no lane, or no position yet. Empty is a real answer here, not a
     *     failure: showing "awaiting first fix" is honest, and inventing a time
     *     to fill the column is not.
     */
    @Transactional
    public Optional<EtaPrediction> predict(Trip trip) {
        Instant now = Instant.now();

        Optional<EtaFeatures> maybe = featureBuilder.build(trip, now);
        if (maybe.isEmpty()) {
            return Optional.empty();
        }
        EtaFeatures features = maybe.get();

        // Fallback chain. The first model willing to answer wins.
        double minutes = -1;
        EtaModel used = null;
        for (EtaModel model : models) {
            Optional<Double> answer = model.predictMinutes(features);
            if (answer.isPresent()) {
                minutes = answer.get();
                used = model;
                break;
            }
        }
        if (used == null) {
            log.warn("No model would predict for trip {}", trip.getId());
            return Optional.empty();
        }

        double[] band = used.band(features, minutes);
        Instant dockIn = now.plus(Duration.ofSeconds((long) (minutes * 60)));

        EtaPrediction prediction = new EtaPrediction();
        prediction.setId("eta-" + UUID.randomUUID().toString().substring(0, 12));
        prediction.setTrip(trip);
        prediction.setPredictedDockInAt(dockIn);
        prediction.setConfidenceLowAt(now.plus(Duration.ofSeconds((long) (minutes * band[0] * 60))));
        prediction.setConfidenceHighAt(now.plus(Duration.ofSeconds((long) (minutes * band[1] * 60))));
        prediction.setModelVersion(used.version());
        prediction.setMadeAt(now);
        prediction.setRemainingDistanceM(features.remainingDistanceM());
        prediction.setPredictedQueueMinutes(features.predictedQueueMinutes());
        // Stored as-is. The training export replays this rather than rebuilding
        // it, which is what keeps train and serve on the same numbers.
        prediction.setFeatures(features.asMap());
        predictions.save(prediction);

        // The platform's current belief. promisedAt is what was agreed at
        // booking and is never touched — the gap between the two is the product.
        Shipment shipment = trip.getShipment();
        if (shipment != null) {
            shipment.setPredictedAt(dockIn);
            applyProgress(shipment, features.remainingDistanceM());
            bookWindowIfNoneAgreed(shipment, dockIn);
            checkSlot(trip, shipment, prediction);
        }

        return Optional.of(prediction);
    }

    /**
     * Sets the delivery window from the engine's first real estimate, for a
     * consignment booked without one.
     *
     * <p>The booking form asks the vendor when the goods are collected and
     * nothing else. Something still has to say what was promised: promisedAt is
     * the fixed point every delay figure is measured against, and late is
     * predicted minus promised. Left to the create-time fallback it is now plus
     * 36 hours, which on a 127 km lane means every consignment arrives
     * comfortably early and the product demonstrates nothing.
     *
     * <p><b>Here, and not at departure, because the engine cannot answer any
     * earlier.</b> The obvious place was TripService.start, and it was tried:
     * FeatureBuilder needs a position fix to build features from, and at the
     * moment a trip starts there are none, so it declined and the window stayed
     * at the fallback. This runs on the first cycle that produces a real
     * prediction, which is the first moment there is anything honest to promise.
     *
     * <p>The promise comes from the engine rather than from arithmetic here.
     * That is the rule this codebase already holds itself to: two earlier
     * versions of the seeder estimated arrival independently, disagreed with
     * the engine by up to nine hours on a long lane, and showed on screen as
     * "8 h 45 m late" against a slot they had themselves chosen.
     *
     * <p>Once only, and never over an agreement. A vendor-supplied slot is left
     * exactly alone, and this marks the row agreed as it writes, so the next
     * cycle a minute later does not walk the promise along behind the estimate
     * — which would make every consignment permanently, perfectly on time.
     */
    private void bookWindowIfNoneAgreed(Shipment shipment, Instant dockIn) {
        if (shipment.isSlotAgreed() || dockIn == null) {
            return;
        }
        shipment.setSlotStart(dockIn);
        shipment.setSlotEnd(dockIn.plus(1, ChronoUnit.HOURS));
        shipment.setPromisedAt(dockIn.plus(30, ChronoUnit.MINUTES));
        shipment.setSlotAgreed(true);
        log.info("Booked {} a delivery window of {} from the engine's first estimate",
                shipment.getId(), shipment.getSlotStart());
    }

    /**
     * How far along the shipment says it is, from how far the engine says is left.
     *
     * <p><b>Why here and not on the position fix.</b> Progress along a route is
     * a projection of a point onto a polyline, and this project does not do
     * that arithmetic in Java — {@code FeatureBuilder} has already had PostGIS
     * locate the vehicle on the lane, and {@code remainingDistanceM} is the
     * answer it got. Recomputing it here from the raw fix would be a second,
     * worse implementation of a question already answered.
     *
     * <p><b>Why it matters that this happens at all.</b> These two fields are
     * what every table, progress bar and arrival board reads, and until now
     * only the browser simulation wrote them — so the trip moved on the server
     * while the consignment sat still, and each portal's idea of "62% covered"
     * was its own tab's arithmetic. The engine is the one thing all three can
     * agree with.
     */
    private void applyProgress(Shipment shipment, double remainingDistanceM) {
        int distanceKm = shipment.getDistanceKm();
        if (distanceKm <= 0) {
            return;
        }

        double remainingKm = Math.max(0, remainingDistanceM / 1000.0);
        // Clamped rather than trusted. The lane the engine measures against is
        // the shared corridor, not this consignment's own route, so the two
        // lengths differ by a few kilometres at each end and an unclamped
        // ratio can read as 103% covered or minus four kilometres to run.
        shipment.setRemainingKm((int) Math.round(Math.min(remainingKm, distanceKm)));
        shipment.setProgress(clamp(1 - (remainingKm / distanceKm), 0, 1));
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Fires once per trip when predicted dock-in falls outside the booked window.
     *
     * <p>Guarded on the event having been raised before, because this runs every
     * sixty seconds for the whole time a vehicle is late. Without the guard a
     * two-hour delay produces 120 identical alerts and the exception queue
     * becomes unusable precisely when it matters.
     */
    private void checkSlot(Trip trip, Shipment shipment, EtaPrediction prediction) {
        Instant slotEnd = shipment.getSlotEnd();
        if (slotEnd == null || !prediction.getPredictedDockInAt().isAfter(slotEnd)) {
            return;
        }

        boolean alreadyRaised = trip.getEvents().stream()
                .anyMatch(e -> e.getType() == TripEventType.DELAY_PREDICTED);
        if (alreadyRaised) {
            return;
        }

        long lateBy = Duration.between(slotEnd, prediction.getPredictedDockInAt()).toMinutes();

        trip.addEvent(new TripEvent(TripEventType.DELAY_PREDICTED, prediction.getMadeAt(),
                "Predicted to miss the booked slot by " + lateBy + " min")
                .with("predictedDockInAt", prediction.getPredictedDockInAt().toEpochMilli())
                .with("slotEndAt", slotEnd.toEpochMilli())
                .with("lateByMinutes", lateBy)
                .with("modelVersion", prediction.getModelVersion()));
        trips.save(trip);

        shipment.setDelayMin((int) lateBy);
        events.publishEvent(new DelayDetected(
                trip.getId(), shipment.getId(), shipment.getVendor() == null ? null
                : shipment.getVendor().getId(),
                prediction.getPredictedDockInAt(), slotEnd, lateBy,
                prediction.getModelVersion()));

        log.info("Trip {} predicted to miss its slot by {} min", trip.getId(), lateBy);
    }

    /**
     * Scores every outstanding prediction for a trip against what actually
     * happened. Called when the trip docks.
     *
     * <p>This is what turns a pile of stored guesses into a measurable error
     * rate, and it is the only reason the accuracy endpoint can report anything
     * at all.
     */
    @Transactional
    public int scoreOnArrival(String tripId, Instant actualDockIn) {
        List<EtaPrediction> outstanding = predictions.findByTripIdAndActualDockInAtIsNull(tripId);
        outstanding.forEach(p -> p.score(actualDockIn));
        predictions.saveAll(outstanding);

        if (!outstanding.isEmpty()) {
            double meanAbs = outstanding.stream()
                    .mapToDouble(p -> Math.abs(p.getErrorMinutes()))
                    .average().orElse(0);
            log.info("Trip {} docked; scored {} predictions, mean absolute error {} min",
                    tripId, outstanding.size(), Math.round(meanAbs));
        }
        return outstanding.size();
    }
}
