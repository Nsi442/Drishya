package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * State of a vendor's request for a dock window.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum AppointmentStatus {
    REQUESTED("requested"),
    CONFIRMED("confirmed"),
    REJECTED("rejected"),
    ALTERNATIVE("alternative"),
    COMPLETED("completed");

    private final String wire;

    AppointmentStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static AppointmentStatus from(String value) {
        if (value == null) {
            return null;
        }
        for (AppointmentStatus candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown AppointmentStatus: " + value);
    }
}
