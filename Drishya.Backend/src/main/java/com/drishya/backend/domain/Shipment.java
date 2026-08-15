package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.Priority;
import com.drishya.backend.domain.enums.ShipmentStatus;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.AttributeOverrides;
import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The object all three parties share. A vendor books it, a driver carries it, a
 * fulfilment centre receives it — each sees the same record with different
 * permissions over it.
 *
 * <p>Two arrival times are kept deliberately. {@code promisedAt} is what was
 * agreed at booking and never moves; {@code predictedAt} is what the platform
 * now believes. The gap between them is the entire point of the product, so
 * neither is allowed to overwrite the other.
 */
@Entity
@Table(name = "shipments")
@Getter
@Setter
@NoArgsConstructor
public class Shipment {

    @Id
    private String id;

    /** The vendor's own purchase-order or dispatch reference. */
    private String reference;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "vendor_id")
    private Vendor vendor;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fc_id")
    private FulfilmentCentre fulfilmentCentre;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vehicle_id")
    private Vehicle vehicle;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "driver_id")
    private Driver driver;

    @Enumerated(EnumType.STRING)
    private ShipmentStatus status;

    @Enumerated(EnumType.STRING)
    private Priority priority;

    // --- geography -------------------------------------------------------

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "lat", column = @Column(name = "origin_lat")),
            @AttributeOverride(name = "lng", column = @Column(name = "origin_lng")),
            @AttributeOverride(name = "name", column = @Column(name = "origin_name"))
    })
    private Place origin;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "lat", column = @Column(name = "dest_lat")),
            @AttributeOverride(name = "lng", column = @Column(name = "dest_lng")),
            @AttributeOverride(name = "name", column = @Column(name = "dest_name"))
    })
    private Place destination;

    /** The planned polyline. Order is significant, hence the order column. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "shipment_route", joinColumns = @JoinColumn(name = "shipment_id"))
    @OrderColumn(name = "leg_index")
    private List<GeoPoint> route = new ArrayList<>();

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "lat", column = @Column(name = "pos_lat")),
            @AttributeOverride(name = "lng", column = @Column(name = "pos_lng"))
    })
    private GeoPoint position;

    /** How far along the polyline the vehicle is, 0..1. */
    private double progress;

    private int distanceKm;

    private int remainingKm;

    private int speedKmph;

    // --- times -----------------------------------------------------------

    private Instant bookedAt;

    private Instant pickupAt;

    /** Agreed at booking. Never recalculated. */
    private Instant promisedAt;

    /** What the platform currently believes. Recalculated as the vehicle moves. */
    private Instant predictedAt;

    private Instant deliveredAt;

    private Instant gateInAt;

    private Instant gateOutAt;

    private Instant slotStart;

    private Instant slotEnd;

    private Instant updatedAt;

    /** Minutes between promised and predicted. Negative means early. */
    private int delayMin;

    private String delayReason;

    // --- consignment -----------------------------------------------------

    private String commodity;

    private int cartons;

    private int weightKg;

    private long valueInr;

    private String sealNumber;

    private String invoiceNo;

    private String ewayBillNo;

    private boolean temperatureControlled;

    private String dockId;

    private String cancelledReason;

    // --- children --------------------------------------------------------

    @OneToMany(mappedBy = "shipment", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("at ASC")
    private List<ShipmentEvent> events = new ArrayList<>();

    @OneToMany(mappedBy = "shipment", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<ShipmentDocument> documents = new ArrayList<>();

    @OneToMany(mappedBy = "shipment", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("recordedAt ASC")
    private List<SensorReading> sensorReadings = new ArrayList<>();

    @Embedded
    private ProofOfDelivery pod;

    @Embedded
    private GoodsReceipt grn;

    // --- helpers ---------------------------------------------------------

    public void addEvent(ShipmentEvent event) {
        event.setShipment(this);
        events.add(event);
    }

    public void addDocument(ShipmentDocument document) {
        document.setShipment(this);
        documents.add(document);
    }

    public void addSensorReading(SensorReading reading) {
        reading.setShipment(this);
        sensorReadings.add(reading);
    }

    /** True while the consignment is somewhere between booked and delivered. */
    public boolean isActive() {
        return status != ShipmentStatus.DELIVERED && status != ShipmentStatus.CANCELLED;
    }

    /** True once the vehicle is on the road and not yet at the gate. */
    public boolean isMoving() {
        return status == ShipmentStatus.PICKED_UP || status == ShipmentStatus.IN_TRANSIT;
    }
}
