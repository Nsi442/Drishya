package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.PositionSource;
import com.drishya.backend.domain.enums.TripEventType;
import com.drishya.backend.domain.enums.TripStatus;
import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.Map;

/**
 * Trips on the wire.
 *
 * <p>Timestamps are epoch milliseconds, like every other timestamp this API
 * emits — the frontend does date arithmetic on them directly. Coordinates are
 * plain doubles; no JTS type is ever handed to Jackson.
 */
public final class TripDtos {

    private TripDtos() {
    }

    public record StartTripRequest(
            @NotBlank(message = "A vehicle registration is required.")
            String vehicleRegistration,
            String driverId) {
    }

    /**
     * Enough for a list row or a map marker.
     *
     * <p>The last known position carries its source, so the map can distinguish
     * a simulated vehicle from a real one. That distinction is deliberately
     * visible all the way to the browser rather than being flattened here.
     */
    public record TripSummary(
            String tripId,
            String shipmentId,
            String shipmentReference,
            TripStatus status,
            String vehicleRegistration,
            String laneCode,
            Long startedAt,
            Long gateInAt,
            Long dockInAt,
            Double lastLat,
            Double lastLon,
            PositionSource lastSource,
            Long lastFixAt,

            /**
             * Minutes since the last position fix. Lets the UI say "no position
             * for 4 days" rather than presenting a confident arrival time built
             * on one.
             *
             * <p>Kept immediately beside lastFixAt on purpose: these two are the
             * same fact and drifting them apart in a positional record is how
             * the value ended up one slot out, reading an epoch millisecond as
             * a duration and rendering "29801205700 hours ago".
             */
            Long lastFixAgeMinutes,

            /** What the ETA engine currently believes. Null until a first fix. */
            Long predictedDockInAt,
            Long confidenceLowAt,
            Long confidenceHighAt,

            /** What was agreed at booking. Never moves. */
            Long slotStart,
            Long slotEnd,

            /** Minutes past slotEnd. Negative means early. Null if unknowable. */
            Long minutesLate,

            RiskState risk) {
    }

    /**
     * How a trip is doing against the window it was booked into.
     *
     * <p>Derived on read from the prediction and the slot rather than stored,
     * for the same reason scorecards are: a stored state can drift from the
     * prediction it claims to summarise, and this one would change every sixty
     * seconds. It is also the only number on the list a dispatcher actually
     * acts on, so it must never disagree with the times printed beside it.
     */
    public enum RiskState {
        /** Predicted inside the booked window. */
        ON_TIME("on_time"),

        /**
         * Predicted to arrive before the window opens. Not a failure, but worth
         * showing: a fulfilment centre will not receive early, so the vehicle
         * waits in the yard and the driver's hours are burned on nothing.
         */
        EARLY("early"),

        /**
         * Predicted inside the window, but the pessimistic edge of the band
         * falls outside it. This is the state that earns the band its keep —
         * the midpoint says fine, and the honest answer is "probably, but do not
         * rely on it".
         */
        AT_RISK("at_risk"),

        /** Predicted to miss the window outright. */
        LATE("late"),

        /** No prediction yet: no lane matched, or no position reported. */
        UNKNOWN("unknown"),

        /**
         * The vehicle has stopped reporting, so there is nothing to predict
         * from.
         *
         * <p>Distinct from UNKNOWN, which means we never knew. This means we
         * knew and have lost it, which needs a different response from a
         * dispatcher — chase the driver, not the paperwork.
         *
         * <p>It exists because the alternative was worse. A trip left running
         * with a four-day-old fix kept predicting "52 minutes from now" against
         * a slot that closed four days ago, and reported itself 85 hours late
         * with complete confidence. Absurd numbers are how a dispatcher learns
         * to stop believing the screen.
         */
        TRACKING_LOST("tracking_lost");

        private final String wire;

        RiskState(String wire) {
            this.wire = wire;
        }

        @com.fasterxml.jackson.annotation.JsonValue
        public String wire() {
            return wire;
        }
    }

    public record TripDetail(
            TripSummary trip,
            Long endedAt,
            Long dockOutAt,
            Long turnaroundMinutes,
            long positionCount,
            long travelledMetres,
            List<TripEventView> events) {
    }

    public record TripEventView(
            TripEventType type,
            long at,
            String label,
            Map<String, Object> payload) {
    }
}
