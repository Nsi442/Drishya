package com.drishya.backend.service;

import com.drishya.backend.domain.AppUser;
import com.drishya.backend.domain.enums.Role;
import com.drishya.backend.dto.AuthResponse;
import com.drishya.backend.dto.UserDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.repo.AppUserRepository;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sign-in, registration and the demo accounts.
 *
 * <p><b>On the token.</b> This issues a signed, stateless token of the form
 * {@code userId.expiry.hmac}. It is enough to identify a caller and to stop a
 * token being forged or edited, and it is verified on every request by
 * {@link com.drishya.backend.config.AuthTokenFilter}. It is deliberately not a
 * full OAuth2/JWT setup: there is no refresh, no revocation list and no scope
 * checking. For anything beyond local development, replace this with Spring
 * Security proper — the seam is the filter, not this class.
 */
@Service
public class AuthService {

    private static final long TOKEN_TTL_MS = 12 * 60 * 60 * 1000L;

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final Mapper mapper;

    /**
     * Regenerated on every boot, so restarting the server invalidates old
     * tokens. That is the right trade for a dev server; a deployed one would
     * read this from configuration instead.
     */
    private final byte[] signingKey = new byte[32];

    public AuthService(AppUserRepository users, PasswordEncoder passwordEncoder, Mapper mapper) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.mapper = mapper;
        new SecureRandom().nextBytes(signingKey);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(Requests.Login request) {
        AppUser user = users.findByEmailIgnoreCase(request.email().trim())
                .orElseThrow(() -> ApiException.unauthorized(
                        "That email and password combination is not recognised."));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            // Same message as an unknown address: saying which half was wrong
            // tells an attacker which addresses exist.
            throw ApiException.unauthorized("That email and password combination is not recognised.");
        }
        return mapper.toAuthResponse(user, issueToken(user));
    }

    /** Backs the three one-click buttons on the login screen. */
    @Transactional(readOnly = true)
    public AuthResponse demoLogin(Role role) {
        AppUser user = users.findFirstByRole(role)
                .orElseThrow(() -> ApiException.notFound("No demo account exists for that role."));
        return mapper.toAuthResponse(user, issueToken(user));
    }

    @Transactional
    public AuthResponse signup(Requests.Signup request) {
        if (users.existsByEmailIgnoreCase(request.email())) {
            throw ApiException.conflict("An account already exists for that email address.");
        }

        Role role = switch (request.orgType()) {
            case "fulfilment_centre" -> Role.FC;
            case "carrier" -> Role.DRIVER;
            default -> Role.VENDOR;
        };

        AppUser user = new AppUser();
        user.setId("user-" + (users.count() + 1));
        user.setEmail(request.email().trim().toLowerCase(Locale.ROOT));
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setName(request.name());
        user.setRole(role);
        user.setTitle(request.title() == null || request.title().isBlank() ? "Member" : request.title());
        user.setOrgId("org-" + (users.count() + 1));
        user.setOrgName(request.orgName());
        user.setPhone(request.phone());
        user.setInitials(initialsOf(request.name()));
        user.setLanguage("en");

        AppUser saved = users.save(user);
        return mapper.toAuthResponse(saved, issueToken(saved));
    }

    @Transactional
    public UserDto updateProfile(String userId, Requests.ProfileUpdate request) {
        AppUser user = users.findById(userId)
                .orElseThrow(() -> ApiException.notFound("That account no longer exists."));

        if (request.name() != null && !request.name().isBlank()) {
            user.setName(request.name());
            user.setInitials(initialsOf(request.name()));
        }
        if (request.email() != null && !request.email().isBlank()) {
            user.setEmail(request.email().trim());
        }
        if (request.phone() != null) {
            user.setPhone(request.phone());
        }
        if (request.title() != null) {
            user.setTitle(request.title());
        }
        if (request.orgName() != null && !request.orgName().isBlank()) {
            user.setOrgName(request.orgName());
        }
        return mapper.toDto(users.save(user));
    }

    // --- tokens ----------------------------------------------------------

    private String issueToken(AppUser user) {
        long expiry = System.currentTimeMillis() + TOKEN_TTL_MS;
        String payload = user.getId() + "." + expiry;
        return payload + "." + sign(payload);
    }

    /**
     * @return the user id the token belongs to, or null if it is malformed,
     *     expired or the signature does not check out.
     */
    public String verifyToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }
        String payload = parts[0] + "." + parts[1];
        if (!constantTimeEquals(sign(payload), parts[2])) {
            return null;
        }
        try {
            if (Long.parseLong(parts[1]) < System.currentTimeMillis()) {
                return null;
            }
        } catch (NumberFormatException e) {
            return null;
        }
        return parts[0];
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Could not sign the token", e);
        }
    }

    /** Compares without leaking where two signatures first differ. */
    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) {
            return false;
        }
        int diff = 0;
        for (int i = 0; i < a.length(); i++) {
            diff |= a.charAt(i) ^ b.charAt(i);
        }
        return diff == 0;
    }

    private String initialsOf(String name) {
        String[] parts = name.trim().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < Math.min(2, parts.length); i++) {
            if (!parts[i].isEmpty()) {
                sb.append(Character.toUpperCase(parts[i].charAt(0)));
            }
        }
        return sb.toString();
    }
}
