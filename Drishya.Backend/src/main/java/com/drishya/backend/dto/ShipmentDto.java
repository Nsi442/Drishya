package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.DocumentType;
import com.drishya.backend.domain.enums.GrnDecision;
import com.drishya.backend.domain.enums.Priority;
import com.drishya.backend.domain.enums.ShipmentStatus;
import java.util.List;

/**
 * The shipment as the browser consumes it.
 *
 * <p>Two deliberate choices, both driven by the client:
 *
 * <ul>
 *   <li><b>Timestamps are epoch milliseconds, not ISO strings.</b> The frontend
 *       does date arithmetic on these directly ({@code predictedAt - promisedAt})
 *       and feeds them to {@code new Date(...)}. Boxed {@code Long} so an absent
 *       time serialises as null rather than 0, which would render as 1970.
 *   <li><b>Associations are flattened.</b> The UI shows a vendor name next to a
 *       shipment id; it never navigates a nested object graph, and flattening
 *       keeps the payload small enough to send sixty of them at once.
 * </ul>
 */
public record ShipmentDto(
        String id,
        String reference,
        String vendorId,
        String vendorName,
        String fcId,
        String fcName,
        String carrier,
        String vehicleId,
        String vehicleReg,
        String vehicleType,
        String driverId,
        String driverName,
        String driverPhone,
        ShipmentStatus status,
        Priority priority,

        /** "Pune → Bhiwandi". Precomputed because every table sorts and filters on it. */
        String lane,

        Place origin,
        Place destination,
        List<Point> route,
        Point position,
        double progress,
        int distanceKm,
        int remainingKm,
        int speedKmph,

        Long bookedAt,
        Long pickupAt,
        Long promisedAt,
        Long predictedAt,
        Long deliveredAt,
        Long gateInAt,
        Long gateOutAt,
        Long slotStart,
        Long slotEnd,
        Long updatedAt,

        /**
         * Minutes past the promised time, or null when there is no current
         * estimate to measure against.
         *
         * <p>Nullable deliberately. As a primitive it defaulted to 0 whenever
         * the engine had withdrawn its estimate, and the browser rendered a
         * confident "On time" for a consignment nobody could locate — the
         * reassuring answer in the one case that warrants none.
         */
        Integer delayMin,
        String delayReason,

        String commodity,
        int cartons,
        int weightKg,
        long valueInr,
        String sealNumber,
        String invoiceNo,
        String ewayBillNo,
        boolean temperatureControlled,
        String dockId,
        String cancelledReason,

        List<Event> events,
        List<Document> documents,
        Sensors sensors,
        Pod pod,
        Grn grn) {

    /** A named endpoint of the journey. */
    public record Place(double lat, double lng, String name) {}

    /** An anonymous coordinate on the route, or the vehicle's current position. */
    public record Point(double lat, double lng) {}

    public record Event(ShipmentStatus stage, String label, String detail, long at, boolean done) {}

    public record Document(
            String id,
            String shipmentId,
            DocumentType type,
            String number,
            DocumentStatus status,
            Long uploadedAt,
            Long expiresAt,
            int sizeKb,
            int pages,
            String note) {}

    /**
     * Telemetry grouped by series, because the UI draws one sparkline per kind
     * rather than a single mixed list.
     */
    public record Sensors(
            List<Reading> temperature,
            List<Reading> humidity,
            List<Reading> shock,
            List<DoorEvent> door) {}

    /** {@code t} rather than {@code at} — it is the x-axis of a chart. */
    public record Reading(long t, double value) {}

    public record DoorEvent(long t, double value, String state, int durationMin, boolean scheduled) {}

    public record Pod(
            String receiverName,
            Long receivedAt,
            Long signatureAt,
            int photos,
            int cartonsReceived,
            String damageNote,
            String signature) {}

    public record Grn(
            GrnDecision decision,
            int expectedCartons,
            int receivedCartons,
            int damagedCartons,
            List<String> documentsVerified,
            String note,
            Long checkedAt,
            String checkedBy) {}
}
