package com.drishya.backend.seed;

import com.drishya.backend.domain.Driver;
import com.drishya.backend.domain.FulfilmentCentre;
import com.drishya.backend.domain.GeoPoint;
import com.drishya.backend.domain.GoodsReceipt;
import com.drishya.backend.domain.Place;
import com.drishya.backend.domain.ProofOfDelivery;
import com.drishya.backend.domain.SensorReading;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.ShipmentDocument;
import com.drishya.backend.domain.ShipmentEvent;
import com.drishya.backend.domain.Vehicle;
import com.drishya.backend.domain.Vendor;
import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.DocumentType;
import com.drishya.backend.domain.enums.GrnDecision;
import com.drishya.backend.domain.enums.Priority;
import com.drishya.backend.domain.enums.SensorKind;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.repo.ShipmentRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Builds the sixty shipments everything else hangs off, then hands them to the
 * derived seeders for alerts, appointments and exceptions.
 *
 * <p>The status mix is tuned rather than random: the arrival board needs
 * arrivals, the analytics pages need a fortnight of completed history, and the
 * receiving queue needs something sitting at a dock. A uniform distribution
 * leaves half the product looking empty.
 */
@Component
public class ShipmentSeeder {

    private static final long SEED = 20260815L;

    /** status -> how many. Sums to 60. */
    private static final Map<ShipmentStatus, Integer> STATUS_MIX = new EnumMap<>(Map.of(
            ShipmentStatus.DELIVERED, 22,
            ShipmentStatus.IN_TRANSIT, 14,
            ShipmentStatus.BOOKED, 10,
            ShipmentStatus.PICKED_UP, 5,
            ShipmentStatus.AT_GATE, 4,
            ShipmentStatus.UNLOADING, 3,
            ShipmentStatus.CANCELLED, 2));

    private static final List<ShipmentStatus> FLOW = List.of(
            ShipmentStatus.BOOKED, ShipmentStatus.PICKED_UP, ShipmentStatus.IN_TRANSIT,
            ShipmentStatus.AT_GATE, ShipmentStatus.UNLOADING, ShipmentStatus.DELIVERED);

    private static final Map<ShipmentStatus, String> EVENT_LABEL = Map.of(
            ShipmentStatus.BOOKED, "Shipment booked",
            ShipmentStatus.PICKED_UP, "Picked up from vendor warehouse",
            ShipmentStatus.IN_TRANSIT, "In transit",
            ShipmentStatus.AT_GATE, "Arrived at fulfilment centre gate",
            ShipmentStatus.UNLOADING, "Unloading at dock",
            ShipmentStatus.DELIVERED, "Delivered and received");

    private static final Map<ShipmentStatus, String> EVENT_DETAIL = Map.of(
            ShipmentStatus.BOOKED, "Consignment created and carrier assigned",
            ShipmentStatus.PICKED_UP, "Seal applied, loading confirmed by driver",
            ShipmentStatus.IN_TRANSIT, "Vehicle departed origin, tracking active",
            ShipmentStatus.AT_GATE, "Gate-in recorded, awaiting dock assignment",
            ShipmentStatus.UNLOADING, "Docked, quantity check in progress",
            ShipmentStatus.DELIVERED, "Goods receipt note raised");

    private final ShipmentRepository shipments;
    private final DerivedSeeder derivedSeeder;

    public ShipmentSeeder(ShipmentRepository shipments, DerivedSeeder derivedSeeder) {
        this.shipments = shipments;
        this.derivedSeeder = derivedSeeder;
    }

    public void seed(List<Vendor> vendors, List<FulfilmentCentre> sites,
                     List<Vehicle> vehicles, List<Driver> drivers) {
        Rng rng = new Rng(SEED);
        Instant now = Instant.now();

        List<ShipmentStatus> queue = new ArrayList<>();
        STATUS_MIX.forEach((status, count) -> {
            for (int i = 0; i < count; i++) {
                queue.add(status);
            }
        });

        List<Shipment> saved = new ArrayList<>();
        for (int i = 0; i < queue.size(); i++) {
            saved.add(shipments.save(build(queue.get(i), i, rng, now, vendors, sites, vehicles, drivers)));
        }

        derivedSeeder.seed(saved, now);
    }

    private Shipment build(ShipmentStatus status, int index, Rng rng, Instant now,
                           List<Vendor> vendors, List<FulfilmentCentre> sites,
                           List<Vehicle> vehicles, List<Driver> drivers) {
        Vendor vendor = vendors.get(index % vendors.size());
        FulfilmentCentre fc = sites.get(rng.nextInt(0, sites.size() - 1));
        Vehicle vehicle = vehicles.get(index % vehicles.size());
        Driver driver = drivers.get(index % drivers.size());

        String id = "SHP-" + (24001 + index);

        GeoPoint originPoint = new GeoPoint(vendor.getLocation().getLat(), vendor.getLocation().getLng());
        GeoPoint destPoint = new GeoPoint(fc.getLocation().getLat(), fc.getLocation().getLng());
        List<GeoPoint> route = GeoUtil.buildRoute(originPoint, destPoint, rng);
        int distanceKm = (int) Math.round(GeoUtil.routeLength(route));

        // A believable average once stops and traffic are folded in.
        double avgSpeedKmph = 38 + rng.next() * 14;
        long transitMinutes = Math.round((distanceKm / avgSpeedKmph) * 60);

        boolean finished = status == ShipmentStatus.DELIVERED || status == ShipmentStatus.CANCELLED;
        int delayMin = rollDelay(rng);

        Instant promisedAt = finished
                ? now.minus(rng.nextInt(1, 13), ChronoUnit.DAYS).minus(rng.nextInt(0, 20), ChronoUnit.HOURS)
                : now.plus(rng.nextInt(-3, 46), ChronoUnit.HOURS);

        Instant pickupAt = promisedAt.minus(transitMinutes, ChronoUnit.MINUTES);
        Instant bookedAt = pickupAt.minus(rng.nextInt(6, 40), ChronoUnit.HOURS);
        Instant predictedAt = promisedAt.plus(delayMin, ChronoUnit.MINUTES);

        Map<ShipmentStatus, Instant> timeline = new EnumMap<>(ShipmentStatus.class);
        timeline.put(ShipmentStatus.BOOKED, bookedAt);
        timeline.put(ShipmentStatus.PICKED_UP, pickupAt);
        timeline.put(ShipmentStatus.IN_TRANSIT, pickupAt.plus(rng.nextInt(20, 70), ChronoUnit.MINUTES));
        timeline.put(ShipmentStatus.AT_GATE, predictedAt.minus(rng.nextInt(20, 60), ChronoUnit.MINUTES));
        timeline.put(ShipmentStatus.UNLOADING, predictedAt.minus(rng.nextInt(5, 20), ChronoUnit.MINUTES));
        timeline.put(ShipmentStatus.DELIVERED, predictedAt);

        double progress = progressFor(status, rng);
        int cartons = rng.nextInt(24, 460);

        Shipment s = new Shipment();
        s.setId(id);
        s.setReference("PO-" + rng.nextInt(700000, 799999));
        s.setVendor(vendor);
        s.setFulfilmentCentre(fc);
        s.setVehicle(vehicle);
        s.setDriver(driver);
        s.setStatus(status);
        s.setPriority(rng.chance(0.18) ? Priority.HIGH : Priority.NORMAL);
        s.setOrigin(new Place(originPoint.getLat(), originPoint.getLng(),
                vendor.getName() + " — " + vendor.getCity()));
        s.setDestination(new Place(destPoint.getLat(), destPoint.getLng(), fc.getName()));
        s.setRoute(route);
        s.setProgress(progress);
        s.setDistanceKm(distanceKm);
        s.setRemainingKm((int) Math.max(0, Math.round(distanceKm * (1 - progress))));
        s.setSpeedKmph(status == ShipmentStatus.IN_TRANSIT ? (int) Math.round(34 + rng.next() * 32) : 0);
        s.setPosition(GeoUtil.positionAlongRoute(route, progress));
        s.setBookedAt(bookedAt);
        s.setPickupAt(pickupAt);
        s.setPromisedAt(promisedAt);
        s.setPredictedAt(predictedAt);
        s.setDeliveredAt(status == ShipmentStatus.DELIVERED ? timeline.get(ShipmentStatus.DELIVERED) : null);
        s.setDelayMin(delayMin);
        s.setDelayReason(delayMin > 15 ? rng.pick(ReferenceData.DELAY_REASONS) : null);
        s.setCommodity(rng.pick(ReferenceData.COMMODITIES));
        s.setCartons(cartons);
        s.setWeightKg(cartons * rng.nextInt(6, 22));
        s.setValueInr((long) cartons * rng.nextInt(800, 4200));
        s.setSealNumber("SL-" + rng.nextInt(100000, 999999));
        s.setInvoiceNo("INV/26-27/" + (4200 + index));
        s.setEwayBillNo("" + rng.nextInt(100, 999) + rng.nextInt(100000000, 999999999));
        s.setTemperatureControlled(false);
        s.setUpdatedAt(now);
        s.setCancelledReason(status == ShipmentStatus.CANCELLED
                ? "Vendor withdrew — stock unavailable at origin" : null);

        // Gate times only exist once the vehicle actually reached the site.
        boolean atOrPastGate = status == ShipmentStatus.AT_GATE
                || status == ShipmentStatus.UNLOADING
                || status == ShipmentStatus.DELIVERED;
        s.setGateInAt(atOrPastGate ? timeline.get(ShipmentStatus.AT_GATE) : null);
        s.setGateOutAt(status == ShipmentStatus.DELIVERED
                ? timeline.get(ShipmentStatus.DELIVERED).plus(rng.nextInt(10, 45), ChronoUnit.MINUTES) : null);
        s.setDockId(atOrPastGate ? fc.getId() + "-dock-" + rng.nextInt(1, fc.getDockCount()) : null);

        Instant slotStart = promisedAt.truncatedTo(ChronoUnit.HOURS);
        s.setSlotStart(slotStart);
        s.setSlotEnd(slotStart.plus(1, ChronoUnit.HOURS));

        if (status == ShipmentStatus.DELIVERED) {
            s.setRemainingKm(0);
            s.setPosition(destPoint);
            s.setPod(buildPod(rng, cartons, timeline.get(ShipmentStatus.DELIVERED)));
            s.setGrn(buildGrn(rng, cartons, s.getPod(), timeline.get(ShipmentStatus.DELIVERED)));
        }

        addEvents(s, status, timeline);
        addDocuments(s, rng, status);
        addSensors(s, rng, pickupAt, finished ? timeline.get(ShipmentStatus.DELIVERED) : now);

        return s;
    }

    /** Just over half arrive on time; the tail is what the product is for. */
    private int rollDelay(Rng rng) {
        double r = rng.next();
        if (r < 0.55) {
            return rng.nextInt(-25, 10);
        }
        if (r < 0.85) {
            return rng.nextInt(15, 75);
        }
        return rng.nextInt(80, 240);
    }

    private double progressFor(ShipmentStatus status, Rng rng) {
        return switch (status) {
            case BOOKED -> 0;
            case PICKED_UP -> 0.02 + rng.next() * 0.06;
            case IN_TRANSIT -> 0.15 + rng.next() * 0.7;
            case AT_GATE -> 0.97;
            case UNLOADING -> 0.99;
            case DELIVERED -> 1;
            case CANCELLED -> rng.next() * 0.4;
        };
    }

    private void addEvents(Shipment s, ShipmentStatus status, Map<ShipmentStatus, Instant> timeline) {
        ShipmentStatus reached = status == ShipmentStatus.CANCELLED ? ShipmentStatus.BOOKED : status;
        int last = FLOW.indexOf(reached);
        for (int i = 0; i <= last; i++) {
            ShipmentStatus stage = FLOW.get(i);
            s.addEvent(new ShipmentEvent(stage, EVENT_LABEL.get(stage), EVENT_DETAIL.get(stage),
                    timeline.get(stage)));
        }
    }

    /**
     * Delivered consignments have cleared their paperwork almost by definition,
     * so the interesting failures are loaded onto the ones still moving.
     */
    private void addDocuments(Shipment s, Rng rng, ShipmentStatus status) {
        boolean settled = status == ShipmentStatus.DELIVERED;
        DocumentType[] types = DocumentType.values();

        for (int i = 0; i < types.length; i++) {
            DocumentType type = types[i];
            DocumentStatus docStatus = rollDocumentStatus(rng, settled);

            String number = switch (type) {
                case EWAY -> s.getEwayBillNo();
                case INVOICE -> s.getInvoiceNo();
                case GST -> "GSTR-" + rng.nextInt(10000, 99999);
                case LR -> "LR-" + rng.nextInt(100000, 999999);
                case ASN -> "ASN-" + rng.nextInt(10000, 99999);
            };

            ShipmentDocument doc = new ShipmentDocument(
                    s.getId() + "-DOC-" + (i + 1), type,
                    docStatus == DocumentStatus.MISSING ? null : number, docStatus);
            doc.setUploadedAt(docStatus == DocumentStatus.MISSING
                    ? null : Instant.now().minus(rng.nextInt(1, 96), ChronoUnit.HOURS));
            doc.setExpiresAt(type == DocumentType.EWAY
                    ? Instant.now().plus(docStatus == DocumentStatus.EXPIRING ? 6 : 72, ChronoUnit.HOURS)
                    : null);
            doc.setSizeKb(rng.nextInt(80, 940));
            doc.setPages(rng.nextInt(1, 4));
            doc.setNote(switch (docStatus) {
                case MISMATCH -> "Consignee GSTIN does not match the fulfilment centre on record";
                case EXPIRING -> "Validity ends before the scheduled dock slot";
                default -> null;
            });
            s.addDocument(doc);
        }
    }

    private DocumentStatus rollDocumentStatus(Rng rng, boolean settled) {
        if (settled) {
            return rng.chance(0.94) ? DocumentStatus.VALID : DocumentStatus.MISMATCH;
        }
        double r = rng.next();
        if (r < 0.68) {
            return DocumentStatus.VALID;
        }
        if (r < 0.79) {
            return DocumentStatus.EXPIRING;
        }
        if (r < 0.88) {
            return DocumentStatus.PENDING;
        }
        if (r < 0.95) {
            return DocumentStatus.MISMATCH;
        }
        return DocumentStatus.MISSING;
    }

    /**
     * Temperature here is ambient — cold chain is out of scope — but a dry van
     * still tells you something: a door left open shows up as a spike.
     */
    private void addSensors(Shipment s, Rng rng, Instant from, Instant to) {
        long spanMinutes = Math.max(ChronoUnit.MINUTES.between(from, to), 30);
        int points = 24;
        double base = 26 + rng.next() * 6;

        for (int i = 0; i < points; i++) {
            Instant t = from.plus(spanMinutes * i / (points - 1), ChronoUnit.MINUTES);
            double drift = Math.sin((i / (double) points) * Math.PI * 2) * 2.4;

            s.addSensorReading(new SensorReading(SensorKind.TEMPERATURE, t,
                    round1(base + drift + (rng.next() - 0.5) * 1.6)));
            s.addSensorReading(new SensorReading(SensorKind.HUMIDITY, t,
                    Math.round(48 + Math.cos(i / 3.0) * 8 + (rng.next() - 0.5) * 5)));
            // Most samples are road noise; a few are jolts worth flagging.
            double g = rng.chance(0.12) ? 1.4 + rng.next() * 1.6 : 0.2 + rng.next() * 0.5;
            s.addSensorReading(new SensorReading(SensorKind.SHOCK, t, round2(g)));
        }

        int doorEvents = rng.nextInt(0, 3);
        for (int i = 0; i < doorEvents; i++) {
            Instant at = from.plus((long) (spanMinutes * (0.15 + rng.next() * 0.7)), ChronoUnit.MINUTES);
            SensorReading door = new SensorReading(SensorKind.DOOR, at, 1);
            door.setDurationMin(rng.nextInt(2, 14));
            door.setScheduled(rng.next() > 0.35);
            s.addSensorReading(door);
        }
    }

    private ProofOfDelivery buildPod(Rng rng, int cartons, Instant deliveredAt) {
        ProofOfDelivery pod = new ProofOfDelivery();
        pod.setReceiverName(rng.pick(ReferenceData.RECEIVER_NAMES));
        pod.setReceivedAt(deliveredAt);
        pod.setSignatureAt(deliveredAt);
        pod.setPhotos(rng.nextInt(1, 3));
        pod.setCartonsReceived(rng.chance(0.88) ? cartons : cartons - rng.nextInt(1, 8));
        pod.setDamageNote(rng.chance(0.12)
                ? "Two cartons with corner crush, photographed at dock" : null);
        return pod;
    }

    private GoodsReceipt buildGrn(Rng rng, int cartons, ProofOfDelivery pod, Instant deliveredAt) {
        GrnDecision decision;
        if (rng.chance(0.82)) {
            decision = GrnDecision.ACCEPTED;
        } else {
            decision = rng.chance(0.6) ? GrnDecision.PARTIAL : GrnDecision.REJECTED;
        }
        GoodsReceipt grn = new GoodsReceipt();
        grn.setDecision(decision);
        grn.setExpectedCartons(cartons);
        grn.setReceivedCartons(pod.getCartonsReceived());
        grn.setDamagedCartons(pod.getDamageNote() == null ? 0 : 2);
        grn.setDocumentsVerified("invoice,eway");
        grn.setCheckedAt(deliveredAt.plus(20, ChronoUnit.MINUTES));
        grn.setCheckedBy("FC receiving desk");
        return grn;
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }

    private static double round2(double v) {
        return Math.round(v * 100) / 100.0;
    }
}
