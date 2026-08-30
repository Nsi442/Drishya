package com.drishya.backend.service;

import com.drishya.backend.domain.enums.PositionSource;

import java.time.Instant;
import java.util.List;

/**
 * Published once per accepted batch of position fixes.
 *
 * <p><b>Why an event rather than a method call.</b> Ingest is the hot path. The
 * controller's job is to validate, persist and return 202; the geofence check,
 * the ETA recomputation and whatever else gets bolted on later are somebody
 * else's problem, running on another thread. It also keeps zone detection from
 * being a hard dependency of ingest — a failure there should lose a gate event,
 * not reject the position that would have proved the vehicle was there.
 *
 * <p><b>Why the batch and not each point.</b> This was originally published per
 * fix, which is the obvious reading and is wrong. The geofence is a state
 * machine over an ordered sequence: it writes GATE_IN when a trip crosses from
 * outside to inside, which requires knowing where the previous fix was. Firing
 * one async listener per point means every listener in a batch reads the trip's
 * last zone before any of them writes it, they all conclude they saw the
 * crossing, and a single approach produces four GATE_IN rows and a negative
 * dock turnaround. Concurrency and a state machine do not mix; the batch is the
 * unit that can be evaluated in order, so the batch is what gets published.
 *
 * <p>Fixes carry plain values rather than entities: the listener runs on
 * another thread, outside the ingest transaction, where a lazy association
 * would be detached.
 */
public record PositionRecorded(
        String tripId,
        String tenantId,
        /** Ordered by device timestamp, oldest first. Order is the contract. */
        List<Fix> fixes) {

    /** One accepted fix, already persisted. */
    public record Fix(
            long positionId,
            double lat,
            double lon,
            Double speedKmph,
            Instant deviceTimestamp,
            Instant receivedAt,
            PositionSource source) {
    }
}
