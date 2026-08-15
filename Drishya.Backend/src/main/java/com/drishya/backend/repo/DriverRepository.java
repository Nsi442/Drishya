package com.drishya.backend.repo;

import com.drishya.backend.domain.Driver;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Drivers, and whether dispatch may assign them work. */
@Repository
public interface DriverRepository extends JpaRepository<Driver, String> {

    List<Driver> findByAvailableTrue();
}
