package org.nirikshanx.authorization;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.nirikshanx.auth.ApiException;
import org.nirikshanx.auth.AuthPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthorizationService {
    private final AuthorizationRepository repository;

    public AuthorizationService(AuthorizationRepository repository) {
        this.repository = repository;
    }

    public AuthorizationView current(AuthPrincipal principal) {
        return resolve(principal.userId(), principal.mfaVerifiedAt() != null);
    }

    public AuthorizationView forUser(UUID userId) {
        requireUser(userId);
        return resolve(userId, false);
    }

    public List<AuthorizationRepository.RoleRow> roles() {
        return repository.listRoles();
    }

    public List<AuthorizationRepository.PermissionRow> permissions() {
        return repository.listPermissions();
    }

    public List<AuthorizationRepository.UserSummaryRow> searchUsers(String query) {
        return repository.searchUsers(query, 30);
    }

    public void requirePermission(AuthPrincipal principal, String permission) {
        boolean allowed = repository.listEffectivePermissionCodes(principal.userId(), principal.mfaVerifiedAt() != null)
                .contains(permission);
        if (!allowed) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Access denied.");
        }
    }

    public boolean canAccessState(AuthPrincipal principal, UUID stateId) {
        if (stateId == null || repository.findState(stateId).isEmpty()) return false;
        return repository.listActiveJurisdictions(principal.userId()).stream().anyMatch(scope ->
                "NATIONAL".equals(scope.scopeType())
                        || ("STATE".equals(scope.scopeType()) && stateId.equals(scope.stateId())));
    }

    public boolean canAccessDistrict(AuthPrincipal principal, UUID districtId) {
        if (districtId == null) return false;
        AuthorizationRepository.DistrictRow district = repository.findDistrict(districtId).orElse(null);
        if (district == null) return false;
        return repository.listActiveJurisdictions(principal.userId()).stream().anyMatch(scope ->
                "NATIONAL".equals(scope.scopeType())
                        || ("STATE".equals(scope.scopeType()) && district.stateId().equals(scope.stateId()))
                        || ("DISTRICT".equals(scope.scopeType()) && districtId.equals(scope.districtId())));
    }

    @Transactional
    public RoleAssignmentView assignRole(AuthPrincipal actor, UUID userId, String roleCode) {
        requireUser(userId);
        AuthorizationRepository.RoleRow role = repository.findRoleByCode(normalizeRoleCode(roleCode))
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ROLE", "The requested role does not exist."));
        if (repository.hasActiveRole(userId, role.id())) {
            throw new ApiException(HttpStatus.CONFLICT, "ROLE_ALREADY_ASSIGNED", "The requested role is already active for this user.");
        }
        UUID assignmentId = UUID.randomUUID();
        Instant now = Instant.now();
        repository.assignRole(assignmentId, userId, role.id(), actor.userId(), "ADMIN", now);
        return new RoleAssignmentView(assignmentId, role.code(), role.displayName(), role.mfaRequired(), now);
    }

    @Transactional
    public void revokeRole(AuthPrincipal actor, UUID userId, String roleCode, String reason) {
        requireUser(userId);
        String normalized = normalizeRoleCode(roleCode);
        AuthorizationRepository.RoleRow role = repository.findRoleByCode(normalized)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ROLE", "The requested role does not exist."));
        if ("SYSTEM_ADMIN".equals(normalized)
                && repository.hasActiveRole(userId, role.id())
                && repository.countActiveRole("SYSTEM_ADMIN") <= 1) {
            throw new ApiException(HttpStatus.CONFLICT, "LAST_SYSTEM_ADMIN", "The final active system administrator cannot be revoked.");
        }
        String normalizedReason = normalizeReason(reason);
        int changed = repository.revokeRole(userId, role.id(), actor.userId(), normalizedReason, Instant.now());
        if (changed == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "ROLE_ASSIGNMENT_NOT_FOUND", "Active role assignment was not found.");
        }
    }

    @Transactional
    public JurisdictionView assignJurisdiction(
            AuthPrincipal actor,
            UUID userId,
            String scopeTypeInput,
            UUID stateId,
            UUID districtId) {
        requireUser(userId);
        String scopeType = normalizeScope(scopeTypeInput);
        UUID normalizedStateId = stateId;
        UUID normalizedDistrictId = districtId;

        switch (scopeType) {
            case "NATIONAL" -> {
                if (stateId != null || districtId != null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JURISDICTION", "National scope cannot include state or district identifiers.");
                }
            }
            case "STATE" -> {
                if (stateId == null || districtId != null || repository.findState(stateId).isEmpty()) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JURISDICTION", "State scope requires one valid state and no district.");
                }
            }
            case "DISTRICT" -> {
                if (stateId == null || districtId == null) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JURISDICTION", "District scope requires valid state and district identifiers.");
                }
                AuthorizationRepository.DistrictRow district = repository.findDistrict(districtId)
                        .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JURISDICTION", "District scope requires a valid district."));
                if (!stateId.equals(district.stateId())) {
                    throw new ApiException(HttpStatus.BAD_REQUEST, "DISTRICT_STATE_MISMATCH", "The district does not belong to the supplied state.");
                }
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_JURISDICTION", "Unsupported jurisdiction scope.");
        }

        if (repository.hasActiveJurisdiction(userId, scopeType, normalizedStateId, normalizedDistrictId)) {
            throw new ApiException(HttpStatus.CONFLICT, "JURISDICTION_ALREADY_ASSIGNED", "The requested jurisdiction is already active for this user.");
        }

        UUID assignmentId = UUID.randomUUID();
        Instant now = Instant.now();
        repository.assignJurisdiction(
                assignmentId,
                userId,
                scopeType,
                normalizedStateId,
                normalizedDistrictId,
                actor.userId(),
                "ADMIN",
                now);
        return repository.listActiveJurisdictions(userId).stream()
                .filter(item -> assignmentId.equals(item.assignmentId()))
                .findFirst()
                .map(this::jurisdictionView)
                .orElseThrow(() -> new IllegalStateException("Assigned jurisdiction could not be reloaded"));
    }

    @Transactional
    public void revokeJurisdiction(AuthPrincipal actor, UUID userId, UUID assignmentId, String reason) {
        requireUser(userId);
        int changed = repository.revokeJurisdiction(assignmentId, userId, actor.userId(), normalizeReason(reason), Instant.now());
        if (changed == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "JURISDICTION_ASSIGNMENT_NOT_FOUND", "Active jurisdiction assignment was not found.");
        }
    }

    private AuthorizationView resolve(UUID userId, boolean sessionMfaVerified) {
        AuthorizationRepository.UserSummaryRow user = repository.findUser(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication is required."));
        List<AuthorizationRepository.RoleAssignmentRow> roleRows = repository.listActiveRoles(userId);
        boolean mfaEnabled = repository.isMfaEnabled(userId);
        boolean mfaRequired = roleRows.stream().anyMatch(AuthorizationRepository.RoleAssignmentRow::mfaRequired);
        boolean mfaSatisfied = !mfaRequired || (mfaEnabled && sessionMfaVerified);

        Set<String> allPermissionCodes = new LinkedHashSet<>();
        Set<String> effectivePermissionCodes = new LinkedHashSet<>();
        for (AuthorizationRepository.PermissionGrantRow grant : repository.listPermissionGrants(userId)) {
            allPermissionCodes.add(grant.code());
            if (!grant.mfaRequired() || (mfaEnabled && sessionMfaVerified)) {
                effectivePermissionCodes.add(grant.code());
            }
        }
        List<String> withheld = new ArrayList<>(allPermissionCodes);
        withheld.removeAll(effectivePermissionCodes);

        return new AuthorizationView(
                new UserView(user.id(), user.email(), user.displayName(), user.status()),
                roleRows.stream().map(row -> new RoleView(
                        row.assignmentId(), row.code(), row.displayName(), row.mfaRequired(), row.assignmentSource(), row.assignedAt())).toList(),
                List.copyOf(effectivePermissionCodes),
                List.copyOf(withheld),
                repository.listActiveJurisdictions(userId).stream().map(this::jurisdictionView).toList(),
                mfaRequired,
                mfaEnabled,
                sessionMfaVerified,
                mfaSatisfied);
    }

    private JurisdictionView jurisdictionView(AuthorizationRepository.JurisdictionRow row) {
        return new JurisdictionView(
                row.assignmentId(),
                row.scopeType(),
                row.stateId(),
                row.stateCode(),
                row.stateName(),
                row.districtId(),
                row.districtCode(),
                row.districtName(),
                row.assignmentSource(),
                row.assignedAt());
    }

    private void requireUser(UUID userId) {
        if (userId == null || !repository.userExists(userId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "User was not found.");
        }
    }

    private static String normalizeRoleCode(String roleCode) {
        if (roleCode == null) return "";
        return roleCode.trim().toUpperCase(Locale.ROOT);
    }

    private static String normalizeScope(String scopeType) {
        if (scopeType == null) return "";
        return scopeType.trim().toUpperCase(Locale.ROOT);
    }

    private static String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "REVOCATION_REASON_REQUIRED", "A revocation reason is required.");
        }
        String value = reason.trim();
        if (value.length() > 240) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "REVOCATION_REASON_TOO_LONG", "Revocation reason must not exceed 240 characters.");
        }
        return value;
    }

    public record AuthorizationView(
            UserView user,
            List<RoleView> roles,
            List<String> effectivePermissions,
            List<String> withheldPermissions,
            List<JurisdictionView> jurisdictions,
            boolean mfaRequired,
            boolean mfaEnabled,
            boolean sessionMfaVerified,
            boolean mfaSatisfied) {
    }

    public record UserView(UUID id, String email, String displayName, String status) {
    }

    public record RoleView(
            UUID assignmentId,
            String code,
            String displayName,
            boolean mfaRequired,
            String assignmentSource,
            Instant assignedAt) {
    }

    public record JurisdictionView(
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

    public record RoleAssignmentView(UUID assignmentId, String code, String displayName, boolean mfaRequired, Instant assignedAt) {
    }
}
