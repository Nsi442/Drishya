package com.drishya.backend.service.routing;

import static org.assertj.core.api.Assertions.assertThat;

import com.drishya.backend.domain.GeoPoint;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The reduction that decides whether a drawn route is a road.
 *
 * <p>Measured on the deployed site before this changed: a 1,242 km journey
 * stored as 23 points, one span of which was a 255 km straight line. The cause
 * was OSRM's overview=simplified plus an even-stride thinner, and the thinner
 * is what these tests are about — it treated a hairpin and a motorway straight
 * as equally disposable.
 */
class RouteSimplifyTest {

    /** A winding road: a long arc with real curvature, densely sampled. */
    private static List<GeoPoint> windingRoad(int points) {
        List<GeoPoint> out = new ArrayList<>(points);
        for (int i = 0; i < points; i++) {
            double t = i / (double) (points - 1);
            double lat = 18.52 + t * 5.5;
            // Two superimposed bends, so the shape cannot be carried by the ends.
            double lng = 73.85 + t * 3.7
                    + 0.35 * Math.sin(t * Math.PI * 4)
                    + 0.08 * Math.sin(t * Math.PI * 17);
            out.add(new GeoPoint(lat, lng));
        }
        return out;
    }

    /** Worst distance from any original point to the simplified line, in metres. */
    private static double maxDeviationMetres(List<GeoPoint> original, List<GeoPoint> simplified) {
        double worst = 0;
        for (GeoPoint p : original) {
            double best = Double.MAX_VALUE;
            for (int i = 0; i < simplified.size() - 1; i++) {
                best = Math.min(best, segmentMetres(p, simplified.get(i), simplified.get(i + 1)));
            }
            worst = Math.max(worst, best);
        }
        return worst;
    }

    private static double segmentMetres(GeoPoint p, GeoPoint a, GeoPoint b) {
        double mLat = 111_320.0;
        double mLon = mLat * Math.cos(Math.toRadians((a.getLat() + b.getLat()) / 2));
        double px = (p.getLng() - a.getLng()) * mLon, py = (p.getLat() - a.getLat()) * mLat;
        double bx = (b.getLng() - a.getLng()) * mLon, by = (b.getLat() - a.getLat()) * mLat;
        double len2 = bx * bx + by * by;
        if (len2 == 0) {
            return Math.hypot(px, py);
        }
        double t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
        return Math.hypot(px - t * bx, py - t * by);
    }

    private static double lengthKm(List<GeoPoint> pts) {
        double km = 0;
        for (int i = 0; i < pts.size() - 1; i++) {
            km += segmentMetres(pts.get(i), pts.get(i), pts.get(i + 1)) == 0 ? 0 : 0;
        }
        // Straight haversine sum.
        for (int i = 0; i < pts.size() - 1; i++) {
            GeoPoint a = pts.get(i), b = pts.get(i + 1);
            double mLat = 111_320.0;
            double mLon = mLat * Math.cos(Math.toRadians((a.getLat() + b.getLat()) / 2));
            km += Math.hypot((b.getLng() - a.getLng()) * mLon, (b.getLat() - a.getLat()) * mLat) / 1000.0;
        }
        return km;
    }

    @Test
    @DisplayName("a dense road survives the cap without losing its shape")
    void keepsShapeUnderTheCap() {
        List<GeoPoint> road = windingRoad(30_000);
        List<GeoPoint> out = HttpRouting.simplify(road, 800);

        assertThat(out).hasSizeLessThanOrEqualTo(800);
        assertThat(out.getFirst()).isEqualTo(road.getFirst());
        assertThat(out.getLast()).isEqualTo(road.getLast());
        // The promise the tolerance makes: nothing strays far from the road.
        assertThat(maxDeviationMetres(road, out)).isLessThan(500);
    }

    @Test
    @DisplayName("it beats the even-stride thinning it replaced, on the same budget")
    void beatsEvenStride() {
        List<GeoPoint> road = windingRoad(30_000);
        List<GeoPoint> shaped = HttpRouting.simplify(road, 800);

        // What the old thinner did: keep every nth point.
        List<GeoPoint> strided = new ArrayList<>();
        int step = (int) Math.ceil(road.size() / 800.0);
        for (int i = 0; i < road.size(); i += step) {
            strided.add(road.get(i));
        }
        strided.add(road.getLast());

        double shapedDev = maxDeviationMetres(road, shaped);
        double stridedDev = maxDeviationMetres(road, strided);
        assertThat(shapedDev).isLessThan(stridedDev);

        // And it keeps the length, which is how corner-cutting shows up as a
        // number: the live site's stored polylines were up to 7.8% short.
        double full = lengthKm(road);
        assertThat(lengthKm(shaped)).isCloseTo(full, org.assertj.core.data.Offset.offset(full * 0.01));
    }

    @Test
    @DisplayName("no gap anywhere near the 255 km straight the live site had")
    void noAbsurdStraights() {
        List<GeoPoint> out = HttpRouting.simplify(windingRoad(30_000), 800);
        double longest = 0;
        for (int i = 0; i < out.size() - 1; i++) {
            longest = Math.max(longest, lengthKm(List.of(out.get(i), out.get(i + 1))));
        }
        assertThat(longest).isLessThan(50);
    }

    @Test
    @DisplayName("a short route is returned untouched")
    void shortRouteUnchanged() {
        List<GeoPoint> road = windingRoad(120);
        assertThat(HttpRouting.simplify(road, 800)).isSameAs(road);
    }

    @Test
    @DisplayName("a degenerate route does not blow up")
    void handlesDegenerate() {
        assertThat(HttpRouting.simplify(List.of(), 800)).isEmpty();
        List<GeoPoint> two = List.of(new GeoPoint(18.5, 73.8), new GeoPoint(12.9, 77.5));
        assertThat(HttpRouting.simplify(two, 800)).hasSize(2);
    }
}
