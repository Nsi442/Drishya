package com.drishya.backend.web;

import com.drishya.backend.dto.ShipmentDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.service.FcService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.service.CallerService;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The receiving side: arrivals, the yard, goods receipts and the dock gantt. */
@RestController
@RequestMapping("/api/fc")
public class FcController {

    private final FcService fcService;

    private final CallerService callers;

    public FcController(FcService fcService, CallerService callers) {
        this.callers = callers;
        this.fcService = fcService;
    }

    @GetMapping("/{fcId}/arrivals")
    public List<ShipmentDto> arrivals(@RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
                                      @PathVariable String fcId,
                                      @RequestParam(defaultValue = "today") String window,
                                      @RequestParam(required = false) String status,
                                      @RequestParam(required = false) String search) {
        return fcService.arrivals(callers.resolve(userId), fcId, window, status, search);
    }

    @GetMapping("/{fcId}/yard")
    public FcService.YardView yard(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @PathVariable String fcId) {
        return fcService.yard(callers.resolve(userId), fcId);
    }

    @GetMapping("/{fcId}/receiving")
    public List<ShipmentDto> receiving(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @PathVariable String fcId) {
        return fcService.receivingQueue(callers.resolve(userId), fcId);
    }

    @GetMapping("/{fcId}/dock-schedule")
    public FcService.DockSchedule dockSchedule(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @PathVariable String fcId,
                                               @RequestParam(required = false) Long day) {
        return fcService.dockSchedule(callers.resolve(userId), fcId, day);
    }

    @PostMapping("/shipments/{id}/gate-in")
    public ShipmentDto gateIn(@PathVariable String id,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return fcService.gateIn(id, callers.resolve(userId));
    }

    @PostMapping("/shipments/{id}/gate-out")
    public ShipmentDto gateOut(@PathVariable String id,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return fcService.gateOut(id, callers.resolve(userId));
    }

    @PostMapping("/shipments/{id}/grn")
    public ShipmentDto submitGrn(@PathVariable String id,
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @Valid @RequestBody Requests.SubmitGrn request) {
        return fcService.submitGrn(id, request, callers.resolve(userId));
    }
}
