package org.nirikshanx.institution;

import java.util.List;
import java.util.UUID;
import org.nirikshanx.auth.AuthPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/geography")
public class GeographyController {
    private final InstitutionService service;

    public GeographyController(InstitutionService service) {
        this.service = service;
    }

    @GetMapping("/states")
    @PreAuthorize("hasAnyAuthority('institution.read','institution.create')")
    public List<InstitutionRepository.StateRow> states(@AuthenticationPrincipal AuthPrincipal principal) {
        return service.states(principal);
    }

    @GetMapping("/states/{stateId}/districts")
    @PreAuthorize("hasAnyAuthority('institution.read','institution.create')")
    public List<InstitutionRepository.DistrictRow> districts(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID stateId) {
        return service.districts(principal, stateId);
    }
}
