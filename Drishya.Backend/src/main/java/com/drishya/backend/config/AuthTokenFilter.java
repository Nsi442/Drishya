package com.drishya.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Copies the authenticated user id from the JWT onto the request.
 *
 * <p><b>This used to be the authentication.</b> It verified a bespoke
 * {@code userId.expiry.hmac} string by hand, rejected anything malformed, and
 * was candid in its own comments about what it did not do — no revocation, no
 * scopes, and no per-role authorisation whatsoever, so a driver's token reached
 * every vendor endpoint. Spring Security 7 and a real JWT now do all of that,
 * declared explicitly in {@link SecurityConfig}.
 *
 * <p>What is left is a bridge. Around forty controller methods read the calling
 * user through {@code @RequestAttribute(USER_ID_ATTRIBUTE)}, and rewriting every
 * one of them to take an {@code @AuthenticationPrincipal Jwt} would be a large
 * diff whose only effect is to change how the same string is fetched. Keeping
 * the attribute means the security rebuild touched the security layer and
 * nothing else.
 *
 * <p>It authenticates nothing and rejects nothing. By the time it runs, the
 * resource server has already validated the signature and expiry, or the
 * request never reached here.
 */
@Component
@Order(Integer.MAX_VALUE)
public class AuthTokenFilter extends OncePerRequestFilter {

    /** The authenticated user id, for controllers that need to know who called. */
    public static final String USER_ID_ATTRIBUTE = "drishya.userId";

    /** Roles, for the few places that branch on them below the web layer. */
    public static final String ROLES_ATTRIBUTE = "drishya.roles";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();

        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            // The subject is the user id, set when the token was issued.
            request.setAttribute(USER_ID_ATTRIBUTE, jwt.getSubject());
            request.setAttribute(ROLES_ATTRIBUTE, jwt.getClaimAsStringList("roles"));
        }

        chain.doFilter(request, response);
    }
}
