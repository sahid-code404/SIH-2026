CREATE TABLE schemes (
    id UUID PRIMARY KEY,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(240) NOT NULL,
    short_name VARCHAR(120),
    description VARCHAR(2000),
    status VARCHAR(64) NOT NULL,
    effective_from DATE,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_schemes_code UNIQUE (code),
    CONSTRAINT ck_schemes_code CHECK (
        code = upper(btrim(code))
        AND code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
    ),
    CONSTRAINT ck_schemes_name CHECK (
        name = btrim(name) AND char_length(name) BETWEEN 1 AND 240
    ),
    CONSTRAINT ck_schemes_short_name CHECK (
        short_name IS NULL OR (short_name = btrim(short_name) AND char_length(short_name) BETWEEN 1 AND 120)
    ),
    CONSTRAINT ck_schemes_description CHECK (
        description IS NULL OR (description = btrim(description) AND char_length(description) BETWEEN 1 AND 2000)
    ),
    CONSTRAINT ck_schemes_status CHECK (
        status = upper(btrim(status))
        AND status ~ '^[A-Z][A-Z0-9_]{1,63}$'
    ),
    CONSTRAINT ck_schemes_effective_dates CHECK (
        effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from
    ),
    CONSTRAINT ck_schemes_timestamp_order CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX uq_schemes_name_ci ON schemes(lower(name));
CREATE INDEX idx_schemes_status_name ON schemes(status, name, id);
CREATE INDEX idx_schemes_name_ci ON schemes(lower(name), id);

CREATE TRIGGER trg_schemes_maintain_audit_timestamps
    BEFORE UPDATE ON schemes
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE institution_scheme_enrollments (
    id UUID PRIMARY KEY,
    institution_id UUID NOT NULL,
    scheme_id UUID NOT NULL,
    enrollment_code VARCHAR(96),
    status VARCHAR(64) NOT NULL,
    enrolled_on DATE NOT NULL,
    ended_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_scheme_enrollments_institution
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_scheme_enrollments_scheme
        FOREIGN KEY (scheme_id) REFERENCES schemes(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_scheme_enrollments_code CHECK (
        enrollment_code IS NULL OR (
            enrollment_code = upper(btrim(enrollment_code))
            AND enrollment_code ~ '^[A-Z0-9][A-Z0-9._/-]{1,95}$'
        )
    ),
    CONSTRAINT ck_scheme_enrollments_status CHECK (
        status = upper(btrim(status))
        AND status ~ '^[A-Z][A-Z0-9_]{1,63}$'
    ),
    CONSTRAINT ck_scheme_enrollments_dates CHECK (
        ended_on IS NULL OR ended_on >= enrolled_on
    ),
    CONSTRAINT ck_scheme_enrollments_timestamp_order CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX uq_scheme_enrollments_active
    ON institution_scheme_enrollments(institution_id, scheme_id)
    WHERE ended_on IS NULL;
CREATE UNIQUE INDEX uq_scheme_enrollment_code_ci
    ON institution_scheme_enrollments(scheme_id, lower(enrollment_code))
    WHERE enrollment_code IS NOT NULL;
CREATE INDEX idx_scheme_enrollments_institution
    ON institution_scheme_enrollments(institution_id, status, scheme_id, id);
CREATE INDEX idx_scheme_enrollments_scheme
    ON institution_scheme_enrollments(scheme_id, status, institution_id, id);

CREATE TRIGGER trg_scheme_enrollments_maintain_audit_timestamps
    BEFORE UPDATE ON institution_scheme_enrollments
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE projects (
    id UUID PRIMARY KEY,
    enrollment_id UUID NOT NULL,
    code VARCHAR(64) NOT NULL,
    title VARCHAR(240) NOT NULL,
    description VARCHAR(2000),
    status VARCHAR(64) NOT NULL,
    planned_start_on DATE,
    planned_end_on DATE,
    actual_start_on DATE,
    actual_end_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_enrollment
        FOREIGN KEY (enrollment_id) REFERENCES institution_scheme_enrollments(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_projects_enrollment_code UNIQUE (enrollment_id, code),
    CONSTRAINT ck_projects_code CHECK (
        code = upper(btrim(code))
        AND code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
    ),
    CONSTRAINT ck_projects_title CHECK (
        title = btrim(title) AND char_length(title) BETWEEN 1 AND 240
    ),
    CONSTRAINT ck_projects_description CHECK (
        description IS NULL OR (description = btrim(description) AND char_length(description) BETWEEN 1 AND 2000)
    ),
    CONSTRAINT ck_projects_status CHECK (
        status = upper(btrim(status))
        AND status ~ '^[A-Z][A-Z0-9_]{1,63}$'
    ),
    CONSTRAINT ck_projects_planned_dates CHECK (
        planned_start_on IS NULL OR planned_end_on IS NULL OR planned_end_on >= planned_start_on
    ),
    CONSTRAINT ck_projects_actual_dates CHECK (
        actual_start_on IS NULL OR actual_end_on IS NULL OR actual_end_on >= actual_start_on
    ),
    CONSTRAINT ck_projects_timestamp_order CHECK (updated_at >= created_at)
);

CREATE INDEX idx_projects_enrollment_status
    ON projects(enrollment_id, status, title, id);
CREATE INDEX idx_projects_title_ci ON projects(lower(title), id);
CREATE INDEX idx_projects_code_ci ON projects(lower(code), id);

CREATE TRIGGER trg_projects_maintain_audit_timestamps
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE project_milestones (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    sequence_no INTEGER NOT NULL,
    code VARCHAR(64),
    title VARCHAR(240) NOT NULL,
    description VARCHAR(2000),
    status VARCHAR(64) NOT NULL,
    due_on DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_milestones_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_project_milestones_sequence UNIQUE (project_id, sequence_no),
    CONSTRAINT ck_project_milestones_sequence CHECK (sequence_no > 0),
    CONSTRAINT ck_project_milestones_code CHECK (
        code IS NULL OR (
            code = upper(btrim(code))
            AND code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
        )
    ),
    CONSTRAINT ck_project_milestones_title CHECK (
        title = btrim(title) AND char_length(title) BETWEEN 1 AND 240
    ),
    CONSTRAINT ck_project_milestones_description CHECK (
        description IS NULL OR (description = btrim(description) AND char_length(description) BETWEEN 1 AND 2000)
    ),
    CONSTRAINT ck_project_milestones_status CHECK (
        status = upper(btrim(status))
        AND status ~ '^[A-Z][A-Z0-9_]{1,63}$'
    ),
    CONSTRAINT ck_project_milestones_timestamp_order CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX uq_project_milestones_code_ci
    ON project_milestones(project_id, lower(code))
    WHERE code IS NOT NULL;
CREATE INDEX idx_project_milestones_project_due
    ON project_milestones(project_id, due_on, sequence_no, id);
CREATE INDEX idx_project_milestones_status_due
    ON project_milestones(status, due_on, id);

CREATE TRIGGER trg_project_milestones_maintain_audit_timestamps
    BEFORE UPDATE ON project_milestones
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

-- Phase 7 extends the granular permission catalog. These permissions describe capability only;
-- institution jurisdiction/membership still determines resource scope for enrollments/projects/milestones.
INSERT INTO permissions (id, code, description) VALUES
('20000000-0000-0000-0000-000000000030', 'scheme.read', 'Read the canonical scheme catalog.'),
('20000000-0000-0000-0000-000000000031', 'scheme.create', 'Create canonical scheme definitions.'),
('20000000-0000-0000-0000-000000000032', 'scheme.update', 'Update canonical scheme definitions.'),
('20000000-0000-0000-0000-000000000033', 'enrollment.read', 'Read institution scheme enrollments within authorized institution scope.'),
('20000000-0000-0000-0000-000000000034', 'enrollment.create', 'Create institution scheme enrollments within authorized institution scope.'),
('20000000-0000-0000-0000-000000000035', 'enrollment.update', 'Update institution scheme enrollments within authorized institution scope.'),
('20000000-0000-0000-0000-000000000036', 'project.read', 'Read projects within authorized institution scope.'),
('20000000-0000-0000-0000-000000000037', 'project.create', 'Create projects within authorized institution scope.'),
('20000000-0000-0000-0000-000000000038', 'project.update', 'Update projects within authorized institution scope.'),
('20000000-0000-0000-0000-000000000039', 'milestone.read', 'Read project milestones within authorized institution scope.'),
('20000000-0000-0000-0000-000000000040', 'milestone.create', 'Create project milestones within authorized institution scope.'),
('20000000-0000-0000-0000-000000000041', 'milestone.update', 'Update project milestones within authorized institution scope.');

-- System and Ministry administrators receive all Phase 7 capabilities.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN (
      'scheme.read','scheme.create','scheme.update',
      'enrollment.read','enrollment.create','enrollment.update',
      'project.read','project.create','project.update',
      'milestone.read','milestone.create','milestone.update'
  )
 WHERE r.code IN ('SYSTEM_ADMIN', 'MINISTRY_ADMIN');

-- Ministry/State/District officers operate programs within their jurisdiction but do not mutate the global scheme catalog.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN (
      'scheme.read',
      'enrollment.read','enrollment.create','enrollment.update',
      'project.read','project.create','project.update',
      'milestone.read','milestone.create','milestone.update'
  )
 WHERE r.code IN ('MINISTRY_OFFICER', 'STATE_OFFICER', 'DISTRICT_OFFICER');

-- Inspection roles need contextual read access only in this phase.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('scheme.read','enrollment.read','project.read','milestone.read')
 WHERE r.code IN ('INSPECTION_SUPERVISOR', 'INSPECTOR');

-- Institution administrators can manage their own institution's projects and milestones, but cannot self-enroll into schemes.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN (
      'scheme.read','enrollment.read',
      'project.read','project.create','project.update',
      'milestone.read','milestone.create','milestone.update'
  )
 WHERE r.code = 'INSTITUTION_ADMIN';

-- Institution operators and auditors are read-only for Phase 7 program data.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('scheme.read','enrollment.read','project.read','milestone.read')
 WHERE r.code IN ('INSTITUTION_OPERATOR', 'AUDITOR');

COMMENT ON TABLE schemes IS
    'Scheme-agnostic canonical scheme catalog. Scheme-specific policy fields are intentionally not hardcoded.';
COMMENT ON TABLE institution_scheme_enrollments IS
    'Relates institutions to schemes. An active enrollment is represented by ended_on IS NULL.';
COMMENT ON TABLE projects IS
    'Projects inherit their canonical institution and scheme through enrollment_id; duplicated unchecked institution/scheme strings are avoided.';
COMMENT ON TABLE project_milestones IS
    'Ordered project milestones with normalized policy status and no scheme-specific hardcoded fields.';
