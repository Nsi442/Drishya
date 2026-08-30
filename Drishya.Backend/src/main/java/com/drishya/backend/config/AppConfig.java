package com.drishya.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Cross-cutting beans: password hashing and the browser's access to the API. */
@Configuration
public class AppConfig implements WebMvcConfigurer {

    /**
     * BCrypt, not a bare hash. Passwords are never stored or logged in the
     * clear, and never appear in a response — see {@code UserDto}, which has no
     * password field at all.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * The Vite dev server runs on a different origin, so the browser needs
     * explicit permission to call this API.
     *
     * <p>Origins are listed rather than wildcarded: {@code *} would forbid
     * credentialed requests anyway, and an allow-list is the right default even
     * for something only ever run locally. Add your deployed origin here.
     */
    /**
     * Extra origins allowed to call this API, comma separated.
     *
     * <p>In development the Vite proxy keeps the browser on one origin and CORS
     * never comes into it. Deployed, that is no longer true: the frontend is on
     * Vercel and the API is on Render, so every call is genuinely cross-origin
     * and this is the first thing that breaks. Set CORS_ALLOWED_ORIGINS to the
     * Vercel URL — including preview deployments, which get their own
     * hostnames.
     */
    @org.springframework.beans.factory.annotation.Value("${drishya.cors.allowed-origins:}")
    private String extraOrigins;

    /**
     * The same allow-list, as a bean Spring Security can read.
     *
     * <p>Declared separately from the MVC mapping below because the security
     * filter chain runs before MVC and needs its own source — without this,
     * preflight is rejected by authentication before the CORS mapping is ever
     * consulted, and the deployed frontend fails with an opaque CORS error that
     * looks like a browser problem rather than a server one.
     */
    @Bean
    public org.springframework.web.cors.CorsConfigurationSource corsConfigurationSource() {
        org.springframework.web.cors.CorsConfiguration config =
                new org.springframework.web.cors.CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins());
        config.setAllowedMethods(java.util.List.of(
                "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(java.util.List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        org.springframework.web.cors.UrlBasedCorsConfigurationSource source =
                new org.springframework.web.cors.UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    /** One list, read by both the security chain and the MVC mapping. */
    private java.util.List<String> allowedOrigins() {
        java.util.List<String> origins = new java.util.ArrayList<>(java.util.List.of(
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:4173"));
        if (extraOrigins != null && !extraOrigins.isBlank()) {
            java.util.Arrays.stream(extraOrigins.split(","))
                    .map(String::trim)
                    .filter(o -> !o.isEmpty())
                    .forEach(origins::add);
        }
        return origins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
