package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What a signed-in account may do, and which portal it lands in.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly.
 *
 * <p><b>On {@link #FC}.</b> The fulfilment centre is a counterparty, not the
 * customer: it publishes its own delivery windows and runs its own receiving
 * systems, and the platform reads from and writes to those. But a counterparty
 * still needs a way in — the receiving desk confirms a slot, gates a vehicle in
 * and raises a receiving exception, and those actions have to land somewhere.
 * So FC is a real role with a real portal, and it is deliberately
 * <b>not tenant-scoped</b>: an FC user sees inbound from every vendor booked
 * into their site, which is exactly the visibility their job requires and
 * exactly what a vendor must never have.
 */
public enum Role {

    /** Runs a vendor organisation. Full read/write inside one tenant. */
    VENDOR_ADMIN("vendor_admin"),

    /** Books and monitors shipments for one tenant. No settings, no billing. */
    DISPATCHER("dispatcher"),

    /** Carries one trip at a time. Sees only trips assigned to them. */
    DRIVER("driver"),

    /** Receiving desk at a fulfilment centre. Cross-tenant, single site. */
    FC("fc");

    private final String wire;

    Role(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    /** True if this role's visibility is bounded by a tenant. */
    public boolean isTenantScoped() {
        return this == VENDOR_ADMIN || this == DISPATCHER;
    }

    @JsonCreator
    public static Role from(String value) {
        if (value == null) {
            return null;
        }
        for (Role candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        // Pre-migration vocabulary: every old "vendor" account was an admin.
        if ("vendor".equalsIgnoreCase(value)) {
            return VENDOR_ADMIN;
        }
        throw new IllegalArgumentException("Unknown Role: " + value);
    }
}
