ALTER TABLE districts
    ADD CONSTRAINT uq_districts_id_state UNIQUE (id, state_id);

ALTER TABLE user_sessions
    ADD COLUMN mfa_verified_at TIMESTAMPTZ,
    ADD CONSTRAINT ck_user_sessions_mfa_verified
        CHECK (mfa_verified_at IS NULL OR mfa_verified_at >= created_at);

CREATE TABLE roles (
    id UUID PRIMARY KEY,
    code VARCHAR(64) NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    description VARCHAR(500),
    mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
    system_defined BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_roles_code UNIQUE (code),
    CONSTRAINT ck_roles_code CHECK (
        code = upper(btrim(code))
        AND code ~ '^[A-Z][A-Z0-9_]{1,63}$'
    ),
    CONSTRAINT ck_roles_display_name CHECK (
        display_name = btrim(display_name)
        AND char_length(display_name) BETWEEN 1 AND 160
    ),
    CONSTRAINT ck_roles_description CHECK (
        description IS NULL OR (description = btrim(description) AND char_length(description) BETWEEN 1 AND 500)
    ),
    CONSTRAINT ck_roles_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TRIGGER trg_roles_maintain_audit_timestamps
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE permissions (
    id UUID PRIMARY KEY,
    code VARCHAR(96) NOT NULL,
    description VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_permissions_code UNIQUE (code),
    CONSTRAINT ck_permissions_code CHECK (
        code = lower(btrim(code))
        AND code ~ '^[a-z][a-z0-9_]*([.][a-z][a-z0-9_]*)+$'
    ),
    CONSTRAINT ck_permissions_description CHECK (
        description = btrim(description)
        AND char_length(description) BETWEEN 1 AND 500
    ),
    CONSTRAINT ck_permissions_timestamp_order CHECK (updated_at >= created_at)
);

CREATE TRIGGER trg_permissions_maintain_audit_timestamps
    BEFORE UPDATE ON permissions
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE role_permissions (
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id) REFERENCES roles(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id, role_id);

CREATE TABLE user_roles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    assigned_by_user_id UUID,
    assignment_source VARCHAR(24) NOT NULL DEFAULT 'ADMIN',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id UUID,
    revocation_reason VARCHAR(240),
    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id) REFERENCES roles(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_user_roles_assigned_by
        FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_user_roles_revoked_by
        FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_user_roles_source CHECK (assignment_source IN ('BOOTSTRAP', 'ADMIN')),
    CONSTRAINT ck_user_roles_revocation CHECK (
        (revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason IS NULL)
        OR
        (revoked_at IS NOT NULL AND revoked_at >= assigned_at AND revocation_reason IS NOT NULL
            AND revocation_reason = btrim(revocation_reason) AND char_length(revocation_reason) BETWEEN 1 AND 240)
    )
);

CREATE UNIQUE INDEX uq_user_roles_active
    ON user_roles(user_id, role_id)
    WHERE revoked_at IS NULL;
CREATE INDEX idx_user_roles_user_history ON user_roles(user_id, assigned_at DESC);
CREATE INDEX idx_user_roles_role_active ON user_roles(role_id, user_id) WHERE revoked_at IS NULL;

CREATE TABLE user_jurisdictions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    scope_type VARCHAR(16) NOT NULL,
    state_id UUID,
    district_id UUID,
    assigned_by_user_id UUID,
    assignment_source VARCHAR(24) NOT NULL DEFAULT 'ADMIN',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id UUID,
    revocation_reason VARCHAR(240),
    CONSTRAINT fk_user_jurisdictions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_user_jurisdictions_state
        FOREIGN KEY (state_id) REFERENCES states(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_user_jurisdictions_district_state
        FOREIGN KEY (district_id, state_id) REFERENCES districts(id, state_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_user_jurisdictions_assigned_by
        FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_user_jurisdictions_revoked_by
        FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_user_jurisdictions_scope CHECK (scope_type IN ('NATIONAL', 'STATE', 'DISTRICT')),
    CONSTRAINT ck_user_jurisdictions_shape CHECK (
        (scope_type = 'NATIONAL' AND state_id IS NULL AND district_id IS NULL)
        OR (scope_type = 'STATE' AND state_id IS NOT NULL AND district_id IS NULL)
        OR (scope_type = 'DISTRICT' AND state_id IS NOT NULL AND district_id IS NOT NULL)
    ),
    CONSTRAINT ck_user_jurisdictions_source CHECK (assignment_source IN ('BOOTSTRAP', 'ADMIN')),
    CONSTRAINT ck_user_jurisdictions_revocation CHECK (
        (revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason IS NULL)
        OR
        (revoked_at IS NOT NULL AND revoked_at >= assigned_at AND revocation_reason IS NOT NULL
            AND revocation_reason = btrim(revocation_reason) AND char_length(revocation_reason) BETWEEN 1 AND 240)
    )
);

CREATE UNIQUE INDEX uq_user_jurisdictions_active_national
    ON user_jurisdictions(user_id)
    WHERE revoked_at IS NULL AND scope_type = 'NATIONAL';
CREATE UNIQUE INDEX uq_user_jurisdictions_active_state
    ON user_jurisdictions(user_id, state_id)
    WHERE revoked_at IS NULL AND scope_type = 'STATE';
CREATE UNIQUE INDEX uq_user_jurisdictions_active_district
    ON user_jurisdictions(user_id, district_id)
    WHERE revoked_at IS NULL AND scope_type = 'DISTRICT';
CREATE INDEX idx_user_jurisdictions_user_history ON user_jurisdictions(user_id, assigned_at DESC);
CREATE INDEX idx_user_jurisdictions_state_active ON user_jurisdictions(state_id, user_id)
    WHERE revoked_at IS NULL AND state_id IS NOT NULL;
CREATE INDEX idx_user_jurisdictions_district_active ON user_jurisdictions(district_id, user_id)
    WHERE revoked_at IS NULL AND district_id IS NOT NULL;

INSERT INTO roles (id, code, display_name, description, mfa_required, system_defined) VALUES
('10000000-0000-0000-0000-000000000001', 'SYSTEM_ADMIN', 'System Administrator', 'Platform security and authorization administrator.', TRUE, TRUE),
('10000000-0000-0000-0000-000000000002', 'MINISTRY_ADMIN', 'Ministry Administrator', 'National ministry administration without authorization mutation authority.', TRUE, TRUE),
('10000000-0000-0000-0000-000000000003', 'MINISTRY_OFFICER', 'Ministry Officer', 'National monitoring and compliance officer.', TRUE, TRUE),
('10000000-0000-0000-0000-000000000004', 'STATE_OFFICER', 'State Officer', 'State-scoped monitoring and compliance officer.', TRUE, TRUE),
('10000000-0000-0000-0000-000000000005', 'DISTRICT_OFFICER', 'District Officer', 'District-scoped monitoring and compliance officer.', TRUE, TRUE),
('10000000-0000-0000-0000-000000000006', 'INSPECTION_SUPERVISOR', 'Inspection Supervisor', 'Supervises inspection assignment and review.', TRUE, TRUE),
('10000000-0000-0000-0000-000000000007', 'INSPECTOR', 'Inspector', 'Performs assigned field inspections and captures evidence.', FALSE, TRUE),
('10000000-0000-0000-0000-000000000008', 'INSTITUTION_ADMIN', 'Institution Administrator', 'Administers an authorized institution workspace.', FALSE, TRUE),
('10000000-0000-0000-0000-000000000009', 'INSTITUTION_OPERATOR', 'Institution Operator', 'Submits operational institution data within an authorized institution.', FALSE, TRUE),
('10000000-0000-0000-0000-000000000010', 'AUDITOR', 'Auditor', 'Read-only oversight and audit access subject to jurisdiction.', TRUE, TRUE);

INSERT INTO permissions (id, code, description) VALUES
('20000000-0000-0000-0000-000000000001', 'institution.read', 'Read institutions within authorized scope.'),
('20000000-0000-0000-0000-000000000002', 'institution.create', 'Create institutions within authorized scope.'),
('20000000-0000-0000-0000-000000000003', 'institution.update', 'Update institutions within authorized scope.'),
('20000000-0000-0000-0000-000000000004', 'inspection.read', 'Read inspections within authorized scope.'),
('20000000-0000-0000-0000-000000000005', 'inspection.create', 'Create inspections within authorized scope.'),
('20000000-0000-0000-0000-000000000006', 'inspection.assign', 'Assign inspections within authorized scope.'),
('20000000-0000-0000-0000-000000000007', 'inspection.perform', 'Perform an authorized assigned inspection.'),
('20000000-0000-0000-0000-000000000008', 'inspection.review', 'Review submitted inspections within authorized scope.'),
('20000000-0000-0000-0000-000000000009', 'evidence.read', 'Read evidence within authorized scope.'),
('20000000-0000-0000-0000-000000000010', 'evidence.capture', 'Capture or submit evidence for an authorized workflow.'),
('20000000-0000-0000-0000-000000000011', 'evidence.verify', 'Verify evidence within authorized scope.'),
('20000000-0000-0000-0000-000000000012', 'risk.read', 'Read risk results within authorized scope.'),
('20000000-0000-0000-0000-000000000013', 'risk.configure', 'Configure versioned risk policy.'),
('20000000-0000-0000-0000-000000000014', 'anomaly.read', 'Read anomaly records within authorized scope.'),
('20000000-0000-0000-0000-000000000015', 'anomaly.review', 'Review anomaly records within authorized scope.'),
('20000000-0000-0000-0000-000000000016', 'cctv.read', 'Read CCTV health and metadata within authorized scope.'),
('20000000-0000-0000-0000-000000000017', 'cctv.manage', 'Manage CCTV configuration within authorized scope.'),
('20000000-0000-0000-0000-000000000018', 'cctv.live_view', 'Open an authorized live CCTV viewing workflow.'),
('20000000-0000-0000-0000-000000000019', 'attendance.read', 'Read attendance records within authorized scope.'),
('20000000-0000-0000-0000-000000000020', 'attendance.submit', 'Submit attendance records for an authorized institution.'),
('20000000-0000-0000-0000-000000000021', 'corrective_action.read', 'Read corrective actions within authorized scope.'),
('20000000-0000-0000-0000-000000000022', 'corrective_action.create', 'Create corrective actions within authorized scope.'),
('20000000-0000-0000-0000-000000000023', 'corrective_action.respond', 'Respond to corrective actions for an authorized institution.'),
('20000000-0000-0000-0000-000000000024', 'corrective_action.verify', 'Verify corrective-action evidence within authorized scope.'),
('20000000-0000-0000-0000-000000000025', 'report.read', 'Read reports within authorized scope.'),
('20000000-0000-0000-0000-000000000026', 'report.export', 'Export reports containing only authorized resources.'),
('20000000-0000-0000-0000-000000000027', 'audit.read', 'Read audit history within authorized scope.'),
('20000000-0000-0000-0000-000000000028', 'authorization.read', 'Read authorization catalog and user authorization context.'),
('20000000-0000-0000-0000-000000000029', 'authorization.manage', 'Assign and revoke roles and jurisdictions.');

-- System administrators receive the complete explicit permission catalog.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'SYSTEM_ADMIN';

-- Ministry administrators can operate nationally and inspect authorization, but cannot grant authorization.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'MINISTRY_ADMIN' AND p.code <> 'authorization.manage';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('MINISTRY_OFFICER', 'STATE_OFFICER', 'DISTRICT_OFFICER')
  AND p.code = ANY (ARRAY[
    'institution.read','institution.create','institution.update',
    'inspection.read','inspection.create','inspection.assign','inspection.review',
    'evidence.read','evidence.verify','risk.read','anomaly.read','anomaly.review',
    'cctv.read','cctv.live_view','attendance.read',
    'corrective_action.read','corrective_action.create','corrective_action.verify',
    'report.read','report.export','audit.read'
  ]::varchar[]);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'INSPECTION_SUPERVISOR'
  AND p.code = ANY (ARRAY[
    'institution.read','inspection.read','inspection.assign','inspection.review',
    'evidence.read','evidence.verify','risk.read','anomaly.read','anomaly.review',
    'corrective_action.read','corrective_action.create','corrective_action.verify',
    'report.read','audit.read'
  ]::varchar[]);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'INSPECTOR'
  AND p.code = ANY (ARRAY[
    'institution.read','inspection.read','inspection.perform','evidence.read','evidence.capture'
  ]::varchar[]);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'INSTITUTION_ADMIN'
  AND p.code = ANY (ARRAY[
    'institution.read','institution.update','cctv.read','cctv.manage',
    'attendance.read','attendance.submit','corrective_action.read','corrective_action.respond','report.read'
  ]::varchar[]);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'INSTITUTION_OPERATOR'
  AND p.code = ANY (ARRAY[
    'institution.read','cctv.read','attendance.read','attendance.submit',
    'corrective_action.read','corrective_action.respond'
  ]::varchar[]);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'AUDITOR'
  AND p.code = ANY (ARRAY[
    'institution.read','inspection.read','evidence.read','risk.read','anomaly.read',
    'cctv.read','attendance.read','corrective_action.read','report.read','audit.read'
  ]::varchar[]);

COMMENT ON TABLE roles IS 'System-defined NirikshanX RBAC roles. Role names are not authorization shortcuts; permissions are explicit.';
COMMENT ON TABLE permissions IS 'Granular permission catalog used by database-backed authorization decisions.';
COMMENT ON TABLE user_roles IS 'Append-preserving role assignment history; active assignments have revoked_at IS NULL.';
COMMENT ON TABLE user_jurisdictions IS 'Append-preserving NATIONAL/STATE/DISTRICT ABAC scope assignments with relational geography consistency.';
COMMENT ON COLUMN user_sessions.mfa_verified_at IS 'Timestamp proving that this specific server session satisfied TOTP; never inferred from account-level enrollment alone.';
