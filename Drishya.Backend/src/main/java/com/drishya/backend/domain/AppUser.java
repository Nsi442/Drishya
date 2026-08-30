package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Someone who can sign in. One account shape for all three portals — the role
 * decides which one opens, not a separate table per party.
 *
 * <p>Named {@code AppUser} because {@code User} is a reserved word in several
 * databases and would need quoting on every query.
 */
@Entity
@Table(name = "app_users")
@Getter
@Setter
@NoArgsConstructor
public class AppUser {

    @Id
    private String id;

    @Column(unique = true, nullable = false)
    private String email;

    /** BCrypt hash. The plaintext never reaches the database or a response. */
    @Column(nullable = false)
    private String passwordHash;

    private String name;

    @Enumerated(EnumType.STRING)
    private Role role;

    private String title;

    /**
     * Which organisation the account belongs to — a vendor id for a vendor, a
     * fulfilment centre id for an FC user. Scopes everything the user can see.
     */
    private String orgId;

    private String orgName;

    /**
     * The tenant this account is bounded by, and the thing every repository
     * method filters on.
     *
     * <p>Null for the two roles that are not tenant-scoped: a DRIVER sees only
     * trips assigned to them personally, and an FC user sees inbound from every
     * vendor booked into their site — cross-tenant by necessity, since that is
     * what a receiving desk does. For VENDOR_ADMIN and DISPATCHER this is
     * mandatory, and a null here must fail closed rather than open.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id")
    private Vendor tenant;

    private String phone;

    private String initials;

    /** Set for drivers only: links the account to its driver record. */
    private String driverId;

    private String language;
}
