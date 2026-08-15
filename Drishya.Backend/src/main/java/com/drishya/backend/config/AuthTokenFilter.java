package com.drishya.backend.config;

import com.drishya.backend.service.AuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rejects unauthenticated calls to {@code /api/**}.
 *
 * <p>Open by design: {@code /api/auth/**} (you cannot present a token before you
 * have one), preflight {@code OPTIONS} (the browser sends no auth header on
 * those), and the H2 console.
 *
 * <p><b>What this is not.</b> There is no per-role authorisation here — any
 * valid token reaches any endpoint, so a driver's token could call a vendor
 * endpoint. The frontend enforces role separation in its router, which is fine
 * for a demo and is not a security boundary. Closing that gap means Spring
 * Security with method-level checks, and this filter is the seam where it goes.
 */
@Component
@Order(1)
public class AuthTokenFilter extends OncePerRequestFilter {

    private final AuthService authService;

    public AuthTokenFilter(AuthService authService) {
        this.authService = authService;
    }

    /** The authenticated user id, for controllers that need to know who called. */
    public static final String USER_ID_ATTRIBUTE = "drishya.userId";

    /**
     * Named individually rather than exempting all of {@code /api/auth/**}:
     * that broader rule would also have opened the profile endpoint, which
     * needs to know who is calling.
     */
    private static final java.util.Set<String> PUBLIC_PATHS = java.util.Set.of(
            "/api/auth/login",
            "/api/auth/demo-login",
            "/api/auth/signup",
            "/api/auth/forgot-password",
            "/api/auth/reset-password");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.startsWith("/api/")
                || PUBLIC_PATHS.contains(path)
                || "OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        String token = header != null && header.startsWith("Bearer ") ? header.substring(7) : null;
        String userId = authService.verifyToken(token);

        if (userId == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("""
                    {"status":401,"code":"UNAUTHENTICATED","message":"Your session has expired. Sign in again."}""");
            return;
        }

        request.setAttribute(USER_ID_ATTRIBUTE, userId);
        chain.doFilter(request, response);
    }
}
