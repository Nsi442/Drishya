package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Where a consignment's route and distance came from.
 *
 * <p><b>Both fill the same two columns.</b> A road route from the routing
 * service and a curve drawn between two points are stored identically in
 * {@code route} and {@code distance_km}, and one of them is a measurement while
 * the other is a guess. Without this they are indistinguishable — a 128 km
 * drawn line reads exactly like a 128 km road, including to the ETA engine that
 * consumes the distance.
 *
 * <p>This is the same reasoning as {@link PositionSource}, applied one level up.
 * A generated figure must never be able to pass as an observed one.
 */
public enum RouteSource {

    /** Measured along the carriageway by the routing service. */
    ROAD("road"),

    /**
     * Drawn between origin and destination because no router answered.
     *
     * <p>Not a failure state: it is what every consignment had before routing
     * existed, what the seeder still produces deliberately, and what any
     * offline run falls back to. It is simply not a road.
     */
    SYNTHETIC("synthetic");

    private final String wire;

    RouteSource(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    /** True if the distance was measured rather than drawn. */
    public boolean isMeasured() {
        return this == ROAD;
    }

    @JsonCreator
    public static RouteSource from(String value) {
        if (value == null) {
            return null;
        }
        for (RouteSource candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown RouteSource: " + value);
    }
}
