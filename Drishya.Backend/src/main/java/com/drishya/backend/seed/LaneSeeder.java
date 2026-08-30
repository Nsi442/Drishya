package com.drishya.backend.seed;

import com.drishya.backend.domain.DockTurnaroundHistory;
import com.drishya.backend.domain.FulfilmentCentre;
import com.drishya.backend.domain.Geo;
import com.drishya.backend.domain.Lane;
import com.drishya.backend.domain.LaneSegment;
import com.drishya.backend.domain.SegmentSpeedHistory;
import com.drishya.backend.domain.enums.DayType;
import com.drishya.backend.repo.DockTurnaroundHistoryRepository;
import com.drishya.backend.repo.FulfilmentCentreRepository;
import com.drishya.backend.repo.LaneRepository;
import com.drishya.backend.repo.SegmentSpeedHistoryRepository;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Seeds the two lanes, their segments, and the shared history hanging off them.
 *
 * <p><b>The seeded history is synthetic and says so.</b> Sample counts are set
 * to plausible-but-modest numbers and the means are drawn from typical Indian
 * highway and urban-approach speeds. It exists so the ETA engine has something
 * to divide by on a fresh database — not so anyone can claim measured accuracy.
 * Any accuracy figure produced before real trips have run is a figure about
 * this file, and the README says that too.
 */
@Component
public class LaneSeeder {

    private static final Logger log = LoggerFactory.getLogger(LaneSeeder.class);

    private final LaneRepository lanes;
    private final FulfilmentCentreRepository centres;
    private final SegmentSpeedHistoryRepository segmentSpeeds;
    private final DockTurnaroundHistoryRepository dockHistory;

    public LaneSeeder(LaneRepository lanes, FulfilmentCentreRepository centres,
                      SegmentSpeedHistoryRepository segmentSpeeds,
                      DockTurnaroundHistoryRepository dockHistory) {
        this.lanes = lanes;
        this.centres = centres;
        this.segmentSpeeds = segmentSpeeds;
        this.dockHistory = dockHistory;
    }

    /**
     * A stretch of road with a character of its own.
     *
     * @param defaultSpeedKmph what to assume before the cluster has taught the
     *     platform anything about this segment. A ghat section and an
     *     expressway cannot share a default and still produce a usable first
     *     prediction.
     */
    private record Leg(String name, double defaultSpeedKmph, List<double[]> points) {
    }

    public void seed() {
        if (lanes.count() > 0) {
            log.info("Lanes already present, leaving them alone");
            return;
        }

        FulfilmentCentre bhiwandi = centres.findById("fc-bhiwandi").orElse(null);
        FulfilmentCentre manesar = centres.findById("fc-manesar").orElse(null);
        if (bhiwandi == null || manesar == null) {
            log.warn("Fulfilment centres missing; skipping lane seed");
            return;
        }

        // Pune to Bhiwandi on NH-48: open highway, then the Khandala ghat,
        // then expressway, then the Bhiwandi warehouse belt, which crawls.
        Lane pune = buildLane("lane-pun-fcb", "PUN-FCB", "Pune", bhiwandi,
                18.5204, 73.8567, List.of(
                        new Leg("Pune to Lonavala", 62, List.of(
                                new double[]{18.5204, 73.8567},
                                new double[]{18.7350, 73.6750},
                                new double[]{18.7546, 73.4062})),
                        new Leg("Khandala ghat", 38, List.of(
                                new double[]{18.7546, 73.4062},
                                new double[]{18.7860, 73.3430})),
                        new Leg("Khopoli to Panvel", 71, List.of(
                                new double[]{18.7860, 73.3430},
                                new double[]{19.0330, 73.1120})),
                        new Leg("Bhiwandi approach", 24, List.of(
                                new double[]{19.0330, 73.1120},
                                new double[]{19.2000, 73.0800},
                                new double[]{19.2958, 73.0648}))));

        // Jaipur to Manesar on NH-48: fast most of the way, slow at the end.
        Lane jaipur = buildLane("lane-jai-fcm", "JAI-FCM", "Jaipur", manesar,
                26.9124, 75.7873, List.of(
                        new Leg("Jaipur to Shahpura", 68, List.of(
                                new double[]{26.9124, 75.7873},
                                new double[]{27.1200, 75.8500},
                                new double[]{27.3900, 75.9600})),
                        new Leg("Shahpura to Behror", 74, List.of(
                                new double[]{27.3900, 75.9600},
                                new double[]{27.8900, 76.2800})),
                        new Leg("Behror to Dharuhera", 66, List.of(
                                new double[]{27.8900, 76.2800},
                                new double[]{28.2000, 76.7900})),
                        new Leg("Manesar approach", 28, List.of(
                                new double[]{28.2000, 76.7900},
                                new double[]{28.3524, 76.9361}))));

        // Pune to Bengaluru on NH-48: the long southern run. Added because two
        // of the four sites had no lane at all, so every consignment into them
        // was unmatched and could never be given an ETA — the engine degraded
        // to silence for half the network.
        FulfilmentCentre whitefield = centres.findById("fc-whitefield").orElse(null);
        Lane bengaluru = whitefield == null ? null : buildLane(
                "lane-pun-fcw", "PUN-FCW", "Pune", whitefield,
                18.5204, 73.8567, List.of(
                        new Leg("Pune to Kolhapur", 72, List.of(
                                new double[]{18.5204, 73.8567},
                                new double[]{17.6599, 74.0089},
                                new double[]{16.7050, 74.2433})),
                        new Leg("Kolhapur to Hubballi", 76, List.of(
                                new double[]{16.7050, 74.2433},
                                new double[]{15.8497, 74.4977},
                                new double[]{15.3647, 75.1240})),
                        new Leg("Hubballi to Tumakuru", 74, List.of(
                                new double[]{15.3647, 75.1240},
                                new double[]{14.4644, 75.9218},
                                new double[]{13.3392, 77.1140})),
                        new Leg("Bengaluru approach", 22, List.of(
                                new double[]{13.3392, 77.1140},
                                new double[]{13.0350, 77.5970},
                                new double[]{12.9689, 77.7513}))));

        seedSegmentHistory(pune);
        seedSegmentHistory(jaipur);
        if (bengaluru != null) {
            seedSegmentHistory(bengaluru);
        }
        seedDockHistory(centres.findAll());

        log.info("Lane seed complete: {} lanes, {} segments, {} speed rows, {} dock rows",
                lanes.count(),
                lanes.findAll().stream().mapToInt(l -> l.getSegments().size()).sum(),
                segmentSpeeds.count(), dockHistory.count());
    }

    private Lane buildLane(String id, String code, String originName, FulfilmentCentre fc,
                           double originLat, double originLon, List<Leg> legs) {
        Lane lane = new Lane();
        lane.setId(id);
        lane.setCode(code);
        lane.setOriginName(originName);
        lane.setOriginPoint(Geo.point(originLat, originLon));
        lane.setFulfilmentCentre(fc);

        double totalM = 0;
        for (int i = 0; i < legs.size(); i++) {
            Leg leg = legs.get(i);
            LaneSegment segment = new LaneSegment();
            segment.setId(id + "-seg-" + i);
            segment.setSeq(i);
            segment.setName(leg.name());
            segment.setGeometry(Geo.line(leg.points()));
            segment.setDefaultSpeedKmph(leg.defaultSpeedKmph());
            segment.setLengthM(approximateLengthM(leg.points()));
            totalM += segment.getLengthM();
            lane.addSegment(segment);
        }
        lane.setDistanceKm(totalM / 1000d);
        return lanes.save(lane);
    }

    /**
     * Great-circle length of the polyline, in metres.
     *
     * <p>The one place in this codebase where a distance is computed in Java
     * rather than PostGIS, and only because it runs before the row exists to
     * ask PostGIS about. Nothing on a request path uses it — the moment a
     * segment is stored, every distance question goes to the database.
     */
    private double approximateLengthM(List<double[]> points) {
        double metres = 0;
        for (int i = 1; i < points.size(); i++) {
            double[] a = points.get(i - 1);
            double[] b = points.get(i);
            double dLat = Math.toRadians(b[0] - a[0]);
            double dLon = Math.toRadians(b[1] - a[1]);
            double h = Math.pow(Math.sin(dLat / 2), 2)
                    + Math.cos(Math.toRadians(a[0])) * Math.cos(Math.toRadians(b[0]))
                    * Math.pow(Math.sin(dLon / 2), 2);
            metres += 2 * 6_371_000 * Math.asin(Math.sqrt(h));
        }
        return metres;
    }

    /**
     * Speed history for every hour and both day types.
     *
     * <p>Shaped rather than flat: a morning and evening peak that bites hardest
     * on the urban approach segments, and a quiet run overnight. Weekends move
     * faster. Without that shape the ETA engine would return the same answer at
     * 03:00 and 18:00, and the hour bucket would be decorative.
     */
    private void seedSegmentHistory(Lane lane) {
        Instant now = Instant.now();
        for (LaneSegment segment : lane.getSegments()) {
            boolean urban = segment.getDefaultSpeedKmph() < 40;
            for (DayType dayType : DayType.values()) {
                for (int hour = 0; hour < 24; hour++) {
                    SegmentSpeedHistory row = new SegmentSpeedHistory();
                    row.setId(segment.getId() + "-" + dayType.name() + "-" + hour);
                    row.setSegment(segment);
                    row.setHourBucket(hour);
                    row.setDayType(dayType);
                    row.setMeanSpeedKmph(
                            shapedSpeed(segment.getDefaultSpeedKmph(), hour, dayType, urban));
                    // Modest and honest. These are not five hundred real runs.
                    row.setSampleCount(dayType == DayType.WEEKDAY ? 14 : 6);
                    row.setUpdatedAt(now);
                    segmentSpeeds.save(row);
                }
            }
        }
    }

    private double shapedSpeed(double base, int hour, DayType dayType, boolean urban) {
        double factor = 1.0;
        boolean morningPeak = hour >= 8 && hour <= 11;
        boolean eveningPeak = hour >= 17 && hour <= 20;
        boolean night = hour <= 5 || hour >= 22;

        if (dayType == DayType.WEEKDAY) {
            if (morningPeak || eveningPeak) {
                factor = urban ? 0.55 : 0.80;
            } else if (night) {
                factor = urban ? 1.35 : 1.15;
            }
        } else {
            factor = night ? 1.30 : 1.10;
        }
        return Math.round(base * factor * 10) / 10d;
    }

    /**
     * Dock queue and turnaround history.
     *
     * <p>This is the half of the ETA a route planner cannot give you, so it gets
     * the same hourly shape: the yard backs up when everybody books the same
     * morning slot, and clears overnight.
     */
    private void seedDockHistory(List<FulfilmentCentre> sites) {
        Instant now = Instant.now();
        for (FulfilmentCentre fc : sites) {
            for (DayType dayType : DayType.values()) {
                for (int hour = 0; hour < 24; hour++) {
                    DockTurnaroundHistory row = new DockTurnaroundHistory();
                    row.setId(fc.getId() + "-" + dayType.name() + "-" + hour);
                    row.setFulfilmentCentre(fc);
                    row.setHourBucket(hour);
                    row.setDayType(dayType);

                    boolean peak = hour >= 9 && hour <= 12;
                    boolean busy = hour >= 13 && hour <= 18;
                    double queue = peak ? 74 : busy ? 41 : 16;
                    if (dayType == DayType.WEEKEND) {
                        queue *= 0.6;
                    }
                    // Larger sites absorb a queue better; a six-bay site does not.
                    queue *= (10.0 / Math.max(4, fc.getDockCount()));

                    row.setMeanQueueMinutes(Math.round(queue * 10) / 10d);
                    row.setMeanTurnaroundMinutes(peak ? 68 : 52);
                    row.setSampleCount(dayType == DayType.WEEKDAY ? 22 : 9);
                    row.setUpdatedAt(now);
                    dockHistory.save(row);
                }
            }
        }
    }
}
