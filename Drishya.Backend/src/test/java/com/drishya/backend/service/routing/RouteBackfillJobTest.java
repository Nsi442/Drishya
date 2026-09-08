package com.drishya.backend.service.routing;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The back-off, which is the part with state and therefore the part that breaks.
 *
 * <p>No Spring and no network: the job's decisions are a function of what the
 * backfill returned, so a stub that returns chosen results tests them exactly.
 */
@DisplayName("Scheduled route backfill: when to try, and when to leave it alone")
class RouteBackfillJobTest {

    /** Counts calls and answers with whatever the test wants next. */
    private static final class StubBackfill extends RouteBackfillService {
        private final AtomicInteger calls = new AtomicInteger();
        private RouteBackfillService.Result next = new Result(0, 0, 0, List.of());
        private RuntimeException throwThis;

        StubBackfill() {
            super(null, null, null, 0);
        }

        @Override
        public Result backfill(int limit) {
            calls.incrementAndGet();
            if (throwThis != null) {
                throw throwThis;
            }
            return next;
        }
    }

    private static RouteBackfillJob job(StubBackfill stub) {
        return new RouteBackfillJob(stub, true, true, 5);
    }

    /** Runs n cycles and reports how many actually reached the backfill. */
    private static int cycles(RouteBackfillJob job, StubBackfill stub, int n) {
        int before = stub.calls.get();
        for (int i = 0; i < n; i++) {
            job.upgradeSomeRoutes();
        }
        return stub.calls.get() - before;
    }

    @Test
    @DisplayName("keeps working while consignments are being upgraded")
    void worksEveryCycleWhileProductive() {
        StubBackfill stub = new StubBackfill();
        stub.next = new RouteBackfillService.Result(5, 5, 0, List.of());

        assertThat(cycles(job(stub), stub, 5))
                .as("a productive cycle must never be followed by a pause")
                .isEqualTo(5);
    }

    @Test
    @DisplayName("stands off a router that answers for nobody, and backs further off each time")
    void backsOffWhenTheRouterIsSilent() {
        StubBackfill stub = new StubBackfill();
        stub.next = new RouteBackfillService.Result(5, 0, 5, List.of());
        RouteBackfillJob job = job(stub);

        // Work is there and none of it succeeds. The waits should lengthen:
        // 1 attempt, then a skipped cycle, then two, then four.
        int attempts = cycles(job, stub, 12);

        assertThat(attempts)
                .as("12 cycles against a dead router should cost far fewer than 12 requests")
                .isLessThan(6)
                .isGreaterThan(0);
    }

    @Test
    @DisplayName("comes straight back when the router recovers")
    void recoversImmediately() {
        StubBackfill stub = new StubBackfill();
        stub.next = new RouteBackfillService.Result(5, 0, 5, List.of());
        RouteBackfillJob job = job(stub);
        cycles(job, stub, 6);                      // earn a long back-off

        stub.next = new RouteBackfillService.Result(5, 5, 0, List.of());
        // Cycles until the next attempt lands, then it should be every cycle.
        for (int i = 0; i < MAX_WAIT; i++) {
            job.upgradeSomeRoutes();
        }
        assertThat(cycles(job, stub, 3))
                .as("one success must clear the back-off entirely")
                .isEqualTo(3);
    }

    private static final int MAX_WAIT = 10;

    @Test
    @DisplayName("stays quiet, and cheap, once there is nothing left to do")
    void quietWhenThereIsNothingToUpgrade() {
        StubBackfill stub = new StubBackfill();
        stub.next = new RouteBackfillService.Result(0, 0, 0, List.of());

        // Nothing to do is the steady state, not a failure — it must not build
        // up a back-off, or the first consignment booked during an outage would
        // wait hours for its first look.
        assertThat(cycles(job(stub), stub, 4)).isEqualTo(4);
    }

    @Test
    @DisplayName("survives a backfill that throws, and does not stop scheduling")
    void survivesAnException() {
        StubBackfill stub = new StubBackfill();
        stub.throwThis = new IllegalStateException("database is away");
        RouteBackfillJob job = job(stub);

        // An exception out of a scheduled method is swallowed by the executor
        // and the job silently never runs again — the one outcome that leaves
        // the map drawn forever with nothing in the log to explain it.
        for (int i = 0; i < 4; i++) {
            job.upgradeSomeRoutes();
        }
        stub.throwThis = null;
        stub.next = new RouteBackfillService.Result(5, 5, 0, List.of());
        for (int i = 0; i < MAX_WAIT; i++) {
            job.upgradeSomeRoutes();
        }
        assertThat(cycles(job, stub, 2))
                .as("the schedule must still be alive after a failure")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("does nothing at all when routing is switched off")
    void silentWhenRoutingIsDisabled() {
        StubBackfill stub = new StubBackfill();
        stub.next = new RouteBackfillService.Result(5, 5, 0, List.of());
        RouteBackfillJob off = new RouteBackfillJob(stub, false, true, 5);

        assertThat(cycles(off, stub, 5))
                .as("ROUTING_ENABLED=false must mean no requests, not fewer")
                .isZero();
    }
}
