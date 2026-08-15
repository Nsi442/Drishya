package com.drishya.backend.dto;

/** One movement through the gate. */
public record GateLogDto(
        String id,
        String shipmentId,
        String direction,
        long at,
        String vehicleReg,
        String vendorName,
        String driverName) {}
