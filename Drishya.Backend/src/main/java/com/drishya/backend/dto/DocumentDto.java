package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.DocumentType;
import com.drishya.backend.domain.enums.ShipmentStatus;

/**
 * A document with enough of its shipment's context to be listed on its own.
 *
 * <p>The vendor's documents page works document-first — "show me everything that
 * will be rejected at a gate this week" — so each row carries the lane and the
 * promised slot rather than making the client join back to the shipment.
 */
public record DocumentDto(
        String id,
        String shipmentId,
        String shipmentRef,
        String vendorName,
        String fcName,
        String lane,
        ShipmentStatus shipmentStatus,
        Long promisedAt,
        DocumentType type,
        String number,
        DocumentStatus status,
        Long uploadedAt,
        Long expiresAt,
        int sizeKb,
        int pages,
        String note) {}
