package com.drishya.backend.repo;

import com.drishya.backend.domain.Vendor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Vendors in the cluster delivering into the fulfilment centres. */
@Repository
public interface VendorRepository extends JpaRepository<Vendor, String> {
}
