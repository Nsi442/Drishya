package com.drishya.backend.service.eta;

import com.drishya.backend.domain.Appointment;
import com.drishya.backend.domain.EtaPrediction;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.enums.AlertSeverity;
import com.drishya.backend.domain.enums.AlertType;
import com.drishya.backend.domain.enums.AppointmentStatus;
import com.drishya.backend.repo.AppointmentRepository;
import com.drishya.backend.repo.EtaPredictionRepository;
import com.drishya.backend.repo.TripRepository;
import com.drishya.backend.service.AlertService;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tells the receiving desk to book a dock, an hour before the lorry gets there.
 *
 * <p>Booking a consignment agrees a promised <i>slot</i> with the vendor. It
 * does not book a <i>dock</i> — that is the fulfilment centre's decision, made
 * through the appointment flow, and until someone makes it the vehicle arrives
 * to a yard with nowhere to go. Nothing in the system asked for that decision;
 * it relied on somebody at the desk watching the arrival board closely enough
 * to notice a vehicle getting close.
 *
 * <p><b>The platform already knows.</b> It has a live prediction for every
 * active trip, recomputed every minute by {@link EtaScheduler}. Knowing a lorry
 * is an hour out and not saying so is the gap this closes — an estimate that
 * changes nobody's decision is not worth computing.
 *
 * <p><b>The notice is the product's own claim, so it is held to the product's
 * rules.</b> It is sent from the engine's stored prediction, never from a
 * client's arithmetic; it is not sent at all when the prediction is too old to
 * be believed; and it is sent once per journey rather than once per cycle.
 */
@Component
public class ApproachingArrivalJob {

    private static final Logger log = LoggerFactory.getLogger(ApproachingArrivalJob.class);

    /**
     * How stale a prediction may be and still be worth acting on.
     *
     * <p>Matches {@code FeatureBuilder.MAX_FIX_AGE}, and for the same reason.
     * The engine refuses to predict from a fix older than two hours, so a
     * prediction older than that was made from a vehicle nobody has heard from
     * since. Announcing "arriving within the hour" on that basis is precisely
     * the confident-nonsense failure {@code StaleTripJob} exists to prevent,
     * except broadcast to a second party who will act on it.
     */
    private static final Duration MAX_PREDICTION_AGE = Duration.ofHours(2);

    /** Slot times are read by people standing at a receiving desk in India. */
    private static final DateTimeFormatter CLOCK =
            DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Asia/Kolkata"));

    /**
     * An appointment in either of these states means the desk has already
     * dealt with this consignment and does not need telling.
     *
     * <p>REJECTED and ALTERNATIVE are deliberately absent: both mean the
     * conversation is unresolved, and a lorry an hour out with a rejected
     * appointment is exactly the case worth raising.
     */
    private static final List<AppointmentStatus> SETTLED =
            List.of(AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED,
                    AppointmentStatus.COMPLETED);

    private final TripRepository trips;
    private final EtaPredictionRepository predictions;
    private final AppointmentRepository appointments;
    private final AlertService alerts;
    private final Duration leadTime;

    public ApproachingArrivalJob(TripRepository trips, EtaPredictionRepository predictions,
                                 AppointmentRepository appointments, AlertService alerts,
                                 @Value("${drishya.arrival.notice-lead-min:60}") long leadTimeMin) {
        this.trips = trips;
        this.predictions = predictions;
        this.appointments = appointments;
        this.alerts = alerts;
        this.leadTime = Duration.ofMinutes(leadTimeMin);
    }

    /**
     * Once a minute, on the same cadence as the predictions it reads.
     *
     * <p>Offset from {@link EtaScheduler} by half a minute rather than racing
     * it. Both are cheap, but reading predictions in the same instant they are
     * being rewritten buys nothing and makes the log harder to follow.
     *
     * <p>Cross-tenant, like every scheduled job here: this is the system acting
     * on its own behalf, and there is no caller to scope it to.
     */
    @Scheduled(fixedDelayString = "${drishya.arrival.cycle-ms:60000}", initialDelayString = "60000")
    @Transactional
    public void notifyApproaching() {
        List<Trip> active = trips.findAllActiveAcrossTenants();
        if (active.isEmpty()) {
            return;
        }

        Instant now = Instant.now();
        int notified = 0;

        for (Trip trip : active) {
            try {
                if (notifyIfApproaching(trip, now)) {
                    notified++;
                }
            } catch (Exception e) {
                // One trip that cannot be announced must not silence the rest.
                log.error("Approach check failed for trip {}: {}", trip.getId(), e.getMessage());
            }
        }

        if (notified > 0) {
            log.info("Asked receiving to book a dock for {} approaching vehicle(s)", notified);
        }
    }

    private boolean notifyIfApproaching(Trip trip, Instant now) {
        if (trip.getSlotRequestNotifiedAt() != null) {
            return false;
        }

        // Already at the gate or on a bay. The notice is about a vehicle that
        // is still coming; once it is here the arrival board has the story.
        if (trip.getGateInAt() != null || trip.getDockInAt() != null) {
            return false;
        }

        Optional<EtaPrediction> latest =
                predictions.findFirstByTripIdOrderByMadeAtDesc(trip.getId());
        if (latest.isEmpty()) {
            return false;
        }

        EtaPrediction prediction = latest.get();
        Instant arrival = prediction.getPredictedDockInAt();
        if (arrival == null) {
            // A withdrawn estimate is a legitimate null, and it means the engine
            // declined to answer. Nothing to announce.
            return false;
        }

        if (Duration.between(prediction.getMadeAt(), now).compareTo(MAX_PREDICTION_AGE) > 0) {
            log.debug("Trip {} last predicted {} ago; too stale to announce",
                    trip.getId(), Duration.between(prediction.getMadeAt(), now));
            return false;
        }

        Duration out = Duration.between(now, arrival);
        // Not yet close enough, or already overdue. An overdue vehicle is a
        // delay, which the alert feed reports on its own terms — dressing it up
        // as "arriving soon" would be the wrong message at the worst moment.
        if (out.isNegative() || out.compareTo(leadTime) > 0) {
            return false;
        }

        Shipment s = trip.getShipment();
        if (s == null || s.getFulfilmentCentre() == null) {
            return false;
        }

        if (hasSettledAppointment(s.getId())) {
            // The desk has a dock in hand. Marked as notified anyway so this
            // trip is not re-examined every cycle for the rest of the hour.
            trip.setSlotRequestNotifiedAt(now);
            return false;
        }

        alerts.raise(AlertType.SLOT_REQUIRED, AlertSeverity.WARNING,
                "Dock slot needed within the hour",
                "%s arrives at %s about %s, and has no dock booked. %s cartons from %s on %s."
                        .formatted(
                                s.getId(),
                                s.getFulfilmentCentre().getName(),
                                CLOCK.format(arrival),
                                s.getCartons(),
                                s.getVendor() == null ? "a vendor" : s.getVendor().getName(),
                                trip.getVehicleRegistration() == null
                                        ? "an unassigned vehicle" : trip.getVehicleRegistration()),
                s);

        trip.setSlotRequestNotifiedAt(now);
        log.info("{} is {} minutes out from {} with no dock booked; receiving notified",
                s.getId(), out.toMinutes(), s.getFulfilmentCentre().getId());
        return true;
    }

    private boolean hasSettledAppointment(String shipmentId) {
        for (Appointment appointment : appointments.findByShipmentId(shipmentId)) {
            if (SETTLED.contains(appointment.getStatus())) {
                return true;
            }
        }
        return false;
    }
}
