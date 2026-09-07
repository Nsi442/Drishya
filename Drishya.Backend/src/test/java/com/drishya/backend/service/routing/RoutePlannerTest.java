package com.drishya.backend.service.routing;

import com.drishya.backend.domain.GeoPoint;
import com.drishya.backend.domain.enums.RouteSource;
import com.drishya.backend.seed.Rng;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the router client reads the road it is given, and refuses the rest.
 *
 * <p><b>Against a stub, deliberately, and with no Spring context.</b> The public
 * OSRM demo server is a third party: a test that calls it is a test of whether
 * somebody else's free service is awake this morning, and it would report a
 * coordinate bug and an outage as the same red. The stub answers with exactly
 * the shapes OSRM answers with, including the ones that are wrong.
 *
 * <p>The failures worth catching here are the silent ones. A latitude/longitude
 * swap does not raise anything — it produces a confident route through the
 * Arabian Sea and a distance that is merely large — and a router that answers
 * "Ok" with nonsense is indistinguishable from one that answers correctly
 * unless something checks the answer. Every case below is one of those.
 */
@DisplayName("Routing: reading a road, and declining a wrong one")
class RoutePlannerTest {

    /** Ananda Auto's yard at Pune, and FC Bhiwandi. A real 130-ish km lane. */
    private static final GeoPoint PUNE = new GeoPoint(18.5204, 73.8567);
    private static final GeoPoint BHIWANDI = new GeoPoint(19.2967, 73.0631);

    private HttpServer server;
    private final AtomicReference<String> lastPath = new AtomicReference<>();
    private volatile int status = 200;
    private volatile String body = "";

    @BeforeEach
    void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            lastPath.set(exchange.getRequestURI().toString());
            byte[] out = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        server.start();
    }

    @AfterEach
    void stopStub() {
        server.stop(0);
    }

    private RoutePlanner planner() {
        return new RoutePlanner(true, "http://127.0.0.1:" + server.getAddress().getPort(), 2000, 4000);
    }

    private RoutePlanner.RoutePlan plan() {
        return planner().plan(PUNE, BHIWANDI, new Rng(1));
    }

    // --- the coordinate order ---------------------------------------------

    @Test
    @DisplayName("asks for longitude first, and reads longitude first back")
    void coordinateOrder() {
        // Pune to Bhiwandi, as OSRM would give it: [lon, lat], with a bend.
        body = ok(1_53_000, new double[][] {
                {73.8567, 18.5204},
                {73.5000, 18.9000},
                {73.0631, 19.2967}});

        RoutePlanner.RoutePlan plan = plan();

        // The request. Longitude before latitude, both endpoints, in the path.
        assertThat(lastPath.get())
                .startsWith("/route/v1/driving/73.856700,18.520400;73.063100,19.296700")
                .contains("geometries=geojson");

        // The answer. The bend is the giveaway: swapped, it would read
        // (73.5, 18.9) — a point in western China rather than Maharashtra.
        assertThat(plan.source()).isEqualTo(RouteSource.ROAD);
        GeoPoint bend = plan.points().get(1);
        assertThat(bend.getLat()).isEqualTo(18.9);
        assertThat(bend.getLng()).isEqualTo(73.5);
    }

    @Test
    @DisplayName("keeps the consignment's own endpoints, not the router's snapped ones")
    void endpointsArePinned() {
        // OSRM snaps to the nearest road, which here is 400-odd metres from the
        // yard gate. The geofences are drawn around the yard, not the road.
        body = ok(1_53_000, new double[][] {
                {73.8600, 18.5240},
                {73.5000, 18.9000},
                {73.0670, 19.3000}});

        RoutePlanner.RoutePlan plan = plan();

        assertThat(plan.points().getFirst().getLat()).isEqualTo(PUNE.getLat());
        assertThat(plan.points().getFirst().getLng()).isEqualTo(PUNE.getLng());
        assertThat(plan.points().getLast().getLat()).isEqualTo(BHIWANDI.getLat());
        assertThat(plan.points().getLast().getLng()).isEqualTo(BHIWANDI.getLng());
    }

    // --- the distance ------------------------------------------------------

    @Test
    @DisplayName("reports the road distance, not the length of the thinned line")
    void distanceComesFromTheRouter() {
        body = ok(153_400, new double[][] {
                {73.8567, 18.5204},
                {73.5000, 18.9000},
                {73.0631, 19.2967}});

        RoutePlanner.RoutePlan plan = plan();

        // 153.4 km along the carriageway. The three points describe about 120,
        // so a recomputed figure would be visibly short — which is exactly the
        // understatement that fed the ETA engine before routing existed.
        assertThat(plan.distanceKm()).isEqualTo(153.4);
        assertThat(plan.distanceKm()).isGreaterThan(PUNE.distanceTo(BHIWANDI));
    }

    // --- the answers that must be refused ----------------------------------

    @Test
    @DisplayName("falls back when the road is implausibly longer than the straight line")
    void implausibleDetourIsRefused() {
        // 4,000 km for a 120 km lane. Arithmetically fine, geographically not:
        // a coordinate mix-up routes around a landmass and still says "Ok".
        body = ok(4_000_000, new double[][] {
                {73.8567, 18.5204},
                {60.0000, 12.0000},
                {73.0631, 19.2967}});

        RoutePlanner.RoutePlan plan = plan();

        assertThat(plan.source()).isEqualTo(RouteSource.SYNTHETIC);
        // And the distance goes with it: a wrong distance that looks measured
        // is worse than an honest estimate, because the ETA engine believes it.
        assertThat(plan.distanceKm()).isLessThan(500);
    }

    @Test
    @DisplayName("falls back when the router says NoRoute")
    void noRouteIsRefused() {
        body = "{\"code\":\"NoRoute\",\"routes\":[]}";

        assertThat(plan().source()).isEqualTo(RouteSource.SYNTHETIC);
    }

    @Test
    @DisplayName("falls back when the router errors, and does not fail the booking")
    void serverErrorFallsBack() {
        status = 500;
        body = "upstream is having a day";

        RoutePlanner.RoutePlan plan = plan();

        assertThat(plan.source()).isEqualTo(RouteSource.SYNTHETIC);
        assertThat(plan.points()).hasSizeGreaterThanOrEqualTo(2);
        assertThat(plan.distanceKm()).isGreaterThan(0);
    }

    @Test
    @DisplayName("falls back when nothing is listening at all")
    void unreachableFallsBack() {
        server.stop(0);

        RoutePlanner.RoutePlan plan = plan();

        assertThat(plan.source()).isEqualTo(RouteSource.SYNTHETIC);
        assertThat(plan.points()).hasSizeGreaterThanOrEqualTo(2);
    }

    @Test
    @DisplayName("makes no request at all when routing is switched off")
    void disabledNeverCalls() {
        body = ok(153_400, new double[][] {{73.8567, 18.5204}, {73.0631, 19.2967}});

        RoutePlanner off = new RoutePlanner(
                false, "http://127.0.0.1:" + server.getAddress().getPort(), 2000, 4000);
        RoutePlanner.RoutePlan plan = off.plan(PUNE, BHIWANDI, new Rng(1));

        assertThat(plan.source()).isEqualTo(RouteSource.SYNTHETIC);
        assertThat(lastPath.get()).isNull();
    }

    // --- thinning ----------------------------------------------------------

    @Test
    @DisplayName("thins a long route but keeps both ends exactly")
    void longRouteIsThinned() {
        // 1,500 points, as a long lane's simplified overview really does come
        // back. Every one of them would be a row in shipment_route.
        double[][] coords = new double[1500][];
        for (int i = 0; i < 1500; i++) {
            double t = i / 1499.0;
            coords[i] = new double[] {
                    PUNE.getLng() + (BHIWANDI.getLng() - PUNE.getLng()) * t,
                    PUNE.getLat() + (BHIWANDI.getLat() - PUNE.getLat()) * t};
        }
        body = ok(153_400, coords);

        RoutePlanner.RoutePlan plan = plan();

        assertThat(plan.source()).isEqualTo(RouteSource.ROAD);
        assertThat(plan.points()).hasSizeLessThanOrEqualTo(401);
        // The ends survive thinning: they are what the geofences are drawn
        // around, so losing the last point loses the arrival.
        assertThat(plan.points().getFirst().getLat()).isEqualTo(PUNE.getLat());
        assertThat(plan.points().getLast().getLat()).isEqualTo(BHIWANDI.getLat());
        // And the distance is untouched by thinning.
        assertThat(plan.distanceKm()).isEqualTo(153.4);
    }

    // --- the stub's wire shape ---------------------------------------------

    /** An OSRM "Ok" response: metres, and GeoJSON coordinates as [lon, lat]. */
    private static String ok(double metres, double[][] lonLat) {
        List<String> pairs = new ArrayList<>();
        for (double[] p : lonLat) {
            pairs.add("[%s,%s]".formatted(p[0], p[1]));
        }
        return """
                {"code":"Ok","routes":[{"distance":%s,"duration":9000,
                 "geometry":{"type":"LineString","coordinates":[%s]}}]}"""
                .formatted(metres, String.join(",", pairs));
    }
}
