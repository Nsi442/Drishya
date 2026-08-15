package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What the alert is about.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum AlertType {
    DELAY("delay"),
    DOOR_OPEN("door_open"),
    TEMPERATURE("temperature"),
    SHOCK("shock"),
    DOCUMENT("document"),
    DETENTION("detention"),
    ROUTE_DEVIATION("route_deviation"),
    DEVICE_OFFLINE("device_offline"),
    SLOT_CHANGE("slot_change"),
    ARRIVAL("arrival");

    private final String wire;

    AlertType(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static AlertType from(String value) {
        if (value == null) {
            return null;
        }
        for (AlertType candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown AlertType: " + value);
    }
}
