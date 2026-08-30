package com.drishya.backend.service;

import com.drishya.backend.domain.Alert;
import com.drishya.backend.domain.ReceivingException;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.enums.AlertSeverity;
import com.drishya.backend.domain.enums.AlertType;
import com.drishya.backend.domain.enums.ExceptionStatus;
import com.drishya.backend.domain.enums.ExceptionType;
import com.drishya.backend.domain.enums.IncidentType;
import com.drishya.backend.dto.AlertDto;
import com.drishya.backend.dto.ExceptionDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.repo.AlertRepository;
import com.drishya.backend.repo.ReceivingExceptionRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The alert feed and the fulfilment centre's exception queue. */
@Service
public class AlertService {

    private final AlertRepository alerts;
    private final ReceivingExceptionRepository exceptions;
    private final Mapper mapper;

    public AlertService(AlertRepository alerts, ReceivingExceptionRepository exceptions, Mapper mapper) {
        this.alerts = alerts;
        this.exceptions = exceptions;
        this.mapper = mapper;
    }

    /**
     * The alert feed, scoped to whoever is asking.
     *
     * <p><b>This used to be unscoped.</b> Every authenticated caller — any
     * vendor, the driver, the receiving desk — received the same global feed of
     * every alert in the cluster. For a driver that was merely confusing; for a
     * vendor it meant reading another vendor's delays, document rejections and
     * consignment references, which is precisely what the tenancy work was
     * supposed to make impossible.
     *
     * <p>The repository does the filtering, not this method, and not the
     * controller. Isolation expressed as a query is enforced for every caller;
     * isolation expressed as a stream filter is enforced only for the callers
     * somebody remembered.
     *
     * @param caller resolved from the bearer token
     */
    @Transactional(readOnly = true)
    public List<AlertDto> listFor(CallerService.Caller caller, String severity, String read,
                                  String search, String shipmentId) {
        return scopedFor(caller).stream()
                .filter(a -> shipmentId == null || shipmentId.equals(a.getShipmentId()))
                .filter(a -> isAll(severity) || a.getSeverity().wire().equals(severity))
                .filter(a -> switch (read == null ? "all" : read) {
                    case "unread" -> !a.isRead();
                    case "read" -> a.isRead();
                    default -> true;
                })
                .filter(a -> search == null || search.isBlank()
                        || (a.getTitle() + " " + a.getMessage() + " " + nullSafe(a.getShipmentId()))
                        .toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT)))
                .map(mapper::toDto)
                .toList();
    }

    /** Whether a receiving exception falls inside this caller's boundary. */
    private boolean visibleTo(ReceivingException e, CallerService.Caller caller) {
        if (caller == null || caller.role() == null) {
            return false;
        }
        return switch (caller.role()) {
            case VENDOR_ADMIN, DISPATCHER ->
                    caller.tenantId() != null && caller.tenantId().equals(e.getVendorId());
            case FC -> caller.orgId() != null && caller.orgId().equals(e.getFcId());
            // A driver has no use for a commercial receiving dispute.
            case DRIVER -> false;
        };
    }

    /**
     * Which alerts this caller may see at all.
     *
     * <p>Fails closed: an account whose role does not match a case below gets
     * an empty feed rather than the whole one. A misconfigured account showing
     * nothing is a support ticket; showing everything is a breach.
     */
    private List<Alert> scopedFor(CallerService.Caller caller) {
        if (caller == null || caller.role() == null) {
            return List.of();
        }
        return switch (caller.role()) {
            // Bounded by tenant, like every other vendor-side read.
            case VENDOR_ADMIN, DISPATCHER -> caller.tenantId() == null
                    ? List.of()
                    : alerts.findByVendorIdOrderByAtDesc(caller.tenantId());

            // Cross-tenant by necessity, but bounded to one site: a receiving
            // desk sees inbound from every vendor booked into their fulfilment
            // centre, and nothing from any other site.
            case FC -> caller.orgId() == null
                    ? List.of()
                    : alerts.findByFcIdOrderByAtDesc(caller.orgId());

            // Scoped to the consignments actually on their vehicle. A driver has
            // no tenant and no reason to see a vendor's commercial alerts.
            case DRIVER -> caller.driverId() == null
                    ? List.of()
                    : alerts.findForDriver(caller.driverId());
        };
    }

    @Transactional
    public int markRead(List<String> ids) {
        return ids == null || ids.isEmpty() ? 0 : alerts.markRead(ids);
    }

    @Transactional
    public int markAllRead(String fcId) {
        return fcId == null || fcId.isBlank() ? alerts.markAllRead() : alerts.markAllReadForFc(fcId);
    }

    @Transactional
    public AlertDto acknowledge(String id, String by) {
        Alert alert = alerts.findById(id)
                .orElseThrow(() -> ApiException.notFound("That alert no longer exists."));
        alert.setAcknowledged(true);
        alert.setAcknowledgedBy(by);
        alert.setRead(true);
        return mapper.toDto(alerts.save(alert));
    }

    /** Raised by the live simulation and by driver incident reports. */
    @Transactional
    public AlertDto raise(AlertType type, AlertSeverity severity, String title, String message, Shipment s) {
        Alert alert = new Alert();
        alert.setId("ALT-" + (9000 + alerts.count()));
        alert.setType(type);
        alert.setSeverity(severity);
        alert.setTitle(title);
        alert.setMessage(message);
        alert.setAt(Instant.now());
        if (s != null) {
            alert.setShipmentId(s.getId());
            alert.setVendorId(s.getVendor() == null ? null : s.getVendor().getId());
            alert.setFcId(s.getFulfilmentCentre() == null ? null : s.getFulfilmentCentre().getId());
        }
        return mapper.toDto(alerts.save(alert));
    }

    @Transactional
    public void raiseIncidentAlert(Shipment s, IncidentType type, String description) {
        raise(AlertType.DELAY, AlertSeverity.CRITICAL, "Incident reported by driver",
                "%s reported on %s — %s".formatted(
                        type.wire().replace('_', ' '),
                        s.getVehicle() == null ? "the vehicle" : s.getVehicle().getRegNumber(),
                        description),
                s);
    }

    // --- exceptions ------------------------------------------------------

    @Transactional(readOnly = true)
    public List<ExceptionDto> listExceptions(CallerService.Caller caller, String fcId,
                                            String status, String type, String search) {
        List<ReceivingException> rows = isAll(fcId)
                ? exceptions.findAll()
                : exceptions.findByFcIdOrderByRaisedAtDesc(fcId);

        // The boundary, applied before the caller's own filters. A receiving
        // exception names the vendor it was raised against, so unscoped this
        // handed every vendor the full list of everyone else's shortages,
        // damages and rejected deliveries.
        rows = rows.stream().filter(e -> visibleTo(e, caller)).toList();

        return rows.stream()
                .filter(e -> isAll(status) || e.getStatus().wire().equals(status))
                .filter(e -> isAll(type) || e.getType().wire().equals(type))
                .filter(e -> search == null || search.isBlank()
                        || (e.getTitle() + " " + e.getDetail() + " " + nullSafe(e.getShipmentId())
                        + " " + nullSafe(e.getVendorName()))
                        .toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT)))
                .sorted(Comparator.comparing(ReceivingException::getRaisedAt).reversed())
                .map(mapper::toDto)
                .toList();
    }

    @Transactional
    public ExceptionDto updateException(String id, Requests.UpdateException request) {
        ReceivingException e = exceptions.findById(id)
                .orElseThrow(() -> ApiException.notFound("That exception no longer exists."));

        if (request.status() != null && !request.status().isBlank()) {
            ExceptionStatus next = ExceptionStatus.from(request.status());
            e.setStatus(next);
            // Stamp the resolution time once, when it first closes.
            if (next == ExceptionStatus.RESOLVED && e.getResolvedAt() == null) {
                e.setResolvedAt(Instant.now());
            }
        }
        if (request.owner() != null && !request.owner().isBlank()) {
            e.setOwner(request.owner());
        }
        if (request.resolutionNote() != null) {
            e.setResolutionNote(request.resolutionNote());
        }
        return mapper.toDto(exceptions.save(e));
    }

    /** Raised automatically by receiving when a count comes up short. */
    @Transactional
    public void raiseException(Shipment s, ExceptionType type, String title, String detail) {
        ReceivingException e = new ReceivingException();
        e.setId("EXC-" + (4000 + exceptions.count()));
        e.setType(type);
        e.setTitle(title);
        e.setDetail(detail);
        e.setShipmentId(s.getId());
        e.setVendorId(s.getVendor() == null ? null : s.getVendor().getId());
        e.setVendorName(s.getVendor() == null ? null : s.getVendor().getName());
        e.setFcId(s.getFulfilmentCentre() == null ? null : s.getFulfilmentCentre().getId());
        e.setFcName(s.getFulfilmentCentre() == null ? null : s.getFulfilmentCentre().getName());
        e.setSeverity(AlertSeverity.CRITICAL);
        e.setStatus(ExceptionStatus.OPEN);
        e.setOwner("Unassigned");
        e.setRaisedAt(Instant.now());
        exceptions.save(e);
    }

    private static boolean isAll(String value) {
        return value == null || value.isBlank() || "all".equals(value);
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }
}
