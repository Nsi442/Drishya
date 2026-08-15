package com.drishya.backend.service;

import com.drishya.backend.domain.Alert;
import com.drishya.backend.domain.Appointment;
import com.drishya.backend.domain.AppUser;
import com.drishya.backend.domain.Carrier;
import com.drishya.backend.domain.Dock;
import com.drishya.backend.domain.Driver;
import com.drishya.backend.domain.FulfilmentCentre;
import com.drishya.backend.domain.GeoPoint;
import com.drishya.backend.domain.GoodsReceipt;
import com.drishya.backend.domain.Incident;
import com.drishya.backend.domain.Place;
import com.drishya.backend.domain.ProofOfDelivery;
import com.drishya.backend.domain.ReceivingException;
import com.drishya.backend.domain.SensorReading;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.ShipmentDocument;
import com.drishya.backend.domain.ShipmentEvent;
import com.drishya.backend.domain.Vehicle;
import com.drishya.backend.domain.Vendor;
import com.drishya.backend.domain.enums.SensorKind;
import com.drishya.backend.dto.AlertDto;
import com.drishya.backend.dto.AppointmentDto;
import com.drishya.backend.dto.AuthResponse;
import com.drishya.backend.dto.CarrierDto;
import com.drishya.backend.dto.DockDto;
import com.drishya.backend.dto.DocumentDto;
import com.drishya.backend.dto.DriverDto;
import com.drishya.backend.dto.ExceptionDto;
import com.drishya.backend.dto.FulfilmentCentreDto;
import com.drishya.backend.dto.IncidentDto;
import com.drishya.backend.dto.ShipmentDto;
import com.drishya.backend.dto.UserDto;
import com.drishya.backend.dto.VehicleDto;
import com.drishya.backend.dto.VendorDto;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Entities in, wire shapes out.
 *
 * <p>This is the only place that knows the frontend expects epoch milliseconds
 * and flattened associations. Keeping the translation here means the domain
 * model is free to be shaped for the database rather than for JSON.
 */
@Component
public class Mapper {

    /** Null-safe: an absent time must serialise as null, not as 1970. */
    public static Long millis(Instant instant) {
        return instant == null ? null : instant.toEpochMilli();
    }

    private static long millisOrZero(Instant instant) {
        return instant == null ? 0L : instant.toEpochMilli();
    }

    // --- shipment --------------------------------------------------------

    /**
     * @param includeChildren false for list views, where events, documents and
     *     telemetry would multiply the payload for columns nothing renders.
     */
    public ShipmentDto toDto(Shipment s, boolean includeChildren) {
        Vehicle vehicle = s.getVehicle();
        Driver driver = s.getDriver();
        Vendor vendor = s.getVendor();
        FulfilmentCentre fc = s.getFulfilmentCentre();

        return new ShipmentDto(
                s.getId(),
                s.getReference(),
                vendor == null ? null : vendor.getId(),
                vendor == null ? null : vendor.getName(),
                fc == null ? null : fc.getId(),
                fc == null ? null : fc.getName(),
                vehicle == null || vehicle.getCarrier() == null ? null : vehicle.getCarrier().getName(),
                vehicle == null ? null : vehicle.getId(),
                vehicle == null ? null : vehicle.getRegNumber(),
                vehicle == null ? null : vehicle.getType(),
                driver == null ? null : driver.getId(),
                driver == null ? null : driver.getName(),
                driver == null ? null : driver.getPhone(),
                s.getStatus(),
                s.getPriority(),
                lane(s),
                place(s.getOrigin()),
                place(s.getDestination()),
                s.getRoute().stream().map(Mapper::point).toList(),
                point(s.getPosition()),
                s.getProgress(),
                s.getDistanceKm(),
                s.getRemainingKm(),
                s.getSpeedKmph(),
                millis(s.getBookedAt()),
                millis(s.getPickupAt()),
                millis(s.getPromisedAt()),
                millis(s.getPredictedAt()),
                millis(s.getDeliveredAt()),
                millis(s.getGateInAt()),
                millis(s.getGateOutAt()),
                millis(s.getSlotStart()),
                millis(s.getSlotEnd()),
                millis(s.getUpdatedAt()),
                s.getDelayMin(),
                s.getDelayReason(),
                s.getCommodity(),
                s.getCartons(),
                s.getWeightKg(),
                s.getValueInr(),
                s.getSealNumber(),
                s.getInvoiceNo(),
                s.getEwayBillNo(),
                s.isTemperatureControlled(),
                s.getDockId(),
                s.getCancelledReason(),
                includeChildren ? s.getEvents().stream().map(Mapper::event).toList() : List.of(),
                includeChildren ? s.getDocuments().stream().map(Mapper::document).toList() : List.of(),
                includeChildren ? sensors(s.getSensorReadings()) : emptySensors(),
                pod(s.getPod()),
                grn(s.getGrn()));
    }

    /** "Pune → Bhiwandi". Every table sorts and filters on this. */
    public static String lane(Shipment s) {
        String from = s.getVendor() == null ? "?" : s.getVendor().getCity();
        String to = s.getFulfilmentCentre() == null ? "?" : s.getFulfilmentCentre().getCity();
        return from + " → " + to;
    }

    private static ShipmentDto.Place place(Place p) {
        return p == null ? null : new ShipmentDto.Place(p.getLat(), p.getLng(), p.getName());
    }

    private static ShipmentDto.Point point(GeoPoint p) {
        return p == null ? null : new ShipmentDto.Point(p.getLat(), p.getLng());
    }

    private static ShipmentDto.Event event(ShipmentEvent e) {
        return new ShipmentDto.Event(e.getStage(), e.getLabel(), e.getDetail(), millisOrZero(e.getAt()), true);
    }

    private static ShipmentDto.Document document(ShipmentDocument d) {
        return new ShipmentDto.Document(
                d.getId(),
                d.getShipment() == null ? null : d.getShipment().getId(),
                d.getType(),
                d.getNumber(),
                d.getStatus(),
                millis(d.getUploadedAt()),
                millis(d.getExpiresAt()),
                d.getSizeKb(),
                d.getPages(),
                d.getNote());
    }

    private static ShipmentDto.Sensors emptySensors() {
        return new ShipmentDto.Sensors(List.of(), List.of(), List.of(), List.of());
    }

    /** Splits a flat reading table into the per-series shape the charts want. */
    private static ShipmentDto.Sensors sensors(List<SensorReading> readings) {
        return new ShipmentDto.Sensors(
                series(readings, SensorKind.TEMPERATURE),
                series(readings, SensorKind.HUMIDITY),
                series(readings, SensorKind.SHOCK),
                readings.stream()
                        .filter(r -> r.getKind() == SensorKind.DOOR)
                        .map(r -> new ShipmentDto.DoorEvent(
                                millisOrZero(r.getRecordedAt()),
                                r.getValue(),
                                "open",
                                r.getDurationMin() == null ? 0 : r.getDurationMin(),
                                Boolean.TRUE.equals(r.getScheduled())))
                        .toList());
    }

    private static List<ShipmentDto.Reading> series(List<SensorReading> readings, SensorKind kind) {
        return readings.stream()
                .filter(r -> r.getKind() == kind)
                .map(r -> new ShipmentDto.Reading(millisOrZero(r.getRecordedAt()), r.getValue()))
                .toList();
    }

    private static ShipmentDto.Pod pod(ProofOfDelivery p) {
        if (p == null || p.getReceiverName() == null) {
            return null;
        }
        return new ShipmentDto.Pod(
                p.getReceiverName(),
                millis(p.getReceivedAt()),
                millis(p.getSignatureAt()),
                p.getPhotos(),
                p.getCartonsReceived(),
                p.getDamageNote(),
                p.getSignature());
    }

    private static ShipmentDto.Grn grn(GoodsReceipt g) {
        if (g == null || g.getDecision() == null) {
            return null;
        }
        List<String> verified = g.getDocumentsVerified() == null || g.getDocumentsVerified().isBlank()
                ? List.of()
                : Arrays.stream(g.getDocumentsVerified().split(",")).map(String::trim).toList();
        return new ShipmentDto.Grn(
                g.getDecision(),
                g.getExpectedCartons(),
                g.getReceivedCartons(),
                g.getDamagedCartons(),
                verified,
                g.getNote(),
                millis(g.getCheckedAt()),
                g.getCheckedBy());
    }

    // --- documents -------------------------------------------------------

    public DocumentDto toDocumentDto(ShipmentDocument d) {
        Shipment s = d.getShipment();
        return new DocumentDto(
                d.getId(),
                s.getId(),
                s.getReference(),
                s.getVendor() == null ? null : s.getVendor().getName(),
                s.getFulfilmentCentre() == null ? null : s.getFulfilmentCentre().getName(),
                lane(s),
                s.getStatus(),
                millis(s.getPromisedAt()),
                d.getType(),
                d.getNumber(),
                d.getStatus(),
                millis(d.getUploadedAt()),
                millis(d.getExpiresAt()),
                d.getSizeKb(),
                d.getPages(),
                d.getNote());
    }

    // --- scheduling ------------------------------------------------------

    public AppointmentDto toDto(Appointment a, String dockName) {
        return new AppointmentDto(
                a.getId(),
                a.getShipmentId(),
                a.getVendorId(),
                a.getVendorName(),
                a.getFcId(),
                a.getFcName(),
                a.getDockId(),
                dockName,
                millisOrZero(a.getStart()),
                millisOrZero(a.getEnd()),
                a.getStatus(),
                millis(a.getRequestedAt()),
                millis(a.getDecidedAt()),
                a.getDecidedBy(),
                a.getRejectionReason(),
                millis(a.getProposedStart()),
                a.getVehicleReg(),
                a.getCartons(),
                a.getNote());
    }

    public DockDto toDto(Dock d) {
        return new DockDto(
                d.getId(),
                d.getFulfilmentCentre().getId(),
                d.getName(),
                d.getType(),
                d.isActive(),
                d.getMaxVehicleLengthFt());
    }

    // --- alerts and exceptions -------------------------------------------

    public AlertDto toDto(Alert a) {
        return new AlertDto(
                a.getId(),
                a.getType(),
                a.getSeverity(),
                a.getTitle(),
                a.getMessage(),
                a.getShipmentId(),
                a.getVendorId(),
                a.getFcId(),
                millisOrZero(a.getAt()),
                a.isRead(),
                a.isAcknowledged(),
                a.getAcknowledgedBy());
    }

    public ExceptionDto toDto(ReceivingException e) {
        return new ExceptionDto(
                e.getId(),
                e.getType(),
                e.getTitle(),
                e.getDetail(),
                e.getShipmentId(),
                e.getVendorId(),
                e.getVendorName(),
                e.getFcId(),
                e.getFcName(),
                e.getSeverity(),
                e.getStatus(),
                e.getOwner(),
                millisOrZero(e.getRaisedAt()),
                millis(e.getResolvedAt()),
                e.getResolutionNote(),
                e.getImpactMin());
    }

    public IncidentDto toDto(Incident i) {
        return new IncidentDto(
                i.getId(),
                i.getType(),
                i.getShipmentId(),
                i.getDescription(),
                i.getPhotos(),
                i.getLocation() == null ? null : i.getLocation().getLat(),
                i.getLocation() == null ? null : i.getLocation().getLng(),
                i.getLocationSource(),
                i.getReportedBy(),
                millisOrZero(i.getAt()),
                i.getStatus());
    }

    // --- reference data --------------------------------------------------

    public FulfilmentCentreDto toDto(FulfilmentCentre fc) {
        return new FulfilmentCentreDto(
                fc.getId(),
                fc.getName(),
                fc.getCity(),
                fc.getLocation().getLat(),
                fc.getLocation().getLng(),
                fc.getDockCount(),
                fc.getOpeningHour(),
                fc.getClosingHour());
    }

    public VendorDto toDto(Vendor v, int shipments, int delivered, int onTimePct, int docAccuracyPct,
                           int rejectionRatePct) {
        return new VendorDto(
                v.getId(),
                v.getName(),
                v.getCity(),
                v.getLocation().getLat(),
                v.getLocation().getLng(),
                v.getContact(),
                shipments,
                delivered,
                onTimePct,
                docAccuracyPct,
                v.getAvgDetentionMin(),
                rejectionRatePct);
    }

    public CarrierDto toDto(Carrier c, int activeVehicles, int activeTrips, int completedTrips, int onTimePct) {
        return new CarrierDto(
                c.getId(),
                c.getName(),
                activeVehicles,
                activeTrips,
                completedTrips,
                onTimePct,
                c.getCostPerTrip(),
                c.getTripsThisMonth());
    }

    public VehicleDto toDto(Vehicle v, Shipment current) {
        return new VehicleDto(
                v.getId(),
                v.getRegNumber(),
                v.getType(),
                v.getCarrier() == null ? null : v.getCarrier().getName(),
                v.getDeviceStatus(),
                v.getBatteryPct(),
                v.getCostPerTrip(),
                v.getCapacityKg(),
                millis(v.getLastPing()),
                current == null ? null : current.getId(),
                current == null ? null : lane(current),
                current == null ? "idle" : current.getStatus().wire());
    }

    public DriverDto toDto(Driver d, Shipment current) {
        Vehicle vehicle = d.getVehicle();
        return new DriverDto(
                d.getId(),
                d.getName(),
                d.getPhone(),
                millisOrZero(d.getLicenceExpiry()),
                d.getRating(),
                d.getTripsCompleted(),
                d.isAvailable(),
                d.getLanguage(),
                vehicle == null ? null : vehicle.getId(),
                vehicle == null ? null : vehicle.getRegNumber(),
                current == null ? null : current.getId(),
                current == null ? null : lane(current),
                current == null ? "idle" : current.getStatus().wire());
    }

    // --- auth ------------------------------------------------------------

    public UserDto toDto(AppUser u) {
        return new UserDto(
                u.getId(),
                u.getEmail(),
                u.getName(),
                u.getRole(),
                u.getTitle(),
                u.getOrgId(),
                u.getOrgName(),
                u.getPhone(),
                u.getInitials(),
                u.getDriverId(),
                u.getLanguage());
    }

    public AuthResponse toAuthResponse(AppUser u, String token) {
        return new AuthResponse(toDto(u), token);
    }

    /** Joins a list of enum wire values for storage in a single column. */
    public static String joinWireValues(List<String> values) {
        return values == null ? null : values.stream().collect(Collectors.joining(","));
    }
}
