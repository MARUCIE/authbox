package domain

import (
	"time"

	"github.com/google/uuid"
)

type Agent struct {
	ID           uuid.UUID
	UserID       uuid.UUID
	Name         string
	Description  string
	AgentType    string
	APIKeyHash   string
	Status       string
	LastActiveAt *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type AgentPolicy struct {
	ID          uuid.UUID
	AgentID     uuid.UUID
	PolicyType  string
	Rules       []byte // JSONB
	ScopeFilter []byte // JSONB, nullable
	Priority    int
	Enabled     bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
