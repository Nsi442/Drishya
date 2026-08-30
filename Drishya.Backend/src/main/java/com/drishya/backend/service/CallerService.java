package com.drishya.backend.service;

import com.drishya.backend.domain.AppUser;
import com.drishya.backend.domain.enums.Role;
import com.drishya.backend.repo.AppUserRepository;
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

    public CallerService(AppUserRepository users) {
        this.users = users;
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
