package pg

import (
	"context"
	"errors"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type VaultRepository struct {
	pool *pgxpool.Pool
}

func NewVaultRepository(pool *pgxpool.Pool) *VaultRepository {
	return &VaultRepository{pool: pool}
}

func (r *VaultRepository) CreateItem(ctx context.Context, item *domain.VaultItem) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO vault_items (user_id, encrypted_data, nonce, tag, item_type, version)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_at, updated_at, sync_seq`,
		item.UserID, item.EncryptedData, item.Nonce, item.Tag, item.ItemType, item.Version,
	).Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt, &item.SyncSeq)
}

func (r *VaultRepository) GetItem(ctx context.Context, id, userID uuid.UUID) (*domain.VaultItem, error) {
	item := &domain.VaultItem{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, encrypted_data, nonce, tag, item_type, version, created_at, updated_at
		 FROM vault_items WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&item.ID, &item.UserID, &item.EncryptedData, &item.Nonce, &item.Tag, &item.ItemType, &item.Version, &item.CreatedAt, &item.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return item, err
}

func (r *VaultRepository) ListItems(ctx context.Context, userID uuid.UUID, limit, offset int) ([]domain.VaultItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, encrypted_data, nonce, tag, item_type, version, created_at, updated_at
		 FROM vault_items WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.VaultItem
	for rows.Next() {
		var item domain.VaultItem
		if err := rows.Scan(&item.ID, &item.UserID, &item.EncryptedData, &item.Nonce, &item.Tag, &item.ItemType, &item.Version, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// UpdateItem writes the new ciphertext. When expectedVersion is non-nil the
// update only applies if the stored version still matches (optimistic
// concurrency); a stale write returns domain.ErrRevisionConflict so the
// client can surface the conflict instead of silently losing an edit.
func (r *VaultRepository) UpdateItem(ctx context.Context, item *domain.VaultItem, expectedVersion *int) error {
	query := `UPDATE vault_items SET encrypted_data = $1, nonce = $2, tag = $3, item_type = $4, version = version + 1,
		 sync_seq = nextval('vault_items_sync_seq'), updated_at = NOW()
		 WHERE id = $5 AND user_id = $6`
	args := []any{item.EncryptedData, item.Nonce, item.Tag, item.ItemType, item.ID, item.UserID}
	if expectedVersion != nil {
		query += ` AND version = $7`
		args = append(args, *expectedVersion)
	}

	tag, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		if expectedVersion != nil {
			// Distinguish "gone" from "moved on": if the row exists the
			// version check is what failed.
			var exists bool
			if err := r.pool.QueryRow(ctx,
				`SELECT EXISTS(SELECT 1 FROM vault_items WHERE id = $1 AND user_id = $2)`,
				item.ID, item.UserID,
			).Scan(&exists); err == nil && exists {
				return domain.ErrRevisionConflict
			}
		}
		return domain.ErrItemNotFound
	}
	return nil
}

func (r *VaultRepository) DeleteItem(ctx context.Context, id, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM vault_items WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrItemNotFound
	}
	return nil
}

// SyncPull returns items whose sync_seq is beyond the client's cursor.
func (r *VaultRepository) SyncPull(ctx context.Context, userID uuid.UUID, afterSeq int64, limit int) ([]domain.VaultItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, encrypted_data, nonce, tag, item_type, version, sync_seq, created_at, updated_at
		 FROM vault_items WHERE user_id = $1 AND sync_seq > $2 ORDER BY sync_seq ASC LIMIT $3`,
		userID, afterSeq, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.VaultItem
	for rows.Next() {
		var item domain.VaultItem
		if err := rows.Scan(&item.ID, &item.UserID, &item.EncryptedData, &item.Nonce, &item.Tag, &item.ItemType, &item.Version, &item.SyncSeq, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// SyncUpsert inserts or updates each pushed item in one transaction. The
// DO UPDATE guard on user_id means a caller cannot overwrite another user's
// row by pushing its UUID — such a push fails the whole batch.
func (r *VaultRepository) SyncUpsert(ctx context.Context, items []*domain.VaultItem) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, item := range items {
		err := tx.QueryRow(ctx,
			`INSERT INTO vault_items (id, user_id, encrypted_data, nonce, tag, item_type, version)
			 VALUES ($1, $2, $3, $4, $5, $6, 1)
			 ON CONFLICT (id) DO UPDATE SET
			   encrypted_data = EXCLUDED.encrypted_data,
			   nonce = EXCLUDED.nonce,
			   tag = EXCLUDED.tag,
			   item_type = EXCLUDED.item_type,
			   version = vault_items.version + 1,
			   sync_seq = nextval('vault_items_sync_seq'),
			   updated_at = NOW()
			 WHERE vault_items.user_id = EXCLUDED.user_id
			 RETURNING version, sync_seq, created_at, updated_at`,
			item.ID, item.UserID, item.EncryptedData, item.Nonce, item.Tag, item.ItemType,
		).Scan(&item.Version, &item.SyncSeq, &item.CreatedAt, &item.UpdatedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			// Conflict on an id owned by a different user.
			return domain.ErrItemNotFound
		}
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
