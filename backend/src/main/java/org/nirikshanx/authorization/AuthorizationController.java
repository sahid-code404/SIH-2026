package org.nirikshanx.authorization;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.nirikshanx.auth.AuthPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/authz")
public class AuthorizationController {
    private final AuthorizationService authorizationService;

    public AuthorizationController(AuthorizationService authorizationService) {
        this.authorizationService = authorizationService;
    }

    @GetMapping("/me")
    public AuthorizationService.AuthorizationView me(@AuthenticationPrincipal AuthPrincipal principal) {
        return authorizationService.current(principal);
    }

    @GetMapping("/me/access/states/{stateId}")
    public AccessDecision canAccessState(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID stateId) {
        return new AccessDecision(authorizationService.canAccessState(principal, stateId));
    }

    @GetMapping("/me/access/districts/{districtId}")
    public AccessDecision canAccessDistrict(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID districtId) {
        return new AccessDecision(authorizationService.canAccessDistrict(principal, districtId));
    }

    @GetMapping("/catalog/roles")
    @PreAuthorize("hasAuthority('authorization.read')")
    public List<AuthorizationRepository.RoleRow> roles() {
        return authorizationService.roles();
    }

    @GetMapping("/catalog/permissions")
    @PreAuthorize("hasAuthority('authorization.read')")
    public List<AuthorizationRepository.PermissionRow> permissions() {
        return authorizationService.permissions();
    }

    @GetMapping("/users")
    @PreAuthorize("hasAuthority('authorization.read')")
    public List<AuthorizationRepository.UserSummaryRow> users(@RequestParam(defaultValue = "") @Size(max = 160) String query) {
        return authorizationService.searchUsers(query);
    }

    @GetMapping("/users/{userId}")
    @PreAuthorize("hasAuthority('authorization.read')")
    public AuthorizationService.AuthorizationView user(@PathVariable UUID userId) {
        return authorizationService.forUser(userId);
    }

    @PostMapping("/users/{userId}/roles")
    @PreAuthorize("hasAuthority('authorization.manage')")
    public AuthorizationService.RoleAssignmentView assignRole(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID userId,
            @Valid @RequestBody RoleAssignmentRequest request) {
        return authorizationService.assignRole(principal, userId, request.roleCode());
    }

    @PostMapping("/users/{userId}/roles/{roleCode}/revoke")
    @PreAuthorize("hasAuthority('authorization.manage')")
    public ResponseEntity<Void> revokeRole(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID userId,
            @PathVariable String roleCode,
            @Valid @RequestBody RevocationRequest request) {
        authorizationService.revokeRole(principal, userId, roleCode, request.reason());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{userId}/jurisdictions")
    @PreAuthorize("hasAuthority('authorization.manage')")
    public AuthorizationService.JurisdictionView assignJurisdiction(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID userId,
            @Valid @RequestBody JurisdictionAssignmentRequest request) {
        return authorizationService.assignJurisdiction(
                principal,
                userId,
                request.scopeType(),
                request.stateId(),
                request.districtId());
    }

    @PostMapping("/users/{userId}/jurisdictions/{assignmentId}/revoke")
    @PreAuthorize("hasAuthority('authorization.manage')")
    public ResponseEntity<Void> revokeJurisdiction(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID userId,
            @PathVariable UUID assignmentId,
            @Valid @RequestBody RevocationRequest request) {
        authorizationService.revokeJurisdiction(principal, userId, assignmentId, request.reason());
        return ResponseEntity.noContent().build();
    }

    public record AccessDecision(boolean allowed) {
    }

    public record RoleAssignmentRequest(@NotBlank @Size(max = 64) String roleCode) {
    }

    public record JurisdictionAssignmentRequest(
            @NotBlank @Size(max = 16) String scopeType,
            UUID stateId,
            UUID districtId) {
    }

    public record RevocationRequest(@NotBlank @Size(max = 240) String reason) {
    }
}
