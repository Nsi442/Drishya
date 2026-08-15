package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.SensorKind;
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
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One telemetry sample. Temperature, humidity and shock are continuous series;
 * door events are discrete and carry the two extra fields below, which is why
 * they share a table rather than getting one each.
 */
@Entity
@Table(name = "sensor_readings", indexes = @Index(name = "idx_reading_shipment", columnList = "shipment_id, kind"))
@Getter
@Setter
@NoArgsConstructor
public class SensorReading {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shipment_id")
    private Shipment shipment;

    @Enumerated(EnumType.STRING)
    private SensorKind kind;

    private Instant recordedAt;

    /**
     * Mapped explicitly: {@code value} is a reserved word in H2 and several
     * other databases, and generates a schema that will not parse.
     */
    @Column(name = "reading_value", nullable = false)
    private double value;

    /** Door events only: how long it stayed open. */
    private Integer durationMin;

    /**
     * Door events only. An opening at a planned stop is routine; one in the
     * middle of a leg is the thing worth waking someone up for.
     */
    private Boolean scheduled;

    public SensorReading(SensorKind kind, Instant recordedAt, double value) {
        this.kind = kind;
        this.recordedAt = recordedAt;
        this.value = value;
    }
}
