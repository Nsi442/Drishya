package com.drishya.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.LineString;

/**
 * One ordered stretch of a lane.
 *
 * <p>Segmenting is what makes the ETA additive: remaining time is the sum over
 * the segments still ahead, each divided by what that specific stretch is
 * currently running at. A single average for the whole corridor would smear the
 * congested last five kilometres into the open highway before it and predict
 * an arrival that is wrong in both directions depending on where the vehicle
 * happens to be.
 *
 * <p>Segments are cut so that each is roughly homogeneous — a highway run, an
 * urban approach, the final industrial-estate crawl — rather than at a fixed
 * distance.
 */
@Entity
@Table(name = "lane_segments", indexes = {
        @Index(name = "idx_segment_lane_seq", columnList = "lane_id, seq")
})
@Getter
@Setter
@NoArgsConstructor
public class LaneSegment {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lane_id")
    private Lane lane;

    /** Position along the lane, 0-based, origin first. */
    @Column(nullable = false)
    private int seq;

    private String name;

    @JdbcTypeCode(SqlTypes.GEOGRAPHY)
    @Column(name = "geometry", columnDefinition = "geography(LineString,4326)", nullable = false)
    private LineString geometry;

    /**
     * Cached length in metres. PostGIS could compute it with ST_Length on every
     * read, but this is fixed the moment the segment is drawn and the ETA loop
     * reads it once per segment per active trip per minute.
     */
    @Column(name = "length_m", nullable = false)
    private double lengthM;

    /**
     * Speed to fall back on when the shared history has no sample for this
     * segment at this hour. A new lane has to predict something on its first
     * trip, and the honest answer is a posted-limit guess, flagged low
     * confidence, rather than no ETA at all.
     */
    @Column(name = "default_speed_kmph", nullable = false)
    private double defaultSpeedKmph = 40;
}
