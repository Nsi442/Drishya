package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The shipment lifecycle. Order matters: ordinal position decides whether a
 * transition moves forwards, so the off-flow states sit at the end.
 *
 * <p>The wire value is the contract with the frontend — it matches the keys in
 * the browser's {@code src/lib/constants.js} exactly. Renaming a constant here
 * is safe; changing a wire value is a breaking API change.
 *
 * <p><b>Two states carry the product's argument.</b> {@link #DOCS_PENDING} is
 * the reason the vehicle has not left: paperwork failed validation and dispatch
 * is blocked. Catching that here, before the wheels turn, is the whole point —
 * the alternative is discovering it as a chargeback weeks later. And
 * {@link #AT_DOCK} is deliberately distinct from {@link #AT_GATE}: the gap
 * between them is dock queue time, which is what the ETA engine predicts and
 * what a gate-arrival estimate would hide.
 */
public enum ShipmentStatus {

    /** Booked. Nothing has been validated and nothing has moved. */
    CREATED("created"),

    /** Documents submitted and failing validation. Dispatch is blocked. */
    DOCS_PENDING("docs_pending"),

    /** Trip started, vehicle on the road. Departure time lives on the trip. */
    IN_TRANSIT("in_transit"),

    /** Inside the fulfilment centre geofence, not yet at a bay. */
    AT_GATE("at_gate"),

    /** At a bay and unloading. */
    AT_DOCK("at_dock"),

    DELIVERED("delivered"),

    /**
     * Something went wrong that is not a cancellation — refused at the gate, a
     * breakdown, a rejected consignment. Off the happy path, still live.
     */
    EXCEPTION("exception"),

    /**
     * Called off before delivery. Not in the specification's list, but the
     * vendor cancel flow and {@code cancelledReason} predate it and work; a
     * consignment called off is genuinely not an EXCEPTION.
     */
    CANCELLED("cancelled");

    private final String wire;

    ShipmentStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    /** True while the consignment is still the platform's problem. */
    public boolean isOpen() {
        return this != DELIVERED && this != CANCELLED;
    }

    /** True once the vehicle is on the road and not yet inside the geofence. */
    public boolean isMoving() {
        return this == IN_TRANSIT;
    }

    /** True once the vehicle is on site, by either gate or dock. */
    public boolean isOnSite() {
        return this == AT_GATE || this == AT_DOCK;
    }

    @JsonCreator
    public static ShipmentStatus from(String value) {
        if (value == null) {
            return null;
        }
        for (ShipmentStatus candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        // Pre-migration vocabulary. Old rows, an old simulator run or a stale
        // browser tab must not blow up a request.
        return switch (value.toLowerCase()) {
            case "booked" -> CREATED;
            case "picked_up" -> IN_TRANSIT;
            case "unloading" -> AT_DOCK;
            default -> throw new IllegalArgumentException("Unknown ShipmentStatus: " + value);
        };
    }
}
