package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Telemetry series recorded against a shipment.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum SensorKind {
    TEMPERATURE("temperature"),
    HUMIDITY("humidity"),
    SHOCK("shock"),
    DOOR("door");

    private final String wire;

    SensorKind(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static SensorKind from(String value) {
        if (value == null) {
            return null;
        }
        for (SensorKind candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown SensorKind: " + value);
    }
}
