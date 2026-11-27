//go:build integration

package pg

import (
	"context"
	"os"
	"sync"
	"testing"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Concurrent appends must form one unbroken chain that re-verifies from the
// stored rows (sub-second timestamps included).
func TestAppendEventConcurrentChainVerifies(t *testing.T) {
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
		Email:             "audit-" + uuid.NewString()[:8] + "@authbox.io",
		SRPSalt:           []byte("salt"),
		SRPVerifier:       []byte("verifier"),
		EncryptedVaultKey: []byte("key"),
		VaultKeyNonce:     []byte("123456789012"),
		VaultKeyTag:       []byte("1234567890abcdef"),
	}
	if err := NewUserRepository(pool).Create(ctx, user); err != nil {
		t.Fatalf("create user: %v", err)
	}

	repo := NewAuditRepository(pool)
	const n = 25
	var wg sync.WaitGroup
	errs := make(chan error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- repo.AppendEvent(ctx, &domain.AuditEvent{
				UserID: user.ID, ActorType: "user", ActorID: user.ID, Action: "agent.update",
				ResourceType: "agent", ResourceID: "a|b", Decision: "allowed", Metadata: []byte("{}"),
			})
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("append: %v", err)
		}
	}

	valid, verified, err := repo.VerifyChain(ctx, user.ID)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !valid || verified != n {
		t.Fatalf("valid=%v verified=%d, want true/%d", valid, verified, n)
	}

	if _, err := pool.Exec(ctx, `UPDATE audit_events SET decision = 'denied'
		WHERE id = (SELECT id FROM audit_events WHERE user_id = $1 ORDER BY created_at LIMIT 1 OFFSET 3)`, user.ID); err != nil {
		t.Fatalf("tamper: %v", err)
	}
	if valid, verified, _ := repo.VerifyChain(ctx, user.ID); valid || verified != 3 {
		t.Fatalf("after tampering row 4: valid=%v verified=%d, want false/3", valid, verified)
	}
}
