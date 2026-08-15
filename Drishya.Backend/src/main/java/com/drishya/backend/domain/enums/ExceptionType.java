package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Anomalies raised at the gate or the dock.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum ExceptionType {
    LATE_ARRIVAL("late_arrival"),
    DOCUMENT_MISMATCH("document_mismatch"),
    TEMPERATURE_BREACH("temperature_breach"),
    QUANTITY_SHORTAGE("quantity_shortage"),
    UNSCHEDULED_ARRIVAL("unscheduled_arrival"),
    DAMAGE("damage");

    private final String wire;

    ExceptionType(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static ExceptionType from(String value) {
        if (value == null) {
            return null;
        }
        for (ExceptionType candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown ExceptionType: " + value);
    }
}
