package com.drishya.backend.dto.request;

import com.drishya.backend.domain.enums.AppointmentStatus;
import com.drishya.backend.domain.enums.DocumentType;
import com.drishya.backend.domain.enums.GrnDecision;
import com.drishya.backend.domain.enums.IncidentType;
import com.drishya.backend.domain.enums.Priority;
import com.drishya.backend.domain.enums.Role;
import com.drishya.backend.domain.enums.ShipmentStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Every request body the API accepts, kept together so the write surface can be
 * read in one sitting.
 *
 * <p>These are validated server-side even though the browser validates first —
 * the API cannot assume its only client is our own frontend.
 */
public final class Requests {

    private Requests() {
    }

    public record Login(
            @NotBlank @Email String email,
            @NotBlank String password) {}

    public record DemoLogin(@NotNull Role role) {}

    public record Signup(
            @NotBlank String name,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, message = "Password must be at least 8 characters") String password,
            String phone,
            String title,
            /** "vendor", "carrier" or "fulfilment_centre" — decides the role. */
            @NotBlank String orgType,
            @NotBlank String orgName,
            String gstin,
            String city) {}

    public record PasswordResetRequest(@NotBlank @Email String email) {}

    public record PasswordReset(
            String token,
            @NotBlank @Size(min = 8, message = "Password must be at least 8 characters") String password) {}

    public record ProfileUpdate(String name, String email, String phone, String title, String orgName) {}

    /** A document supplied at booking time. */
    public record DocumentInput(@NotNull DocumentType type, String number, Integer sizeKb) {}

    public record CreateShipment(
            String reference,
            @NotBlank String vendorId,
            @NotBlank String fcId,
            @NotBlank String vehicleId,
            @NotBlank String driverId,
            @NotBlank String commodity,
            @Positive int cartons,
            @Positive int weightKg,
            @Min(0) long valueInr,
            Priority priority,
            String sealNumber,
            String invoiceNo,
            String ewayBillNo,
            Long pickupAt,
            Long slotStart,
            String dockId,
            String slotNote,
            List<DocumentInput> documents) {}

    public record AdvanceShipment(
            @NotNull ShipmentStatus status,
            String label,
            String detail) {}

    public record SubmitPod(
            @NotBlank String receiverName,
            @Min(0) int cartonsReceived,
            int photos,
            String damageNote,
            String signature) {}

    public record SaveChecklist(
            String sealNumber,
            String notes,
            int photos,
            List<String> failures) {}

    public record AssignDock(@NotBlank String dockId) {}

    public record SubmitGrn(
            @NotNull GrnDecision decision,
            @Min(0) int receivedCartons,
            @Min(0) int damagedCartons,
            List<String> documentsVerified,
            String note,
            String checkedBy) {}

    public record CancelShipment(String reason) {}

    public record RequestAppointment(
            String shipmentId,
            @NotBlank String vendorId,
            String vendorName,
            @NotBlank String fcId,
            @NotBlank String dockId,
            @NotNull Long start,
            Integer durationMin,
            String vehicleReg,
            Integer cartons,
            String note) {}

    public record RescheduleAppointment(@NotNull Long start, String dockId) {}

    public record DecideAppointment(
            @NotNull AppointmentStatus decision,
            String by,
            String reason,
            Long proposedStart) {}

    public record ReuploadDocument(String number, String fileName) {}

    public record UpdateException(String status, String owner, String resolutionNote) {}

    public record AcknowledgeAlert(String by) {}

    public record MarkRead(@NotNull List<String> ids) {}

    public record ReportIncident(
            @NotNull IncidentType type,
            String shipmentId,
            @NotBlank @Size(min = 12, message = "Describe what happened in a little more detail") String description,
            int photos,
            Double lat,
            Double lng,
            String locationSource,
            String reportedBy) {}

    public record SetAvailability(boolean available) {}

    /** Positions written back by the live simulation loop. */
    public record LivePosition(
            @NotBlank String id,
            double progress,
            double lat,
            double lng,
            int remainingKm,
            int speedKmph,
            Long predictedAt,
            Integer delayMin,
            String delayReason) {}
}
