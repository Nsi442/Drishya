package com.drishya.backend.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

/**
 * A named origin-to-fulfilment-centre corridor, split into ordered segments.
 *
 * <p><b>This is where the cluster pays off.</b> A lane belongs to no tenant. If
 * six vendors in Bhiwandi all run into the same fulfilment centre, they are on
 * one lane, and every trip any of them makes teaches the platform something
 * about how that road behaves at that hour. A single-vendor tracker sees only
 * its own handful of runs on the same stretch and cannot get to a usable mean.
 *
 * <p>Consignment data stays strictly per tenant. What is pooled is only how
 * long the road took — which reveals nothing about who was carrying what.
 */
@Entity
@Table(name = "lanes", indexes = {
        @Index(name = "idx_lane_fc", columnList = "fc_id")
})
@Getter
@Setter
@NoArgsConstructor
public class Lane {

    @Id
    private String id;

    /** Short readable handle, e.g. BHW-FCB. Used in the per-lane MAE report. */
    @Column(unique = true)
    private String code;

    @Column(name = "origin_name")
    private String originName;

    @JdbcTypeCode(SqlTypes.GEOGRAPHY)
    @Column(name = "origin_point", columnDefinition = "geography(Point,4326)")
    private Point originPoint;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fc_id")
    private FulfilmentCentre fulfilmentCentre;

    @Column(name = "distance_km")
    private double distanceKm;

    @OneToMany(mappedBy = "lane", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("seq ASC")
    private List<LaneSegment> segments = new ArrayList<>();

    public void addSegment(LaneSegment segment) {
        segment.setLane(this);
        segments.add(segment);
    }
}
