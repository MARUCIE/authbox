package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// WalletAccount is a watch-only crypto wallet account. It holds the account
// xpub and derivation metadata — never a private key or seed. Balances are
// decimal strings in the coin's smallest unit (satoshi / wei); wei overflows
// int64, so they are never numbers.
type WalletAccount struct {
	ID              uuid.UUID
	UserID          uuid.UUID
	Coin            string  // 'btc' | 'eth'
	Network         string  // 'mainnet' | 'testnet'
	ScriptType      *string // BTC only: 'p2wpkh' | 'p2pkh'; nil for ETH
	AccountIndex    int
	DerivationPath  string
	XPub            string
	Label           string
	CachedBalance   string // NUMERIC(40,0) as decimal string
	CachedBalanceAt *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// WalletAddress is a single derived address under an account. Public material
// only — there is no column or field for a private key anywhere in this domain.
type WalletAddress struct {
	ID             uuid.UUID
	AccountID      uuid.UUID
	Address        string
	DerivationPath string
	Change         int16 // 0 = receive, 1 = change
	AddressIndex   int
	PublicKey      string // compressed hex
	CachedBalance  string
	CreatedAt      time.Time
}

// WalletRepository is the persistence contract for watch-only wallet data.
type WalletRepository interface {
	CreateAccount(ctx context.Context, a *WalletAccount) error
	GetAccount(ctx context.Context, id, userID uuid.UUID) (*WalletAccount, error)
	ListAccounts(ctx context.Context, userID uuid.UUID) ([]WalletAccount, error)
	DeleteAccount(ctx context.Context, id, userID uuid.UUID) error
	UpdateAccountBalance(ctx context.Context, id uuid.UUID, balance string) error

	CreateAddress(ctx context.Context, addr *WalletAddress) error
	ListAddresses(ctx context.Context, accountID uuid.UUID) ([]WalletAddress, error)
}
