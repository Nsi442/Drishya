package com.drishya.backend.repo;

import com.drishya.backend.domain.EtaPrediction;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

/** Predictions, and the accuracy report scored from them. */
@Repository
public interface EtaPredictionRepository extends JpaRepository<EtaPrediction, String> {

    List<EtaPrediction> findByTripIdOrderByMadeAtDesc(String tripId);

    /** The current estimate for a trip: the most recent row written. */
    Optional<EtaPrediction> findFirstByTripIdOrderByMadeAtDesc(String tripId);

    /** Rows still awaiting an actual, so arrival can score all of them at once. */
    List<EtaPrediction> findByTripIdAndActualDockInAtIsNull(String tripId);

    /**
     * Mean absolute error in minutes over every scored prediction.
     *
     * <p><b>Absolute, not signed.</b> A model that is twenty minutes optimistic
     * half the time and twenty minutes pessimistic the other half has a signed
     * error of zero and is worthless. Reporting the signed mean would make this
     * system look perfect precisely when it is not.
     */
    @Query(value = """
            SELECT AVG(ABS(e.error_minutes)) FROM eta_predictions e
            WHERE e.actual_dock_in_at IS NOT NULL
            """, nativeQuery = true)
    Double meanAbsoluteErrorMinutes();

    /**
     * The same figure per lane. A single overall number hides one badly
     * predicted corridor inside five good ones, and the corridor is the thing a
     * dispatcher would want warning about.
     */
    @Query(value = """
            SELECT l.code AS lane, AVG(ABS(e.error_minutes)) AS mae, COUNT(*) AS samples
            FROM eta_predictions e
            JOIN trips t ON t.id = e.trip_id
            JOIN lanes l ON l.id = t.lane_id
            WHERE e.actual_dock_in_at IS NOT NULL
            GROUP BY l.code
            ORDER BY l.code
            """, nativeQuery = true)
    List<LaneAccuracy> meanAbsoluteErrorByLane();

    /** Feeds the training export: one scored prediction per row. */
    @Query("select e from EtaPrediction e where e.actualDockInAt is not null order by e.madeAt")
    List<EtaPrediction> findAllScored();

    /** Projection for the per-lane accuracy report. */
    interface LaneAccuracy {
        String getLane();

        double getMae();

        long getSamples();
    }
}
