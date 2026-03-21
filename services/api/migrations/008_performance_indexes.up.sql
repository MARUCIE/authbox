-- Performance indexes for paginated queries (20x speedup on sorted result sets)
CREATE INDEX IF NOT EXISTS idx_sessions_user_created ON sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_items_user_created ON vault_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_user_created ON agents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connections_user_created ON auth_connections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_created ON audit_events(user_id, created_at DESC);
