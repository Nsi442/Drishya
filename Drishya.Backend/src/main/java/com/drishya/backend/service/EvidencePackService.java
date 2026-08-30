package com.drishya.backend.service;

import com.drishya.backend.domain.EtaPrediction;
import com.drishya.backend.domain.Position;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.ShipmentDocument;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.TripEvent;
import com.drishya.backend.domain.enums.PositionSource;
import com.drishya.backend.dto.EvidenceDtos.DocumentRecord;
import com.drishya.backend.dto.EvidenceDtos.EvidencePack;
import com.drishya.backend.dto.EvidenceDtos.PositionSummary;
import com.drishya.backend.dto.EvidenceDtos.PredictionRecord;
import com.drishya.backend.dto.EvidenceDtos.TimelineEntry;
import com.drishya.backend.dto.EvidenceDtos.TripRecord;
import com.drishya.backend.repo.EtaPredictionRepository;
import com.drishya.backend.repo.PositionRepository;
import com.drishya.backend.repo.ShipmentDocumentRepository;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.TripEventRepository;
import com.drishya.backend.repo.TripRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Assembles everything known about one consignment into a single document.
 *
 * <p><b>This is a dispute artefact, not a report.</b> A vendor charged back for
 * a late or short delivery has a narrow window to contest it, and the argument
 * is won or lost on whether they can produce a timestamped account of what
 * happened. Screenshots of a dashboard are not that. This is: every event with
 * the time it occurred, every document with its validation state, the
 * positional trace with its provenance, and what the platform predicted and
 * when it predicted it.
 *
 * <p><b>Provenance is stated, never blended.</b> The position summary counts
 * simulated and browser-reported fixes separately and says so on the face of
 * the pack. A trace that is entirely simulated is a demonstration and carries no
 * evidentiary weight at all; quietly presenting it alongside real fixes as one
 * number would be the single most dishonest thing this system could do.
 *
 * <p><b>Nothing here is computed to flatter.</b> Predictions that turned out
 * wrong are included with their error, because a pack that only showed the
 * accurate ones would be worthless the first time anyone checked it.
 */
@Service
public class EvidencePackService {

    private final ShipmentRepository shipments;
    private final TripRepository trips;
    private final TripEventRepository tripEvents;
    private final PositionRepository positions;
    private final ShipmentDocumentRepository documents;
    private final EtaPredictionRepository predictions;

    public EvidencePackService(ShipmentRepository shipments, TripRepository trips,
                               TripEventRepository tripEvents, PositionRepository positions,
                               ShipmentDocumentRepository documents,
                               EtaPredictionRepository predictions) {
        this.shipments = shipments;
        this.trips = trips;
        this.tripEvents = tripEvents;
        this.positions = positions;
        this.documents = documents;
        this.predictions = predictions;
    }

    @Transactional(readOnly = true)
    public EvidencePack build(String shipmentId, String tenantId) {
        Shipment shipment = shipments.findWithDetailById(shipmentId)
                .filter(s -> s.getVendor() != null && s.getVendor().getId().equals(tenantId))
                .orElseThrow(() -> ApiException.notFound("No such shipment."));

        List<Trip> tripList = trips.findByShipmentIdAndTenantId(shipmentId, tenantId);

        List<TimelineEntry> timeline = new ArrayList<>();
        List<TripRecord> tripRecords = new ArrayList<>();
        List<PredictionRecord> predictionRecords = new ArrayList<>();

        // The shipment's own lifecycle events, which predate trips.
        shipment.getEvents().forEach(e -> timeline.add(new TimelineEntry(
                "shipment", e.getStage() == null ? null : e.getStage().wire(),
                e.getAt() == null ? 0 : e.getAt().toEpochMilli(),
                e.getLabel(), e.getDetail(), Map.of())));

        for (Trip trip : tripList) {
            List<TripEvent> events = tripEvents.findByTripIdOrderByAtAsc(trip.getId());
            events.forEach(e -> timeline.add(new TimelineEntry(
                    "trip", e.getType().wire(), e.getAt().toEpochMilli(),
                    e.getLabel(), trip.getId(),
                    e.getPayload() == null ? Map.of() : e.getPayload())));

            tripRecords.add(new TripRecord(
                    trip.getId(),
                    trip.getStatus().wire(),
                    trip.getVehicleRegistration(),
                    trip.getLane() == null ? null : trip.getLane().getCode(),
                    millis(trip.getStartedAt()),
                    millis(trip.getGateInAt()),
                    millis(trip.getDockInAt()),
                    millis(trip.getDockOutAt()),
                    millis(trip.getEndedAt()),
                    trip.turnaroundMinutes(),
                    summarisePositions(trip.getId())));

            predictions.findByTripIdOrderByMadeAtDesc(trip.getId()).stream()
                    .sorted(Comparator.comparing(EtaPrediction::getMadeAt))
                    .forEach(p -> predictionRecords.add(new PredictionRecord(
                            p.getMadeAt().toEpochMilli(),
                            p.getPredictedDockInAt().toEpochMilli(),
                            millis(p.getConfidenceLowAt()),
                            millis(p.getConfidenceHighAt()),
                            p.getModelVersion(),
                            millis(p.getActualDockInAt()),
                            p.getErrorMinutes())));
        }

        timeline.sort(Comparator.comparingLong(TimelineEntry::at));

        List<DocumentRecord> documentRecords = documents.findByShipmentId(shipmentId).stream()
                .map(this::toRecord)
                .sorted(Comparator.comparing(DocumentRecord::type))
                .toList();

        return new EvidencePack(
                shipment.getId(),
                shipment.getReference(),
                shipment.getVendor().getName(),
                shipment.getFulfilmentCentre() == null ? null
                        : shipment.getFulfilmentCentre().getName(),
                shipment.getStatus().wire(),
                shipment.getCartons(),
                shipment.getSealNumber(),
                shipment.getInvoiceNo(),
                shipment.getEwayBillNo(),
                // Both arrival times, deliberately. promisedAt is what was
                // agreed at booking and never moves; predictedAt is what the
                // platform came to believe. The gap between them, evidenced by
                // the predictions below, is the entire argument in a dispute
                // about a missed slot.
                millis(shipment.getPromisedAt()),
                millis(shipment.getPredictedAt()),
                millis(shipment.getSlotStart()),
                millis(shipment.getSlotEnd()),
                millis(shipment.getDeliveredAt()),
                timeline,
                tripRecords,
                documentRecords,
                predictionRecords,
                Instant.now().toEpochMilli());
    }

    /**
     * Counts fixes by provenance and reports them separately.
     *
     * <p>The separation is the whole reason this method exists rather than a
     * bare count. Evidentiary weight differs between a fix the simulator
     * produced and one a driver's browser reported from the cab, and a single
     * total would let the first be presented as the second.
     */
    private PositionSummary summarisePositions(String tripId) {
        List<Position> all = positions.findByTripIdOrderByDeviceTimestampAsc(tripId);
        if (all.isEmpty()) {
            return new PositionSummary(0, 0, 0, null, null, 0, 0,
                    "No positions were recorded for this trip.");
        }

        long simulated = all.stream().filter(p -> p.getSource() == PositionSource.SIMULATED).count();
        long browser = all.stream().filter(p -> p.getSource() == PositionSource.BROWSER).count();
        long maxLatency = all.stream().mapToLong(Position::latencySeconds).max().orElse(0);

        String caveat;
        if (browser == 0) {
            caveat = "Every fix in this trace was produced by the simulator. It demonstrates "
                    + "the system and is not evidence of a vehicle's movements.";
        } else if (simulated > 0) {
            caveat = "This trace mixes " + browser + " device-reported fixes with "
                    + simulated + " simulated ones. Only the device-reported fixes carry "
                    + "evidentiary weight.";
        } else {
            caveat = null;
        }

        return new PositionSummary(
                all.size(), simulated, browser,
                all.getFirst().getDeviceTimestamp().toEpochMilli(),
                all.getLast().getDeviceTimestamp().toEpochMilli(),
                Math.round(positions.travelledMetres(tripId)),
                maxLatency,
                caveat);
    }

    private DocumentRecord toRecord(ShipmentDocument d) {
        return new DocumentRecord(
                d.getType() == null ? null : d.getType().wire(),
                d.getNumber(),
                d.getStatus() == null ? null : d.getStatus().wire(),
                millis(d.getUploadedAt()),
                millis(d.getExpiresAt()),
                d.getNote());
    }

    private static Long millis(Instant instant) {
        return instant == null ? null : instant.toEpochMilli();
    }
}
