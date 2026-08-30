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

        double remainingM = 0;
        double weightedSpeedSum = 0;
        int minSamples = Integer.MAX_VALUE;
        int remainingSegments = 0;
        double travelMinutes = 0;

        for (LaneSegment segment : ordered) {
            if (segment.getSeq() < currentSeq) {
                continue;
            }
            double lengthM = segment.getLengthM();
            if (segment.getSeq() == currentSeq) {
                lengthM *= (1 - fractionDone);
            }
            if (lengthM <= 0) {
                continue;
            }

            // The hour the vehicle actually reaches this stretch, not the hour
            // it set off in.
            Instant reachedAt = at.plus(Duration.ofSeconds((long) (travelMinutes * 60)));
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

        Instant gateArrival = at.plus(Duration.ofSeconds((long) (travelMinutes * 60)));
        int gateHour = gateArrival.atZone(SITE_ZONE).getHour();
        Optional<DockTurnaroundHistory> dock = fc == null ? Optional.empty()
                : dockHistory.findByFulfilmentCentreIdAndHourBucketAndDayType(
                        fc.getId(), gateHour, DayType.of(gateArrival, SITE_ZONE));

        double queueMinutes = dock.map(DockTurnaroundHistory::getMeanQueueMinutes).orElse(0d);
        int dockSamples = dock.map(DockTurnaroundHistory::getSampleCount).orElse(0);

        double meanSpeedAhead = remainingM > 0 ? weightedSpeedSum / remainingM : 0;
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
                minSamples == Integer.MAX_VALUE ? 0 : minSamples,
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
