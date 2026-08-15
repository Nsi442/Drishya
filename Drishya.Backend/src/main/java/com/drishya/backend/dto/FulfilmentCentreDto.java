package com.drishya.backend.dto;

/** A receiving site. Never carries a real marketplace name. */
public record FulfilmentCentreDto(
        String id,
        String name,
        String city,
        double lat,
        double lng,
        int docks,
        int openingHour,
        int closingHour) {}
