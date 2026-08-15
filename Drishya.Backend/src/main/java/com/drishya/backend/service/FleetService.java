package com.drishya.backend.service;

import com.drishya.backend.domain.Driver;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.Vehicle;
import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.GrnDecision;
import com.drishya.backend.domain.enums.ShipmentStatus;
import com.drishya.backend.dto.CarrierDto;
import com.drishya.backend.dto.DriverDto;
import com.drishya.backend.dto.FulfilmentCentreDto;
import com.drishya.backend.dto.VehicleDto;
import com.drishya.backend.dto.VendorDto;
import com.drishya.backend.repo.CarrierRepository;
import com.drishya.backend.repo.DriverRepository;
import com.drishya.backend.repo.FulfilmentCentreRepository;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.VehicleRepository;
import com.drishya.backend.repo.VendorRepository;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Carriers, vehicles, drivers and vendors.
 *
 * <p>Every percentage here is computed from observed shipments rather than read
 * from a stored column. A scorecard that can drift from the shipments it claims
 * to summarise is worse than no scorecard.
 */
@Service
public class FleetService {

    private final CarrierRepository carriers;
    private final VehicleRepository vehicles;
    private final DriverRepository drivers;
    private final VendorRepository vendors;
    private final FulfilmentCentreRepository centres;
    private final ShipmentRepository shipments;
    private final Mapper mapper;

    public FleetService(CarrierRepository carriers, VehicleRepository vehicles, DriverRepository drivers,
                        VendorRepository vendors, FulfilmentCentreRepository centres,
                        ShipmentRepository shipments, Mapper mapper) {
        this.carriers = carriers;
        this.vehicles = vehicles;
        this.drivers = drivers;
        this.vendors = vendors;
        this.centres = centres;
        this.shipments = shipments;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public List<CarrierDto> listCarriers() {
        List<Shipment> all = shipments.findAllBy();

        return carriers.findAll().stream().map(carrier -> {
            List<Shipment> theirs = all.stream()
                    .filter(s -> s.getVehicle() != null && s.getVehicle().getCarrier() != null
                            && s.getVehicle().getCarrier().getId().equals(carrier.getId()))
                    .toList();
            List<Shipment> delivered = theirs.stream()
                    .filter(s -> s.getStatus() == ShipmentStatus.DELIVERED).toList();
            long onTime = delivered.stream().filter(s -> s.getDelayMin() <= 15).count();

            return mapper.toDto(carrier,
                    (int) vehicles.findByCarrierId(carrier.getId()).size(),
                    (int) theirs.stream().filter(Shipment::isActive).count(),
                    delivered.size(),
                    delivered.isEmpty() ? carrier.getOnTimePct()
                            : (int) Math.round(onTime * 100.0 / delivered.size()));
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<VehicleDto> listVehicles(String search, String deviceStatus, String carrier) {
        Map<String, Shipment> activeByVehicle = activeShipmentsBy(s ->
                s.getVehicle() == null ? null : s.getVehicle().getId());

        return vehicles.findAll().stream()
                .filter(v -> isAll(deviceStatus) || v.getDeviceStatus().wire().equals(deviceStatus))
                .filter(v -> isAll(carrier)
                        || (v.getCarrier() != null && v.getCarrier().getName().equals(carrier)))
                .filter(v -> search == null || search.isBlank()
                        || (v.getRegNumber() + " " + v.getType() + " "
                        + (v.getCarrier() == null ? "" : v.getCarrier().getName()))
                        .toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT)))
                .map(v -> mapper.toDto(v, activeByVehicle.get(v.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DriverDto> listDrivers(String search, String availability) {
        Map<String, Shipment> activeByDriver = activeShipmentsBy(s ->
                s.getDriver() == null ? null : s.getDriver().getId());

        return drivers.findAll().stream()
                .filter(d -> switch (availability == null ? "all" : availability) {
                    case "available" -> d.isAvailable();
                    case "unavailable" -> !d.isAvailable();
                    default -> true;
                })
                .filter(d -> search == null || search.isBlank()
                        || (d.getName() + " " + d.getPhone() + " "
                        + (d.getVehicle() == null ? "" : d.getVehicle().getRegNumber()))
                        .toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT)))
                .map(d -> mapper.toDto(d, activeByDriver.get(d.getId())))
                .toList();
    }

    @Transactional
    public DriverDto setAvailability(String driverId, boolean available) {
        Driver driver = drivers.findById(driverId)
                .orElseThrow(() -> ApiException.notFound("That driver is not on the roster."));
        driver.setAvailable(available);
        return mapper.toDto(drivers.save(driver), null);
    }

    /** Vendor scorecards, recomputed from shipments and their paperwork. */
    @Transactional(readOnly = true)
    public List<VendorDto> listVendors() {
        List<Shipment> all = shipments.findAllBy();

        return vendors.findAll().stream().map(vendor -> {
            List<Shipment> theirs = all.stream()
                    .filter(s -> s.getVendor() != null && s.getVendor().getId().equals(vendor.getId()))
                    .toList();
            List<Shipment> delivered = theirs.stream()
                    .filter(s -> s.getStatus() == ShipmentStatus.DELIVERED).toList();
            long onTime = delivered.stream().filter(s -> s.getDelayMin() <= 15).count();
            long rejected = delivered.stream()
                    .filter(s -> s.getGrn() != null && s.getGrn().getDecision() == GrnDecision.REJECTED)
                    .count();

            List<com.drishya.backend.domain.ShipmentDocument> documents = theirs.stream()
                    .flatMap(s -> s.getDocuments().stream()).toList();
            long valid = documents.stream().filter(d -> d.getStatus() == DocumentStatus.VALID).count();

            return mapper.toDto(vendor,
                    theirs.size(),
                    delivered.size(),
                    delivered.isEmpty() ? vendor.getOnTimePct()
                            : (int) Math.round(onTime * 100.0 / delivered.size()),
                    documents.isEmpty() ? vendor.getDocAccuracyPct()
                            : (int) Math.round(valid * 100.0 / documents.size()),
                    delivered.isEmpty() ? vendor.getRejectionRatePct()
                            : (int) Math.round(rejected * 100.0 / delivered.size()));
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<FulfilmentCentreDto> listCentres() {
        return centres.findAll().stream().map(mapper::toDto).toList();
    }

    /** One active shipment per vehicle or driver, keyed for quick lookup. */
    private Map<String, Shipment> activeShipmentsBy(Function<Shipment, String> keyFn) {
        return shipments.findAllBy().stream()
                .filter(Shipment::isActive)
                .filter(s -> keyFn.apply(s) != null)
                .collect(Collectors.toMap(keyFn, Function.identity(), (a, b) -> a));
    }

    private static boolean isAll(String value) {
        return value == null || value.isBlank() || "all".equals(value);
    }
}
