package com.drishya.backend.dto;

import java.util.List;
import java.util.Map;

/**
 * The evidence pack, on the wire.
 *
 * <p>Flat, timestamped and dull on purpose. This is read by someone assembling
 * a chargeback dispute, possibly months later, possibly by pasting it into an
 * email — so every time is an unambiguous epoch millisecond, every status is
 * the same wire string the rest of the API uses, and nothing is summarised into
 * a number whose derivation cannot be checked against the rows above it.
 */
public final class EvidenceDtos {

    private EvidenceDtos() {
    }

    public record EvidencePack(
            String shipmentId,
            String reference,
            String vendor,
            String fulfilmentCentre,
            String status,
            int cartons,
            String sealNumber,
            String invoiceNumber,
            String ewayBillNumber,

            /** Agreed at booking. Never recalculated. */
            Long promisedAt,
            /** What the platform came to believe. The gap is the argument. */
            Long predictedAt,
            Long slotStart,
            Long slotEnd,
            Long deliveredAt,

            List<TimelineEntry> timeline,
            List<TripRecord> trips,
            List<DocumentRecord> documents,

            /**
             * Every prediction made for this consignment, in order, including
             * the ones that turned out wrong. A pack showing only the accurate
             * ones would be worthless the first time anyone checked it.
             */
            List<PredictionRecord> predictions,

            long generatedAt) {
    }

    /**
     * @param source "shipment" or "trip" — the two independent records that make
     *     up the account, kept distinguishable rather than merged
     * @param payload the structured detail for trip events: which site, how far
     *     from the dock, which position fix triggered it
     */
    public record TimelineEntry(
            String source,
            String type,
            long at,
            String label,
            String detail,
            Map<String, Object> payload) {
    }

    public record TripRecord(
            String tripId,
            String status,
            String vehicleRegistration,
            String laneCode,
            Long startedAt,
            Long gateInAt,
            Long dockInAt,
            Long dockOutAt,
            Long endedAt,
            Long turnaroundMinutes,
            PositionSummary positions) {
    }

    /**
     * @param simulatedFixes fixes produced by the simulator
     * @param browserFixes fixes reported by a real device
     * @param maxLatencySeconds the largest gap between a fix being taken and
     *     reaching the server. A large value is a coverage dead zone, which
     *     explains an apparent gap in the trace rather than leaving it looking
     *     like missing evidence.
     * @param caveat plain-language warning when the trace is wholly or partly
     *     simulated. Present precisely when it needs to be read.
     */
    public record PositionSummary(
            int totalFixes,
            long simulatedFixes,
            long browserFixes,
            Long firstFixAt,
            Long lastFixAt,
            long travelledMetres,
            long maxLatencySeconds,
            String caveat) {
    }

    public record DocumentRecord(
            String type,
            String number,
            String status,
            Long uploadedAt,
            Long expiresAt,
            String note) {
    }

    public record PredictionRecord(
            long madeAt,
            long predictedDockInAt,
            Long confidenceLowAt,
            Long confidenceHighAt,
            String modelVersion,
            Long actualDockInAt,
            /** Signed: positive means the prediction was optimistic. */
            Double errorMinutes) {
    }
}
