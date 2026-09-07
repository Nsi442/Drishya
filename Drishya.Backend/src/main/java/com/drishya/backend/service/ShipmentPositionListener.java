package com.drishya.backend.service;

import com.drishya.backend.domain.Trip;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.TripRepository;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Moves the consignment to wherever its vehicle actually is.
 *
 * <p><b>The gap this closes.</b> The platform kept two accounts of where a
 * lorry was. One was the trip: real fixes, ingested, geofenced, predicted
 * against. The other was {@code Shipment.position} — and nothing on the server
 * ever wrote it. It was authored entirely by {@code useLiveShipments}, the
 * simulation running in whichever browsers happened to be open.
 *
 * <p>Every table, map pin and progress bar outside the trips page reads the
 * shipment. So the vendor's tab, the driver's phone and the receiving desk each
 * advanced their own copy of the same lorry with their own random walk, wrote
 * it back over each other every three seconds, and none of the three matched
 * the trip the server was actually driving. Three answers to "where is it", all
 * confident, none of them the platform's.
 *
 * <p>Now there is one. A fix lands, and the consignment follows it.
 *
 * <p><b>Position and speed only.</b> How far along the route that is, and when
 * it will arrive, belong to the ETA engine — it has already had PostGIS locate
 * the vehicle on the lane, and a second answer computed here would be a worse
 * one competing with it. This listener copies what the fix directly says and
 * nothing it would have to infer.
 *
 * <p><b>It writes columns, not an entity.</b> {@link GeofenceListener} reacts
 * to the same batch on the same pool and sets the shipment's status. Two loaded
 * copies of an unversioned row would each write the whole row back, so the
 * second to commit would quietly undo the first — the gate-in this batch earned
 * reverted by the position from the same batch. See
 * {@code ShipmentRepository.recordPosition}.
 */
@Component
public class ShipmentPositionListener {

    private static final Logger log = LoggerFactory.getLogger(ShipmentPositionListener.class);

    private final TripRepository trips;
    private final ShipmentRepository shipments;

    public ShipmentPositionListener(TripRepository trips, ShipmentRepository shipments) {
        this.trips = trips;
        this.shipments = shipments;
    }

    /**
     * Runs after the ingest transaction commits, on another thread.
     *
     * <p>The same three annotations as {@link GeofenceListener}, for the same
     * three reasons: AFTER_COMMIT so a rolled-back batch never moves a
     * consignment to a position that was refused, Async so ingest has already
     * returned 202, and REQUIRES_NEW because the originating transaction is
     * over and these writes need one of their own.
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onPositions(PositionRecorded batch) {
        try {
            apply(batch);
        } catch (Exception e) {
            // Never allowed to matter to ingest, which has already committed
            // and returned. A consignment pin one batch behind is a cosmetic
            // fault; a refused fix is a lost one.
            log.error("Could not move the consignment on trip {}: {}",
                    batch.tripId(), e.getMessage(), e);
        }
    }

    private void apply(PositionRecorded batch) {
        List<PositionRecorded.Fix> fixes = batch.fixes();
        if (fixes.isEmpty()) {
            return;
        }

        // The last one. The batch is ordered oldest first — that order is the
        // contract PositionRecorded states — and the consignment only has room
        // for one position, which should be the newest thing known.
        PositionRecorded.Fix latest = fixes.getLast();

        Trip trip = trips.findById(batch.tripId()).orElse(null);
        if (trip == null || trip.getShipment() == null) {
            return;
        }

        // Device time, not now(). This is when the vehicle was there, and a
        // batch buffered through a dead zone is exactly the case where the two
        // differ by an hour — the whole point of accepting backdated fixes is
        // that they are honest about when they happened.
        Instant at = latest.deviceTimestamp() == null ? Instant.now() : latest.deviceTimestamp();
        // Left null when the fix did not measure one, so the update keeps the
        // last speed that was measured rather than reporting a stopped vehicle.
        Integer speedKmph = latest.speedKmph() == null
                ? null : (int) Math.round(latest.speedKmph());

        // Zero rows means the consignment was delivered or cancelled while this
        // fix was in flight, which is a legitimate outcome rather than a fault:
        // the vehicle's journey is over and its position no longer moves.
        shipments.recordPosition(trip.getShipment().getId(),
                latest.lat(), latest.lon(), speedKmph, at);
    }
}
