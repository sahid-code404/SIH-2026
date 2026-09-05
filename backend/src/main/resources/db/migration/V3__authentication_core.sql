CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    phone VARCHAR(32),
    display_name VARCHAR(160) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    preferred_language VARCHAR(16) NOT NULL DEFAULT 'en',
    last_login_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT ck_users_email_normalized CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%.__%'),
    CONSTRAINT ck_users_display_name CHECK (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 160),
    CONSTRAINT ck_users_phone CHECK (phone IS NULL OR (phone = btrim(phone) AND char_length(phone) BETWEEN 7 AND 32)),
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'DISABLED', 'LOCKED')),
    CONSTRAINT ck_users_preferred_language CHECK (preferred_language = btrim(preferred_language) AND char_length(preferred_language) BETWEEN 2 AND 16),
    CONSTRAINT ck_users_timestamps CHECK (updated_at >= created_at AND password_changed_at >= created_at)
);

CREATE UNIQUE INDEX uq_users_email_ci ON users (lower(email));
CREATE INDEX idx_users_status ON users (status);

CREATE TRIGGER trg_users_maintain_audit_timestamps
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    token_family_id UUID NOT NULL,
    user_agent VARCHAR(512),
    ip_hash CHAR(64),
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_user_sessions_ip_hash CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_user_sessions_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_user_sessions_last_seen CHECK (last_seen_at >= created_at),
    CONSTRAINT ck_user_sessions_revocation CHECK ((revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL))
);

CREATE INDEX idx_user_sessions_user_active ON user_sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_sessions_family ON user_sessions (token_family_id);

CREATE TRIGGER trg_user_sessions_maintain_audit_timestamps
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE user_refresh_tokens (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    replaced_by_token_id UUID,
    CONSTRAINT fk_user_refresh_tokens_session FOREIGN KEY (session_id) REFERENCES user_sessions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_user_refresh_tokens_replacement FOREIGN KEY (replaced_by_token_id) REFERENCES user_refresh_tokens(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_user_refresh_tokens_hash UNIQUE (token_hash),
    CONSTRAINT ck_user_refresh_tokens_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_user_refresh_tokens_expiry CHECK (expires_at > issued_at),
    CONSTRAINT ck_user_refresh_tokens_consumed CHECK (consumed_at IS NULL OR consumed_at >= issued_at),
    CONSTRAINT ck_user_refresh_tokens_revoked CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE INDEX idx_user_refresh_tokens_session ON user_refresh_tokens (session_id, issued_at DESC);
CREATE INDEX idx_user_refresh_tokens_live ON user_refresh_tokens (session_id, expires_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE authentication_events (
    id UUID PRIMARY KEY,
    user_id UUID,
    subject_hash CHAR(64) NOT NULL,
    outcome VARCHAR(32) NOT NULL,
    reason VARCHAR(80),
    ip_hash CHAR(64),
    user_agent VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_authentication_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT ck_authentication_events_subject_hash CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_authentication_events_ip_hash CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_authentication_events_outcome CHECK (outcome IN ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'RATE_LIMITED', 'MFA_FAILED', 'REFRESH_REUSE', 'PASSWORD_CHANGED', 'LOGOUT'))
);

CREATE INDEX idx_authentication_events_subject_time ON authentication_events (subject_hash, created_at DESC);
CREATE INDEX idx_authentication_events_user_time ON authentication_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE user_totp (
    user_id UUID PRIMARY KEY,
    encrypted_secret TEXT NOT NULL,
    key_version SMALLINT NOT NULL DEFAULT 1,
    enabled_at TIMESTAMPTZ,
    last_counter BIGINT,
    enrollment_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_user_totp_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_user_totp_key_version CHECK (key_version > 0),
    CONSTRAINT ck_user_totp_last_counter CHECK (last_counter IS NULL OR last_counter >= 0),
    CONSTRAINT ck_user_totp_enrollment CHECK (enabled_at IS NOT NULL OR enrollment_expires_at IS NOT NULL)
);

CREATE TRIGGER trg_user_totp_maintain_audit_timestamps
    BEFORE UPDATE ON user_totp
    FOR EACH ROW EXECUTE FUNCTION nirikshanx_maintain_audit_timestamps();

CREATE TABLE mfa_login_challenges (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    ip_hash CHAR(64),
    user_agent VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fk_mfa_login_challenges_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT uq_mfa_login_challenges_token_hash UNIQUE (token_hash),
    CONSTRAINT ck_mfa_login_challenges_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_mfa_login_challenges_ip_hash CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_mfa_login_challenges_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_mfa_login_challenges_consumed CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX idx_mfa_login_challenges_user_time ON mfa_login_challenges (user_id, created_at DESC);
