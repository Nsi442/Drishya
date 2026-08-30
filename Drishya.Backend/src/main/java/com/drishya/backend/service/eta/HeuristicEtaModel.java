package com.drishya.backend.service.eta;

import java.util.Optional;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * The default model: the segment-wise arithmetic FeatureBuilder already did.
 *
 * <p>It needs no training data, works on a lane the cluster has never run
 * before, and is the floor everything else is measured against. A fitted model
 * that cannot beat this is not worth deploying — which is the point of storing
 * the model version on every prediction.
 *
 * <p>The estimate itself arrives pre-computed as a feature, because the same
 * number is also what the trained model is asked to correct. Reaching in and
 * recomputing it here would be a second implementation of the heuristic and
 * exactly the kind of drift this design exists to avoid.
 */
@Component
@Order(100)
public class HeuristicEtaModel implements EtaModel {

    @Override
    public String version() {
        return "heuristic-v1";
    }

    @Override
    public Optional<Double> predictMinutes(EtaFeatures features) {
        double minutes = features.heuristicMinutes();
        // A negative estimate is meaningless; a vehicle that has arrived is at
        // zero, not in the past.
        return Optional.of(Math.max(0, minutes));
    }

    @Override
    public double[] band(EtaFeatures features, double predictedMinutes) {
        double spread = FeatureBuilder.bandFraction(features);
        // Asymmetric on purpose. Journeys run late far more often than they run
        // early — traffic, a queue, a document query at the gate all push one
        // way, and nothing except an empty road pushes the other. A symmetric
        // band would systematically understate the case a dispatcher actually
        // needs to plan against.
        return new double[]{1 - spread * 0.6, 1 + spread};
    }
}
