package com.drishya.backend.repo;

import com.drishya.backend.domain.Incident;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Reports raised by drivers from the road. */
@Repository
public interface IncidentRepository extends JpaRepository<Incident, String> {

    List<Incident> findByShipmentIdOrderByAtDesc(String shipmentId);

    List<Incident> findAllByOrderByAtDesc();
}
