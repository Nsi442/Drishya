package com.drishya.backend.web;

import com.drishya.backend.service.AnalyticsService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.service.CallerService;
import com.drishya.backend.service.ApiException;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final CallerService callers;

    private final AnalyticsService analytics;

    public AnalyticsController(AnalyticsService analytics, CallerService callers) {
        this.callers = callers;
        this.analytics = analytics;
    }

    @GetMapping("/vendor/summary")
    public AnalyticsService.VendorSummary vendorSummary(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestParam(required = false) String vendorId) {
        return analytics.vendorSummary(scopeVendor(userId, vendorId));
    }

    @GetMapping("/vendor/weekly")
    public List<AnalyticsService.DayVolume> weekly(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestParam(required = false) String vendorId) {
        return analytics.weeklyDeliveries(scopeVendor(userId, vendorId));
    }

    /** {@code from} and {@code to} are epoch millis, matching the date picker. */
    @GetMapping("/vendor")
    public AnalyticsService.VendorAnalytics vendorAnalytics(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestParam(required = false) Long from,
                                                            @RequestParam(required = false) Long to,
                                                            @RequestParam(required = false) String vendorId) {
        return analytics.vendorAnalytics(from, to, scopeVendor(userId, vendorId));
    }

    @GetMapping("/fc/{fcId}/summary")
    public AnalyticsService.FcSummary fcSummary(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @PathVariable String fcId) {
        return analytics.fcSummary(scopeFc(userId, fcId));
    }

    @GetMapping("/fc/{fcId}")
    public AnalyticsService.FcAnalytics fcAnalytics(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @PathVariable String fcId) {
        return analytics.fcAnalytics(scopeFc(userId, fcId));
    }

    /**
     * The vendor these figures may actually be computed over.
     *
     * <p><b>The requested vendorId is not trusted.</b> It arrives as a query
     * parameter, so honouring it let any vendor read a competitor's on-time
     * rate, document accuracy and rejection rate by changing one value in the
     * URL — and leaving it absent computed the figures across the whole
     * cluster, which is worse. For a vendor role the answer is always their own
     * tenant, whatever they asked for.
     *
     * <p>A fulfilment centre legitimately compares the vendors delivering into
     * its site, so its request is honoured. A driver has no business here at
     * all.
     */
    private String scopeVendor(String userId, String requested) {
        CallerService.Caller caller = callers.resolve(userId);
        return switch (caller.role()) {
            case VENDOR_ADMIN, DISPATCHER -> caller.tenantId();
            case FC -> requested;
            case DRIVER -> throw ApiException.forbidden(
                    "Vendor analytics are not available to a driver account.");
        };
    }

    /**
     * The fulfilment centre these figures may be computed over.
     *
     * <p>Same reasoning as scopeVendor, on the other axis. The fcId arrives in
     * the path, so honouring it let the desk at one site read another site's
     * throughput, dwell times and vendor mix by editing a path segment.
     *
     * <p>A vendor may legitimately look at a site it delivers into — its own
     * shipments are already scoped elsewhere, so this reveals nothing new.
     */
    private String scopeFc(String userId, String requested) {
        CallerService.Caller caller = callers.resolve(userId);
        return switch (caller.role()) {
            case FC -> {
                if (caller.orgId() == null) {
                    throw ApiException.forbidden("This account is not attached to a site.");
                }
                if (requested != null && !requested.isBlank() && !caller.orgId().equals(requested)) {
                    throw ApiException.notFound("No such fulfilment centre.");
                }
                yield caller.orgId();
            }
            case VENDOR_ADMIN, DISPATCHER -> requested;
            case DRIVER -> throw ApiException.forbidden(
                    "Site analytics are not available to a driver account.");
        };
    }
}
