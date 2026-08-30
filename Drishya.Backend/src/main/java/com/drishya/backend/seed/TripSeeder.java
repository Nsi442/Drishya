package com.drishya.backend.seed;

import com.drishya.backend.domain.Geo;
import com.drishya.backend.domain.Lane;
import com.drishya.backend.domain.LaneSegment;
import com.drishya.backend.domain.Position;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.TripEvent;
import com.drishya.backend.domain.enums.PositionSource;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.domain.enums.TripEventType;
import com.drishya.backend.domain.enums.TripStatus;
import com.drishya.backend.repo.LaneRepository;
import com.drishya.backend.repo.PositionRepository;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.TripRepository;
import com.drishya.backend.service.eta.EtaFeatures;
import com.drishya.backend.service.eta.FeatureBuilder;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.locationtech.jts.geom.Coordinate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Puts a few vehicles on the road, mid-journey, with recent position traces.
 *
 * <p><b>Why the seed needs this.</b> Trips only exist once something dispatches
 * one, so a freshly seeded database had none — and the live map, which is the
 * page the whole product is about, opened empty with "no active trip is
 * reporting a position". Technically correct and a poor first impression: the
 * one screen that demonstrates the idea required a separate terminal and a
 * Python script before it showed anything.
 *
 * <p>The traces end <b>minutes ago, not hours</b>. That matters more than it
 * looks: the ETA engine refuses to predict from a fix older than two hours and
 * the stale-trip sweep abandons anything silent for a day, so a trace seeded
 * with historical timestamps would be swept away within minutes of boot and the
 * map would go blank again. Seeding relative to now is what makes these behave
 * like vehicles genuinely on the road.
 *
 * <p>Every fix is {@link PositionSource#SIMULATED}, like everything else this
 * project generates. The evidence pack counts them separately and says so.
 */
@Component
public class TripSeeder {

    private static final Logger log = LoggerFactory.getLogger(TripSeeder.class);

    /** Vehicles to put out. Enough to look alive, few enough to read. */
    private static final int TRIPS = 5;

    /** The account the login screen signs into, so its map is not near-empty. */
    private static final String DEMO_TENANT = "vendor-1";

    /** One fix a minute for the last stretch of the journey. */
    private static final int FIXES_PER_TRIP = 25;
    private static final Duration FIX_INTERVAL = Duration.ofMinutes(1);

    private final ShipmentRepository shipments;
    private final TripRepository trips;
    private final PositionRepository positions;
    private final LaneRepository lanes;
    private final FeatureBuilder featureBuilder;

    public TripSeeder(ShipmentRepository shipments, TripRepository trips,
                      PositionRepository positions, LaneRepository lanes,
                      FeatureBuilder featureBuilder) {
        this.featureBuilder = featureBuilder;
        this.shipments = shipments;
        this.trips = trips;
        this.positions = positions;
        this.lanes = lanes;
    }

    public void seed() {
        if (trips.count() > 0) {
            log.info("Trips already present, leaving them alone");
            return;
        }

        List<Lane> laneList = lanes.findAll();
        if (laneList.isEmpty()) {
            log.warn("No lanes seeded; skipping trips");
            return;
        }

        Rng rng = new Rng(20260826L);

        // Gather every dispatchable consignment across ALL lanes first, then
        // pick globally with the demo tenant in front.
        //
        // An earlier version walked lane by lane and stopped at the cap, so the
        // third lane never got a turn and the demo tenant — whose only
        // trackable consignment was on it — still saw one vehicle. Selecting
        // per-lane and capping globally is how a "prefer this tenant" rule
        // quietly becomes "prefer whoever is on the first lane".
        record Candidate(Shipment shipment, Lane lane, List<double[]> path) {}
        List<Candidate> candidates = new ArrayList<>();

        for (Lane lane : laneList) {
            List<double[]> path = pathOf(lane);
            if (path.size() < 2) {
                continue;
            }
            shipments.findByFulfilmentCentreId(lane.getFulfilmentCentre().getId()).stream()
                    // Already moving, or booked and ready to go. DOCS_PENDING is
                    // deliberately excluded: dispatching a consignment whose
                    // paperwork has not cleared would contradict the rule the
                    // whole product is built around.
                    .filter(s -> s.getStatus() == ShipmentStatus.IN_TRANSIT
                            || s.getStatus() == ShipmentStatus.CREATED)
                    .filter(s -> trips.findByShipmentIdAndTenantId(
                            s.getId(), s.getVendor().getId()).isEmpty())
                    .forEach(s -> candidates.add(new Candidate(s, lane, path)));
        }

        List<Candidate> chosen = candidates.stream()
                .sorted(java.util.Comparator.comparing(
                        (Candidate c) -> DEMO_TENANT.equals(c.shipment().getVendor().getId()) ? 0 : 1))
                .limit(TRIPS)
                .toList();

        int made = 0;
        for (Candidate c : chosen) {
            // Spread them along their corridor, so the map shows lanes in use
            // rather than a cluster at one point — and so the risk states
            // differ. A vehicle near the end is comfortably on time; one still
            // halfway is the interesting case the product exists to flag.
            double progress = 0.30 + (made % 4) * 0.18 + rng.next() * 0.08;
            createTrip(c.shipment(), c.lane(), c.path(), progress, rng, made);
            made++;
        }

        log.info("Trip seed complete: {} vehicles on the road with live traces", made);
    }

    private void createTrip(Shipment shipment, Lane lane, List<double[]> path,
                            double progress, Rng rng, int seq) {
        Instant now = Instant.now();
        Instant lastFix = now.minus(Duration.ofSeconds(rng.nextInt(30, 200)));

        Trip trip = new Trip();
        trip.setId("trip-seed-" + shipment.getId().toLowerCase());
        trip.setShipment(shipment);
        trip.setTenant(shipment.getVendor());
        trip.setLane(lane);
        trip.setVehicleRegistration(shipment.getVehicle() != null
                ? shipment.getVehicle().getRegNumber() : "MH-12-SEED-" + rng.nextInt(1000, 9999));
        trip.setDriver(shipment.getDriver());
        trip.setStatus(TripStatus.ACTIVE);
        // Departure implied by how far along it is, so elapsed time is coherent
        // with the distance covered.
        trip.setStartedAt(lastFix.minus(Duration.ofMinutes((long) (progress * 240))));
        trip.setLastZone("OUTSIDE");

        // Re-book the slot around when this vehicle will genuinely arrive.
        //
        // The seeded slot was set when the consignment was created, with no
        // knowledge of which corridor it would run. Put a vehicle 40% of the way
        // down an 840 km lane against a slot chosen for a short hop and it
        // reports itself eighteen hours EARLY — the same class of absurdity as
        // the eighty-five hours late, just in the other direction, and just as
        // corrosive to trusting the screen.
        //
        // The offset is varied on purpose so the board shows a mix: one
        // comfortably on time, one at risk, one genuinely late. A demo where
        // everything is fine demonstrates nothing.
        // Placeholder; the real figure comes from the engine below, once the
        // trace it needs exists.
        double minutesOut = 60;
        // A vehicle with a trip and a live trace is, by definition, on the road.
        if (shipment.getStatus() == ShipmentStatus.CREATED) {
            shipment.setStatus(ShipmentStatus.IN_TRANSIT);
        }
        shipments.save(shipment);
        trip.addEvent(new TripEvent(TripEventType.DEPARTED, trip.getStartedAt(), "Departed origin")
                .with("vehicleRegistration", trip.getVehicleRegistration())
                .with("laneCode", lane.getCode())
                .with("seeded", true));
        Trip saved = trips.save(trip);

        // A trailing stretch of fixes ending a minute or two ago, so the vehicle
        // is inside the freshness window and the ETA engine will answer for it.
        List<Position> trace = new ArrayList<>();
        for (int i = FIXES_PER_TRIP - 1; i >= 0; i--) {
            double at = Math.max(0, progress - i * 0.004);
            double[] point = interpolate(path, at);
            Instant deviceTime = lastFix.minus(FIX_INTERVAL.multipliedBy(i));

            Position p = new Position();
            p.setTrip(saved);
            p.setLocation(Geo.point(point[0], point[1]));
            p.setSpeedKmph(38 + rng.next() * 26);
            p.setHeadingDeg(rng.next() * 360);
            p.setDeviceTimestamp(deviceTime);
            p.setReceivedAt(deviceTime.plusSeconds(rng.nextInt(1, 5)));
            p.setSource(PositionSource.SIMULATED);
            trace.add(p);
        }
        positions.saveAll(trace);

        bookSlotAroundEngineEstimate(shipment, saved, seq);
    }

    /**
     * Books the slot around what the ETA engine itself predicts.
     *
     * <p><b>Asked, not guessed.</b> Two earlier attempts estimated the arrival
     * here — first at a flat 52 km/h, then segment by segment at default speeds
     * — and both disagreed with the engine, which costs each stretch at the
     * hour-bucketed speed history and so swings up to a third either way across
     * peak and night. On the 840 km southern lane that discrepancy reached
     * nearly nine hours and appeared on screen as "8 h 45 m late" against a slot
     * this very class had chosen. Demo data that argues with the engine reads
     * as a broken engine.
     *
     * <p>Calling FeatureBuilder is also the rule this codebase already holds
     * elsewhere: there is one implementation of the arithmetic, and everything
     * that needs the number asks it rather than reimplementing it.
     */
    private void bookSlotAroundEngineEstimate(Shipment shipment, Trip trip, int seq) {
        double minutes = featureBuilder.build(trip, Instant.now())
                .map(EtaFeatures::heuristicMinutes)
                .orElse(120d);
        Instant arrival = Instant.now().plus(Duration.ofMinutes((long) minutes));

        // Varied on purpose so the board shows a mix: one comfortably on time,
        // one tight, one genuinely late. A demo where everything is fine
        // demonstrates nothing.
        long offset = switch (seq % 3) {
            case 0 -> -75;   // will miss it: the case the product exists for
            case 1 -> -15;   // tight — midpoint inside, band spilling past
            default -> 60;   // comfortable
        };
        Instant slotStart = arrival.plus(Duration.ofMinutes(offset));
        shipment.setSlotStart(slotStart);
        shipment.setSlotEnd(slotStart.plus(Duration.ofHours(1)));
        shipment.setPromisedAt(slotStart.plus(Duration.ofMinutes(30)));
        shipments.save(shipment);
    }

    /** The lane's full polyline, in order, as lat/lon pairs. */
    private List<double[]> pathOf(Lane lane) {
        List<double[]> points = new ArrayList<>();
        List<LaneSegment> segments = lane.getSegments().stream()
                .sorted(java.util.Comparator.comparingInt(LaneSegment::getSeq))
                .toList();

        for (LaneSegment segment : segments) {
            if (segment.getGeometry() == null) {
                continue;
            }
            for (Coordinate c : segment.getGeometry().getCoordinates()) {
                // JTS is (x=lon, y=lat). Getting this the wrong way round puts
                // the vehicle in the Indian Ocean — see Geo.
                double[] pair = {c.y, c.x};
                if (points.isEmpty() || points.getLast()[0] != pair[0]
                        || points.getLast()[1] != pair[1]) {
                    points.add(pair);
                }
            }
        }
        return points;
    }

    /** A point a given fraction along the polyline, by segment count. */
    private double[] interpolate(List<double[]> path, double fraction) {
        double clamped = Math.max(0, Math.min(1, fraction));
        double scaled = clamped * (path.size() - 1);
        int index = (int) Math.floor(scaled);
        if (index >= path.size() - 1) {
            return path.getLast();
        }
        double t = scaled - index;
        double[] a = path.get(index);
        double[] b = path.get(index + 1);
        return new double[]{a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t};
    }
}
