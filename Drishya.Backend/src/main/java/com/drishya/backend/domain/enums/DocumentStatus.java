package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Result of validating a document against its consignment.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum DocumentStatus {
    VALID("valid"),
    EXPIRING("expiring"),
    MISMATCH("mismatch"),
    MISSING("missing"),
    PENDING("pending");

    private final String wire;

    DocumentStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static DocumentStatus from(String value) {
        if (value == null) {
            return null;
        }
        for (DocumentStatus candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown DocumentStatus: " + value);
    }
}
