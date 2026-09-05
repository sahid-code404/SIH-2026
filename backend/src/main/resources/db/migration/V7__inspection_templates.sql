CREATE TABLE inspection_templates (
    id UUID PRIMARY KEY,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(240) NOT NULL,
    description VARCHAR(2000),
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_inspection_templates_code UNIQUE (code),
    CONSTRAINT fk_inspection_templates_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_inspection_templates_code CHECK (
        code = upper(btrim(code))
        AND code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
    ),
    CONSTRAINT ck_inspection_templates_name CHECK (
        name = btrim(name) AND char_length(name) BETWEEN 1 AND 240
    ),
    CONSTRAINT ck_inspection_templates_description CHECK (
        description IS NULL OR (description = btrim(description) AND char_length(description) BETWEEN 1 AND 2000)
    ),
    CONSTRAINT ck_inspection_templates_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX idx_inspection_templates_name_ci ON inspection_templates(lower(name), id);

CREATE TRIGGER trg_inspection_templates_maintain_audit_timestamps
    BEFORE UPDATE ON inspection_templates
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE inspection_template_versions (
    id UUID PRIMARY KEY,
    template_id UUID NOT NULL,
    version_no INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    change_summary VARCHAR(1000),
    created_by_user_id UUID NOT NULL,
    published_by_user_id UUID,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inspection_template_versions_template
        FOREIGN KEY (template_id) REFERENCES inspection_templates(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_inspection_template_versions_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_inspection_template_versions_published_by
        FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_inspection_template_versions_number UNIQUE (template_id, version_no),
    CONSTRAINT uq_inspection_template_versions_id_template UNIQUE (id, template_id),
    CONSTRAINT ck_inspection_template_versions_number CHECK (version_no > 0),
    CONSTRAINT ck_inspection_template_versions_status CHECK (status IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT ck_inspection_template_versions_summary CHECK (
        change_summary IS NULL OR (change_summary = btrim(change_summary) AND char_length(change_summary) BETWEEN 1 AND 1000)
    ),
    CONSTRAINT ck_inspection_template_versions_publish_state CHECK (
        (status = 'DRAFT' AND published_at IS NULL AND published_by_user_id IS NULL)
        OR (status = 'PUBLISHED' AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL)
    ),
    CONSTRAINT ck_inspection_template_versions_timestamp_order CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX uq_inspection_template_versions_one_draft
    ON inspection_template_versions(template_id)
    WHERE status = 'DRAFT';
CREATE INDEX idx_inspection_template_versions_template_status
    ON inspection_template_versions(template_id, status, version_no DESC, id);

CREATE OR REPLACE FUNCTION nirikshanx_guard_published_template_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'Published inspection template versions are immutable.'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'DRAFT' THEN
        NEW.published_at := NULL;
        NEW.published_by_user_id := NULL;
    ELSIF NEW.status = 'PUBLISHED' THEN
        IF NEW.published_at IS NULL OR NEW.published_by_user_id IS NULL THEN
            RAISE EXCEPTION 'Publishing requires published_at and published_by_user_id.'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inspection_template_versions_guard_publish
    BEFORE UPDATE ON inspection_template_versions
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_guard_published_template_version();

CREATE TRIGGER trg_inspection_template_versions_maintain_audit_timestamps
    BEFORE UPDATE ON inspection_template_versions
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE inspection_sections (
    id UUID PRIMARY KEY,
    version_id UUID NOT NULL,
    code VARCHAR(64) NOT NULL,
    title VARCHAR(240) NOT NULL,
    description VARCHAR(1000),
    sequence_no INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inspection_sections_version
        FOREIGN KEY (version_id) REFERENCES inspection_template_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_inspection_sections_id_version UNIQUE (id, version_id),
    CONSTRAINT uq_inspection_sections_code UNIQUE (version_id, code),
    CONSTRAINT uq_inspection_sections_sequence UNIQUE (version_id, sequence_no),
    CONSTRAINT ck_inspection_sections_code CHECK (
        code = upper(btrim(code)) AND code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
    ),
    CONSTRAINT ck_inspection_sections_title CHECK (
        title = btrim(title) AND char_length(title) BETWEEN 1 AND 240
    ),
    CONSTRAINT ck_inspection_sections_description CHECK (
        description IS NULL OR (description = btrim(description) AND char_length(description) BETWEEN 1 AND 1000)
    ),
    CONSTRAINT ck_inspection_sections_sequence CHECK (sequence_no > 0),
    CONSTRAINT ck_inspection_sections_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX idx_inspection_sections_version_sequence
    ON inspection_sections(version_id, sequence_no, id);

CREATE TRIGGER trg_inspection_sections_maintain_audit_timestamps
    BEFORE UPDATE ON inspection_sections
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE inspection_questions (
    id UUID PRIMARY KEY,
    version_id UUID NOT NULL,
    section_id UUID NOT NULL,
    code VARCHAR(64) NOT NULL,
    prompt VARCHAR(1000) NOT NULL,
    help_text VARCHAR(1000),
    question_type VARCHAR(32) NOT NULL,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    sequence_no INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inspection_questions_version
        FOREIGN KEY (version_id) REFERENCES inspection_template_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_inspection_questions_section_version
        FOREIGN KEY (section_id, version_id) REFERENCES inspection_sections(id, version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_inspection_questions_id_version UNIQUE (id, version_id),
    CONSTRAINT uq_inspection_questions_code UNIQUE (version_id, code),
    CONSTRAINT uq_inspection_questions_sequence UNIQUE (section_id, sequence_no),
    CONSTRAINT ck_inspection_questions_code CHECK (
        code = upper(btrim(code)) AND code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
    ),
    CONSTRAINT ck_inspection_questions_prompt CHECK (
        prompt = btrim(prompt) AND char_length(prompt) BETWEEN 1 AND 1000
    ),
    CONSTRAINT ck_inspection_questions_help CHECK (
        help_text IS NULL OR (help_text = btrim(help_text) AND char_length(help_text) BETWEEN 1 AND 1000)
    ),
    CONSTRAINT ck_inspection_questions_type CHECK (question_type IN (
        'YES_NO', 'TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT',
        'PHOTO', 'VIDEO', 'DOCUMENT', 'LOCATION_CONFIRMATION'
    )),
    CONSTRAINT ck_inspection_questions_sequence CHECK (sequence_no > 0),
    CONSTRAINT ck_inspection_questions_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX idx_inspection_questions_version_section_sequence
    ON inspection_questions(version_id, section_id, sequence_no, id);

CREATE TRIGGER trg_inspection_questions_maintain_audit_timestamps
    BEFORE UPDATE ON inspection_questions
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE question_options (
    id UUID PRIMARY KEY,
    version_id UUID NOT NULL,
    question_id UUID NOT NULL,
    value VARCHAR(96) NOT NULL,
    label VARCHAR(240) NOT NULL,
    sequence_no INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_question_options_question_version
        FOREIGN KEY (question_id, version_id) REFERENCES inspection_questions(id, version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_question_options_id_version UNIQUE (id, version_id),
    CONSTRAINT uq_question_options_value UNIQUE (question_id, value),
    CONSTRAINT uq_question_options_sequence UNIQUE (question_id, sequence_no),
    CONSTRAINT ck_question_options_value CHECK (
        value = upper(btrim(value)) AND value ~ '^[A-Z0-9][A-Z0-9._/-]{0,95}$'
    ),
    CONSTRAINT ck_question_options_label CHECK (
        label = btrim(label) AND char_length(label) BETWEEN 1 AND 240
    ),
    CONSTRAINT ck_question_options_sequence CHECK (sequence_no > 0),
    CONSTRAINT ck_question_options_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX idx_question_options_question_sequence
    ON question_options(question_id, sequence_no, id);

CREATE TRIGGER trg_question_options_maintain_audit_timestamps
    BEFORE UPDATE ON question_options
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE question_conditions (
    id UUID PRIMARY KEY,
    version_id UUID NOT NULL,
    code VARCHAR(64) NOT NULL,
    source_question_id UUID NOT NULL,
    operator VARCHAR(32) NOT NULL,
    comparison_value VARCHAR(240),
    target_question_id UUID,
    show_target BOOLEAN NOT NULL DEFAULT FALSE,
    require_target_answer BOOLEAN NOT NULL DEFAULT FALSE,
    suggest_finding BOOLEAN NOT NULL DEFAULT FALSE,
    sequence_no INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_question_conditions_source_version
        FOREIGN KEY (source_question_id, version_id) REFERENCES inspection_questions(id, version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_question_conditions_target_version
        FOREIGN KEY (target_question_id, version_id) REFERENCES inspection_questions(id, version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_question_conditions_id_version UNIQUE (id, version_id),
    CONSTRAINT uq_question_conditions_code UNIQUE (version_id, code),
    CONSTRAINT uq_question_conditions_sequence UNIQUE (source_question_id, sequence_no),
    CONSTRAINT ck_question_conditions_code CHECK (
        code = upper(btrim(code)) AND code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
    ),
    CONSTRAINT ck_question_conditions_operator CHECK (operator IN (
        'EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS',
        'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL',
        'IS_EMPTY', 'IS_NOT_EMPTY'
    )),
    CONSTRAINT ck_question_conditions_comparison CHECK (
        (operator IN ('IS_EMPTY', 'IS_NOT_EMPTY') AND comparison_value IS NULL)
        OR (operator NOT IN ('IS_EMPTY', 'IS_NOT_EMPTY')
            AND comparison_value IS NOT NULL
            AND comparison_value = btrim(comparison_value)
            AND char_length(comparison_value) BETWEEN 1 AND 240)
    ),
    CONSTRAINT ck_question_conditions_target CHECK (
        target_question_id IS NULL OR target_question_id <> source_question_id
    ),
    CONSTRAINT ck_question_conditions_target_effect CHECK (
        (NOT show_target AND NOT require_target_answer) OR target_question_id IS NOT NULL
    ),
    CONSTRAINT ck_question_conditions_sequence CHECK (sequence_no > 0),
    CONSTRAINT ck_question_conditions_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX idx_question_conditions_version_source
    ON question_conditions(version_id, source_question_id, sequence_no, id);
CREATE INDEX idx_question_conditions_target
    ON question_conditions(target_question_id, id) WHERE target_question_id IS NOT NULL;

CREATE TRIGGER trg_question_conditions_maintain_audit_timestamps
    BEFORE UPDATE ON question_conditions
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE evidence_requirements (
    id UUID PRIMARY KEY,
    version_id UUID NOT NULL,
    question_id UUID NOT NULL,
    condition_id UUID,
    evidence_type VARCHAR(32) NOT NULL,
    min_count INTEGER NOT NULL DEFAULT 1,
    instructions VARCHAR(1000),
    sequence_no INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evidence_requirements_question_version
        FOREIGN KEY (question_id, version_id) REFERENCES inspection_questions(id, version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_evidence_requirements_condition_version
        FOREIGN KEY (condition_id, version_id) REFERENCES question_conditions(id, version_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_evidence_requirements_sequence UNIQUE (question_id, sequence_no),
    CONSTRAINT ck_evidence_requirements_type CHECK (
        evidence_type IN ('PHOTO', 'VIDEO', 'DOCUMENT', 'LOCATION_CONFIRMATION')
    ),
    CONSTRAINT ck_evidence_requirements_min_count CHECK (min_count BETWEEN 1 AND 20),
    CONSTRAINT ck_evidence_requirements_instructions CHECK (
        instructions IS NULL OR (instructions = btrim(instructions) AND char_length(instructions) BETWEEN 1 AND 1000)
    ),
    CONSTRAINT ck_evidence_requirements_sequence CHECK (sequence_no > 0),
    CONSTRAINT ck_evidence_requirements_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX idx_evidence_requirements_version_question
    ON evidence_requirements(version_id, question_id, sequence_no, id);
CREATE INDEX idx_evidence_requirements_condition
    ON evidence_requirements(condition_id, id) WHERE condition_id IS NOT NULL;

CREATE TRIGGER trg_evidence_requirements_maintain_audit_timestamps
    BEFORE UPDATE ON evidence_requirements
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

-- Template graph rows can only be inserted, updated or deleted while their parent version is DRAFT.
CREATE OR REPLACE FUNCTION nirikshanx_require_draft_template_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_version UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_version := OLD.version_id;
    ELSE
        target_version := NEW.version_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM inspection_template_versions v
         WHERE v.id = target_version AND v.status = 'DRAFT'
    ) THEN
        RAISE EXCEPTION 'Inspection template content is immutable outside a draft version.'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inspection_sections_require_draft
    BEFORE INSERT OR UPDATE OR DELETE ON inspection_sections
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_require_draft_template_version();
CREATE TRIGGER trg_inspection_questions_require_draft
    BEFORE INSERT OR UPDATE OR DELETE ON inspection_questions
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_require_draft_template_version();
CREATE TRIGGER trg_question_options_require_draft
    BEFORE INSERT OR UPDATE OR DELETE ON question_options
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_require_draft_template_version();
CREATE TRIGGER trg_question_conditions_require_draft
    BEFORE INSERT OR UPDATE OR DELETE ON question_conditions
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_require_draft_template_version();
CREATE TRIGGER trg_evidence_requirements_require_draft
    BEFORE INSERT OR UPDATE OR DELETE ON evidence_requirements
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_require_draft_template_version();

COMMENT ON TABLE inspection_templates IS
    'Stable inspection template identities. Questionnaire content lives only in numbered versions.';
COMMENT ON TABLE inspection_template_versions IS
    'Versioned questionnaire snapshots. Published versions are immutable; changes require a new draft version.';
COMMENT ON TABLE inspection_sections IS
    'Ordered sections within one inspection template version.';
COMMENT ON TABLE inspection_questions IS
    'Ordered, typed inspection questions; production questionnaires are data, never hardcoded source code.';
COMMENT ON TABLE question_options IS
    'Ordered options for SINGLE_SELECT and MULTI_SELECT questions; compatibility is backend-validated.';
COMMENT ON TABLE question_conditions IS
    'Backend-validated conditional triggers and effects between questions in the same template version.';
COMMENT ON TABLE evidence_requirements IS
    'Typed evidence requirements, optionally activated by a condition; evidence may intentionally differ from the source question type.';