package com.drishya.backend.seed;

import com.drishya.backend.domain.GeoPoint;
import java.util.ArrayList;
import java.util.List;

/**
 * Just enough route maths to move a vehicle believably without a routing engine.
 *
 * <p>A route is an origin, a gently bowed midpoint and a destination. The bow
 * matters: a dead-straight line between two cities looks like a ruler rather
 * than a road, and the eye notices immediately.
 */
public final class GeoUtil {

    private static final double EARTH_RADIUS_KM = 6371;

    private GeoUtil() {
    }

    public static List<GeoPoint> buildRoute(GeoPoint origin, GeoPoint destination, Rng rng) {
        double midLat = (origin.getLat() + destination.getLat()) / 2;
        double midLng = (origin.getLng() + destination.getLng()) / 2;
        double dx = destination.getLng() - origin.getLng();
        double dy = destination.getLat() - origin.getLat();
        double bow = (rng.next() - 0.5) * 0.35;

        GeoPoint waypoint = new GeoPoint(midLat - dx * bow, midLng + dy * bow);
        return new ArrayList<>(List.of(origin, waypoint, destination));
    }

    public static double haversine(GeoPoint a, GeoPoint b) {
        double dLat = Math.toRadians(b.getLat() - a.getLat());
        double dLng = Math.toRadians(b.getLng() - a.getLng());
        double lat1 = Math.toRadians(a.getLat());
        double lat2 = Math.toRadians(b.getLat());
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.pow(Math.sin(dLng / 2), 2) * Math.cos(lat1) * Math.cos(lat2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
    }

    public static double routeLength(List<GeoPoint> points) {
        double total = 0;
        for (int i = 1; i < points.size(); i++) {
            total += haversine(points.get(i - 1), points.get(i));
        }
        return total;
    }

    /**
     * Interpolates a position at {@code progress} (0..1) along the polyline,
     * measured by distance rather than by leg count so a long leg does not pass
     * as quickly as a short one.
     */
    public static GeoPoint positionAlongRoute(List<GeoPoint> points, double progress) {
        double clamped = Math.min(Math.max(progress, 0), 1);
        if (points.isEmpty()) {
            return null;
        }
        if (points.size() == 1) {
            return points.get(0);
        }

        double[] segments = new double[points.size() - 1];
        double total = 0;
        for (int i = 1; i < points.size(); i++) {
            segments[i - 1] = haversine(points.get(i - 1), points.get(i));
            total += segments[i - 1];
        }
        if (total == 0) {
            return points.get(0);
        }

        double target = clamped * total;
        for (int i = 0; i < segments.length; i++) {
            if (target <= segments[i]) {
                double t = segments[i] == 0 ? 0 : target / segments[i];
                GeoPoint a = points.get(i);
                GeoPoint b = points.get(i + 1);
                return new GeoPoint(
                        a.getLat() + (b.getLat() - a.getLat()) * t,
                        a.getLng() + (b.getLng() - a.getLng()) * t);
            }
            target -= segments[i];
        }
        return points.get(points.size() - 1);
    }
}
