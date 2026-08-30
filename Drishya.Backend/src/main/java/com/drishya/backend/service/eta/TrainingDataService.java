package com.drishya.backend.service.eta;

import com.drishya.backend.domain.EtaPrediction;
import com.drishya.backend.repo.EtaPredictionRepository;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns scored predictions into a training CSV.
 *
 * <p>One row per prediction that has an actual dock-in against it. The features
 * are read back from what was stored at prediction time — never rebuilt. See
 * EtaPrediction.features for why that distinction decides whether the resulting
 * model is any good.
 *
 * <p><b>The label is the residual, not the arrival time.</b> Each row carries
 * {@code actual_minutes - heuristic_minutes}: how wrong the arithmetic was. A
 * model fitted on that only has to learn where the heuristic is systematically
 * off, which is a far smaller thing to learn than travel time from scratch — it
 * works on hundreds of trips instead of hundreds of thousands, and when it has
 * learned nothing useful it predicts a correction near zero and quietly
 * degrades to the heuristic instead of to noise.
 */
@Service
public class TrainingDataService {

    private static final Logger log = LoggerFactory.getLogger(TrainingDataService.class);

    private final EtaPredictionRepository predictions;

    public TrainingDataService(EtaPredictionRepository predictions) {
        this.predictions = predictions;
    }

    @Transactional(readOnly = true)
    public String exportCsv() {
        List<EtaPrediction> scored = predictions.findAllScored();

        StringBuilder csv = new StringBuilder();
        csv.append(String.join(",", EtaFeatures.NAMES))
                .append(",actual_minutes,residual_minutes,model_version,made_at,trip_id\n");

        int written = 0;
        int skipped = 0;

        for (EtaPrediction p : scored) {
            Map<String, Double> features = p.getFeatures();
            if (features == null) {
                // Predicted before the feature column existed. Excluded rather
                // than back-filled: a reconstructed vector is not what the model
                // saw, and quietly mixing the two is how a dataset stops being
                // trustworthy.
                skipped++;
                continue;
            }

            // Minutes from prediction to the arrival that actually happened.
            double actualMinutes = Duration.between(p.getMadeAt(), p.getActualDockInAt())
                    .toSeconds() / 60d;
            double heuristicMinutes = features.getOrDefault("heuristicMinutes", 0d);

            for (String name : EtaFeatures.NAMES) {
                csv.append(features.getOrDefault(name, 0d)).append(',');
            }
            csv.append(round(actualMinutes)).append(',')
                    .append(round(actualMinutes - heuristicMinutes)).append(',')
                    .append(p.getModelVersion()).append(',')
                    .append(p.getMadeAt().toEpochMilli()).append(',')
                    .append(p.getTrip().getId()).append('\n');
            written++;
        }

        log.info("Training export: {} rows written, {} skipped for missing features",
                written, skipped);
        return csv.toString();
    }

    private static double round(double v) {
        return Math.round(v * 100) / 100d;
    }
}
