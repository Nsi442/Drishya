package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.DeviceStatus;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A truck, and the health of the tracking device bolted to it. */
@Entity
@Table(name = "vehicles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Vehicle {

    @Id
    private String id;

    private String regNumber;

    private String type;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carrier_id")
    private Carrier carrier;

    @Enumerated(EnumType.STRING)
    private DeviceStatus deviceStatus;

    private int batteryPct;

    private int costPerTrip;

    private int capacityKg;

    /**
     * When the device last reported. A vehicle whose position is stale is the
     * difference between "we know where it is" and "we knew where it was".
     */
    private Instant lastPing;
}
