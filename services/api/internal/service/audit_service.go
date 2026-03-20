package service

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

type AuditService struct {
	auditRepo domain.AuditRepository
}

func NewAuditService(auditRepo domain.AuditRepository) *AuditService {
	return &AuditService{auditRepo: auditRepo}
}

type AuditEventRequest struct {
	ActorType    string                 `json:"actorType"`
	ActorID      string                 `json:"actorId"`
	Action       string                 `json:"action"`
	ResourceType string                 `json:"resourceType"`
	ResourceID   string                 `json:"resourceId"`
	Decision     string                 `json:"decision"`
	Metadata     map[string]interface{} `json:"metadata"`
	IPAddress    string                 `json:"ipAddress"`
	UserAgent    string                 `json:"userAgent"`
}

type AuditEventResponse struct {
	ID            string                 `json:"id"`
	ActorType     string                 `json:"actorType"`
	ActorID       string                 `json:"actorId"`
	Action        string                 `json:"action"`
	ResourceType  string                 `json:"resourceType"`
	ResourceID    string                 `json:"resourceId"`
	Decision      string                 `json:"decision"`
	Metadata      map[string]interface{} `json:"metadata"`
	EventHash     string                 `json:"eventHash"`
	PrevEventHash string                 `json:"prevEventHash"`
	CreatedAt     string                 `json:"createdAt"`
}

type ChainVerifyResponse struct {
	Valid    bool `json:"valid"`
	Verified int  `json:"verified"`
}

func (s *AuditService) LogEvent(ctx context.Context, userID uuid.UUID, req AuditEventRequest) (*AuditEventResponse, error) {
	actorID, err := uuid.Parse(req.ActorID)
	if err != nil {
		actorID = userID // fallback: user is the actor
	}

	// Get previous event hash for chain
	prevHash := ""
	latest, err := s.auditRepo.GetLatestEvent(ctx, userID)
	if err != nil {
		return nil, err
	}
	if latest != nil {
		prevHash = latest.EventHash
	}

	var metadata []byte
	if req.Metadata != nil {
		var err2 error
		metadata, err2 = json.Marshal(req.Metadata)
		if err2 != nil {
			slog.Warn("failed to marshal audit metadata", "error", err2)
			metadata = []byte("{}")
		}
	} else {
		metadata = []byte("{}")
	}

	event := &domain.AuditEvent{
		UserID:        userID,
		ActorType:     req.ActorType,
		ActorID:       actorID,
		Action:        req.Action,
		ResourceType:  req.ResourceType,
		ResourceID:    req.ResourceID,
		Decision:      req.Decision,
		Metadata:      metadata,
		PrevEventHash: prevHash,
		IPAddress:     req.IPAddress,
		UserAgent:     req.UserAgent,
		CreatedAt:     time.Now().UTC(),
	}

	if err := s.auditRepo.CreateEvent(ctx, event); err != nil {
		return nil, err
	}

	return eventToResponse(event), nil
}

func (s *AuditService) ListEvents(ctx context.Context, userID uuid.UUID, limit, offset int) ([]AuditEventResponse, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	events, err := s.auditRepo.ListEvents(ctx, userID, limit, offset)
	if err != nil {
		return nil, err
	}

	responses := make([]AuditEventResponse, len(events))
	for i, e := range events {
		responses[i] = *eventToResponse(&e)
	}
	return responses, nil
}

func (s *AuditService) VerifyChain(ctx context.Context, userID uuid.UUID) (*ChainVerifyResponse, error) {
	valid, verified, err := s.auditRepo.VerifyChain(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &ChainVerifyResponse{Valid: valid, Verified: verified}, nil
}

func eventToResponse(e *domain.AuditEvent) *AuditEventResponse {
	var metadata map[string]interface{}
	_ = json.Unmarshal(e.Metadata, &metadata)

	return &AuditEventResponse{
		ID:            e.ID.String(),
		ActorType:     e.ActorType,
		ActorID:       e.ActorID.String(),
		Action:        e.Action,
		ResourceType:  e.ResourceType,
		ResourceID:    e.ResourceID,
		Decision:      e.Decision,
		Metadata:      metadata,
		EventHash:     e.EventHash,
		PrevEventHash: e.PrevEventHash,
		CreatedAt:     e.CreatedAt.Format(time.RFC3339),
	}
}
