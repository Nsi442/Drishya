package com.drishya.backend.repo;

import com.drishya.backend.domain.FulfilmentCentre;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** The receiving sites, and the geofence question asked of every position. */
@Repository
public interface FulfilmentCentreRepository extends JpaRepository<FulfilmentCentre, String> {

    /**
     * Which site, if any, is this point inside the arrival geofence of.
     *
     * <p><b>The distance test runs in PostGIS, not in Java.</b> Pulling four
     * sites back and comparing them with a hand-rolled Haversine would look
     * equivalent and be wrong in three ways: it ignores the spheroid, it cannot
     * use the GiST index, and it would have to be kept in step with the SQL the
     * aggregation job uses for the same question. One implementation, in the
     * database, is the only version that stays honest.
     *
     * <p>Native rather than HQL because {@code ST_DWithin} takes the radius as a
     * third argument and reads it from a column on the row being tested — each
     * site carries its own fence. Hibernate Spatial's HQL surface does not
     * express that cleanly, and Hibernate 7 is free to emit different SQL than 6
     * for the same HQL anyway, which is precisely the thing not to leave to
     * chance on the path every ingested point takes.
     *
     * <p>Geography, not geometry: the radius is metres on a spheroid with no
     * projection chosen anywhere.
     */
    @Query(value = """
            SELECT * FROM fulfilment_centres f
            WHERE f.dock_location IS NOT NULL
              AND ST_DWithin(
                    f.dock_location,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                    f.geofence_radius_m)
            ORDER BY ST_Distance(
                    f.dock_location,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)
            LIMIT 1
            """, nativeQuery = true)
    Optional<FulfilmentCentre> findEnclosingGeofence(@Param("lat") double lat,
                                                     @Param("lon") double lon);

    /**
     * Metres from a point to a site's bays. Used to record how far out a
     * vehicle was when it gated in, which is what makes a disputed gate
     * timestamp arguable afterwards.
     */
    @Query(value = """
            SELECT ST_Distance(
                    f.dock_location,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)
            FROM fulfilment_centres f WHERE f.id = :fcId
            """, nativeQuery = true)
    Double distanceToDockMetres(@Param("fcId") String fcId,
                                @Param("lat") double lat,
                                @Param("lon") double lon);
}
