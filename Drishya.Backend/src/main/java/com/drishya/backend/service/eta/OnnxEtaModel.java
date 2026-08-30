package com.drishya.backend.service.eta;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import jakarta.annotation.PreDestroy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Serves a trained model, if one has been trained.
 *
 * <p>Loads {@code models/eta.onnx} at startup and does nothing at all if it is
 * absent — the normal state until somebody runs the training pipeline. There is
 * no configuration flag: the presence of the file is the switch, so rolling back
 * a bad model is deleting it and restarting.
 *
 * <p><b>The model predicts the residual, not the answer.</b> It is trained on
 * {@code actual - heuristic}, so its output is a correction in minutes added to
 * the heuristic. Two things follow. It has far less to learn, so it is useful on
 * hundreds of trips rather than hundreds of thousands. And when it has learned
 * nothing useful it converges on predicting zero, which degrades to the
 * heuristic rather than to noise.
 *
 * <p>Three files, not one graph with three heads: {@code eta.onnx} is the
 * median and is required, {@code eta_q10.onnx} and {@code eta_q90.onnx} are the
 * band and are optional. Merging separately fitted boosters into one ONNX graph
 * is fiddly and opaque; three files are independently inspectable and
 * independently replaceable, and a missing band simply falls back to widening
 * by sample count.
 *
 * <h2>Two guards, both of which have to be here</h2>
 *
 * <p><b>Feature order.</b> {@code models/features.json} records the order the
 * model was fitted on, and loading refuses if it disagrees with
 * {@link EtaFeatures#NAMES}. A mismatch throws nothing on its own — the model
 * reads remaining-distance out of the slot that held hour-of-day and returns a
 * plausible number that is quietly wrong forever. Refusing to load is the only
 * honest response.
 *
 * <p><b>Implausible output.</b> Even a correctly wired model can produce
 * nonsense on an input unlike anything it saw in training. A negative arrival,
 * or one beyond three times the heuristic, is rejected per-prediction and the
 * heuristic answers instead. The rejection is logged, because a model being
 * silently bypassed on every call should be visible rather than looking like
 * everything is fine.
 */
@Component
@Order(10)
public class OnnxEtaModel implements EtaModel {

    private static final Logger log = LoggerFactory.getLogger(OnnxEtaModel.class);

    /** Beyond this multiple of the heuristic, the model is not believed. */
    private static final double IMPLAUSIBLE_MULTIPLE = 3.0;

    private final Path modelDir;
    private final Path modelPath;
    private final Path featuresPath;

    private OrtEnvironment environment;
    private OrtSession median;
    private OrtSession low;
    private OrtSession high;
    private String inputName;
    private String version = "onnx-unloaded";
    private boolean ready;
    private boolean trainedOnSyntheticData;

    public OnnxEtaModel(@Value("${drishya.eta.model-dir:models}") String dir) {
        this.modelDir = Path.of(dir);
        this.modelPath = modelDir.resolve("eta.onnx");
        this.featuresPath = modelDir.resolve("features.json");
        load();
    }

    private void load() {
        if (!Files.isRegularFile(modelPath)) {
            log.info("No ETA model at {} — serving the heuristic. "
                    + "Train one with ml/train.py to change that.", modelPath.toAbsolutePath());
            return;
        }
        if (!Files.isRegularFile(featuresPath)) {
            log.error("Found {} but no {}. Refusing to load a model whose feature "
                    + "order cannot be verified.", modelPath, featuresPath);
            return;
        }

        try {
            if (!featureOrderMatches()) {
                return;
            }

            environment = OrtEnvironment.getEnvironment();
            median = open(modelPath);
            low = openIfPresent(modelDir.resolve("eta_q10.onnx"));
            high = openIfPresent(modelDir.resolve("eta_q90.onnx"));

            inputName = median.getInputNames().iterator().next();
            version = "onnx-" + Files.getLastModifiedTime(modelPath).toInstant()
                    .toString().substring(0, 10);
            ready = true;

            log.info("ETA model loaded from {} as {} (input '{}', quantile band {})",
                    modelPath, version, inputName,
                    (low != null && high != null) ? "available" : "absent, widening by sample count");

            if (trainedOnSyntheticData) {
                log.warn("*** This ETA model was trained on SYNTHETIC data. Its predictions "
                        + "describe the generator, not the road. Do not present any accuracy "
                        + "figure from it as validated performance. ***");
            }
        } catch (Throwable t) {
            // Throwable, not Exception, and this is not defensive padding.
            // ONNX Runtime loads a native library, and when that fails — a musl
            // base image without glibc is the way to do it — the JVM raises
            // UnsatisfiedLinkError, which is an Error. Catching only Exception
            // let it escape the constructor and took the entire application
            // down at startup: no API, no ingest, no geofence, because an
            // OPTIONAL accuracy improvement was unavailable.
            //
            // The whole point of this seam is that the heuristic carries on
            // when the model cannot. Failing to start is the one outcome it
            // must never produce.
            log.error("Could not load the ETA model at {}; falling back to the heuristic: {}",
                    modelPath, t.toString());
            ready = false;
        }
    }

    private OrtSession open(Path path) throws Exception {
        try (OrtSession.SessionOptions options = new OrtSession.SessionOptions()) {
            // One thread. The model is a small gradient-boosted tree over twelve
            // floats, and the deploy target is a single shared core — letting
            // ONNX spin up a thread per core would contend with request handling
            // for no measurable gain.
            options.setIntraOpNumThreads(1);
            return environment.createSession(path.toString(), options);
        }
    }

    private OrtSession openIfPresent(Path path) {
        if (!Files.isRegularFile(path)) {
            return null;
        }
        try {
            return open(path);
        } catch (Exception e) {
            log.warn("Could not load the quantile model at {}: {}", path, e.getMessage());
            return null;
        }
    }

    /**
     * Compares the served feature order against the trained one, position by
     * position. Names alone are not enough — the order is what the tensor layout
     * depends on.
     */
    private boolean featureOrderMatches() throws Exception {
        JsonNode node = new ObjectMapper().readTree(Files.readString(featuresPath));
        JsonNode names = node.has("features") ? node.get("features") : node;

        trainedOnSyntheticData = node.path("trainedOnSyntheticData").asBoolean(false);

        if (!names.isArray() || names.size() != EtaFeatures.NAMES.length) {
            log.error("Feature count mismatch: the model was trained on {} features, this "
                            + "build serves {}. Refusing to load.",
                    names.isArray() ? names.size() : -1, EtaFeatures.NAMES.length);
            return false;
        }
        for (int i = 0; i < EtaFeatures.NAMES.length; i++) {
            String trained = names.get(i).asText();
            if (!EtaFeatures.NAMES[i].equals(trained)) {
                log.error("Feature order mismatch at position {}: the model expects '{}', this "
                                + "build supplies '{}'. Refusing to load — serving it would read "
                                + "every feature out of the wrong slot.",
                        i, trained, EtaFeatures.NAMES[i]);
                return false;
            }
        }
        return true;
    }

    @Override
    public String version() {
        return version;
    }

    @Override
    public Optional<Double> predictMinutes(EtaFeatures features) {
        if (!ready) {
            return Optional.empty();
        }
        try {
            double minutes = features.heuristicMinutes() + run(features, median);

            if (minutes < 0) {
                log.warn("Model returned a negative arrival ({} min); using the heuristic",
                        Math.round(minutes));
                return Optional.empty();
            }
            double ceiling = Math.max(30, features.heuristicMinutes() * IMPLAUSIBLE_MULTIPLE);
            if (minutes > ceiling) {
                log.warn("Model returned {} min against a heuristic of {} min — beyond {}x, so "
                                + "it is not believed; using the heuristic",
                        Math.round(minutes), Math.round(features.heuristicMinutes()),
                        IMPLAUSIBLE_MULTIPLE);
                return Optional.empty();
            }
            return Optional.of(minutes);
        } catch (Exception e) {
            log.error("ETA model failed on a prediction; using the heuristic: {}", e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public double[] band(EtaFeatures features, double predictedMinutes) {
        if (ready && low != null && high != null && predictedMinutes > 0) {
            try {
                double lowMinutes = features.heuristicMinutes() + run(features, low);
                double highMinutes = features.heuristicMinutes() + run(features, high);
                if (lowMinutes > 0 && highMinutes > lowMinutes) {
                    // Genuine 0.1 and 0.9 quantiles, expressed as multipliers so
                    // the caller treats every model the same way.
                    return new double[]{lowMinutes / predictedMinutes, highMinutes / predictedMinutes};
                }
            } catch (Exception e) {
                log.debug("Quantile heads unavailable, widening by sample count: {}", e.getMessage());
            }
        }
        double spread = FeatureBuilder.bandFraction(features);
        return new double[]{1 - spread * 0.6, 1 + spread};
    }

    private double run(EtaFeatures features, OrtSession session) throws Exception {
        float[][] input = {features.toVector()};
        try (OnnxTensor tensor = OnnxTensor.createTensor(environment, input)) {
            Map<String, OnnxTensor> inputs = new HashMap<>();
            inputs.put(inputName, tensor);
            try (OrtSession.Result result = session.run(inputs)) {
                return firstDouble(result.get(0).getValue());
            }
        }
    }

    /** ONNX exporters disagree about wrapping scalars; unwrap whatever arrived. */
    private static double firstDouble(Object value) {
        return switch (value) {
            case float[][] m -> m[0][0];
            case float[] v -> v[0];
            case double[][] m -> m[0][0];
            case double[] v -> v[0];
            case Number n -> n.doubleValue();
            default -> throw new IllegalStateException(
                    "Unexpected ONNX output type: " + value.getClass());
        };
    }

    @PreDestroy
    void close() {
        for (OrtSession session : new OrtSession[]{median, low, high}) {
            try {
                if (session != null) {
                    session.close();
                }
            } catch (Exception e) {
                log.debug("Closing an ONNX session failed: {}", e.getMessage());
            }
        }
    }

    /** Whether a trained model is actually serving. Reported by the metrics endpoint. */
    public boolean isReady() {
        return ready;
    }

    /** Whether that model was fitted on generated data. Surfaced, never hidden. */
    public boolean isTrainedOnSyntheticData() {
        return trainedOnSyntheticData;
    }
}
