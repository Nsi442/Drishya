package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.AlertSeverity;
import com.drishya.backend.domain.enums.ExceptionStatus;
import com.drishya.backend.domain.enums.ExceptionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * An anomaly raised at the gate or the dock, owned by the fulfilment centre.
 *
 * <p>Named {@code ReceivingException} rather than {@code Exception} so it does
 * not shadow {@link java.lang.Exception} in every file that touches it.
 */
@Entity
@Table(name = "receiving_exceptions", indexes = {
        @Index(name = "idx_exc_fc_status", columnList = "fc_id, status")
})
@Getter
@Setter
@NoArgsConstructor
public class ReceivingException {

    @Id
    private String id;

    @Enumerated(EnumType.STRING)
    private ExceptionType type;

    private String title;

    @Column(length = 1000)
    private String detail;

    @Column(name = "shipment_id")
    private String shipmentId;

    private String vendorId;

    private String vendorName;

    @Column(name = "fc_id")
    private String fcId;

    private String fcName;

    @Enumerated(EnumType.STRING)
    private AlertSeverity severity;

    @Enumerated(EnumType.STRING)
    private ExceptionStatus status;

    /** "Unassigned" until somebody picks it up. */
    private String owner;

    private Instant raisedAt;

    private Instant resolvedAt;

    @Column(length = 1000)
    private String resolutionNote;

    /** Knock-on delay in minutes, for working out which of these actually cost. */
    private int impactMin;
}
