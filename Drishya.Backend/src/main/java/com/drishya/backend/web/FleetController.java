package com.drishya.backend.web;

import com.drishya.backend.dto.CarrierDto;
import com.drishya.backend.dto.DriverDto;
import com.drishya.backend.dto.FulfilmentCentreDto;
import com.drishya.backend.dto.IncidentDto;
import com.drishya.backend.dto.ShipmentDto;
import com.drishya.backend.dto.VehicleDto;
import com.drishya.backend.dto.VendorDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.service.FleetService;
import com.drishya.backend.service.ShipmentService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.service.CallerService;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;

/** Carriers, vehicles, drivers, vendors and the driver-app endpoints. */
@RestController
@RequestMapping("/api")
public class FleetController {

    private final CallerService callers;

    private final FleetService fleetService;
    private final ShipmentService shipmentService;

    public FleetController(FleetService fleetService, ShipmentService shipmentService, CallerService callers) {
        this.callers = callers;
        this.fleetService = fleetService;
        this.shipmentService = shipmentService;
    }

    @GetMapping("/carriers")
    public List<CarrierDto> carriers() {
        return fleetService.listCarriers();
    }

    @GetMapping("/vehicles")
    public List<VehicleDto> vehicles(@RequestParam(required = false) String search,
                                     @RequestParam(required = false) String deviceStatus,
                                     @RequestParam(required = false) String carrier) {
        return fleetService.listVehicles(search, deviceStatus, carrier);
    }

    @GetMapping("/drivers")
    public List<DriverDto> drivers(@RequestParam(required = false) String search,
                                   @RequestParam(required = false) String availability) {
        return fleetService.listDrivers(search, availability);
    }

    @PatchMapping("/drivers/{id}/availability")
    public DriverDto setAvailability(@PathVariable String id,
                                     @RequestBody Requests.SetAvailability request) {
        return fleetService.setAvailability(id, request.available());
    }

    /** Today's assigned work for one driver. */
    @GetMapping("/drivers/{id}/trips")
    public List<ShipmentDto> trips(@PathVariable String id) {
        return shipmentService.driverTrips(id);
    }

    @GetMapping("/drivers/{id}/history")
    public List<ShipmentDto> history(@PathVariable String id) {
        return shipmentService.driverHistory(id);
    }

    @GetMapping("/vendors")
    public List<VendorDto> vendors(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return fleetService.listVendorsFor(callers.resolve(userId));
    }

    @GetMapping("/fulfilment-centres")
    public List<FulfilmentCentreDto> centres() {
        return fleetService.listCentres();
    }

    @PostMapping("/incidents")
    public IncidentDto reportIncident(@Valid @RequestBody Requests.ReportIncident request) {
        return shipmentService.reportIncident(request);
    }
}
