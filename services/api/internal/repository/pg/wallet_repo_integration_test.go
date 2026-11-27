//go:build integration

package pg

import (
	"context"
	"os"
	"testing"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Re-registering an address slot keeps the row consistent and returns what
// was stored, not what the caller sent.
func TestCreateAddressReRegisterKeepsRowConsistent(t *testing.T) {
	dsn := os.Getenv("AUTH_BOX_TEST_DB_DSN")
	if dsn == "" {
		t.Skip("AUTH_BOX_TEST_DB_DSN not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	user := &domain.User{
		Email: "wallet-" + uuid.NewString()[:8] + "@authbox.io", SRPSalt: []byte("s"), SRPVerifier: []byte("v"),
		EncryptedVaultKey: []byte("k"), VaultKeyNonce: []byte("123456789012"), VaultKeyTag: []byte("1234567890abcdef"),
	}
	if err := NewUserRepository(pool).Create(ctx, user); err != nil {
		t.Fatalf("create user: %v", err)
	}
	repo := NewWalletRepository(pool)
	account := &domain.WalletAccount{UserID: user.ID, Coin: "eth", Network: "mainnet", DerivationPath: "m/44'/60'/0'", XPub: "xpub", Label: "t"}
	if err := repo.CreateAccount(ctx, account); err != nil {
		t.Fatalf("create account: %v", err)
	}

	first := &domain.WalletAddress{AccountID: account.ID, Address: "0x1100000000000000000000000000000000000000", DerivationPath: "m/44'/60'/0'/0/0", PublicKey: "02aa"}
	if err := repo.CreateAddress(ctx, first); err != nil {
		t.Fatalf("first: %v", err)
	}
	again := &domain.WalletAddress{AccountID: account.ID, Address: "0x2200000000000000000000000000000000000000", DerivationPath: "m/44'/60'/0'/0/0'", PublicKey: "02bb"}
	if err := repo.CreateAddress(ctx, again); err != nil {
		t.Fatalf("again: %v", err)
	}
	if again.ID != first.ID {
		t.Fatalf("re-registering the slot created a new row")
	}
	addrs, err := repo.ListAddresses(ctx, account.ID)
	if err != nil || len(addrs) != 1 {
		t.Fatalf("list: %v (%d rows)", err, len(addrs))
	}
	if addrs[0].Address != again.Address || addrs[0].DerivationPath != again.DerivationPath || addrs[0].PublicKey != again.PublicKey {
		t.Fatalf("stored row mixes registrations: %+v", addrs[0])
	}
}
