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

    // Every one of these four takes the caller now. They did not, while the two
    // GETs beside them always have — the same way round as the fault this
    // project has already hit once: reads scoped first, writes missed entirely.
    //
    // A bulk endpoint is still a write. Neither of the first two names an id in
    // its path, so they were invisible to a write-path audit that probed
    // /{id}/... routes only.

    @PostMapping("/alerts/read")
    public Map<String, Integer> markRead(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestBody Requests.MarkRead request) {
        return Map.of("updated", alertService.markRead(request.ids(), callers.resolve(userId)));
    }

    /**
     * The {@code fcId} parameter is gone rather than ignored: the scope comes
     * from the token, and leaving a parameter that no longer decides anything
     * invites the next caller to believe it does.
     */
    @PostMapping("/alerts/read-all")
    public Map<String, Integer> markAllRead(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId) {
        return Map.of("updated", alertService.markAllRead(callers.resolve(userId)));
    }

    @PostMapping("/alerts/{id}/acknowledge")
    public AlertDto acknowledge(@RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
                                @PathVariable String id) {
        return alertService.acknowledge(id, callers.resolve(userId));
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
    public ExceptionDto updateException(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @PathVariable String id,
            @RequestBody Requests.UpdateException request) {
        return alertService.updateException(id, request, callers.resolve(userId));
    }
}
