package com.drishya.backend.service.eta;

import com.drishya.backend.domain.DockTurnaroundHistory;
import com.drishya.backend.domain.FulfilmentCentre;
import com.drishya.backend.domain.Lane;
import com.drishya.backend.domain.LaneSegment;
import com.drishya.backend.domain.Position;
import com.drishya.backend.domain.SegmentSpeedHistory;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.enums.DayType;
import com.drishya.backend.repo.DockTurnaroundHistoryRepository;
import com.drishya.backend.repo.LaneSegmentRepository;
import com.drishya.backend.repo.PositionRepository;
import com.drishya.backend.repo.SegmentSpeedHistoryRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;

/**
 * Builds the feature vector for a trip, and with it the heuristic estimate.
 *
 * <p><b>There is exactly one of these, and both paths go through it.</b> A live
 * prediction and a row of the training export are produced by the same method
 * with the same arithmetic. Reimplementing any of this in the training script
 * would reintroduce the train/serve skew that EtaFeatures exists to prevent.
 *
 * <h2>The heuristic</h2>
 *
 * <p>Remaining time is summed segment by segment rather than taken as one
 * average over the whole corridor. A single mean would smear a congested urban
 * approach into the open highway before it, and be wrong in both directions
 * depending on where the vehicle happens to be.
 *
 * <p>Each segment is costed at the speed history holds for the hour the vehicle
 * will actually reach it, not the hour it is now. A truck leaving at 06:00 for a
 * four-hour run arrives in the middle of the morning peak, and pricing its final
 * segments at the empty-road speed it is currently enjoying is how a predictor
 * ends up confidently an hour early.
 *
 * <p>Then dock queue time is added, and the result is dock-in, not gate arrival.
 * That distinction is the product. Any routing service can say when a vehicle
 * reaches a postcode; the reason a delivery misses its slot is usually the time
 * spent inside the gate afterwards, and that number only exists because
 * turnarounds are pooled across the cluster.
 */
@Service
public class FeatureBuilder {

    private static final Logger log = LoggerFactory.getLogger(FeatureBuilder.class);

    /**
     * Every fulfilment centre in this system is in India, so hour buckets are
     * IST. The moment a site sits in another zone this has to come off the
     * fulfilment centre row instead — an hour bucket computed in the wrong zone
     * silently reads the wrong traffic profile.
     */
    private static final ZoneId SITE_ZONE = ZoneId.of("Asia/Kolkata");

    /** How far back to look when measuring what the vehicle is actually doing. */
    private static final int RECENT_FIX_COUNT = 10;

    /**
     * Beyond this, the last known position is too old to predict from.
     *
     * <p>Nothing in the arithmetic breaks without this guard — which is the
     * problem. A trip whose last fix is four days old kept being predicted
     * every sixty seconds as "52 minutes from now", and because the booked slot
     * had closed four days earlier the dispatcher was shown "85 hours late".
     * Every number in that chain was correct and the conclusion was worthless:
     * the platform did not know where the vehicle was, and said so in the
     * language of confident lateness.
     *
     * <p>Two hours is well past any normal coverage gap — the simulator's dead
     * zone is minutes, and a real vehicle out of signal for two hours has a
     * genuine tracking problem. Past it, the honest answer is no prediction.
     */
    private static final Duration MAX_FIX_AGE = Duration.ofHours(2);

    private final LaneSegmentRepository segments;
    private final SegmentSpeedHistoryRepository segmentSpeeds;
    private final DockTurnaroundHistoryRepository dockHistory;
    private final PositionRepository positions;

    public FeatureBuilder(LaneSegmentRepository segments,
                          SegmentSpeedHistoryRepository segmentSpeeds,
                          DockTurnaroundHistoryRepository dockHistory,
                          PositionRepository positions) {
        this.segments = segments;
        this.segmentSpeeds = segmentSpeeds;
        this.dockHistory = dockHistory;
        this.positions = positions;
    }

    /**
     * @return the features, or empty when this trip cannot be predicted at all —
     *     no lane matched, or no position reported yet. Returning empty rather
     *     than a guess matters: an estimate nobody can justify is worse than
     *     visibly having none, and the UI can say "awaiting first fix" instead
     *     of showing a fabricated time.
     */
    public Optional<EtaFeatures> build(Trip trip, Instant at) {
        Lane lane = trip.getLane();
        if (lane == null) {
            return Optional.empty();
        }

        List<Position> recent = positions.findByTripIdOrderByDeviceTimestampDesc(
                trip.getId(), Limit.of(RECENT_FIX_COUNT));
        if (recent.isEmpty()) {
            return Optional.empty();
        }
        Position last = recent.getFirst();

        // Refuse to predict from a position we no longer believe. Returning
        // empty makes the UI say "tracking lost" instead of inventing an
        // arrival time from a stale fix.
        if (Duration.between(last.getDeviceTimestamp(), at).compareTo(MAX_FIX_AGE) > 0) {
            log.debug("Trip {} last reported {} ago; too stale to predict",
                    trip.getId(), Duration.between(last.getDeviceTimestamp(), at));
            return Optional.empty();
        }

        List<LaneSegment> ordered = segments.findByLaneIdOrderBySeqAsc(lane.getId());
        if (ordered.isEmpty()) {
            return Optional.empty();
        }

        // Where on the lane the vehicle is: which segment, and how far through it.
        LaneSegmentRepository.LaneLocation where =
                segments.locateOnLane(lane.getId(), last.getLat(), last.getLon());
        int currentSeq = where == null ? 0 : where.getSeq();
        double fractionDone = where == null ? 0 : clamp(where.getFraction(), 0, 1);

        FulfilmentCentre fc = lane.getFulfilmentCentre();
        DayType dayType = DayType.of(at, SITE_ZONE);

        LaneWalk walk = walkLane(ordered, currentSeq, fractionDone, at);
        DockQueue queue = queueAfter(fc, at, walk.travelMinutes());

        double remainingM = walk.remainingM();
        int remainingSegments = walk.remainingSegments();
        int minSamples = walk.minSamples();
        double travelMinutes = walk.travelMinutes();
        double meanSpeedAhead = walk.meanSpeedAhead();
        double queueMinutes = queue.minutes();
        int dockSamples = queue.samples();
        double observedSpeed = recent.stream()
                .map(Position::getSpeedKmph)
                .filter(s -> s != null && s > 3)
                .mapToDouble(Double::doubleValue)
                .average().orElse(meanSpeedAhead);

        double elapsedMinutes = trip.getStartedAt() == null ? 0
                : Duration.between(trip.getStartedAt(), at).toMinutes();

        EtaFeatures features = new EtaFeatures(
                remainingM,
                remainingSegments,
                at.atZone(SITE_ZONE).getHour(),
                dayType == DayType.WEEKEND ? 1 : 0,
                meanSpeedAhead,
                minSamples,
                observedSpeed,
                elapsedMinutes,
                queueMinutes,
                dockSamples,
                fc == null ? 0 : fc.getDockCount(),
                travelMinutes + queueMinutes);

        if (log.isDebugEnabled()) {
            log.debug("Trip {} features: {}", trip.getId(), features.asMap());
        }
        return Optional.of(features);
    }

    /**
     * What the engine expects a run down this lane to take, setting off at
     * {@code departAt} — travel plus the queue it expects at the far end.
     *
     * <p><b>This exists so that a booking can be promised something honest.</b>
     * {@link #build} needs a position fix, because it has to know where on the
     * lane the vehicle is; at the moment a consignment is booked there is no
     * trip, no vehicle moving and no fix, so it declines. But a booking does not
     * need to ask where the vehicle is. It knows: at the start, at the pickup
     * time the vendor just typed in.
     *
     * <p>So this walks the whole lane from segment zero rather than from a
     * located position, and costs every stretch at the same hour-bucketed
     * history {@code build} uses. It is the same arithmetic reading the same
     * rows — which is the point. The alternative, a flat average speed at the
     * booking screen, has been tried twice in this codebase and disagreed with
     * the engine by up to nine hours on a long lane, showing on screen as
     * "8 h 45 m late" against a slot the guess had itself chosen.
     *
     * @return empty when there is no lane or no segments on it — a genuinely new
     *     corridor the cluster has no history for. The caller must have a
     *     fallback; inventing a number here would be the thing this avoids.
     */
    public Optional<Duration> timeFromDeparture(Lane lane, Instant departAt) {
        if (lane == null) {
            return Optional.empty();
        }
        List<LaneSegment> ordered = segments.findByLaneIdOrderBySeqAsc(lane.getId());
        if (ordered.isEmpty()) {
            return Optional.empty();
        }
        LaneWalk walk = walkLane(ordered, 0, 0, departAt);
        DockQueue queue = queueAfter(lane.getFulfilmentCentre(), departAt, walk.travelMinutes());
        return Optional.of(
                Duration.ofSeconds((long) ((walk.travelMinutes() + queue.minutes()) * 60)));
    }

    /**
     * Door-to-door speed assumed when the cluster has no history whatsoever.
     *
     * <p>Roughly what the seeded lanes average once their urban approaches are
     * included. It is a constant and therefore the weakest number in the
     * system, which is why it is the last resort and why a window built on it
     * is never marked agreed: the engine replaces it from the first real fix.
     */
    private static final double NO_HISTORY_SPEED_KMPH = 45;

    /**
     * What a journey of this length is expected to take, for a corridor the
     * cluster has no lane for.
     *
     * <p><b>The coarse cousin of {@link #timeFromDeparture}, and the reason a
     * booking into an unknown site is still visible.</b> Only three lanes are
     * seeded, so most vendor-and-site pairs match none; before this, those
     * bookings fell through to a flat thirty-six hours from now, unrelated to
     * the pickup, which put them past the end of today and off the receiving
     * desk's arrival board entirely. Invisible is a worse answer than
     * approximate.
     *
     * <p>It is still the cluster's own data rather than a constant: the pooled
     * mean road speed for the hour of departure, weighted by how much of that
     * road has actually been driven, plus the same dock queue a lane estimate
     * would add. It is deliberately NOT treated as an agreement — the caller
     * leaves the window unagreed so the engine replaces it with a real
     * prediction on the first cycle that has a position to work from.
     *
     * @return empty when the cluster has no speed history at all, which is only
     *     true of a system that has never run.
     */
    public Optional<Duration> timeForDistance(double distanceKm, FulfilmentCentre fc, Instant departAt) {
        if (distanceKm <= 0) {
            return Optional.empty();
        }
        int hour = departAt.atZone(SITE_ZONE).getHour();
        Double pooled = segmentSpeeds.meanSpeedForHour(hour, DayType.of(departAt, SITE_ZONE));
        // A database seeded before the lanes existed has no speed history at
        // all, and DataSeeder skips a populated database, so it never gains
        // any. That is the deployed environment, and it must still promise
        // something anchored to the pickup — an unanchored promise is the fault
        // this whole chain exists to stop.
        double speed = (pooled != null && pooled > 1) ? pooled : NO_HISTORY_SPEED_KMPH;
        double travelMinutes = distanceKm / speed * 60d;
        DockQueue queue = queueAfter(fc, departAt, travelMinutes);
        log.debug("No lane for this corridor; costing {} km at the pooled {} km/h for hour {}",
                Math.round(distanceKm), Math.round(speed), hour);
        return Optional.of(Duration.ofSeconds((long) ((travelMinutes + queue.minutes()) * 60)));
    }

    /** What the road ahead costs, and how much the cluster has seen of it. */
    private record LaneWalk(double travelMinutes, double remainingM, double meanSpeedAhead,
                            int minSamples, int remainingSegments) {
    }

    /** The queue the far end is expected to have when the vehicle gets there. */
    private record DockQueue(double minutes, int samples) {
    }

    /**
     * Sums the lane from {@code fromSeq} onwards, costing each stretch at the
     * hour the vehicle will actually reach it.
     *
     * <p>Shared by the live prediction and the booking estimate. They differ
     * only in where they start from, which is the argument.
     */
    private LaneWalk walkLane(List<LaneSegment> ordered, int fromSeq, double fractionDone,
                              Instant departAt) {
        double remainingM = 0;
        double weightedSpeedSum = 0;
        int minSamples = Integer.MAX_VALUE;
        int remainingSegments = 0;
        double travelMinutes = 0;

        for (LaneSegment segment : ordered) {
            if (segment.getSeq() < fromSeq) {
                continue;
            }
            double lengthM = segment.getLengthM();
            if (segment.getSeq() == fromSeq) {
                lengthM *= (1 - fractionDone);
            }
            if (lengthM <= 0) {
                continue;
            }

            // The hour the vehicle actually reaches this stretch, not the hour
            // it set off in.
            Instant reachedAt = departAt.plus(Duration.ofSeconds((long) (travelMinutes * 60)));
            int hourBucket = reachedAt.atZone(SITE_ZONE).getHour();
            DayType bucketDay = DayType.of(reachedAt, SITE_ZONE);

            Optional<SegmentSpeedHistory> history = segmentSpeeds
                    .findBySegmentIdAndHourBucketAndDayType(segment.getId(), hourBucket, bucketDay);

            double speed = history.map(SegmentSpeedHistory::getMeanSpeedKmph)
                    .filter(s -> s > 1)
                    .orElse(segment.getDefaultSpeedKmph());
            int samples = history.map(SegmentSpeedHistory::getSampleCount).orElse(0);

            travelMinutes += (lengthM / 1000d) / speed * 60d;
            remainingM += lengthM;
            weightedSpeedSum += speed * lengthM;
            minSamples = Math.min(minSamples, samples);
            remainingSegments++;
        }

        if (remainingSegments == 0) {
            // Already at the destination end of the lane. Nothing left to drive,
            // but the queue still has to be waited out.
            minSamples = 0;
        }

        return new LaneWalk(
                travelMinutes,
                remainingM,
                remainingM > 0 ? weightedSpeedSum / remainingM : 0,
                minSamples == Integer.MAX_VALUE ? 0 : minSamples,
                remainingSegments);
    }

    /** The pooled dock queue for the hour the vehicle reaches the gate. */
    private DockQueue queueAfter(FulfilmentCentre fc, Instant departAt, double travelMinutes) {
        Instant gateArrival = departAt.plus(Duration.ofSeconds((long) (travelMinutes * 60)));
        int gateHour = gateArrival.atZone(SITE_ZONE).getHour();
        Optional<DockTurnaroundHistory> dock = fc == null ? Optional.empty()
                : dockHistory.findByFulfilmentCentreIdAndHourBucketAndDayType(
                        fc.getId(), gateHour, DayType.of(gateArrival, SITE_ZONE));
        return new DockQueue(
                dock.map(DockTurnaroundHistory::getMeanQueueMinutes).orElse(0d),
                dock.map(DockTurnaroundHistory::getSampleCount).orElse(0));
    }

    /**
     * How wide the confidence band should be, as a fraction of the estimate.
     *
     * <p>Driven by how much the cluster has actually seen of this road at this
     * hour. Two observations and a mean is a guess; forty is a measurement, and
     * the band should say which one the dispatcher is looking at. At one sample
     * this is roughly 57%, at forty roughly 19%.
     *
     * <p>This is the honest fallback until quantile models are trained — see
     * EtaModel, where a fitted model supplies a real 0.1 and 0.9 instead.
     */
    public static double bandFraction(EtaFeatures f) {
        double samples = Math.max(1, Math.min(f.minSamplesAhead(), f.dockSamples()));
        return 0.12 + 0.45 / Math.sqrt(samples);
    }

    private static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
