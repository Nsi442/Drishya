package com.drishya.backend.web;

import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.dto.PositionDtos.IngestAck;
import com.drishya.backend.dto.PositionDtos.PositionBatch;
import com.drishya.backend.dto.PositionDtos.PositionView;
import com.drishya.backend.dto.TripDtos.SimulationView;
import com.drishya.backend.dto.TripDtos.StartSimulationRequest;
import com.drishya.backend.dto.TripDtos.StartTripRequest;
import com.drishya.backend.dto.TripDtos.TripDetail;
import com.drishya.backend.dto.TripDtos.TripSummary;
import com.drishya.backend.service.ApiException;
import com.drishya.backend.service.CallerService;
import com.drishya.backend.service.PositionIngestService;
import com.drishya.backend.service.TripService;
import com.drishya.backend.service.TripSimulationService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Trips and position ingest.
 *
 * <p>Mounted under an explicit {@code /api/v1} prefix rather than through
 * Spring 7's version resolver. The existing fifty-odd endpoints are unversioned
 * at {@code /api/**} and a hundred-odd frontend files call them that way;
 * switching on path-segment version resolution globally would try to parse
 * "alerts" as a version and break all of them at once. The versioning strategy
 * is configured in WebConfig for endpoints added from here on — this prefix is
 * what the specification names, and the two agree.
 */
@RestController
@RequestMapping("/api/v1/trips")
public class TripController {

    private final TripService tripService;
    private final PositionIngestService ingest;
    private final TripSimulationService simulations;
    private final CallerService callers;

    public TripController(TripService tripService, PositionIngestService ingest,
                          TripSimulationService simulations, CallerService callers) {
        this.tripService = tripService;
        this.ingest = ingest;
        this.simulations = simulations;
        this.callers = callers;
    }

    /**
     * Accepts a batch of position fixes.
     *
     * <p><b>202, not 201.</b> The request thread validates, writes and returns.
     * The geofence evaluation that decides whether this batch means the vehicle
     * has arrived runs afterwards on another thread, so by the time the caller
     * reads this response the gate event may not exist yet. 202 says exactly
     * that; 201 would claim a completeness the endpoint does not offer.
     *
     * <p>Partial acceptance is deliberate too. One fix with a broken clock in a
     * dead-zone catch-up of two hundred must not discard the other 199 — the
     * body reports what was taken and what was not.
     */
    @PostMapping("/{tripId}/positions")
    public ResponseEntity<IngestAck> ingestPositions(
            @PathVariable String tripId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @Valid @RequestBody PositionBatch batch) {

        String tenantId = callers.requireTenant(userId);
        IngestAck ack = ingest.ingest(tripId, tenantId, batch);
        return ResponseEntity.accepted().body(ack);
    }

    @PostMapping("/from-shipment/{shipmentId}")
    @org.springframework.web.bind.annotation.ResponseStatus(HttpStatus.CREATED)
    public TripDetail start(@PathVariable String shipmentId,
                            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
                            @Valid @RequestBody StartTripRequest request) {
        String tenantId = callers.requireTenant(userId);
        return tripService.start(shipmentId, tenantId,
                request.vehicleRegistration(), request.driverId());
    }

    @PostMapping("/{tripId}/complete")
    public TripDetail complete(@PathVariable String tripId,
                               @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return tripService.complete(tripId, callers.requireTenant(userId));
    }

    /**
     * Starts a server-side vehicle driving this trip's route.
     *
     * <p>The hosted equivalent of running {@code simulator/simulate.py}: same
     * ingest path, same SIMULATED provenance, no terminal. Restarting a
     * simulation that has arrived or been stopped is allowed and is the common
     * case; one that is still running is a conflict.
     *
     * <p>The body is optional — {@code speedKmph} and {@code timeScale} both
     * have defaults — so a bare POST is the whole happy path.
     */
    @PostMapping("/{tripId}/simulation")
    public SimulationView startSimulation(
            @PathVariable String tripId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @Valid @RequestBody(required = false) StartSimulationRequest request) {
        return simulations.start(tripId, callers.requireTenant(userId), request);
    }

    /** Parks the vehicle where it stands. The trip and its fixes are untouched. */
    @DeleteMapping("/{tripId}/simulation")
    public SimulationView stopSimulation(
            @PathVariable String tripId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return simulations.stop(tripId, callers.requireTenant(userId));
    }

    /** 404 when this trip has never been simulated, which is the common case. */
    @GetMapping("/{tripId}/simulation")
    public SimulationView getSimulation(
            @PathVariable String tripId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return simulations.find(tripId, callers.requireTenant(userId))
                .orElseThrow(() -> ApiException.notFound("No simulation on that trip."));
    }

    /**
     * Every trip against one consignment.
     *
     * <p>The shipment detail page needs to know whether this consignment
     * already has a vehicle on the road before it offers to start one, and
     * asking for the tenant's whole active list and filtering it in the browser
     * would grow with the fleet to answer a question about one row.
     */
    @GetMapping("/by-shipment/{shipmentId}")
    public List<TripSummary> byShipment(
            @PathVariable String shipmentId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return tripService.listForShipment(shipmentId, callers.requireTenant(userId));
    }

    @GetMapping("/active")
    public List<TripSummary> active(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return tripService.listActive(callers.requireTenant(userId));
    }

    @GetMapping("/{tripId}")
    public TripDetail get(@PathVariable String tripId,
                          @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return tripService.get(tripId, callers.requireTenant(userId));
    }

    /** The full trace, in driven order. Each fix carries its own provenance. */
    @GetMapping("/{tripId}/positions")
    public List<PositionView> positions(
            @PathVariable String tripId,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return tripService.positions(tripId, callers.requireTenant(userId));
    }
}
