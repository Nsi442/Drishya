package com.drishya.backend.service;

import com.drishya.backend.domain.AppUser;
import com.drishya.backend.domain.enums.Role;
import com.drishya.backend.dto.AuthResponse;
import com.drishya.backend.dto.UserDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.repo.AppUserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sign-in, registration and the demo accounts.
 *
 * <p><b>On the token.</b> A real HS256 JWT, issued here and validated by Spring
 * Security's resource server on every request. It carries the user id as the
 * subject and the account's role in a {@code roles} claim, which is what makes
 * the per-role rules in {@code SecurityConfig} possible — the hand-rolled
 * {@code userId.expiry.hmac} string this replaced could identify a caller but
 * could not express what they were allowed to do, so any valid token reached
 * any endpoint.
 *
 * <p>Still deliberately short of a full identity provider: no refresh token and
 * no revocation list, so a stolen token is valid until it expires. Shortening
 * the lifetime is the only mitigation in place, and it is a real limitation
 * rather than an oversight.
 */
@Service
public class AuthService {

    /**
     * Twelve hours. Long enough for a working day, short enough that a leaked
     * token expires on its own — which matters more than usual here, because
     * there is no revocation list to cut one short.
     */
    private static final Duration TOKEN_TTL = Duration.ofHours(12);

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final Mapper mapper;
    private final JwtEncoder jwtEncoder;

    public AuthService(AppUserRepository users, PasswordEncoder passwordEncoder, Mapper mapper,
                       JwtEncoder jwtEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.mapper = mapper;
        this.jwtEncoder = jwtEncoder;
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
            default -> Role.VENDOR_ADMIN;
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

    /**
     * Issues an HS256 JWT for this account.
     *
     * <p>The role goes in as {@code roles}, matching the claim name and
     * {@code ROLE_} prefix the converter in SecurityConfig is configured to
     * read. Get either of those wrong and the token validates perfectly while
     * carrying no authorities, so every protected endpoint 403s and the token
     * looks fine under inspection.
     *
     * <p>The tenant is included as a convenience for reading a token by hand.
     * Nothing authorises against it: tenant scoping is enforced in the
     * repository layer from the account looked up per request, not from a claim
     * the client is holding.
     */
    private String issueToken(AppUser user) {
        Instant now = Instant.now();

        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer("drishya")
                .issuedAt(now)
                .expiresAt(now.plus(TOKEN_TTL))
                .subject(user.getId())
                .claim("roles", List.of(user.getRole().name()))
                .claim("name", user.getName());

        // Added only when there is one. JwtClaimsSet rejects a null value
        // outright, and DRIVER and FC accounts have no tenant by design — the
        // receiving desk sees inbound from every vendor booked into its site.
        // Passing null here failed both of those logins with "value cannot be
        // null", which names the symptom and not the cause.
        if (user.getTenant() != null) {
            claims.claim("tenant", user.getTenant().getId());
        }

        return jwtEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims.build())).getTokenValue();
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
