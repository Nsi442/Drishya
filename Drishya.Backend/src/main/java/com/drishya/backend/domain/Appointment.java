package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.AppointmentStatus;
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
 * A vendor's request for a dock window, and the fulfilment centre's answer.
 *
 * <p>Foreign keys are held as plain ids rather than associations: the schedule
 * is queried by dock and time far more often than it is navigated from a
 * shipment, and a booking can exist before its consignment does.
 */
@Entity
@Table(name = "appointments", indexes = {
        @Index(name = "idx_appt_dock_time", columnList = "dock_id, start_at"),
        @Index(name = "idx_appt_fc", columnList = "fc_id")
})
@Getter
@Setter
@NoArgsConstructor
public class Appointment {

    @Id
    private String id;

    /** Null while a vendor is holding a window before booking the consignment. */
    private String shipmentId;

    private String vendorId;

    private String vendorName;

    @jakarta.persistence.Column(name = "fc_id")
    private String fcId;

    private String fcName;

    @jakarta.persistence.Column(name = "dock_id")
    private String dockId;

    @jakarta.persistence.Column(name = "start_at")
    private Instant start;

    @jakarta.persistence.Column(name = "end_at")
    private Instant end;

    @Enumerated(EnumType.STRING)
    private AppointmentStatus status;

    private Instant requestedAt;

    private Instant decidedAt;

    private String decidedBy;

    private String rejectionReason;

    /** Set when the centre offers a different window instead of rejecting. */
    private Instant proposedStart;

    private String vehicleReg;

    private int cartons;

    @jakarta.persistence.Column(length = 1000)
    private String note;

    /** True when this booking overlaps another on the same bay. */
    public boolean overlaps(Instant otherStart, Instant otherEnd) {
        return start.isBefore(otherEnd) && otherStart.isBefore(end);
    }
}
