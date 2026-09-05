package org.nirikshanx.inspectiontemplate;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class InspectionTemplateRepository {
    private final JdbcClient jdbc;

    public InspectionTemplateRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public PageRows<TemplateRow> searchTemplates(String search, int limit, int offset) {
        String where = search == null
                ? "1=1"
                : "(lower(t.code) LIKE :search OR lower(t.name) LIKE :search OR lower(COALESCE(t.description,'')) LIKE :search)";
        JdbcClient.StatementSpec count = jdbc.sql("SELECT count(*) FROM inspection_templates t WHERE " + where);
        if (search != null) count = count.param("search", search);
        Long total = count.query(Long.class).single();

        String sql = """
                SELECT t.id, t.code, t.name, t.description, t.created_by_user_id, t.created_at, t.updated_at,
                       (SELECT max(v.version_no) FROM inspection_template_versions v
                         WHERE v.template_id=t.id AND v.status='PUBLISHED') AS latest_published_version,
                       (SELECT max(v.version_no) FROM inspection_template_versions v
                         WHERE v.template_id=t.id AND v.status='DRAFT') AS draft_version
                  FROM inspection_templates t
                 WHERE %s
                 ORDER BY lower(t.name), t.id
                 LIMIT :limit OFFSET :offset
                """.formatted(where);
        JdbcClient.StatementSpec data = jdbc.sql(sql).param("limit", limit).param("offset", offset);
        if (search != null) data = data.param("search", search);
        return new PageRows<>(data.query(TemplateRow.class).list(), total == null ? 0L : total);
    }

    public Optional<TemplateRow> findTemplate(UUID templateId) {
        return jdbc.sql("""
                SELECT t.id, t.code, t.name, t.description, t.created_by_user_id, t.created_at, t.updated_at,
                       (SELECT max(v.version_no) FROM inspection_template_versions v
                         WHERE v.template_id=t.id AND v.status='PUBLISHED') AS latest_published_version,
                       (SELECT max(v.version_no) FROM inspection_template_versions v
                         WHERE v.template_id=t.id AND v.status='DRAFT') AS draft_version
                  FROM inspection_templates t
                 WHERE t.id=:templateId
                """)
                .param("templateId", templateId)
                .query(TemplateRow.class)
                .optional();
    }

    public boolean templateCodeExists(String code) {
        Long count = jdbc.sql("SELECT count(*) FROM inspection_templates WHERE code=:code")
                .param("code", code)
                .query(Long.class)
                .single();
        return count != null && count > 0;
    }

    public TemplateRow insertTemplate(UUID id, String code, String name, String description, UUID actorId) {
        jdbc.sql("""
                INSERT INTO inspection_templates (id, code, name, description, created_by_user_id)
                VALUES (:id, :code, :name, :description, :actorId)
                """)
                .param("id", id)
                .param("code", code)
                .param("name", name)
                .param("description", description)
                .param("actorId", actorId)
                .update();
        return findTemplate(id).orElseThrow();
    }

    public boolean lockTemplate(UUID templateId) {
        return jdbc.sql("SELECT id FROM inspection_templates WHERE id=:templateId FOR UPDATE")
                .param("templateId", templateId)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    public List<VersionRow> listVersions(UUID templateId) {
        return jdbc.sql("""
                SELECT id, template_id, version_no, status, change_summary, created_by_user_id,
                       published_by_user_id, published_at, created_at, updated_at
                  FROM inspection_template_versions
                 WHERE template_id=:templateId
                 ORDER BY version_no DESC, id
                """)
                .param("templateId", templateId)
                .query(VersionRow.class)
                .list();
    }

    public Optional<VersionRow> findVersion(UUID templateId, UUID versionId) {
        return jdbc.sql("""
                SELECT id, template_id, version_no, status, change_summary, created_by_user_id,
                       published_by_user_id, published_at, created_at, updated_at
                  FROM inspection_template_versions
                 WHERE template_id=:templateId AND id=:versionId
                """)
                .param("templateId", templateId)
                .param("versionId", versionId)
                .query(VersionRow.class)
                .optional();
    }

    public int nextVersionNumber(UUID templateId) {
        Integer value = jdbc.sql("SELECT COALESCE(max(version_no),0)+1 FROM inspection_template_versions WHERE template_id=:templateId")
                .param("templateId", templateId)
                .query(Integer.class)
                .single();
        return value == null ? 1 : value;
    }

    public VersionRow insertVersion(UUID id, UUID templateId, int versionNo, String changeSummary, UUID actorId) {
        jdbc.sql("""
                INSERT INTO inspection_template_versions
                    (id, template_id, version_no, status, change_summary, created_by_user_id)
                VALUES (:id, :templateId, :versionNo, 'DRAFT', :changeSummary, :actorId)
                """)
                .param("id", id)
                .param("templateId", templateId)
                .param("versionNo", versionNo)
                .param("changeSummary", changeSummary)
                .param("actorId", actorId)
                .update();
        return findVersion(templateId, id).orElseThrow();
    }

    public void publishVersion(UUID versionId, UUID actorId, Instant publishedAt) {
        jdbc.sql("""
                UPDATE inspection_template_versions
                   SET status='PUBLISHED', published_by_user_id=:actorId, published_at=:publishedAt
                 WHERE id=:versionId AND status='DRAFT'
                """)
                .param("actorId", actorId)
                .param("publishedAt", publishedAt.atOffset(ZoneOffset.UTC))
                .param("versionId", versionId)
                .update();
    }

    public void deleteDraftGraph(UUID versionId) {
        jdbc.sql("DELETE FROM evidence_requirements WHERE version_id=:versionId").param("versionId", versionId).update();
        jdbc.sql("DELETE FROM question_conditions WHERE version_id=:versionId").param("versionId", versionId).update();
        jdbc.sql("DELETE FROM question_options WHERE version_id=:versionId").param("versionId", versionId).update();
        jdbc.sql("DELETE FROM inspection_questions WHERE version_id=:versionId").param("versionId", versionId).update();
        jdbc.sql("DELETE FROM inspection_sections WHERE version_id=:versionId").param("versionId", versionId).update();
    }

    public void insertSection(SectionWrite row) {
        jdbc.sql("""
                INSERT INTO inspection_sections (id, version_id, code, title, description, sequence_no)
                VALUES (:id, :versionId, :code, :title, :description, :sequenceNo)
                """)
                .param("id", row.id()).param("versionId", row.versionId()).param("code", row.code())
                .param("title", row.title()).param("description", row.description()).param("sequenceNo", row.sequenceNo())
                .update();
    }

    public void insertQuestion(QuestionWrite row) {
        jdbc.sql("""
                INSERT INTO inspection_questions
                    (id, version_id, section_id, code, prompt, help_text, question_type, required, sequence_no)
                VALUES (:id, :versionId, :sectionId, :code, :prompt, :helpText, :questionType, :required, :sequenceNo)
                """)
                .param("id", row.id()).param("versionId", row.versionId()).param("sectionId", row.sectionId())
                .param("code", row.code()).param("prompt", row.prompt()).param("helpText", row.helpText())
                .param("questionType", row.questionType()).param("required", row.required()).param("sequenceNo", row.sequenceNo())
                .update();
    }

    public void insertOption(OptionWrite row) {
        jdbc.sql("""
                INSERT INTO question_options (id, version_id, question_id, value, label, sequence_no)
                VALUES (:id, :versionId, :questionId, :value, :label, :sequenceNo)
                """)
                .param("id", row.id()).param("versionId", row.versionId()).param("questionId", row.questionId())
                .param("value", row.value()).param("label", row.label()).param("sequenceNo", row.sequenceNo())
                .update();
    }

    public void insertCondition(ConditionWrite row) {
        jdbc.sql("""
                INSERT INTO question_conditions
                    (id, version_id, code, source_question_id, operator, comparison_value, target_question_id,
                     show_target, require_target_answer, suggest_finding, sequence_no)
                VALUES (:id, :versionId, :code, :sourceQuestionId, :operator, :comparisonValue, :targetQuestionId,
                        :showTarget, :requireTargetAnswer, :suggestFinding, :sequenceNo)
                """)
                .param("id", row.id()).param("versionId", row.versionId()).param("code", row.code())
                .param("sourceQuestionId", row.sourceQuestionId()).param("operator", row.operator())
                .param("comparisonValue", row.comparisonValue()).param("targetQuestionId", row.targetQuestionId())
                .param("showTarget", row.showTarget()).param("requireTargetAnswer", row.requireTargetAnswer())
                .param("suggestFinding", row.suggestFinding()).param("sequenceNo", row.sequenceNo())
                .update();
    }

    public void insertEvidenceRequirement(EvidenceWrite row) {
        jdbc.sql("""
                INSERT INTO evidence_requirements
                    (id, version_id, question_id, condition_id, evidence_type, min_count, instructions, sequence_no)
                VALUES (:id, :versionId, :questionId, :conditionId, :evidenceType, :minCount, :instructions, :sequenceNo)
                """)
                .param("id", row.id()).param("versionId", row.versionId()).param("questionId", row.questionId())
                .param("conditionId", row.conditionId()).param("evidenceType", row.evidenceType())
                .param("minCount", row.minCount()).param("instructions", row.instructions()).param("sequenceNo", row.sequenceNo())
                .update();
    }

    public List<SectionRow> listSections(UUID versionId) {
        return jdbc.sql("""
                SELECT id, version_id, code, title, description, sequence_no, created_at, updated_at
                  FROM inspection_sections WHERE version_id=:versionId
                 ORDER BY sequence_no, id
                """)
                .param("versionId", versionId).query(SectionRow.class).list();
    }

    public List<QuestionRow> listQuestions(UUID versionId) {
        return jdbc.sql("""
                SELECT id, version_id, section_id, code, prompt, help_text, question_type, required,
                       sequence_no, created_at, updated_at
                  FROM inspection_questions WHERE version_id=:versionId
                 ORDER BY section_id, sequence_no, id
                """)
                .param("versionId", versionId).query(QuestionRow.class).list();
    }

    public List<OptionRow> listOptions(UUID versionId) {
        return jdbc.sql("""
                SELECT id, version_id, question_id, value, label, sequence_no, created_at, updated_at
                  FROM question_options WHERE version_id=:versionId
                 ORDER BY question_id, sequence_no, id
                """)
                .param("versionId", versionId).query(OptionRow.class).list();
    }

    public List<ConditionRow> listConditions(UUID versionId) {
        return jdbc.sql("""
                SELECT c.id, c.version_id, c.code,
                       c.source_question_id, sq.code AS source_question_code,
                       c.operator, c.comparison_value,
                       c.target_question_id, tq.code AS target_question_code,
                       c.show_target, c.require_target_answer, c.suggest_finding, c.sequence_no,
                       c.created_at, c.updated_at
                  FROM question_conditions c
                  JOIN inspection_questions sq ON sq.id=c.source_question_id
                  LEFT JOIN inspection_questions tq ON tq.id=c.target_question_id
                 WHERE c.version_id=:versionId
                 ORDER BY sq.code, c.sequence_no, c.id
                """)
                .param("versionId", versionId).query(ConditionRow.class).list();
    }

    public List<EvidenceRow> listEvidenceRequirements(UUID versionId) {
        return jdbc.sql("""
                SELECT e.id, e.version_id, e.question_id, q.code AS question_code,
                       e.condition_id, c.code AS condition_code,
                       e.evidence_type, e.min_count, e.instructions, e.sequence_no,
                       e.created_at, e.updated_at
                  FROM evidence_requirements e
                  JOIN inspection_questions q ON q.id=e.question_id
                  LEFT JOIN question_conditions c ON c.id=e.condition_id
                 WHERE e.version_id=:versionId
                 ORDER BY q.code, e.sequence_no, e.id
                """)
                .param("versionId", versionId).query(EvidenceRow.class).list();
    }

    public record PageRows<T>(List<T> items, long total) {}

    public record TemplateRow(
            UUID id, String code, String name, String description, UUID createdByUserId,
            Instant createdAt, Instant updatedAt, Integer latestPublishedVersion, Integer draftVersion) {}

    public record VersionRow(
            UUID id, UUID templateId, int versionNo, String status, String changeSummary,
            UUID createdByUserId, UUID publishedByUserId, Instant publishedAt, Instant createdAt, Instant updatedAt) {}

    public record SectionRow(
            UUID id, UUID versionId, String code, String title, String description,
            int sequenceNo, Instant createdAt, Instant updatedAt) {}

    public record QuestionRow(
            UUID id, UUID versionId, UUID sectionId, String code, String prompt, String helpText,
            String questionType, boolean required, int sequenceNo, Instant createdAt, Instant updatedAt) {}

    public record OptionRow(
            UUID id, UUID versionId, UUID questionId, String value, String label,
            int sequenceNo, Instant createdAt, Instant updatedAt) {}

    public record ConditionRow(
            UUID id, UUID versionId, String code, UUID sourceQuestionId, String sourceQuestionCode,
            String operator, String comparisonValue, UUID targetQuestionId, String targetQuestionCode,
            boolean showTarget, boolean requireTargetAnswer, boolean suggestFinding, int sequenceNo,
            Instant createdAt, Instant updatedAt) {}

    public record EvidenceRow(
            UUID id, UUID versionId, UUID questionId, String questionCode,
            UUID conditionId, String conditionCode, String evidenceType, int minCount,
            String instructions, int sequenceNo, Instant createdAt, Instant updatedAt) {}

    public record SectionWrite(UUID id, UUID versionId, String code, String title, String description, int sequenceNo) {}
    public record QuestionWrite(
            UUID id, UUID versionId, UUID sectionId, String code, String prompt, String helpText,
            String questionType, boolean required, int sequenceNo) {}
    public record OptionWrite(UUID id, UUID versionId, UUID questionId, String value, String label, int sequenceNo) {}
    public record ConditionWrite(
            UUID id, UUID versionId, String code, UUID sourceQuestionId, String operator, String comparisonValue,
            UUID targetQuestionId, boolean showTarget, boolean requireTargetAnswer, boolean suggestFinding, int sequenceNo) {}
    public record EvidenceWrite(
            UUID id, UUID versionId, UUID questionId, UUID conditionId, String evidenceType,
            int minCount, String instructions, int sequenceNo) {}
}