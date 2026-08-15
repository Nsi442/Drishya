package com.drishya.backend.repo;

import com.drishya.backend.domain.Vehicle;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Trucks and the health of their tracking devices. */
@Repository
public interface VehicleRepository extends JpaRepository<Vehicle, String> {

    List<Vehicle> findByCarrierId(String carrierId);
}
