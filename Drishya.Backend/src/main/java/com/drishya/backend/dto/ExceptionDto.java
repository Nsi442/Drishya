package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.AlertSeverity;
import com.drishya.backend.domain.enums.ExceptionStatus;
import com.drishya.backend.domain.enums.ExceptionType;

/** A receiving exception as the FC's exception queue consumes it. */
public record ExceptionDto(
        String id,
        ExceptionType type,
        String title,
        String detail,
        String shipmentId,
        String vendorId,
        String vendorName,
        String fcId,
        String fcName,
        AlertSeverity severity,
        ExceptionStatus status,
        String owner,
        long raisedAt,
        Long resolvedAt,
        String resolutionNote,
        int impactMin) {}
