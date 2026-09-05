package org.nirikshanx.institution;

import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.nirikshanx.auth.AuthPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
@RequestMapping("/api/v1/institutions")
public class InstitutionController {
    private final InstitutionService service;

    public InstitutionController(InstitutionService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('institution.read')")
    public InstitutionService.InstitutionPage search(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID stateId,
            @RequestParam(required = false) UUID districtId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String institutionType,
            @RequestParam(defaultValue = "displayName") String sort,
            @RequestParam(defaultValue = "asc") String direction,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.search(principal, q, stateId, districtId, status, institutionType, sort, direction, page, size);
    }

    @GetMapping("/{institutionId}")
    @PreAuthorize("hasAuthority('institution.read')")
    public InstitutionRepository.InstitutionRow get(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID institutionId) {
        return service.get(principal, institutionId);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('institution.create')")
    public ResponseEntity<InstitutionRepository.InstitutionRow> create(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestBody InstitutionService.InstitutionInput request) {
        InstitutionRepository.InstitutionRow created = service.create(principal, request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(created.id())
                .toUri();
        return ResponseEntity.created(location).body(created);
    }

    @PutMapping("/{institutionId}")
    @PreAuthorize("hasAuthority('institution.update')")
    public InstitutionRepository.InstitutionRow update(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID institutionId,
            @RequestBody InstitutionService.InstitutionInput request) {
        return service.update(principal, institutionId, request);
    }

    @GetMapping("/{institutionId}/memberships")
    @PreAuthorize("hasAuthority('institution.update')")
    public List<InstitutionRepository.MembershipRow> memberships(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID institutionId) {
        return service.memberships(principal, institutionId);
    }

    @PostMapping("/{institutionId}/memberships")
    @PreAuthorize("hasAuthority('institution.update')")
    public ResponseEntity<InstitutionRepository.MembershipRow> addMembership(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID institutionId,
            @RequestBody MembershipRequest request) {
        InstitutionRepository.MembershipRow created = service.addMembership(principal, institutionId, request.userId());
        return ResponseEntity.status(201).body(created);
    }

    @PostMapping("/{institutionId}/memberships/{membershipId}/revoke")
    @PreAuthorize("hasAuthority('institution.update')")
    public ResponseEntity<Void> revokeMembership(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID institutionId,
            @PathVariable UUID membershipId,
            @RequestBody RevokeMembershipRequest request) {
        service.revokeMembership(principal, institutionId, membershipId, request.reason());
        return ResponseEntity.noContent().build();
    }

    public record MembershipRequest(UUID userId) {
    }

    public record RevokeMembershipRequest(String reason) {
    }
}
