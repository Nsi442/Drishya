package com.drishya.backend.repo;

import com.drishya.backend.domain.Dock;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Loading bays, always queried per site. */
@Repository
public interface DockRepository extends JpaRepository<Dock, String> {

    List<Dock> findByFulfilmentCentreIdOrderByNameAsc(String fcId);
}
