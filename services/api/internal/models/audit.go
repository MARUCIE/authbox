package models

import (
	"time"

	"github.com/google/uuid"
)

// AuditDecision is the policy decision for an audited action.
type AuditDecision string

const (
	AuditDecisionAllow AuditDecision = "allow"
	AuditDecisionDeny  AuditDecision = "deny"
)

// AuditEvent represents an auditable platform event.
type AuditEvent struct {
	ID            uuid.UUID     `json:"id"`
	Timestamp     time.Time     `json:"timestamp"`
	ActorID       string        `json:"actor_id"`
	Source        string        `json:"source"`
	Action        string        `json:"action"`
	Resource      string        `json:"resource"`
	Decision      AuditDecision `json:"decision"`
	Result        string        `json:"result"`
	Reason        string        `json:"reason,omitempty"`
	InputsHash    string        `json:"inputs_hash,omitempty"`
	OutputsHash   string        `json:"outputs_hash,omitempty"`
	PrevEventHash string        `json:"prev_event_hash,omitempty"`
	EventHash     string        `json:"event_hash"`
}

// AuditExportStatus represents export status.
type AuditExportStatus string

const (
	AuditExportStatusQueued AuditExportStatus = "queued"
)

// AuditExport represents an audit export job.
type AuditExport struct {
	ID          uuid.UUID         `json:"id"`
	Status      AuditExportStatus `json:"status"`
	From        string            `json:"from"`
	To          string            `json:"to"`
	Format      string            `json:"format"`
	DownloadURL string            `json:"download_url"`
	CreatedAt   time.Time         `json:"created_at"`
}

// CreateAuditExportRequest is the request body for creating an audit export.
type CreateAuditExportRequest struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Format string `json:"format"`
}

// Validate validates the create audit export request.
func (r *CreateAuditExportRequest) Validate() error {
	if r.From == "" {
		return ErrValidation{Field: "from", Message: "from is required"}
	}
	if r.To == "" {
		return ErrValidation{Field: "to", Message: "to is required"}
	}
	if r.Format == "" {
		return ErrValidation{Field: "format", Message: "format is required"}
	}
	return nil
}
