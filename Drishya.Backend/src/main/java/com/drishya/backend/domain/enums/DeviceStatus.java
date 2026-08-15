package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Health of a vehicle's tracking device. Note LOW_BATTERY goes over the wire
 * hyphenated, which is why these carry an explicit wire value rather than
 * relying on the constant name.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum DeviceStatus {
    ONLINE("online"),
    OFFLINE("offline"),
    LOW_BATTERY("low-battery");

    private final String wire;

    DeviceStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static DeviceStatus from(String value) {
        if (value == null) {
            return null;
        }
        for (DeviceStatus candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown DeviceStatus: " + value);
    }
}
