package com.drishya.backend.service.eta;

import com.drishya.backend.domain.DockTurnaroundHistory;
import com.drishya.backend.domain.LaneSegment;
import com.drishya.backend.domain.Position;
import com.drishya.backend.domain.SegmentSpeedHistory;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.enums.DayType;
import com.drishya.backend.repo.DockTurnaroundHistoryRepository;
import com.drishya.backend.repo.LaneSegmentRepository;
import com.drishya.backend.repo.PositionRepository;
import com.drishya.backend.repo.SegmentSpeedHistoryRepository;
import com.drishya.backend.repo.TripRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Rebuilds the two shared history tables from completed trips, nightly.
 *
 * <p><b>This job is what makes the cluster worth belonging to.</b> It reads
 * every tenant's completed runs and folds them into one set of lane speeds and
 * dock turnarounds that every tenant then predicts from. A vendor who ran the
 * Pune corridor on Tuesday morning improves the estimate a different vendor
 * gets on the same corridor next Tuesday. That is the property a single-vendor
 * tracker cannot reproduce at any level of engineering effort — it simply has
 * fewer observations of the same road.
 *
 * <p>Nothing identifying crosses the boundary. What lands in these tables is a
 * mean, a sample count and a time bucket; no consignment, vendor or vehicle can
 * be recovered from a row, which is what makes pooling it defensible.
 *
 * <h2>Why nightly, and not incrementally</h2>
 *
 * <p>A running average updated per position lets one stuck vehicle drag the
 * mean for everybody until it moves, and there is no way to take it back out.
 * Recomputing from the completed trips in a window is idempotent — it can be
 * re-run after a bad day's data is corrected, and it produces the same answer
 * every time.
 */
@Component
public class HistoryAggregationJob {

    private static final Logger log = LoggerFactory.getLogger(HistoryAggregationJob.class);

    private static final ZoneId SITE_ZONE = ZoneId.of("Asia/Kolkata");

    /**
     * How far back to fold in. Wide enough that a quiet week still rebuilds a
     * usable picture, narrow enough that a road resurfaced two months ago stops
     * counting against today's estimate.
     */
    private static final Duration WINDOW = Duration.ofDays(60);

    /** Below this, a fix is parked rather than moving and would drag the mean down. */
    private static final double MOVING_THRESHOLD_KMPH = 3;

    private final TripRepository trips;
    private final PositionRepository positions;
    private final LaneSegmentRepository segments;
    private final SegmentSpeedHistoryRepository segmentSpeeds;
    private final DockTurnaroundHistoryRepository dockHistory;

    public HistoryAggregationJob(TripRepository trips, PositionRepository positions,
                                 LaneSegmentRepository segments,
                                 SegmentSpeedHistoryRepository segmentSpeeds,
                                 DockTurnaroundHistoryRepository dockHistory) {
        this.trips = trips;
        this.positions = positions;
        this.segments = segments;
        this.segmentSpeeds = segmentSpeeds;
        this.dockHistory = dockHistory;
    }

    /** 02:30 IST — after the night runs have docked, before the morning peak. */
    @Scheduled(cron = "0 30 2 * * *", zone = "Asia/Kolkata")
    @Transactional
    public void rebuild() {
        Instant since = Instant.now().minus(WINDOW);
        List<Trip> completed = trips.findCompletedForAggregation(since);

        if (completed.isEmpty()) {
            log.info("Nightly aggregation: no completed trips in the window, leaving history as it is");
            return;
        }

        int speedRows = 0;
        int dockRows = 0;
        for (Trip trip : completed) {
            try {
                speedRows += foldSegmentSpeeds(trip);
                dockRows += foldDockTurnaround(trip);
            } catch (Exception e) {
                log.error("Aggregation failed for trip {}: {}", trip.getId(), e.getMessage());
            }
        }

        log.info("Nightly aggregation over {} trips: {} segment observations, {} dock observations",
                completed.size(), speedRows, dockRows);
    }

    /**
     * Folds one trip's observed speeds into the per-segment history.
     *
     * <p>Each fix is attributed to the segment it was taken on and the hour it
     * was taken in, so a trip spanning the morning peak contributes to the peak
     * buckets for the segments it was actually on at the time — not to whichever
     * bucket it happened to start in.
     */
    private int foldSegmentSpeeds(Trip trip) {
        if (trip.getLane() == null) {
            return 0;
        }
        List<Position> fixes = positions.findByTripIdOrderByDeviceTimestampAsc(trip.getId());
        int folded = 0;

        for (Position fix : fixes) {
            Double speed = fix.getSpeedKmph();
            if (speed == null || speed < MOVING_THRESHOLD_KMPH) {
                continue;
            }
            LaneSegmentRepository.LaneLocation where =
                    segments.locateOnLane(trip.getLane().getId(), fix.getLat(), fix.getLon());
            if (where == null) {
                continue;
            }

            int hour = fix.getDeviceTimestamp().atZone(SITE_ZONE).getHour();
            DayType dayType = DayType.of(fix.getDeviceTimestamp(), SITE_ZONE);

            Optional<SegmentSpeedHistory> existing = segmentSpeeds
                    .findBySegmentIdAndHourBucketAndDayType(where.getSegmentId(), hour, dayType);

            SegmentSpeedHistory row = existing.orElseGet(() -> {
                SegmentSpeedHistory fresh = new SegmentSpeedHistory();
                fresh.setId(where.getSegmentId() + "-" + dayType.name() + "-" + hour);
                fresh.setSegment(segments.getReferenceById(where.getSegmentId()));
                fresh.setHourBucket(hour);
                fresh.setDayType(dayType);
                fresh.setSampleCount(0);
                fresh.setMeanSpeedKmph(0);
                return fresh;
            });

            // Incremental mean. Exact, and avoids holding every observation in
            // memory to divide at the end.
            int n = row.getSampleCount() + 1;
            row.setMeanSpeedKmph(row.getMeanSpeedKmph() + (speed - row.getMeanSpeedKmph()) / n);
            row.setSampleCount(n);
            row.setUpdatedAt(Instant.now());
            segmentSpeeds.save(row);
            folded++;
        }
        return folded;
    }

    /**
     * Folds the yard queue and the unload into the per-site history.
     *
     * <p>Two separate numbers. Gate-in to dock-in is the queue, which is what
     * the ETA adds; dock-in to dock-out is the unload, which is what a
     * fulfilment centre would be measured on. Averaging them together would
     * make a site with a fast unload and a long queue look identical to one
     * with the reverse, and only one of those is the vendor's problem.
     */
    private int foldDockTurnaround(Trip trip) {
        if (trip.getGateInAt() == null || trip.getDockInAt() == null
                || trip.getLane() == null || trip.getLane().getFulfilmentCentre() == null) {
            return 0;
        }

        String fcId = trip.getLane().getFulfilmentCentre().getId();
        int hour = trip.getGateInAt().atZone(SITE_ZONE).getHour();
        DayType dayType = DayType.of(trip.getGateInAt(), SITE_ZONE);

        double queueMinutes = Duration.between(trip.getGateInAt(), trip.getDockInAt())
                .toMinutes();
        Double turnaroundMinutes = trip.getDockOutAt() == null ? null
                : (double) Duration.between(trip.getDockInAt(), trip.getDockOutAt()).toMinutes();

        if (queueMinutes < 0) {
            return 0;
        }

        Optional<DockTurnaroundHistory> existing = dockHistory
                .findByFulfilmentCentreIdAndHourBucketAndDayType(fcId, hour, dayType);

        DockTurnaroundHistory row = existing.orElseGet(() -> {
            DockTurnaroundHistory fresh = new DockTurnaroundHistory();
            fresh.setId(fcId + "-" + dayType.name() + "-" + hour);
            fresh.setFulfilmentCentre(trip.getLane().getFulfilmentCentre());
            fresh.setHourBucket(hour);
            fresh.setDayType(dayType);
            fresh.setSampleCount(0);
            fresh.setMeanQueueMinutes(0);
            fresh.setMeanTurnaroundMinutes(0);
            return fresh;
        });

        int n = row.getSampleCount() + 1;
        row.setMeanQueueMinutes(
                row.getMeanQueueMinutes() + (queueMinutes - row.getMeanQueueMinutes()) / n);
        if (turnaroundMinutes != null) {
            row.setMeanTurnaroundMinutes(row.getMeanTurnaroundMinutes()
                    + (turnaroundMinutes - row.getMeanTurnaroundMinutes()) / n);
        }
        row.setSampleCount(n);
        row.setUpdatedAt(Instant.now());
        dockHistory.save(row);
        return 1;
    }

    /** Exposed so the aggregation can be triggered by hand for a demo. */
    public void rebuildNow() {
        log.info("Aggregation triggered manually");
        rebuild();
    }

    /** Truncates an instant to its hour, for logging a window boundary. */
    static Instant hourOf(Instant instant) {
        return instant.truncatedTo(ChronoUnit.HOURS);
    }
}
