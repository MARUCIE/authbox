package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"testing"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

// memConnRepo keeps one connection in memory so update tests can see exactly
// what the service writes back.
type memConnRepo struct {
	domain.ConnectionRepository
	stored *domain.AuthConnection
}

func (r *memConnRepo) GetConnection(_ context.Context, id, userID uuid.UUID) (*domain.AuthConnection, error) {
	if r.stored == nil || r.stored.ID != id || r.stored.UserID != userID {
		return nil, nil
	}
	c := *r.stored
	return &c, nil
}

func (r *memConnRepo) UpdateConnection(_ context.Context, c *domain.AuthConnection) error {
	saved := *c
	r.stored = &saved
	return nil
}

func b64(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

func seededConn() (*memConnRepo, uuid.UUID, uuid.UUID) {
	id, user := uuid.New(), uuid.New()
	return &memConnRepo{stored: &domain.AuthConnection{
		ID: id, UserID: user, Provider: "github", DisplayName: "old",
		AccessTokenEnc: []byte("enc"), AccessTokenNonce: []byte("nonce"), AccessTokenTag: []byte("tag"),
		RefreshTokenEnc: []byte("renc"), RefreshTokenNonce: []byte("rnonce"), RefreshTokenTag: []byte("rtag"),
		Scopes: []string{"repo"}, Status: "active",
	}}, id, user
}

func TestUpdateConnectionRenameKeepsTokens(t *testing.T) {
	repo, id, user := seededConn()
	svc := NewConnectionService(repo)
	if err := svc.UpdateConnection(context.Background(), id, user, UpdateConnectionRequest{DisplayName: "new"}); err != nil {
		t.Fatal(err)
	}
	got := repo.stored
	if got.DisplayName != "new" {
		t.Fatalf("displayName = %q", got.DisplayName)
	}
	if string(got.AccessTokenEnc) != "enc" || string(got.RefreshTokenTag) != "rtag" {
		t.Fatal("a rename must not touch the encrypted tokens")
	}
	if got.Provider != "github" || got.Status != "active" || len(got.Scopes) != 1 {
		t.Fatalf("omitted fields changed: %+v", got)
	}
}

func TestUpdateConnectionReplacesWholeToken(t *testing.T) {
	repo, id, user := seededConn()
	svc := NewConnectionService(repo)
	req := UpdateConnectionRequest{AccessTokenEnc: b64("e2"), AccessTokenNonce: b64("n2"), AccessTokenTag: b64("t2")}
	if err := svc.UpdateConnection(context.Background(), id, user, req); err != nil {
		t.Fatal(err)
	}
	if string(repo.stored.AccessTokenEnc) != "e2" || string(repo.stored.RefreshTokenEnc) != "renc" {
		t.Fatal("access token not replaced, or refresh token disturbed")
	}
}

func TestUpdateConnectionRejectsBadInput(t *testing.T) {
	cases := map[string]UpdateConnectionRequest{
		"partial token": {AccessTokenEnc: b64("only-enc")},
		"bad base64":    {AccessTokenEnc: "!!", AccessTokenNonce: b64("n"), AccessTokenTag: b64("t")},
		"non-JSON meta": {Metadata: b64("not json")},
		"long status":   {Status: "this-status-is-far-too-long"},
		"bad expiry":    {TokenExpiresAt: strPtr("tomorrow")},
		"long provider": {Provider: string(make([]byte, 65))},
	}
	for name, req := range cases {
		repo, id, user := seededConn()
		before := *repo.stored
		err := NewConnectionService(repo).UpdateConnection(context.Background(), id, user, req)
		if !errors.Is(err, ErrInvalidConnection) {
			t.Fatalf("%s: err = %v, want ErrInvalidConnection", name, err)
		}
		if string(repo.stored.AccessTokenEnc) != string(before.AccessTokenEnc) || repo.stored.Status != before.Status {
			t.Fatalf("%s: rejected update still wrote", name)
		}
	}
}

func TestUpdateConnectionNotFound(t *testing.T) {
	repo, id, _ := seededConn()
	err := NewConnectionService(repo).UpdateConnection(context.Background(), id, uuid.New(), UpdateConnectionRequest{DisplayName: "x"})
	if !errors.Is(err, domain.ErrConnectionNotFound) {
		t.Fatalf("err = %v, want ErrConnectionNotFound", err)
	}
}

func strPtr(s string) *string { return &s }

// memAgentRepo holds one agent and its policies in memory.
type memAgentRepo struct {
	domain.AgentRepository
	agent    *domain.Agent
	policies []domain.AgentPolicy
	created  *domain.AgentPolicy
}

func (r *memAgentRepo) GetAgent(_ context.Context, id, userID uuid.UUID) (*domain.Agent, error) {
	if r.agent == nil || r.agent.ID != id || r.agent.UserID != userID {
		return nil, nil
	}
	a := *r.agent
	return &a, nil
}

func (r *memAgentRepo) UpdateAgent(_ context.Context, a *domain.Agent) error {
	saved := *a
	r.agent = &saved
	return nil
}

func (r *memAgentRepo) ListPolicies(_ context.Context, agentID uuid.UUID) ([]domain.AgentPolicy, error) {
	out := make([]domain.AgentPolicy, len(r.policies))
	copy(out, r.policies)
	return out, nil
}

func (r *memAgentRepo) UpdatePolicy(_ context.Context, p *domain.AgentPolicy) error {
	for i := range r.policies {
		if r.policies[i].ID == p.ID {
			r.policies[i] = *p
		}
	}
	return nil
}

func (r *memAgentRepo) CreatePolicy(_ context.Context, p *domain.AgentPolicy) error {
	saved := *p
	r.created = &saved
	return nil
}

func TestUpdateAgentStatusOnlyKeepsNameAndType(t *testing.T) {
	id, user := uuid.New(), uuid.New()
	repo := &memAgentRepo{agent: &domain.Agent{ID: id, UserID: user, Name: "bot", AgentType: "claude", Status: "active"}}
	if err := NewAgentService(repo).UpdateAgent(context.Background(), id, user, UpdateAgentRequest{Status: "paused"}); err != nil {
		t.Fatal(err)
	}
	if repo.agent.Name != "bot" || repo.agent.AgentType != "claude" || repo.agent.Status != "paused" {
		t.Fatalf("got %+v", repo.agent)
	}
	err := NewAgentService(repo).UpdateAgent(context.Background(), id, user, UpdateAgentRequest{AgentType: "gpt"})
	if !errors.Is(err, ErrInvalidAgent) {
		t.Fatalf("unknown agentType: err = %v", err)
	}
}

// Regression: an update that sent only new rules used to store enabled=false
// and policyType="", silently switching the policy off.
func TestUpdatePolicyRulesOnlyKeepsEnabledAndType(t *testing.T) {
	agentID, policyID := uuid.New(), uuid.New()
	repo := &memAgentRepo{policies: []domain.AgentPolicy{{
		ID: policyID, AgentID: agentID, PolicyType: "rate_limit",
		Rules: []byte(`{"maxPerHour":10}`), Priority: 3, Enabled: true,
	}}}
	req := PolicyRequest{Rules: json.RawMessage(`{"maxPerHour":5}`)}
	if err := NewAgentService(repo).UpdatePolicy(context.Background(), agentID, policyID, req); err != nil {
		t.Fatal(err)
	}
	p := repo.policies[0]
	if !p.Enabled || p.PolicyType != "rate_limit" || p.Priority != 3 || string(p.Rules) != `{"maxPerHour":5}` {
		t.Fatalf("got %+v", p)
	}

	disable := false
	if err := NewAgentService(repo).UpdatePolicy(context.Background(), agentID, policyID, PolicyRequest{Enabled: &disable}); err != nil {
		t.Fatal(err)
	}
	if repo.policies[0].Enabled {
		t.Fatal("explicit enabled=false was ignored")
	}

	for name, bad := range map[string]PolicyRequest{
		"null rules":   {Rules: json.RawMessage(`null`)},
		"array rules":  {Rules: json.RawMessage(`[1]`)},
		"unknown type": {PolicyType: "scope"},
	} {
		if err := NewAgentService(repo).UpdatePolicy(context.Background(), agentID, policyID, bad); !errors.Is(err, ErrInvalidAgent) {
			t.Fatalf("%s: err = %v, want ErrInvalidAgent", name, err)
		}
	}
	if err := NewAgentService(repo).UpdatePolicy(context.Background(), agentID, uuid.New(), req); !errors.Is(err, domain.ErrPolicyNotFound) {
		t.Fatalf("unknown policy: err = %v", err)
	}
}

// Regression: the web console never sends "enabled", and the zero value used
// to store every new policy as disabled.
func TestCreatePolicyDefaultsToEnabled(t *testing.T) {
	repo := &memAgentRepo{}
	svc := NewAgentService(repo)
	if _, err := svc.CreatePolicy(context.Background(), uuid.New(), PolicyRequest{
		PolicyType: "item_scope", Rules: json.RawMessage(`{"allowedItemIds":["GitHub"]}`),
	}); err != nil {
		t.Fatal(err)
	}
	if !repo.created.Enabled {
		t.Fatal("a policy created without an explicit enabled flag must be enabled")
	}
	if _, err := svc.CreatePolicy(context.Background(), uuid.New(), PolicyRequest{PolicyType: "item_scope"}); !errors.Is(err, ErrInvalidAgent) {
		t.Fatalf("missing rules: err = %v", err)
	}
}
