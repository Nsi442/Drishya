package com.drishya.backend.service.routing;

import com.drishya.backend.domain.GeoPoint;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.enums.RouteSource;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.seed.Rng;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Puts already-booked consignments onto real roads.
 *
 * <p>Routing arrived after the data did. Every consignment booked before it —
 * the whole seeded dataset, and anything created while the router was
 * unreachable — carries the three-point curve {@code GeoUtil.buildRoute} draws.
 * On a map that is most of what anyone sees, so routing new bookings alone
 * leaves the product looking exactly as it did.
 *
 * <p><b>The seeder is deliberately not changed.</b> It must stay deterministic
 * and must run offline at boot; sixty network calls in the startup path would
 * cost both. Seeding continues to draw curves, and this upgrades them
 * afterwards, on demand, when someone asks.
 *
 * <p><b>One consignment per transaction, with a pause between.</b> A network
 * call inside a transaction holds it open for as long as the other end takes,
 * and a batch of them holds one open for the sum. Each is committed on its own,
 * so an interrupted run leaves a partly-upgraded dataset rather than nothing —
 * which is fine, because {@code routeSource} says exactly which ones were done
 * and a second run continues from there.
 */
@Service
public class RouteBackfillService {

    private static final Logger log = LoggerFactory.getLogger(RouteBackfillService.class);

    /**
     * Milliseconds between calls.
     *
     * <p>The router is somebody else's free service. A backfill is the one
     * place this project would ever make requests in a burst, so it does not:
     * a few a second is neighbourly and finishes sixty consignments inside a
     * minute either way.
     */
    private final long pauseMs;

    private final ShipmentRepository shipments;
    private final RoutePlanner planner;
    private final TransactionTemplate tx;

    public RouteBackfillService(ShipmentRepository shipments, RoutePlanner planner,
                                PlatformTransactionManager txManager,
                                @Value("${drishya.routing.backfill-pause-ms:400}") long pauseMs) {
        this.shipments = shipments;
        this.planner = planner;
        this.pauseMs = pauseMs;

        // A template rather than @Transactional on the per-consignment method.
        // Spring's transaction advice lives in a proxy, and a method called
        // from inside the same bean never crosses it — so an annotation here
        // would read as one transaction per consignment while silently giving
        // none at all. This boundary is real because it is drawn by hand.
        this.tx = new TransactionTemplate(txManager);
    }

    /**
     * Re-routes up to {@code limit} consignments that still have a drawn route.
     *
     * <p>Bounded rather than "all of them" so one call is a known amount of
     * work and a known number of requests to somebody else's server. Run it
     * again to continue; it picks up where it left off because the ones already
     * done are no longer SYNTHETIC.
     */
    public Result backfill(int limit) {
        List<String> ids = shipments.findIdsNeedingRoute(RoutePlanner.ROUTE_VERSION, PageRequest.of(0, Math.max(1, limit)));
        if (ids.isEmpty()) {
            return new Result(0, 0, 0, List.of());
        }

        log.info("Re-routing {} consignment(s) with a drawn or out-of-date route", ids.size());

        int rerouted = 0;
        int unchanged = 0;
        List<String> failures = new ArrayList<>();

        for (String id : ids) {
            try {
                if (rerouteOne(id)) {
                    rerouted++;
                } else {
                    // The router did not answer, so the curve stands. Not an
                    // error: the consignment is exactly as valid as it was.
                    unchanged++;
                }
            } catch (Exception e) {
                log.warn("Could not re-route {}: {}", id, e.toString());
                failures.add(id);
            }

            if (pauseMs > 0) {
                try {
                    Thread.sleep(pauseMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    log.warn("Backfill interrupted after {} consignment(s)", rerouted + unchanged);
                    break;
                }
            }
        }

        log.info("Backfill done: {} re-routed, {} left drawn, {} failed",
                rerouted, unchanged, failures.size());
        return new Result(ids.size(), rerouted, unchanged, failures);
    }

    /**
     * One consignment, committed on its own.
     *
     * <p>Each stands alone, so a failure at consignment forty does not undo the
     * thirty-nine before it — and the network call that decides the answer
     * happens inside a transaction that covers one row, not sixty.
     */
    private boolean rerouteOne(String id) {
        return Boolean.TRUE.equals(tx.execute(status -> rewrite(id)));
    }

    private boolean rewrite(String id) {
        Shipment s = shipments.findById(id).orElse(null);
        if (s == null || s.getOrigin() == null || s.getDestination() == null) {
            return false;
        }

        GeoPoint origin = new GeoPoint(s.getOrigin().getLat(), s.getOrigin().getLng());
        GeoPoint destination = new GeoPoint(s.getDestination().getLat(), s.getDestination().getLng());

        // The seed is irrelevant when the router answers, and when it does not
        // the fallback would only redraw the same curve this consignment
        // already has. Either way nothing is lost by deriving it from the id.
        RoutePlanner.RoutePlan plan = planner.plan(origin, destination, new Rng(id.hashCode()));

        if (plan.source() != RouteSource.ROAD) {
            return false;
        }

        s.setRoute(plan.points());
        s.setDistanceKm((int) Math.round(plan.distanceKm()));
        s.setRouteSource(RouteSource.ROAD);
        // Stamped with the generation that produced it, or this row is selected
        // again on the next cycle and the job never finishes.
        s.setRouteVersion(RoutePlanner.ROUTE_VERSION);
        shipments.save(s);

        log.info("{} re-routed onto {} km of road over {} points",
                id, Math.round(plan.distanceKm()), plan.points().size());
        return true;
    }

    /**
     * What a run did.
     *
     * <p>{@code unchanged} is reported separately from {@code failed} because
     * they mean different things: the first is a router that declined to
     * answer and a consignment that is still perfectly usable, the second is
     * something that went wrong and is worth looking at.
     */
    public record Result(int attempted, int rerouted, int unchanged, List<String> failed) {

        public boolean isComplete() {
            return failed.isEmpty() && unchanged == 0;
        }
    }
}
