package com.drishya.backend.service;

import com.drishya.backend.domain.AppUser;
import com.drishya.backend.domain.enums.Role;
import com.drishya.backend.repo.AppUserRepository;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.TripRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resolves the authenticated user id that the auth filter put on the request
 * into the tenant every repository call needs.
 *
 * <p><b>Fails closed.</b> A VENDOR_ADMIN or DISPATCHER with no tenant is a
 * broken account, and the safe reading of a broken account is that it can see
 * nothing — not that it can see everything. Returning null or an empty string
 * here would turn a data error into a cross-tenant leak, because a query
 * filtered on a null tenant silently matches whatever the database decides.
 */
@Service
public class CallerService {

    private final AppUserRepository users;
    private final ShipmentRepository shipments;
    private final TripRepository trips;

    public CallerService(AppUserRepository users, ShipmentRepository shipments, TripRepository trips) {
        this.users = users;
        this.shipments = shipments;
        this.trips = trips;
    }

    /** The caller, or 401 if the token pointed at an account that is gone. */
    @Transactional(readOnly = true)
    public Caller resolve(String userId) {
        AppUser user = users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Your session is no longer valid."));

        String tenantId = user.getTenant() == null ? null : user.getTenant().getId();
        return new Caller(user.getId(), user.getRole(), tenantId, user.getOrgId(),
                user.getDriverId(), user.getName());
    }

    /**
     * The tenant this caller is bounded by, for the endpoints that require one.
     *
     * @throws ApiException 403 if the role has no tenant. A driver or an FC user
     *     calling a tenant-scoped endpoint is a routing mistake, not a data
     *     question, and answering it with somebody's shipments would be worse
     *     than refusing.
     */
    @Transactional(readOnly = true)
    public String requireTenant(String userId) {
        Caller caller = resolve(userId);
        if (caller.tenantId() == null) {
            throw ApiException.forbidden("This account is not attached to a vendor organisation.");
        }
        return caller.tenantId();
    }

    /**
     * The tenant to scope a trip endpoint by, for a caller acting on ONE
     * consignment.
     *
     * <p><b>Why this exists.</b> Every /api/v1/trips route scopes by tenant,
     * and a DRIVER has none — deliberately, since a driver is bounded by the
     * vehicle they drive rather than by an organisation. So requireTenant
     * refuses them, which was right while only a vendor could start a trip.
     *
     * <p>Starting the journey is the driver's now, and moving the control
     * without moving this left the driver refused one layer below the filter
     * chain: the security rule let them through and the controller answered
     * 403 "not attached to a vendor organisation". The trip launcher could not
     * even read the trip's state, so the simulation never started and nothing
     * on the screen said why.
     *
     * <p>The tenant is DERIVED rather than the scoping relaxed. Every query
     * underneath stays tenant-scoped exactly as it was; a driver simply gets
     * the tenant of the consignment they are carrying, and only after the
     * consignment is shown to be theirs. A driver who names someone else's
     * consignment gets the same 403 as before.
     */
    @Transactional(readOnly = true)
    public String tenantForShipment(String userId, String shipmentId) {
        Caller caller = resolve(userId);
        if (caller.tenantId() != null) {
            return caller.tenantId();
        }
        if (caller.role() == Role.DRIVER && caller.driverId() != null) {
            String tenant = shipments.findById(shipmentId)
                    .filter(s -> s.getDriver() != null
                            && caller.driverId().equals(s.getDriver().getId()))
                    .map(s -> s.getVendor() == null ? null : s.getVendor().getId())
                    .orElse(null);
            if (tenant != null) {
                return tenant;
            }
        }
        throw ApiException.forbidden("This account is not attached to a vendor organisation.");
    }

    /** The same, for a route that names a trip rather than a consignment. */
    @Transactional(readOnly = true)
    public String tenantForTrip(String userId, String tripId) {
        Caller caller = resolve(userId);
        if (caller.tenantId() != null) {
            return caller.tenantId();
        }
        if (caller.role() == Role.DRIVER && caller.driverId() != null) {
            String tenant = trips.findById(tripId)
                    .filter(t -> t.getDriver() != null
                            && caller.driverId().equals(t.getDriver().getId()))
                    .map(t -> t.getTenant() == null ? null : t.getTenant().getId())
                    .orElse(null);
            if (tenant != null) {
                return tenant;
            }
        }
        throw ApiException.forbidden("This account is not attached to a vendor organisation.");
    }

    /**
     * Who is calling.
     *
     * @param tenantId null for DRIVER and FC, which are deliberately not
     *     tenant-scoped. See {@link Role} for why the receiving desk has to see
     *     across tenants and a vendor never may.
     * @param driverId the driver record this account drives as, or null. Set for
     *     DRIVER accounts only, and deliberately distinct from userId: shipments
     *     reference a driver row ("driver-1"), not the login ("user-driver-1"),
     *     so scoping a driver's data on the wrong one silently matches nothing.
     */
    public record Caller(String userId, Role role, String tenantId, String orgId,
                         String driverId, String name) {

        public boolean isTenantScoped() {
            return role != null && role.isTenantScoped();
        }
    }
}
