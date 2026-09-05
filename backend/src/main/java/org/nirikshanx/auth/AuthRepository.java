package org.nirikshanx.auth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class AuthRepository {
    private final JdbcClient jdbc;

    public AuthRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UserRow> findUserByEmail(String email) {
        return jdbc.sql("""
                SELECT id, email, phone, display_name, password_hash, status, preferred_language,
                       last_login_at, password_changed_at, created_at, updated_at
                  FROM users
                 WHERE email = :email
                """)
                .param("email", email)
                .query(UserRow.class)
                .optional();
    }

    public Optional<UserRow> findUserById(UUID userId) {
        return jdbc.sql("""
                SELECT id, email, phone, display_name, password_hash, status, preferred_language,
                       last_login_at, password_changed_at, created_at, updated_at
                  FROM users
                 WHERE id = :userId
                """)
                .param("userId", userId)
                .query(UserRow.class)
                .optional();
    }

    public void insertUser(UUID id, String email, String displayName, String passwordHash, String preferredLanguage) {
        jdbc.sql("""
                INSERT INTO users (id, email, display_name, password_hash, preferred_language)
                VALUES (:id, :email, :displayName, :passwordHash, :preferredLanguage)
                """)
                .param("id", id)
                .param("email", email)
                .param("displayName", displayName)
                .param("passwordHash", passwordHash)
                .param("preferredLanguage", preferredLanguage)
                .update();
    }

    public void updateLastLogin(UUID userId, Instant now) {
        jdbc.sql("UPDATE users SET last_login_at = :now WHERE id = :userId")
                .param("now", now)
                .param("userId", userId)
                .update();
    }

    public void updatePassword(UUID userId, String passwordHash, Instant now) {
        jdbc.sql("UPDATE users SET password_hash = :passwordHash, password_changed_at = :now WHERE id = :userId")
                .param("passwordHash", passwordHash)
                .param("now", now)
                .param("userId", userId)
                .update();
    }

    public Optional<PrincipalRow> findActivePrincipal(UUID userId, UUID sessionId, Instant now) {
        return jdbc.sql("""
                SELECT u.id AS user_id, u.email, u.display_name, s.id AS session_id, s.expires_at AS session_expires_at
                  FROM user_sessions s
                  JOIN users u ON u.id = s.user_id
                 WHERE s.id = :sessionId
                   AND u.id = :userId
                   AND u.status = 'ACTIVE'
                   AND s.revoked_at IS NULL
                   AND s.expires_at > :now
                """)
                .param("sessionId", sessionId)
                .param("userId", userId)
                .param("now", now)
                .query(PrincipalRow.class)
                .optional();
    }

    public void insertSession(SessionRow session) {
        jdbc.sql("""
                INSERT INTO user_sessions (
                    id, user_id, token_family_id, user_agent, ip_hash, expires_at, last_seen_at
                ) VALUES (
                    :id, :userId, :tokenFamilyId, :userAgent, :ipHash, :expiresAt, :lastSeenAt
                )
                """)
                .param("id", session.id())
                .param("userId", session.userId())
                .param("tokenFamilyId", session.tokenFamilyId())
                .param("userAgent", session.userAgent())
                .param("ipHash", session.ipHash())
                .param("expiresAt", session.expiresAt())
                .param("lastSeenAt", session.lastSeenAt())
                .update();
    }

    public void touchSession(UUID sessionId, Instant now) {
        jdbc.sql("UPDATE user_sessions SET last_seen_at = :now WHERE id = :sessionId AND revoked_at IS NULL")
                .param("now", now)
                .param("sessionId", sessionId)
                .update();
    }

    public Optional<SessionRow> findSessionForUpdate(UUID sessionId) {
        return jdbc.sql("""
                SELECT id, user_id, token_family_id, user_agent, ip_hash, expires_at, last_seen_at,
                       revoked_at, revocation_reason, created_at, updated_at
                  FROM user_sessions
                 WHERE id = :sessionId
                 FOR UPDATE
                """)
                .param("sessionId", sessionId)
                .query(SessionRow.class)
                .optional();
    }

    public List<SessionRow> listActiveSessions(UUID userId, Instant now) {
        return jdbc.sql("""
                SELECT id, user_id, token_family_id, user_agent, ip_hash, expires_at, last_seen_at,
                       revoked_at, revocation_reason, created_at, updated_at
                  FROM user_sessions
                 WHERE user_id = :userId
                   AND revoked_at IS NULL
                   AND expires_at > :now
                 ORDER BY last_seen_at DESC, created_at DESC
                """)
                .param("userId", userId)
                .param("now", now)
                .query(SessionRow.class)
                .list();
    }

    public int revokeSession(UUID sessionId, UUID userId, String reason, Instant now) {
        return jdbc.sql("""
                UPDATE user_sessions
                   SET revoked_at = :now, revocation_reason = :reason
                 WHERE id = :sessionId
                   AND user_id = :userId
                   AND revoked_at IS NULL
                """)
                .param("now", now)
                .param("reason", reason)
                .param("sessionId", sessionId)
                .param("userId", userId)
                .update();
    }

    public int revokeAllSessions(UUID userId, String reason, Instant now) {
        return jdbc.sql("""
                UPDATE user_sessions
                   SET revoked_at = :now, revocation_reason = :reason
                 WHERE user_id = :userId
                   AND revoked_at IS NULL
                """)
                .param("now", now)
                .param("reason", reason)
                .param("userId", userId)
                .update();
    }

    public int revokeOtherSessions(UUID userId, UUID currentSessionId, String reason, Instant now) {
        return jdbc.sql("""
                UPDATE user_sessions
                   SET revoked_at = :now, revocation_reason = :reason
                 WHERE user_id = :userId
                   AND id <> :currentSessionId
                   AND revoked_at IS NULL
                """)
                .param("now", now)
                .param("reason", reason)
                .param("userId", userId)
                .param("currentSessionId", currentSessionId)
                .update();
    }

    public void insertRefreshToken(RefreshTokenRow token) {
        jdbc.sql("""
                INSERT INTO user_refresh_tokens (
                    id, session_id, token_hash, issued_at, expires_at
                ) VALUES (
                    :id, :sessionId, :tokenHash, :issuedAt, :expiresAt
                )
                """)
                .param("id", token.id())
                .param("sessionId", token.sessionId())
                .param("tokenHash", token.tokenHash())
                .param("issuedAt", token.issuedAt())
                .param("expiresAt", token.expiresAt())
                .update();
    }

    public Optional<RefreshTokenRow> findRefreshTokenForUpdate(String tokenHash) {
        return jdbc.sql("""
                SELECT id, session_id, token_hash, issued_at, expires_at, consumed_at, revoked_at, replaced_by_token_id
                  FROM user_refresh_tokens
                 WHERE token_hash = :tokenHash
                 FOR UPDATE
                """)
                .param("tokenHash", tokenHash)
                .query(RefreshTokenRow.class)
                .optional();
    }

    public void consumeRefreshToken(UUID tokenId, UUID replacementId, Instant now) {
        jdbc.sql("""
                UPDATE user_refresh_tokens
                   SET consumed_at = :now, replaced_by_token_id = :replacementId
                 WHERE id = :tokenId
                   AND consumed_at IS NULL
                   AND revoked_at IS NULL
                """)
                .param("now", now)
                .param("replacementId", replacementId)
                .param("tokenId", tokenId)
                .update();
    }

    public void revokeRefreshTokensForSession(UUID sessionId, Instant now) {
        jdbc.sql("""
                UPDATE user_refresh_tokens
                   SET revoked_at = COALESCE(revoked_at, :now)
                 WHERE session_id = :sessionId
                   AND revoked_at IS NULL
                """)
                .param("now", now)
                .param("sessionId", sessionId)
                .update();
    }

    public long countRecentLoginFailures(String subjectHash, Instant since) {
        Long count = jdbc.sql("""
                SELECT count(*)
                  FROM authentication_events
                 WHERE subject_hash = :subjectHash
                   AND outcome = 'LOGIN_FAILED'
                   AND created_at >= :since
                """)
                .param("subjectHash", subjectHash)
                .param("since", since)
                .query(Long.class)
                .single();
        return count == null ? 0 : count;
    }

    public void insertAuthenticationEvent(UUID userId, String subjectHash, String outcome, String reason,
            String ipHash, String userAgent, Instant now) {
        jdbc.sql("""
                INSERT INTO authentication_events (
                    id, user_id, subject_hash, outcome, reason, ip_hash, user_agent, created_at
                ) VALUES (
                    :id, :userId, :subjectHash, :outcome, :reason, :ipHash, :userAgent, :now
                )
                """)
                .param("id", UUID.randomUUID())
                .param("userId", userId)
                .param("subjectHash", subjectHash)
                .param("outcome", outcome)
                .param("reason", reason)
                .param("ipHash", ipHash)
                .param("userAgent", userAgent)
                .param("now", now)
                .update();
    }

    public Optional<TotpRow> findTotp(UUID userId) {
        return jdbc.sql("""
                SELECT user_id, encrypted_secret, key_version, enabled_at, last_counter,
                       enrollment_expires_at, created_at, updated_at
                  FROM user_totp
                 WHERE user_id = :userId
                """)
                .param("userId", userId)
                .query(TotpRow.class)
                .optional();
    }

    public Optional<TotpRow> findTotpForUpdate(UUID userId) {
        return jdbc.sql("""
                SELECT user_id, encrypted_secret, key_version, enabled_at, last_counter,
                       enrollment_expires_at, created_at, updated_at
                  FROM user_totp
                 WHERE user_id = :userId
                 FOR UPDATE
                """)
                .param("userId", userId)
                .query(TotpRow.class)
                .optional();
    }

    public void upsertTotpEnrollment(UUID userId, String encryptedSecret, Instant expiresAt) {
        jdbc.sql("""
                INSERT INTO user_totp (user_id, encrypted_secret, key_version, enrollment_expires_at)
                VALUES (:userId, :encryptedSecret, 1, :expiresAt)
                ON CONFLICT (user_id) DO UPDATE
                    SET encrypted_secret = EXCLUDED.encrypted_secret,
                        key_version = EXCLUDED.key_version,
                        enabled_at = NULL,
                        last_counter = NULL,
                        enrollment_expires_at = EXCLUDED.enrollment_expires_at
                """)
                .param("userId", userId)
                .param("encryptedSecret", encryptedSecret)
                .param("expiresAt", expiresAt)
                .update();
    }

    public void confirmTotp(UUID userId, Instant now) {
        jdbc.sql("""
                UPDATE user_totp
                   SET enabled_at = :now,
                       enrollment_expires_at = NULL,
                       last_counter = NULL
                 WHERE user_id = :userId
                """)
                .param("now", now)
                .param("userId", userId)
                .update();
    }

    public void updateTotpCounter(UUID userId, long counter) {
        jdbc.sql("UPDATE user_totp SET last_counter = :counter WHERE user_id = :userId")
                .param("counter", counter)
                .param("userId", userId)
                .update();
    }

    public void insertMfaChallenge(MfaChallengeRow challenge) {
        jdbc.sql("""
                INSERT INTO mfa_login_challenges (
                    id, user_id, token_hash, expires_at, ip_hash, user_agent, created_at
                ) VALUES (
                    :id, :userId, :tokenHash, :expiresAt, :ipHash, :userAgent, :createdAt
                )
                """)
                .param("id", challenge.id())
                .param("userId", challenge.userId())
                .param("tokenHash", challenge.tokenHash())
                .param("expiresAt", challenge.expiresAt())
                .param("ipHash", challenge.ipHash())
                .param("userAgent", challenge.userAgent())
                .param("createdAt", challenge.createdAt())
                .update();
    }

    public Optional<MfaChallengeRow> findMfaChallengeForUpdate(String tokenHash) {
        return jdbc.sql("""
                SELECT id, user_id, token_hash, expires_at, consumed_at, ip_hash, user_agent, created_at
                  FROM mfa_login_challenges
                 WHERE token_hash = :tokenHash
                 FOR UPDATE
                """)
                .param("tokenHash", tokenHash)
                .query(MfaChallengeRow.class)
                .optional();
    }

    public void consumeMfaChallenge(UUID challengeId, Instant now) {
        jdbc.sql("UPDATE mfa_login_challenges SET consumed_at = :now WHERE id = :challengeId AND consumed_at IS NULL")
                .param("now", now)
                .param("challengeId", challengeId)
                .update();
    }

    public record UserRow(
            UUID id,
            String email,
            String phone,
            String displayName,
            String passwordHash,
            String status,
            String preferredLanguage,
            Instant lastLoginAt,
            Instant passwordChangedAt,
            Instant createdAt,
            Instant updatedAt) {
    }

    public record PrincipalRow(UUID userId, String email, String displayName, UUID sessionId, Instant sessionExpiresAt) {
    }

    public record SessionRow(
            UUID id,
            UUID userId,
            UUID tokenFamilyId,
            String userAgent,
            String ipHash,
            Instant expiresAt,
            Instant lastSeenAt,
            Instant revokedAt,
            String revocationReason,
            Instant createdAt,
            Instant updatedAt) {
    }

    public record RefreshTokenRow(
            UUID id,
            UUID sessionId,
            String tokenHash,
            Instant issuedAt,
            Instant expiresAt,
            Instant consumedAt,
            Instant revokedAt,
            UUID replacedByTokenId) {
    }

    public record TotpRow(
            UUID userId,
            String encryptedSecret,
            short keyVersion,
            Instant enabledAt,
            Long lastCounter,
            Instant enrollmentExpiresAt,
            Instant createdAt,
            Instant updatedAt) {
    }

    public record MfaChallengeRow(
            UUID id,
            UUID userId,
            String tokenHash,
            Instant expiresAt,
            Instant consumedAt,
            String ipHash,
            String userAgent,
            Instant createdAt) {
    }
}
