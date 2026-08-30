package com.drishya.backend.web;

import com.drishya.backend.repo.EtaPredictionRepository;
import com.drishya.backend.service.eta.OnnxEtaModel;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * How wrong the predictions have been.
 *
 * <p>Deliberately unflattering. Mean <i>absolute</i> error, because a model that
 * is twenty minutes optimistic half the time and twenty minutes pessimistic the
 * other half has a signed error of zero and is worthless — reporting the signed
 * mean would make this system look perfect precisely when it is not. And broken
 * down per lane, because one overall figure hides a badly predicted corridor
 * inside five good ones, and the corridor is the thing a dispatcher would want
 * warning about.
 *
 * <p>Open to any authenticated caller rather than tenant-scoped: the figure is
 * computed across the cluster and describes the platform, not anyone's
 * consignments.
 */
@RestController
@RequestMapping("/api/v1/metrics")
public class MetricsController {

    private final EtaPredictionRepository predictions;
    private final OnnxEtaModel onnx;

    public MetricsController(EtaPredictionRepository predictions, OnnxEtaModel onnx) {
        this.predictions = predictions;
        this.onnx = onnx;
    }

    @GetMapping("/eta-accuracy")
    public EtaAccuracy etaAccuracy() {
        Double overall = predictions.meanAbsoluteErrorMinutes();
        List<LaneAccuracy> byLane = predictions.meanAbsoluteErrorByLane().stream()
                .map(row -> new LaneAccuracy(row.getLane(), round(row.getMae()), row.getSamples()))
                .toList();
        long scored = byLane.stream().mapToLong(LaneAccuracy::samples).sum();

        return new EtaAccuracy(
                overall == null ? null : round(overall),
                scored,
                onnx.isReady() ? onnx.version() : "heuristic-v1",
                onnx.isReady(),
                onnx.isTrainedOnSyntheticData(),
                byLane,
                scored == 0
                        ? "No prediction has been scored yet. A figure appears once a trip "
                          + "with predictions against it reaches a bay."
                        : null);
    }

    /**
     * @param modelVersion which engine produced the predictions being scored.
     *     Without it a change in accuracy cannot be attributed to a model change
     *     rather than to an easier week of traffic.
     * @param note present only when there is nothing to report, so a caller
     *     never has to interpret a null MAE as "perfect".
     */
    public record EtaAccuracy(
            Double meanAbsoluteErrorMinutes,
            long scoredPredictions,
            String modelVersion,
            boolean trainedModelServing,
            /**
             * True when the serving model was fitted on generated data. Exposed
             * on the API rather than buried in a log, because an accuracy figure
             * from a synthetic model describes the generator and would otherwise
             * be indistinguishable from a real one on this endpoint.
             */
            boolean trainedOnSyntheticData,
            List<LaneAccuracy> byLane,
            String note) {
    }

    public record LaneAccuracy(String lane, double meanAbsoluteErrorMinutes, long samples) {
    }

    private static double round(double v) {
        return Math.round(v * 10) / 10d;
    }
}
