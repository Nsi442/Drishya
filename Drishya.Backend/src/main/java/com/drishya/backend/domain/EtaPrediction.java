package com.drishya.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One prediction, kept forever so it can be scored against what happened.
 *
 * <p><b>Every prediction is written, including the ones that turn out wrong.</b>
 * A system that only stores its current estimate can never answer "how good is
 * this?", and an accuracy claim nobody can reproduce is worth nothing in a
 * review. Once the trip docks, the actual time is written back onto the rows
 * that predicted it and the error becomes measurable — which is what
 * GET /api/v1/metrics/eta-accuracy reports.
 *
 * <p><b>A band, not a number.</b> A dispatcher deciding whether to rebook a
 * slot needs the worst case, not the midpoint: "16:40, and it could be 17:25"
 * supports a decision in a way that a bare "16:40" does not. The three
 * timestamps come from quantile models at 0.1, 0.5 and 0.9, or from the
 * heuristic widened by how thin the underlying history is.
 *
 * <p>The target is dock-in, never gate arrival. See DockTurnaroundHistory.
 */
@Entity
@Table(name = "eta_predictions", indexes = {
        @Index(name = "idx_eta_trip_made", columnList = "trip_id, made_at"),
        @Index(name = "idx_eta_scoring", columnList = "actual_dock_in_at")
})
@Getter
@Setter
@NoArgsConstructor
public class EtaPrediction {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_id")
    private Trip trip;

    /** The estimate. Median of the band. */
    @Column(name = "predicted_dock_in_at", nullable = false)
    private Instant predictedDockInAt;

    /** Optimistic edge, quantile 0.1. */
    @Column(name = "confidence_low_at")
    private Instant confidenceLowAt;

    /** Pessimistic edge, quantile 0.9. What a rebooking decision hangs on. */
    @Column(name = "confidence_high_at")
    private Instant confidenceHighAt;

    /**
     * Which engine produced this, e.g. heuristic-v1 or lgbm-2026-08-24. Without
     * it, a jump in accuracy cannot be attributed to a model change rather than
     * to an easier week of traffic.
     */
    @Column(name = "model_version", nullable = false)
    private String modelVersion;

    @Column(name = "made_at", nullable = false)
    private Instant madeAt;

    /** How far the vehicle still had to go when this was made. */
    @Column(name = "remaining_distance_m")
    private Double remainingDistanceM;

    /** The queue component, separated so the two halves can be scored apart. */
    @Column(name = "predicted_queue_minutes")
    private Double predictedQueueMinutes;

    /**
     * The feature vector this prediction was made from, exactly as it stood.
     *
     * <p>Stored rather than recomputed so the training export is a replay. A
     * vector rebuilt from today's history would already contain this trip's own
     * contribution to the lane average, and every trip that has run since —
     * leakage that produces a model looking excellent in backtest and ordinary
     * in production.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Double> features;

    /** Written back once the trip actually docks. Null until then. */
    @Column(name = "actual_dock_in_at")
    private Instant actualDockInAt;

    /** Signed error in minutes: positive means the prediction was optimistic. */
    @Column(name = "error_minutes")
    private Double errorMinutes;

    /** Scores this prediction against the truth. Called when the trip docks. */
    public void score(Instant actual) {
        this.actualDockInAt = actual;
        this.errorMinutes = (double) Duration.between(predictedDockInAt, actual).toMinutes();
    }

    /** True once this row can contribute to the accuracy report. */
    public boolean isScored() {
        return actualDockInAt != null && errorMinutes != null;
    }
}
