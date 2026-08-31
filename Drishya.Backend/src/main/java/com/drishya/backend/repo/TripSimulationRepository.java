package com.drishya.backend.repo;

import com.drishya.backend.domain.TripSimulation;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Simulations, and the tenant boundary around them.
 *
 * <p>Same rule as {@link TripRepository}: every read a request can reach takes
 * a tenant id, so forgetting the boundary does not compile. The one exception
 * is the tick's own query, which runs as the system and is named to say so.
 */
@Repository
public interface TripSimulationRepository extends JpaRepository<TripSimulation, String> {

    /**
     * The tenant-safe read. Empty both when there is no simulation and when it
     * belongs to somebody else, so the caller cannot tell an id that is not
     * theirs from one that does not exist.
     */
    @EntityGraph(attributePaths = {"trip"})
    Optional<TripSimulation> findByTripIdAndTenantId(String tripId, String tenantId);

    /**
     * The ids of every running simulation, across all tenants. For the tick
     * only, which runs as the system and has no caller to be scoped to — the
     * same shape and the same loud name as {@code findAllActiveAcrossTenants}.
     *
     * <p>Ids rather than entities on purpose. The tick advances each vehicle in
     * its own transaction so that one bad route cannot roll back the other
     * nineteen, and a write wants a row loaded inside the transaction that
     * writes it, not one carried in from an earlier read.
     */
    @Query("select s.tripId from TripSimulation s where s.status = "
            + "com.drishya.backend.domain.enums.SimulationStatus.RUNNING")
    List<String> findAllRunningTripIdsAcrossTenants();

    /**
     * One vehicle, with everything the tick needs to move it.
     *
     * <p>Without this graph the tick is the textbook N+1: one query for the
     * simulation, then one for the trip, one for its shipment and one for the
     * shipment's route polyline — per vehicle, every few seconds, forever.
     */
    @EntityGraph(attributePaths = {"trip", "trip.shipment", "trip.shipment.route",
            "trip.shipment.fulfilmentCentre", "tenant"})
    @Query("select s from TripSimulation s where s.tripId = :tripId")
    Optional<TripSimulation> findForTick(@Param("tripId") String tripId);
}
