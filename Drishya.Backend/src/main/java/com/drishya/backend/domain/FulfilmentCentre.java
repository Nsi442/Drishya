package com.drishya.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A marketplace fulfilment centre receiving inbound goods.
 *
 * <p>Deliberately generic — no real marketplace is ever named, here or in any
 * response this API produces.
 */
@Entity
@Table(name = "fulfilment_centres")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class FulfilmentCentre {

    @Id
    private String id;

    private String name;

    private String city;

    /**
     * The site centroid, as plain lat/lng. Kept for the map pin and for the
     * existing DTOs, which predate PostGIS being in the project.
     */
    @Embedded
    private GeoPoint location;

    /**
     * Where the vehicles actually stop — the receiving bays, not the centroid.
     *
     * <p>These differ by a few hundred metres on a large site, and the geofence
     * is drawn around this rather than around the address. A fence centred on
     * the site centroid fires GATE_IN while the vehicle is still on the
     * approach road, which produces a gate timestamp that is wrong in exactly
     * the direction that loses a chargeback dispute.
     */
    @JdbcTypeCode(SqlTypes.GEOGRAPHY)
    @Column(name = "dock_location", columnDefinition = "geography(Point,4326)")
    private Point dockLocation;

    /**
     * Radius of the arrival geofence in metres. Per site, because a compact
     * urban yard and a highway-side warehouse need different fences: too tight
     * and a GPS fix scattered by a metal roof never triggers, too loose and the
     * vehicle gates in from the road outside.
     */
    @Column(name = "geofence_radius_m", nullable = false)
    private int geofenceRadiusM = 200;

    /** How many bays the site has; docks are generated from this. */
    private int dockCount;

    /** Operating window, as hours of the day. Slots cannot be booked outside it. */
    private int openingHour;

    private int closingHour;
}
