package com.drishya.backend.repo;

import com.drishya.backend.domain.ShipmentDocument;
import com.drishya.backend.domain.enums.DocumentStatus;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Documents across all consignments. The vendor's documents page works
 * document-first rather than shipment-first, so these are queried directly
 * rather than walked from their shipment.
 */
@Repository
public interface ShipmentDocumentRepository extends JpaRepository<ShipmentDocument, String> {

    @EntityGraph(attributePaths = {"shipment", "shipment.fulfilmentCentre", "shipment.vendor"})
    List<ShipmentDocument> findAllBy();

    List<ShipmentDocument> findByShipmentId(String shipmentId);

    List<ShipmentDocument> findByStatus(DocumentStatus status);
}
