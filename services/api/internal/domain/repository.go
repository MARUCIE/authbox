package domain

import (
	"context"

	"github.com/google/uuid"
)

// UserRepository defines the contract for user persistence.
type UserRepository interface {
	Create(ctx context.Context, u *User) error
	FindByEmail(ctx context.Context, email string) (*User, error)
	FindByID(ctx context.Context, id uuid.UUID) (*User, error)
	SetTOTPSecret(ctx context.Context, userID uuid.UUID, secret []byte) error
	EnableTOTP(ctx context.Context, userID uuid.UUID) error
	DisableTOTP(ctx context.Context, userID uuid.UUID) error
}

// SessionRepository defines the contract for session persistence.
type SessionRepository interface {
	Create(ctx context.Context, s *Session) error
	ValidateSession(ctx context.Context, tokenHash []byte) (uuid.UUID, error)
	DeleteByTokenHash(ctx context.Context, tokenHash []byte) error
	DeleteByUserID(ctx context.Context, userID uuid.UUID) error
	ListByUserID(ctx context.Context, userID uuid.UUID) ([]Session, error)
	DeleteByID(ctx context.Context, sessionID uuid.UUID, userID uuid.UUID) error
	TouchSession(ctx context.Context, tokenHash []byte) error
}

// VaultRepository defines the contract for vault persistence.
type VaultRepository interface {
	CreateItem(ctx context.Context, item *VaultItem) error
	GetItem(ctx context.Context, id, userID uuid.UUID) (*VaultItem, error)
	ListItems(ctx context.Context, userID uuid.UUID, limit, offset int) ([]VaultItem, error)
	UpdateItem(ctx context.Context, item *VaultItem) error
	DeleteItem(ctx context.Context, id, userID uuid.UUID) error
	SyncPull(ctx context.Context, userID uuid.UUID, sinceVersion, limit int) ([]VaultItem, error)
}

// AgentRepository defines the contract for agent persistence.
type AgentRepository interface {
	CreateAgent(ctx context.Context, agent *Agent) error
	GetAgent(ctx context.Context, id, userID uuid.UUID) (*Agent, error)
	ListAgents(ctx context.Context, userID uuid.UUID) ([]Agent, error)
	UpdateAgent(ctx context.Context, agent *Agent) error
	DeleteAgent(ctx context.Context, id, userID uuid.UUID) error
	CreatePolicy(ctx context.Context, policy *AgentPolicy) error
	ListPolicies(ctx context.Context, agentID uuid.UUID) ([]AgentPolicy, error)
	UpdatePolicy(ctx context.Context, policy *AgentPolicy) error
	DeletePolicy(ctx context.Context, id, agentID uuid.UUID) error
}

// ConnectionRepository defines the contract for OAuth connection persistence.
type ConnectionRepository interface {
	CreateConnection(ctx context.Context, conn *AuthConnection) error
	GetConnection(ctx context.Context, id, userID uuid.UUID) (*AuthConnection, error)
	ListConnections(ctx context.Context, userID uuid.UUID) ([]AuthConnection, error)
	UpdateConnection(ctx context.Context, conn *AuthConnection) error
	DeleteConnection(ctx context.Context, id, userID uuid.UUID) error
}

// AuditRepository defines the contract for audit event persistence.
type AuditRepository interface {
	GetLatestEvent(ctx context.Context, userID uuid.UUID) (*AuditEvent, error)
	CreateEvent(ctx context.Context, event *AuditEvent) error
	ListEvents(ctx context.Context, userID uuid.UUID, limit, offset int) ([]AuditEvent, error)
	VerifyChain(ctx context.Context, userID uuid.UUID) (bool, int, error)
}
