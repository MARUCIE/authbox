-- Add TOTP columns to users
ALTER TABLE users ADD COLUMN totp_secret BYTEA;
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN totp_verified_at TIMESTAMPTZ;

-- Add last_active_at to sessions for session management UI
ALTER TABLE sessions ADD COLUMN last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
