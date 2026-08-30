package com.drishya.backend.web;

import com.drishya.backend.dto.AppointmentDto;
import com.drishya.backend.dto.DockDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.service.AppointmentService;
import jakarta.validation.Valid;
import java.util.List;
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
public class AppointmentController {

    private final AppointmentService appointmentService;

    private final CallerService callers;

    public AppointmentController(AppointmentService appointmentService,
                              CallerService callers) {
        this.callers = callers;
        this.appointmentService = appointmentService;
    }

    @GetMapping("/appointments")
    public List<AppointmentDto> list(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestParam(required = false) String fcId,
                                     @RequestParam(required = false) String vendorId,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(required = false) Long from,
                                     @RequestParam(required = false) Long to) {
        return appointmentService.list(callers.resolve(userId), fcId, vendorId, status, from, to);
    }

    @GetMapping("/docks")
    public List<DockDto> docks(@RequestParam(required = false) String fcId) {
        return appointmentService.listDocks(fcId);
    }

    @PostMapping("/appointments")
    public AppointmentDto request(@Valid @RequestBody Requests.RequestAppointment request) {
        return appointmentService.request(request);
    }

    @PatchMapping("/appointments/{id}/reschedule")
    public AppointmentDto reschedule(@PathVariable String id,
                                     @Valid @RequestBody Requests.RescheduleAppointment request) {
        return appointmentService.reschedule(id, request);
    }

    @PatchMapping("/appointments/{id}/decision")
    public AppointmentDto decide(@PathVariable String id,
                                 @Valid @RequestBody Requests.DecideAppointment request) {
        return appointmentService.decide(id, request);
    }

    /**
     * Lets the booking form warn before submitting. Returns the clashing
     * appointment, or 200 with an empty body when the window is free.
     */
    @GetMapping("/appointments/conflict")
    public AppointmentDto conflict(@RequestParam String dockId,
                                   @RequestParam long start,
                                   @RequestParam(defaultValue = "60") int durationMin,
                                   @RequestParam(required = false) String ignoreId) {
        return appointmentService.checkConflict(dockId, start, durationMin, ignoreId);
    }
}
