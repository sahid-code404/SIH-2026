CREATE TABLE institutions (
    id UUID PRIMARY KEY,
    code VARCHAR(64) NOT NULL,
    legal_name VARCHAR(240) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    institution_type VARCHAR(64) NOT NULL,
    registration_number VARCHAR(120),
    status VARCHAR(64) NOT NULL,
    state_id UUID NOT NULL,
    district_id UUID NOT NULL,
    address VARCHAR(500) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    location geography(Point, 4326) NOT NULL,
    geofence_radius_m INTEGER NOT NULL,
    primary_contact_name VARCHAR(160) NOT NULL,
    primary_contact_email VARCHAR(320),
    primary_contact_phone VARCHAR(32),
    verification_status VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_institutions_code UNIQUE (code),
    CONSTRAINT fk_institutions_state
        FOREIGN KEY (state_id) REFERENCES states(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_institutions_district_state
        FOREIGN KEY (district_id, state_id) REFERENCES districts(id, state_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_institutions_code CHECK (
        code = upper(btrim(code)) AND code ~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
    ),
    CONSTRAINT ck_institutions_legal_name CHECK (
        legal_name = btrim(legal_name) AND char_length(legal_name) BETWEEN 1 AND 240
    ),
    CONSTRAINT ck_institutions_display_name CHECK (
        display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 200
    ),
    CONSTRAINT ck_institutions_type CHECK (
        institution_type = upper(btrim(institution_type))
        AND institution_type ~ '^[A-Z][A-Z0-9_]{1,63}$'
    ),
    CONSTRAINT ck_institutions_registration CHECK (
        registration_number IS NULL
        OR (registration_number = btrim(registration_number) AND char_length(registration_number) BETWEEN 1 AND 120)
    ),
    CONSTRAINT ck_institutions_status CHECK (
        status = upper(btrim(status)) AND status ~ '^[A-Z][A-Z0-9_]{1,63}$'
    ),
    CONSTRAINT ck_institutions_address CHECK (
        address = btrim(address) AND char_length(address) BETWEEN 1 AND 500
    ),
    CONSTRAINT ck_institutions_postal_code CHECK (
        postal_code = btrim(postal_code) AND char_length(postal_code) BETWEEN 1 AND 20
    ),
    CONSTRAINT ck_institutions_geofence CHECK (geofence_radius_m > 0),
    CONSTRAINT ck_institutions_contact_name CHECK (
        primary_contact_name = btrim(primary_contact_name)
        AND char_length(primary_contact_name) BETWEEN 1 AND 160
    ),
    CONSTRAINT ck_institutions_contact_email CHECK (
        primary_contact_email IS NULL
        OR (primary_contact_email = lower(btrim(primary_contact_email))
            AND char_length(primary_contact_email) BETWEEN 3 AND 320
            AND position('@' IN primary_contact_email) > 1)
    ),
    CONSTRAINT ck_institutions_contact_phone CHECK (
        primary_contact_phone IS NULL
        OR (primary_contact_phone = btrim(primary_contact_phone)
            AND char_length(primary_contact_phone) BETWEEN 5 AND 32)
    ),
    CONSTRAINT ck_institutions_verification_status CHECK (
        verification_status = upper(btrim(verification_status))
        AND verification_status ~ '^[A-Z][A-Z0-9_]{1,63}$'
    ),
    CONSTRAINT ck_institutions_location_lon CHECK (ST_X(location::geometry) BETWEEN -180 AND 180),
    CONSTRAINT ck_institutions_location_lat CHECK (ST_Y(location::geometry) BETWEEN -90 AND 90),
    CONSTRAINT ck_institutions_timestamp_order CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX uq_institutions_registration_ci
    ON institutions(lower(registration_number))
    WHERE registration_number IS NOT NULL;

CREATE INDEX idx_institutions_state_district
    ON institutions(state_id, district_id, display_name, id);
CREATE INDEX idx_institutions_code_search
    ON institutions(lower(code));
CREATE INDEX idx_institutions_display_name_search
    ON institutions(lower(display_name));
CREATE INDEX idx_institutions_legal_name_search
    ON institutions(lower(legal_name));
CREATE INDEX idx_institutions_registration_search
    ON institutions(lower(registration_number))
    WHERE registration_number IS NOT NULL;
CREATE INDEX idx_institutions_location
    ON institutions USING GIST(location);

CREATE TRIGGER trg_institutions_maintain_audit_timestamps
    BEFORE UPDATE ON institutions
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE institution_memberships (
    id UUID PRIMARY KEY,
    institution_id UUID NOT NULL,
    user_id UUID NOT NULL,
    assigned_by_user_id UUID,
    assignment_source VARCHAR(24) NOT NULL DEFAULT 'ADMIN',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id UUID,
    revocation_reason VARCHAR(240),

    CONSTRAINT fk_institution_memberships_institution
        FOREIGN KEY (institution_id) REFERENCES institutions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_institution_memberships_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_institution_memberships_assigned_by
        FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_institution_memberships_revoked_by
        FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_institution_memberships_source CHECK (assignment_source IN ('ADMIN', 'BOOTSTRAP')),
    CONSTRAINT ck_institution_memberships_revocation CHECK (
        (revoked_at IS NULL AND revoked_by_user_id IS NULL AND revocation_reason IS NULL)
        OR
        (revoked_at IS NOT NULL
            AND revoked_at >= assigned_at
            AND revocation_reason IS NOT NULL
            AND revocation_reason = btrim(revocation_reason)
            AND char_length(revocation_reason) BETWEEN 1 AND 240)
    )
);

CREATE UNIQUE INDEX uq_institution_memberships_active
    ON institution_memberships(institution_id, user_id)
    WHERE revoked_at IS NULL;
CREATE INDEX idx_institution_memberships_user_active
    ON institution_memberships(user_id, institution_id)
    WHERE revoked_at IS NULL;
CREATE INDEX idx_institution_memberships_institution_history
    ON institution_memberships(institution_id, assigned_at DESC);
CREATE INDEX idx_institution_memberships_user_history
    ON institution_memberships(user_id, assigned_at DESC);

COMMENT ON COLUMN institutions.institution_type IS
    'Normalized policy code. The authoritative institution-type catalog is intentionally not invented by this migration.';
COMMENT ON COLUMN institutions.status IS
    'Normalized lifecycle/policy code. Closed status values await the authoritative government data dictionary.';
COMMENT ON COLUMN institutions.verification_status IS
    'Normalized verification code. Closed values await an authoritative verification policy.';
COMMENT ON TABLE institution_memberships IS
    'Ownership/access scope association only. RBAC permissions remain authoritative and are not duplicated in membership rows.';
