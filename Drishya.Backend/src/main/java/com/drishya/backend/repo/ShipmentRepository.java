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
    @Query("select s from Shipment s where s.status in (com.drishya.backend.domain.enums.ShipmentStatus.PICKED_UP, "
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

    boolean existsByInvoiceNo(String invoiceNo);
}
