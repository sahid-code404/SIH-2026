package org.nirikshanx.authorization;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class SessionAssuranceRepository {
    private final JdbcClient jdbc;

    public SessionAssuranceRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public boolean isMfaVerified(UUID userId, UUID sessionId) {
        Long count = jdbc.sql("""
                SELECT count(*)
                  FROM user_sessions s
                  JOIN user_totp t ON t.user_id = s.user_id
                 WHERE s.user_id = :userId
                   AND s.id = :sessionId
                   AND t.enabled_at IS NOT NULL
                   AND (
                        s.mfa_verified_at IS NOT NULL
                        OR s.created_at >= t.enabled_at
                   )
                """)
                .param("userId", userId)
                .param("sessionId", sessionId)
                .query(Long.class)
                .single();
        return count != null && count > 0;
    }
}
