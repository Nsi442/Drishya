package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.AlertSeverity;
import com.drishya.backend.domain.enums.AlertType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import jakarta.persistence.PrePersist;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Something the platform noticed and thinks a person should know about.
 *
 * <p>Alerts are generated, never authored, so the message is written at the
 * point of detection with the specifics already interpolated — a reader should
 * not have to open the shipment to understand what happened.
 */
@Entity
@Table(name = "alerts", indexes = {
        @Index(name = "idx_alert_raised", columnList = "raised_at"),
        @Index(name = "idx_alert_shipment", columnList = "shipment_id")
})
@Getter
@Setter
@NoArgsConstructor
public class Alert {

    @Id
    private String id;

    @Enumerated(EnumType.STRING)
    private AlertType type;

    @Enumerated(EnumType.STRING)
    private AlertSeverity severity;

    private String title;

    @Column(length = 1000)
    private String message;

    @Column(name = "shipment_id")
    private String shipmentId;

    private String vendorId;

    @Column(name = "fc_id")
    private String fcId;

    @Column(name = "raised_at")
    private Instant at;

    /** {@code read} is reserved in several databases, so the column is renamed. */
    @Column(name = "is_read")
    private boolean read;

    private boolean acknowledged;

    /** Who took it on. An alert nobody owns does not get closed. */
    private String acknowledgedBy;

    @PrePersist
    void defaultRaisedAt() {
        if (at == null) {
            at = Instant.now();
        }
    }
}
