package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Paperwork that has to clear before a vehicle is let through the gate.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 */
public enum DocumentType {
    EWAY("eway"),
    INVOICE("invoice"),
    GST("gst"),
    LR("lr"),
    ASN("asn"),

    /** Proof of delivery, captured by the driver at the bay. */
    POD("pod");

    private final String wire;

    DocumentType(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static DocumentType from(String value) {
        if (value == null) {
            return null;
        }
        for (DocumentType candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown DocumentType: " + value);
    }
}
