-- RFC 6238 §5.2: a TOTP code must be accepted at most once. Track the last
-- accepted counter step per user so codes cannot be replayed within the
-- validity window (or across the login/verify/disable endpoints).
ALTER TABLE users ADD COLUMN totp_last_counter BIGINT NOT NULL DEFAULT 0;
