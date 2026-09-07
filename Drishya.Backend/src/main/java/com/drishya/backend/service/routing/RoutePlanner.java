package com.drishya.backend.service.routing;

import com.drishya.backend.domain.GeoPoint;
import com.drishya.backend.domain.enums.RouteSource;
import com.drishya.backend.seed.GeoUtil;
import com.drishya.backend.seed.Rng;
import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Works out the road a consignment will actually travel.
 *
 * <p>Before this existed a route was three points: origin, one randomly bowed
 * midpoint, destination. It drew a gentle curve across open country, and the
 * distance was the length of that curve — so a 160 km road read as 128 km, and
 * that number went straight into the ETA engine as an input.
 *
 * <p>Now the road is asked for. OSRM's public demo server answers with the real
 * driving geometry and the real road distance, and both are stored on the
 * consignment at booking.
 *
 * <p><b>Once per booking, never per request.</b> The route is computed when the
 * consignment is created and persisted in {@code shipment_route}; nothing reads
 * it back over the network. A few dozen calls a day sits comfortably inside
 * what a free demo service is for, and adds no per-request latency to anything.
 *
 * <p><b>It always returns a plan.</b> Every failure — unreachable, slow,
 * rate-limited, a shape that does not parse, a route that crosses water because
 * the coordinates were nonsense — falls back to the synthetic curve. Booking a
 * consignment must not depend on a third party being awake, and the seeder runs
 * with no network at all.
 */
@Service
public class RoutePlanner {

    private static final Logger log = LoggerFactory.getLogger(RoutePlanner.class);

    /**
     * Beyond this many points the geometry is thinned.
     *
     * <p>OSRM's "simplified" overview is already sparse, but a 1,200 km lane
     * still comes back with several hundred points, and every one of them is a
     * row in shipment_route and a coordinate in every ShipmentDto that carries
     * the route. A few hundred is far more than a map at country zoom can
     * resolve.
     */
    private static final int MAX_POINTS = 400;

    /** A route this much longer than the straight line is not a road. */
    private static final double IMPLAUSIBLE_DETOUR_FACTOR = 4.0;

    private final RestClient client;
    private final boolean enabled;
    private final String baseUrl;

    public RoutePlanner(
            @Value("${drishya.routing.enabled:true}") boolean enabled,
            @Value("${drishya.routing.base-url:https://router.project-osrm.org}") String baseUrl,
            @Value("${drishya.routing.connect-timeout-ms:3000}") long connectTimeoutMs,
            @Value("${drishya.routing.read-timeout-ms:6000}") long readTimeoutMs) {

        this.enabled = enabled;
        this.baseUrl = baseUrl.replaceAll("/+$", "");

        // Bounded on both sides. A slow router must delay a booking by seconds,
        // not hold the request thread until something else times out.
        HttpClient http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeoutMs))
                // Honour -Dhttps.proxyHost where one is set; harmless where it
                // is not. java.net.http ignores system proxies unless asked.
                .proxy(ProxySelector.getDefault())
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();

        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofMillis(readTimeoutMs));

        this.client = RestClient.builder().requestFactory(factory).build();
    }

    /**
     * The road from origin to destination, or the drawn curve if none is had.
     *
     * <p>{@code rng} is only consulted for the fallback, so a run that reaches
     * the router produces the same result whatever the seed — which is what
     * makes the fallback deterministic and the real answer authoritative.
     */
    public RoutePlan plan(GeoPoint origin, GeoPoint destination, Rng rng) {
        if (enabled) {
            try {
                RoutePlan road = requestRoute(origin, destination);
                if (road != null) {
                    return road;
                }
            } catch (Exception e) {
                // Deliberately broad. Anything at all going wrong out here is a
                // reason to draw the line ourselves, never a reason to fail the
                // booking the operator is waiting on.
                log.warn("Routing failed ({}); falling back to a synthetic route",
                        e.getClass().getSimpleName());
            }
        }
        return synthetic(origin, destination, rng);
    }

    private RoutePlan requestRoute(GeoPoint origin, GeoPoint destination) {
        // OSRM takes LONGITUDE FIRST, in the path, and returns GeoJSON
        // coordinates in the same order. Both are the opposite of how every
        // other coordinate in this codebase is written, and getting either
        // backwards produces a route across the Arabian Sea rather than an
        // error, so both are converted in exactly one place: here.
        String path = "/route/v1/driving/%f,%f;%f,%f?overview=simplified&geometries=geojson"
                .formatted(origin.getLng(), origin.getLat(),
                        destination.getLng(), destination.getLat());

        OsrmResponse body = client.get()
                .uri(baseUrl + path)
                .retrieve()
                .body(OsrmResponse.class);

        if (body == null || !"Ok".equals(body.code())
                || body.routes() == null || body.routes().isEmpty()) {
            log.warn("Router returned no usable route (code={})",
                    body == null ? "null" : body.code());
            return null;
        }

        OsrmRoute route = body.routes().getFirst();
        if (route.geometry() == null || route.geometry().coordinates() == null) {
            return null;
        }

        List<GeoPoint> points = new ArrayList<>();
        for (List<Double> pair : route.geometry().coordinates()) {
            if (pair == null || pair.size() < 2) {
                continue;
            }
            points.add(new GeoPoint(pair.get(1), pair.get(0)));   // [lon, lat]
        }

        if (points.size() < 2) {
            return null;
        }

        // The endpoints OSRM reports are snapped to the nearest road, which can
        // be a few hundred metres from the yard or the bay. The consignment's
        // own origin and destination are what the geofences are drawn around,
        // so they win.
        points.set(0, origin);
        points.set(points.size() - 1, destination);

        double distanceKm = route.distance() / 1000.0;
        double straightKm = GeoUtil.haversine(origin, destination);

        // A road is longer than the straight line, but not four times longer.
        // Anything past that is a coordinate mix-up or a router confidently
        // routing around an ocean, and a wrong distance is worse than a
        // synthetic one because it looks authoritative.
        if (distanceKm <= 0 || (straightKm > 1 && distanceKm > straightKm * IMPLAUSIBLE_DETOUR_FACTOR)) {
            log.warn("Router returned an implausible {} km for a {} km straight line; ignoring",
                    Math.round(distanceKm), Math.round(straightKm));
            return null;
        }

        List<GeoPoint> thinned = thin(points, MAX_POINTS);
        log.info("Routed {} km over {} points (thinned from {})",
                Math.round(distanceKm), thinned.size(), points.size());
        return new RoutePlan(thinned, distanceKm, RouteSource.ROAD);
    }

    private RoutePlan synthetic(GeoPoint origin, GeoPoint destination, Rng rng) {
        List<GeoPoint> points = GeoUtil.buildRoute(origin, destination, rng);
        return new RoutePlan(points, GeoUtil.routeLength(points), RouteSource.SYNTHETIC);
    }

    /**
     * Keep every nth point, and always both ends.
     *
     * <p>Evenly rather than by shape: a Douglas-Peucker simplification would
     * keep the corners and is what a mapping library would do, but the distance
     * is already known from the router and is not recomputed from these points,
     * so the geometry only has to look like the road. Losing a bend is
     * invisible at the zoom this is drawn at.
     */
    private static List<GeoPoint> thin(List<GeoPoint> points, int max) {
        if (points.size() <= max) {
            return points;
        }
        int stride = (int) Math.ceil(points.size() / (double) max);
        int last = points.size() - 1;
        List<GeoPoint> out = new ArrayList<>(max + 1);
        int i = 0;
        for (; i < points.size(); i += stride) {
            out.add(points.get(i));
        }
        // Compared by index rather than by value: GeoPoint has no equals(), so
        // a value comparison here would silently be an identity comparison —
        // right by accident today and wrong the moment anyone adds one.
        if (i - stride != last) {
            out.add(points.get(last));
        }
        return out;
    }

    // --- what the caller gets --------------------------------------------

    /**
     * A planned route, the distance that goes with it, and which of the two
     * kinds it is.
     *
     * <p>The distance travels WITH the points rather than being recomputed from
     * them. For a road route it is the router's own figure, measured along the
     * carriageway; recomputing it from a thinned polyline would shorten every
     * lane by cutting the corners off it.
     */
    public record RoutePlan(List<GeoPoint> points, double distanceKm, RouteSource source) {

        public boolean isRoad() {
            return source == RouteSource.ROAD;
        }
    }

    // --- the wire shape OSRM answers with ---------------------------------
    //
    // Only the fields actually used are declared; Jackson is configured to
    // ignore the rest, of which there are many (legs, waypoints, weights).

    record OsrmResponse(String code, List<OsrmRoute> routes) {}

    record OsrmRoute(double distance, double duration, OsrmGeometry geometry) {}

    record OsrmGeometry(String type, List<List<Double>> coordinates) {}
}
