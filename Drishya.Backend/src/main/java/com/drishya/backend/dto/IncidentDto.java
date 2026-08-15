package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.IncidentType;

/** A driver's report from the road. */
public record IncidentDto(
        String id,
        IncidentType type,
        String shipmentId,
        String description,
        int photos,
        Double lat,
        Double lng,
        String locationSource,
        String reportedBy,
        long at,
        String status) {}
