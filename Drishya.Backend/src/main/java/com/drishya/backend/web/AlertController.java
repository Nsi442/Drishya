package com.drishya.backend.web;

import com.drishya.backend.dto.AlertDto;
import com.drishya.backend.dto.ExceptionDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.service.AlertService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.service.CallerService;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AlertController {

    private final AlertService alertService;
    private final CallerService callers;

    public AlertController(AlertService alertService,
                           CallerService callers) {
        this.callers = callers;
        this.alertService = alertService;
    }

    @GetMapping("/alerts")
    public List<AlertDto> alerts(
            @org.springframework.web.bind.annotation.RequestAttribute(
                    com.drishya.backend.config.AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestParam(required = false) String severity,
                                 @RequestParam(required = false) String read,
                                 @RequestParam(required = false) String search,
                                 @RequestParam(required = false) String shipmentId) {
        // Scoped to the caller. The unscoped listing this replaced handed every
        // authenticated user the whole cluster's alert feed.
        return alertService.listFor(callers.resolve(userId), severity, read, search, shipmentId);
    }

    @PostMapping("/alerts/read")
    public Map<String, Integer> markRead(@RequestBody Requests.MarkRead request) {
        return Map.of("updated", alertService.markRead(request.ids()));
    }

    @PostMapping("/alerts/read-all")
    public Map<String, Integer> markAllRead(@RequestParam(required = false) String fcId) {
        return Map.of("updated", alertService.markAllRead(fcId));
    }

    @PostMapping("/alerts/{id}/acknowledge")
    public AlertDto acknowledge(@PathVariable String id,
                                @RequestBody Requests.AcknowledgeAlert request) {
        return alertService.acknowledge(id, request.by());
    }

    @GetMapping("/exceptions")
    public List<ExceptionDto> exceptions(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestParam(required = false) String fcId,
                                         @RequestParam(required = false) String status,
                                         @RequestParam(required = false) String type,
                                         @RequestParam(required = false) String search) {
        return alertService.listExceptions(callers.resolve(userId), fcId, status, type, search);
    }

    @PatchMapping("/exceptions/{id}")
    public ExceptionDto updateException(@PathVariable String id,
                                        @RequestBody Requests.UpdateException request) {
        return alertService.updateException(id, request);
    }
}
