package models

import (
	"time"

	"github.com/google/uuid"
)

// AssistantStatus represents the assistant binding status.
type AssistantStatus string

const (
	AssistantStatusActive AssistantStatus = "active"
)

// Assistant represents an AI assistant registration.
type Assistant struct {
	ID           uuid.UUID       `json:"id"`
	Name         string          `json:"name"`
	Description  string          `json:"description,omitempty"`
	CredentialID *uuid.UUID      `json:"credential_id,omitempty"`
	Scope        map[string]any  `json:"scope,omitempty"`
	Status       AssistantStatus `json:"status"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

// CreateAssistantRequest is the request body for creating an assistant.
type CreateAssistantRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// Validate validates the create assistant request.
func (r *CreateAssistantRequest) Validate() error {
	if r.Name == "" {
		return ErrValidation{Field: "name", Message: "name is required"}
	}
	return nil
}

// BindAssistantRequest is the request body for binding assistant to credential.
type BindAssistantRequest struct {
	CredentialID uuid.UUID      `json:"credential_id"`
	Scope        map[string]any `json:"scope,omitempty"`
}

// Validate validates the bind assistant request.
func (r *BindAssistantRequest) Validate() error {
	if r.CredentialID == uuid.Nil {
		return ErrValidation{Field: "credential_id", Message: "credential_id is required"}
	}
	return nil
}
