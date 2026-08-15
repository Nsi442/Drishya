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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AlertController {

    private final AlertService alertService;

    public AlertController(AlertService alertService) {
        this.alertService = alertService;
    }

    @GetMapping("/alerts")
    public List<AlertDto> alerts(@RequestParam(required = false) String severity,
                                 @RequestParam(required = false) String read,
                                 @RequestParam(required = false) String search,
                                 @RequestParam(required = false) String shipmentId) {
        return alertService.list(severity, read, search, shipmentId);
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
    public List<ExceptionDto> exceptions(@RequestParam(required = false) String fcId,
                                         @RequestParam(required = false) String status,
                                         @RequestParam(required = false) String type,
                                         @RequestParam(required = false) String search) {
        return alertService.listExceptions(fcId, status, type, search);
    }

    @PatchMapping("/exceptions/{id}")
    public ExceptionDto updateException(@PathVariable String id,
                                        @RequestBody Requests.UpdateException request) {
        return alertService.updateException(id, request);
    }
}
