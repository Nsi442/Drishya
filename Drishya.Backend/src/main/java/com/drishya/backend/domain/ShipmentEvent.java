package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.ShipmentStatus;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One rung of the journey timeline. Append-only: a shipment's history is a
 * record of what happened, so events are never edited or removed.
 */
@Entity
@Table(name = "shipment_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ShipmentEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shipment_id")
    private Shipment shipment;

    @Enumerated(EnumType.STRING)
    private ShipmentStatus stage;

    private String label;

    private String detail;

    private Instant at;

    public ShipmentEvent(ShipmentStatus stage, String label, String detail, Instant at) {
        this.stage = stage;
        this.label = label;
        this.detail = detail;
        this.at = at;
    }
}
