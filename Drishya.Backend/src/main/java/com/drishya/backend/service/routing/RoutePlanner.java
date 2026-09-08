package com.drishya.backend.service.routing;

import com.drishya.backend.domain.GeoPoint;
import com.drishya.backend.domain.enums.RouteSource;
import com.drishya.backend.seed.GeoUtil;
import com.drishya.backend.seed.Rng;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
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

    private final List<RoutingBackend> backends;
    private final boolean enabled;

    public RoutePlanner(
            @Value("${drishya.routing.enabled:true}") boolean enabled,
            @Value("${drishya.routing.base-url:https://router.project-osrm.org}") String baseUrl,
            @Value("${drishya.routing.brouter-url:https://brouter.de}") String brouterUrl,
            @Value("${drishya.routing.connect-timeout-ms:3000}") long connectTimeoutMs,
            @Value("${drishya.routing.read-timeout-ms:6000}") long readTimeoutMs) {

        this.enabled = enabled;
        RestClient client = HttpRouting.client(connectTimeoutMs, readTimeoutMs);

        // Order matters and is not arbitrary. OSRM stays first because it is
        // where the load already sits and what the lane distances were measured
        // against; BRouter is asked only when the first cannot answer, so a
        // healthy day sends it nothing at all.
        //
        // A blank URL removes that backend entirely, which is how you turn one
        // off without turning routing off.
        List<RoutingBackend> chain = new ArrayList<>();
        if (baseUrl != null && !baseUrl.isBlank()) {
            chain.add(new OsrmBackend(client, baseUrl, MAX_POINTS));
        }
        if (brouterUrl != null && !brouterUrl.isBlank()) {
            chain.add(new BRouterBackend(client, brouterUrl, MAX_POINTS));
        }
        this.backends = List.copyOf(chain);
    }

    /**
     * The road from origin to destination, or the drawn curve if none is had.
     *
     * <p>{@code rng} is only consulted for the fallback, so a run that reaches
     * the router produces the same result whatever the seed — which is what
     * makes the fallback deterministic and the real answer authoritative.
     */
    public RoutePlan plan(GeoPoint origin, GeoPoint destination, Rng rng) {
        if (!enabled) {
            return synthetic(origin, destination, rng);
        }

        for (RoutingBackend backend : backends) {
            try {
                RoutingBackend.Road road = backend.route(origin, destination);
                if (road != null && plausible(road, origin, destination, backend.name())) {
                    log.info("Routed {} km over {} points via {}",
                            Math.round(road.distanceKm()), road.points().size(), backend.name());
                    return pinned(road, origin, destination);
                }
            } catch (Exception e) {
                // Deliberately broad, and deliberately not fatal: the next
                // backend gets its turn, and if none of them answers the
                // booking still completes with a drawn line.
                //
                // The message and the root cause are logged, not just the class
                // name. They were not, and the omission cost a diagnosis: every
                // booking on the deployed site fell back while the box could
                // reach the router in half a second, and all the log would say
                // was "RestClientException" — the base class Spring throws for
                // several unrelated reasons, naming none of them. A failure
                // this code deliberately swallows is exactly the failure whose
                // log line has to carry everything.
                log.warn("Routing via {} failed ({}: {}); root cause {}",
                        backend.name(), e.getClass().getSimpleName(), e.getMessage(), rootCause(e));
            }
        }

        log.warn("No routing service answered; falling back to a synthetic route");
        return synthetic(origin, destination, rng);
    }

    /**
     * The consignment's own endpoints, not the ones the router snapped to.
     *
     * <p>Every router moves the ends to the nearest road, which can be a few
     * hundred metres from the yard or the bay. The geofences are drawn around
     * the yard, so the yard wins.
     */
    private static RoutePlan pinned(RoutingBackend.Road road, GeoPoint origin, GeoPoint destination) {
        List<GeoPoint> points = new ArrayList<>(road.points());
        points.set(0, origin);
        points.set(points.size() - 1, destination);
        return new RoutePlan(points, road.distanceKm(), RouteSource.ROAD);
    }

    /**
     * A road is longer than the straight line, but not four times longer.
     *
     * <p>Anything past that is a coordinate mix-up or a router confidently
     * going around an ocean, and a wrong distance is worse than a synthetic one
     * because it looks authoritative. Checked here rather than in each backend
     * so a new one cannot be added without it.
     */
    private static boolean plausible(RoutingBackend.Road road, GeoPoint origin,
                                     GeoPoint destination, String who) {
        double straightKm = GeoUtil.haversine(origin, destination);
        if (road.distanceKm() <= 0
                || (straightKm > 1 && road.distanceKm() > straightKm * IMPLAUSIBLE_DETOUR_FACTOR)) {
            log.warn("{} returned an implausible {} km for a {} km straight line; ignoring",
                    who, Math.round(road.distanceKm()), Math.round(straightKm));
            return false;
        }
        return true;
    }

    /**
     * The innermost cause, as "Type: message".
     *
     * <p>Spring wraps the thing that actually went wrong. A body it could not
     * parse arrives as RestClientException wrapping HttpMessageNotReadableException
     * wrapping the Jackson error that names the field; a connection that died
     * mid-read arrives as the same outer class wrapping an IOException. The
     * outer name distinguishes neither.
     */
    private static String rootCause(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t == e ? "none" : t.getClass().getSimpleName() + ": " + t.getMessage();
    }

    private RoutePlan synthetic(GeoPoint origin, GeoPoint destination, Rng rng) {
        List<GeoPoint> points = GeoUtil.buildRoute(origin, destination, rng);
        return new RoutePlan(points, GeoUtil.routeLength(points), RouteSource.SYNTHETIC);
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
}
