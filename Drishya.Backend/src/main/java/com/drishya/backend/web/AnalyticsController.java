package com.drishya.backend.web;

import com.drishya.backend.service.AnalyticsService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService analytics;

    public AnalyticsController(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    @GetMapping("/vendor/summary")
    public AnalyticsService.VendorSummary vendorSummary(@RequestParam(required = false) String vendorId) {
        return analytics.vendorSummary(vendorId);
    }

    @GetMapping("/vendor/weekly")
    public List<AnalyticsService.DayVolume> weekly(@RequestParam(required = false) String vendorId) {
        return analytics.weeklyDeliveries(vendorId);
    }

    /** {@code from} and {@code to} are epoch millis, matching the date picker. */
    @GetMapping("/vendor")
    public AnalyticsService.VendorAnalytics vendorAnalytics(@RequestParam(required = false) Long from,
                                                            @RequestParam(required = false) Long to,
                                                            @RequestParam(required = false) String vendorId) {
        return analytics.vendorAnalytics(from, to, vendorId);
    }

    @GetMapping("/fc/{fcId}/summary")
    public AnalyticsService.FcSummary fcSummary(@PathVariable String fcId) {
        return analytics.fcSummary(fcId);
    }

    @GetMapping("/fc/{fcId}")
    public AnalyticsService.FcAnalytics fcAnalytics(@PathVariable String fcId) {
        return analytics.fcAnalytics(fcId);
    }
}
