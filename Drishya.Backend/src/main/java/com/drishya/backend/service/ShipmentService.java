package com.drishya.backend.service;

import com.drishya.backend.domain.Driver;
import com.drishya.backend.domain.FulfilmentCentre;
import com.drishya.backend.domain.GeoPoint;
import com.drishya.backend.domain.GoodsReceipt;
import com.drishya.backend.domain.Incident;
import com.drishya.backend.domain.Place;
import com.drishya.backend.domain.ProofOfDelivery;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.ShipmentDocument;
import com.drishya.backend.domain.ShipmentEvent;
import com.drishya.backend.domain.Vehicle;
import com.drishya.backend.domain.Vendor;
import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.Priority;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.dto.IncidentDto;
import com.drishya.backend.dto.PageDto;
import com.drishya.backend.dto.ShipmentDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.repo.DriverRepository;
import com.drishya.backend.repo.FulfilmentCentreRepository;
import com.drishya.backend.repo.IncidentRepository;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.VehicleRepository;
import com.drishya.backend.repo.VendorRepository;
import com.drishya.backend.seed.GeoUtil;
import com.drishya.backend.seed.Rng;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reading, creating and advancing shipments. */
@Service
public class ShipmentService {

    private final ShipmentRepository shipments;
    private final VendorRepository vendors;
    private final FulfilmentCentreRepository centres;
    private final VehicleRepository vehicles;
    private final DriverRepository drivers;
    private final IncidentRepository incidents;
    private final AlertService alertService;
    private final Mapper mapper;

    public ShipmentService(ShipmentRepository shipments, VendorRepository vendors,
                           FulfilmentCentreRepository centres, VehicleRepository vehicles,
                           DriverRepository drivers, IncidentRepository incidents,
                           AlertService alertService, Mapper mapper) {
        this.shipments = shipments;
        this.vendors = vendors;
        this.centres = centres;
        this.vehicles = vehicles;
        this.drivers = drivers;
        this.incidents = incidents;
        this.alertService = alertService;
        this.mapper = mapper;
    }

    // --- reads -----------------------------------------------------------

    /** Filters, sorts and pages in one pass. */
    @Transactional(readOnly = true)
    public PageDto<ShipmentDto> list(ShipmentFilter filter, String sortKey, String direction,
                                     int page, int pageSize) {
        List<ShipmentDto> rows = shipments.findAllBy().stream()
                .filter(filter::matches)
                .map(s -> mapper.toDto(s, false))
                .sorted(comparator(sortKey, direction))
                .toList();
        return PageDto.of(rows, page, pageSize);
    }

    /** Unpaginated — for maps, boards and the live tick. */
    @Transactional(readOnly = true)
    public List<ShipmentDto> listAll(ShipmentFilter filter) {
        return shipments.findAllBy().stream()
                .filter(filter::matches)
                .map(s -> mapper.toDto(s, false))
                .sorted(Comparator.comparing(ShipmentDto::promisedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    /** The detail view, with events, documents and telemetry attached. */
    @Transactional(readOnly = true)
    public ShipmentDto get(String id) {
        Shipment s = shipments.findWithDetailById(id)
                .orElseThrow(() -> ApiException.notFound("No shipment found with reference " + id + "."));
        // Touch the lazy collections while the session is still open.
        s.getDocuments().size();
        s.getSensorReadings().size();
        return mapper.toDto(s, true);
    }

    @Transactional(readOnly = true)
    public List<ShipmentDto> driverTrips(String driverId) {
        List<Shipment> mine = shipments.findByDriverId(driverId).stream()
                .filter(s -> s.getStatus() != ShipmentStatus.CANCELLED)
                .toList();
        List<Shipment> active = mine.stream().filter(Shipment::isActive).toList();
        // Never leave the driver with a blank screen if everything is done.
        List<Shipment> trips = active.isEmpty() ? mine : active;
        return trips.stream()
                .sorted(Comparator.comparing(Shipment::getPromisedAt))
                .map(s -> mapper.toDto(s, false))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ShipmentDto> driverHistory(String driverId) {
        return shipments.findByDriverId(driverId).stream()
                .filter(s -> s.getStatus() == ShipmentStatus.DELIVERED)
                .sorted(Comparator.comparing(Shipment::getDeliveredAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .map(s -> mapper.toDto(s, false))
                .toList();
    }

    // --- writes ----------------------------------------------------------

    @Transactional
    public ShipmentDto create(Requests.CreateShipment request) {
        Vendor vendor = vendors.findById(request.vendorId())
                .orElseThrow(() -> ApiException.badRequest("UNKNOWN_VENDOR", "That vendor does not exist."));
        FulfilmentCentre fc = centres.findById(request.fcId())
                .orElseThrow(() -> ApiException.badRequest("UNKNOWN_FC",
                        "That fulfilment centre does not exist."));
        Vehicle vehicle = vehicles.findById(request.vehicleId())
                .orElseThrow(() -> ApiException.badRequest("UNKNOWN_VEHICLE", "That vehicle does not exist."));
        Driver driver = drivers.findById(request.driverId())
                .orElseThrow(() -> ApiException.badRequest("UNKNOWN_DRIVER", "That driver does not exist."));

        if (request.weightKg() > vehicle.getCapacityKg()) {
            throw ApiException.badRequest("OVER_CAPACITY",
                    "%d kg exceeds the %d kg rating of %s. Split the load or pick a larger vehicle."
                            .formatted(request.weightKg(), vehicle.getCapacityKg(), vehicle.getRegNumber()));
        }

        Instant now = Instant.now();
        long sequence = shipments.count();
        Rng rng = new Rng(sequence + 7);

        GeoPoint originPoint = new GeoPoint(vendor.getLocation().getLat(), vendor.getLocation().getLng());
        GeoPoint destPoint = new GeoPoint(fc.getLocation().getLat(), fc.getLocation().getLng());
        List<GeoPoint> route = GeoUtil.buildRoute(originPoint, destPoint, rng);
        int distanceKm = (int) Math.round(GeoUtil.routeLength(route));

        Instant promisedAt = request.slotStart() != null
                ? Instant.ofEpochMilli(request.slotStart())
                : now.plus(36, ChronoUnit.HOURS);

        Shipment s = new Shipment();
        s.setId("SHP-" + (24001 + sequence));
        s.setReference(request.reference() == null || request.reference().isBlank()
                ? "PO-" + (700000 + sequence) : request.reference());
        s.setVendor(vendor);
        s.setFulfilmentCentre(fc);
        s.setVehicle(vehicle);
        s.setDriver(driver);
        s.setStatus(ShipmentStatus.BOOKED);
        s.setPriority(request.priority() == null ? Priority.NORMAL : request.priority());
        s.setOrigin(new Place(originPoint.getLat(), originPoint.getLng(),
                vendor.getName() + " — " + vendor.getCity()));
        s.setDestination(new Place(destPoint.getLat(), destPoint.getLng(), fc.getName()));
        s.setRoute(route);
        s.setProgress(0);
        s.setPosition(originPoint);
        s.setDistanceKm(distanceKm);
        s.setRemainingKm(distanceKm);
        s.setSpeedKmph(0);
        s.setBookedAt(now);
        s.setPickupAt(request.pickupAt() != null
                ? Instant.ofEpochMilli(request.pickupAt()) : now.plus(4, ChronoUnit.HOURS));
        s.setPromisedAt(promisedAt);
        // A brand-new booking is on time by definition — nothing has happened yet.
        s.setPredictedAt(promisedAt);
        s.setDelayMin(0);
        s.setSlotStart(promisedAt);
        s.setSlotEnd(promisedAt.plus(1, ChronoUnit.HOURS));
        s.setCommodity(request.commodity());
        s.setCartons(request.cartons());
        s.setWeightKg(request.weightKg());
        s.setValueInr(request.valueInr());
        s.setSealNumber(request.sealNumber() == null || request.sealNumber().isBlank()
                ? "SL-" + (100000 + sequence) : request.sealNumber());
        s.setInvoiceNo(request.invoiceNo() == null || request.invoiceNo().isBlank()
                ? "INV/26-27/" + (4200 + sequence) : request.invoiceNo());
        s.setEwayBillNo(request.ewayBillNo());
        s.setDockId(request.dockId());
        s.setUpdatedAt(now);

        s.addEvent(new ShipmentEvent(ShipmentStatus.BOOKED, "Shipment booked",
                "Consignment created and carrier assigned", now));

        if (request.documents() != null) {
            int index = 1;
            for (Requests.DocumentInput doc : request.documents()) {
                ShipmentDocument document = new ShipmentDocument(
                        s.getId() + "-DOC-" + index++, doc.type(), doc.number(),
                        doc.number() == null || doc.number().isBlank()
                                ? DocumentStatus.MISSING : DocumentStatus.PENDING);
                document.setUploadedAt(doc.number() == null ? null : now);
                document.setSizeKb(doc.sizeKb() == null ? 240 : doc.sizeKb());
                document.setPages(1);
                s.addDocument(document);
            }
        }

        return mapper.toDto(shipments.save(s), true);
    }

    /**
     * Moves a shipment to its next state and records the event.
     *
     * <p>Refuses to move backwards: the timeline is a record of what happened,
     * and a consignment that has been received cannot un-arrive.
     */
    @Transactional
    public ShipmentDto advance(String id, Requests.AdvanceShipment request) {
        Shipment s = load(id);
        ShipmentStatus next = request.status();

        if (s.getStatus() == ShipmentStatus.CANCELLED) {
            throw ApiException.badRequest("CANCELLED", "That shipment has been cancelled.");
        }
        if (next != ShipmentStatus.CANCELLED && next.ordinal() <= s.getStatus().ordinal()) {
            throw ApiException.badRequest("INVALID_TRANSITION",
                    "%s is already %s.".formatted(s.getId(), s.getStatus().wire().replace('_', ' ')));
        }

        Instant now = Instant.now();
        s.setStatus(next);
        s.setUpdatedAt(now);

        switch (next) {
            case AT_GATE -> {
                s.setGateInAt(now);
                s.setProgress(0.97);
                s.setSpeedKmph(0);
            }
            case UNLOADING -> s.setProgress(0.99);
            case DELIVERED -> {
                s.setDeliveredAt(now);
                s.setProgress(1);
                s.setRemainingKm(0);
                s.setSpeedKmph(0);
                s.setPosition(new GeoPoint(s.getDestination().getLat(), s.getDestination().getLng()));
            }
            default -> { /* picked_up and in_transit need no extra bookkeeping */ }
        }

        s.addEvent(new ShipmentEvent(next,
                request.label() == null ? next.wire().replace('_', ' ') : request.label(),
                request.detail(), now));

        return mapper.toDto(shipments.save(s), true);
    }

    @Transactional
    public ShipmentDto submitPod(String id, Requests.SubmitPod request) {
        Shipment s = load(id);
        Instant now = Instant.now();

        if (request.cartonsReceived() > s.getCartons()) {
            throw ApiException.badRequest("OVER_COUNT",
                    "Cannot receive more than the %d cartons that were loaded.".formatted(s.getCartons()));
        }

        ProofOfDelivery pod = new ProofOfDelivery();
        pod.setReceiverName(request.receiverName());
        pod.setReceivedAt(now);
        pod.setSignatureAt(now);
        pod.setPhotos(request.photos());
        pod.setCartonsReceived(request.cartonsReceived());
        pod.setDamageNote(request.damageNote());
        pod.setSignature(request.signature());

        s.setPod(pod);
        s.setStatus(ShipmentStatus.DELIVERED);
        s.setDeliveredAt(now);
        s.setProgress(1);
        s.setRemainingKm(0);
        s.setSpeedKmph(0);
        s.setPosition(new GeoPoint(s.getDestination().getLat(), s.getDestination().getLng()));
        s.setUpdatedAt(now);
        s.getEvents().removeIf(e -> e.getStage() == ShipmentStatus.DELIVERED);
        s.addEvent(new ShipmentEvent(ShipmentStatus.DELIVERED, "Delivered and received",
                "Signed by " + request.receiverName(), now));

        return mapper.toDto(shipments.save(s), true);
    }

    @Transactional
    public ShipmentDto saveChecklist(String id, Requests.SaveChecklist request) {
        Shipment s = load(id);
        if (request.sealNumber() != null && !request.sealNumber().isBlank()) {
            s.setSealNumber(request.sealNumber());
        }
        s.setUpdatedAt(Instant.now());
        return mapper.toDto(shipments.save(s), true);
    }

    @Transactional
    public ShipmentDto assignDock(String id, String dockId) {
        Shipment s = load(id);
        s.setDockId(dockId);
        s.setUpdatedAt(Instant.now());
        return mapper.toDto(shipments.save(s), true);
    }

    @Transactional
    public ShipmentDto cancel(String id, String reason) {
        Shipment s = load(id);
        if (s.getStatus() == ShipmentStatus.DELIVERED) {
            throw ApiException.badRequest("ALREADY_DELIVERED",
                    "That consignment has already been delivered.");
        }
        s.setStatus(ShipmentStatus.CANCELLED);
        s.setCancelledReason(reason);
        s.setUpdatedAt(Instant.now());
        return mapper.toDto(shipments.save(s), true);
    }

    /**
     * Positions written back by the browser's simulation loop.
     *
     * <p>Real telemetry would arrive here from a device gateway instead; the
     * shape of the write is the same, which is the point.
     */
    @Transactional
    public int commitLivePositions(List<Requests.LivePosition> updates) {
        Map<String, Shipment> byId = shipments.findAllById(
                        updates.stream().map(Requests.LivePosition::id).toList()).stream()
                .collect(java.util.stream.Collectors.toMap(Shipment::getId, Function.identity()));

        int applied = 0;
        for (Requests.LivePosition update : updates) {
            Shipment s = byId.get(update.id());
            if (s == null || !s.isActive()) {
                continue;
            }
            s.setProgress(update.progress());
            s.setPosition(new GeoPoint(update.lat(), update.lng()));
            s.setRemainingKm(update.remainingKm());
            s.setSpeedKmph(update.speedKmph());
            if (update.predictedAt() != null) {
                s.setPredictedAt(Instant.ofEpochMilli(update.predictedAt()));
            }
            if (update.delayMin() != null) {
                s.setDelayMin(update.delayMin());
            }
            s.setDelayReason(update.delayReason());
            s.setUpdatedAt(Instant.now());
            applied++;
        }
        shipments.saveAll(byId.values());
        return applied;
    }

    @Transactional
    public IncidentDto reportIncident(Requests.ReportIncident request) {
        Incident incident = new Incident();
        incident.setId("INC-" + (2000 + incidents.count()));
        incident.setType(request.type());
        incident.setShipmentId(request.shipmentId());
        incident.setDescription(request.description());
        incident.setPhotos(request.photos());
        if (request.lat() != null && request.lng() != null) {
            incident.setLocation(new GeoPoint(request.lat(), request.lng()));
        }
        incident.setLocationSource(request.locationSource());
        incident.setReportedBy(request.reportedBy());
        incident.setAt(Instant.now());
        incident.setStatus("open");

        Incident saved = incidents.save(incident);

        // An incident that dispatch never hears about is just a diary entry.
        if (request.shipmentId() != null) {
            shipments.findById(request.shipmentId()).ifPresent(s ->
                    alertService.raiseIncidentAlert(s, request.type(), request.description()));
        }
        return mapper.toDto(saved);
    }

    // --- helpers ---------------------------------------------------------

    private Shipment load(String id) {
        return shipments.findById(id)
                .orElseThrow(() -> ApiException.notFound("No shipment found with reference " + id + "."));
    }

    private Comparator<ShipmentDto> comparator(String sortKey, String direction) {
        Comparator<ShipmentDto> comparator = switch (sortKey == null ? "promisedAt" : sortKey) {
            case "id" -> Comparator.comparing(ShipmentDto::id);
            case "status" -> Comparator.comparing(d -> d.status().wire());
            case "lane" -> Comparator.comparing(ShipmentDto::lane, Comparator.nullsLast(String::compareTo));
            case "fcName" -> Comparator.comparing(ShipmentDto::fcName, Comparator.nullsLast(String::compareTo));
            case "vendorName" -> Comparator.comparing(ShipmentDto::vendorName,
                    Comparator.nullsLast(String::compareTo));
            case "carrier" -> Comparator.comparing(ShipmentDto::carrier, Comparator.nullsLast(String::compareTo));
            case "vehicleReg" -> Comparator.comparing(ShipmentDto::vehicleReg,
                    Comparator.nullsLast(String::compareTo));
            case "driverName" -> Comparator.comparing(ShipmentDto::driverName,
                    Comparator.nullsLast(String::compareTo));
            case "cartons" -> Comparator.comparingInt(ShipmentDto::cartons);
            case "delayMin" -> Comparator.comparingInt(ShipmentDto::delayMin);
            case "predictedAt" -> Comparator.comparing(ShipmentDto::predictedAt,
                    Comparator.nullsLast(Comparator.naturalOrder()));
            default -> Comparator.comparing(ShipmentDto::promisedAt,
                    Comparator.nullsLast(Comparator.naturalOrder()));
        };
        return "desc".equalsIgnoreCase(direction) ? comparator.reversed() : comparator;
    }

    /** Query parameters, resolved into a single predicate. */
    public record ShipmentFilter(String search, String status, String fcId, String vendorId,
                                 String carrier, String lane, Boolean delayedOnly, String priority) {

        public boolean matches(Shipment s) {
            if (search != null && !search.isBlank()) {
                String haystack = String.join(" ",
                        s.getId(),
                        nullSafe(s.getReference()),
                        s.getVendor() == null ? "" : s.getVendor().getName(),
                        s.getFulfilmentCentre() == null ? "" : s.getFulfilmentCentre().getName(),
                        s.getVehicle() == null ? "" : s.getVehicle().getRegNumber(),
                        s.getDriver() == null ? "" : s.getDriver().getName(),
                        Mapper.lane(s),
                        nullSafe(s.getInvoiceNo())).toLowerCase(Locale.ROOT);
                if (!haystack.contains(search.toLowerCase(Locale.ROOT))) {
                    return false;
                }
            }
            if (status != null && !status.isBlank() && !"all".equals(status)) {
                if ("active".equals(status)) {
                    if (!s.isActive()) {
                        return false;
                    }
                } else if (!s.getStatus().wire().equals(status)) {
                    return false;
                }
            }
            if (notAll(fcId) && (s.getFulfilmentCentre() == null
                    || !s.getFulfilmentCentre().getId().equals(fcId))) {
                return false;
            }
            if (notAll(vendorId) && (s.getVendor() == null || !s.getVendor().getId().equals(vendorId))) {
                return false;
            }
            if (notAll(carrier) && (s.getVehicle() == null || s.getVehicle().getCarrier() == null
                    || !s.getVehicle().getCarrier().getName().equals(carrier))) {
                return false;
            }
            if (notAll(lane) && !Mapper.lane(s).equals(lane)) {
                return false;
            }
            if (notAll(priority) && !s.getPriority().wire().equals(priority)) {
                return false;
            }
            return !Boolean.TRUE.equals(delayedOnly) || s.getDelayMin() > 15;
        }

        private static boolean notAll(String value) {
            return value != null && !value.isBlank() && !"all".equals(value);
        }

        private static String nullSafe(String value) {
            return value == null ? "" : value;
        }
    }
}
