package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Things that happen to a trip, as opposed to states it sits in.
 *
 * <p>Append-only and timestamped, because this is what the evidence pack is
 * built from. The geofence writes {@link #GATE_IN} and {@link #DOCK_IN} only on
 * a zone transition, never once per position inside the fence.
 */
public enum TripEventType {

    DEPARTED("departed"),

    /** Crossed into the fulfilment centre geofence. */
    GATE_IN("gate_in"),

    /** Reached a bay. */
    DOCK_IN("dock_in"),

    /** Left the bay. Closes the turnaround the dock history learns from. */
    DOCK_OUT("dock_out"),

    /** Predicted dock-in fell outside the booked slot window. */
    DELAY_PREDICTED("delay_predicted"),

    /** A document failed validation. */
    DOC_REJECTED("doc_rejected");

    private final String wire;

    TripEventType(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static TripEventType from(String value) {
        if (value == null) {
            return null;
        }
        for (TripEventType candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown TripEventType: " + value);
    }
}
