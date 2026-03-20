package domain

import (
	"time"

	"github.com/google/uuid"
)

type AuthConnection struct {
	ID                uuid.UUID
	UserID            uuid.UUID
	Provider          string
	ProviderAccountID string
	DisplayName       string
	AccessTokenEnc    []byte
	AccessTokenNonce  []byte
	AccessTokenTag    []byte
	RefreshTokenEnc   []byte
	RefreshTokenNonce []byte
	RefreshTokenTag   []byte
	TokenExpiresAt    *time.Time
	Scopes            []string
	Status            string
	Metadata          []byte // JSONB
	CreatedAt         time.Time
	UpdatedAt         time.Time
}
