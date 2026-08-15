package com.drishya.backend.repo;

import com.drishya.backend.domain.ReceivingException;
import com.drishya.backend.domain.enums.ExceptionStatus;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Anomalies raised at the gate or the dock. */
@Repository
public interface ReceivingExceptionRepository extends JpaRepository<ReceivingException, String> {

    List<ReceivingException> findByFcIdOrderByRaisedAtDesc(String fcId);

    List<ReceivingException> findByFcIdAndStatusOrderByRaisedAtDesc(String fcId, ExceptionStatus status);

    List<ReceivingException> findByVendorIdOrderByRaisedAtDesc(String vendorId);

    long countByFcIdAndStatusNot(String fcId, ExceptionStatus status);
}
