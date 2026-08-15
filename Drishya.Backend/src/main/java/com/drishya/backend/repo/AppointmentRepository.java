package com.drishya.backend.repo;

import com.drishya.backend.domain.Appointment;
import com.drishya.backend.domain.enums.AppointmentStatus;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Dock bookings, queried by site, by bay and by window. */
@Repository
public interface AppointmentRepository extends JpaRepository<Appointment, String> {

    List<Appointment> findByFcIdOrderByStartAsc(String fcId);

    List<Appointment> findByVendorIdOrderByStartAsc(String vendorId);

    List<Appointment> findByFcIdAndStatus(String fcId, AppointmentStatus status);

    List<Appointment> findByShipmentId(String shipmentId);

    List<Appointment> findByFcIdAndStartBetweenOrderByStartAsc(String fcId, Instant from, Instant to);

    /**
     * Bookings on one bay that overlap a window. Two appointments clash when
     * each starts before the other ends — rejected ones do not count, since a
     * refused booking is not holding the bay.
     */
    @Query("""
            select a from Appointment a
            where a.dockId = :dockId
              and a.status <> com.drishya.backend.domain.enums.AppointmentStatus.REJECTED
              and (:ignoreId is null or a.id <> :ignoreId)
              and a.start < :end
              and :start < a.end
            """)
    List<Appointment> findOverlapping(@Param("dockId") String dockId,
                                      @Param("start") Instant start,
                                      @Param("end") Instant end,
                                      @Param("ignoreId") String ignoreId);
}
