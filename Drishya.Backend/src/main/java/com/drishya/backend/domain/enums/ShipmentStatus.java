package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The shipment lifecycle. Order matters: ordinal position is used to decide
 * whether a transition moves forwards.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum ShipmentStatus {
    BOOKED("booked"),
    PICKED_UP("picked_up"),
    IN_TRANSIT("in_transit"),
    AT_GATE("at_gate"),
    UNLOADING("unloading"),
    DELIVERED("delivered"),
    CANCELLED("cancelled");

    private final String wire;

    ShipmentStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static ShipmentStatus from(String value) {
        if (value == null) {
            return null;
        }
        for (ShipmentStatus candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown ShipmentStatus: " + value);
    }
}
