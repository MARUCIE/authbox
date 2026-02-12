package models

import (
	"time"

	"github.com/google/uuid"
)

// CredentialType represents supported credential types.
type CredentialType string

const (
	CredentialTypeAPIKey     CredentialType = "api_key"
	CredentialTypeOAuthToken CredentialType = "oauth_token"
)

// CredentialStatus represents the status of a credential.
type CredentialStatus string

const (
	CredentialStatusActive  CredentialStatus = "active"
	CredentialStatusRevoked CredentialStatus = "revoked"
)

// Credential represents an issued credential for an account.
type Credential struct {
	ID        uuid.UUID        `json:"id"`
	AccountID uuid.UUID        `json:"account_id"`
	Type      CredentialType   `json:"type"`
	Status    CredentialStatus `json:"status"`
	ExpiresAt *time.Time       `json:"expires_at,omitempty"`
	CreatedAt time.Time        `json:"created_at"`
	UpdatedAt time.Time        `json:"updated_at"`
	RotatedAt *time.Time       `json:"rotated_at,omitempty"`
}

// CreateCredentialRequest is the request body for creating a credential.
type CreateCredentialRequest struct {
	AccountID uuid.UUID      `json:"account_id"`
	Type      CredentialType `json:"type"`
	ExpiresAt *time.Time     `json:"expires_at,omitempty"`
}

// Validate validates the create credential request.
func (r *CreateCredentialRequest) Validate() error {
	if r.AccountID == uuid.Nil {
		return ErrValidation{Field: "account_id", Message: "account_id is required"}
	}
	if r.Type == "" {
		return ErrValidation{Field: "type", Message: "type is required"}
	}
	return nil
}
