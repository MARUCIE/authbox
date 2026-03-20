package pg

import (
	"context"
	"encoding/json"
	"errors"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

func (r *UserRepository) Create(ctx context.Context, u *domain.User) error {
	kdfJSON, err := json.Marshal(u.KDFParams)
	if err != nil {
		return err
	}

	return r.pool.QueryRow(ctx,
		`INSERT INTO users (email, srp_salt, srp_verifier, encrypted_vault_key, vault_key_nonce, vault_key_tag, kdf_params, public_key)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, created_at, updated_at`,
		u.Email, u.SRPSalt, u.SRPVerifier, u.EncryptedVaultKey, u.VaultKeyNonce, u.VaultKeyTag, kdfJSON, u.PublicKey,
	).Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	u := &domain.User{}
	var kdfJSON []byte

	err := r.pool.QueryRow(ctx,
		`SELECT id, email, srp_salt, srp_verifier, encrypted_vault_key, vault_key_nonce, vault_key_tag, kdf_params, public_key, created_at, updated_at
		 FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.SRPSalt, &u.SRPVerifier, &u.EncryptedVaultKey, &u.VaultKeyNonce, &u.VaultKeyTag, &kdfJSON, &u.PublicKey, &u.CreatedAt, &u.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(kdfJSON, &u.KDFParams); err != nil {
		return nil, err
	}
	return u, nil
}

func (r *UserRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	u := &domain.User{}
	var kdfJSON []byte

	err := r.pool.QueryRow(ctx,
		`SELECT id, email, srp_salt, srp_verifier, encrypted_vault_key, vault_key_nonce, vault_key_tag,
		        kdf_params, public_key, totp_secret, totp_enabled, totp_verified_at, created_at, updated_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.SRPSalt, &u.SRPVerifier, &u.EncryptedVaultKey, &u.VaultKeyNonce, &u.VaultKeyTag,
		&kdfJSON, &u.PublicKey, &u.TOTPSecret, &u.TOTPEnabled, &u.TOTPVerifiedAt, &u.CreatedAt, &u.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(kdfJSON, &u.KDFParams); err != nil {
		return nil, err
	}
	return u, nil
}

func (r *UserRepository) SetTOTPSecret(ctx context.Context, userID uuid.UUID, secret []byte) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET totp_secret = $1, updated_at = NOW() WHERE id = $2`,
		secret, userID,
	)
	return err
}

func (r *UserRepository) EnableTOTP(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET totp_enabled = TRUE, totp_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
		userID,
	)
	return err
}

func (r *UserRepository) DisableTOTP(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_verified_at = NULL, updated_at = NOW() WHERE id = $1`,
		userID,
	)
	return err
}
