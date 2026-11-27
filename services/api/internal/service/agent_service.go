package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

type AgentService struct {
	agentRepo domain.AgentRepository
}

func NewAgentService(agentRepo domain.AgentRepository) *AgentService {
	return &AgentService{agentRepo: agentRepo}
}

// --- Request / Response types ---

type CreateAgentRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	AgentType   string `json:"agentType"`
}

// UpdateAgentRequest is a partial update: an empty field keeps the stored value.
type UpdateAgentRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	AgentType   string `json:"agentType"`
	Status      string `json:"status"`
}

type AgentResponse struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	AgentType    string  `json:"agentType"`
	Status       string  `json:"status"`
	LastActiveAt *string `json:"lastActiveAt,omitempty"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

type CreateAgentResponse struct {
	AgentResponse
	APIKey string `json:"apiKey"`
}

func agentToResponse(a *domain.Agent) AgentResponse {
	resp := AgentResponse{
		ID:          a.ID.String(),
		Name:        a.Name,
		Description: a.Description,
		AgentType:   a.AgentType,
		Status:      a.Status,
		CreatedAt:   a.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt:   a.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
	if a.LastActiveAt != nil {
		t := a.LastActiveAt.UTC().Format("2006-01-02T15:04:05Z")
		resp.LastActiveAt = &t
	}
	return resp
}

// PolicyRequest is used for create and for partial update. Priority and
// Enabled are pointers so an omitted field can be told apart from 0/false:
// a new policy is enabled unless the client says otherwise, and an update that
// only changes rules keeps the stored priority and enabled flag.
type PolicyRequest struct {
	PolicyType  string          `json:"policyType"`
	Rules       json.RawMessage `json:"rules"`
	ScopeFilter json.RawMessage `json:"scopeFilter,omitempty"`
	Priority    *int            `json:"priority,omitempty"`
	Enabled     *bool           `json:"enabled,omitempty"`
}

type PolicyResponse struct {
	ID          string          `json:"id"`
	AgentID     string          `json:"agentId"`
	PolicyType  string          `json:"policyType"`
	Rules       json.RawMessage `json:"rules"`
	ScopeFilter json.RawMessage `json:"scopeFilter,omitempty"`
	Priority    int             `json:"priority"`
	Enabled     bool            `json:"enabled"`
	CreatedAt   string          `json:"createdAt"`
	UpdatedAt   string          `json:"updatedAt"`
}

func policyToResponse(p *domain.AgentPolicy) PolicyResponse {
	resp := PolicyResponse{
		ID:         p.ID.String(),
		AgentID:    p.AgentID.String(),
		PolicyType: p.PolicyType,
		Rules:      json.RawMessage(p.Rules),
		Priority:   p.Priority,
		Enabled:    p.Enabled,
		CreatedAt:  p.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt:  p.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
	if len(p.ScopeFilter) > 0 {
		resp.ScopeFilter = json.RawMessage(p.ScopeFilter)
	}
	return resp
}

// --- Validation ---

// ErrInvalidAgent marks an agent or policy request the client must fix.
// Handlers map it to 400 so malformed input never surfaces as a 500.
var ErrInvalidAgent = errors.New("invalid agent request")

func invalidAgent(reason string) error {
	return fmt.Errorf("%w: %s", ErrInvalidAgent, reason)
}

// Must match the web client's AGENT_TYPES (apps/web/.../agents/page.tsx) and the
// shared AgentType enum.
var validAgentTypes = map[string]bool{
	"mcp_client": true, "claude": true, "chatgpt": true, "gemini": true, "custom": true,
}

// Must match the policy engine in packages/mcp-protocol.
var validPolicyTypes = map[string]bool{
	"item_scope": true, "action_perm": true, "rate_limit": true, "time_window": true, "step_up": true,
}

func IsValidAgentType(t string) bool  { return validAgentTypes[t] }
func IsValidPolicyType(t string) bool { return validPolicyTypes[t] }

const (
	maxAgentNameLen   = 128 // tighter than the VARCHAR(255) column
	maxAgentStatusLen = 20
)

func validateAgentFields(name, agentType, status string) error {
	if len(name) > maxAgentNameLen {
		return invalidAgent(fmt.Sprintf("name exceeds %d characters", maxAgentNameLen))
	}
	if agentType != "" && !validAgentTypes[agentType] {
		return invalidAgent("invalid agentType")
	}
	if len(status) > maxAgentStatusLen {
		return invalidAgent(fmt.Sprintf("status exceeds %d characters", maxAgentStatusLen))
	}
	return nil
}

// jsonObject checks that raw is a JSON object. Policy rules feed the policy
// engine, so null, arrays and scalars are rejected rather than stored.
func jsonObject(raw json.RawMessage, field string) error {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil || obj == nil {
		return invalidAgent(field + " must be a JSON object")
	}
	return nil
}

// scopeFilterBytes returns the stored form of a scopeFilter: nil for an
// explicit JSON null, otherwise a validated JSON object.
func scopeFilterBytes(raw json.RawMessage) ([]byte, error) {
	if string(raw) == "null" {
		return nil, nil
	}
	if err := jsonObject(raw, "scopeFilter"); err != nil {
		return nil, err
	}
	return []byte(raw), nil
}

// --- Agent operations ---

func generateAPIKey() (plaintext string, hash string, err error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", "", err
	}
	plaintext = base64.RawURLEncoding.EncodeToString(key)
	sum := sha256.Sum256([]byte(plaintext))
	hash = hex.EncodeToString(sum[:])
	return plaintext, hash, nil
}

func (s *AgentService) CreateAgent(ctx context.Context, userID uuid.UUID, req CreateAgentRequest) (*CreateAgentResponse, error) {
	if req.Name == "" {
		return nil, invalidAgent("name is required")
	}
	if err := validateAgentFields(req.Name, req.AgentType, ""); err != nil {
		return nil, err
	}

	agentType := req.AgentType
	if agentType == "" {
		agentType = "custom" // canonical catch-all; "service" was off-vocabulary
	}

	apiKey, apiKeyHash, err := generateAPIKey()
	if err != nil {
		return nil, err
	}

	agent := &domain.Agent{
		UserID:      userID,
		Name:        req.Name,
		Description: req.Description,
		AgentType:   agentType,
		APIKeyHash:  apiKeyHash,
		Status:      "active",
	}

	if err := s.agentRepo.CreateAgent(ctx, agent); err != nil {
		return nil, err
	}

	return &CreateAgentResponse{
		AgentResponse: agentToResponse(agent),
		APIKey:        apiKey,
	}, nil
}

func (s *AgentService) GetAgent(ctx context.Context, id, userID uuid.UUID) (*AgentResponse, error) {
	agent, err := s.agentRepo.GetAgent(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if agent == nil {
		return nil, domain.ErrAgentNotFound
	}
	resp := agentToResponse(agent)
	return &resp, nil
}

func (s *AgentService) ListAgents(ctx context.Context, userID uuid.UUID) ([]AgentResponse, error) {
	agents, err := s.agentRepo.ListAgents(ctx, userID)
	if err != nil {
		return nil, err
	}

	result := make([]AgentResponse, len(agents))
	for i := range agents {
		result[i] = agentToResponse(&agents[i])
	}
	return result, nil
}

// UpdateAgent applies a partial update, so a client that only toggles status
// does not blank the agent's name and type.
func (s *AgentService) UpdateAgent(ctx context.Context, id, userID uuid.UUID, req UpdateAgentRequest) error {
	if err := validateAgentFields(req.Name, req.AgentType, req.Status); err != nil {
		return err
	}
	return s.agentRepo.UpdateAgent(ctx, id, userID, func(agent *domain.Agent) error {
		if req.Name != "" {
			agent.Name = req.Name
		}
		if req.Description != "" {
			agent.Description = req.Description
		}
		if req.AgentType != "" {
			agent.AgentType = req.AgentType
		}
		if req.Status != "" {
			agent.Status = req.Status
		}
		return nil
	})
}

func (s *AgentService) DeleteAgent(ctx context.Context, id, userID uuid.UUID) error {
	return s.agentRepo.DeleteAgent(ctx, id, userID)
}

// --- Policy operations ---

func (s *AgentService) CreatePolicy(ctx context.Context, agentID uuid.UUID, req PolicyRequest) (*PolicyResponse, error) {
	if req.PolicyType == "" {
		return nil, invalidAgent("policyType is required")
	}
	if !validPolicyTypes[req.PolicyType] {
		return nil, invalidAgent("invalid policyType")
	}
	if len(req.Rules) == 0 {
		return nil, invalidAgent("rules is required")
	}
	if err := jsonObject(req.Rules, "rules"); err != nil {
		return nil, err
	}

	policy := &domain.AgentPolicy{
		AgentID:    agentID,
		PolicyType: req.PolicyType,
		Rules:      []byte(req.Rules),
		Enabled:    true,
	}
	if len(req.ScopeFilter) > 0 {
		var err error
		if policy.ScopeFilter, err = scopeFilterBytes(req.ScopeFilter); err != nil {
			return nil, err
		}
	}
	if req.Priority != nil {
		policy.Priority = *req.Priority
	}
	if req.Enabled != nil {
		policy.Enabled = *req.Enabled
	}

	if err := s.agentRepo.CreatePolicy(ctx, policy); err != nil {
		return nil, err
	}

	resp := policyToResponse(policy)
	return &resp, nil
}

func (s *AgentService) ListPolicies(ctx context.Context, agentID uuid.UUID) ([]PolicyResponse, error) {
	policies, err := s.agentRepo.ListPolicies(ctx, agentID)
	if err != nil {
		return nil, err
	}

	result := make([]PolicyResponse, len(policies))
	for i := range policies {
		result[i] = policyToResponse(&policies[i])
	}
	return result, nil
}

// UpdatePolicy applies a partial update. An omitted field keeps its stored
// value; before this, an update that sent only new rules also set enabled to
// false and blanked policyType, silently switching the policy off.
func (s *AgentService) UpdatePolicy(ctx context.Context, agentID, policyID uuid.UUID, req PolicyRequest) error {
	if req.PolicyType != "" && !validPolicyTypes[req.PolicyType] {
		return invalidAgent("invalid policyType")
	}
	if len(req.Rules) > 0 {
		if err := jsonObject(req.Rules, "rules"); err != nil {
			return err
		}
	}
	var scopeFilter []byte
	if len(req.ScopeFilter) > 0 {
		var err error
		if scopeFilter, err = scopeFilterBytes(req.ScopeFilter); err != nil {
			return err
		}
	}

	return s.agentRepo.UpdatePolicy(ctx, agentID, policyID, func(policy *domain.AgentPolicy) error {
		if req.PolicyType != "" {
			policy.PolicyType = req.PolicyType
		}
		if len(req.Rules) > 0 {
			policy.Rules = []byte(req.Rules)
		}
		if len(req.ScopeFilter) > 0 {
			policy.ScopeFilter = scopeFilter
		}
		if req.Priority != nil {
			policy.Priority = *req.Priority
		}
		if req.Enabled != nil {
			policy.Enabled = *req.Enabled
		}
		return nil
	})
}

func (s *AgentService) DeletePolicy(ctx context.Context, policyID, agentID uuid.UUID) error {
	return s.agentRepo.DeletePolicy(ctx, policyID, agentID)
}
