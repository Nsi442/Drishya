package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Outcome of the goods receipt check.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum GrnDecision {
    ACCEPTED("accepted"),
    PARTIAL("partial"),
    REJECTED("rejected"),
    PENDING("pending");

    private final String wire;

    GrnDecision(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static GrnDecision from(String value) {
        if (value == null) {
            return null;
        }
        for (GrnDecision candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown GrnDecision: " + value);
    }
}
