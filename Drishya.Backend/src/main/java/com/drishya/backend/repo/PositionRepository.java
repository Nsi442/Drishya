package com.drishya.backend.repo;

import com.drishya.backend.domain.Position;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Position fixes.
 *
 * <p>Not tenant-scoped by method signature, unlike TripRepository — a position
 * is only reachable through its trip, and the trip is where the boundary is
 * enforced. Every caller here has already proved it owns the trip.
 */
@Repository
public interface PositionRepository extends JpaRepository<Position, Long> {

    /**
     * The route, in the order it was driven.
     *
     * <p>Ordered by device time, not by arrival. A vehicle coming out of a dead
     * zone delivers a burst of buffered fixes at once, and ordering those by
     * when the server saw them draws the vehicle teleporting back and forth.
     */
    List<Position> findByTripIdOrderByDeviceTimestampAsc(String tripId);

    /** Most recent fix first. Limit(1) gives the last known position. */
    List<Position> findByTripIdOrderByDeviceTimestampDesc(String tripId, Limit limit);

    long countByTripId(String tripId);

    /**
     * Distance in metres actually covered by a trip, measured along the fixes
     * rather than as the crow flies.
     *
     * <p>ST_MakeLine over the ordered points, then ST_Length on the geography.
     * Doing this in Java would mean pulling every fix over the wire to add up
     * segment lengths that PostGIS can total without leaving the database.
     */
    @Query(value = """
            SELECT COALESCE(ST_Length(ST_MakeLine(p.location::geometry ORDER BY p.device_timestamp)::geography), 0)
            FROM positions p WHERE p.trip_id = :tripId
            """, nativeQuery = true)
    double travelledMetres(@Param("tripId") String tripId);

    /**
     * Mean speed in km/h between two instants, from the reported speeds.
     *
     * <p>Feeds the nightly rebuild of the shared segment history. Stationary
     * fixes are excluded: a vehicle parked at a dhaba for an hour reports a
     * genuine speed of zero many times over, and averaging those in makes a
     * clear road look permanently congested for everyone on the lane.
     */
    @Query(value = """
            SELECT AVG(p.speed_kmph) FROM positions p
            WHERE p.trip_id = :tripId
              AND p.device_timestamp BETWEEN :from AND :to
              AND p.speed_kmph > 3
            """, nativeQuery = true)
    Double meanSpeedKmph(@Param("tripId") String tripId,
                         @Param("from") Instant from,
                         @Param("to") Instant to);
}
