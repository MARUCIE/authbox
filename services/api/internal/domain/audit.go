package domain

import (
	"github.com/google/uuid"
	"time"
)

type AuditEvent struct {
	ID            uuid.UUID
	UserID        uuid.UUID
	ActorType     string // "user", "agent", "system"
	ActorID       uuid.UUID
	Action        string
	ResourceType  string
	ResourceID    string
	Decision      string // "allowed", "denied", "error"
	Metadata      []byte // JSONB
	EventHash     string
	PrevEventHash string
	IPAddress     string
	UserAgent     string
	CreatedAt     time.Time
}
