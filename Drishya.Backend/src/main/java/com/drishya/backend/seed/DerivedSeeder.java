package com.drishya.backend.seed;

import com.drishya.backend.domain.Alert;
import com.drishya.backend.domain.Appointment;
import com.drishya.backend.domain.ReceivingException;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.enums.AlertSeverity;
import com.drishya.backend.domain.enums.AlertType;
import com.drishya.backend.domain.enums.AppointmentStatus;
import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.ExceptionStatus;
import com.drishya.backend.domain.enums.ExceptionType;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.repo.AlertRepository;
import com.drishya.backend.repo.AppointmentRepository;
import com.drishya.backend.repo.ReceivingExceptionRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Alerts, appointments and exceptions, all generated from the shipments rather
 * than invented alongside them.
 *
 * <p>This is the point: a "delay predicted" alert must point at a shipment that
 * is genuinely late, and an exception must not contradict the record it names.
 * Generating them independently produces a demo that falls apart the moment
 * anyone clicks through from the feed to the consignment.
 */
@Component
public class DerivedSeeder {

    private static final long ALERT_SEED = 90210L;
    private static final long APPOINTMENT_SEED = 551122L;
    private static final long EXCEPTION_SEED = 447788L;

    private final AlertRepository alerts;
    private final AppointmentRepository appointments;
    private final ReceivingExceptionRepository exceptions;

    public DerivedSeeder(AlertRepository alerts, AppointmentRepository appointments,
                         ReceivingExceptionRepository exceptions) {
        this.alerts = alerts;
        this.appointments = appointments;
        this.exceptions = exceptions;
    }

    public void seed(List<Shipment> shipments, Instant now) {
        seedAlerts(shipments, now);
        seedAppointments(shipments, now);
        seedExceptions(shipments, now);
    }

    // --- alerts ----------------------------------------------------------

    private void seedAlerts(List<Shipment> shipments, Instant now) {
        Rng rng = new Rng(ALERT_SEED);
        List<Shipment> active = shipments.stream()
                .filter(s -> s.getStatus() != ShipmentStatus.CANCELLED)
                .toList();
        List<Alert> batch = new ArrayList<>();

        // Every meaningfully late shipment gets one — no exceptions, or the feed
        // and the at-risk list would disagree about what is going wrong.
        for (Shipment s : active) {
            if (s.getDelayMin() > 30 && s.getStatus() != ShipmentStatus.DELIVERED) {
                batch.add(alert(batch.size(), AlertType.DELAY,
                        s.getDelayMin() > 90 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
                        "Delay predicted",
                        "%s is running %d min behind the promised slot at %s. %s".formatted(
                                s.getId(), s.getDelayMin(), s.getFulfilmentCentre().getName(),
                                s.getDelayReason() == null ? "" : s.getDelayReason()).trim(),
                        s, now.minus(rng.nextInt(4, 300), ChronoUnit.MINUTES), rng.chance(0.35)));
            }
        }

        // A failed document is the other thing that reliably costs a slot.
        for (Shipment s : active) {
            if (s.getStatus() == ShipmentStatus.DELIVERED) {
                continue;
            }
            boolean bad = s.getDocuments().stream()
                    .anyMatch(d -> d.getStatus() == DocumentStatus.MISMATCH
                            || d.getStatus() == DocumentStatus.EXPIRING);
            if (bad && rng.chance(0.7)) {
                boolean mismatch = s.getDocuments().stream()
                        .anyMatch(d -> d.getStatus() == DocumentStatus.MISMATCH);
                batch.add(alert(batch.size(), AlertType.DOCUMENT,
                        mismatch ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
                        "Document issue",
                        "E-way bill for %s expires before the booked dock slot. Re-issue before gate-in."
                                .formatted(s.getId()),
                        s, now.minus(rng.nextInt(10, 600), ChronoUnit.MINUTES), rng.chance(0.4)));
            }
        }

        // A scatter of operational noise across the rest.
        AlertType[] scatter = {AlertType.DOOR_OPEN, AlertType.SHOCK, AlertType.ROUTE_DEVIATION,
                AlertType.DEVICE_OFFLINE, AlertType.SLOT_CHANGE, AlertType.ARRIVAL, AlertType.DETENTION};
        for (int i = 0; i < 26 && !active.isEmpty(); i++) {
            Shipment s = rng.pick(active);
            AlertType type = rng.pick(scatter);
            Alert a = alert(batch.size(), type, severityFor(type), titleFor(type),
                    messageFor(type, s), s, now.minus(rng.nextInt(5, 2600), ChronoUnit.MINUTES),
                    rng.chance(0.5));
            if (rng.chance(0.2)) {
                a.setAcknowledged(true);
                a.setAcknowledgedBy("Priya Raghavan");
            }
            batch.add(a);
        }

        alerts.saveAll(batch);
    }

    private Alert alert(int index, AlertType type, AlertSeverity severity, String title, String message,
                        Shipment s, Instant at, boolean read) {
        Alert a = new Alert();
        a.setId("ALT-" + (1000 + index));
        a.setType(type);
        a.setSeverity(severity);
        a.setTitle(title);
        a.setMessage(message);
        a.setShipmentId(s.getId());
        a.setVendorId(s.getVendor().getId());
        a.setFcId(s.getFulfilmentCentre().getId());
        a.setAt(at);
        a.setRead(read);
        return a;
    }

    private AlertSeverity severityFor(AlertType type) {
        return switch (type) {
            case DOOR_OPEN, TEMPERATURE, DOCUMENT -> AlertSeverity.CRITICAL;
            case SLOT_CHANGE, ARRIVAL -> AlertSeverity.INFO;
            default -> AlertSeverity.WARNING;
        };
    }

    private String titleFor(AlertType type) {
        return switch (type) {
            case DELAY -> "Delay predicted";
            case DOOR_OPEN -> "Unscheduled door open";
            case TEMPERATURE -> "Temperature breach";
            case SHOCK -> "Shock event";
            case DOCUMENT -> "Document issue";
            case DETENTION -> "Detention threshold";
            case ROUTE_DEVIATION -> "Route deviation";
            case DEVICE_OFFLINE -> "Tracking device offline";
            case SLOT_CHANGE -> "Dock slot changed";
            case ARRIVAL -> "Arrival update";
        };
    }

    private String messageFor(AlertType type, Shipment s) {
        String vehicle = s.getVehicle() == null ? "the vehicle" : s.getVehicle().getRegNumber();
        String fc = s.getFulfilmentCentre().getName();
        return switch (type) {
            case DOOR_OPEN -> "Unscheduled door open detected on %s while in transit to %s."
                    .formatted(vehicle, fc);
            case SHOCK -> "Shock of 2.4 g recorded on %s — inspect cartons at receiving.".formatted(vehicle);
            case DETENTION -> "%s has been on site at %s for over 45 minutes.".formatted(vehicle, fc);
            case ROUTE_DEVIATION -> "%s left the planned lane by more than 12 km.".formatted(vehicle);
            case DEVICE_OFFLINE -> "Tracking device on %s has not reported for 38 minutes.".formatted(vehicle);
            case SLOT_CHANGE -> "%s moved the dock slot for %s by 90 minutes.".formatted(fc, s.getId());
            case ARRIVAL -> "%s has arrived at the %s gate and is awaiting a dock.".formatted(s.getId(), fc);
            case TEMPERATURE -> "Cargo bay temperature on %s rose above the agreed ceiling.".formatted(vehicle);
            default -> "Update on %s.".formatted(s.getId());
        };
    }

    // --- appointments ----------------------------------------------------

    private void seedAppointments(List<Shipment> shipments, Instant now) {
        Rng rng = new Rng(APPOINTMENT_SEED);
        List<Appointment> batch = new ArrayList<>();
        int index = 0;

        for (Shipment s : shipments) {
            if (s.getStatus() == ShipmentStatus.CANCELLED) {
                continue;
            }
            boolean past = s.getSlotStart().isBefore(now);
            AppointmentStatus status;
            if (s.getStatus() == ShipmentStatus.DELIVERED) {
                status = AppointmentStatus.COMPLETED;
            } else if (past) {
                status = AppointmentStatus.CONFIRMED;
            } else {
                double r = rng.next();
                status = r < 0.55 ? AppointmentStatus.CONFIRMED
                        : r < 0.82 ? AppointmentStatus.REQUESTED
                        : r < 0.92 ? AppointmentStatus.ALTERNATIVE
                        : AppointmentStatus.REJECTED;
            }

            Appointment a = new Appointment();
            a.setId("APT-" + (5000 + index++));
            a.setShipmentId(s.getId());
            a.setVendorId(s.getVendor().getId());
            a.setVendorName(s.getVendor().getName());
            a.setFcId(s.getFulfilmentCentre().getId());
            a.setFcName(s.getFulfilmentCentre().getName());
            a.setDockId(s.getDockId() != null ? s.getDockId()
                    : s.getFulfilmentCentre().getId() + "-dock-" + rng.nextInt(1, 6));
            a.setStart(s.getSlotStart());
            a.setEnd(s.getSlotEnd());
            a.setStatus(status);
            a.setRequestedAt(s.getBookedAt().plus(rng.nextInt(1, 8), ChronoUnit.HOURS));
            a.setDecidedAt(status == AppointmentStatus.REQUESTED
                    ? null : s.getBookedAt().plus(rng.nextInt(9, 30), ChronoUnit.HOURS));
            a.setDecidedBy(status == AppointmentStatus.REQUESTED ? null : "FC scheduling desk");
            a.setRejectionReason(status == AppointmentStatus.REJECTED
                    ? rng.pick(List.of("Dock at capacity for that window", "Outside operating hours",
                    "Clashing container booking")) : null);
            a.setProposedStart(status == AppointmentStatus.ALTERNATIVE
                    ? s.getSlotStart().plus(rng.nextInt(2, 6), ChronoUnit.HOURS) : null);
            a.setVehicleReg(s.getVehicle() == null ? "—" : s.getVehicle().getRegNumber());
            a.setCartons(s.getCartons());
            a.setNote(rng.chance(0.2)
                    ? "Tail-lift required — no forklift access on this vehicle" : null);
            batch.add(a);
        }

        appointments.saveAll(batch);
    }

    // --- exceptions ------------------------------------------------------

    private void seedExceptions(List<Shipment> shipments, Instant now) {
        Rng rng = new Rng(EXCEPTION_SEED);
        List<Shipment> candidates = shipments.stream()
                .filter(s -> s.getStatus() != ShipmentStatus.BOOKED
                        && s.getStatus() != ShipmentStatus.CANCELLED)
                .toList();
        if (candidates.isEmpty()) {
            return;
        }

        List<ReceivingException> batch = new ArrayList<>();
        for (int i = 0; i < 34; i++) {
            Shipment s = candidates.get(i % candidates.size());

            // Bias the type toward what the shipment actually did, so an
            // exception is never contradicted by the record it points at.
            ExceptionType type;
            boolean hasMismatch = s.getDocuments().stream()
                    .anyMatch(d -> d.getStatus() == DocumentStatus.MISMATCH);
            if (s.getDelayMin() > 60 && rng.chance(0.5)) {
                type = ExceptionType.LATE_ARRIVAL;
            } else if (hasMismatch && rng.chance(0.5)) {
                type = ExceptionType.DOCUMENT_MISMATCH;
            } else {
                type = rng.pick(ExceptionType.values());
            }

            double r = rng.next();
            ExceptionStatus status = r < 0.34 ? ExceptionStatus.OPEN
                    : r < 0.58 ? ExceptionStatus.INVESTIGATING
                    : ExceptionStatus.RESOLVED;

            Instant raisedAt = now.minus(rng.nextInt(20, 9000), ChronoUnit.MINUTES);

            ReceivingException e = new ReceivingException();
            e.setId("EXC-" + (3000 + i));
            e.setType(type);
            e.setTitle(exceptionTitle(type));
            e.setDetail(exceptionDetail(type, s));
            e.setShipmentId(s.getId());
            e.setVendorId(s.getVendor().getId());
            e.setVendorName(s.getVendor().getName());
            e.setFcId(s.getFulfilmentCentre().getId());
            e.setFcName(s.getFulfilmentCentre().getName());
            e.setSeverity(type == ExceptionType.DOCUMENT_MISMATCH
                    || type == ExceptionType.TEMPERATURE_BREACH
                    ? AlertSeverity.CRITICAL : AlertSeverity.WARNING);
            e.setStatus(status);
            e.setOwner(status == ExceptionStatus.OPEN && rng.chance(0.4)
                    ? "Unassigned" : rng.pick(ReferenceData.EXCEPTION_OWNERS));
            e.setRaisedAt(raisedAt);
            e.setResolvedAt(status == ExceptionStatus.RESOLVED
                    ? raisedAt.plus(rng.nextInt(30, 2400), ChronoUnit.MINUTES) : null);
            e.setResolutionNote(status == ExceptionStatus.RESOLVED
                    ? rng.pick(List.of(
                    "Vendor re-issued the document; consignment released to dock.",
                    "Short quantity confirmed against the ASN, debit note raised.",
                    "Accepted with a note against the vendor scorecard.",
                    "Slot re-cut for the following morning, no further impact.")) : null);
            e.setImpactMin(rng.nextInt(10, 180));
            batch.add(e);
        }

        exceptions.saveAll(batch);
    }

    private String exceptionTitle(ExceptionType type) {
        return switch (type) {
            case LATE_ARRIVAL -> "Late arrival";
            case DOCUMENT_MISMATCH -> "Document mismatch";
            case TEMPERATURE_BREACH -> "Temperature breach";
            case QUANTITY_SHORTAGE -> "Quantity shortage";
            case UNSCHEDULED_ARRIVAL -> "Unscheduled arrival";
            case DAMAGE -> "Damage on receipt";
        };
    }

    private String exceptionDetail(ExceptionType type, Shipment s) {
        String vehicle = s.getVehicle() == null ? "the vehicle" : s.getVehicle().getRegNumber();
        return switch (type) {
            case LATE_ARRIVAL -> "Vehicle %s reached the gate %d min after the booked slot, pushing two later bookings."
                    .formatted(vehicle, s.getDelayMin());
            case DOCUMENT_MISMATCH -> "Invoice %s lists a consignee GSTIN that does not match this fulfilment centre."
                    .formatted(s.getInvoiceNo());
            case TEMPERATURE_BREACH -> "Cargo bay on %s exceeded the agreed ceiling for 18 minutes before gate-in."
                    .formatted(vehicle);
            case QUANTITY_SHORTAGE -> "Counted short against the advance shipping notice — expected %d cartons."
                    .formatted(s.getCartons());
            case UNSCHEDULED_ARRIVAL -> "%s arrived without a confirmed dock booking for this window."
                    .formatted(s.getVendor().getName());
            case DAMAGE -> "Corner crush on multiple cartons, photographed at the dock before offload completed.";
        };
    }
}
