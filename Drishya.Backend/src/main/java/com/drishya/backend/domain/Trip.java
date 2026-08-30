package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.TripStatus;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One attempt at a shipment.
 *
 * <p>A shipment refused at the gate and sent back produces a second trip
 * against the same shipment. Keeping them separate is what lets the platform
 * say "this consignment took three attempts" — and it means a failed run still
 * contributes its lane speeds to the shared history, because the road told us
 * how long it took whether or not the delivery was accepted.
 *
 * <p>The tenant is denormalised from the shipment on purpose. Position ingest
 * and the ETA scheduler both filter by tenant on every call, and forcing a join
 * through shipments to answer "is this trip yours" put the isolation check one
 * join away from the query that needed it. It is set once at creation and never
 * changes.
 */
@Entity
@Table(name = "trips", indexes = {
        @Index(name = "idx_trip_tenant", columnList = "tenant_id"),
        @Index(name = "idx_trip_shipment", columnList = "shipment_id"),
        @Index(name = "idx_trip_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
public class Trip {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shipment_id")
    private Shipment shipment;

    /** Denormalised from the shipment so tenant filtering needs no join. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tenant_id")
    private Vendor tenant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lane_id")
    private Lane lane;

    @Column(name = "vehicle_registration")
    private String vehicleRegistration;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "driver_id")
    private Driver driver;

    @Enumerated(EnumType.STRING)
    private TripStatus status = TripStatus.PLANNED;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    /**
     * Which geofence zone the last processed position fell in. The geofence
     * listener compares against this and writes an event only on a change —
     * without it, a vehicle parked inside the fence emits a GATE_IN per point.
     */
    @Column(name = "last_zone")
    private String lastZone;

    /** Set when the vehicle first crosses into the fulfilment centre geofence. */
    @Column(name = "gate_in_at")
    private Instant gateInAt;

    /** Set on arrival at a bay. This is what the ETA engine actually predicts. */
    @Column(name = "dock_in_at")
    private Instant dockInAt;

    @Column(name = "dock_out_at")
    private Instant dockOutAt;

    @OneToMany(mappedBy = "trip", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("at ASC")
    private List<TripEvent> events = new ArrayList<>();

    public void addEvent(TripEvent event) {
        event.setTrip(this);
        events.add(event);
    }

    public boolean isActive() {
        return status == TripStatus.ACTIVE;
    }

    /** Minutes the vehicle spent at the bay, or null while it is still there. */
    public Long turnaroundMinutes() {
        if (dockInAt == null || dockOutAt == null) {
            return null;
        }
        return Duration.between(dockInAt, dockOutAt).toMinutes();
    }
}
