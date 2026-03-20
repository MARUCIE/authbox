package domain

import (
	"time"

	"github.com/google/uuid"
)

type Session struct {
	ID         uuid.UUID
	UserID     uuid.UUID
	TokenHash  []byte
	DeviceName string
	IPAddress  string
	UserAgent  string
	ExpiresAt    time.Time
	LastActiveAt time.Time
	CreatedAt    time.Time
}
