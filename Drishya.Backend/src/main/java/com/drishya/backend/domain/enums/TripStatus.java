package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * A trip is one attempt at a shipment. A shipment refused at the gate and sent
 * back produces a second trip against the same shipment, which is why the two
 * are separate tables and why lane history is keyed on trips rather than
 * shipments — a failed run still taught us how long the lane took.
 */
public enum TripStatus {

    PLANNED("planned"),
    ACTIVE("active"),
    COMPLETED("completed"),

    /** Called off mid-run. Positions collected so far are still valid history. */
    ABANDONED("abandoned");

    private final String wire;

    TripStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static TripStatus from(String value) {
        if (value == null) {
            return null;
        }
        for (TripStatus candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown TripStatus: " + value);
    }
}
