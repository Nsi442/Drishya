package com.drishya.backend.web;

import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.TripEvent;
import com.drishya.backend.domain.enums.TripEventType;
import com.drishya.backend.repo.TripEventRepository;
import com.drishya.backend.repo.TripRepository;
import com.drishya.backend.service.CallerService;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The vendor's exception queue: things that need a person today.
 *
 * <p>Two kinds, and they are the two the platform can see before anybody else
 * does. A predicted delay is raised while the vehicle is still moving and the
 * slot can still be renegotiated. A rejected notice is raised before the vehicle
 * has left at all.
 *
 * <p><b>Derived from trip events, never stored separately.</b> Every row here
 * points at a real event on a real trip, so clicking through always lands
 * somewhere coherent. A parallel exceptions table would be free to drift from
 * the events it claims to summarise, and the first time it did, the queue would
 * be showing a delay for a vehicle that had already docked.
 *
 * <p>Distinct from {@code /api/exceptions}, which is the fulfilment centre's
 * receiving-side queue — damage, shortages, unscheduled arrivals. That is the
 * counterparty's view of goods that have arrived; this is the vendor's view of
 * goods that have not.
 */
@RestController
@RequestMapping("/api/v1/exceptions")
public class ExceptionQueueController {

    /** The event types that represent something a vendor must act on. */
    private static final List<TripEventType> ACTIONABLE =
            List.of(TripEventType.DELAY_PREDICTED, TripEventType.DOC_REJECTED);

    private final TripRepository trips;
    private final TripEventRepository events;
    private final CallerService callers;

    public ExceptionQueueController(TripRepository trips, TripEventRepository events,
                                    CallerService callers) {
        this.trips = trips;
        this.events = events;
        this.callers = callers;
    }

    @GetMapping
    public List<ExceptionRow> list(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {

        String tenantId = callers.requireTenant(userId);

        return trips.findByTenantIdOrderByStartedAtDesc(tenantId).stream()
                .flatMap(trip -> events.findByTripIdOrderByAtAsc(trip.getId()).stream()
                        .filter(e -> ACTIONABLE.contains(e.getType()))
                        .map(e -> toRow(trip, e)))
                // Newest first: an exception raised two minutes ago is more
                // actionable than one from yesterday, whatever its severity.
                .sorted(Comparator.comparingLong(ExceptionRow::at).reversed())
                .toList();
    }

    private ExceptionRow toRow(Trip trip, TripEvent event) {
        Map<String, Object> payload = event.getPayload() == null ? Map.of() : event.getPayload();

        boolean delay = event.getType() == TripEventType.DELAY_PREDICTED;
        Object lateBy = payload.get("lateByMinutes");

        return new ExceptionRow(
                trip.getId() + "-" + event.getId(),
                event.getType().wire(),
                trip.getId(),
                trip.getShipment() == null ? null : trip.getShipment().getId(),
                trip.getShipment() == null ? null : trip.getShipment().getReference(),
                trip.getVehicleRegistration(),
                trip.getLane() == null ? null : trip.getLane().getCode(),
                event.getAt().toEpochMilli(),
                event.getLabel(),
                // Severity is a judgement about consequence, not about the event
                // type. Missing a slot by ten minutes is usually absorbed; by an
                // hour it means a refused delivery or a renegotiation.
                severityOf(delay, lateBy),
                lateBy instanceof Number n ? n.longValue() : null,
                payload);
    }

    private String severityOf(boolean delay, Object lateBy) {
        if (!delay) {
            // A rejected notice always blocks dispatch, so it is always urgent.
            return "critical";
        }
        long minutes = lateBy instanceof Number n ? n.longValue() : 0;
        return minutes >= 60 ? "critical" : minutes >= 20 ? "warning" : "info";
    }

    /**
     * One thing to deal with.
     *
     * @param payload the structured detail the event carried — predicted time,
     *     slot end, which checks failed. Passed through rather than flattened so
     *     the browser can show the specifics without another round trip.
     */
    public record ExceptionRow(
            String id,
            String type,
            String tripId,
            String shipmentId,
            String reference,
            String vehicleRegistration,
            String laneCode,
            long at,
            String label,
            String severity,
            Long lateByMinutes,
            Map<String, Object> payload) {
    }
}
