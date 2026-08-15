package com.drishya.backend.service;

import com.drishya.backend.domain.ShipmentDocument;
import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.dto.DocumentDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.repo.ShipmentDocumentRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Documents across every consignment.
 *
 * <p>There is no file store in this build. The record, its number, its expiry
 * and its validation state are all real; the PDF behind it is not. Uploading
 * therefore updates metadata and re-queues validation rather than storing bytes.
 */
@Service
public class DocumentService {

    private final ShipmentDocumentRepository documents;
    private final Mapper mapper;

    public DocumentService(ShipmentDocumentRepository documents, Mapper mapper) {
        this.documents = documents;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public List<DocumentDto> list(String status, String type, String search, String shipmentId) {
        return documents.findAllBy().stream()
                .filter(d -> shipmentId == null || d.getShipment().getId().equals(shipmentId))
                .filter(d -> isAll(status) || d.getStatus().wire().equals(status))
                .filter(d -> isAll(type) || d.getType().wire().equals(type))
                .filter(d -> search == null || search.isBlank() || matches(d, search))
                .sorted(Comparator.comparing(d -> d.getShipment().getPromisedAt(),
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(mapper::toDocumentDto)
                .toList();
    }

    /**
     * Replaces a document and puts it back in the queue for validation. It is
     * deliberately not marked valid here — that is the validator's call, not
     * the uploader's.
     */
    @Transactional
    public DocumentDto reupload(String documentId, Requests.ReuploadDocument request) {
        ShipmentDocument doc = load(documentId);
        if (request.number() != null && !request.number().isBlank()) {
            doc.setNumber(request.number());
        }
        doc.setStatus(DocumentStatus.PENDING);
        doc.setNote("Re-uploaded — awaiting validation");
        doc.setUploadedAt(Instant.now());
        return mapper.toDocumentDto(documents.save(doc));
    }

    /**
     * Where a real integration would call the e-way bill portal and check the
     * consignee GSTIN against the destination. Here it simply clears the flag.
     */
    @Transactional
    public DocumentDto validate(String documentId) {
        ShipmentDocument doc = load(documentId);
        if (doc.getNumber() == null || doc.getNumber().isBlank()) {
            throw ApiException.badRequest("NO_DOCUMENT",
                    "There is nothing to validate — upload the document first.");
        }
        doc.setStatus(DocumentStatus.VALID);
        doc.setNote(null);
        return mapper.toDocumentDto(documents.save(doc));
    }

    private ShipmentDocument load(String id) {
        return documents.findById(id)
                .orElseThrow(() -> ApiException.notFound("That document is not on record."));
    }

    private boolean matches(ShipmentDocument d, String search) {
        String haystack = String.join(" ",
                d.getNumber() == null ? "" : d.getNumber(),
                d.getShipment().getId(),
                d.getShipment().getVendor() == null ? "" : d.getShipment().getVendor().getName(),
                d.getShipment().getFulfilmentCentre() == null
                        ? "" : d.getShipment().getFulfilmentCentre().getName())
                .toLowerCase(Locale.ROOT);
        return haystack.contains(search.toLowerCase(Locale.ROOT));
    }

    private static boolean isAll(String value) {
        return value == null || value.isBlank() || "all".equals(value);
    }
}
