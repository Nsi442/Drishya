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

    List<Alert> findAllByOrderByAtDesc();

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
