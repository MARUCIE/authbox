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
	// SyncSeq is a globally monotonic cursor stamped on every insert/update;
	// SyncPull pages on it (the per-item Version cannot be a cursor).
	SyncSeq int64
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
