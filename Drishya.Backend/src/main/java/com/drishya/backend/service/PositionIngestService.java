package com.drishya.backend.service;

import com.drishya.backend.domain.Geo;
import com.drishya.backend.domain.Position;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.dto.PositionDtos.IngestAck;
import com.drishya.backend.dto.PositionDtos.PositionBatch;
import com.drishya.backend.dto.PositionDtos.PositionReport;
import com.drishya.backend.repo.PositionRepository;
import com.drishya.backend.repo.TripRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Accepts position batches, and does as little as possible while doing it.
 *
 * <p>Validate, stamp the server-side receive time, write, publish an event per
 * fix, return. The geofence check, the ETA recomputation and anything else that
 * cares runs on a listener afterwards. See PositionRecorded for why.
 */
@Service
public class PositionIngestService {

    private static final Logger log = LoggerFactory.getLogger(PositionIngestService.class);

    /**
     * How far in the future a device clock may be before its fix is refused.
     *
     * <p>Some tolerance is necessary — phone clocks drift and a fix a few
     * seconds ahead is normal. Accepting an arbitrarily future timestamp is
     * not: it would let a client place a vehicle at the gate before it arrives,
     * and every timeline and ETA downstream reads device time.
     */
    private static final Duration MAX_CLOCK_SKEW = Duration.ofMinutes(5);

    /**
     * How far in the past. Generous, because this is exactly what a dead-zone
     * catch-up looks like — a vehicle out of coverage for an hour delivers an
     * hour of buffered fixes at once, and those are the most valuable fixes in
     * the system rather than suspect ones.
     */
    private static final Duration MAX_BACKDATE = Duration.ofHours(12);

    private final TripRepository trips;
    private final PositionRepository positions;
    private final ApplicationEventPublisher events;

    public PositionIngestService(TripRepository trips,
                                 PositionRepository positions,
                                 ApplicationEventPublisher events) {
        this.trips = trips;
        this.positions = positions;
        this.events = events;
    }

    /**
     * @param tenantId the caller's tenant, already resolved from the token. A
     *     trip belonging to anybody else is reported as not found rather than
     *     forbidden — telling a caller that an id exists but is not theirs
     *     already leaks that it exists.
     */
    @Transactional
    public IngestAck ingest(String tripId, String tenantId, PositionBatch batch) {
        Trip trip = trips.findByIdAndTenantId(tripId, tenantId)
                .orElseThrow(() -> ApiException.notFound("No such trip."));

        Instant receivedAt = Instant.now();
        Instant tooLate = receivedAt.plus(MAX_CLOCK_SKEW);
        Instant tooEarly = receivedAt.minus(MAX_BACKDATE);

        List<Position> accepted = new ArrayList<>();
        List<String> rejections = new ArrayList<>();

        for (int i = 0; i < batch.positions().size(); i++) {
            PositionReport report = batch.positions().get(i);
            Instant deviceTime = Instant.ofEpochMilli(report.deviceTimestamp());

            if (deviceTime.isAfter(tooLate)) {
                rejections.add("fix %d: device clock is more than %d minutes ahead"
                        .formatted(i, MAX_CLOCK_SKEW.toMinutes()));
                continue;
            }
            if (deviceTime.isBefore(tooEarly)) {
                rejections.add("fix %d: older than %d hours"
                        .formatted(i, MAX_BACKDATE.toHours()));
                continue;
            }

            Position position = new Position();
            position.setTrip(trip);
            position.setLocation(Geo.point(report.lat(), report.lon()));
            position.setSpeedKmph(report.speedKmph());
            position.setHeadingDeg(report.headingDeg());
            position.setDeviceTimestamp(deviceTime);
            // Stamped here, never taken from the request body.
            position.setReceivedAt(receivedAt);
            position.setSource(report.source());
            accepted.add(position);
        }

        if (!accepted.isEmpty()) {
            positions.saveAll(accepted);
        }

        // One event for the whole batch, with the fixes sorted into the order
        // they were driven in. The geofence is a state machine and has to see
        // them that way — see PositionRecorded for what happens when each point
        // is published separately and the listeners race each other.
        //
        // Sorted by device time, not by arrival: a vehicle coming out of a dead
        // zone delivers its buffer out of order, and evaluating that as driven
        // order teleports it in and out of the fence.
        if (!accepted.isEmpty()) {
            List<PositionRecorded.Fix> fixes = accepted.stream()
                    .sorted(java.util.Comparator.comparing(Position::getDeviceTimestamp))
                    .map(p -> new PositionRecorded.Fix(
                            p.getId(), p.getLat(), p.getLon(), p.getSpeedKmph(),
                            p.getDeviceTimestamp(), p.getReceivedAt(), p.getSource()))
                    .toList();
            events.publishEvent(new PositionRecorded(trip.getId(), tenantId, fixes));
        }

        if (!rejections.isEmpty()) {
            log.warn("Trip {}: rejected {} of {} fixes", tripId,
                    rejections.size(), batch.positions().size());
        }

        return new IngestAck(tripId, accepted.size(), rejections.size(),
                rejections, receivedAt.toEpochMilli());
    }
}
