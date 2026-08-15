package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What a driver reports from the road.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum IncidentType {
    BREAKDOWN("breakdown"),
    ACCIDENT("accident"),
    ROUTE_BLOCK("route_block"),
    DETENTION("detention"),
    OTHER("other");

    private final String wire;

    IncidentType(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static IncidentType from(String value) {
        if (value == null) {
            return null;
        }
        for (IncidentType candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown IncidentType: " + value);
    }
}
