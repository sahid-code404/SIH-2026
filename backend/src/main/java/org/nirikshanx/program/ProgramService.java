package org.nirikshanx.program;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.nirikshanx.auth.ApiException;
import org.nirikshanx.auth.AuthPrincipal;
import org.nirikshanx.authorization.AuthorizationService;
import org.nirikshanx.institution.InstitutionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProgramService {
    private static final Pattern BUSINESS_CODE = Pattern.compile("^[A-Z0-9][A-Z0-9._/-]{1,95}$");
    private static final Pattern POLICY_CODE = Pattern.compile("^[A-Z][A-Z0-9_]{1,63}$");

    private final ProgramRepository repository;
    private final InstitutionRepository institutions;
    private final AuthorizationService authorization;

    public ProgramService(
            ProgramRepository repository,
            InstitutionRepository institutions,
            AuthorizationService authorization) {
        this.repository = repository;
        this.institutions = institutions;
        this.authorization = authorization;
    }

    public PageView<ProgramRepository.SchemeRow> schemes(
            AuthPrincipal principal, String query, String status, String sort, String direction, int page, int size) {
        authorization.requirePermission(principal, "scheme.read");
        PageWindow window = window(page, size);
        ProgramRepository.PageRows<ProgramRepository.SchemeRow> rows = repository.searchSchemes(
                new ProgramRepository.SchemeSearch(
                        searchPrefix(query), optionalPolicyCode(status, "status"),
                        schemeSort(sort), direction(direction), window.size(), window.offset()));
        return page(rows, window);
    }

    public ProgramRepository.SchemeRow scheme(AuthPrincipal principal, UUID schemeId) {
        authorization.requirePermission(principal, "scheme.read");
        return requireScheme(schemeId);
    }

    @Transactional
    public ProgramRepository.SchemeRow createScheme(AuthPrincipal principal, SchemeInput input) {
        authorization.requirePermission(principal, "scheme.create");
        ProgramRepository.SchemeWrite write = normalizeScheme(UUID.randomUUID(), input);
        ensureSchemeUnique(write, null);
        return repository.insertScheme(write);
    }

    @Transactional
    public ProgramRepository.SchemeRow updateScheme(AuthPrincipal principal, UUID schemeId, SchemeInput input) {
        authorization.requirePermission(principal, "scheme.update");
        requireScheme(schemeId);
        ProgramRepository.SchemeWrite write = normalizeScheme(schemeId, input);
        ensureSchemeUnique(write, schemeId);
        return repository.updateScheme(write);
    }

    public PageView<ProgramRepository.EnrollmentRow> enrollments(
            AuthPrincipal principal,
            UUID institutionId,
            UUID schemeId,
            String status,
            boolean activeOnly,
            int page,
            int size) {
        authorization.requirePermission(principal, "enrollment.read");
        PageWindow window = window(page, size);
        ProgramRepository.PageRows<ProgramRepository.EnrollmentRow> rows = repository.searchEnrollments(
                principal.userId(),
                new ProgramRepository.EnrollmentSearch(
                        institutionId, schemeId, optionalPolicyCode(status, "status"), activeOnly,
                        window.size(), window.offset()));
        return page(rows, window);
    }

    public ProgramRepository.EnrollmentRow enrollment(AuthPrincipal principal, UUID enrollmentId) {
        authorization.requirePermission(principal, "enrollment.read");
        return requireEnrollment(principal, enrollmentId);
    }

    @Transactional
    public ProgramRepository.EnrollmentRow createEnrollment(AuthPrincipal principal, EnrollmentCreateInput input) {
        authorization.requirePermission(principal, "enrollment.create");
        if (input == null || input.institutionId() == null || input.schemeId() == null) {
            throw validation("Institution and scheme are required.");
        }
        if (!institutions.hasAccess(principal.userId(), input.institutionId())) throw hiddenInstitution();
        requireScheme(input.schemeId());

        ProgramRepository.EnrollmentWrite write = normalizeEnrollment(
                UUID.randomUUID(), input.institutionId(), input.schemeId(),
                input.enrollmentCode(), input.status(), input.enrolledOn(), input.endedOn());
        ensureEnrollmentUnique(write, null);
        return repository.insertEnrollment(write, principal.userId());
    }

    @Transactional
    public ProgramRepository.EnrollmentRow updateEnrollment(
            AuthPrincipal principal, UUID enrollmentId, EnrollmentUpdateInput input) {
        authorization.requirePermission(principal, "enrollment.update");
        ProgramRepository.EnrollmentRow current = requireEnrollment(principal, enrollmentId);
        if (input == null) throw validation("Enrollment data is required.");
        ProgramRepository.EnrollmentWrite write = normalizeEnrollment(
                enrollmentId, current.institutionId(), current.schemeId(),
                input.enrollmentCode(), input.status(), input.enrolledOn(), input.endedOn());
        ensureEnrollmentUnique(write, enrollmentId);
        return repository.updateEnrollment(write, principal.userId());
    }

    public PageView<ProgramRepository.ProjectRow> projects(
            AuthPrincipal principal,
            String query,
            UUID institutionId,
            UUID schemeId,
            String status,
            String sort,
            String direction,
            int page,
            int size) {
        authorization.requirePermission(principal, "project.read");
        PageWindow window = window(page, size);
        ProgramRepository.PageRows<ProgramRepository.ProjectRow> rows = repository.searchProjects(
                principal.userId(),
                new ProgramRepository.ProjectSearch(
                        searchPrefix(query), institutionId, schemeId, optionalPolicyCode(status, "status"),
                        projectSort(sort), direction(direction), window.size(), window.offset()));
        return page(rows, window);
    }

    public ProjectDetail project(AuthPrincipal principal, UUID projectId) {
        authorization.requirePermission(principal, "project.read");
        ProgramRepository.ProjectRow project = requireProject(principal, projectId);
        List<ProgramRepository.MilestoneRow> milestones = List.of();
        if (authorization.current(principal).effectivePermissions().contains("milestone.read")) {
            milestones = repository.listMilestonesAccessible(principal.userId(), projectId);
        }
        return new ProjectDetail(project, milestones);
    }

    @Transactional
    public ProgramRepository.ProjectRow createProject(AuthPrincipal principal, ProjectCreateInput input) {
        authorization.requirePermission(principal, "project.create");
        if (input == null || input.enrollmentId() == null) throw validation("Enrollment is required.");
        ProgramRepository.EnrollmentRow enrollment = requireEnrollment(principal, input.enrollmentId());
        if (enrollment.endedOn() != null) {
            throw new ApiException(HttpStatus.CONFLICT, "ENROLLMENT_ENDED", "New projects require an active scheme enrollment.");
        }
        ProgramRepository.ProjectWrite write = normalizeProject(
                UUID.randomUUID(), enrollment.id(), input.code(), input.title(), input.description(), input.status(),
                input.plannedStartOn(), input.plannedEndOn(), input.actualStartOn(), input.actualEndOn());
        ensureProjectUnique(write, null);
        return repository.insertProject(write, principal.userId());
    }

    @Transactional
    public ProgramRepository.ProjectRow updateProject(AuthPrincipal principal, UUID projectId, ProjectUpdateInput input) {
        authorization.requirePermission(principal, "project.update");
        ProgramRepository.ProjectRow current = requireProject(principal, projectId);
        if (input == null) throw validation("Project data is required.");
        ProgramRepository.ProjectWrite write = normalizeProject(
                projectId, current.enrollmentId(), input.code(), input.title(), input.description(), input.status(),
                input.plannedStartOn(), input.plannedEndOn(), input.actualStartOn(), input.actualEndOn());
        ensureProjectUnique(write, projectId);
        return repository.updateProject(write, principal.userId());
    }

    public List<ProgramRepository.MilestoneRow> milestones(AuthPrincipal principal, UUID projectId) {
        authorization.requirePermission(principal, "milestone.read");
        requireProjectForMilestones(principal, projectId);
        return repository.listMilestonesAccessible(principal.userId(), projectId);
    }

    @Transactional
    public ProgramRepository.MilestoneRow createMilestone(
            AuthPrincipal principal, UUID projectId, MilestoneInput input) {
        authorization.requirePermission(principal, "milestone.create");
        requireProjectForMilestones(principal, projectId);
        ProgramRepository.MilestoneWrite write = normalizeMilestone(UUID.randomUUID(), projectId, input);
        ensureMilestoneUnique(write, null);
        return repository.insertMilestone(write, principal.userId());
    }

    @Transactional
    public ProgramRepository.MilestoneRow updateMilestone(
            AuthPrincipal principal, UUID projectId, UUID milestoneId, MilestoneInput input) {
        authorization.requirePermission(principal, "milestone.update");
        requireProjectForMilestones(principal, projectId);
        repository.findMilestoneAccessible(principal.userId(), projectId, milestoneId)
                .orElseThrow(ProgramService::hiddenMilestone);
        ProgramRepository.MilestoneWrite write = normalizeMilestone(milestoneId, projectId, input);
        ensureMilestoneUnique(write, milestoneId);
        return repository.updateMilestone(write, principal.userId());
    }

    private ProgramRepository.SchemeRow requireScheme(UUID schemeId) {
        if (schemeId == null) throw hiddenScheme();
        return repository.findScheme(schemeId).orElseThrow(ProgramService::hiddenScheme);
    }

    private ProgramRepository.EnrollmentRow requireEnrollment(AuthPrincipal principal, UUID enrollmentId) {
        if (enrollmentId == null) throw hiddenEnrollment();
        return repository.findEnrollmentAccessible(principal.userId(), enrollmentId)
                .orElseThrow(ProgramService::hiddenEnrollment);
    }

    private ProgramRepository.ProjectRow requireProject(AuthPrincipal principal, UUID projectId) {
        if (projectId == null) throw hiddenProject();
        return repository.findProjectAccessible(principal.userId(), projectId)
                .orElseThrow(ProgramService::hiddenProject);
    }

    private ProgramRepository.ProjectRow requireProjectForMilestones(AuthPrincipal principal, UUID projectId) {
        if (projectId == null) throw hiddenProject();
        return repository.findProjectAccessible(principal.userId(), projectId)
                .orElseThrow(ProgramService::hiddenProject);
    }

    private void ensureSchemeUnique(ProgramRepository.SchemeWrite write, UUID excludingId) {
        if (repository.schemeCodeExists(write.code(), excludingId)) {
            throw new ApiException(HttpStatus.CONFLICT, "SCHEME_CODE_EXISTS", "Scheme code is already in use.");
        }
        if (repository.schemeNameExists(write.name(), excludingId)) {
            throw new ApiException(HttpStatus.CONFLICT, "SCHEME_NAME_EXISTS", "Scheme name is already in use.");
        }
    }

    private void ensureEnrollmentUnique(ProgramRepository.EnrollmentWrite write, UUID excludingId) {
        if (write.endedOn() == null && repository.hasActiveEnrollment(write.institutionId(), write.schemeId(), excludingId)) {
            throw new ApiException(HttpStatus.CONFLICT, "ACTIVE_ENROLLMENT_EXISTS", "The institution already has an active enrollment in this scheme.");
        }
        if (repository.enrollmentCodeExists(write.schemeId(), write.enrollmentCode(), excludingId)) {
            throw new ApiException(HttpStatus.CONFLICT, "ENROLLMENT_CODE_EXISTS", "Enrollment code is already in use for this scheme.");
        }
    }

    private void ensureProjectUnique(ProgramRepository.ProjectWrite write, UUID excludingId) {
        if (repository.projectCodeExists(write.enrollmentId(), write.code(), excludingId)) {
            throw new ApiException(HttpStatus.CONFLICT, "PROJECT_CODE_EXISTS", "Project code is already in use for this enrollment.");
        }
    }

    private void ensureMilestoneUnique(ProgramRepository.MilestoneWrite write, UUID excludingId) {
        if (repository.milestoneSequenceExists(write.projectId(), write.sequenceNo(), excludingId)) {
            throw new ApiException(HttpStatus.CONFLICT, "MILESTONE_SEQUENCE_EXISTS", "Milestone sequence number is already in use for this project.");
        }
        if (repository.milestoneCodeExists(write.projectId(), write.code(), excludingId)) {
            throw new ApiException(HttpStatus.CONFLICT, "MILESTONE_CODE_EXISTS", "Milestone code is already in use for this project.");
        }
    }

    private ProgramRepository.SchemeWrite normalizeScheme(UUID id, SchemeInput input) {
        if (input == null) throw validation("Scheme data is required.");
        LocalDate from = input.effectiveFrom();
        LocalDate to = input.effectiveTo();
        if (from != null && to != null && to.isBefore(from)) throw validation("Scheme effectiveTo must not precede effectiveFrom.");
        return new ProgramRepository.SchemeWrite(
                id,
                businessCode(input.code(), "code", 64),
                requiredText(input.name(), "name", 240),
                optionalText(input.shortName(), "shortName", 120),
                optionalText(input.description(), "description", 2000),
                policyCode(input.status(), "status"),
                from,
                to);
    }

    private ProgramRepository.EnrollmentWrite normalizeEnrollment(
            UUID id,
            UUID institutionId,
            UUID schemeId,
            String enrollmentCode,
            String status,
            LocalDate enrolledOn,
            LocalDate endedOn) {
        if (enrolledOn == null) throw validation("enrolledOn is required.");
        if (endedOn != null && endedOn.isBefore(enrolledOn)) throw validation("endedOn must not precede enrolledOn.");
        return new ProgramRepository.EnrollmentWrite(
                id,
                institutionId,
                schemeId,
                optionalBusinessCode(enrollmentCode, "enrollmentCode", 96),
                policyCode(status, "status"),
                enrolledOn,
                endedOn);
    }

    private ProgramRepository.ProjectWrite normalizeProject(
            UUID id,
            UUID enrollmentId,
            String code,
            String title,
            String description,
            String status,
            LocalDate plannedStartOn,
            LocalDate plannedEndOn,
            LocalDate actualStartOn,
            LocalDate actualEndOn) {
        dateOrder(plannedStartOn, plannedEndOn, "plannedEndOn must not precede plannedStartOn.");
        dateOrder(actualStartOn, actualEndOn, "actualEndOn must not precede actualStartOn.");
        return new ProgramRepository.ProjectWrite(
                id,
                enrollmentId,
                businessCode(code, "code", 64),
                requiredText(title, "title", 240),
                optionalText(description, "description", 2000),
                policyCode(status, "status"),
                plannedStartOn,
                plannedEndOn,
                actualStartOn,
                actualEndOn);
    }

    private ProgramRepository.MilestoneWrite normalizeMilestone(UUID id, UUID projectId, MilestoneInput input) {
        if (input == null) throw validation("Milestone data is required.");
        if (input.sequenceNo() <= 0) throw validation("sequenceNo must be greater than zero.");
        return new ProgramRepository.MilestoneWrite(
                id,
                projectId,
                input.sequenceNo(),
                optionalBusinessCode(input.code(), "code", 64),
                requiredText(input.title(), "title", 240),
                optionalText(input.description(), "description", 2000),
                policyCode(input.status(), "status"),
                input.dueOn(),
                input.completedAt());
    }

    private static void dateOrder(LocalDate start, LocalDate end, String message) {
        if (start != null && end != null && end.isBefore(start)) throw validation(message);
    }

    private static PageWindow window(int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(size, 100));
        return new PageWindow(safePage, safeSize, (long) safePage * safeSize);
    }

    private static <T> PageView<T> page(ProgramRepository.PageRows<T> rows, PageWindow window) {
        long totalPages = rows.total() == 0 ? 0 : (rows.total() + window.size() - 1) / window.size();
        return new PageView<>(rows.items(), rows.total(), window.page(), window.size(), totalPages);
    }

    private static String schemeSort(String value) {
        return switch (value == null ? "" : value) {
            case "code" -> "code";
            case "createdAt" -> "createdAt";
            default -> "name";
        };
    }

    private static String projectSort(String value) {
        return switch (value == null ? "" : value) {
            case "code" -> "code";
            case "createdAt" -> "createdAt";
            case "plannedStart" -> "plannedStart";
            default -> "title";
        };
    }

    private static String direction(String value) {
        return "desc".equalsIgnoreCase(value) ? "desc" : "asc";
    }

    private static String searchPrefix(String value) {
        String normalized = blankToNull(value);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT) + "%";
    }

    private static String businessCode(String value, String field, int max) {
        String normalized = requiredText(value, field, max).toUpperCase(Locale.ROOT);
        if (!BUSINESS_CODE.matcher(normalized).matches() || normalized.length() > max) {
            throw validation(field + " must be a normalized uppercase business code.");
        }
        return normalized;
    }

    private static String optionalBusinessCode(String value, String field, int max) {
        String normalized = blankToNull(value);
        return normalized == null ? null : businessCode(normalized, field, max);
    }

    private static String policyCode(String value, String field) {
        String normalized = requiredText(value, field, 64).toUpperCase(Locale.ROOT);
        if (!POLICY_CODE.matcher(normalized).matches()) {
            throw validation(field + " must be a normalized uppercase policy code.");
        }
        return normalized;
    }

    private static String optionalPolicyCode(String value, String field) {
        String normalized = blankToNull(value);
        return normalized == null ? null : policyCode(normalized, field);
    }

    private static String requiredText(String value, String field, int max) {
        String normalized = blankToNull(value);
        if (normalized == null || normalized.length() > max) {
            throw validation(field + " is required and must not exceed " + max + " characters.");
        }
        return normalized;
    }

    private static String optionalText(String value, String field, int max) {
        String normalized = blankToNull(value);
        if (normalized != null && normalized.length() > max) {
            throw validation(field + " must not exceed " + max + " characters.");
        }
        return normalized;
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static ApiException validation(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }

    private static ApiException hiddenInstitution() {
        return new ApiException(HttpStatus.NOT_FOUND, "INSTITUTION_NOT_FOUND", "Institution was not found.");
    }

    private static ApiException hiddenScheme() {
        return new ApiException(HttpStatus.NOT_FOUND, "SCHEME_NOT_FOUND", "Scheme was not found.");
    }

    private static ApiException hiddenEnrollment() {
        return new ApiException(HttpStatus.NOT_FOUND, "ENROLLMENT_NOT_FOUND", "Scheme enrollment was not found.");
    }

    private static ApiException hiddenProject() {
        return new ApiException(HttpStatus.NOT_FOUND, "PROJECT_NOT_FOUND", "Project was not found.");
    }

    private static ApiException hiddenMilestone() {
        return new ApiException(HttpStatus.NOT_FOUND, "MILESTONE_NOT_FOUND", "Project milestone was not found.");
    }

    private record PageWindow(int page, int size, long offset) {}

    public record PageView<T>(List<T> items, long total, int page, int size, long totalPages) {}
    public record ProjectDetail(ProgramRepository.ProjectRow project, List<ProgramRepository.MilestoneRow> milestones) {}

    public record SchemeInput(
            String code,
            String name,
            String shortName,
            String description,
            String status,
            LocalDate effectiveFrom,
            LocalDate effectiveTo) {}

    public record EnrollmentCreateInput(
            UUID institutionId,
            UUID schemeId,
            String enrollmentCode,
            String status,
            LocalDate enrolledOn,
            LocalDate endedOn) {}

    public record EnrollmentUpdateInput(
            String enrollmentCode,
            String status,
            LocalDate enrolledOn,
            LocalDate endedOn) {}

    public record ProjectCreateInput(
            UUID enrollmentId,
            String code,
            String title,
            String description,
            String status,
            LocalDate plannedStartOn,
            LocalDate plannedEndOn,
            LocalDate actualStartOn,
            LocalDate actualEndOn) {}

    public record ProjectUpdateInput(
            String code,
            String title,
            String description,
            String status,
            LocalDate plannedStartOn,
            LocalDate plannedEndOn,
            LocalDate actualStartOn,
            LocalDate actualEndOn) {}

    public record MilestoneInput(
            int sequenceNo,
            String code,
            String title,
            String description,
            String status,
            LocalDate dueOn,
            Instant completedAt) {}
}
