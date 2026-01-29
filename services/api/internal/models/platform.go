package models

import (
	"time"

	"github.com/google/uuid"
)

// PlatformStatus represents the status of a platform connection
type PlatformStatus string

const (
	PlatformStatusActive   PlatformStatus = "active"
	PlatformStatusInactive PlatformStatus = "inactive"
	PlatformStatusError    PlatformStatus = "error"
)

// PlatformConfig holds platform-specific configuration
type PlatformConfig struct {
	BaseURL  string `json:"base_url,omitempty"`
	AuthType string `json:"auth_type,omitempty"`
}

// Platform represents an external service/platform connection
type Platform struct {
	ID        uuid.UUID      `json:"id"`
	Name      string         `json:"name"`
	Type      string         `json:"type"`
	Status    PlatformStatus `json:"status"`
	Config    PlatformConfig `json:"config,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
}

// CreatePlatformRequest is the request body for creating a platform
type CreatePlatformRequest struct {
	Name   string         `json:"name"`
	Type   string         `json:"type"`
	Config PlatformConfig `json:"config"`
}

// Validate validates the create platform request
func (r *CreatePlatformRequest) Validate() error {
	if r.Name == "" {
		return ErrValidation{Field: "name", Message: "name is required"}
	}
	if r.Type == "" {
		return ErrValidation{Field: "type", Message: "type is required"}
	}
	return nil
}

// UpdatePlatformRequest is the request body for updating a platform
type UpdatePlatformRequest struct {
	Name   *string         `json:"name,omitempty"`
	Status *PlatformStatus `json:"status,omitempty"`
	Config *PlatformConfig `json:"config,omitempty"`
}

// ErrValidation represents a validation error
type ErrValidation struct {
	Field   string
	Message string
}

func (e ErrValidation) Error() string {
	return e.Message
}
