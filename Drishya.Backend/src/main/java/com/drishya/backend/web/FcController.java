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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The receiving side: arrivals, the yard, goods receipts and the dock gantt. */
@RestController
@RequestMapping("/api/fc")
public class FcController {

    private final FcService fcService;

    public FcController(FcService fcService) {
        this.fcService = fcService;
    }

    @GetMapping("/{fcId}/arrivals")
    public List<ShipmentDto> arrivals(@PathVariable String fcId,
                                      @RequestParam(defaultValue = "today") String window,
                                      @RequestParam(required = false) String status,
                                      @RequestParam(required = false) String search) {
        return fcService.arrivals(fcId, window, status, search);
    }

    @GetMapping("/{fcId}/yard")
    public FcService.YardView yard(@PathVariable String fcId) {
        return fcService.yard(fcId);
    }

    @GetMapping("/{fcId}/receiving")
    public List<ShipmentDto> receiving(@PathVariable String fcId) {
        return fcService.receivingQueue(fcId);
    }

    @GetMapping("/{fcId}/dock-schedule")
    public FcService.DockSchedule dockSchedule(@PathVariable String fcId,
                                               @RequestParam(required = false) Long day) {
        return fcService.dockSchedule(fcId, day);
    }

    @PostMapping("/shipments/{id}/gate-in")
    public ShipmentDto gateIn(@PathVariable String id) {
        return fcService.gateIn(id);
    }

    @PostMapping("/shipments/{id}/gate-out")
    public ShipmentDto gateOut(@PathVariable String id) {
        return fcService.gateOut(id);
    }

    @PostMapping("/shipments/{id}/grn")
    public ShipmentDto submitGrn(@PathVariable String id, @Valid @RequestBody Requests.SubmitGrn request) {
        return fcService.submitGrn(id, request);
    }
}
