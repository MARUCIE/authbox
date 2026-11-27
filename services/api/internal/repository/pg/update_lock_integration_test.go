//go:build integration

package pg

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Two partial updates of one policy that overlap must both survive: the
// second waits for the first and starts from its result.
func TestUpdatePolicyConcurrentPartialUpdatesBothApply(t *testing.T) {
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
		Email:             "lock-" + uuid.NewString()[:8] + "@authbox.io",
		SRPSalt:           []byte("salt"),
		SRPVerifier:       []byte("verifier"),
		EncryptedVaultKey: []byte("key"),
		VaultKeyNonce:     []byte("123456789012"),
		VaultKeyTag:       []byte("1234567890abcdef"),
	}
	if err := NewUserRepository(pool).Create(ctx, user); err != nil {
		t.Fatalf("create user: %v", err)
	}
	repo := NewAgentRepository(pool)
	agent := &domain.Agent{UserID: user.ID, Name: "bot", AgentType: "custom", APIKeyHash: uuid.NewString(), Status: "active"}
	if err := repo.CreateAgent(ctx, agent); err != nil {
		t.Fatalf("agent: %v", err)
	}
	policy := &domain.AgentPolicy{AgentID: agent.ID, PolicyType: "rate_limit", Rules: []byte(`{}`), Priority: 1, Enabled: true}
	if err := repo.CreatePolicy(ctx, policy); err != nil {
		t.Fatalf("policy: %v", err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, 2)
	wg.Add(2)
	go func() { // disable, slowly
		defer wg.Done()
		errs <- repo.UpdatePolicy(ctx, agent.ID, policy.ID, func(p *domain.AgentPolicy) error {
			time.Sleep(100 * time.Millisecond)
			p.Enabled = false
			return nil
		})
	}()
	time.Sleep(20 * time.Millisecond)
	go func() { // reprioritise while the first is still open
		defer wg.Done()
		errs <- repo.UpdatePolicy(ctx, agent.ID, policy.ID, func(p *domain.AgentPolicy) error {
			p.Priority = 7
			return nil
		})
	}()
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("update: %v", err)
		}
	}

	policies, err := repo.ListPolicies(ctx, agent.ID)
	if err != nil || len(policies) != 1 {
		t.Fatalf("list: %v (%d)", err, len(policies))
	}
	if got := policies[0]; got.Enabled || got.Priority != 7 {
		t.Fatalf("enabled=%v priority=%d, want false/7: one update undid the other", got.Enabled, got.Priority)
	}
	if err := repo.UpdatePolicy(ctx, uuid.New(), policy.ID, func(*domain.AgentPolicy) error { return nil }); err != domain.ErrPolicyNotFound {
		t.Fatalf("other agent's policy: err = %v, want ErrPolicyNotFound", err)
	}
}
