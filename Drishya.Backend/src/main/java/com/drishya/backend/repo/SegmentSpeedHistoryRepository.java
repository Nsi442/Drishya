package com.drishya.backend.repo;

import com.drishya.backend.domain.SegmentSpeedHistory;
import com.drishya.backend.domain.enums.DayType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * <b>Shared across every tenant. Do not add a tenant filter here.</b>
 *
 * <p>This is one of exactly two repositories in the codebase that is not
 * tenant-scoped, and the omission is the product rather than an oversight.
 * Pooling how fast a road runs is what makes prediction improve as the cluster
 * grows; scoping it per tenant would leave every test passing and quietly
 * reduce the system to a single-vendor tracker.
 *
 * <p>Nothing identifying is pooled. A row is a mean, a sample count and a time
 * bucket — it cannot be traced back to a vendor, a consignment or a vehicle.
 */
@Repository
public interface SegmentSpeedHistoryRepository extends JpaRepository<SegmentSpeedHistory, String> {

    Optional<SegmentSpeedHistory> findBySegmentIdAndHourBucketAndDayType(
            String segmentId, int hourBucket, DayType dayType);

    List<SegmentSpeedHistory> findBySegmentLaneId(String laneId);

    /**
     * The cluster's mean road speed for an hour of the day, across every lane.
     *
     * <p>For a corridor the cluster has no history for at all. A booking into
     * such a site still has to promise something, and the alternatives are both
     * worse: a hard-coded speed is a guess that will argue with the engine the
     * moment a lane does appear, and no estimate at all pushes the consignment
     * off the receiving desk's board entirely, which is the fault this exists
     * to stop.
     *
     * <p>Weighted by sample count, so a segment the cluster has driven forty
     * times counts for more than one it has driven twice.
     */
    @Query("""
            SELECT SUM(h.meanSpeedKmph * h.sampleCount) / SUM(h.sampleCount)
            FROM SegmentSpeedHistory h
            WHERE h.hourBucket = :hourBucket AND h.dayType = :dayType AND h.sampleCount > 0
            """)
    Double meanSpeedForHour(@Param("hourBucket") int hourBucket, @Param("dayType") DayType dayType);
}
