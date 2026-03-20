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
		 RETURNING id, created_at, updated_at`,
		item.UserID, item.EncryptedData, item.Nonce, item.Tag, item.ItemType, item.Version,
	).Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt)
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

func (r *VaultRepository) UpdateItem(ctx context.Context, item *domain.VaultItem) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE vault_items SET encrypted_data = $1, nonce = $2, tag = $3, item_type = $4, version = version + 1, updated_at = NOW()
		 WHERE id = $5 AND user_id = $6`,
		item.EncryptedData, item.Nonce, item.Tag, item.ItemType, item.ID, item.UserID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
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

// SyncPull returns all vault items for a user, optionally filtered by updatedSince.
func (r *VaultRepository) SyncPull(ctx context.Context, userID uuid.UUID, sinceVersion, limit int) ([]domain.VaultItem, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, encrypted_data, nonce, tag, item_type, version, created_at, updated_at
		 FROM vault_items WHERE user_id = $1 AND version > $2 ORDER BY version ASC LIMIT $3`,
		userID, sinceVersion, limit,
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
