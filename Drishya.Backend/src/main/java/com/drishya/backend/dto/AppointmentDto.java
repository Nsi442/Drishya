package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.AppointmentStatus;

/** A dock booking as the calendar and the gantt consume it. */
public record AppointmentDto(
        String id,
        String shipmentId,
        String vendorId,
        String vendorName,
        String fcId,
        String fcName,
        String dockId,
        String dockName,
        long start,
        long end,
        AppointmentStatus status,
        Long requestedAt,
        Long decidedAt,
        String decidedBy,
        String rejectionReason,
        Long proposedStart,
        String vehicleReg,
        int cartons,
        String note) {}
