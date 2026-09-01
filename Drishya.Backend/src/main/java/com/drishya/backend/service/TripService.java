package com.drishya.backend.service;

import com.drishya.backend.domain.Driver;
import com.drishya.backend.domain.Lane;
import com.drishya.backend.domain.Position;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.TripEvent;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.domain.enums.TripEventType;
import com.drishya.backend.domain.enums.TripStatus;
import com.drishya.backend.dto.PositionDtos.PositionView;
import com.drishya.backend.dto.TripDtos.TripDetail;
import com.drishya.backend.dto.TripDtos.TripEventView;
import com.drishya.backend.dto.TripDtos.TripSummary;
import com.drishya.backend.domain.EtaPrediction;
import com.drishya.backend.dto.TripDtos.RiskState;
import com.drishya.backend.repo.DriverRepository;
import com.drishya.backend.repo.EtaPredictionRepository;
import com.drishya.backend.repo.LaneRepository;
import com.drishya.backend.repo.PositionRepository;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.TripEventRepository;
import com.drishya.backend.repo.TripRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Starting, reading and ending trips.
 *
 * <p>Every method takes the caller's tenant and passes it down to the
 * repository, so the isolation check cannot be forgotten in one branch.
 */
@Service
public class TripService {

    private static final Logger log = LoggerFactory.getLogger(TripService.class);

    /**
     * How far a shipment's origin may be from a known lane's origin and still
     * count as being on that lane, in metres.
     *
     * <p>Five kilometres is deliberately loose. Two vendors on the same
     * industrial estate are on the same road for every purpose that matters to
     * a travel-time prediction, and insisting on a tighter match would give
     * each of them their own sparse history — which is precisely the
     * single-vendor failure the cluster exists to avoid.
     */
    private static final double LANE_MATCH_TOLERANCE_M = 5_000;

    /** Matches FeatureBuilder.MAX_FIX_AGE: past this, we no longer predict. */
    private static final long STALE_AFTER_MINUTES = 120;

    private final TripRepository trips;
    private final ShipmentRepository shipments;
    private final PositionRepository positions;
    private final TripEventRepository tripEvents;
    private final LaneRepository lanes;
    private final EtaPredictionRepository predictions;
    private final DriverRepository drivers;

    public TripService(TripRepository trips, ShipmentRepository shipments,
                       PositionRepository positions, TripEventRepository tripEvents,
                       LaneRepository lanes, EtaPredictionRepository predictions,
                       DriverRepository drivers) {
        this.predictions = predictions;
        this.drivers = drivers;
        this.trips = trips;
        this.shipments = shipments;
        this.positions = positions;
        this.tripEvents = tripEvents;
        this.lanes = lanes;
    }

    /**
     * Begins an attempt at a shipment.
     *
     * <p>Refuses while documents are outstanding. That refusal is the feature:
     * catching a paperwork error at the yard gate costs a re-print, and catching
     * it after the vehicle has run four hours to the fulfilment centre costs a
     * rejected delivery and a chargeback nobody sees until the payment
     * statement.
     */
    @Transactional
    public TripDetail start(String shipmentId, String tenantId,
                            String vehicleRegistration, String driverId) {
        Shipment shipment = shipments.findById(shipmentId)
                .filter(s -> s.getVendor() != null && s.getVendor().getId().equals(tenantId))
                .orElseThrow(() -> ApiException.notFound("No such shipment."));

        if (shipment.getStatus() == ShipmentStatus.DOCS_PENDING) {
            throw ApiException.conflict(
                    "Documents for this consignment have not cleared validation. "
                            + "Resolve them before dispatch.");
        }
        if (!shipment.getStatus().isOpen()) {
            throw ApiException.conflict("That consignment is already closed.");
        }

        // One vehicle at a time on one consignment.
        //
        // A second trip against the same shipment is a real case — refused at
        // the gate and sent back is exactly why trips and shipments are
        // separate tables — but it follows the first *ending*, it does not run
        // beside it. Without this guard the two are indistinguishable, and the
        // easiest way to reach the bad one is a double-click on Start trip:
        // two ACTIVE trips, two vehicles, two sets of positions, and an ETA
        // cycle predicting both against one slot.
        trips.findByShipmentIdAndTenantId(shipmentId, tenantId).stream()
                .filter(Trip::isActive)
                .findFirst()
                .ifPresent(active -> {
                    throw ApiException.conflict(
                            "That consignment already has trip " + active.getId()
                                    + " on the road. Close it before starting another.");
                });

        Trip trip = new Trip();
        trip.setId("trip-" + UUID.randomUUID().toString().substring(0, 8));
        trip.setShipment(shipment);
        trip.setTenant(shipment.getVendor());
        trip.setVehicleRegistration(vehicleRegistration);
        // The requested driver, or the one the consignment was booked with.
        //
        // This parameter was accepted and dropped on the floor: the column, the
        // entity field and TripRepository.findByDriverIdAndStatus ("a driver
        // sees their own trips") all existed, and nothing ever populated them,
        // so that query returned nothing for everybody.
        trip.setDriver(resolveDriver(driverId, shipment));
        trip.setStatus(TripStatus.ACTIVE);
        trip.setStartedAt(Instant.now());
        trip.setLane(matchLane(shipment));

        trip.addEvent(new TripEvent(TripEventType.DEPARTED, trip.getStartedAt(),
                "Departed origin")
                .with("vehicleRegistration", vehicleRegistration)
                .with("laneCode", trip.getLane() == null ? null : trip.getLane().getCode()));

        shipment.setStatus(ShipmentStatus.IN_TRANSIT);

        // Saved through the repository only, and deliberately NOT also added to
        // shipment.trips. That collection cascades ALL, so doing both registers
        // the same id twice in one persistence context — once by the cascade and
        // once by the merge that save() performs on an entity with an assigned
        // id — and Hibernate rejects the second with a duplicate-identifier
        // error. The collection reloads from the database on the next read.
        Trip saved = trips.save(trip);

        log.info("Trip {} started for shipment {} on lane {}", saved.getId(), shipmentId,
                saved.getLane() == null ? "(unmatched)" : saved.getLane().getCode());
        return detail(saved);
    }

    /**
     * The driver to record against the trip.
     *
     * <p>An unrecognised id falls back to the shipment's own driver rather than
     * failing the dispatch. Losing the vehicle over a stale id in a request
     * body would be the wrong trade — the consignment already names a driver,
     * and that is the answer the paperwork will be checked against anyway.
     */
    private Driver resolveDriver(String driverId, Shipment shipment) {
        if (driverId == null || driverId.isBlank()) {
            return shipment.getDriver();
        }
        return drivers.findById(driverId).orElseGet(shipment::getDriver);
    }

    /** Every trip against one consignment, most recent first. */
    @Transactional(readOnly = true)
    public List<TripSummary> listForShipment(String shipmentId, String tenantId) {
        return trips.findByShipmentIdAndTenantId(shipmentId, tenantId).stream()
                .sorted(Comparator.comparing(Trip::getStartedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::summary)
                .toList();
    }

    /**
     * Attaches the trip to a corridor the cluster already has history for.
     *
     * <p>A trip with no lane still runs and still records positions — it simply
     * predicts from segment defaults rather than from pooled experience, and
     * contributes nothing back. That is the honest behaviour for a genuinely
     * new route, and it is why the tolerance above is generous.
     */
    private Lane matchLane(Shipment shipment) {
        if (shipment.getOrigin() == null || shipment.getFulfilmentCentre() == null) {
            return null;
        }
        return lanes.findNearestOrigin(
                shipment.getFulfilmentCentre().getId(),
                shipment.getOrigin().getLat(),
                shipment.getOrigin().getLng(),
                LANE_MATCH_TOLERANCE_M).orElse(null);
    }

    /**
     * Closes a trip.
     *
     * <p>Takes the same row lock the geofence listener uses, and for the same
     * reason. Ingest returns 202 before zone detection has run, so a client
     * that posts its final batch and immediately closes the trip races the
     * listener: this method would read the trip, the listener would write
     * gate_in_at, and then this method would save its stale copy straight over
     * it — leaving a trip with a GATE_IN event in its timeline but no gate time
     * on the row. Locking makes the two serialise, and whichever runs second
     * sees what the first wrote.
     */
    @Transactional
    public TripDetail complete(String tripId, String tenantId) {
        Trip trip = trips.findByIdForUpdate(tripId, tenantId)
                .orElseThrow(() -> ApiException.notFound("No such trip."));

        trip.setStatus(TripStatus.COMPLETED);
        trip.setEndedAt(Instant.now());
        if (trip.getShipment() != null) {
            trip.getShipment().setStatus(ShipmentStatus.DELIVERED);
            trip.getShipment().setDeliveredAt(trip.getEndedAt());
        }
        trips.save(trip);
        return detail(trip);
    }

    @Transactional(readOnly = true)
    public TripDetail get(String tripId, String tenantId) {
        return detail(trips.findByIdAndTenantId(tripId, tenantId)
                .orElseThrow(() -> ApiException.notFound("No such trip.")));
    }

    @Transactional(readOnly = true)
    public List<TripSummary> listActive(String tenantId) {
        return trips.findByTenantIdAndStatus(tenantId, TripStatus.ACTIVE).stream()
                .map(this::summary).toList();
    }

    @Transactional(readOnly = true)
    public List<PositionView> positions(String tripId, String tenantId) {
        // Ownership first: the position repository is not tenant-scoped because
        // reaching it always goes through a trip that has been checked.
        if (!trips.existsByIdAndTenantId(tripId, tenantId)) {
            throw ApiException.notFound("No such trip.");
        }
        return positions.findByTripIdOrderByDeviceTimestampAsc(tripId).stream()
                .map(TripService::view).toList();
    }

    // --- mapping ------------------------------------------------------------

    private TripSummary summary(Trip trip) {
        Position last = positions
                .findByTripIdOrderByDeviceTimestampDesc(trip.getId(), Limit.of(1))
                .stream().findFirst().orElse(null);

        // The current belief, which is the most recent prediction written.
        EtaPrediction eta = predictions
                .findFirstByTripIdOrderByMadeAtDesc(trip.getId()).orElse(null);

        Instant slotStart = trip.getShipment() == null ? null : trip.getShipment().getSlotStart();
        Instant slotEnd = trip.getShipment() == null ? null : trip.getShipment().getSlotEnd();
        Instant predicted = eta == null ? null : eta.getPredictedDockInAt();

        Long fixAgeMinutes = last == null ? null
                : Duration.between(last.getDeviceTimestamp(), Instant.now()).toMinutes();

        // Lateness is only meaningful against a live prediction. Suppressed
        // once the fix is stale — reporting it from a four-day-old position is
        // what produced "85 hours late", and the number was arithmetically
        // correct and completely worthless.
        boolean stale = fixAgeMinutes != null && fixAgeMinutes > STALE_AFTER_MINUTES;
        Long minutesLate = (stale || predicted == null || slotEnd == null) ? null
                : Duration.between(slotEnd, predicted).toMinutes();

        // Same reasoning for the estimate itself: do not show an arrival time
        // derived from a position nobody believes.
        Instant shownPrediction = stale ? null : predicted;

        return new TripSummary(
                trip.getId(),
                trip.getShipment() == null ? null : trip.getShipment().getId(),
                trip.getShipment() == null ? null : trip.getShipment().getReference(),
                trip.getStatus(),
                trip.getVehicleRegistration(),
                trip.getLane() == null ? null : trip.getLane().getCode(),
                millis(trip.getStartedAt()),
                millis(trip.getGateInAt()),
                millis(trip.getDockInAt()),
                last == null ? null : last.getLat(),
                last == null ? null : last.getLon(),
                last == null ? null : last.getSource(),
                last == null ? null : millis(last.getDeviceTimestamp()),
                fixAgeMinutes,
                millis(shownPrediction),
                stale || eta == null ? null : millis(eta.getConfidenceLowAt()),
                stale || eta == null ? null : millis(eta.getConfidenceHighAt()),
                millis(slotStart),
                millis(slotEnd),
                minutesLate,
                riskOf(predicted, eta, slotStart, slotEnd, fixAgeMinutes));
    }

    /**
     * Where this trip stands against its booked window.
     *
     * <p>Computed from the prediction and the slot on every read rather than
     * stored, so it can never disagree with the times shown beside it.
     *
     * <p>AT_RISK is the interesting case and the reason the confidence band is
     * kept. The midpoint landing inside the window is not the same as the
     * delivery being safe: if the pessimistic edge falls outside it, the honest
     * answer is "probably, but do not rely on it", and a dispatcher deciding
     * whether to telephone the fulfilment centre needs that distinction rather
     * than a reassuring green tick.
     */
    private RiskState riskOf(Instant predicted, EtaPrediction eta,
                             Instant slotStart, Instant slotEnd, Long fixAgeMinutes) {
        // Checked before anything else: a stale trip has an old prediction
        // still attached, and reporting risk from it is the bug this guards.
        if (fixAgeMinutes != null && fixAgeMinutes > STALE_AFTER_MINUTES) {
            return RiskState.TRACKING_LOST;
        }
        if (predicted == null || slotEnd == null) {
            return RiskState.UNKNOWN;
        }
        if (predicted.isAfter(slotEnd)) {
            return RiskState.LATE;
        }
        if (slotStart != null && predicted.isBefore(slotStart)) {
            return RiskState.EARLY;
        }
        Instant worstCase = eta == null ? null : eta.getConfidenceHighAt();
        if (worstCase != null && worstCase.isAfter(slotEnd)) {
            return RiskState.AT_RISK;
        }
        return RiskState.ON_TIME;
    }

    private TripDetail detail(Trip trip) {
        List<TripEventView> events = tripEvents.findByTripIdOrderByAtAsc(trip.getId()).stream()
                .map(e -> new TripEventView(e.getType(), millis(e.getAt()), e.getLabel(), e.getPayload()))
                .toList();

        return new TripDetail(
                summary(trip),
                millis(trip.getEndedAt()),
                millis(trip.getDockOutAt()),
                trip.turnaroundMinutes(),
                positions.countByTripId(trip.getId()),
                Math.round(positions.travelledMetres(trip.getId())),
                events);
    }

    private static PositionView view(Position p) {
        return new PositionView(p.getId(), p.getLat(), p.getLon(),
                p.getSpeedKmph(), p.getHeadingDeg(),
                p.getDeviceTimestamp().toEpochMilli(),
                p.getReceivedAt().toEpochMilli(),
                p.getSource(), p.latencySeconds());
    }

    /** Epoch millis, matching every other timestamp this API emits. */
    private static Long millis(Instant instant) {
        return instant == null ? null : instant.toEpochMilli();
    }
}
