package com.drishya.backend.service;

import com.drishya.backend.domain.FulfilmentCentre;
import com.drishya.backend.domain.Geo;
import com.drishya.backend.domain.GeoPoint;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.TripSimulation;
import com.drishya.backend.domain.enums.PositionSource;
import com.drishya.backend.domain.enums.SimulationStatus;
import com.drishya.backend.domain.enums.TripStatus;
import com.drishya.backend.dto.PositionDtos.PositionBatch;
import com.drishya.backend.dto.PositionDtos.PositionReport;
import com.drishya.backend.dto.TripDtos.SimulationView;
import com.drishya.backend.dto.TripDtos.StartSimulationRequest;
import com.drishya.backend.repo.TripRepository;
import com.drishya.backend.repo.TripSimulationRepository;
import com.drishya.backend.seed.GeoUtil;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Drives a vehicle along a trip's route from the server.
 *
 * <p>The deployed counterpart to {@code simulator/simulate.py}. That script
 * needs a terminal and a laptop that stays awake, which makes it useless for
 * the thing a hosted demo is for — opening a URL and watching a lorry move.
 * This does the same job from a button, and produces fixes indistinguishable in
 * every respect that matters: same ingest path, same validation, same
 * {@code SIMULATED} provenance, same geofence and ETA consequences.
 *
 * <p><b>It never writes a position directly.</b> Every fix goes through
 * {@link PositionIngestService#ingest}, the same method the script and any real
 * device would use. A second write path into {@code positions} would be a
 * second place for the clock-skew rules, the provenance label and the
 * {@code PositionRecorded} publication to drift out of agreement — and the
 * first symptom would be a simulated vehicle that never triggers a geofence,
 * which reads as a broken geofence.
 */
@Service
public class TripSimulationService {

    private static final Logger log = LoggerFactory.getLogger(TripSimulationService.class);

    /** The Python simulator's default, so the two agree out of the box. */
    private static final double DEFAULT_SPEED_KMPH = 52.0;

    /**
     * Simulated seconds per real second, by default.
     *
     * <p>Sixty puts a 130 km lane at a little over two minutes, which is about
     * as long as anyone will watch a map before deciding it is broken. Real
     * time is available by asking for 1.0 and is the honest setting for
     * measuring anything; this is the setting for showing somebody.
     */
    private static final double DEFAULT_TIME_SCALE = 60.0;

    private static final double MAX_SPEED_KMPH = 120.0;
    private static final double MAX_TIME_SCALE = 600.0;

    /**
     * Simulated seconds between fixes.
     *
     * <p>Matches the script's {@code --interval} default. It is not the tick
     * period: one tick emits as many fixes as the simulated time it covers
     * calls for, so raising the time scale produces a denser batch rather than
     * a vehicle that teleports between sparse points. That matters at the end
     * of the route, where the geofence needs a sequence of fixes to see a
     * crossing rather than a single fly-by.
     */
    private static final double FIX_INTERVAL_SIMULATED_S = 30.0;

    /**
     * Ceiling on fixes produced by one tick.
     *
     * <p>Bounds the damage from a long gap — a platform spin-down of an hour at
     * 60x is a fortnight of simulated driving, and without a cap the first tick
     * after the wake would try to write several thousand rows in one
     * transaction on a free-tier database. The vehicle jumps further in that
     * tick instead, which is the right trade: the position stays truthful, only
     * the density of the trace suffers.
     */
    private static final int MAX_FIXES_PER_TICK = 24;

    /**
     * How much a fix's speed wanders around the configured mean.
     *
     * <p>A vehicle at a metronomic 52 km/h makes the ETA engine look better
     * than it is: there is nothing to be wrong about, so the confidence band
     * never earns its keep and the segment history learns a road nobody drives.
     */
    private static final double SPEED_VARIANCE = 0.18;

    private final TripSimulationRepository simulations;
    private final TripRepository trips;
    private final PositionIngestService ingest;

    public TripSimulationService(TripSimulationRepository simulations, TripRepository trips,
                                 PositionIngestService ingest) {
        this.simulations = simulations;
        this.trips = trips;
        this.ingest = ingest;
    }

    // ----------------------------------------------------------------- start

    @Transactional
    public SimulationView start(String tripId, String tenantId, StartSimulationRequest request) {
        Trip trip = trips.findByIdAndTenantId(tripId, tenantId)
                .orElseThrow(() -> ApiException.notFound("No such trip."));

        if (trip.getStatus() != TripStatus.ACTIVE) {
            throw ApiException.conflict(
                    "That trip is " + trip.getStatus().wire() + " and is not on the road.");
        }

        // A simulation already at ARRIVED or STOPPED is restartable — that is
        // the "run it again" case and it is the common one in a demo. Only a
        // vehicle currently moving is a conflict.
        Optional<TripSimulation> existing = simulations.findByTripIdAndTenantId(tripId, tenantId);
        if (existing.isPresent() && existing.get().isRunning()) {
            throw ApiException.conflict("That trip already has a vehicle running on it.");
        }

        Shipment shipment = trip.getShipment();
        List<GeoPoint> route = drivingRoute(shipment);
        if (route.size() < 2) {
            // Refusing beats starting a vehicle that cannot move: a simulation
            // sitting at 0 km forever looks like a broken tick rather than a
            // consignment with no route.
            throw ApiException.badRequest("NO_ROUTE",
                    "That consignment has no route to drive. It was booked without one.");
        }

        double routeKm = GeoUtil.routeLength(route);
        if (routeKm <= 0) {
            throw ApiException.badRequest("NO_ROUTE",
                    "That consignment's origin and destination are the same place.");
        }

        Instant now = Instant.now();
        TripSimulation sim = existing.orElseGet(TripSimulation::new);
        sim.setTrip(trip);
        sim.setTenant(trip.getTenant());
        sim.setStatus(SimulationStatus.RUNNING);
        sim.setTravelledKm(0);
        sim.setRouteKm(routeKm);
        sim.setSpeedKmph(clamp(request == null ? null : request.speedKmph(),
                DEFAULT_SPEED_KMPH, MAX_SPEED_KMPH));
        sim.setTimeScale(clamp(request == null ? null : request.timeScale(),
                DEFAULT_TIME_SCALE, MAX_TIME_SCALE));
        sim.setStartedAt(now);
        sim.setLastTickAt(now);
        sim.setEndedAt(null);

        TripSimulation saved = simulations.save(sim);
        log.info("Simulation started on trip {} — {} km at {} km/h, {}x",
                tripId, Math.round(routeKm), Math.round(saved.getSpeedKmph()),
                Math.round(saved.getTimeScale()));
        return toView(saved);
    }

    @Transactional
    public SimulationView stop(String tripId, String tenantId) {
        TripSimulation sim = simulations.findByTripIdAndTenantId(tripId, tenantId)
                .orElseThrow(() -> ApiException.notFound("No simulation is running on that trip."));

        if (sim.isRunning()) {
            sim.setStatus(SimulationStatus.STOPPED);
            sim.setEndedAt(Instant.now());
            simulations.save(sim);
            log.info("Simulation on trip {} stopped by hand at {}%",
                    tripId, Math.round(sim.progress() * 100));
        }
        return toView(sim);
    }

    @Transactional(readOnly = true)
    public Optional<SimulationView> find(String tripId, String tenantId) {
        return simulations.findByTripIdAndTenantId(tripId, tenantId).map(this::toView);
    }

    // ------------------------------------------------------------------ tick

    /**
     * Advances one vehicle by however much real time has passed.
     *
     * <p>Its own transaction, one per vehicle. One route that cannot be walked
     * must not roll back the nineteen that can, and the ingest inside it needs
     * to commit before the geofence listener — which fires AFTER_COMMIT — can
     * see the fixes it is supposed to evaluate.
     *
     * @return true if the vehicle is still moving, false if this tick finished it
     */
    @Transactional
    public boolean advance(String tripId) {
        TripSimulation sim = simulations.findForTick(tripId).orElse(null);
        if (sim == null || !sim.isRunning()) {
            return false;
        }

        Trip trip = sim.getTrip();
        // The trip can be closed underneath a running simulation — completed by
        // hand, or abandoned by StaleTripJob. Keeping a vehicle driving into a
        // trip nobody considers live would put fixes on a closed record.
        if (trip == null || trip.getStatus() != TripStatus.ACTIVE) {
            sim.setStatus(SimulationStatus.STOPPED);
            sim.setEndedAt(Instant.now());
            simulations.save(sim);
            log.info("Simulation on trip {} stopped: the trip is no longer active", tripId);
            return false;
        }

        List<GeoPoint> route = drivingRoute(trip.getShipment());
        if (route.size() < 2) {
            sim.setStatus(SimulationStatus.STOPPED);
            sim.setEndedAt(Instant.now());
            simulations.save(sim);
            log.warn("Simulation on trip {} stopped: the shipment has no route", tripId);
            return false;
        }

        Instant now = Instant.now();
        double realSeconds = Math.max(0,
                Duration.between(sim.getLastTickAt(), now).toMillis() / 1000.0);
        if (realSeconds <= 0) {
            return true;
        }

        double simulatedSeconds = realSeconds * sim.getTimeScale();
        double distanceKm = sim.getSpeedKmph() * simulatedSeconds / 3600.0;
        double remainingKm = sim.getRouteKm() - sim.getTravelledKm();
        boolean arriving = distanceKm >= remainingKm;
        if (arriving) {
            distanceKm = remainingKm;
        }

        List<PositionReport> fixes = buildFixes(sim, route, distanceKm, realSeconds, now, arriving);

        sim.setTravelledKm(Math.min(sim.getRouteKm(), sim.getTravelledKm() + distanceKm));
        sim.setLastTickAt(now);
        if (arriving) {
            sim.setStatus(SimulationStatus.ARRIVED);
            sim.setEndedAt(now);
        }
        simulations.save(sim);

        if (!fixes.isEmpty()) {
            // Straight through the front door, tenant and all. If this ever
            // rejects a fix the simulator produced, that is worth knowing about
            // rather than routing around.
            var ack = ingest.ingest(tripId, sim.getTenant().getId(), new PositionBatch(fixes));
            if (ack.rejected() > 0) {
                log.warn("Simulation on trip {}: ingest rejected {} of {} fixes — {}",
                        tripId, ack.rejected(), fixes.size(), ack.rejections());
            }
        }

        if (arriving) {
            // Deliberately does NOT complete the trip, which simulate.py does.
            // Completing sets the shipment to DELIVERED, which would skip the
            // gate, the unload, the GRN and the proof of delivery — the half of
            // the product the receiving desk exists for. The vehicle is at the
            // bay; what happens next belongs to the people, not to the ticker.
            log.info("Simulation on trip {} arrived after {} km", tripId,
                    Math.round(sim.getRouteKm()));
        }
        return !arriving;
    }

    /**
     * The fixes covering one tick's worth of ground.
     *
     * <p>Spaced by simulated distance but stamped across the real elapsed
     * window, which is the only combination that is honest in both directions:
     * the trace shows a vehicle that moved at the speed it was given, and every
     * {@code deviceTimestamp} is a moment that actually happened. Stamping them
     * with simulated time would put fixes hours in the future and ingest would
     * — correctly — refuse them.
     */
    private List<PositionReport> buildFixes(TripSimulation sim, List<GeoPoint> route,
                                            double distanceKm, double realSeconds,
                                            Instant now, boolean arriving) {

        double simulatedSeconds = realSeconds * sim.getTimeScale();
        int count = (int) Math.ceil(simulatedSeconds / FIX_INTERVAL_SIMULATED_S);
        count = Math.max(1, Math.min(count, MAX_FIXES_PER_TICK));

        List<PositionReport> fixes = new ArrayList<>(count);
        double startKm = sim.getTravelledKm();
        double stepKm = distanceKm / count;
        long windowMs = Math.round(realSeconds * 1000);

        for (int i = 1; i <= count; i++) {
            double km = startKm + stepKm * i;
            double progress = sim.getRouteKm() <= 0 ? 0 : km / sim.getRouteKm();
            GeoPoint point = GeoUtil.positionAlongRoute(route, progress);
            if (point == null) {
                continue;
            }

            // The last fix of an arriving tick sits exactly on the destination
            // rather than a few metres short of it. The dock geofence is 60 m;
            // an interpolation rounding error is enough to miss it, and a
            // vehicle that drives to the gate and never docks is the failure
            // this is most likely to produce.
            if (arriving && i == count) {
                point = route.get(route.size() - 1);
            }

            GeoPoint ahead = GeoUtil.positionAlongRoute(route,
                    Math.min(1, progress + 0.001));

            double speed = arriving && i == count
                    ? 0
                    : Math.max(5, sim.getSpeedKmph()
                            * (1 + ThreadLocalRandom.current().nextGaussian() * SPEED_VARIANCE));

            // Spread across the window that has just elapsed, ending now.
            long at = now.toEpochMilli() - Math.round(windowMs * (double) (count - i) / count);

            fixes.add(new PositionReport(
                    round6(point.getLat()),
                    round6(point.getLng()),
                    round1(speed),
                    round1(bearing(point, ahead)),
                    at,
                    // The one field that is never configurable. A fix this
                    // produced must never be capable of being presented as
                    // something a driver's phone reported from the cab.
                    PositionSource.SIMULATED));
        }
        return fixes;
    }

    // ---------------------------------------------------------------- helpers

    /**
     * The polyline to drive: the shipment's route, then the last leg to the bay.
     *
     * <p><b>The route does not end where the vehicle stops.</b>
     * {@code ShipmentService.create} builds it between the vendor and the
     * fulfilment centre's <i>centroid</i>, and the bays are 170–220 m from that
     * on every seeded site. The arrival fence is drawn around the site (250 m)
     * but the dock fence is 60 m around the bays, so a vehicle driven to the
     * end of the shipment route lands inside the first and outside the second:
     * GATE_IN fires, DOCK_IN never does, and the consignment sits at
     * {@code at_gate} forever with no turnaround and no arrival for the ETA
     * engine to score itself against.
     *
     * <p>That is not a fudge to make the geofence happy — it is the leg a real
     * vehicle drives. The site entrance and the bay are different places, and
     * the minutes between them are the yard queue this product exists to
     * measure.
     *
     * <p>Recomputed identically on every tick rather than stored, so the
     * persisted {@code travelledKm} stays meaningful across a restart.
     */
    private List<GeoPoint> drivingRoute(Shipment shipment) {
        if (shipment == null || shipment.getRoute() == null || shipment.getRoute().size() < 2) {
            return List.of();
        }
        List<GeoPoint> route = new ArrayList<>(shipment.getRoute());

        FulfilmentCentre fc = shipment.getFulfilmentCentre();
        if (fc == null || fc.getDockLocation() == null) {
            return route;
        }
        // JTS is unwrapped here and goes no further. Geometry never reaches a
        // DTO in this codebase, and a simulation is no reason to be the first.
        GeoPoint dock = new GeoPoint(Geo.lat(fc.getDockLocation()), Geo.lon(fc.getDockLocation()));

        // A site whose bay and centroid coincide would otherwise get a
        // zero-length final leg, and the interpolation divides by it.
        if (GeoUtil.haversine(route.get(route.size() - 1), dock) * 1000 < 10) {
            return route;
        }
        route.add(dock);
        return route;
    }

    /** Initial bearing from a to b, in degrees. Zero when they coincide. */
    private static double bearing(GeoPoint a, GeoPoint b) {
        if (a == null || b == null) {
            return 0;
        }
        double lat1 = Math.toRadians(a.getLat());
        double lat2 = Math.toRadians(b.getLat());
        double dLon = Math.toRadians(b.getLng() - a.getLng());
        double y = Math.sin(dLon) * Math.cos(lat2);
        double x = Math.cos(lat1) * Math.sin(lat2)
                - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
    }

    /**
     * A requested value, or the default, held inside the ceiling.
     *
     * <p>Clamped rather than rejected. These are knobs on a demo: the useful
     * answer to "drive it at 400 km/h" is a fast lorry, not a validation error
     * in the middle of a presentation.
     */
    private static double clamp(Double requested, double fallback, double max) {
        if (requested == null || requested <= 0) {
            return fallback;
        }
        return Math.min(requested, max);
    }

    private static double round6(double v) {
        return Math.round(v * 1_000_000d) / 1_000_000d;
    }

    private static double round1(double v) {
        return Math.round(v * 10d) / 10d;
    }

    SimulationView toView(TripSimulation sim) {
        Long remaining = null;
        if (sim.isRunning() && sim.getSpeedKmph() > 0 && sim.getTimeScale() > 0) {
            double remainingKm = Math.max(0, sim.getRouteKm() - sim.getTravelledKm());
            double simulatedSeconds = remainingKm / sim.getSpeedKmph() * 3600.0;
            remaining = Math.round(simulatedSeconds / sim.getTimeScale());
        }
        return new SimulationView(
                sim.getTripId(),
                sim.getStatus(),
                PositionSource.SIMULATED,
                round6(sim.progress()),
                round1(sim.getTravelledKm()),
                round1(sim.getRouteKm()),
                sim.getSpeedKmph(),
                sim.getTimeScale(),
                sim.getStartedAt().toEpochMilli(),
                sim.getEndedAt() == null ? null : sim.getEndedAt().toEpochMilli(),
                remaining);
    }
}
