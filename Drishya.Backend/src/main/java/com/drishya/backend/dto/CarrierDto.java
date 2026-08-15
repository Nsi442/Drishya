package com.drishya.backend.dto;

/** A haulier, with trip counts computed from actual shipments. */
public record CarrierDto(
        String id,
        String name,
        int activeVehicles,
        int activeTrips,
        int completedTrips,
        int onTimePct,
        int costPerTrip,
        int tripsThisMonth) {}
