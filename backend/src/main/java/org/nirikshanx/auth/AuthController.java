package org.nirikshanx.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private static final String REFRESH_COOKIE = "nirikshanx_refresh";

    private final AuthService authService;
    private final AuthProperties properties;

    public AuthController(AuthService authService, AuthProperties properties) {
        this.authService = authService;
        this.properties = properties;
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest) {
        AuthService.LoginResult result = authService.login(request.email(), request.password(), client(servletRequest));
        if ("MFA_REQUIRED".equals(result.status())) {
            return ResponseEntity.ok(new LoginResponse(
                    result.status(),
                    null,
                    null,
                    null,
                    result.mfaChallengeToken(),
                    result.mfaChallengeExpiresInSeconds()));
        }
        return authenticatedResponse(result.session());
    }

    @PostMapping("/mfa/login/verify")
    public ResponseEntity<LoginResponse> verifyMfaLogin(
            @Valid @RequestBody MfaLoginRequest request,
            HttpServletRequest servletRequest) {
        return authenticatedResponse(authService.verifyMfaLogin(request.challengeToken(), request.code(), client(servletRequest)));
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(HttpServletRequest servletRequest) {
        AuthService.SessionBundle bundle = authService.refresh(refreshCookie(servletRequest), client(servletRequest));
        return authenticatedResponse(bundle);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal AuthPrincipal principal, HttpServletRequest request) {
        authService.logout(principal, client(request));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString()).build();
    }

    @PostMapping("/logout-all")
    public ResponseEntity<Void> logoutAll(@AuthenticationPrincipal AuthPrincipal principal, HttpServletRequest request) {
        authService.logoutAll(principal, client(request));
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString()).build();
    }

    @GetMapping("/me")
    public AuthService.UserView me(@AuthenticationPrincipal AuthPrincipal principal) {
        return authService.me(principal);
    }

    @GetMapping("/sessions")
    public List<AuthService.SessionView> sessions(@AuthenticationPrincipal AuthPrincipal principal) {
        return authService.listSessions(principal);
    }

    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Void> revokeSession(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID sessionId) {
        boolean revoked = authService.revokeSession(principal, sessionId);
        if (!revoked) {
            throw new ApiException(HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND", "Active session was not found.");
        }
        ResponseEntity.BodyBuilder response = ResponseEntity.noContent();
        if (sessionId.equals(principal.sessionId())) response.header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString());
        return response.build();
    }

    @PostMapping("/password/change")
    public ResponseEntity<Void> changePassword(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody PasswordChangeRequest request,
            HttpServletRequest servletRequest) {
        authService.changePassword(principal, request.currentPassword(), request.newPassword(), client(servletRequest));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/mfa/totp/enroll")
    public AuthService.TotpEnrollment enrollTotp(@AuthenticationPrincipal AuthPrincipal principal) {
        return authService.enrollTotp(principal);
    }

    @PostMapping("/mfa/totp/confirm")
    public ResponseEntity<Void> confirmTotp(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody TotpConfirmRequest request) {
        authService.confirmTotp(principal, request.code());
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<LoginResponse> authenticatedResponse(AuthService.SessionBundle bundle) {
        long expiresIn = Math.max(0, Duration.between(Instant.now(), bundle.accessTokenExpiresAt()).toSeconds());
        LoginResponse body = new LoginResponse(
                "AUTHENTICATED",
                bundle.accessToken(),
                expiresIn,
                bundle.user(),
                null,
                null);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshCookie(bundle.refreshToken(), bundle.sessionExpiresAt()).toString())
                .body(body);
    }

    private ResponseCookie refreshCookie(String value, Instant expiresAt) {
        Duration maxAge = Duration.between(Instant.now(), expiresAt);
        if (maxAge.isNegative()) maxAge = Duration.ZERO;
        return ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(properties.cookieSecure())
                .sameSite("Strict")
                .path("/")
                .maxAge(maxAge)
                .build();
    }

    private ResponseCookie clearRefreshCookie() {
        return ResponseCookie.from(REFRESH_COOKIE, "")
                .httpOnly(true)
                .secure(properties.cookieSecure())
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ZERO)
                .build();
    }

    private static String refreshCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie cookie : cookies) {
            if (REFRESH_COOKIE.equals(cookie.getName())) return cookie.getValue();
        }
        return null;
    }

    private static AuthService.ClientContext client(HttpServletRequest request) {
        return new AuthService.ClientContext(request.getRemoteAddr(), request.getHeader("User-Agent"));
    }

    public record LoginRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(max = 128) String password) {
    }

    public record MfaLoginRequest(
            @NotBlank @Size(max = 256) String challengeToken,
            @NotBlank @Size(min = 6, max = 6) String code) {
    }

    public record PasswordChangeRequest(
            @NotBlank @Size(max = 128) String currentPassword,
            @NotBlank @Size(max = 128) String newPassword) {
    }

    public record TotpConfirmRequest(@NotBlank @Size(min = 6, max = 6) String code) {
    }

    public record LoginResponse(
            String status,
            String accessToken,
            Long expiresInSeconds,
            AuthService.UserView user,
            String mfaChallengeToken,
            Long mfaChallengeExpiresInSeconds) {
    }
}
