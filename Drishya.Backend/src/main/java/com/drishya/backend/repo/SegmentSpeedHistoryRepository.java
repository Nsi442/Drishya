package com.drishya.backend.repo;

import com.drishya.backend.domain.SegmentSpeedHistory;
import com.drishya.backend.domain.enums.DayType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
