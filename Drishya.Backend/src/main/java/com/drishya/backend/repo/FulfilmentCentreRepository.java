package com.drishya.backend.repo;

import com.drishya.backend.domain.FulfilmentCentre;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** The receiving sites. */
@Repository
public interface FulfilmentCentreRepository extends JpaRepository<FulfilmentCentre, String> {
}
