package com.drishya.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * A latitude/longitude pair. Embedded rather than an entity because a point has
 * no identity of its own — it is only ever "where this shipment is" or "the
 * third bend on this route".
 */
@Embeddable
public class GeoPoint {

    @Column(nullable = false)
    private double lat;

    @Column(nullable = false)
    private double lng;

    protected GeoPoint() {
        // for JPA
    }

    public GeoPoint(double lat, double lng) {
        this.lat = lat;
        this.lng = lng;
    }

    public double getLat() {
        return lat;
    }

    public double getLng() {
        return lng;
    }

    public void setLat(double lat) {
        this.lat = lat;
    }

    public void setLng(double lng) {
        this.lng = lng;
    }

    /** Great-circle distance in kilometres. */
    public double distanceTo(GeoPoint other) {
        double earthRadiusKm = 6371;
        double dLat = Math.toRadians(other.lat - this.lat);
        double dLng = Math.toRadians(other.lng - this.lng);
        double lat1 = Math.toRadians(this.lat);
        double lat2 = Math.toRadians(other.lat);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.pow(Math.sin(dLng / 2), 2) * Math.cos(lat1) * Math.cos(lat2);
        return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
    }

    @Override
    public String toString() {
        return "(" + lat + ", " + lng + ")";
    }
}
