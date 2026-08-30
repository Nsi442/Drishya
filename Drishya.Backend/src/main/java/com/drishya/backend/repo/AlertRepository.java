package com.drishya.backend.repo;

import com.drishya.backend.domain.Alert;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** The alert feed, newest first. */
@Repository
public interface AlertRepository extends JpaRepository<Alert, String> {

    /**
     * Every alert, unscoped. <b>System use only.</b>
     *
     * <p>Kept for the seeder and for jobs that legitimately run across the
     * cluster. It must not be reached from a request path — see the scoped
     * methods below, and AlertService.listFor, which chooses between them.
     */
    List<Alert> findAllByOrderByAtDesc();

    /**
     * One tenant's alerts.
     *
     * <p>This is the method a vendor request must use. The unscoped one above
     * was being called from the listing endpoint, which handed every vendor the
     * whole cluster's alert feed — 59 rows spanning 12 vendors, to anyone
     * holding any valid token.
     */
    List<Alert> findByVendorIdOrderByAtDesc(String vendorId);

    /**
     * Alerts for shipments a given driver is carrying.
     *
     * <p>A driver has no tenant and no business seeing a vendor's commercial
     * alerts. What they legitimately need is anything concerning the
     * consignment currently on their vehicle, so the scope is the shipment
     * rather than the organisation.
     */
    @Query("""
            select a from Alert a
            where a.shipmentId in (select s.id from Shipment s where s.driver.id = :driverId)
            order by a.at desc
            """)
    List<Alert> findForDriver(@Param("driverId") String driverId);

    List<Alert> findByFcIdOrderByAtDesc(String fcId);

    List<Alert> findByShipmentIdOrderByAtDesc(String shipmentId);

    long countByReadFalse();

    /** Bulk mark-as-read. Done in one statement rather than loading every row. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Alert a set a.read = true where a.read = false")
    int markAllRead();

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Alert a set a.read = true where a.read = false and a.fcId = :fcId")
    int markAllReadForFc(@Param("fcId") String fcId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Alert a set a.read = true where a.id in :ids")
    int markRead(@Param("ids") List<String> ids);
}
