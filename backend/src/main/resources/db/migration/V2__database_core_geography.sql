CREATE OR REPLACE FUNCTION nirikshanx_maintain_audit_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'created_at is immutable';
    END IF;

    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE TABLE states (
    id UUID PRIMARY KEY,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_states_code UNIQUE (code),
    CONSTRAINT ck_states_code_nonblank CHECK (length(btrim(code)) > 0),
    CONSTRAINT ck_states_code_trimmed CHECK (code = btrim(code)),
    CONSTRAINT ck_states_code_upper CHECK (code = upper(code)),
    CONSTRAINT ck_states_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'),
    CONSTRAINT ck_states_name_nonblank CHECK (length(btrim(name)) > 0),
    CONSTRAINT ck_states_name_trimmed CHECK (name = btrim(name)),
    CONSTRAINT ck_states_timestamp_order CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX uq_states_name_ci
    ON states (lower(name));

CREATE TABLE districts (
    id UUID PRIMARY KEY,
    state_id UUID NOT NULL,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_districts_state
        FOREIGN KEY (state_id)
        REFERENCES states (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT uq_districts_code UNIQUE (code),
    CONSTRAINT ck_districts_code_nonblank CHECK (length(btrim(code)) > 0),
    CONSTRAINT ck_districts_code_trimmed CHECK (code = btrim(code)),
    CONSTRAINT ck_districts_code_upper CHECK (code = upper(code)),
    CONSTRAINT ck_districts_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'),
    CONSTRAINT ck_districts_name_nonblank CHECK (length(btrim(name)) > 0),
    CONSTRAINT ck_districts_name_trimmed CHECK (name = btrim(name)),
    CONSTRAINT ck_districts_timestamp_order CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX uq_districts_state_name_ci
    ON districts (state_id, lower(name));

CREATE INDEX idx_districts_state_name
    ON districts (state_id, name);

CREATE TRIGGER trg_states_maintain_audit_timestamps
BEFORE UPDATE ON states
FOR EACH ROW
EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TRIGGER trg_districts_maintain_audit_timestamps
BEFORE UPDATE ON districts
FOR EACH ROW
EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

COMMENT ON TABLE states IS
    'Canonical first-level geography catalog. Business tables reference state IDs instead of repeating raw state strings.';

COMMENT ON TABLE districts IS
    'Canonical district catalog. Every district belongs to exactly one state; future business tables reference district IDs.';

COMMENT ON COLUMN states.code IS
    'Authoritative external geography code once an official source is selected; values are not guessed or auto-seeded.';

COMMENT ON COLUMN districts.code IS
    'Authoritative external district code once an official source is selected; values are not guessed or auto-seeded.';
