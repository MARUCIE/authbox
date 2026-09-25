-- Per-row monotonic sync cursor. `version` is a PER-ITEM revision counter and
-- was misused as a global pull cursor: after a client saw any item at
-- version N, every new item (version 1) was silently skipped forever.
CREATE SEQUENCE IF NOT EXISTS vault_items_sync_seq;
ALTER TABLE vault_items ADD COLUMN sync_seq BIGINT NOT NULL DEFAULT 0;
UPDATE vault_items SET sync_seq = nextval('vault_items_sync_seq');
ALTER TABLE vault_items ALTER COLUMN sync_seq SET DEFAULT nextval('vault_items_sync_seq');
CREATE INDEX idx_vault_items_user_sync_seq ON vault_items (user_id, sync_seq);
