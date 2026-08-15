package com.drishya.backend.web;

import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.dto.AuthResponse;
import com.drishya.backend.dto.UserDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody Requests.Login request) {
        return authService.login(request);
    }

    @PostMapping("/demo-login")
    public AuthResponse demoLogin(@Valid @RequestBody Requests.DemoLogin request) {
        return authService.demoLogin(request.role());
    }

    @PostMapping("/signup")
    public AuthResponse signup(@Valid @RequestBody Requests.Signup request) {
        return authService.signup(request);
    }

    /**
     * Always reports success, whether or not the address is on file — telling a
     * caller which addresses exist is a free user-enumeration oracle.
     *
     * <p>No mail is actually sent in this build.
     */
    @PostMapping("/forgot-password")
    public Map<String, Object> forgotPassword(@Valid @RequestBody Requests.PasswordResetRequest request) {
        return Map.of("sent", true, "email", request.email());
    }

    @PostMapping("/reset-password")
    public Map<String, Object> resetPassword(@Valid @RequestBody Requests.PasswordReset request) {
        return Map.of("reset", true);
    }

    /** Requires a token; the filter has already resolved who is calling. */
    @PatchMapping("/profile")
    public UserDto updateProfile(HttpServletRequest http, @RequestBody Requests.ProfileUpdate request) {
        String userId = (String) http.getAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE);
        return authService.updateProfile(userId, request);
    }
}
