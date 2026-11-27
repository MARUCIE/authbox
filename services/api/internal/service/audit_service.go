package service

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"
	"unicode/utf8"

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

// Field limits match the audit_events columns.
const (
	maxAuditIP        = 45
	maxAuditUserAgent = 512
)

// RecordUserAction appends an event for an action the signed-in user took
// through the API. Callers treat a failure as non-fatal: the action already
// happened, so they log the error rather than fail the request.
func (s *AuditService) RecordUserAction(ctx context.Context, userID uuid.UUID, action, resourceType, resourceID, ipAddress, userAgent string) error {
	return s.LogEvent(ctx, userID, AuditEventRequest{
		ActorType:    "user",
		ActorID:      userID.String(),
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Decision:     "allowed",
		IPAddress:    ipAddress,
		UserAgent:    userAgent,
	})
}

func (s *AuditService) LogEvent(ctx context.Context, userID uuid.UUID, req AuditEventRequest) error {
	actorID, err := uuid.Parse(req.ActorID)
	if err != nil {
		actorID = userID // fallback: user is the actor
	}

	metadata := []byte("{}")
	if req.Metadata != nil {
		if b, err := json.Marshal(req.Metadata); err == nil {
			metadata = b
		} else {
			slog.Warn("failed to marshal audit metadata", "error", err)
		}
	}

	event := &domain.AuditEvent{
		UserID:       userID,
		ActorType:    req.ActorType,
		ActorID:      actorID,
		Action:       req.Action,
		ResourceType: req.ResourceType,
		ResourceID:   req.ResourceID,
		Decision:     req.Decision,
		Metadata:     metadata,
		IPAddress:    truncate(req.IPAddress, maxAuditIP),
		UserAgent:    truncate(req.UserAgent, maxAuditUserAgent),
	}
	return s.auditRepo.AppendEvent(ctx, event)
}

// truncate cuts s to at most n bytes without splitting a UTF-8 character.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
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
