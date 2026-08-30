package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.PositionSource;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

/**
 * One position fix. The highest-volume table in the system by a wide margin.
 *
 * <p>Two timestamps, deliberately. The device timestamp is when the fix was
 * taken; the received timestamp is when this server got it. They are not the
 * same, and the gap between them is the point — a vehicle coming out of a dead
 * zone buffers its fixes and delivers them in a burst, so ordering by arrival
 * would replay the route out of sequence. Anything reconstructing a journey
 * orders by device time; anything asking what we knew and when reads the
 * received time. The server stamps the latter itself and never trusts a client
 * for it.
 *
 * <p>The source column records whether this came from the simulator or a real
 * browser. See PositionSource for why that distinction is load-bearing.
 */
@Entity
@Table(name = "positions", indexes = {
        // The access pattern is almost always "this trip, in time order" —
        // replaying a route, finding the last known point, measuring a segment.
        @Index(name = "idx_position_trip_time", columnList = "trip_id, device_timestamp")
})
@Getter
@Setter
@NoArgsConstructor
public class Position {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_id")
    private Trip trip;

    /**
     * geography, not geometry: distances come back in metres over a spheroid
     * without anyone having to choose a projection. The geofence check is an
     * ST_DWithin against this column with a GiST index behind it.
     */
    @JdbcTypeCode(SqlTypes.GEOGRAPHY)
    @Column(name = "location", columnDefinition = "geography(Point,4326)", nullable = false)
    private Point location;

    @Column(name = "speed_kmph")
    private Double speedKmph;

    @Column(name = "heading_deg")
    private Double headingDeg;

    /** When the fix was taken, according to the device. */
    @Column(name = "device_timestamp", nullable = false)
    private Instant deviceTimestamp;

    /** When this server received it. Stamped server-side, never by the client. */
    @Column(name = "received_at", nullable = false)
    private Instant receivedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PositionSource source;

    /** Convenience for DTO mapping. Geometries do not leave the entity layer. */
    public double getLat() {
        return Geo.lat(location);
    }

    public double getLon() {
        return Geo.lon(location);
    }

    /** How far behind the fix was when it landed. Large means a dead zone. */
    public long latencySeconds() {
        if (deviceTimestamp == null || receivedAt == null) {
            return 0;
        }
        return Duration.between(deviceTimestamp, receivedAt).toSeconds();
    }
}
