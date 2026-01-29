package models

import (
	"time"

	"github.com/google/uuid"
)

// AccountStatus represents the status of an account
type AccountStatus string

const (
	AccountStatusActive    AccountStatus = "active"
	AccountStatusSuspended AccountStatus = "suspended"
	AccountStatusDeleted   AccountStatus = "deleted"
)

// Account represents a user's identity on a platform
type Account struct {
	ID                uuid.UUID     `json:"id"`
	PlatformID        uuid.UUID     `json:"platform_id"`
	DisplayName       string        `json:"display_name"`
	ExternalAccountID string        `json:"external_account_id,omitempty"`
	Status            AccountStatus `json:"status"`
	RiskScore         float64       `json:"risk_score,omitempty"`
	CreatedAt         time.Time     `json:"created_at"`
	UpdatedAt         time.Time     `json:"updated_at"`
}

// CreateAccountRequest is the request body for creating an account
type CreateAccountRequest struct {
	PlatformID  uuid.UUID `json:"platform_id"`
	DisplayName string    `json:"display_name"`
}

// Validate validates the create account request
func (r *CreateAccountRequest) Validate() error {
	if r.PlatformID == uuid.Nil {
		return ErrValidation{Field: "platform_id", Message: "platform_id is required"}
	}
	if r.DisplayName == "" {
		return ErrValidation{Field: "display_name", Message: "display_name is required"}
	}
	return nil
}

// UpdateAccountRequest is the request body for updating an account
type UpdateAccountRequest struct {
	DisplayName *string        `json:"display_name,omitempty"`
	Status      *AccountStatus `json:"status,omitempty"`
}
