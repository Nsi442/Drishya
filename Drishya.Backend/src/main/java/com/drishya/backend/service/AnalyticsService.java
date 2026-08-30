package com.drishya.backend.service;

import com.drishya.backend.domain.Appointment;
import com.drishya.backend.domain.ReceivingException;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.ExceptionStatus;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.dto.ShipmentDto;
import com.drishya.backend.repo.AppointmentRepository;
import com.drishya.backend.repo.DockRepository;
import com.drishya.backend.repo.FulfilmentCentreRepository;
import com.drishya.backend.repo.ReceivingExceptionRepository;
import com.drishya.backend.repo.ShipmentRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Everything on the analytics pages is computed here from shipments rather than
 * stored, so a chart and the table beside it cannot tell different stories about
 * the same day.
 */
@Service
public class AnalyticsService {

    private static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);

    /** Cost model: a fixed handling charge plus a per-kilometre rate. */
    private static final int FIXED_COST = 2800;
    private static final int COST_PER_KM = 11;

    private final ShipmentRepository shipments;
    private final AppointmentRepository appointments;
    private final ReceivingExceptionRepository exceptions;
    private final FulfilmentCentreRepository centres;
    private final DockRepository docks;
    private final Mapper mapper;

    public AnalyticsService(ShipmentRepository shipments, AppointmentRepository appointments,
                            ReceivingExceptionRepository exceptions, FulfilmentCentreRepository centres,
                            DockRepository docks, Mapper mapper) {
        this.shipments = shipments;
        this.appointments = appointments;
        this.exceptions = exceptions;
        this.centres = centres;
        this.docks = docks;
        this.mapper = mapper;
    }

    // --- vendor ----------------------------------------------------------

    @Transactional(readOnly = true)
    public VendorSummary vendorSummary(String vendorId) {
        List<Shipment> all = scope(vendorId);
        List<Shipment> active = all.stream().filter(Shipment::isActive).toList();
        List<Shipment> delivered = all.stream()
                .filter(s -> s.getStatus() == ShipmentStatus.DELIVERED).toList();

        Instant todayStart = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant();
        long deliveredToday = delivered.stream()
                .filter(s -> s.getDeliveredAt() != null && !s.getDeliveredAt().isBefore(todayStart))
                .count();
        long onTime = delivered.stream().filter(s -> s.getDelayMin() <= 15).count();

        List<ShipmentDto> atRisk = active.stream()
                .filter(s -> s.getDelayMin() > 15)
                .sorted(Comparator.comparingInt(Shipment::getDelayMin).reversed())
                .limit(6)
                .map(s -> mapper.toDto(s, false))
                .toList();

        long openDocIssues = active.stream()
                .flatMap(s -> s.getDocuments().stream())
                .filter(d -> d.getStatus() == DocumentStatus.MISMATCH
                        || d.getStatus() == DocumentStatus.MISSING)
                .count();

        return new VendorSummary(
                active.size(),
                (int) all.stream().filter(s -> s.getStatus() == ShipmentStatus.IN_TRANSIT).count(),
                (int) active.stream().filter(s -> s.getDelayMin() > 15).count(),
                (int) deliveredToday,
                delivered.isEmpty() ? 0 : (int) Math.round(onTime * 100.0 / delivered.size()),
                atRisk,
                active.isEmpty() ? 0 : (int) Math.round(active.stream()
                        .mapToInt(s -> Math.max(0, s.getDelayMin())).average().orElse(0)),
                (int) openDocIssues);
    }

    /** Fourteen days of deliveries, split on-time against late. */
    @Transactional(readOnly = true)
    public List<DayVolume> weeklyDeliveries(String vendorId) {
        List<Shipment> all = scope(vendorId);
        List<DayVolume> out = new ArrayList<>();

        for (int i = 13; i >= 0; i--) {
            LocalDate day = LocalDate.now().minusDays(i);
            Instant from = day.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant to = from.plus(1, ChronoUnit.DAYS);

            List<Shipment> delivered = all.stream()
                    .filter(s -> s.getDeliveredAt() != null
                            && !s.getDeliveredAt().isBefore(from) && s.getDeliveredAt().isBefore(to))
                    .toList();
            long onTime = delivered.stream().filter(s -> s.getDelayMin() <= 15).count();

            out.add(DayVolume.delivered(from.toEpochMilli(), day.format(DAY_LABEL),
                    delivered.size(), (int) onTime,
                    delivered.isEmpty() ? null : (int) Math.round(onTime * 100.0 / delivered.size())));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public VendorAnalytics vendorAnalytics(Long fromMillis, Long toMillis, String vendorId) {
        Instant from = fromMillis != null ? Instant.ofEpochMilli(fromMillis)
                : Instant.now().minus(30, ChronoUnit.DAYS);
        Instant to = toMillis != null ? Instant.ofEpochMilli(toMillis).plus(1, ChronoUnit.DAYS)
                : Instant.now().plus(1, ChronoUnit.DAYS);

        List<Shipment> inRange = scope(vendorId).stream()
                .filter(s -> s.getPromisedAt() != null
                        && !s.getPromisedAt().isBefore(from) && !s.getPromisedAt().isAfter(to))
                .toList();
        List<Shipment> delivered = inRange.stream()
                .filter(s -> s.getStatus() == ShipmentStatus.DELIVERED).toList();

        // Daily on-time and cost trend across the selected range.
        long days = Math.max(1, ChronoUnit.DAYS.between(from, to));
        List<TrendPoint> trend = new ArrayList<>();
        for (long i = days - 1; i >= 0; i--) {
            LocalDate day = to.atZone(ZoneId.systemDefault()).toLocalDate().minusDays(i);
            Instant dayStart = day.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant dayEnd = dayStart.plus(1, ChronoUnit.DAYS);

            List<Shipment> onDay = delivered.stream()
                    .filter(s -> s.getDeliveredAt() != null
                            && !s.getDeliveredAt().isBefore(dayStart) && s.getDeliveredAt().isBefore(dayEnd))
                    .toList();
            long onTime = onDay.stream().filter(s -> s.getDelayMin() <= 15).count();

            trend.add(new TrendPoint(dayStart.toEpochMilli(), day.format(DAY_LABEL),
                    onDay.isEmpty() ? null : (int) Math.round(onTime * 100.0 / onDay.size()),
                    onDay.size(),
                    onDay.isEmpty() ? null : (int) Math.round(onDay.stream()
                            .mapToInt(AnalyticsService::costOf).average().orElse(0))));
        }

        // Delay reasons, only for shipments that were actually late.
        List<Shipment> late = inRange.stream().filter(s -> s.getDelayMin() > 15).toList();
        Map<String, Integer> reasonCounts = new LinkedHashMap<>();
        for (Shipment s : late) {
            if (s.getDelayReason() != null) {
                reasonCounts.merge(s.getDelayReason(), 1, Integer::sum);
            }
        }
        List<ReasonCount> reasons = reasonCounts.entrySet().stream()
                .map(e -> new ReasonCount(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingInt(ReasonCount::count).reversed())
                .toList();

        // Lane performance.
        Map<String, List<Shipment>> byLane = new LinkedHashMap<>();
        inRange.forEach(s -> byLane.computeIfAbsent(Mapper.lane(s), k -> new ArrayList<>()).add(s));

        List<LanePerformance> lanes = byLane.entrySet().stream().map(entry -> {
            List<Shipment> rows = entry.getValue();
            long onTime = rows.stream().filter(s -> s.getDelayMin() <= 15).count();
            return new LanePerformance(entry.getKey(), rows.size(),
                    (int) Math.round(onTime * 100.0 / rows.size()),
                    (int) Math.round(rows.stream().mapToInt(s -> Math.max(0, s.getDelayMin()))
                            .average().orElse(0)),
                    rows.get(0).getDistanceKm(),
                    (int) Math.round(rows.stream().mapToInt(AnalyticsService::costOf).average().orElse(0)));
        }).sorted(Comparator.comparingInt(LanePerformance::shipments).reversed()).toList();

        // Dwell time per centre — gate-in to gate-out.
        List<DwellByCentre> dwell = centres.findAll().stream().map(fc -> {
            List<Shipment> rows = delivered.stream()
                    .filter(s -> s.getFulfilmentCentre() != null
                            && s.getFulfilmentCentre().getId().equals(fc.getId())
                            && s.getGateInAt() != null && s.getGateOutAt() != null)
                    .toList();
            int avg = rows.isEmpty() ? 0 : (int) Math.round(rows.stream()
                    .mapToLong(s -> Duration.between(s.getGateInAt(), s.getGateOutAt()).toMinutes())
                    .average().orElse(0));
            return new DwellByCentre(fc.getId(), fc.getName(), fc.getCity(), avg, rows.size());
        }).toList();

        long onTimeTotal = delivered.stream().filter(s -> s.getDelayMin() <= 15).count();
        Totals totals = new Totals(
                inRange.size(),
                delivered.size(),
                delivered.isEmpty() ? 0 : (int) Math.round(onTimeTotal * 100.0 / delivered.size()),
                inRange.isEmpty() ? 0 : (int) Math.round(inRange.stream()
                        .mapToInt(AnalyticsService::costOf).average().orElse(0)),
                late.isEmpty() ? 0 : (int) Math.round(late.stream()
                        .mapToInt(Shipment::getDelayMin).average().orElse(0)),
                inRange.stream().mapToInt(Shipment::getCartons).sum());

        return new VendorAnalytics(trend, reasons, lanes, dwell, totals);
    }

    // --- fulfilment centre ------------------------------------------------

    @Transactional(readOnly = true)
    public FcSummary fcSummary(String fcId) {
        List<Shipment> all = shipments.findByFulfilmentCentreId(fcId);
        Instant now = Instant.now();
        Instant endOfToday = LocalDate.now().atTime(23, 59, 59).atZone(ZoneId.systemDefault()).toInstant();

        List<Shipment> active = all.stream().filter(Shipment::isActive).toList();
        long occupied = all.stream()
                .filter(s -> s.getStatus() == ShipmentStatus.AT_DOCK && s.getDockId() != null)
                .map(Shipment::getDockId).distinct().count();

        List<Shipment> inboundToday = all.stream()
                .filter(s -> s.getStatus() != ShipmentStatus.CANCELLED
                        && s.getStatus() != ShipmentStatus.DELIVERED
                        && s.getPredictedAt() != null && !s.getPredictedAt().isAfter(endOfToday))
                .toList();

        return new FcSummary(
                inboundToday.size(),
                (int) active.stream()
                        .filter(s -> s.getPredictedAt() != null && s.getPredictedAt().isAfter(now)
                                && s.getPredictedAt().isBefore(now.plus(4, ChronoUnit.HOURS)))
                        .count(),
                (int) active.stream().filter(s -> s.getDelayMin() > 15).count(),
                (int) all.stream().filter(s -> s.getStatus() == ShipmentStatus.AT_GATE).count(),
                (int) all.stream().filter(s -> s.getStatus() == ShipmentStatus.AT_DOCK).count(),
                (int) occupied,
                docks.findByFulfilmentCentreIdOrderByNameAsc(fcId).size(),
                (int) exceptions.countByFcIdAndStatusNot(fcId, ExceptionStatus.RESOLVED),
                inboundToday.stream().mapToInt(Shipment::getCartons).sum());
    }

    @Transactional(readOnly = true)
    public FcAnalytics fcAnalytics(String fcId) {
        List<Shipment> all = shipments.findByFulfilmentCentreId(fcId);

        List<DayVolume> volume = new ArrayList<>();
        List<DwellPoint> dwellByDay = new ArrayList<>();
        for (int i = 13; i >= 0; i--) {
            LocalDate day = LocalDate.now().minusDays(i);
            Instant from = day.atStartOfDay(ZoneId.systemDefault()).toInstant();
            Instant to = from.plus(1, ChronoUnit.DAYS);

            List<Shipment> arriving = all.stream()
                    .filter(s -> s.getPredictedAt() != null
                            && !s.getPredictedAt().isBefore(from) && s.getPredictedAt().isBefore(to))
                    .toList();
            volume.add(DayVolume.inbound(from.toEpochMilli(), day.format(DAY_LABEL),
                    arriving.size(), arriving.stream().mapToInt(Shipment::getCartons).sum()));

            List<Shipment> gated = all.stream()
                    .filter(s -> s.getGateInAt() != null && s.getGateOutAt() != null
                            && !s.getGateInAt().isBefore(from) && s.getGateInAt().isBefore(to))
                    .toList();
            dwellByDay.add(new DwellPoint(from.toEpochMilli(), day.format(DAY_LABEL),
                    gated.isEmpty() ? null : (int) Math.round(gated.stream()
                            .mapToLong(s -> Duration.between(s.getGateInAt(), s.getGateOutAt()).toMinutes())
                            .average().orElse(0))));
        }

        // Bookings by weekday and hour — where the day is actually busy.
        String[] dayNames = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
        List<Appointment> booked = appointments.findByFcIdOrderByStartAsc(fcId);
        List<HeatCell> heatmap = new ArrayList<>();
        for (int d = 1; d <= 6; d++) {
            for (int h = 6; h <= 21; h++) {
                final int weekday = d;
                final int hour = h;
                long count = booked.stream().filter(a -> {
                    var local = a.getStart().atZone(ZoneId.systemDefault());
                    return local.getDayOfWeek().getValue() % 7 == weekday && local.getHour() == hour;
                }).count();
                heatmap.add(new HeatCell(dayNames[weekday], weekday, hour, (int) count));
            }
        }

        Map<String, Integer> byTitle = new LinkedHashMap<>();
        for (ReceivingException e : exceptions.findByFcIdOrderByRaisedAtDesc(fcId)) {
            byTitle.merge(e.getTitle(), 1, Integer::sum);
        }
        List<NamedCount> breakdown = byTitle.entrySet().stream()
                .map(e -> new NamedCount(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingInt(NamedCount::value).reversed())
                .toList();

        return new FcAnalytics(volume, heatmap, dwellByDay, breakdown);
    }

    private List<Shipment> scope(String vendorId) {
        return vendorId == null || vendorId.isBlank() || "all".equals(vendorId)
                ? shipments.findAllBy()
                : shipments.findByVendorId(vendorId);
    }

    private static int costOf(Shipment s) {
        return FIXED_COST + s.getDistanceKm() * COST_PER_KM;
    }

    // --- response shapes -------------------------------------------------

    public record VendorSummary(int activeShipments, int inTransit, int delayed, int deliveredToday,
                                int onTimePct, List<ShipmentDto> atRisk, int avgDelayMin,
                                int openDocIssues) {}

    /**
     * One day on a bar chart. Serves two of them, which is why it carries both
     * {@code shipments} (what the FC inbound chart plots) and the
     * delivered/onTime/late split (what the vendor chart stacks).
     *
     * <p>{@code shipments} is a real component, not a derived accessor: Jackson
     * serialises a record's components only, so an extra method would simply be
     * absent from the JSON and the chart would draw nothing.
     */
    public record DayVolume(long date, String label, int shipments, int delivered, int onTime,
                            int late, Integer onTimePct, int cartons) {

        /** Vendor view: the day's deliveries, split on-time against late. */
        static DayVolume delivered(long date, String label, int delivered, int onTime, Integer onTimePct) {
            return new DayVolume(date, label, delivered, delivered, onTime, delivered - onTime, onTimePct, 0);
        }

        /** FC view: consignments arriving, and how many cartons they carry. */
        static DayVolume inbound(long date, String label, int shipments, int cartons) {
            return new DayVolume(date, label, shipments, 0, 0, 0, null, cartons);
        }
    }

    public record TrendPoint(long date, String label, Integer onTimePct, int shipments,
                             Integer costPerShipment) {}

    public record ReasonCount(String reason, int count) {}

    public record LanePerformance(String lane, int shipments, int onTimePct, int avgDelayMin,
                                  int distanceKm, int avgCost) {}

    public record DwellByCentre(String fcId, String name, String city, int avgDwellMin, int shipments) {}

    public record DwellPoint(long date, String label, Integer avgDwellMin) {}

    public record Totals(int shipments, int delivered, int onTimePct, int avgCost, int avgDelayMin,
                         int totalCartons) {}

    public record VendorAnalytics(List<TrendPoint> trend, List<ReasonCount> reasons,
                                  List<LanePerformance> lanes, List<DwellByCentre> dwell, Totals totals) {}

    public record FcSummary(int inboundToday, int arrivingNext4h, int delayed, int atGate, int unloading,
                            int docksOccupied, int docksTotal, int openExceptions, int cartonsExpected) {}

    public record HeatCell(String day, int dayIndex, int hour, int value) {}

    public record NamedCount(String name, int value) {}

    public record FcAnalytics(List<DayVolume> volume, List<HeatCell> heatmap, List<DwellPoint> dwellByDay,
                              List<NamedCount> exceptionBreakdown) {}
}
