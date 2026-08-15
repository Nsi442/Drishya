package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.ShipmentStatus;

/** A vehicle on site, with its detention clock. `detention` is ok/amber/red. */
public record YardVehicleDto(
        String shipmentId,
        String vendorName,
        String vehicleReg,
        String vehicleType,
        String driverName,
        String driverPhone,
        ShipmentStatus status,
        String dockId,
        String dockName,
        long gateInAt,
        long minutesOnSite,
        String detention,
        int cartons) {}
