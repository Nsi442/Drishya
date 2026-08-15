package com.drishya.backend.repo;

import com.drishya.backend.domain.Carrier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Hauliers moving consignments. */
@Repository
public interface CarrierRepository extends JpaRepository<Carrier, String> {
}
