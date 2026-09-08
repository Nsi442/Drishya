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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The reason the second backend exists: what happens when the first one is no
 * good.
 *
 * <p>Two stubs on two ports, so "OSRM is down" and "BRouter is down" are
 * separate facts rather than one switch. The deployed site spent a week drawing
 * straight lines because there was only ever one service to ask, and every test
 * at the time passed — they all pointed at a stub that answered.
 */
@DisplayName("Routing: falling through to the second service")
class RouterFailoverTest {

    private static final GeoPoint PUNE = new GeoPoint(18.5204, 73.8567);
    private static final GeoPoint BHIWANDI = new GeoPoint(19.2967, 73.0631);

    private HttpServer osrm;
    private HttpServer brouter;
    private volatile int osrmStatus = 200;
    private volatile int brouterStatus = 200;
    private volatile String osrmBody = "";
    private volatile String brouterBody = "";
    private final List<String> hits = new ArrayList<>();
    private final java.util.concurrent.atomic.AtomicReference<String> brouterQuery =
            new java.util.concurrent.atomic.AtomicReference<>();

    @BeforeEach
    void start() throws IOException {
        osrm = serve(() -> osrmStatus, () -> osrmBody, "osrm");
        brouter = serve(() -> brouterStatus, () -> brouterBody, "brouter");
        osrmBody = osrmOk(153_400);
        brouterBody = brouterOk(161_200);
    }

    @AfterEach
    void stop() {
        osrm.stop(0);
        brouter.stop(0);
    }

    private HttpServer serve(java.util.function.IntSupplier status,
                             java.util.function.Supplier<String> body, String who) throws IOException {
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/", exchange -> {
            hits.add(who);
            if ("brouter".equals(who)) {
                brouterQuery.set(exchange.getRequestURI().getQuery());
            }
            byte[] out = body.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status.getAsInt(), out.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(out);
            }
        });
        s.start();
        return s;
    }

    private RoutePlanner planner() {
        return new RoutePlanner(true,
                "http://127.0.0.1:" + osrm.getAddress().getPort(),
                "http://127.0.0.1:" + brouter.getAddress().getPort(),
                2000, 4000);
    }

    @Test
    @DisplayName("uses the first service and never troubles the second")
    void firstServiceWins() {
        RoutePlanner.RoutePlan plan = planner().plan(PUNE, BHIWANDI, new Rng(1));

        assertThat(plan.source()).isEqualTo(RouteSource.ROAD);
        assertThat(plan.distanceKm()).isEqualTo(153.4);
        assertThat(hits)
                .as("a healthy day must send the alternative nothing at all")
                .containsExactly("osrm");
    }

    @Test
    @DisplayName("falls through to the second when the first errors")
    void fallsThroughOnError() {
        osrmStatus = 503;

        RoutePlanner.RoutePlan plan = planner().plan(PUNE, BHIWANDI, new Rng(1));

        assertThat(plan.source()).isEqualTo(RouteSource.ROAD);
        assertThat(plan.distanceKm()).isEqualTo(161.2);       // BRouter's figure
        assertThat(hits).containsExactly("osrm", "brouter");
    }

    @Test
    @DisplayName("falls through when the first answers but has no route")
    void fallsThroughOnNoRoute() {
        osrmBody = "{\"code\":\"NoRoute\",\"routes\":[]}";

        RoutePlanner.RoutePlan plan = planner().plan(PUNE, BHIWANDI, new Rng(1));

        assertThat(plan.source()).isEqualTo(RouteSource.ROAD);
        assertThat(plan.distanceKm()).isEqualTo(161.2);
    }

    @Test
    @DisplayName("falls through when the first returns an implausible distance")
    void fallsThroughOnNonsense() {
        // 4,000 km for a 120 km lane. "Ok", and useless.
        osrmBody = osrmOk(4_000_000);

        RoutePlanner.RoutePlan plan = planner().plan(PUNE, BHIWANDI, new Rng(1));

        assertThat(plan.distanceKm())
                .as("a confident wrong answer must not beat a correct second opinion")
                .isEqualTo(161.2);
    }

    @Test
    @DisplayName("draws the curve only when neither service can help")
    void syntheticOnlyWhenBothFail() {
        osrmStatus = 503;
        brouterStatus = 500;

        RoutePlanner.RoutePlan plan = planner().plan(PUNE, BHIWANDI, new Rng(1));

        assertThat(plan.source()).isEqualTo(RouteSource.SYNTHETIC);
        assertThat(plan.points()).hasSizeGreaterThanOrEqualTo(2);
        assertThat(hits).containsExactly("osrm", "brouter");
    }

    @Test
    @DisplayName("keeps the consignment's own endpoints whichever service answered")
    void endpointsPinnedOnTheAlternative() {
        osrmStatus = 503;

        RoutePlanner.RoutePlan plan = planner().plan(PUNE, BHIWANDI, new Rng(1));

        // BRouter snaps to the nearest road like everyone else; the geofences
        // are drawn around the yard, so the yard wins on either path.
        assertThat(plan.points().getFirst().getLat()).isEqualTo(PUNE.getLat());
        assertThat(plan.points().getLast().getLat()).isEqualTo(BHIWANDI.getLat());
    }

    @Test
    @DisplayName("sends BRouter both coordinate pairs, pipe and all")
    void sendsAWellFormedQuery() {
        osrmStatus = 503;

        planner().plan(PUNE, BHIWANDI, new Rng(1));

        // A literal "|" is not a legal URI character. Left raw it is dropped
        // on the way out, BRouter is asked for "/brouter" with no coordinates,
        // and it answers by closing the connection — "header parser received
        // no bytes", which names nothing. The earlier stub replied to any path
        // regardless of query, so it could not have caught that; this asserts
        // the query arrived and carried both pairs.
        String q = brouterQuery.get();
        assertThat(q).as("the query must survive the trip").isNotNull();
        assertThat(q).contains("lonlats=");

        // Decoded, because that is what the far end sees. On the wire the pipe
        // travels as %7C — encoded on purpose, since a literal one is not a
        // legal URI character and is dropped in transit — and a server decodes
        // it back before splitting on it.
        String lonlats = java.net.URLDecoder.decode(
                q.split("lonlats=")[1].split("&")[0], java.nio.charset.StandardCharsets.UTF_8);
        assertThat(lonlats)
                .as("both coordinate pairs, separated by a pipe once decoded")
                .contains("|")
                .contains("73.8567")
                .contains("73.0631");
        assertThat(lonlats.split("\\|")).as("exactly two points").hasSize(2);
    }

    @Test
    @DisplayName("reads BRouter's three-value coordinates without tripping on elevation")
    void handlesElevationInCoordinates() {
        osrmStatus = 503;

        RoutePlanner.RoutePlan plan = planner().plan(PUNE, BHIWANDI, new Rng(1));

        // Every coordinate in the stub carries a third value. Taken as lat/lng
        // by index, that is simply ignored; unpacked as a pair, it throws.
        assertThat(plan.source()).isEqualTo(RouteSource.ROAD);
        assertThat(plan.points()).hasSize(3);
    }

    // --- the two wire shapes ------------------------------------------------

    private static String osrmOk(double metres) {
        return """
                {"code":"Ok","routes":[{"distance":%s,"duration":9000,
                 "geometry":{"type":"LineString","coordinates":
                   [[73.8567,18.5204],[73.5,18.9],[73.0631,19.2967]]}}]}"""
                .formatted(metres);
    }

    /** BRouter: properties as strings, coordinates as lon/lat/elevation. */
    private static String brouterOk(double metres) {
        return """
                {"type":"FeatureCollection","features":[{"type":"Feature",
                 "properties":{"track-length":"%s","total-time":"9400","cost":"12345"},
                 "geometry":{"type":"LineString","coordinates":
                   [[73.8567,18.5204,560.0],[73.5,18.9,410.0],[73.0631,19.2967,12.0]]}}]}"""
                .formatted((long) metres);
    }
}
