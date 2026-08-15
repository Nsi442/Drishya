package com.drishya.backend.dto;

/** A driver and their current assignment. */
public record DriverDto(
        String id,
        String name,
        String phone,
        long licenceExpiry,
        double rating,
        int tripsCompleted,
        boolean available,
        String language,
        String vehicleId,
        String vehicleReg,
        String currentShipmentId,
        String currentLane,
        String currentStatus) {}
