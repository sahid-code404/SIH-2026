package org.nirikshanx.inspectiontemplate;

import java.util.UUID;
import org.nirikshanx.auth.AuthPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/inspection-templates")
public class InspectionTemplateController {
    private final InspectionTemplateService service;

    public InspectionTemplateController(InspectionTemplateService service) {
        this.service = service;
    }

    @GetMapping
    public InspectionTemplateService.PageView<InspectionTemplateService.TemplateSummary> templates(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.templates(principal, q, page, size);
    }

    @GetMapping("/{templateId}")
    public InspectionTemplateService.TemplateDetail template(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID templateId) {
        return service.template(principal, templateId);
    }

    @GetMapping("/{templateId}/versions/{versionId}")
    public InspectionTemplateService.VersionGraph version(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID templateId,
            @PathVariable UUID versionId) {
        return service.version(principal, templateId, versionId);
    }

    @PostMapping
    public InspectionTemplateService.TemplateDetail create(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestBody InspectionTemplateService.TemplateCreateInput input) {
        return service.create(principal, input);
    }

    @PutMapping("/{templateId}/versions/{versionId}/draft")
    public InspectionTemplateService.VersionGraph replaceDraft(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID templateId,
            @PathVariable UUID versionId,
            @RequestBody InspectionTemplateService.DraftGraphInput input) {
        return service.replaceDraft(principal, templateId, versionId, input);
    }

    @PostMapping("/{templateId}/versions/{versionId}/publish")
    public InspectionTemplateService.VersionGraph publish(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID templateId,
            @PathVariable UUID versionId) {
        return service.publish(principal, templateId, versionId);
    }

    @PostMapping("/{templateId}/versions/{versionId}/new-version")
    public InspectionTemplateService.VersionGraph newVersion(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID templateId,
            @PathVariable UUID versionId,
            @RequestBody(required = false) InspectionTemplateService.NewVersionInput input) {
        return service.createVersion(principal, templateId, versionId, input);
    }
}