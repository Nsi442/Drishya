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
        int closingHour,

        /**
         * The receiving bays, which are a few hundred metres from the site
         * centroid above on a large plot.
         *
         * <p>Both are exposed because they answer different questions. The
         * centroid is where a map pin goes; the dock is what the geofence is
         * drawn around, and drawing the circle on the centroid would put it
         * visibly in the wrong place next to the vehicle that triggered it.
         */
        Double dockLat,
        Double dockLng,

        /** Radius of the arrival geofence in metres. Per site. */
        int geofenceRadiusM) {}
