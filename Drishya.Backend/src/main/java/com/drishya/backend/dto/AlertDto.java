package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.AlertSeverity;
import com.drishya.backend.domain.enums.AlertType;

/** One entry in the alert feed. */
public record AlertDto(
        String id,
        AlertType type,
        AlertSeverity severity,
        String title,
        String message,
        String shipmentId,
        String vendorId,
        String fcId,
        long at,
        boolean read,
        boolean acknowledged,
        String acknowledgedBy) {}
