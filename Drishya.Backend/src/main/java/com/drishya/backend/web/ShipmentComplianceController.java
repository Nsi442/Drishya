package com.drishya.backend.web;

import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.dto.AsnDtos.AsnSubmission;
import com.drishya.backend.dto.AsnDtos.AsnValidationResult;
import com.drishya.backend.dto.EvidenceDtos.EvidencePack;
import com.drishya.backend.service.CallerService;
import com.drishya.backend.service.EvidencePackService;
import com.drishya.backend.service.validation.AsnValidationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Documentation and evidence for one consignment.
 *
 * <p>Kept apart from ShipmentController, which is about booking and movement.
 * These two endpoints are the compliance surface: what has to be right before
 * the vehicle leaves, and what can be proved after it arrives.
 */
@RestController
@RequestMapping("/api/v1/shipments")
public class ShipmentComplianceController {

    private final AsnValidationService asnValidation;
    private final EvidencePackService evidence;
    private final CallerService callers;

    public ShipmentComplianceController(AsnValidationService asnValidation,
                                        EvidencePackService evidence,
                                        CallerService callers) {
        this.asnValidation = asnValidation;
        this.evidence = evidence;
        this.callers = callers;
    }

    /**
     * Validates a notice without recording anything.
     *
     * <p>For the browser's inline feedback as a vendor fills the form. Moving a
     * shipment to DOCS_PENDING on every keystroke would be absurd, so the
     * checking and the committing are separate calls.
     */
    @PostMapping("/{shipmentId}/asn/check")
    public AsnValidationResult check(
            @PathVariable String shipmentId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @Valid @RequestBody AsnSubmission asn) {
        return asnValidation.check(shipmentId, callers.requireTenant(userId), asn);
    }

    /**
     * Submits the notice for real.
     *
     * <p><b>Returns 200 with the failures, not 400.</b> A rejected notice is a
     * successful validation with a negative answer — the request was
     * well-formed, the endpoint did exactly what it was asked, and the body is
     * the useful part. A 4xx would push callers into an error branch that
     * typically shows a generic message and throws away the structured reasons,
     * which are the entire value of the feature. {@code dispatchAllowed} is the
     * field to branch on.
     */
    @PostMapping("/{shipmentId}/asn")
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.OK)
    public AsnValidationResult submit(
            @PathVariable String shipmentId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @Valid @RequestBody AsnSubmission asn) {
        return asnValidation.submit(shipmentId, callers.requireTenant(userId), asn);
    }

    /** The dispute artefact. See EvidencePackService for what is and is not in it. */
    @GetMapping("/{shipmentId}/evidence-pack")
    public EvidencePack evidencePack(
            @PathVariable String shipmentId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return evidence.build(shipmentId, callers.requireTenant(userId));
    }

    /**
     * The same pack as a download, for attaching to a dispute.
     *
     * <p>Same JSON, different Content-Disposition. Deliberately not a PDF: a
     * dispute is usually resolved by someone diffing timestamps, and machine
     * readable beats printable for that.
     */
    @GetMapping("/{shipmentId}/evidence-pack/download")
    public ResponseEntity<EvidencePack> download(
            @PathVariable String shipmentId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        EvidencePack pack = evidence.build(shipmentId, callers.requireTenant(userId));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"evidence-" + shipmentId + ".json\"")
                .body(pack);
    }
}
