package com.drishya.backend.service.routing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps putting drawn routes onto real roads, until there are none left.
 *
 * <p><b>Why routing needs this to be finished.</b> A route is decided once, at
 * booking, and never revisited. That is right for the route itself — a road
 * does not move — but it means the decision inherits whatever the router
 * happened to be doing in that one second. Unreachable for a moment, and that
 * consignment is a straight line for the rest of its life.
 *
 * <p>The deployed site showed what that costs. The public router had been
 * answering every request with a mislabelled encoding, so every booking for a
 * week fell back, and the map was twenty-three straight lines with no
 * indication anything was wrong. The cure existed — {@link RouteBackfillService}
 * — but only as an endpoint someone had to know about, behind a service token
 * that was not set. A repair that requires an operator to notice is not a
 * repair; it is a manual.
 *
 * <p>So the same work runs on a timer. Anything still drawn gets asked about
 * again, a few at a time, for as long as it takes. A booking made during an
 * outage is upgraded when the outage ends, without anyone doing anything.
 *
 * <p><b>It backs off rather than nagging.</b> Somebody else's free service that
 * is not answering must not be asked every ten minutes forever. Each
 * unproductive cycle doubles the wait, up to a ceiling; the first success
 * resets it. That keeps a dead router cheap and a recovered one picked up
 * quickly.
 */
@Component
public class RouteBackfillJob {

    private static final Logger log = LoggerFactory.getLogger(RouteBackfillJob.class);

    /** Doubling stops here — roughly a couple of hours between attempts. */
    private static final int MAX_SKIPS = 8;

    private final RouteBackfillService backfill;
    private final boolean routingEnabled;
    private final boolean jobEnabled;
    private final int batchSize;

    /** Cycles to sit out before trying again, and how many are left of them. */
    private int skipEvery = 0;
    private int skipsRemaining = 0;

    public RouteBackfillJob(
            RouteBackfillService backfill,
            @Value("${drishya.routing.enabled:true}") boolean routingEnabled,
            @Value("${drishya.routing.backfill-on-schedule:true}") boolean jobEnabled,
            @Value("${drishya.routing.backfill-batch:5}") int batchSize) {
        this.backfill = backfill;
        this.routingEnabled = routingEnabled;
        this.jobEnabled = jobEnabled;
        this.batchSize = Math.max(1, batchSize);
    }

    /**
     * A small batch, occasionally.
     *
     * <p>Five consignments every ten minutes is thirty requests an hour to a
     * free service — comfortably inside what it is there for, and enough to
     * convert a seeded dataset within an evening. The initial delay keeps it
     * clear of Flyway and the seeder, which on a t3.micro is the busiest the
     * process ever is.
     */
    @Scheduled(fixedDelayString = "${drishya.routing.backfill-cycle-ms:600000}",
               initialDelayString = "${drishya.routing.backfill-initial-delay-ms:180000}")
    public void upgradeSomeRoutes() {
        if (!routingEnabled || !jobEnabled) {
            return;
        }
        if (skipsRemaining > 0) {
            skipsRemaining--;
            return;
        }

        RouteBackfillService.Result result;
        try {
            result = backfill.backfill(batchSize);
        } catch (Exception e) {
            // Never allowed to kill the schedule. An exception out of a
            // scheduled method is swallowed by the executor and the job simply
            // stops running, which is the one outcome that would leave the map
            // drawn forever with nothing in the log to say why.
            log.error("Scheduled route backfill failed: {}", e.getMessage(), e);
            backOff();
            return;
        }

        if (result.attempted() == 0) {
            // Nothing left to upgrade. Silent, because this is the steady state
            // once the work is done and a line every ten minutes saying so is
            // how a log stops being read.
            skipEvery = 0;
            return;
        }

        if (result.rerouted() > 0) {
            log.info("Put {} consignment(s) onto real roads; {} still drawn",
                    result.rerouted(), result.unchanged() + result.failed().size());
            skipEvery = 0;
            skipsRemaining = 0;
        } else {
            // Work was available and none of it succeeded, so the router is not
            // answering. Nothing is wrong with the consignments.
            backOff();
            log.info("Router answered for none of {} consignment(s); next attempt in {} cycles",
                    result.attempted(), skipEvery);
        }
    }

    private void backOff() {
        skipEvery = skipEvery == 0 ? 1 : Math.min(skipEvery * 2, MAX_SKIPS);
        skipsRemaining = skipEvery;
    }
}
