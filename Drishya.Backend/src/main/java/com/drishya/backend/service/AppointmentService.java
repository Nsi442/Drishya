package com.drishya.backend.service;

import com.drishya.backend.domain.Appointment;
import com.drishya.backend.domain.Dock;
import com.drishya.backend.domain.enums.AppointmentStatus;
import com.drishya.backend.dto.AppointmentDto;
import com.drishya.backend.service.CallerService;
import com.drishya.backend.dto.DockDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.repo.AppointmentRepository;
import com.drishya.backend.repo.DockRepository;
import com.drishya.backend.repo.FulfilmentCentreRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dock scheduling.
 *
 * <p>The one rule that matters: two bookings cannot hold the same bay at the
 * same time. It is enforced here rather than in the browser, because the vendor
 * requesting a slot and the fulfilment centre dragging one on the gantt are two
 * different people who cannot see each other's screens.
 */
@Service
public class AppointmentService {

    private final AppointmentRepository appointments;
    private final DockRepository docks;
    private final FulfilmentCentreRepository centres;
    private final Mapper mapper;

    public AppointmentService(AppointmentRepository appointments, DockRepository docks,
                              FulfilmentCentreRepository centres, Mapper mapper) {
        this.appointments = appointments;
        this.docks = docks;
        this.centres = centres;
        this.mapper = mapper;
    }

    /**
     * Dock appointments the caller may see.
     *
     * <p>The vendorId parameter below is a filter the browser asks for, not a
     * boundary — which is why the scope is applied separately and first.
     * Unscoped, this returned all 69 appointments across every vendor, so one
     * vendor could read another's booked slots, vehicle registrations and
     * carton counts, and infer their volumes.
     */
    /** Whether an appointment falls inside this caller's boundary. */
    private boolean visibleTo(Appointment a, CallerService.Caller caller) {
        if (caller == null || caller.role() == null) {
            return false;
        }
        return switch (caller.role()) {
            case VENDOR_ADMIN, DISPATCHER ->
                    caller.tenantId() != null && caller.tenantId().equals(a.getVendorId());
            // The receiving desk owns the gantt for its own site and must see
            // every vendor booked into it.
            case FC -> caller.orgId() != null && caller.orgId().equals(a.getFcId());
            case DRIVER -> false;
        };
    }

    @Transactional(readOnly = true)
    public List<AppointmentDto> list(CallerService.Caller caller, String fcId, String vendorId,
                                     String status, Long from, Long to) {
        List<Appointment> rows = fcId != null && !fcId.isBlank() && !"all".equals(fcId)
                ? appointments.findByFcIdOrderByStartAsc(fcId)
                : appointments.findAll();

        rows = rows.stream().filter(a -> visibleTo(a, caller)).toList();

        Map<String, String> dockNames = dockNames();

        return rows.stream()
                .filter(a -> vendorId == null || "all".equals(vendorId) || vendorId.equals(a.getVendorId()))
                .filter(a -> status == null || "all".equals(status) || a.getStatus().wire().equals(status))
                .filter(a -> from == null || !a.getStart().isBefore(Instant.ofEpochMilli(from)))
                .filter(a -> to == null || !a.getStart().isAfter(Instant.ofEpochMilli(to)))
                .sorted(Comparator.comparing(Appointment::getStart))
                .map(a -> mapper.toDto(a, dockNames.get(a.getDockId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DockDto> listDocks(String fcId) {
        List<Dock> rows = fcId == null || fcId.isBlank() || "all".equals(fcId)
                ? docks.findAll()
                : docks.findByFulfilmentCentreIdOrderByNameAsc(fcId);
        return rows.stream().map(mapper::toDto).toList();
    }

    @Transactional
    public AppointmentDto request(Requests.RequestAppointment request) {
        Instant start = Instant.ofEpochMilli(request.start());
        int duration = request.durationMin() == null ? 60 : request.durationMin();
        Instant end = start.plus(Duration.ofMinutes(duration));

        findConflict(request.dockId(), start, end, null).ifPresent(clash -> {
            throw ApiException.conflict(
                    "That window clashes with %s on the same dock.".formatted(clash.getVendorName()));
        });

        Appointment a = new Appointment();
        a.setId("APT-" + (7000 + appointments.count()));
        a.setShipmentId(request.shipmentId());
        a.setVendorId(request.vendorId());
        a.setVendorName(request.vendorName());
        a.setFcId(request.fcId());
        a.setFcName(centres.findById(request.fcId()).map(fc -> fc.getName()).orElse(""));
        a.setDockId(request.dockId());
        a.setStart(start);
        a.setEnd(end);
        a.setStatus(AppointmentStatus.REQUESTED);
        a.setRequestedAt(Instant.now());
        a.setVehicleReg(request.vehicleReg() == null ? "—" : request.vehicleReg());
        a.setCartons(request.cartons() == null ? 0 : request.cartons());
        a.setNote(request.note());

        return mapper.toDto(appointments.save(a), dockNames().get(a.getDockId()));
    }

    @Transactional
    public AppointmentDto reschedule(String id, Requests.RescheduleAppointment request) {
        Appointment a = appointments.findById(id)
                .orElseThrow(() -> ApiException.notFound("That appointment no longer exists."));

        Instant start = Instant.ofEpochMilli(request.start());
        Duration length = Duration.between(a.getStart(), a.getEnd());
        Instant end = start.plus(length);
        String dockId = request.dockId() == null ? a.getDockId() : request.dockId();

        findConflict(dockId, start, end, id).ifPresent(clash -> {
            throw ApiException.conflict(
                    "That window clashes with %s on the same dock.".formatted(clash.getVendorName()));
        });

        a.setStart(start);
        a.setEnd(end);
        a.setDockId(dockId);
        a.setStatus(AppointmentStatus.CONFIRMED);
        a.setDecidedAt(Instant.now());

        return mapper.toDto(appointments.save(a), dockNames().get(dockId));
    }

    @Transactional
    public AppointmentDto decide(String id, Requests.DecideAppointment request) {
        Appointment a = appointments.findById(id)
                .orElseThrow(() -> ApiException.notFound("That appointment no longer exists."));

        // Approving into an already-taken bay is the mistake worth blocking.
        if (request.decision() == AppointmentStatus.CONFIRMED) {
            findConflict(a.getDockId(), a.getStart(), a.getEnd(), a.getId()).ifPresent(clash -> {
                throw ApiException.conflict(
                        "%s already holds that window on this dock.".formatted(clash.getVendorName()));
            });
        }

        a.setStatus(request.decision());
        a.setDecidedAt(Instant.now());
        a.setDecidedBy(request.by() == null ? "FC scheduling desk" : request.by());
        a.setRejectionReason(request.decision() == AppointmentStatus.REJECTED ? request.reason() : null);
        a.setProposedStart(request.decision() == AppointmentStatus.ALTERNATIVE && request.proposedStart() != null
                ? Instant.ofEpochMilli(request.proposedStart()) : null);

        return mapper.toDto(appointments.save(a), dockNames().get(a.getDockId()));
    }

    /** Lets the booking form warn before the user submits. */
    @Transactional(readOnly = true)
    public AppointmentDto checkConflict(String dockId, long startMillis, int durationMin, String ignoreId) {
        Instant start = Instant.ofEpochMilli(startMillis);
        return findConflict(dockId, start, start.plus(Duration.ofMinutes(durationMin)), ignoreId)
                .map(a -> mapper.toDto(a, dockNames().get(a.getDockId())))
                .orElse(null);
    }

    private Optional<Appointment> findConflict(String dockId, Instant start, Instant end, String ignoreId) {
        return appointments.findOverlapping(dockId, start, end, ignoreId).stream().findFirst();
    }

    private Map<String, String> dockNames() {
        return docks.findAll().stream()
                .collect(Collectors.toMap(Dock::getId, Dock::getName, (a, b) -> a));
    }
}
