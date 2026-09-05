package org.nirikshanx.program;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ProgramRepository {
    private final JdbcClient jdbc;

    public ProgramRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public PageRows<SchemeRow> searchSchemes(SchemeSearch criteria) {
        StringBuilder where = new StringBuilder("1=1");
        if (criteria.search() != null) {
            where.append(" AND (lower(s.code) LIKE :search OR lower(s.name) LIKE :search OR lower(COALESCE(s.short_name, '')) LIKE :search)");
        }
        if (criteria.status() != null) where.append(" AND s.status = :status");

        JdbcClient.StatementSpec count = bindSchemeSearch(
                jdbc.sql("SELECT count(*) FROM schemes s WHERE " + where), criteria);
        Long total = count.query(Long.class).single();

        String sort = switch (criteria.sort()) {
            case "code" -> "s.code";
            case "createdAt" -> "s.created_at";
            default -> "lower(s.name)";
        };
        String direction = "desc".equals(criteria.direction()) ? "DESC" : "ASC";
        String sql = """
                SELECT s.id, s.code, s.name, s.short_name, s.description, s.status,
                       s.effective_from, s.effective_to, s.created_at, s.updated_at
                  FROM schemes s
                 WHERE """ + where + " ORDER BY " + sort + " " + direction
                + ", s.id ASC LIMIT :limit OFFSET :offset";
        JdbcClient.StatementSpec data = bindSchemeSearch(jdbc.sql(sql), criteria)
                .param("limit", criteria.limit())
                .param("offset", criteria.offset());
        return new PageRows<>(data.query(SchemeRow.class).list(), total == null ? 0 : total);
    }

    public Optional<SchemeRow> findScheme(UUID schemeId) {
        return jdbc.sql("""
                SELECT id, code, name, short_name, description, status,
                       effective_from, effective_to, created_at, updated_at
                  FROM schemes
                 WHERE id = :schemeId
                """)
                .param("schemeId", schemeId)
                .query(SchemeRow.class)
                .optional();
    }

    public boolean schemeCodeExists(String code, UUID excludingId) {
        return exists("schemes", "code = :value", code, excludingId);
    }

    public boolean schemeNameExists(String name, UUID excludingId) {
        String sql = "SELECT count(*) FROM schemes WHERE lower(name) = lower(:value)"
                + (excludingId == null ? "" : " AND id <> :excludingId");
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("value", name);
        if (excludingId != null) spec = spec.param("excludingId", excludingId);
        return nonZero(spec.query(Long.class).single());
    }

    public SchemeRow insertScheme(SchemeWrite row) {
        jdbc.sql("""
                INSERT INTO schemes (id, code, name, short_name, description, status, effective_from, effective_to)
                VALUES (:id, :code, :name, :shortName, :description, :status, :effectiveFrom, :effectiveTo)
                """)
                .param("id", row.id()).param("code", row.code()).param("name", row.name())
                .param("shortName", row.shortName()).param("description", row.description())
                .param("status", row.status()).param("effectiveFrom", row.effectiveFrom()).param("effectiveTo", row.effectiveTo())
                .update();
        return findScheme(row.id()).orElseThrow();
    }

    public SchemeRow updateScheme(SchemeWrite row) {
        jdbc.sql("""
                UPDATE schemes SET code=:code, name=:name, short_name=:shortName, description=:description,
                                   status=:status, effective_from=:effectiveFrom, effective_to=:effectiveTo
                 WHERE id=:id
                """)
                .param("id", row.id()).param("code", row.code()).param("name", row.name())
                .param("shortName", row.shortName()).param("description", row.description())
                .param("status", row.status()).param("effectiveFrom", row.effectiveFrom()).param("effectiveTo", row.effectiveTo())
                .update();
        return findScheme(row.id()).orElseThrow();
    }

    public PageRows<EnrollmentRow> searchEnrollments(UUID userId, EnrollmentSearch criteria) {
        StringBuilder where = new StringBuilder("(" + institutionAccessPredicate() + ")");
        if (criteria.institutionId() != null) where.append(" AND e.institution_id=:institutionId");
        if (criteria.schemeId() != null) where.append(" AND e.scheme_id=:schemeId");
        if (criteria.status() != null) where.append(" AND e.status=:status");
        if (criteria.activeOnly()) where.append(" AND e.ended_on IS NULL");
        String from = " FROM institution_scheme_enrollments e JOIN institutions i ON i.id=e.institution_id JOIN schemes s ON s.id=e.scheme_id ";

        Long total = bindEnrollmentSearch(jdbc.sql("SELECT count(*)" + from + "WHERE " + where), userId, criteria)
                .query(Long.class).single();
        String sql = """
                SELECT e.id, e.institution_id, i.code AS institution_code, i.display_name AS institution_name,
                       e.scheme_id, s.code AS scheme_code, s.name AS scheme_name,
                       e.enrollment_code, e.status, e.enrolled_on, e.ended_on, e.created_at, e.updated_at
                """ + from + "WHERE " + where
                + " ORDER BY lower(s.name), lower(i.display_name), e.enrolled_on DESC, e.id ASC LIMIT :limit OFFSET :offset";
        JdbcClient.StatementSpec data = bindEnrollmentSearch(jdbc.sql(sql), userId, criteria)
                .param("limit", criteria.limit()).param("offset", criteria.offset());
        return new PageRows<>(data.query(EnrollmentRow.class).list(), total == null ? 0 : total);
    }

    public Optional<EnrollmentRow> findEnrollmentAccessible(UUID userId, UUID enrollmentId) {
        String sql = """
                SELECT e.id, e.institution_id, i.code AS institution_code, i.display_name AS institution_name,
                       e.scheme_id, s.code AS scheme_code, s.name AS scheme_name,
                       e.enrollment_code, e.status, e.enrolled_on, e.ended_on, e.created_at, e.updated_at
                  FROM institution_scheme_enrollments e
                  JOIN institutions i ON i.id=e.institution_id
                  JOIN schemes s ON s.id=e.scheme_id
                 WHERE e.id=:enrollmentId AND (
                """ + institutionAccessPredicate() + "\n)";
        return jdbc.sql(sql).param("enrollmentId", enrollmentId).param("userId", userId)
                .query(EnrollmentRow.class).optional();
    }

    public boolean hasActiveEnrollment(UUID institutionId, UUID schemeId, UUID excludingId) {
        String sql = "SELECT count(*) FROM institution_scheme_enrollments WHERE institution_id=:institutionId AND scheme_id=:schemeId AND ended_on IS NULL"
                + (excludingId == null ? "" : " AND id<>:excludingId");
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("institutionId", institutionId).param("schemeId", schemeId);
        if (excludingId != null) spec = spec.param("excludingId", excludingId);
        return nonZero(spec.query(Long.class).single());
    }

    public boolean enrollmentCodeExists(UUID schemeId, String enrollmentCode, UUID excludingId) {
        if (enrollmentCode == null) return false;
        String sql = "SELECT count(*) FROM institution_scheme_enrollments WHERE scheme_id=:schemeId AND lower(enrollment_code)=lower(:code)"
                + (excludingId == null ? "" : " AND id<>:excludingId");
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("schemeId", schemeId).param("code", enrollmentCode);
        if (excludingId != null) spec = spec.param("excludingId", excludingId);
        return nonZero(spec.query(Long.class).single());
    }

    public EnrollmentRow insertEnrollment(EnrollmentWrite row, UUID userId) {
        jdbc.sql("""
                INSERT INTO institution_scheme_enrollments
                    (id, institution_id, scheme_id, enrollment_code, status, enrolled_on, ended_on)
                VALUES (:id, :institutionId, :schemeId, :enrollmentCode, :status, :enrolledOn, :endedOn)
                """)
                .param("id", row.id()).param("institutionId", row.institutionId()).param("schemeId", row.schemeId())
                .param("enrollmentCode", row.enrollmentCode()).param("status", row.status())
                .param("enrolledOn", row.enrolledOn()).param("endedOn", row.endedOn()).update();
        return findEnrollmentAccessible(userId, row.id()).orElseThrow();
    }

    public EnrollmentRow updateEnrollment(EnrollmentWrite row, UUID userId) {
        jdbc.sql("""
                UPDATE institution_scheme_enrollments
                   SET enrollment_code=:enrollmentCode, status=:status, enrolled_on=:enrolledOn, ended_on=:endedOn
                 WHERE id=:id
                """)
                .param("id", row.id()).param("enrollmentCode", row.enrollmentCode()).param("status", row.status())
                .param("enrolledOn", row.enrolledOn()).param("endedOn", row.endedOn()).update();
        return findEnrollmentAccessible(userId, row.id()).orElseThrow();
    }

    public PageRows<ProjectRow> searchProjects(UUID userId, ProjectSearch criteria) {
        StringBuilder where = new StringBuilder("(" + institutionAccessPredicate() + ")");
        if (criteria.search() != null) where.append(" AND (lower(p.code) LIKE :search OR lower(p.title) LIKE :search OR lower(COALESCE(p.description,'')) LIKE :search)");
        if (criteria.institutionId() != null) where.append(" AND e.institution_id=:institutionId");
        if (criteria.schemeId() != null) where.append(" AND e.scheme_id=:schemeId");
        if (criteria.status() != null) where.append(" AND p.status=:status");
        String from = " FROM projects p JOIN institution_scheme_enrollments e ON e.id=p.enrollment_id JOIN institutions i ON i.id=e.institution_id JOIN schemes s ON s.id=e.scheme_id ";

        Long total = bindProjectSearch(jdbc.sql("SELECT count(*)" + from + "WHERE " + where), userId, criteria)
                .query(Long.class).single();
        String direction = "desc".equals(criteria.direction()) ? "DESC" : "ASC";
        String order = switch (criteria.sort()) {
            case "code" -> "p.code " + direction;
            case "createdAt" -> "p.created_at " + direction;
            case "plannedStart" -> "p.planned_start_on " + direction + " NULLS LAST";
            default -> "lower(p.title) " + direction;
        };
        String sql = """
                SELECT p.id, p.enrollment_id, e.institution_id, i.code AS institution_code, i.display_name AS institution_name,
                       e.scheme_id, s.code AS scheme_code, s.name AS scheme_name,
                       p.code, p.title, p.description, p.status, p.planned_start_on, p.planned_end_on,
                       p.actual_start_on, p.actual_end_on, p.created_at, p.updated_at
                """ + from + "WHERE " + where + " ORDER BY " + order + ", p.id ASC LIMIT :limit OFFSET :offset";
        JdbcClient.StatementSpec data = bindProjectSearch(jdbc.sql(sql), userId, criteria)
                .param("limit", criteria.limit()).param("offset", criteria.offset());
        return new PageRows<>(data.query(ProjectRow.class).list(), total == null ? 0 : total);
    }

    public Optional<ProjectRow> findProjectAccessible(UUID userId, UUID projectId) {
        String sql = """
                SELECT p.id, p.enrollment_id, e.institution_id, i.code AS institution_code, i.display_name AS institution_name,
                       e.scheme_id, s.code AS scheme_code, s.name AS scheme_name,
                       p.code, p.title, p.description, p.status, p.planned_start_on, p.planned_end_on,
                       p.actual_start_on, p.actual_end_on, p.created_at, p.updated_at
                  FROM projects p
                  JOIN institution_scheme_enrollments e ON e.id=p.enrollment_id
                  JOIN institutions i ON i.id=e.institution_id
                  JOIN schemes s ON s.id=e.scheme_id
                 WHERE p.id=:projectId AND (
                """ + institutionAccessPredicate() + "\n)";
        return jdbc.sql(sql).param("projectId", projectId).param("userId", userId)
                .query(ProjectRow.class).optional();
    }

    public boolean projectCodeExists(UUID enrollmentId, String code, UUID excludingId) {
        String sql = "SELECT count(*) FROM projects WHERE enrollment_id=:enrollmentId AND code=:code"
                + (excludingId == null ? "" : " AND id<>:excludingId");
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("enrollmentId", enrollmentId).param("code", code);
        if (excludingId != null) spec = spec.param("excludingId", excludingId);
        return nonZero(spec.query(Long.class).single());
    }

    public ProjectRow insertProject(ProjectWrite row, UUID userId) {
        jdbc.sql("""
                INSERT INTO projects
                    (id, enrollment_id, code, title, description, status, planned_start_on, planned_end_on, actual_start_on, actual_end_on)
                VALUES (:id, :enrollmentId, :code, :title, :description, :status, :plannedStartOn, :plannedEndOn, :actualStartOn, :actualEndOn)
                """)
                .param("id", row.id()).param("enrollmentId", row.enrollmentId()).param("code", row.code())
                .param("title", row.title()).param("description", row.description()).param("status", row.status())
                .param("plannedStartOn", row.plannedStartOn()).param("plannedEndOn", row.plannedEndOn())
                .param("actualStartOn", row.actualStartOn()).param("actualEndOn", row.actualEndOn()).update();
        return findProjectAccessible(userId, row.id()).orElseThrow();
    }

    public ProjectRow updateProject(ProjectWrite row, UUID userId) {
        jdbc.sql("""
                UPDATE projects SET code=:code, title=:title, description=:description, status=:status,
                                    planned_start_on=:plannedStartOn, planned_end_on=:plannedEndOn,
                                    actual_start_on=:actualStartOn, actual_end_on=:actualEndOn
                 WHERE id=:id
                """)
                .param("id", row.id()).param("code", row.code()).param("title", row.title())
                .param("description", row.description()).param("status", row.status())
                .param("plannedStartOn", row.plannedStartOn()).param("plannedEndOn", row.plannedEndOn())
                .param("actualStartOn", row.actualStartOn()).param("actualEndOn", row.actualEndOn()).update();
        return findProjectAccessible(userId, row.id()).orElseThrow();
    }

    public List<MilestoneRow> listMilestonesAccessible(UUID userId, UUID projectId) {
        String sql = """
                SELECT m.id, m.project_id, m.sequence_no, m.code, m.title, m.description,
                       m.status, m.due_on, m.completed_at, m.created_at, m.updated_at
                  FROM project_milestones m
                  JOIN projects p ON p.id=m.project_id
                  JOIN institution_scheme_enrollments e ON e.id=p.enrollment_id
                  JOIN institutions i ON i.id=e.institution_id
                 WHERE m.project_id=:projectId AND (
                """ + institutionAccessPredicate() + "\n) ORDER BY m.sequence_no, m.id";
        return jdbc.sql(sql).param("projectId", projectId).param("userId", userId)
                .query(MilestoneRow.class).list();
    }

    public Optional<MilestoneRow> findMilestoneAccessible(UUID userId, UUID projectId, UUID milestoneId) {
        String sql = """
                SELECT m.id, m.project_id, m.sequence_no, m.code, m.title, m.description,
                       m.status, m.due_on, m.completed_at, m.created_at, m.updated_at
                  FROM project_milestones m
                  JOIN projects p ON p.id=m.project_id
                  JOIN institution_scheme_enrollments e ON e.id=p.enrollment_id
                  JOIN institutions i ON i.id=e.institution_id
                 WHERE m.id=:milestoneId AND m.project_id=:projectId AND (
                """ + institutionAccessPredicate() + "\n)";
        return jdbc.sql(sql).param("milestoneId", milestoneId).param("projectId", projectId).param("userId", userId)
                .query(MilestoneRow.class).optional();
    }

    public boolean milestoneSequenceExists(UUID projectId, int sequenceNo, UUID excludingId) {
        String sql = "SELECT count(*) FROM project_milestones WHERE project_id=:projectId AND sequence_no=:sequenceNo"
                + (excludingId == null ? "" : " AND id<>:excludingId");
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("projectId", projectId).param("sequenceNo", sequenceNo);
        if (excludingId != null) spec = spec.param("excludingId", excludingId);
        return nonZero(spec.query(Long.class).single());
    }

    public boolean milestoneCodeExists(UUID projectId, String code, UUID excludingId) {
        if (code == null) return false;
        String sql = "SELECT count(*) FROM project_milestones WHERE project_id=:projectId AND lower(code)=lower(:code)"
                + (excludingId == null ? "" : " AND id<>:excludingId");
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("projectId", projectId).param("code", code);
        if (excludingId != null) spec = spec.param("excludingId", excludingId);
        return nonZero(spec.query(Long.class).single());
    }

    public MilestoneRow insertMilestone(MilestoneWrite row, UUID userId) {
        jdbc.sql("""
                INSERT INTO project_milestones
                    (id, project_id, sequence_no, code, title, description, status, due_on, completed_at)
                VALUES (:id, :projectId, :sequenceNo, :code, :title, :description, :status, :dueOn, :completedAt)
                """)
                .param("id", row.id()).param("projectId", row.projectId()).param("sequenceNo", row.sequenceNo())
                .param("code", row.code()).param("title", row.title()).param("description", row.description())
                .param("status", row.status()).param("dueOn", row.dueOn()).param("completedAt", row.completedAt()).update();
        return findMilestoneAccessible(userId, row.projectId(), row.id()).orElseThrow();
    }

    public MilestoneRow updateMilestone(MilestoneWrite row, UUID userId) {
        jdbc.sql("""
                UPDATE project_milestones SET sequence_no=:sequenceNo, code=:code, title=:title,
                                              description=:description, status=:status, due_on=:dueOn,
                                              completed_at=:completedAt
                 WHERE id=:id AND project_id=:projectId
                """)
                .param("id", row.id()).param("projectId", row.projectId()).param("sequenceNo", row.sequenceNo())
                .param("code", row.code()).param("title", row.title()).param("description", row.description())
                .param("status", row.status()).param("dueOn", row.dueOn()).param("completedAt", row.completedAt()).update();
        return findMilestoneAccessible(userId, row.projectId(), row.id()).orElseThrow();
    }

    private boolean exists(String table, String predicate, String value, UUID excludingId) {
        String sql = "SELECT count(*) FROM " + table + " WHERE " + predicate
                + (excludingId == null ? "" : " AND id<>:excludingId");
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("value", value);
        if (excludingId != null) spec = spec.param("excludingId", excludingId);
        return nonZero(spec.query(Long.class).single());
    }

    private JdbcClient.StatementSpec bindSchemeSearch(JdbcClient.StatementSpec spec, SchemeSearch criteria) {
        if (criteria.search() != null) spec = spec.param("search", criteria.search());
        if (criteria.status() != null) spec = spec.param("status", criteria.status());
        return spec;
    }

    private JdbcClient.StatementSpec bindEnrollmentSearch(JdbcClient.StatementSpec spec, UUID userId, EnrollmentSearch criteria) {
        spec = spec.param("userId", userId);
        if (criteria.institutionId() != null) spec = spec.param("institutionId", criteria.institutionId());
        if (criteria.schemeId() != null) spec = spec.param("schemeId", criteria.schemeId());
        if (criteria.status() != null) spec = spec.param("status", criteria.status());
        return spec;
    }

    private JdbcClient.StatementSpec bindProjectSearch(JdbcClient.StatementSpec spec, UUID userId, ProjectSearch criteria) {
        spec = spec.param("userId", userId);
        if (criteria.search() != null) spec = spec.param("search", criteria.search());
        if (criteria.institutionId() != null) spec = spec.param("institutionId", criteria.institutionId());
        if (criteria.schemeId() != null) spec = spec.param("schemeId", criteria.schemeId());
        if (criteria.status() != null) spec = spec.param("status", criteria.status());
        return spec;
    }

    private static boolean nonZero(Long value) {
        return value != null && value > 0;
    }

    private static String institutionAccessPredicate() {
        return """
                EXISTS (
                    SELECT 1 FROM institution_memberships im
                     WHERE im.institution_id=i.id AND im.user_id=:userId AND im.revoked_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM user_jurisdictions uj
                     WHERE uj.user_id=:userId AND uj.revoked_at IS NULL
                       AND (
                           uj.scope_type='NATIONAL'
                           OR (uj.scope_type='STATE' AND uj.state_id=i.state_id)
                           OR (uj.scope_type='DISTRICT' AND uj.district_id=i.district_id)
                       )
                )
                """;
    }

    public record PageRows<T>(List<T> items, long total) {}
    public record SchemeSearch(String search, String status, String sort, String direction, int limit, long offset) {}
    public record EnrollmentSearch(UUID institutionId, UUID schemeId, String status, boolean activeOnly, int limit, long offset) {}
    public record ProjectSearch(String search, UUID institutionId, UUID schemeId, String status, String sort, String direction, int limit, long offset) {}

    public record SchemeWrite(UUID id, String code, String name, String shortName, String description, String status,
                              LocalDate effectiveFrom, LocalDate effectiveTo) {}
    public record EnrollmentWrite(UUID id, UUID institutionId, UUID schemeId, String enrollmentCode, String status,
                                  LocalDate enrolledOn, LocalDate endedOn) {}
    public record ProjectWrite(UUID id, UUID enrollmentId, String code, String title, String description, String status,
                               LocalDate plannedStartOn, LocalDate plannedEndOn, LocalDate actualStartOn, LocalDate actualEndOn) {}
    public record MilestoneWrite(UUID id, UUID projectId, int sequenceNo, String code, String title, String description,
                                 String status, LocalDate dueOn, Instant completedAt) {}

    public record SchemeRow(UUID id, String code, String name, String shortName, String description, String status,
                            LocalDate effectiveFrom, LocalDate effectiveTo, Instant createdAt, Instant updatedAt) {}
    public record EnrollmentRow(UUID id, UUID institutionId, String institutionCode, String institutionName,
                                UUID schemeId, String schemeCode, String schemeName, String enrollmentCode, String status,
                                LocalDate enrolledOn, LocalDate endedOn, Instant createdAt, Instant updatedAt) {}
    public record ProjectRow(UUID id, UUID enrollmentId, UUID institutionId, String institutionCode, String institutionName,
                             UUID schemeId, String schemeCode, String schemeName, String code, String title, String description,
                             String status, LocalDate plannedStartOn, LocalDate plannedEndOn, LocalDate actualStartOn,
                             LocalDate actualEndOn, Instant createdAt, Instant updatedAt) {}
    public record MilestoneRow(UUID id, UUID projectId, int sequenceNo, String code, String title, String description,
                               String status, LocalDate dueOn, Instant completedAt, Instant createdAt, Instant updatedAt) {}
}
