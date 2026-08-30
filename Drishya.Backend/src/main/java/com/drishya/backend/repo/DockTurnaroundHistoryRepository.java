package com.drishya.backend.repo;

import com.drishya.backend.domain.DockTurnaroundHistory;
import com.drishya.backend.domain.enums.DayType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * <b>Also shared across every tenant, for the same reason.</b>
 *
 * <p>Queue depth is a property of the dock, not of whoever happens to be
 * queuing at it. Every vendor waiting in the same yard is observing the same
 * thing, and this is the half of the ETA a route planner cannot give you —
 * anyone can estimate driving time to a postcode, but the reason a delivery
 * misses its slot is usually the ninety minutes spent inside the gate
 * afterwards.
 */
@Repository
public interface DockTurnaroundHistoryRepository extends JpaRepository<DockTurnaroundHistory, String> {

    Optional<DockTurnaroundHistory> findByFulfilmentCentreIdAndHourBucketAndDayType(
            String fcId, int hourBucket, DayType dayType);
}
