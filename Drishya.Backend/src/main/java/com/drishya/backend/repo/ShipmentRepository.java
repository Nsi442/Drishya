package com.drishya.backend.repo;

import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.enums.ShipmentStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
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
