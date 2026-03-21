package pg

import (
	"context"
	"errors"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// sentinel alias for brevity
var errConnectionNotFound = domain.ErrConnectionNotFound

type ConnectionRepository struct {
	pool *pgxpool.Pool
}

func NewConnectionRepository(pool *pgxpool.Pool) *ConnectionRepository {
	return &ConnectionRepository{pool: pool}
}

func (r *ConnectionRepository) CreateConnection(ctx context.Context, conn *domain.AuthConnection) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO auth_connections (user_id, provider, provider_account_id, display_name,
		  access_token_enc, access_token_nonce, access_token_tag,
		  refresh_token_enc, refresh_token_nonce, refresh_token_tag,
		  token_expires_at, scopes, status, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		 RETURNING id, created_at, updated_at`,
		conn.UserID, conn.Provider, conn.ProviderAccountID, conn.DisplayName,
		conn.AccessTokenEnc, conn.AccessTokenNonce, conn.AccessTokenTag,
		conn.RefreshTokenEnc, conn.RefreshTokenNonce, conn.RefreshTokenTag,
		conn.TokenExpiresAt, conn.Scopes, conn.Status, conn.Metadata,
	).Scan(&conn.ID, &conn.CreatedAt, &conn.UpdatedAt)
}

func (r *ConnectionRepository) GetConnection(ctx context.Context, id, userID uuid.UUID) (*domain.AuthConnection, error) {
	conn := &domain.AuthConnection{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, provider, provider_account_id, display_name,
		  access_token_enc, access_token_nonce, access_token_tag,
		  refresh_token_enc, refresh_token_nonce, refresh_token_tag,
		  token_expires_at, scopes, status, metadata, created_at, updated_at
		 FROM auth_connections WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&conn.ID, &conn.UserID, &conn.Provider, &conn.ProviderAccountID, &conn.DisplayName,
		&conn.AccessTokenEnc, &conn.AccessTokenNonce, &conn.AccessTokenTag,
		&conn.RefreshTokenEnc, &conn.RefreshTokenNonce, &conn.RefreshTokenTag,
		&conn.TokenExpiresAt, &conn.Scopes, &conn.Status, &conn.Metadata, &conn.CreatedAt, &conn.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return conn, err
}

func (r *ConnectionRepository) ListConnections(ctx context.Context, userID uuid.UUID) ([]domain.AuthConnection, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, provider, provider_account_id, display_name,
		  access_token_enc, access_token_nonce, access_token_tag,
		  refresh_token_enc, refresh_token_nonce, refresh_token_tag,
		  token_expires_at, scopes, status, metadata, created_at, updated_at
		 FROM auth_connections WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conns []domain.AuthConnection
	for rows.Next() {
		var c domain.AuthConnection
		if err := rows.Scan(&c.ID, &c.UserID, &c.Provider, &c.ProviderAccountID, &c.DisplayName,
			&c.AccessTokenEnc, &c.AccessTokenNonce, &c.AccessTokenTag,
			&c.RefreshTokenEnc, &c.RefreshTokenNonce, &c.RefreshTokenTag,
			&c.TokenExpiresAt, &c.Scopes, &c.Status, &c.Metadata, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		conns = append(conns, c)
	}
	return conns, rows.Err()
}

func (r *ConnectionRepository) UpdateConnection(ctx context.Context, conn *domain.AuthConnection) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE auth_connections SET provider = $1, provider_account_id = $2, display_name = $3,
		  access_token_enc = $4, access_token_nonce = $5, access_token_tag = $6,
		  refresh_token_enc = $7, refresh_token_nonce = $8, refresh_token_tag = $9,
		  token_expires_at = $10, scopes = $11, status = $12, metadata = $13, updated_at = NOW()
		 WHERE id = $14 AND user_id = $15`,
		conn.Provider, conn.ProviderAccountID, conn.DisplayName,
		conn.AccessTokenEnc, conn.AccessTokenNonce, conn.AccessTokenTag,
		conn.RefreshTokenEnc, conn.RefreshTokenNonce, conn.RefreshTokenTag,
		conn.TokenExpiresAt, conn.Scopes, conn.Status, conn.Metadata, conn.ID, conn.UserID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errConnectionNotFound
	}
	return nil
}

func (r *ConnectionRepository) DeleteConnection(ctx context.Context, id, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM auth_connections WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errConnectionNotFound
	}
	return nil
}
