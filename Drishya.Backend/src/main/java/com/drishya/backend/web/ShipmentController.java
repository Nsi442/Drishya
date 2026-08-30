package com.drishya.backend.web;

import com.drishya.backend.dto.IncidentDto;
import com.drishya.backend.dto.PageDto;
import com.drishya.backend.dto.ShipmentDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.service.CallerService;
import org.springframework.web.bind.annotation.RequestAttribute;
import com.drishya.backend.service.ShipmentService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/shipments")
public class ShipmentController {

    private final ShipmentService shipmentService;

    private final CallerService callers;

    public ShipmentController(ShipmentService shipmentService, CallerService callers) {
        this.callers = callers;
        this.shipmentService = shipmentService;
    }

    /** Paged list for the tables. */
    @GetMapping
    public PageDto<ShipmentDto> list(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fcId,
            @RequestParam(required = false) String vendorId,
            @RequestParam(required = false) String carrier,
            @RequestParam(required = false) String lane,
            @RequestParam(required = false) Boolean delayedOnly,
            @RequestParam(required = false) String priority,
            @RequestParam(defaultValue = "promisedAt") String sort,
            @RequestParam(defaultValue = "asc") String direction,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "25") int pageSize) {

        var filter = new ShipmentService.ShipmentFilter(
                search, status, fcId, vendorId, carrier, lane, delayedOnly, priority);
        return shipmentService.list(callers.resolve(userId), filter, sort, direction, page, pageSize);
    }

    /** Unpaginated — the map, the control tower and the live tick all need the set. */
    @GetMapping("/all")
    public List<ShipmentDto> listAll(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String fcId,
            @RequestParam(required = false) String vendorId,
            @RequestParam(required = false) Boolean delayedOnly) {

        var filter = new ShipmentService.ShipmentFilter(
                search, status, fcId, vendorId, null, null, delayedOnly, null);
        return shipmentService.listAll(callers.resolve(userId), filter);
    }

    @GetMapping("/{id}")
    public ShipmentDto get(@PathVariable String id,
                           @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return shipmentService.get(id, callers.resolve(userId));
    }

    @PostMapping
    public ShipmentDto create(@Valid @RequestBody Requests.CreateShipment request) {
        return shipmentService.create(request);
    }

    @PostMapping("/{id}/advance")
    public ShipmentDto advance(@PathVariable String id,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            
                               @Valid @RequestBody Requests.AdvanceShipment request) {
        return shipmentService.advance(id, request, callers.resolve(userId));
    }

    @PostMapping("/{id}/pod")
    public ShipmentDto submitPod(@PathVariable String id,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @Valid @RequestBody Requests.SubmitPod request) {
        return shipmentService.submitPod(id, request, callers.resolve(userId));
    }

    @PostMapping("/{id}/checklist")
    public ShipmentDto saveChecklist(@PathVariable String id,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            
                                     @RequestBody Requests.SaveChecklist request) {
        return shipmentService.saveChecklist(id, request, callers.resolve(userId));
    }

    @PatchMapping("/{id}/dock")
    public ShipmentDto assignDock(@PathVariable String id,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @Valid @RequestBody Requests.AssignDock request) {
        return shipmentService.assignDock(id, request.dockId(), callers.resolve(userId));
    }

    @PostMapping("/{id}/cancel")
    public ShipmentDto cancel(@PathVariable String id,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestBody Requests.CancelShipment request) {
        return shipmentService.cancel(id, request.reason(), callers.resolve(userId));
    }

    /**
     * Positions from the browser's simulation loop. Batched deliberately: one
     * request per tick rather than one per moving vehicle.
     */
    @PostMapping("/live")
    public Map<String, Integer> commitLive(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestBody List<Requests.LivePosition> updates) {
        return Map.of("applied", shipmentService.commitLivePositions(updates, callers.resolve(userId)));
    }
}
