//go:build integration

package pg

import (
	"context"
	"errors"
	"os"
	"testing"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// A unique-constraint failure must come back as domain.ErrConflict so the
// handler answers 409 instead of 500.
func TestDuplicateNamesReturnErrConflict(t *testing.T) {
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
		Email:             "conflict-" + uuid.NewString()[:8] + "@authbox.io",
		SRPSalt:           []byte("salt"),
		SRPVerifier:       []byte("verifier"),
		EncryptedVaultKey: []byte("key"),
		VaultKeyNonce:     []byte("123456789012"),
		VaultKeyTag:       []byte("1234567890abcdef"),
	}
	if err := NewUserRepository(pool).Create(ctx, user); err != nil {
		t.Fatalf("create user: %v", err)
	}

	agents := NewAgentRepository(pool)
	mk := func(name string) *domain.Agent {
		return &domain.Agent{UserID: user.ID, Name: name, AgentType: "custom", APIKeyHash: uuid.NewString(), Status: "active"}
	}
	first, second := mk("bot"), mk("other")
	if err := agents.CreateAgent(ctx, first); err != nil {
		t.Fatalf("first agent: %v", err)
	}
	if err := agents.CreateAgent(ctx, mk("bot")); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("duplicate create: err = %v, want ErrConflict", err)
	}
	if err := agents.CreateAgent(ctx, second); err != nil {
		t.Fatalf("second agent: %v", err)
	}
	second.Name = "bot"
	if err := agents.UpdateAgent(ctx, second); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("rename onto an existing name: err = %v, want ErrConflict", err)
	}

	conns := NewConnectionRepository(pool)
	conn := func() *domain.AuthConnection {
		return &domain.AuthConnection{UserID: user.ID, Provider: "github", ProviderAccountID: "42", DisplayName: "gh",
			AccessTokenEnc: []byte("e"), AccessTokenNonce: []byte("n"), AccessTokenTag: []byte("t"), Status: "active"}
	}
	if err := conns.CreateConnection(ctx, conn()); err != nil {
		t.Fatalf("first connection: %v", err)
	}
	if err := conns.CreateConnection(ctx, conn()); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("duplicate connection: err = %v, want ErrConflict", err)
	}
}
