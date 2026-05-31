-- Critical indexes for hot-path queries
-- session validation (every authenticated request)
CREATE INDEX IF NOT EXISTS idx_sessions_token_expires ON sessions(token_hash, expires_at);
-- vault sync pulls (user + version ordering)
CREATE INDEX IF NOT EXISTS idx_vault_items_user_version ON vault_items(user_id, version);
