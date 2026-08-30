package com.drishya.backend.repo;

import com.drishya.backend.domain.LaneSegment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** The ordered stretches a lane is cut into, and where a vehicle sits on them. */
@Repository
public interface LaneSegmentRepository extends JpaRepository<LaneSegment, String> {

    List<LaneSegment> findByLaneIdOrderBySeqAsc(String laneId);

    /**
     * Which segment a point is on, and how far through it, as a 0..1 fraction.
     *
     * <p>ST_LineLocatePoint is what turns "somewhere near this road" into "62%
     * through segment 3", which makes remaining distance a subtraction rather
     * than a guess. It operates on geometry rather than geography, hence the
     * casts — the error from doing this in degrees is negligible over a segment
     * and the alternative is projecting every lane into a metric CRS.
     *
     * <p>Ordered by true spheroidal distance so the nearest segment wins even
     * when two run alongside each other.
     */
    @Query(value = """
            SELECT s.seq AS "seq",
                   ST_LineLocatePoint(s.geometry::geometry,
                                      ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)) AS "fraction",
                   s.length_m AS "lengthM",
                   s.id AS "segmentId"
            FROM lane_segments s
            WHERE s.lane_id = :laneId
            ORDER BY ST_Distance(s.geometry,
                                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)
            LIMIT 1
            """, nativeQuery = true)
    LaneLocation locateOnLane(@Param("laneId") String laneId,
                              @Param("lat") double lat,
                              @Param("lon") double lon);

    /**
     * Projection for the locate query.
     *
     * <p>The aliases in the SQL above are double-quoted deliberately. Postgres
     * folds unquoted identifiers to lower case, so an alias of length_m or even
     * lengthM comes back as "lengthm" and Spring Data cannot bind it to
     * getLengthM() — the projection silently yields null rather than failing.
     */
    interface LaneLocation {
        int getSeq();

        double getFraction();

        double getLengthM();

        String getSegmentId();
    }
}
