package com.drishya.backend.web;

import com.drishya.backend.service.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The gate in front of the cross-tenant endpoints.
 *
 * <p>Everything under {@code /api/v1/internal} works across every tenant in the
 * cluster — training exports read all trips, the route backfill rewrites all
 * consignments — so none of it can be reached with a normal bearer token, which
 * is always scoped to exactly one. A separate service token stands in for the
 * tenancy check that cannot apply.
 *
 * <p><b>One implementation, deliberately.</b> The rule that makes this safe is
 * the blank-token rule below, and it is the kind of rule that gets weakened by
 * being restated: a second copy written from memory reads
 * {@code token.equals(presented)} and is open in every environment nobody set
 * the variable in. There is one copy so there is one thing to get right.
 */
@Component
public class InternalServiceToken {

    private final String configured;

    public InternalServiceToken(@Value("${drishya.internal.service-token:}") String configured) {
        this.configured = configured;
    }

    /**
     * Lets the caller through, or denies that the endpoint exists.
     *
     * <p>404 rather than 401: a 401 confirms there is something here worth
     * presenting a credential to, and these endpoints have no reason to
     * advertise themselves to anyone who has not already been told about them.
     */
    public void require(String presented) {
        // Unset means unavailable, not open. A blank configured token must never
        // be satisfiable by a blank header.
        if (configured.isBlank() || !configured.equals(presented)) {
            throw ApiException.notFound("No such endpoint.");
        }
    }
}
