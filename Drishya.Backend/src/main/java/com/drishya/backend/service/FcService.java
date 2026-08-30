package com.drishya.backend.service;

import com.drishya.backend.domain.Appointment;
import com.drishya.backend.domain.Dock;
import com.drishya.backend.domain.GoodsReceipt;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.ShipmentEvent;
import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.ExceptionType;
import com.drishya.backend.domain.enums.GrnDecision;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.dto.AppointmentDto;
import com.drishya.backend.dto.DockDto;
import com.drishya.backend.dto.GateLogDto;
import com.drishya.backend.domain.enums.Role;
import com.drishya.backend.dto.ShipmentDto;
import com.drishya.backend.dto.YardVehicleDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.repo.AppointmentRepository;
import com.drishya.backend.repo.DockRepository;
import com.drishya.backend.repo.ShipmentRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The fulfilment centre's side: arrivals, the yard, receiving and the docks. */
@Service
public class FcService {

    /** Free time before detention is flagged, then charged. */
    public static final int DETENTION_AMBER_MIN = 45;
    public static final int DETENTION_RED_MIN = 90;

    private final ShipmentRepository shipments;
    private final AppointmentRepository appointments;
    private final DockRepository docks;
    private final AlertService alertService;
    private final Mapper mapper;

    public FcService(ShipmentRepository shipments, AppointmentRepository appointments, DockRepository docks,
                     AlertService alertService, Mapper mapper) {
        this.shipments = shipments;
        this.appointments = appointments;
        this.docks = docks;
        this.alertService = alertService;
        this.mapper = mapper;
    }

    /**
     * The site this caller is actually the receiving desk for.
     *
     * <p><b>The fcId in the URL is not trusted.</b> Every one of these endpoints
     * took it straight from the path, so the desk at Bhiwandi could read
     * Manesar's arrival board, yard, receiving queue and dock gantt by editing
     * one path segment — and gate a Manesar vehicle out. FC is deliberately
     * cross-tenant, since a desk must see every vendor booked into its site, and
     * that made it easy to forget it is still bounded on the other axis: one
     * site, not all of them.
     *
     * <p>Reports not-found rather than forbidden, so the endpoint does not
     * confirm which other sites exist.
     */
    private String requireSite(CallerService.Caller caller, String requestedFcId) {
        if (caller == null || caller.role() != Role.FC || caller.orgId() == null) {
            throw ApiException.forbidden("This view belongs to a fulfilment centre account.");
        }
        if (requestedFcId != null && !requestedFcId.isBlank()
                && !"all".equals(requestedFcId) && !caller.orgId().equals(requestedFcId)) {
            throw ApiException.notFound("No such fulfilment centre.");
        }
        return caller.orgId();
    }

    /**
     * A consignment inbound to this caller's own site.
     *
     * <p>Gate-in, gate-out and the goods receipt act on a shipment id taken from
     * the path, with nothing tying it to the desk performing the action.
     */
    private Shipment requireInbound(String shipmentId, CallerService.Caller caller) {
        String site = requireSite(caller, null);
        return shipments.findById(shipmentId)
                .filter(s -> s.getFulfilmentCentre() != null
                        && site.equals(s.getFulfilmentCentre().getId()))
                .orElseThrow(() -> ApiException.notFound("No such consignment at this site."));
    }

    /**
     * The arrival board. Sorted by live ETA by default, because that is the
     * order the receiving team actually works in.
     */
    @Transactional(readOnly = true)
    public List<ShipmentDto> arrivals(CallerService.Caller caller, String fcId, String window,
                                      String status, String search) {
        fcId = requireSite(caller, fcId);
        Instant now = Instant.now();
        Instant endOfToday = LocalDate.now().atTime(23, 59, 59).atZone(ZoneId.systemDefault()).toInstant();

        return shipments.findByFulfilmentCentreId(fcId).stream()
                .filter(s -> s.getStatus() != ShipmentStatus.CANCELLED)
                // predictedAt is nullable now and legitimately so: the ETA
                // engine withdraws an estimate rather than serving one built on
                // a stale position. A consignment with no current estimate is
                // still inbound and still belongs on the board — it is the one
                // the desk most needs to see — so it is kept in the time
                // windows rather than filtered out by a null check.
                .filter(s -> {
                    Instant eta = s.getPredictedAt();
                    return switch (window == null ? "today" : window) {
                        case "today" -> (eta == null || !eta.isAfter(endOfToday))
                                && s.getStatus() != ShipmentStatus.DELIVERED;
                        case "4h" -> eta == null
                                || (eta.isAfter(now.minus(1, ChronoUnit.HOURS))
                                    && eta.isBefore(now.plus(4, ChronoUnit.HOURS)));
                        case "active" -> s.isActive();
                        default -> true;
                    };
                })
                .filter(s -> status == null || "all".equals(status) || s.getStatus().wire().equals(status))
                .filter(s -> search == null || search.isBlank() || matches(s, search))
                .sorted(Comparator.comparing(Shipment::getPredictedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(s -> mapper.toDto(s, false))
                .toList();
    }

    /** Vehicles physically on site, and the gate log behind them. */
    @Transactional(readOnly = true)
    public YardView yard(CallerService.Caller caller, String fcId) {
        fcId = requireSite(caller, fcId);
        Instant now = Instant.now();
        Map<String, String> dockNames = docks.findByFulfilmentCentreIdOrderByNameAsc(fcId).stream()
                .collect(Collectors.toMap(Dock::getId, Dock::getName, (a, b) -> a));

        List<YardVehicleDto> onSite = shipments
                .findByFulfilmentCentreIdAndGateInAtIsNotNullAndGateOutAtIsNull(fcId).stream()
                .map(s -> {
                    long minutes = Duration.between(s.getGateInAt(), now).toMinutes();
                    return new YardVehicleDto(
                            s.getId(),
                            s.getVendor() == null ? null : s.getVendor().getName(),
                            s.getVehicle() == null ? null : s.getVehicle().getRegNumber(),
                            s.getVehicle() == null ? null : s.getVehicle().getType(),
                            s.getDriver() == null ? null : s.getDriver().getName(),
                            s.getDriver() == null ? null : s.getDriver().getPhone(),
                            s.getStatus(),
                            s.getDockId(),
                            dockNames.get(s.getDockId()),
                            s.getGateInAt().toEpochMilli(),
                            minutes,
                            minutes >= DETENTION_RED_MIN ? "red"
                                    : minutes >= DETENTION_AMBER_MIN ? "amber" : "ok",
                            s.getCartons());
                })
                .sorted(Comparator.comparingLong(YardVehicleDto::minutesOnSite).reversed())
                .toList();

        List<GateLogDto> log = new ArrayList<>();
        for (Shipment s : shipments.findByFulfilmentCentreIdAndGateInAtIsNotNull(fcId)) {
            String vendorName = s.getVendor() == null ? null : s.getVendor().getName();
            String reg = s.getVehicle() == null ? null : s.getVehicle().getRegNumber();
            String driverName = s.getDriver() == null ? null : s.getDriver().getName();
            log.add(new GateLogDto(s.getId() + "-in", s.getId(), "in",
                    s.getGateInAt().toEpochMilli(), reg, vendorName, driverName));
            if (s.getGateOutAt() != null) {
                log.add(new GateLogDto(s.getId() + "-out", s.getId(), "out",
                        s.getGateOutAt().toEpochMilli(), reg, vendorName, driverName));
            }
        }
        log.sort(Comparator.comparingLong(GateLogDto::at).reversed());

        return new YardView(onSite, log.size() > 40 ? log.subList(0, 40) : log);
    }

    @Transactional
    public ShipmentDto gateIn(String shipmentId, CallerService.Caller caller) {
        requireInbound(shipmentId, caller);
        Shipment s = load(shipmentId);
        if (s.getGateInAt() != null) {
            throw ApiException.badRequest("ALREADY_GATED_IN",
                    "%s is already on site.".formatted(s.getId()));
        }
        Instant now = Instant.now();
        s.setStatus(ShipmentStatus.AT_GATE);
        s.setGateInAt(now);
        s.setProgress(0.97);
        s.setSpeedKmph(0);
        s.setUpdatedAt(now);
        s.addEvent(new ShipmentEvent(ShipmentStatus.AT_GATE, "Gate-in recorded",
                "Vehicle checked in at the fulfilment centre gate", now));
        return mapper.toDto(shipments.save(s), true);
    }

    @Transactional
    public ShipmentDto gateOut(String shipmentId, CallerService.Caller caller) {
        requireInbound(shipmentId, caller);
        Shipment s = load(shipmentId);
        if (s.getGateInAt() == null) {
            throw ApiException.badRequest("NOT_ON_SITE",
                    "%s has not been gated in.".formatted(s.getId()));
        }
        s.setGateOutAt(Instant.now());
        s.setUpdatedAt(Instant.now());
        return mapper.toDto(shipments.save(s), true);
    }

    /** Consignments at a dock waiting for their goods receipt check. */
    @Transactional(readOnly = true)
    public List<ShipmentDto> receivingQueue(CallerService.Caller caller, String fcId) {
        fcId = requireSite(caller, fcId);
        return shipments.findByFulfilmentCentreId(fcId).stream()
                .filter(s -> s.getStatus() == ShipmentStatus.AT_DOCK
                        || (s.getStatus() == ShipmentStatus.DELIVERED && s.getGrn() == null))
                .sorted(Comparator.comparing(Shipment::getPredictedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .map(s -> mapper.toDto(s, true))
                .toList();
    }

    /**
     * Records the goods receipt. A short count or a rejection raises an
     * exception automatically — the vendor finds out because the system tells
     * them, not because someone remembers to.
     */
    @Transactional
    public ShipmentDto submitGrn(String shipmentId, Requests.SubmitGrn request,
                                 CallerService.Caller caller) {
        requireInbound(shipmentId, caller);
        Shipment s = load(shipmentId);

        if (request.receivedCartons() > s.getCartons()) {
            throw ApiException.badRequest("OVER_COUNT",
                    "Cannot receive more than the %d cartons on the advance shipping notice."
                            .formatted(s.getCartons()));
        }

        Instant now = Instant.now();
        GoodsReceipt grn = new GoodsReceipt();
        grn.setDecision(request.decision());
        grn.setExpectedCartons(s.getCartons());
        grn.setReceivedCartons(request.receivedCartons());
        grn.setDamagedCartons(request.damagedCartons());
        grn.setDocumentsVerified(request.documentsVerified() == null
                ? null : String.join(",", request.documentsVerified()));
        grn.setNote(request.note());
        grn.setCheckedAt(now);
        grn.setCheckedBy(request.checkedBy() == null ? "FC receiving desk" : request.checkedBy());

        s.setGrn(grn);
        s.setStatus(ShipmentStatus.DELIVERED);
        if (s.getDeliveredAt() == null) {
            s.setDeliveredAt(now);
        }
        if (s.getGateOutAt() == null) {
            s.setGateOutAt(now);
        }
        s.setProgress(1);
        s.setUpdatedAt(now);
        s.getEvents().removeIf(e -> e.getStage() == ShipmentStatus.DELIVERED);
        s.addEvent(new ShipmentEvent(ShipmentStatus.DELIVERED, "Goods receipt raised",
                "%s — %d of %d cartons".formatted(request.decision().wire(),
                        request.receivedCartons(), s.getCartons()), now));

        Shipment saved = shipments.save(s);

        int shortfall = s.getCartons() - request.receivedCartons();
        if (request.decision() == GrnDecision.REJECTED) {
            alertService.raiseException(saved, ExceptionType.DAMAGE, "Damage on receipt",
                    ("Consignment rejected at receiving. "
                            + (request.note() == null ? "" : request.note())).trim());
        } else if (shortfall > 0) {
            alertService.raiseException(saved, ExceptionType.QUANTITY_SHORTAGE, "Quantity shortage",
                    "Counted %d against %d expected — short by %d."
                            .formatted(request.receivedCartons(), s.getCartons(), shortfall));
        }

        return mapper.toDto(saved, true);
    }

    /** The dock gantt for one day, with per-bay utilisation. */
    @Transactional(readOnly = true)
    public DockSchedule dockSchedule(CallerService.Caller caller, String fcId, Long dayStartMillis) {
        fcId = requireSite(caller, fcId);
        Instant dayStart = dayStartMillis != null
                ? Instant.ofEpochMilli(dayStartMillis)
                : LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant();
        Instant dayEnd = dayStart.plus(1, ChronoUnit.DAYS);

        List<Dock> bays = docks.findByFulfilmentCentreIdOrderByNameAsc(fcId);
        Map<String, String> dockNames = bays.stream()
                .collect(Collectors.toMap(Dock::getId, Dock::getName, (a, b) -> a));

        List<Appointment> booked = appointments
                .findByFcIdAndStartBetweenOrderByStartAsc(fcId, dayStart, dayEnd).stream()
                .filter(a -> a.getStatus() != com.drishya.backend.domain.enums.AppointmentStatus.REJECTED)
                .toList();

        // Utilisation is measured against the 16-hour operating window, not 24.
        List<DockUtilisation> utilisation = bays.stream()
                .map(dock -> {
                    long bookedMinutes = booked.stream()
                            .filter(a -> dock.getId().equals(a.getDockId()))
                            .mapToLong(a -> Duration.between(a.getStart(), a.getEnd()).toMinutes())
                            .sum();
                    return new DockUtilisation(dock.getId(), dock.getName(), bookedMinutes,
                            (int) Math.round(bookedMinutes / (16.0 * 60) * 100));
                })
                .toList();

        return new DockSchedule(
                bays.stream().map(mapper::toDto).toList(),
                booked.stream().map(a -> mapper.toDto(a, dockNames.get(a.getDockId()))).toList(),
                utilisation,
                dayStart.toEpochMilli());
    }

    private Shipment load(String id) {
        return shipments.findById(id)
                .orElseThrow(() -> ApiException.notFound("No shipment found with reference " + id + "."));
    }

    private boolean matches(Shipment s, String search) {
        String haystack = String.join(" ",
                s.getId(),
                s.getVendor() == null ? "" : s.getVendor().getName(),
                s.getVehicle() == null ? "" : s.getVehicle().getRegNumber(),
                s.getReference() == null ? "" : s.getReference()).toLowerCase(Locale.ROOT);
        return haystack.contains(search.toLowerCase(Locale.ROOT));
    }

    public record YardView(List<YardVehicleDto> onSite, List<GateLogDto> log) {}

    public record DockUtilisation(String dockId, String name, long bookedMin, int utilisationPct) {}

    public record DockSchedule(List<DockDto> docks, List<AppointmentDto> appointments,
                               List<DockUtilisation> utilisation, long dayStart) {}
}
