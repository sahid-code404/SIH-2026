package org.nirikshanx.auth;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.OptionalLong;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final AuthRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final TokenService tokenService;
    private final JwtService jwtService;
    private final TotpService totpService;
    private final AuthProperties properties;
    private final String dummyPasswordHash;

    public AuthService(
            AuthRepository repository,
            PasswordEncoder passwordEncoder,
            PasswordPolicy passwordPolicy,
            TokenService tokenService,
            JwtService jwtService,
            TotpService totpService,
            AuthProperties properties) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.tokenService = tokenService;
        this.jwtService = jwtService;
        this.totpService = totpService;
        this.properties = properties;
        this.dummyPasswordHash = passwordEncoder.encode(tokenService.randomToken());

        if (properties.sessionTtl() == null || properties.sessionTtl().isZero() || properties.sessionTtl().isNegative()) {
            throw new IllegalStateException("Session TTL must be positive");
        }
        if (properties.mfaChallengeTtl() == null || properties.mfaChallengeTtl().isZero() || properties.mfaChallengeTtl().isNegative()) {
            throw new IllegalStateException("MFA challenge TTL must be positive");
        }
        if (properties.loginWindow() == null || properties.loginWindow().isZero() || properties.loginWindow().isNegative()) {
            throw new IllegalStateException("Login rate-limit window must be positive");
        }
        if (properties.loginMaxFailures() < 1) {
            throw new IllegalStateException("Login max failures must be at least one");
        }
    }

    @Transactional
    public LoginResult login(String emailInput, String password, ClientContext client) {
        Instant now = Instant.now();
        String email = normalizeEmail(emailInput);
        String subjectHash = tokenService.sha256Hex(email);
        ClientAudit audit = audit(client);

        long recentFailures = repository.countRecentLoginFailures(subjectHash, now.minus(properties.loginWindow()));
        if (recentFailures >= properties.loginMaxFailures()) {
            repository.insertAuthenticationEvent(null, subjectHash, "RATE_LIMITED", "TOO_MANY_RECENT_FAILURES",
                    audit.ipHash(), audit.userAgent(), now);
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "LOGIN_RATE_LIMITED", "Too many failed login attempts. Try again later.");
        }

        AuthRepository.UserRow user = repository.findUserByEmail(email).orElse(null);
        String hashToCheck = user == null ? dummyPasswordHash : user.passwordHash();
        boolean passwordMatches = password != null && passwordEncoder.matches(password, hashToCheck);
        boolean active = user != null && "ACTIVE".equals(user.status());

        if (!passwordMatches || !active) {
            String reason = user == null ? "UNKNOWN_ACCOUNT" : (!active ? "ACCOUNT_NOT_ACTIVE" : "INVALID_PASSWORD");
            repository.insertAuthenticationEvent(user == null ? null : user.id(), subjectHash, "LOGIN_FAILED", reason,
                    audit.ipHash(), audit.userAgent(), now);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Unable to authenticate with the supplied credentials.");
        }

        AuthRepository.TotpRow totp = repository.findTotp(user.id()).orElse(null);
        if (totp != null && totp.enabledAt() != null) {
            String rawChallenge = tokenService.randomToken();
            repository.insertMfaChallenge(new AuthRepository.MfaChallengeRow(
                    UUID.randomUUID(),
                    user.id(),
                    tokenService.sha256Hex(rawChallenge),
                    now.plus(properties.mfaChallengeTtl()),
                    null,
                    audit.ipHash(),
                    audit.userAgent(),
                    now));
            return LoginResult.mfaRequired(rawChallenge, properties.mfaChallengeTtl().toSeconds());
        }

        return LoginResult.authenticated(createSession(user, client, now, true));
    }

    @Transactional
    public SessionBundle verifyMfaLogin(String challengeToken, String code, ClientContext client) {
        Instant now = Instant.now();
        if (challengeToken == null || challengeToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_MFA_CHALLENGE", "MFA challenge is invalid or expired.");
        }

        AuthRepository.MfaChallengeRow challenge = repository
                .findMfaChallengeForUpdate(tokenService.sha256Hex(challengeToken))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_MFA_CHALLENGE", "MFA challenge is invalid or expired."));

        if (challenge.consumedAt() != null || !challenge.expiresAt().isAfter(now)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_MFA_CHALLENGE", "MFA challenge is invalid or expired.");
        }

        AuthRepository.UserRow user = repository.findUserById(challenge.userId())
                .filter(candidate -> "ACTIVE".equals(candidate.status()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_MFA_CHALLENGE", "MFA challenge is invalid or expired."));

        AuthRepository.TotpRow totp = repository.findTotpForUpdate(user.id())
                .filter(candidate -> candidate.enabledAt() != null)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_MFA_CHALLENGE", "MFA challenge is invalid or expired."));

        OptionalLong counter = totpService.verifyEncrypted(totp.encryptedSecret(), code, totp.lastCounter());
        if (counter.isEmpty()) {
            ClientAudit audit = audit(client);
            repository.insertAuthenticationEvent(user.id(), tokenService.sha256Hex(user.email()), "MFA_FAILED", "INVALID_OR_REPLAYED_TOTP",
                    audit.ipHash(), audit.userAgent(), now);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_MFA_CODE", "The verification code is invalid or has already been used.");
        }

        repository.updateTotpCounter(user.id(), counter.getAsLong());
        repository.consumeMfaChallenge(challenge.id(), now);
        return createSession(user, client, now, true);
    }

    @Transactional
    public SessionBundle refresh(String rawRefreshToken, ClientContext client) {
        Instant now = Instant.now();
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Refresh session is unavailable.");
        }

        AuthRepository.RefreshTokenRow current = repository
                .findRefreshTokenForUpdate(tokenService.sha256Hex(rawRefreshToken))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Refresh session is unavailable."));

        AuthRepository.SessionRow session = repository.findSessionForUpdate(current.sessionId())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Refresh session is unavailable."));

        AuthRepository.UserRow user = repository.findUserById(session.userId()).orElse(null);
        if (current.consumedAt() != null) {
            repository.revokeSession(session.id(), session.userId(), "REFRESH_REUSE_DETECTED", now);
            repository.revokeRefreshTokensForSession(session.id(), now);
            if (user != null) {
                ClientAudit audit = audit(client);
                repository.insertAuthenticationEvent(user.id(), tokenService.sha256Hex(user.email()), "REFRESH_REUSE", "CONSUMED_TOKEN_REUSED",
                        audit.ipHash(), audit.userAgent(), now);
            }
            throw new ApiException(HttpStatus.UNAUTHORIZED, "REFRESH_REUSE_DETECTED", "The session was revoked because refresh-token reuse was detected.");
        }

        if (current.revokedAt() != null || !current.expiresAt().isAfter(now) || session.revokedAt() != null
                || !session.expiresAt().isAfter(now) || user == null || !"ACTIVE".equals(user.status())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Refresh session is unavailable.");
        }

        String nextRaw = tokenService.randomToken();
        UUID nextId = UUID.randomUUID();
        repository.insertRefreshToken(new AuthRepository.RefreshTokenRow(
                nextId,
                session.id(),
                tokenService.sha256Hex(nextRaw),
                now,
                session.expiresAt(),
                null,
                null,
                null));
        repository.consumeRefreshToken(current.id(), nextId, now);
        repository.touchSession(session.id(), now);
        JwtService.IssuedToken accessToken = jwtService.issue(user.id(), session.id());
        return new SessionBundle(accessToken.value(), accessToken.expiresAt(), nextRaw, session.expiresAt(), userView(user));
    }

    public UserView me(AuthPrincipal principal) {
        AuthRepository.UserRow user = repository.findUserById(principal.userId())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication is required."));
        return userView(user);
    }

    public List<SessionView> listSessions(AuthPrincipal principal) {
        Instant now = Instant.now();
        return repository.listActiveSessions(principal.userId(), now).stream()
                .map(session -> new SessionView(
                        session.id(),
                        session.id().equals(principal.sessionId()),
                        session.userAgent(),
                        session.createdAt(),
                        session.lastSeenAt(),
                        session.expiresAt()))
                .toList();
    }

    @Transactional
    public void logout(AuthPrincipal principal, ClientContext client) {
        Instant now = Instant.now();
        if (repository.revokeSession(principal.sessionId(), principal.userId(), "USER_LOGOUT", now) > 0) {
            repository.revokeRefreshTokensForSession(principal.sessionId(), now);
            repository.insertAuthenticationEvent(principal.userId(), tokenService.sha256Hex(principal.email()), "LOGOUT", "CURRENT_SESSION",
                    audit(client).ipHash(), audit(client).userAgent(), now);
        }
    }

    @Transactional
    public void logoutAll(AuthPrincipal principal, ClientContext client) {
        Instant now = Instant.now();
        repository.revokeAllSessions(principal.userId(), "USER_LOGOUT_ALL", now);
        repository.insertAuthenticationEvent(principal.userId(), tokenService.sha256Hex(principal.email()), "LOGOUT", "ALL_SESSIONS",
                audit(client).ipHash(), audit(client).userAgent(), now);
    }

    @Transactional
    public boolean revokeSession(AuthPrincipal principal, UUID sessionId) {
        Instant now = Instant.now();
        int changed = repository.revokeSession(sessionId, principal.userId(), "USER_REVOKED_SESSION", now);
        if (changed > 0) repository.revokeRefreshTokensForSession(sessionId, now);
        return changed > 0;
    }

    @Transactional
    public void changePassword(AuthPrincipal principal, String currentPassword, String newPassword, ClientContext client) {
        Instant now = Instant.now();
        AuthRepository.UserRow user = repository.findUserById(principal.userId())
                .filter(candidate -> "ACTIVE".equals(candidate.status()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication is required."));

        if (currentPassword == null || !passwordEncoder.matches(currentPassword, user.passwordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
        }
        if (passwordEncoder.matches(newPassword, user.passwordHash())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PASSWORD_UNCHANGED", "New password must differ from the current password.");
        }
        passwordPolicy.validate(newPassword, user.email());
        repository.updatePassword(user.id(), passwordEncoder.encode(newPassword), now);
        repository.revokeOtherSessions(user.id(), principal.sessionId(), "PASSWORD_CHANGED", now);
        repository.insertAuthenticationEvent(user.id(), tokenService.sha256Hex(user.email()), "PASSWORD_CHANGED", "SELF_SERVICE",
                audit(client).ipHash(), audit(client).userAgent(), now);
    }

    @Transactional
    public TotpEnrollment enrollTotp(AuthPrincipal principal) {
        Instant now = Instant.now();
        AuthRepository.UserRow user = repository.findUserById(principal.userId())
                .filter(candidate -> "ACTIVE".equals(candidate.status()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication is required."));

        AuthRepository.TotpRow existing = repository.findTotp(user.id()).orElse(null);
        if (existing != null && existing.enabledAt() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "MFA_ALREADY_ENABLED", "TOTP MFA is already enabled for this account.");
        }

        TotpService.SecretMaterial material = totpService.generate(user.email());
        Instant expiresAt = now.plus(properties.mfaChallengeTtl().multipliedBy(2));
        repository.upsertTotpEnrollment(user.id(), material.encryptedSecret(), expiresAt);
        return new TotpEnrollment(material.base32Secret(), material.otpauthUri(), expiresAt);
    }

    @Transactional
    public void confirmTotp(AuthPrincipal principal, String code) {
        Instant now = Instant.now();
        AuthRepository.TotpRow totp = repository.findTotpForUpdate(principal.userId())
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "MFA_ENROLLMENT_MISSING", "Start TOTP enrollment before confirming it."));
        if (totp.enabledAt() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "MFA_ALREADY_ENABLED", "TOTP MFA is already enabled for this account.");
        }
        if (totp.enrollmentExpiresAt() == null || !totp.enrollmentExpiresAt().isAfter(now)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "MFA_ENROLLMENT_EXPIRED", "TOTP enrollment has expired. Start again.");
        }
        if (totpService.verifyForEnrollment(totp.encryptedSecret(), code).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_MFA_CODE", "The verification code is invalid.");
        }
        repository.confirmTotp(principal.userId(), now);
    }

    private SessionBundle createSession(AuthRepository.UserRow user, ClientContext client, Instant now, boolean recordLogin) {
        ClientAudit audit = audit(client);
        UUID sessionId = UUID.randomUUID();
        Instant sessionExpiresAt = now.plus(properties.sessionTtl());
        repository.insertSession(new AuthRepository.SessionRow(
                sessionId,
                user.id(),
                UUID.randomUUID(),
                audit.userAgent(),
                audit.ipHash(),
                sessionExpiresAt,
                now,
                null,
                null,
                now,
                now));

        String rawRefresh = tokenService.randomToken();
        repository.insertRefreshToken(new AuthRepository.RefreshTokenRow(
                UUID.randomUUID(),
                sessionId,
                tokenService.sha256Hex(rawRefresh),
                now,
                sessionExpiresAt,
                null,
                null,
                null));

        JwtService.IssuedToken access = jwtService.issue(user.id(), sessionId);
        repository.updateLastLogin(user.id(), now);
        if (recordLogin) {
            repository.insertAuthenticationEvent(user.id(), tokenService.sha256Hex(user.email()), "LOGIN_SUCCEEDED", "PASSWORD_AND_REQUIRED_FACTORS_VALID",
                    audit.ipHash(), audit.userAgent(), now);
        }
        AuthRepository.UserRow refreshedUser = repository.findUserById(user.id()).orElse(user);
        return new SessionBundle(access.value(), access.expiresAt(), rawRefresh, sessionExpiresAt, userView(refreshedUser));
    }

    private UserView userView(AuthRepository.UserRow user) {
        boolean mfaEnabled = repository.findTotp(user.id()).map(row -> row.enabledAt() != null).orElse(false);
        return new UserView(user.id(), user.email(), user.displayName(), user.preferredLanguage(), user.lastLoginAt(), mfaEnabled);
    }

    private ClientAudit audit(ClientContext client) {
        return new ClientAudit(
                tokenService.nullableHash(client == null ? null : client.remoteAddress()),
                tokenService.truncateUserAgent(client == null ? null : client.userAgent()));
    }

    static String normalizeEmail(String email) {
        if (email == null) return "";
        return email.trim().toLowerCase(Locale.ROOT);
    }

    public record ClientContext(String remoteAddress, String userAgent) {
    }

    private record ClientAudit(String ipHash, String userAgent) {
    }

    public record LoginResult(String status, String mfaChallengeToken, Long mfaChallengeExpiresInSeconds, SessionBundle session) {
        static LoginResult mfaRequired(String token, long expiresInSeconds) {
            return new LoginResult("MFA_REQUIRED", token, expiresInSeconds, null);
        }

        static LoginResult authenticated(SessionBundle session) {
            return new LoginResult("AUTHENTICATED", null, null, session);
        }
    }

    public record SessionBundle(
            String accessToken,
            Instant accessTokenExpiresAt,
            String refreshToken,
            Instant sessionExpiresAt,
            UserView user) {
    }

    public record UserView(
            UUID id,
            String email,
            String displayName,
            String preferredLanguage,
            Instant lastLoginAt,
            boolean mfaEnabled) {
    }

    public record SessionView(
            UUID id,
            boolean current,
            String userAgent,
            Instant createdAt,
            Instant lastSeenAt,
            Instant expiresAt) {
    }

    public record TotpEnrollment(String secret, String otpauthUri, Instant expiresAt) {
    }
}
