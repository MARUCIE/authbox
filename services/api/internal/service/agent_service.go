package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"

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

type PolicyRequest struct {
	PolicyType  string          `json:"policyType"`
	Rules       json.RawMessage `json:"rules"`
	ScopeFilter json.RawMessage `json:"scopeFilter,omitempty"`
	Priority    int             `json:"priority"`
	Enabled     bool            `json:"enabled"`
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
		return nil, errors.New("name is required")
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
		return nil, nil
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

func (s *AgentService) UpdateAgent(ctx context.Context, id, userID uuid.UUID, req UpdateAgentRequest) error {
	agent := &domain.Agent{
		ID:          id,
		UserID:      userID,
		Name:        req.Name,
		Description: req.Description,
		AgentType:   req.AgentType,
		Status:      req.Status,
	}
	return s.agentRepo.UpdateAgent(ctx, agent)
}

func (s *AgentService) DeleteAgent(ctx context.Context, id, userID uuid.UUID) error {
	return s.agentRepo.DeleteAgent(ctx, id, userID)
}

// --- Policy operations ---

func (s *AgentService) CreatePolicy(ctx context.Context, agentID uuid.UUID, req PolicyRequest) (*PolicyResponse, error) {
	if req.PolicyType == "" {
		return nil, errors.New("policyType is required")
	}

	policy := &domain.AgentPolicy{
		AgentID:     agentID,
		PolicyType:  req.PolicyType,
		Rules:       []byte(req.Rules),
		ScopeFilter: []byte(req.ScopeFilter),
		Priority:    req.Priority,
		Enabled:     req.Enabled,
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

func (s *AgentService) UpdatePolicy(ctx context.Context, agentID, policyID uuid.UUID, req PolicyRequest) error {
	policy := &domain.AgentPolicy{
		ID:          policyID,
		AgentID:     agentID,
		PolicyType:  req.PolicyType,
		Rules:       []byte(req.Rules),
		ScopeFilter: []byte(req.ScopeFilter),
		Priority:    req.Priority,
		Enabled:     req.Enabled,
	}
	return s.agentRepo.UpdatePolicy(ctx, policy)
}

func (s *AgentService) DeletePolicy(ctx context.Context, policyID, agentID uuid.UUID) error {
	return s.agentRepo.DeletePolicy(ctx, policyID, agentID)
}
