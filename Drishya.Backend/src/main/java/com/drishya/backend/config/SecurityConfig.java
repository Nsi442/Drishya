package com.drishya.backend.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * Spring Security 7, configured for a stateless JWT REST API.
 *
 * <p><b>Every rule here is explicit, because Security 7 has no implicit
 * behaviour.</b> Put the starter on the classpath and declare nothing, and the
 * result is not "the previous behaviour plus security" — it is every endpoint
 * behind a generated password, form login, CSRF tokens on every write, and an
 * API that returns 401 to its own frontend. Unexplained 403s on endpoints that
 * worked yesterday are almost always something omitted from this class.
 *
 * <p>What replaced what: the old {@code AuthTokenFilter} verified a bespoke
 * {@code userId.expiry.hmac} string by hand. That was honest about being
 * local-development grade — no revocation, no scopes, and, most importantly,
 * <b>no per-role authorisation at all</b>: any valid token reached any endpoint,
 * so a driver's token could call a vendor endpoint. The role rules below are the
 * gap it left, now closed.
 *
 * <h2>Signing key</h2>
 *
 * <p>Read from configuration, falling back to a key generated at boot. The
 * fallback is deliberately noisy in the log: it means every restart invalidates
 * every session, which is the right trade on a laptop and completely wrong on a
 * platform that restarts on deploy and on idle wake. Render sets JWT_SECRET.
 */
@Configuration
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    /** HS256 needs at least 256 bits of key. */
    private static final int KEY_BYTES = 32;

    private final SecretKeySpec signingKey;

    public SecurityConfig(@Value("${drishya.security.jwt-secret:}") String configured) {
        this.signingKey = new SecretKeySpec(resolveKey(configured), "HmacSHA256");
    }

    private static byte[] resolveKey(String configured) {
        if (configured != null && configured.length() >= KEY_BYTES) {
            return configured.getBytes(StandardCharsets.UTF_8);
        }
        if (configured != null && !configured.isBlank()) {
            // A short secret is worse than none: it looks configured and is
            // trivially brute-forced. Refuse rather than silently pad it.
            throw new IllegalStateException(
                    "drishya.security.jwt-secret must be at least " + KEY_BYTES
                            + " characters. Generate one with: openssl rand -base64 48");
        }
        byte[] generated = new byte[KEY_BYTES];
        new SecureRandom().nextBytes(generated);
        log.warn("No JWT secret configured — generating one for this boot. Every restart will "
                + "sign users out. Set JWT_SECRET before deploying anywhere that restarts.");
        return generated;
    }

    @Bean
    public JwtEncoder jwtEncoder() {
        return new NimbusJwtEncoder(new ImmutableSecret<>(signingKey));
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        return NimbusJwtDecoder.withSecretKey(signingKey).build();
    }

    /**
     * Maps the {@code roles} claim onto Spring authorities.
     *
     * <p>The default converter reads {@code scope}/{@code scp} and prefixes
     * nothing, which silently yields an authenticated principal with no
     * authorities — so every {@code hasRole} check fails and every endpoint
     * 403s while the token itself is perfectly valid. Naming the claim and the
     * prefix is what makes the rules below actually fire.
     */
    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("roles");
        authorities.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);
        return converter;
    }

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            // Qualified by name: Spring MVC's own mvcHandlerMappingIntrospector
            // also implements CorsConfigurationSource, so an unqualified
            // injection is ambiguous and the context refuses to start.
            @org.springframework.beans.factory.annotation.Qualifier("corsConfigurationSource")
            CorsConfigurationSource corsSource,
            JwtAuthenticationConverter converter) throws Exception {
        http
                // CORS is configured in AppConfig and shared with this chain, so
                // preflight is answered before authentication rejects it.
                .cors(cors -> cors.configurationSource(corsSource))

                // No cookies, no sessions, so nothing for a cross-site request to
                // ride on. CSRF protection guards cookie-authenticated writes;
                // with a bearer token it only breaks legitimate clients.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                // Nothing to render a login form to.
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())

                .authorizeHttpRequests(auth -> auth
                        // Preflight carries no Authorization header by definition.
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

                        // You cannot present a token before you have one.
                        .requestMatchers(
                                "/api/auth/login",
                                "/api/auth/demo-login",
                                "/api/auth/signup",
                                "/api/auth/forgot-password",
                                "/api/auth/reset-password").permitAll()

                        // Liveness and readiness are polled by the platform,
                        // which has no credentials. Only these two — the rest of
                        // actuator stays shut.
                        .requestMatchers("/actuator/health/**", "/actuator/info").permitAll()

                        // The documentation is public; the endpoints it describes
                        // are not.
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**",
                                "/v3/api-docs", "/v3/api-docs/**").permitAll()

                        // Cross-tenant by nature, so it cannot be reached with a
                        // normal bearer token at all. The controller checks a
                        // separate service token and 404s without it.
                        .requestMatchers("/api/v1/internal/**").permitAll()

                        // --- role rules ---------------------------------------
                        // This is what the hand-rolled filter could not express.

                        // Booking, dispatching and paperwork are the vendor's.
                        // A driver's token reaching these was the concrete hole.
                        .requestMatchers(HttpMethod.POST, "/api/v1/shipments/*/asn",
                                "/api/v1/shipments/*/asn/check")
                        .hasAnyRole("VENDOR_ADMIN", "DISPATCHER")
                        .requestMatchers(HttpMethod.POST, "/api/v1/trips/from-shipment/**")
                        .hasAnyRole("VENDOR_ADMIN", "DISPATCHER")

                        // Receiving actions belong to the fulfilment centre desk.
                        .requestMatchers(HttpMethod.POST, "/api/fc/shipments/*/gate-in",
                                "/api/fc/shipments/*/gate-out", "/api/fc/shipments/*/grn")
                        .hasRole("FC")

                        // Everything else needs a valid token and nothing more.
                        .anyRequest().authenticated())

                .oauth2ResourceServer(oauth -> oauth
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(converter))
                        // The frontend shows `message` verbatim, so an expired
                        // token has to say so in words rather than as a bare 401.
                        .authenticationEntryPoint((request, response, ex) ->
                                writeError(response, HttpServletResponse.SC_UNAUTHORIZED,
                                        "UNAUTHENTICATED",
                                        "Your session has expired. Sign in again."))
                        .accessDeniedHandler((request, response, ex) ->
                                writeError(response, HttpServletResponse.SC_FORBIDDEN,
                                        "FORBIDDEN",
                                        "This account does not have access to that.")))

                .exceptionHandling(Customizer.withDefaults());

        return http.build();
    }

    /** Same error shape the rest of the API uses, so one client handler covers both. */
    private void writeError(HttpServletResponse response, int status, String code, String message)
            throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write(
                "{\"status\":%d,\"code\":\"%s\",\"message\":\"%s\"}".formatted(status, code, message));
    }

    /** For generating a secret to put in configuration. Not used at runtime. */
    public static String generateSecret() {
        byte[] bytes = new byte[48];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
