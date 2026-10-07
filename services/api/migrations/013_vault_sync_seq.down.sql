DROP INDEX IF EXISTS idx_vault_items_user_sync_seq;
ALTER TABLE vault_items DROP COLUMN sync_seq;
DROP SEQUENCE IF EXISTS vault_items_sync_seq;
