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
 * How long a fulfilment centre actually takes to turn a vehicle around, by hour
 * and day type.
 *
 * <p><b>Also shared across every tenant, and also deliberately so.</b> Queue
 * depth at a dock is a property of the dock, not of whoever is queuing. Every
 * vendor waiting in the same yard is observing the same thing, and pooling
 * those observations is what makes the number usable.
 *
 * <p>This is the half of the ETA that a route planner cannot give you. Anyone
 * can estimate driving time to a postcode; the reason a delivery misses its
 * slot is usually the ninety minutes spent inside the gate afterwards. That is
 * why the platform predicts dock-in rather than gate-arrival, and this table is
 * what makes the difference computable.
 */
@Entity
@Table(name = "dock_turnaround_history",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_fc_hour_day",
                columnNames = {"fc_id", "hour_bucket", "day_type"}))
@Getter
@Setter
@NoArgsConstructor
public class DockTurnaroundHistory {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fc_id")
    private FulfilmentCentre fulfilmentCentre;

    /** Hour of the day, 0-23, local to the site. */
    @Column(name = "hour_bucket", nullable = false)
    private int hourBucket;

    @Enumerated(EnumType.STRING)
    @Column(name = "day_type", nullable = false)
    private DayType dayType;

    @Column(name = "sample_count", nullable = false)
    private int sampleCount;

    /** Gate-in to dock-in: the queue, not the unloading. */
    @Column(name = "mean_queue_minutes", nullable = false)
    private double meanQueueMinutes;

    /** Dock-in to dock-out: the unloading itself. */
    @Column(name = "mean_turnaround_minutes", nullable = false)
    private double meanTurnaroundMinutes;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public boolean isReliable() {
        return sampleCount >= 5;
    }
}
