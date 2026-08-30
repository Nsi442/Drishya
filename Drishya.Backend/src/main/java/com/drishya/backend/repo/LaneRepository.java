package com.drishya.backend.repo;

import com.drishya.backend.domain.Lane;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Lanes are shared infrastructure: many tenants run the same corridor into the
 * same site, which is exactly why the history hanging off them is worth having.
 * Nothing here takes a tenant id.
 */
@Repository
public interface LaneRepository extends JpaRepository<Lane, String> {

    Optional<Lane> findByCode(String code);

    List<Lane> findByFulfilmentCentreId(String fcId);

    /**
     * The lane whose origin is nearest a point, within a tolerance.
     *
     * <p>How a new shipment is attached to a corridor the cluster already knows
     * something about, rather than starting from no history at all. A vendor
     * dispatching from an estate two kilometres from another vendor's warehouse
     * is, for prediction purposes, on the same road.
     */
    @Query(value = """
            SELECT * FROM lanes l
            WHERE l.fc_id = :fcId
              AND ST_DWithin(l.origin_point,
                             ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                             :toleranceM)
            ORDER BY ST_Distance(l.origin_point,
                                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)
            LIMIT 1
            """, nativeQuery = true)
    Optional<Lane> findNearestOrigin(@Param("fcId") String fcId,
                                     @Param("lat") double lat,
                                     @Param("lon") double lon,
                                     @Param("toleranceM") double toleranceM);
}
