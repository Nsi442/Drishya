package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.DeviceStatus;

/** A truck and its tracking device. currentShipmentId is null when idle. */
public record VehicleDto(
        String id,
        String regNumber,
        String type,
        String carrier,
        DeviceStatus deviceStatus,
        int batteryPct,
        int costPerTrip,
        int capacityKg,
        Long lastPing,
        String currentShipmentId,
        String currentLane,
        String currentStatus) {}
