package com.drishya.backend.repo;

import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.enums.TripStatus;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Trips, and the tenant boundary around them.
 *
 * <p><b>Every read here takes a tenant id.</b> That is deliberate and it is the
 * only reliable shape: a {@code findById} that quietly returns any trip puts the
 * isolation check in whatever controller happens to call it, and the one caller
 * that forgets is a cross-tenant data leak that no test notices because the
 * happy path still works. Making the boundary part of the method signature means
 * forgetting it does not compile.
 *
 * <p>The exceptions are the scheduler methods, which run as the system rather
 * than as a user and are named so that is obvious.
 */
@Repository
public interface TripRepository extends JpaRepository<Trip, String> {

    /**
     * The tenant-safe read. Returns empty both when the trip does not exist and
     * when it belongs to somebody else — the caller cannot tell the difference,
     * which is the point. Distinguishing them leaks whether an id is real.
     */
    @EntityGraph(attributePaths = {"shipment", "tenant", "lane", "driver"})
    Optional<Trip> findByIdAndTenantId(String id, String tenantId);

    @EntityGraph(attributePaths = {"shipment", "tenant", "lane", "driver"})
    List<Trip> findByTenantIdOrderByStartedAtDesc(String tenantId);

    @EntityGraph(attributePaths = {"shipment", "tenant", "lane", "driver"})
    List<Trip> findByTenantIdAndStatus(String tenantId, TripStatus status);

    List<Trip> findByShipmentIdAndTenantId(String shipmentId, String tenantId);

    /** A driver sees their own trips, not their tenant's. */
    @EntityGraph(attributePaths = {"shipment", "lane"})
    List<Trip> findByDriverIdAndStatus(String driverId, TripStatus status);

    /**
     * Every active trip, across all tenants. For the ETA scheduler only, which
     * runs as the system and has no user to be scoped to. Named loudly enough
     * that using it in a request path looks wrong in review.
     */
    @EntityGraph(attributePaths = {"shipment", "tenant", "lane"})
    @Query("select t from Trip t where t.status = com.drishya.backend.domain.enums.TripStatus.ACTIVE")
    List<Trip> findAllActiveAcrossTenants();

    /**
     * Completed trips that reached a bay, for the nightly aggregation. Also
     * deliberately cross-tenant: the shared history tables are built from every
     * tenant's runs, which is the whole point of the cluster.
     */
    @Query("""
            select t from Trip t
            where t.status = com.drishya.backend.domain.enums.TripStatus.COMPLETED
              and t.dockInAt is not null
              and t.endedAt >= :since
            """)
    List<Trip> findCompletedForAggregation(@Param("since") java.time.Instant since);

    /** Ownership check without loading the row. Used by the ingest hot path. */
    boolean existsByIdAndTenantId(String id, String tenantId);

    /**
     * The tenant-safe read, with a row lock held to the end of the transaction.
     *
     * <p>For the geofence listener only. Zone detection is a state machine over
     * the trip's last known zone: read, decide, write. Two batches arriving for
     * one trip at the same moment — which is exactly what a fleet coming out of
     * a dead zone together looks like — would both read the same starting zone
     * and both decide they saw the crossing, writing two GATE_IN rows.
     *
     * <p>PESSIMISTIC_WRITE rather than optimistic versioning because the loser
     * of this race must wait and then re-read, not fail. Discarding a batch of
     * positions to avoid a duplicate event would be the wrong trade entirely.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Trip t where t.id = :id and t.tenant.id = :tenantId")
    Optional<Trip> findByIdForUpdate(@Param("id") String id, @Param("tenantId") String tenantId);
}
