//go:build integration

package pg

import (
	"context"
	"os"
	"strings"
	"testing"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Run with: AUTH_BOX_TEST_DB_DSN=... go test -tags integration ./internal/repository/pg/
func TestCreateItemsIsAllOrNothing(t *testing.T) {
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
		Email:             "batch-" + uuid.NewString()[:8] + "@authbox.io",
		SRPSalt:           []byte("salt"),
		SRPVerifier:       []byte("verifier"),
		EncryptedVaultKey: []byte("key"),
		VaultKeyNonce:     []byte("123456789012"),
		VaultKeyTag:       []byte("1234567890abcdef"),
	}
	if err := NewUserRepository(pool).Create(ctx, user); err != nil {
		t.Fatalf("create user: %v", err)
	}
	item := func(itemType string) *domain.VaultItem {
		return &domain.VaultItem{UserID: user.ID, EncryptedData: []byte("c"), Nonce: []byte("n"), Tag: []byte("t"), ItemType: itemType, Version: 1}
	}

	repo := NewVaultRepository(pool)
	// The second row violates the item_type column width, so the insert fails part-way.
	err = repo.CreateItems(ctx, []*domain.VaultItem{item("login"), item(strings.Repeat("x", 60))})
	if err == nil {
		t.Fatal("expected the oversized row to fail")
	}
	rows, err := repo.ListItems(ctx, user.ID, 10, 0)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 0 {
		t.Fatalf("%d rows left behind by a failed batch", len(rows))
	}

	if err := repo.CreateItems(ctx, []*domain.VaultItem{item("login"), item("card")}); err != nil {
		t.Fatalf("valid batch: %v", err)
	}
	rows, _ = repo.ListItems(ctx, user.ID, 10, 0)
	if len(rows) != 2 {
		t.Fatalf("valid batch stored %d rows, want 2", len(rows))
	}
}

// One batch push shares a single created_at. Offset paging over it must still
// return every row exactly once.
func TestListItemsPagesOneBatchWithoutGapsOrRepeats(t *testing.T) {
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
		Email:             "paging-" + uuid.NewString()[:8] + "@authbox.io",
		SRPSalt:           []byte("salt"),
		SRPVerifier:       []byte("verifier"),
		EncryptedVaultKey: []byte("key"),
		VaultKeyNonce:     []byte("123456789012"),
		VaultKeyTag:       []byte("1234567890abcdef"),
	}
	if err := NewUserRepository(pool).Create(ctx, user); err != nil {
		t.Fatalf("create user: %v", err)
	}
	const total, page = 1200, 500
	batch := make([]*domain.VaultItem, total)
	for i := range batch {
		batch[i] = &domain.VaultItem{UserID: user.ID, EncryptedData: []byte("c"), Nonce: []byte("n"), Tag: []byte("t"), ItemType: "login", Version: 1}
	}
	repo := NewVaultRepository(pool)
	if err := repo.CreateItems(ctx, batch); err != nil {
		t.Fatalf("create: %v", err)
	}

	seen := map[uuid.UUID]bool{}
	for offset := 0; ; offset += page {
		rows, err := repo.ListItems(ctx, user.ID, page, offset)
		if err != nil {
			t.Fatalf("list at %d: %v", offset, err)
		}
		for _, r := range rows {
			if seen[r.ID] {
				t.Fatalf("item %s returned twice", r.ID)
			}
			seen[r.ID] = true
		}
		if len(rows) < page {
			break
		}
	}
	if len(seen) != total {
		t.Fatalf("paged %d distinct items, want %d", len(seen), total)
	}
}
