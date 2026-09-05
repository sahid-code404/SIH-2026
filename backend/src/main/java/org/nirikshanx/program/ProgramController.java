package org.nirikshanx.program;

import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.nirikshanx.auth.AuthPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ProgramController {
    private final ProgramService service;

    public ProgramController(ProgramService service) {
        this.service = service;
    }

    @GetMapping("/api/v1/schemes")
    public ProgramService.PageView<ProgramRepository.SchemeRow> schemes(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(defaultValue = "") @Size(max = 160) String q,
            @RequestParam(required = false) @Size(max = 64) String status,
            @RequestParam(defaultValue = "name") String sort,
            @RequestParam(defaultValue = "asc") String direction,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.schemes(principal, q, status, sort, direction, page, size);
    }

    @GetMapping("/api/v1/schemes/{schemeId}")
    public ProgramRepository.SchemeRow scheme(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID schemeId) {
        return service.scheme(principal, schemeId);
    }

    @PostMapping("/api/v1/schemes")
    public ProgramRepository.SchemeRow createScheme(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestBody ProgramService.SchemeInput input) {
        return service.createScheme(principal, input);
    }

    @PutMapping("/api/v1/schemes/{schemeId}")
    public ProgramRepository.SchemeRow updateScheme(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID schemeId,
            @RequestBody ProgramService.SchemeInput input) {
        return service.updateScheme(principal, schemeId, input);
    }

    @GetMapping("/api/v1/enrollments")
    public ProgramService.PageView<ProgramRepository.EnrollmentRow> enrollments(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(required = false) UUID institutionId,
            @RequestParam(required = false) UUID schemeId,
            @RequestParam(required = false) @Size(max = 64) String status,
            @RequestParam(defaultValue = "false") boolean activeOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.enrollments(principal, institutionId, schemeId, status, activeOnly, page, size);
    }

    @GetMapping("/api/v1/institutions/{institutionId}/scheme-enrollments")
    public ProgramService.PageView<ProgramRepository.EnrollmentRow> institutionEnrollments(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID institutionId,
            @RequestParam(required = false) UUID schemeId,
            @RequestParam(required = false) @Size(max = 64) String status,
            @RequestParam(defaultValue = "false") boolean activeOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.enrollments(principal, institutionId, schemeId, status, activeOnly, page, size);
    }

    @GetMapping("/api/v1/enrollments/{enrollmentId}")
    public ProgramRepository.EnrollmentRow enrollment(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID enrollmentId) {
        return service.enrollment(principal, enrollmentId);
    }

    @PostMapping({"/api/v1/enrollments", "/api/v1/institution-scheme-enrollments"})
    public ProgramRepository.EnrollmentRow createEnrollment(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestBody ProgramService.EnrollmentCreateInput input) {
        return service.createEnrollment(principal, input);
    }

    @PutMapping("/api/v1/enrollments/{enrollmentId}")
    public ProgramRepository.EnrollmentRow updateEnrollment(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID enrollmentId,
            @RequestBody ProgramService.EnrollmentUpdateInput input) {
        return service.updateEnrollment(principal, enrollmentId, input);
    }

    @GetMapping("/api/v1/projects")
    public ProgramService.PageView<ProgramRepository.ProjectRow> projects(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(defaultValue = "") @Size(max = 160) String q,
            @RequestParam(required = false) UUID institutionId,
            @RequestParam(required = false) UUID schemeId,
            @RequestParam(required = false) @Size(max = 64) String status,
            @RequestParam(defaultValue = "title") String sort,
            @RequestParam(defaultValue = "asc") String direction,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return service.projects(principal, q, institutionId, schemeId, status, sort, direction, page, size);
    }

    @GetMapping("/api/v1/projects/{projectId}")
    public ProgramService.ProjectDetail project(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID projectId) {
        return service.project(principal, projectId);
    }

    @PostMapping("/api/v1/projects")
    public ProgramRepository.ProjectRow createProject(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestBody ProgramService.ProjectCreateInput input) {
        return service.createProject(principal, input);
    }

    @PutMapping("/api/v1/projects/{projectId}")
    public ProgramRepository.ProjectRow updateProject(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID projectId,
            @RequestBody ProgramService.ProjectUpdateInput input) {
        return service.updateProject(principal, projectId, input);
    }

    @GetMapping("/api/v1/projects/{projectId}/milestones")
    public List<ProgramRepository.MilestoneRow> milestones(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID projectId) {
        return service.milestones(principal, projectId);
    }

    @PostMapping("/api/v1/projects/{projectId}/milestones")
    public ProgramRepository.MilestoneRow createMilestone(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID projectId,
            @RequestBody ProgramService.MilestoneInput input) {
        return service.createMilestone(principal, projectId, input);
    }

    @PutMapping("/api/v1/projects/{projectId}/milestones/{milestoneId}")
    public ProgramRepository.MilestoneRow updateMilestone(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable UUID projectId,
            @PathVariable UUID milestoneId,
            @RequestBody ProgramService.MilestoneInput input) {
        return service.updateMilestone(principal, projectId, milestoneId, input);
    }
}
