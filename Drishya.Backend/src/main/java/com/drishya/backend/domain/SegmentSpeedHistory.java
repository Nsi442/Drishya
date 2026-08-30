package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.DayType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * How fast one lane segment actually runs, by hour of day and day type.
 *
 * <p><b>Shared across every tenant. This table is deliberately not
 * tenant-scoped, and that is the product.</b> Vendor A's Tuesday 07:00 run
 * improves the ETA Vendor B gets on the same stretch at 07:00 next Tuesday.
 * Accuracy therefore improves as the cluster grows, which is a property no
 * single-vendor tracker can reproduce no matter how good its model is — it
 * simply has fewer observations of the same road.
 *
 * <p>Nothing identifying crosses the boundary. A row holds a mean, a sample
 * count and a time bucket. It cannot be traced back to a vendor, a consignment
 * or a vehicle, which is what makes pooling it defensible.
 *
 * <p>Rebuilt nightly from completed trips rather than updated per position:
 * a running average over live data lets one stuck vehicle drag the mean for
 * everybody until it moves.
 */
@Entity
@Table(name = "segment_speed_history",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_segment_hour_day",
                columnNames = {"segment_id", "hour_bucket", "day_type"}))
@Getter
@Setter
@NoArgsConstructor
public class SegmentSpeedHistory {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "segment_id")
    private LaneSegment segment;

    /** Hour of the day, 0-23, in the fulfilment centre's local time. */
    @Column(name = "hour_bucket", nullable = false)
    private int hourBucket;

    @Enumerated(EnumType.STRING)
    @Column(name = "day_type", nullable = false)
    private DayType dayType;

    /**
     * How many trips contributed. Exposed rather than hidden because it is what
     * separates a mean worth trusting from one built on two runs, and the
     * confidence band widens when this is small.
     */
    @Column(name = "sample_count", nullable = false)
    private int sampleCount;

    @Column(name = "mean_speed_kmph", nullable = false)
    private double meanSpeedKmph;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Below this, the mean is a hint rather than a measurement. */
    public boolean isReliable() {
        return sampleCount >= 5;
    }
}
