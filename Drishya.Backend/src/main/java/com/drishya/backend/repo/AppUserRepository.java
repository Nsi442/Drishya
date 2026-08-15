package com.drishya.backend.repo;

import com.drishya.backend.domain.AppUser;
import com.drishya.backend.domain.enums.Role;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Accounts. One shape for all three portals; the role decides what opens. */
@Repository
public interface AppUserRepository extends JpaRepository<AppUser, String> {

    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    /** Backs the one-click demo sign-in buttons on the login screen. */
    Optional<AppUser> findFirstByRole(Role role);
}
