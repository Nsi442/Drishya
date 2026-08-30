package com.drishya.backend.service.eta;

import java.util.Optional;

/**
 * Turns a feature vector into minutes-until-dock-in.
 *
 * <p>Two implementations exist behind this seam. The heuristic always works and
 * needs no data. The ONNX model is loaded only if someone has trained one and
 * dropped it in {@code models/}, and it is trained to correct the heuristic
 * rather than to replace it.
 *
 * <p><b>Why an interface rather than a flag.</b> The swap has to be reversible
 * at runtime and provable in a review: if the fitted model turns out worse than
 * the arithmetic it was meant to improve, the fix is to delete a file, not to
 * redeploy. Each prediction records which implementation produced it — see the
 * model version stored on every EtaPrediction row — so a change in accuracy can
 * be attributed to a model change rather than to an easier week of traffic.
 */
public interface EtaModel {

    /**
     * An identifier written onto every prediction this model makes, e.g.
     * {@code heuristic-v1} or {@code lgbm-2026-08-26}. Without it, comparing
     * accuracy across a deployment boundary is guesswork.
     */
    String version();

    /**
     * @return minutes from now until the vehicle reaches a bay, or empty if this
     *     model declines to answer. Declining is a legitimate result: it is what
     *     the ONNX implementation does when its output is implausible, and the
     *     caller then falls back to the heuristic.
     */
    Optional<Double> predictMinutes(EtaFeatures features);

    /**
     * The confidence band, as a multiplier either side of the estimate.
     *
     * <p>A dispatcher deciding whether to rebook a slot needs the worst case,
     * not the midpoint: "16:40, and it could be 17:25" supports a decision in a
     * way a bare "16:40" does not. The heuristic derives this from how thin the
     * underlying history is; a trained model supplies genuine 0.1 and 0.9
     * quantiles instead.
     *
     * @return {lowMultiplier, highMultiplier}, e.g. {0.82, 1.31}
     */
    double[] band(EtaFeatures features, double predictedMinutes);
}
