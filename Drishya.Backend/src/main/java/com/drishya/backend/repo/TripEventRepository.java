package com.drishya.backend.repo;

import com.drishya.backend.domain.TripEvent;
import com.drishya.backend.domain.enums.TripEventType;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Trip events. Append-only — there is deliberately no update or delete path,
 * because this is what the evidence pack is assembled from and an audit trail
 * that can be tidied up afterwards is not an audit trail.
 */
@Repository
public interface TripEventRepository extends JpaRepository<TripEvent, Long> {

    List<TripEvent> findByTripIdOrderByAtAsc(String tripId);

    List<TripEvent> findByTripIdAndType(String tripId, TripEventType type);

    boolean existsByTripIdAndType(String tripId, TripEventType type);
}
