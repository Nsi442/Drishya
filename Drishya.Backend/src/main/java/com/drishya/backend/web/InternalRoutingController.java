package com.drishya.backend.web;

import com.drishya.backend.service.routing.RouteBackfillService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Puts consignments booked before routing existed onto real roads.
 *
 * <p>Routing applies at booking, so it only ever improves what is booked next.
 * Everything already in the database — the whole seeded dataset — still carries
 * the three-point curve, which is most of what anyone opening the map sees.
 * This is how that gets fixed once, rather than by re-seeding and losing the
 * trips, documents and receipts hanging off those consignments.
 *
 * <p><b>Internal, for the same reason the training export is.</b> It rewrites
 * consignments across every tenant, so there is no bearer token that could
 * legitimately authorise it: a vendor's token is scoped to one tenant, and this
 * is not. It sits behind the service token and 404s without it.
 *
 * <p><b>Run more than once.</b> A call does at most {@code limit} consignments
 * and reports what is left; the ones it finished are no longer SYNTHETIC, so
 * the next call continues rather than repeating. That is deliberate — one call
 * is a bounded number of requests to somebody else's free routing service.
 */
@RestController
@RequestMapping("/api/v1/internal")
public class InternalRoutingController {

    /**
     * Consignments per call, when the caller does not say.
     *
     * <p>Comfortably more than the seeded dataset, so the common case is one
     * call, while still being a ceiling rather than "however many there are".
     */
    private static final int DEFAULT_LIMIT = 100;

    private final RouteBackfillService backfill;
    private final InternalServiceToken gate;

    public InternalRoutingController(RouteBackfillService backfill, InternalServiceToken gate) {
        this.backfill = backfill;
        this.gate = gate;
    }

    @PostMapping("/route-backfill")
    public RouteBackfillService.Result routeBackfill(
            @RequestHeader(value = "X-Service-Token", required = false) String presented,
            @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit) {

        gate.require(presented);
        return backfill.backfill(limit);
    }
}
