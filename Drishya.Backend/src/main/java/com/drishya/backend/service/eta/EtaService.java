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
            checkSlot(trip, shipment, prediction);
        }

        return Optional.of(prediction);
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
