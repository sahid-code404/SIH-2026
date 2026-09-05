package org.nirikshanx.authorization;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class AuthorizationRepository {
    private final JdbcClient jdbc;

    public AuthorizationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<RoleRow> listRoles() {
        return jdbc.sql("""
                SELECT id, code, display_name, description, mfa_required, system_defined
                  FROM roles
                 ORDER BY code
                """)
                .query(RoleRow.class)
                .list();
    }

    public List<PermissionRow> listPermissions() {
        return jdbc.sql("""
                SELECT id, code, description
                  FROM permissions
                 ORDER BY code
                """)
                .query(PermissionRow.class)
                .list();
    }

    public Optional<RoleRow> findRoleByCode(String code) {
        return jdbc.sql("""
                SELECT id, code, display_name, description, mfa_required, system_defined
                  FROM roles
                 WHERE code = :code
                """)
                .param("code", code)
                .query(RoleRow.class)
                .optional();
    }

    public boolean userExists(UUID userId) {
        Integer count = jdbc.sql("SELECT count(*) FROM users WHERE id = :userId")
                .param("userId", userId)
                .query(Integer.class)
                .single();
        return count != null && count > 0;
    }

    public Optional<UserSummaryRow> findUser(UUID userId) {
        return jdbc.sql("""
                SELECT id, email, display_name, status
                  FROM users
                 WHERE id = :userId
                """)
                .param("userId", userId)
                .query(UserSummaryRow.class)
                .optional();
    }

    public List<UserSummaryRow> searchUsers(String query, int limit) {
        String pattern = "%" + (query == null ? "" : query.trim().toLowerCase()) + "%";
        return jdbc.sql("""
                SELECT id, email, display_name, status
                  FROM users
                 WHERE lower(email) LIKE :pattern
                    OR lower(display_name) LIKE :pattern
                 ORDER BY display_name, email
                 LIMIT :limit
                """)
                .param("pattern", pattern)
                .param("limit", Math.max(1, Math.min(limit, 50)))
                .query(UserSummaryRow.class)
                .list();
    }

    public List<RoleAssignmentRow> listActiveRoles(UUID userId) {
        return jdbc.sql("""
                SELECT ur.id AS assignment_id,
                       r.id AS role_id,
                       r.code,
                       r.display_name,
                       r.mfa_required,
                       ur.assignment_source,
                       ur.assigned_at
                  FROM user_roles ur
                  JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = :userId
                   AND ur.revoked_at IS NULL
                 ORDER BY r.code
                """)
                .param("userId", userId)
                .query(RoleAssignmentRow.class)
                .list();
    }

    public List<PermissionGrantRow> listPermissionGrants(UUID userId) {
        return jdbc.sql("""
                SELECT p.code, r.mfa_required
                  FROM user_roles ur
                  JOIN roles r ON r.id = ur.role_id
                  JOIN role_permissions rp ON rp.role_id = r.id
                  JOIN permissions p ON p.id = rp.permission_id
                 WHERE ur.user_id = :userId
                   AND ur.revoked_at IS NULL
                 ORDER BY p.code, r.mfa_required
                """)
                .param("userId", userId)
                .query(PermissionGrantRow.class)
                .list();
    }

    public List<String> listEffectivePermissionCodes(UUID userId, boolean sessionMfaVerified) {
        return jdbc.sql("""
                SELECT DISTINCT p.code
                  FROM user_roles ur
                  JOIN roles r ON r.id = ur.role_id
                  JOIN role_permissions rp ON rp.role_id = r.id
                  JOIN permissions p ON p.id = rp.permission_id
                  LEFT JOIN user_totp t ON t.user_id = ur.user_id
                 WHERE ur.user_id = :userId
                   AND ur.revoked_at IS NULL
                   AND (
                        r.mfa_required = FALSE
                        OR (:sessionMfaVerified = TRUE AND t.enabled_at IS NOT NULL)
                   )
                 ORDER BY p.code
                """)
                .param("userId", userId)
                .param("sessionMfaVerified", sessionMfaVerified)
                .query(String.class)
                .list();
    }

    public boolean isMfaEnabled(UUID userId) {
        Integer count = jdbc.sql("SELECT count(*) FROM user_totp WHERE user_id = :userId AND enabled_at IS NOT NULL")
                .param("userId", userId)
                .query(Integer.class)
                .single();
        return count != null && count > 0;
    }

    public List<JurisdictionRow> listActiveJurisdictions(UUID userId) {
        return jdbc.sql("""
                SELECT uj.id AS assignment_id,
                       uj.scope_type,
                       uj.state_id,
                       s.code AS state_code,
                       s.name AS state_name,
                       uj.district_id,
                       d.code AS district_code,
                       d.name AS district_name,
                       uj.assignment_source,
                       uj.assigned_at
                  FROM user_jurisdictions uj
                  LEFT JOIN states s ON s.id = uj.state_id
                  LEFT JOIN districts d ON d.id = uj.district_id
                 WHERE uj.user_id = :userId
                   AND uj.revoked_at IS NULL
                 ORDER BY CASE uj.scope_type WHEN 'NATIONAL' THEN 1 WHEN 'STATE' THEN 2 ELSE 3 END,
                          s.name NULLS FIRST,
                          d.name NULLS FIRST
                """)
                .param("userId", userId)
                .query(JurisdictionRow.class)
                .list();
    }

    public Optional<StateRow> findState(UUID stateId) {
        return jdbc.sql("SELECT id, code, name FROM states WHERE id = :stateId")
                .param("stateId", stateId)
                .query(StateRow.class)
                .optional();
    }

    public Optional<DistrictRow> findDistrict(UUID districtId) {
        return jdbc.sql("SELECT id, state_id, code, name FROM districts WHERE id = :districtId")
                .param("districtId", districtId)
                .query(DistrictRow.class)
                .optional();
    }

    public boolean hasActiveRole(UUID userId, UUID roleId) {
        Integer count = jdbc.sql("""
                SELECT count(*) FROM user_roles
                 WHERE user_id = :userId AND role_id = :roleId AND revoked_at IS NULL
                """)
                .param("userId", userId)
                .param("roleId", roleId)
                .query(Integer.class)
                .single();
        return count != null && count > 0;
    }

    public long countActiveRole(String roleCode) {
        Long count = jdbc.sql("""
                SELECT count(*)
                  FROM user_roles ur
                  JOIN roles r ON r.id = ur.role_id
                 WHERE r.code = :roleCode
                   AND ur.revoked_at IS NULL
                """)
                .param("roleCode", roleCode)
                .query(Long.class)
                .single();
        return count == null ? 0 : count;
    }

    public void assignRole(UUID assignmentId, UUID userId, UUID roleId, UUID actorUserId, String source, Instant now) {
        jdbc.sql("""
                INSERT INTO user_roles (
                    id, user_id, role_id, assigned_by_user_id, assignment_source, assigned_at
                ) VALUES (
                    :id, :userId, :roleId, :actorUserId, :source, :now
                )
                """)
                .param("id", assignmentId)
                .param("userId", userId)
                .param("roleId", roleId)
                .param("actorUserId", actorUserId)
                .param("source", source)
                .param("now", dbTime(now))
                .update();
    }

    public int revokeRole(UUID userId, UUID roleId, UUID actorUserId, String reason, Instant now) {
        return jdbc.sql("""
                UPDATE user_roles
                   SET revoked_at = :now,
                       revoked_by_user_id = :actorUserId,
                       revocation_reason = :reason
                 WHERE user_id = :userId
                   AND role_id = :roleId
                   AND revoked_at IS NULL
                """)
                .param("now", dbTime(now))
                .param("actorUserId", actorUserId)
                .param("reason", reason)
                .param("userId", userId)
                .param("roleId", roleId)
                .update();
    }

    public boolean hasActiveJurisdiction(UUID userId, String scopeType, UUID stateId, UUID districtId) {
        Integer count = jdbc.sql("""
                SELECT count(*)
                  FROM user_jurisdictions
                 WHERE user_id = :userId
                   AND scope_type = :scopeType
                   AND state_id IS NOT DISTINCT FROM :stateId
                   AND district_id IS NOT DISTINCT FROM :districtId
                   AND revoked_at IS NULL
                """)
                .param("userId", userId)
                .param("scopeType", scopeType)
                .param("stateId", stateId)
                .param("districtId", districtId)
                .query(Integer.class)
                .single();
        return count != null && count > 0;
    }

    public void assignJurisdiction(
            UUID assignmentId,
            UUID userId,
            String scopeType,
            UUID stateId,
            UUID districtId,
            UUID actorUserId,
            String source,
            Instant now) {
        jdbc.sql("""
                INSERT INTO user_jurisdictions (
                    id, user_id, scope_type, state_id, district_id,
                    assigned_by_user_id, assignment_source, assigned_at
                ) VALUES (
                    :id, :userId, :scopeType, :stateId, :districtId,
                    :actorUserId, :source, :now
                )
                """)
                .param("id", assignmentId)
                .param("userId", userId)
                .param("scopeType", scopeType)
                .param("stateId", stateId)
                .param("districtId", districtId)
                .param("actorUserId", actorUserId)
                .param("source", source)
                .param("now", dbTime(now))
                .update();
    }

    public int revokeJurisdiction(UUID assignmentId, UUID userId, UUID actorUserId, String reason, Instant now) {
        return jdbc.sql("""
                UPDATE user_jurisdictions
                   SET revoked_at = :now,
                       revoked_by_user_id = :actorUserId,
                       revocation_reason = :reason
                 WHERE id = :assignmentId
                   AND user_id = :userId
                   AND revoked_at IS NULL
                """)
                .param("now", dbTime(now))
                .param("actorUserId", actorUserId)
                .param("reason", reason)
                .param("assignmentId", assignmentId)
                .param("userId", userId)
                .update();
    }

    public void ensureBootstrapSystemAdmin(UUID userId) {
        RoleRow role = findRoleByCode("SYSTEM_ADMIN")
                .orElseThrow(() -> new IllegalStateException("SYSTEM_ADMIN role is missing after authorization migration"));
        Instant now = Instant.now();
        if (!hasActiveRole(userId, role.id())) {
            assignRole(UUID.randomUUID(), userId, role.id(), null, "BOOTSTRAP", now);
        }
        if (!hasActiveJurisdiction(userId, "NATIONAL", null, null)) {
            assignJurisdiction(UUID.randomUUID(), userId, "NATIONAL", null, null, null, "BOOTSTRAP", now);
        }
    }

    private static OffsetDateTime dbTime(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    public record RoleRow(
            UUID id,
            String code,
            String displayName,
            String description,
            boolean mfaRequired,
            boolean systemDefined) {
    }

    public record PermissionRow(UUID id, String code, String description) {
    }

    public record RoleAssignmentRow(
            UUID assignmentId,
            UUID roleId,
            String code,
            String displayName,
            boolean mfaRequired,
            String assignmentSource,
            Instant assignedAt) {
    }

    public record PermissionGrantRow(String code, boolean mfaRequired) {
    }

    public record JurisdictionRow(
            UUID assignmentId,
            String scopeType,
            UUID stateId,
            String stateCode,
            String stateName,
            UUID districtId,
            String districtCode,
            String districtName,
            String assignmentSource,
            Instant assignedAt) {
    }

    public record UserSummaryRow(UUID id, String email, String displayName, String status) {
    }

    public record StateRow(UUID id, String code, String name) {
    }

    public record DistrictRow(UUID id, UUID stateId, String code, String name) {
    }
}
