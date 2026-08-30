package com.drishya.backend.service.eta;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The feature vector a prediction is made from.
 *
 * <p><b>This class is the train/serve contract.</b> The same builder produces
 * these for a live prediction and for every row of the training export, and the
 * order in {@link #NAMES} is written into {@code models/features.json} when a
 * model is trained. The ONNX loader refuses to start if the order it is asked
 * to serve does not match the order the model was fitted on.
 *
 * <p>That refusal is deliberate and it is the point of the whole arrangement. A
 * train/serve feature mismatch throws no exception: the model happily reads
 * remaining-distance out of the slot that held hour-of-day and returns a
 * number, plausible-looking and quietly wrong, for as long as nobody checks. It
 * is the single most common way systems like this fail, and the only reliable
 * defence is to have one implementation of feature construction and to make the
 * order explicit on both sides.
 *
 * <p>Which is also why there is no Python feature engineering in {@code /ml}.
 * The training script reads a CSV this class produced and does no arithmetic on
 * the columns.
 */
public record EtaFeatures(

        /** Metres still to travel along the lane. */
        double remainingDistanceM,

        /** How many lane segments are still ahead, including the current one. */
        double remainingSegments,

        /** Hour of day, 0-23, local to the destination site. */
        double hourOfDay,

        /** 1 for a weekend, 0 for a weekday. */
        double isWeekend,

        /** Distance-weighted mean of the historical speeds on the road ahead. */
        double meanSpeedAheadKmph,

        /**
         * The thinnest sample count behind any segment ahead. Low means the
         * cluster has barely seen this road at this hour, which is exactly when
         * the band should widen.
         */
        double minSamplesAhead,

        /** What this vehicle has actually been doing recently, from its fixes. */
        double observedSpeedKmph,

        /** Minutes since the trip started. */
        double elapsedMinutes,

        /** Predicted minutes queuing in the yard, before a bay is free. */
        double predictedQueueMinutes,

        /** How many observations the queue figure rests on. */
        double dockSamples,

        /** Bays at the destination. A big site absorbs a queue; a small one does not. */
        double dockCount,

        /**
         * What the heuristic alone says, in minutes from now.
         *
         * <p>Carried as a feature because the model is trained to predict the
         * <i>residual</i> of this number rather than the arrival time itself.
         * The model only has to learn where the heuristic is systematically
         * wrong, which is a far smaller thing to learn — it works on a few
         * hundred trips instead of a few hundred thousand, and when it has
         * nothing useful to say it converges on predicting zero correction and
         * degrades to the heuristic rather than to noise.
         */
        double heuristicMinutes) {

    /**
     * Feature order. <b>Append only.</b> Reordering or removing an entry
     * invalidates every model trained before the change; the loader will refuse
     * such a model rather than serve it, which is the intended outcome.
     */
    public static final String[] NAMES = {
            "remainingDistanceM",
            "remainingSegments",
            "hourOfDay",
            "isWeekend",
            "meanSpeedAheadKmph",
            "minSamplesAhead",
            "observedSpeedKmph",
            "elapsedMinutes",
            "predictedQueueMinutes",
            "dockSamples",
            "dockCount",
            "heuristicMinutes",
    };

    /** The vector, in {@link #NAMES} order. */
    public float[] toVector() {
        return new float[]{
                (float) remainingDistanceM,
                (float) remainingSegments,
                (float) hourOfDay,
                (float) isWeekend,
                (float) meanSpeedAheadKmph,
                (float) minSamplesAhead,
                (float) observedSpeedKmph,
                (float) elapsedMinutes,
                (float) predictedQueueMinutes,
                (float) dockSamples,
                (float) dockCount,
                (float) heuristicMinutes,
        };
    }

    /** Named form, for the CSV export and for logging a prediction's inputs. */
    public Map<String, Double> asMap() {
        Map<String, Double> map = new LinkedHashMap<>();
        float[] v = toVector();
        for (int i = 0; i < NAMES.length; i++) {
            map.put(NAMES[i], (double) v[i]);
        }
        return map;
    }

    /** CSV row in {@link #NAMES} order, no label. */
    public String toCsvRow() {
        StringBuilder sb = new StringBuilder();
        float[] v = toVector();
        for (int i = 0; i < v.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(v[i]);
        }
        return sb.toString();
    }
}
