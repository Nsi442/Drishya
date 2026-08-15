package com.drishya.backend.dto;

/** A vendor with its computed scorecard. The percentages are derived from
 * observed shipments, not read from stored baselines. */
public record VendorDto(
        String id,
        String name,
        String city,
        double lat,
        double lng,
        String contact,
        int shipments,
        int delivered,
        int onTimePct,
        int docAccuracyPct,
        int avgDetentionMin,
        int rejectionRatePct) {}
