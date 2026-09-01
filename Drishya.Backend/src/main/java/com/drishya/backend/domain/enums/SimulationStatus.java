package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Where a server-side vehicle simulation has got to.
 *
 * <p>Deliberately not reusing {@link TripStatus}. A simulation reaching the end
 * of the polyline is not the same event as a trip completing: the vehicle is at
 * the bay and the consignment still has unloading, a GRN and a proof of
 * delivery ahead of it. Collapsing the two would mean either closing a trip
 * that is genuinely still running, or leaving a finished simulation looking
 * like it is still driving.
 */
public enum SimulationStatus {

    /** Being advanced by the tick. */
    RUNNING("running"),

    /** Reached the end of the route. The trip carries on without it. */
    ARRIVED("arrived"),

    /** Called off by hand before the end. */
    STOPPED("stopped");

    private final String wire;

    SimulationStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static SimulationStatus from(String value) {
        if (value == null) {
            return null;
        }
        for (SimulationStatus candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown SimulationStatus: " + value);
    }
}
