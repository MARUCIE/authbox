package domain

import (
	"time"

	"github.com/google/uuid"
)

type VaultItem struct {
	ID            uuid.UUID
	UserID        uuid.UUID
	EncryptedData []byte
	Nonce         []byte
	Tag           []byte
	ItemType      string
	Version       int
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
