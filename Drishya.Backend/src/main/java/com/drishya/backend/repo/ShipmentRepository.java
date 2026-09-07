package com.drishya.backend.repo;

import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.enums.ShipmentStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Shipments, plus the fetch graphs that stop the detail and list views from
 * degenerating into a query per row.
 */
@Repository
public interface ShipmentRepository extends JpaRepository<Shipment, String> {

    /**
     * Everything the detail page needs in one round trip. Documents and sensor
     * readings are fetched separately by the service — pulling three collections
     * in a single query multiplies the rows out.
     */
    @EntityGraph(attributePaths = {"vendor", "fulfilmentCentre", "vehicle", "driver", "events"})
    Optional<Shipment> findWithDetailById(String id);

    /** List views: associations needed for the columns, no child collections. */
    @EntityGraph(attributePaths = {"vendor", "fulfilmentCentre", "vehicle", "driver"})
    List<Shipment> findAllBy();

    @EntityGraph(attributePaths = {"vendor", "fulfilmentCentre", "vehicle", "driver"})
    List<Shipment> findByFulfilmentCentreId(String fcId);

    @EntityGraph(attributePaths = {"vendor", "fulfilmentCentre", "vehicle", "driver"})
    List<Shipment> findByVendorId(String vendorId);

    @EntityGraph(attributePaths = {"vendor", "fulfilmentCentre", "vehicle", "driver"})
    List<Shipment> findByDriverId(String driverId);

    @EntityGraph(attributePaths = {"vendor", "fulfilmentCentre", "vehicle", "driver"})
    List<Shipment> findByStatusIn(List<ShipmentStatus> statuses);

    /**
     * Ids of consignments whose route was drawn rather than measured.
     *
     * <p>Ids, not entities, and deliberately. The backfill re-routes them one
     * at a time with a network call in between, so holding a list of loaded
     * entities — or worse, one transaction — across all of that is exactly the
     * shape that turns a maintenance job into a lock contention problem.
     *
     * <p>Cross-tenant on purpose: this is an operator's job, reachable only
     * behind the service token, never through a vendor's session.
     */
    @Query("select s.id from Shipment s where s.routeSource = "
            + "com.drishya.backend.domain.enums.RouteSource.SYNTHETIC order by s.id")
    List<String> findIdsWithSyntheticRoute(Pageable page);

    /**
     * Writes only where a consignment is, and only if it is still running.
     *
     * <p><b>A targeted update rather than a loaded entity, and that is the
     * point.</b> Two listeners react to the same batch of fixes on the same
     * thread pool: {@code GeofenceListener} sets the shipment's status when the
     * vehicle crosses the fence, and {@code ShipmentPositionListener} sets
     * where it is. Shipment carries no {@code @Version}, so two loaded copies
     * would each write the whole row back and whichever committed second would
     * silently undo the other's field — a gate-in reverted by a position, or a
     * position reverted by a gate-in, with nothing anywhere to say so.
     *
     * <p>Naming the four columns makes that impossible: this statement cannot
     * touch a column it does not mention, whatever else is happening to the row.
     *
     * <p>The status guard is in the WHERE clause for the same reason. Read as
     * a separate query it would be a check-then-act with a window in between,
     * and a fix buffered through a dead zone can arrive after the consignment
     * was cancelled.
     *
     * <p>{@code speedKmph} is coalesced rather than defaulted. A fix that
     * carries no speed is a fix that did not measure one, and writing zero for
     * it would render a moving lorry as stopped — the same absent-is-not-zero
     * mistake that had DelayPill reporting "On time" for a vehicle nobody
     * could find. The last measured speed stands until something measures
     * another.
     */
    @Modifying(clearAutomatically = true)
    @Query("update Shipment s set s.position.lat = :lat, s.position.lng = :lng, "
            + "s.speedKmph = coalesce(:speedKmph, s.speedKmph), s.updatedAt = :at "
            + "where s.id = :id and s.status <> com.drishya.backend.domain.enums.ShipmentStatus.DELIVERED "
            + "and s.status <> com.drishya.backend.domain.enums.ShipmentStatus.CANCELLED")
    int recordPosition(@Param("id") String id, @Param("lat") double lat, @Param("lng") double lng,
                       @Param("speedKmph") Integer speedKmph, @Param("at") Instant at);

    /** Drives the live tick: only what is actually on the road. */
    @EntityGraph(attributePaths = {"vendor", "fulfilmentCentre", "vehicle", "driver"})
    @Query("select s from Shipment s where s.status in (com.drishya.backend.domain.enums.ShipmentStatus.DOCS_PENDING, "
            + "com.drishya.backend.domain.enums.ShipmentStatus.IN_TRANSIT)")
    List<Shipment> findMoving();

    /** Vehicles physically on site: gated in and not yet gated out. */
    @EntityGraph(attributePaths = {"vendor", "vehicle", "driver"})
    List<Shipment> findByFulfilmentCentreIdAndGateInAtIsNotNullAndGateOutAtIsNull(String fcId);

    @EntityGraph(attributePaths = {"vendor", "vehicle", "driver"})
    List<Shipment> findByFulfilmentCentreIdAndGateInAtIsNotNull(String fcId);

    List<Shipment> findByFulfilmentCentreIdAndStatus(String fcId, ShipmentStatus status);

    @Query("select count(s) from Shipment s where s.fulfilmentCentre.id = :fcId and s.predictedAt between :from and :to")
    long countArrivingBetween(@Param("fcId") String fcId, @Param("from") Instant from, @Param("to") Instant to);

    /**
     * Consignments still advertising an arrival time with no live trip behind
     * it.
     *
     * <p>The prediction is denormalised onto the shipment so a list view can
     * render without joining, which means it can outlive the trip that produced
     * it. That is exactly what happened: a trip was correctly abandoned and its
     * shipment went on showing a confident ETA and "108 hours late" for days,
     * because nothing owned clearing the copy.
     *
     * <p>The test is a recent <i>position</i>, not merely an active trip. An
     * earlier version asked only whether a trip was still ACTIVE, and missed
     * the case that actually persisted: a trip dispatched but never tracked,
     * holding a stale estimate alive indefinitely.
     *
     * <p><b>It must also have had a trip at all.</b> Without that clause this
     * matched every consignment that has been booked but not yet dispatched —
     * whose predictedAt is booking-time metadata, not a live claim — and swept
     * twelve perfectly healthy in-transit shipments into EXCEPTION. An estimate
     * can only go stale if something was once tracking it.
     */
    @Query("""
            select s from Shipment s
            where s.predictedAt is not null
              and exists (
                  select 1 from Trip t where t.shipment = s)
              and not exists (
                  select 1 from Trip t
                  join Position p on p.trip = t
                  where t.shipment = s
                    and t.status = com.drishya.backend.domain.enums.TripStatus.ACTIVE
                    and p.deviceTimestamp > :freshEnough)
            """)
    List<Shipment> findWithOrphanedPrediction(@Param("freshEnough") Instant freshEnough);

    boolean existsByInvoiceNo(String invoiceNo);
}
