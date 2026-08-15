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
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(
                        "http://localhost:5173",
                        "http://127.0.0.1:5173",
                        "http://localhost:4173")
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
