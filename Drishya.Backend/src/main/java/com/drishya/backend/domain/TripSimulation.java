package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.SimulationStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A vehicle the server is driving along a trip's route.
 *
 * <p>This is the deployed-environment counterpart to
 * {@code simulator/simulate.py}: same job, same {@code SIMULATED} provenance on
 * every fix it produces, but triggered from the browser and run by the
 * application rather than by somebody's laptop. It exists because the script
 * needs a terminal, and the whole point of a hosted demo is that it does not.
 *
 * <p><b>It walks the shipment's own route, not a GeoJSON file.</b>
 * {@code Shipment.route} is built at booking time by {@code GeoUtil.buildRoute}
 * between the vendor and the fulfilment centre, so every shipment has a
 * polyline whatever lane it was booked on. The Python simulator ships two route
 * files and silently walks the wrong geometry for any other lane; this cannot,
 * because the route belongs to the consignment being simulated.
 */
@Entity
@Table(name = "trip_simulations", indexes = {
        @Index(name = "idx_trip_sim_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
public class TripSimulation {

    /**
     * The trip's own id, shared rather than generated.
     *
     * <p>{@code @MapsId} makes the primary key and the foreign key the same
     * column, which is what makes "at most one simulation per trip" a database
     * guarantee. A second Start trip click races the first and loses on the
     * primary key rather than producing a second vehicle on one polyline.
     */
    @Id
    private String tripId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_id")
    private Trip trip;

    /** Denormalised from the trip so the tenant filter needs no join. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tenant_id")
    private Vendor tenant;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SimulationStatus status = SimulationStatus.RUNNING;

    @Column(name = "travelled_km", nullable = false)
    private double travelledKm;

    @Column(name = "route_km", nullable = false)
    private double routeKm;

    @Column(name = "speed_kmph", nullable = false)
    private double speedKmph;

    /** Simulated seconds per real second. */
    @Column(name = "time_scale", nullable = false)
    private double timeScale;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    /**
     * When the tick last advanced this vehicle.
     *
     * <p>The next tick advances by the real time since this instant rather than
     * by a fixed step, so a tick that is late — a slow query, a garbage
     * collection, a platform spin-down and wake — costs the vehicle no ground.
     * A fixed step would let a simulation drift permanently behind wall-clock
     * and quietly report a lorry as slower than the speed it was given.
     */
    @Column(name = "last_tick_at", nullable = false)
    private Instant lastTickAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    public boolean isRunning() {
        return status == SimulationStatus.RUNNING;
    }

    /** 0..1 along the route. Derived, because the tick works in kilometres. */
    public double progress() {
        if (routeKm <= 0) {
            return 0;
        }
        return Math.min(1, travelledKm / routeKm);
    }
}
