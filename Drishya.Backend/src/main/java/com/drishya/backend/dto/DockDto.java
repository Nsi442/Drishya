package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.DockType;

/** A loading bay. */
public record DockDto(
        String id,
        String fcId,
        String name,
        DockType type,
        boolean active,
        int maxVehicleLengthFt) {}
