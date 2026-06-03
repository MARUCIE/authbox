package pg

import (
	"context"
	"errors"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WalletRepository persists watch-only wallet accounts and addresses.
//
// NUMERIC balances are read with ::text and written with ::numeric so Go sees a
// plain decimal string — wei exceeds int64 and pgtype.Numeric is awkward to map
// to a simple type. The string is validated as digits-only upstream.
type WalletRepository struct {
	pool *pgxpool.Pool
}

func NewWalletRepository(pool *pgxpool.Pool) *WalletRepository {
	return &WalletRepository{pool: pool}
}

func (r *WalletRepository) CreateAccount(ctx context.Context, a *domain.WalletAccount) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO wallet_accounts
		   (user_id, coin, network, script_type, account_index, derivation_path, xpub, label)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, cached_balance::text, created_at, updated_at`,
		a.UserID, a.Coin, a.Network, a.ScriptType, a.AccountIndex, a.DerivationPath, a.XPub, a.Label,
	).Scan(&a.ID, &a.CachedBalance, &a.CreatedAt, &a.UpdatedAt)
}

func (r *WalletRepository) GetAccount(ctx context.Context, id, userID uuid.UUID) (*domain.WalletAccount, error) {
	a := &domain.WalletAccount{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, coin, network, script_type, account_index, derivation_path, xpub, label,
		        cached_balance::text, cached_balance_at, created_at, updated_at
		 FROM wallet_accounts WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&a.ID, &a.UserID, &a.Coin, &a.Network, &a.ScriptType, &a.AccountIndex, &a.DerivationPath,
		&a.XPub, &a.Label, &a.CachedBalance, &a.CachedBalanceAt, &a.CreatedAt, &a.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return a, err
}

func (r *WalletRepository) ListAccounts(ctx context.Context, userID uuid.UUID) ([]domain.WalletAccount, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, coin, network, script_type, account_index, derivation_path, xpub, label,
		        cached_balance::text, cached_balance_at, created_at, updated_at
		 FROM wallet_accounts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []domain.WalletAccount
	for rows.Next() {
		var a domain.WalletAccount
		if err := rows.Scan(&a.ID, &a.UserID, &a.Coin, &a.Network, &a.ScriptType, &a.AccountIndex,
			&a.DerivationPath, &a.XPub, &a.Label, &a.CachedBalance, &a.CachedBalanceAt,
			&a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}
	return accounts, rows.Err()
}

func (r *WalletRepository) DeleteAccount(ctx context.Context, id, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM wallet_accounts WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrWalletAccountNotFound
	}
	return nil
}

func (r *WalletRepository) UpdateAccountBalance(ctx context.Context, id uuid.UUID, balance string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE wallet_accounts SET cached_balance = $2::numeric, cached_balance_at = NOW(), updated_at = NOW()
		 WHERE id = $1`,
		id, balance,
	)
	return err
}

func (r *WalletRepository) CreateAddress(ctx context.Context, addr *domain.WalletAddress) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO wallet_addresses
		   (account_id, address, derivation_path, change, address_index, public_key)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (account_id, change, address_index)
		   DO UPDATE SET address = EXCLUDED.address, public_key = EXCLUDED.public_key
		 RETURNING id, cached_balance::text, created_at`,
		addr.AccountID, addr.Address, addr.DerivationPath, addr.Change, addr.AddressIndex, addr.PublicKey,
	).Scan(&addr.ID, &addr.CachedBalance, &addr.CreatedAt)
}

func (r *WalletRepository) ListAddresses(ctx context.Context, accountID uuid.UUID) ([]domain.WalletAddress, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, account_id, address, derivation_path, change, address_index, public_key,
		        cached_balance::text, created_at
		 FROM wallet_addresses WHERE account_id = $1 ORDER BY change, address_index LIMIT 1000`,
		accountID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var addrs []domain.WalletAddress
	for rows.Next() {
		var a domain.WalletAddress
		if err := rows.Scan(&a.ID, &a.AccountID, &a.Address, &a.DerivationPath, &a.Change,
			&a.AddressIndex, &a.PublicKey, &a.CachedBalance, &a.CreatedAt); err != nil {
			return nil, err
		}
		addrs = append(addrs, a)
	}
	return addrs, rows.Err()
}
