package com.drishya.backend.service.validation;

import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.ShipmentDocument;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.TripEvent;
import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.DocumentType;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.domain.enums.TripEventType;
import com.drishya.backend.dto.AsnDtos.AsnSubmission;
import com.drishya.backend.dto.AsnDtos.AsnValidationResult;
import com.drishya.backend.dto.AsnDtos.ValidationFailure;
import com.drishya.backend.repo.ShipmentDocumentRepository;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.TripRepository;
import com.drishya.backend.service.ApiException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Runs the validator chain and, on a blocking failure, actually stops dispatch.
 *
 * <p><b>Refusing is the point.</b> A validator that reports problems while the
 * vehicle leaves anyway is a logging feature. This one moves the shipment to
 * DOCS_PENDING, and TripService refuses to start a trip from that state — so
 * the block is enforced by the domain rather than by the browser politely not
 * offering the button.
 *
 * <p>Every check runs even after one fails. A vendor whose carton count and
 * seal number are both wrong is told both at once rather than being sent away
 * to fix one and come back for the other.
 */
@Service
public class AsnValidationService {

    private static final Logger log = LoggerFactory.getLogger(AsnValidationService.class);

    /** Matches the shipment_documents.note column width. */
    private static final int NOTE_MAX = 2000;

    private final List<AsnValidator> validators;
    private final ShipmentRepository shipments;
    private final ShipmentDocumentRepository documents;
    private final TripRepository trips;

    /**
     * @param validators every AsnValidator bean, in {@code @Order}. Adding a
     *     rule is adding a class; nothing here changes.
     */
    public AsnValidationService(List<AsnValidator> validators, ShipmentRepository shipments,
                                ShipmentDocumentRepository documents, TripRepository trips) {
        this.validators = validators;
        this.shipments = shipments;
        this.documents = documents;
        this.trips = trips;
    }

    /**
     * Validates without changing anything. For the "check as I type" path in the
     * browser, where moving a shipment to DOCS_PENDING on every keystroke would
     * be absurd.
     */
    @Transactional(readOnly = true)
    public AsnValidationResult check(String shipmentId, String tenantId, AsnSubmission asn) {
        return run(load(shipmentId, tenantId), asn);
    }

    /**
     * Validates and records the outcome against the shipment.
     *
     * <p>On success the consignment is cleared for dispatch. On a blocking
     * failure it goes to DOCS_PENDING and stays there until a submission
     * passes.
     */
    @Transactional
    public AsnValidationResult submit(String shipmentId, String tenantId, AsnSubmission asn) {
        Shipment shipment = load(shipmentId, tenantId);

        if (shipment.getStatus() != ShipmentStatus.CREATED
                && shipment.getStatus() != ShipmentStatus.DOCS_PENDING) {
            throw ApiException.conflict(
                    "This consignment has already left. An advance shipping notice has to be "
                            + "submitted before dispatch, which is the whole point of it.");
        }

        AsnValidationResult result = run(shipment, asn);

        if (result.hasBlocking()) {
            shipment.setStatus(ShipmentStatus.DOCS_PENDING);
            recordDocument(shipment, asn, DocumentStatus.MISMATCH, summarise(result.failures()),
                    result.failures());
            log.info("Shipment {} held: {} blocking documentation failures",
                    shipmentId, blockingCount(result));
        } else {
            // Cleared. Back to CREATED so TripService will allow a dispatch.
            shipment.setStatus(ShipmentStatus.CREATED);
            recordDocument(shipment, asn, DocumentStatus.VALID, null, null);

            // Carry the validated values onto the booking so the gate, the
            // evidence pack and the receiving desk all read the same numbers.
            if (asn.invoiceNumber() != null) {
                shipment.setInvoiceNo(asn.invoiceNumber().trim());
            }
            if (asn.ewayBillNumber() != null) {
                shipment.setEwayBillNo(asn.ewayBillNumber().trim());
            }
            if (asn.sealNumber() != null) {
                shipment.setSealNumber(asn.sealNumber().trim());
            }
            log.info("Shipment {} cleared for dispatch", shipmentId);
        }

        shipment.setUpdatedAt(Instant.now());
        shipments.save(shipment);

        // If a trip is somehow already running, the rejection belongs on its
        // timeline too — that is what the evidence pack is assembled from.
        if (result.hasBlocking()) {
            recordOnActiveTrip(shipment, tenantId, result);
        }

        return result;
    }

    private AsnValidationResult run(Shipment shipment, AsnSubmission asn) {
        List<ValidationFailure> failures = new ArrayList<>();

        for (AsnValidator validator : validators) {
            try {
                failures.addAll(validator.validate(asn, shipment));
            } catch (Exception e) {
                // A broken rule must not silently pass a consignment. Reporting
                // it as a failure is the safe direction to fail in.
                log.error("Validator {} threw: {}", validator.name(), e.getMessage(), e);
                failures.add(ValidationFailure.blocking(
                        "VALIDATOR_ERROR", validator.name(),
                        "A documentation check could not be completed. This consignment is "
                                + "held rather than passed by default.",
                        "a completed check", e.getClass().getSimpleName()));
            }
        }

        boolean blocking = failures.stream()
                .anyMatch(f -> f.severity() == ValidationFailure.Severity.BLOCKING);

        return new AsnValidationResult(shipment.getId(), !blocking, validators.size(),
                failures, Instant.now().toEpochMilli());
    }

    private void recordOnActiveTrip(Shipment shipment, String tenantId,
                                    AsnValidationResult result) {
        trips.findByShipmentIdAndTenantId(shipment.getId(), tenantId).stream()
                .filter(Trip::isActive)
                .findFirst()
                .ifPresent(trip -> {
                    trip.addEvent(new TripEvent(TripEventType.DOC_REJECTED, Instant.now(),
                            "Advance shipping notice rejected")
                            .with("failures", result.failures().stream()
                                    .map(ValidationFailure::code).toList())
                            .with("blockingCount", blockingCount(result)));
                    trips.save(trip);
                });
    }

    /**
     * Keeps the ASN in the document list the rest of the product already reads,
     * so a rejected notice appears in the vendor's documents view rather than
     * only in the response to one API call.
     */
    private void recordDocument(Shipment shipment, AsnSubmission asn,
                                DocumentStatus status, String note,
                                List<ValidationFailure> failures) {
        ShipmentDocument existing = documents.findByShipmentId(shipment.getId()).stream()
                .filter(d -> d.getType() == DocumentType.ASN)
                .findFirst()
                .orElse(null);

        ShipmentDocument doc = existing != null ? existing
                : new ShipmentDocument(shipment.getId() + "-ASN", DocumentType.ASN, null, status);
        doc.setShipment(shipment);
        doc.setType(DocumentType.ASN);
        doc.setNumber(asn.poReference());
        doc.setStatus(status);
        doc.setUploadedAt(Instant.now());
        doc.setNote(note);
        // Structured alongside the summary, so a later reader can filter and
        // count rather than parse prose.
        doc.setFailureReasons(failures == null ? null : failures.stream()
                .map(f -> java.util.Map.<String, Object>of(
                        "code", f.code(),
                        "field", f.field(),
                        "message", f.message(),
                        "expected", f.expected(),
                        "actual", f.actual(),
                        "severity", f.severity().name()))
                .toList());
        documents.save(doc);
    }

    /**
     * A one-field summary for the document list. Truncated to fit the column
     * even though the column was widened to hold it — the structured failures
     * in the response are the authoritative version, and no amount of
     * pathological input should turn a rejection into a 500.
     */
    private String summarise(List<ValidationFailure> failures) {
        String joined = failures.stream()
                .filter(f -> f.severity() == ValidationFailure.Severity.BLOCKING)
                .map(ValidationFailure::message)
                .collect(Collectors.joining(" "));
        return joined.length() <= NOTE_MAX ? joined : joined.substring(0, NOTE_MAX - 1) + "…";
    }

    private long blockingCount(AsnValidationResult result) {
        return result.failures().stream()
                .filter(f -> f.severity() == ValidationFailure.Severity.BLOCKING)
                .count();
    }

    private Shipment load(String shipmentId, String tenantId) {
        return shipments.findById(shipmentId)
                .filter(s -> s.getVendor() != null && s.getVendor().getId().equals(tenantId))
                .orElseThrow(() -> ApiException.notFound("No such shipment."));
    }
}
