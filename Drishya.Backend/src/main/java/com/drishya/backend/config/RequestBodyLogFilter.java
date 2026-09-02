package com.drishya.backend.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.PathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;

/**
 * Logs the JSON body of a few named write endpoints, so a form submitted in the
 * browser is visible in the deployment's log.
 *
 * <p>The booking form is the reason this exists. "The consignment reached the
 * platform" is otherwise only provable by reading the database, and an
 * {@code INSERT} statement in a Postgres log is not the payload the browser
 * sent — column order is Hibernate's, the generated ids and defaults are not in
 * the form, and the shape bears no resemblance to what a person filled in.
 *
 * <p><b>The allowlist is the security boundary, not a convenience.</b> A filter
 * that logs request bodies is one of the classic ways credentials end up in a
 * log aggregator, and this one runs on a deployment whose logs ship to
 * CloudWatch. Only the exact method-and-path pairs below are logged; everything
 * else passes through untouched and uncached. {@code /api/auth/**} carries
 * passwords in plain text on login, signup and reset, so it is additionally
 * refused outright — a second check that costs nothing and does not depend on
 * whoever edits the list next reading this paragraph.
 *
 * <p>Bodies are capped. A caller that posts ten megabytes should not be able to
 * write ten megabytes into the log, and past the cap the wrapper simply stops
 * caching, so the request itself still succeeds.
 */
@Component
// Outside AuthTokenFilter, which sits at LOWEST_PRECEDENCE, so by the time the
// chain returns and this logs, the authenticated user id is on the request.
@Order(Ordered.LOWEST_PRECEDENCE - 1)
public class RequestBodyLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestBodyLogFilter.class);

    /**
     * "METHOD pattern" pairs whose body is logged, matched with Spring's own
     * Ant path syntax so a single path variable is expressible.
     *
     * <p>Precise, never prefix-wide. {@code POST /api/shipments} is the booking
     * form and matches nothing beneath it, which keeps
     * {@code POST /api/shipments/{id}/pod} — a signature image — out of the log
     * without anyone having to remember to exclude it. A {@code startsWith}
     * match would pick up every sub-resource anyone adds under these paths
     * years from now.
     */
    private static final Set<String> LOGGED = Set.of(
            "POST /api/shipments",                        // the New shipment form
            "POST /api/v1/trips/from-shipment/*",         // dispatch
            "POST /api/v1/shipments/*/asn");              // advance shipping notice

    private static final PathMatcher MATCHER = new AntPathMatcher();

    /** Bytes of body kept. Past this the wrapper stops caching; the request is unaffected. */
    private static final int MAX_BODY_BYTES = 16 * 1024;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        if (!shouldLog(request)) {
            chain.doFilter(request, response);
            return;
        }

        ContentCachingRequestWrapper wrapped = new ContentCachingRequestWrapper(request, MAX_BODY_BYTES);
        try {
            chain.doFilter(wrapped, response);
        } finally {
            // In the finally, so a request that failed validation is logged too.
            // A 400 on the booking form is exactly the case where seeing what
            // the browser actually sent is worth most.
            record(wrapped, response);
        }
    }

    private boolean shouldLog(HttpServletRequest request) {
        String path = request.getRequestURI();

        // Never, regardless of the list above. Login, signup and password reset
        // all carry a plaintext password in the body.
        if (path.startsWith("/api/auth")) {
            return false;
        }
        String target = request.getMethod() + " " + stripTrailingSlash(path);
        for (String pattern : LOGGED) {
            if (MATCHER.match(pattern, target)) {
                return true;
            }
        }
        return false;
    }

    private static String stripTrailingSlash(String path) {
        return path.length() > 1 && path.endsWith("/")
                ? path.substring(0, path.length() - 1)
                : path;
    }

    private void record(ContentCachingRequestWrapper request, HttpServletResponse response) {
        byte[] body = request.getContentAsByteArray();
        if (body.length == 0) {
            return;
        }

        Object userId = request.getAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE);

        // One line, one log event. The browser sends compact JSON, so this stays
        // a single line in practice; a body that did contain newlines would
        // otherwise arrive in CloudWatch as several unrelated-looking events.
        String json = new String(body, StandardCharsets.UTF_8)
                .replace("\r", "")
                .replace("\n", " ");

        log.info("FORM-SUBMIT {} {} by={} status={} body={}",
                request.getMethod(),
                request.getRequestURI(),
                userId == null ? "anonymous" : userId,
                response.getStatus(),
                json);
    }
}
