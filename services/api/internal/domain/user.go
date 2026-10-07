package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type KDFParams struct {
	Algorithm   string `json:"algorithm"`
	Memory      int    `json:"memory"`
	Iterations  int    `json:"iterations"`
	Parallelism int    `json:"parallelism"`
	KeyLength   int    `json:"keyLength"`
}

type User struct {
	ID                uuid.UUID
	Email             string
	SRPSalt           []byte
	SRPVerifier       []byte
	EncryptedVaultKey []byte
	VaultKeyNonce     []byte
	VaultKeyTag       []byte
	KDFParams         KDFParams
	PublicKey         []byte
	TOTPSecret        []byte
	TOTPEnabled       bool
	TOTPVerifiedAt    *time.Time
	// TOTPLastCounter is the last accepted TOTP counter step (replay guard).
	TOTPLastCounter int64
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func DefaultKDFParams() KDFParams {
	return KDFParams{
		Algorithm:   "argon2id",
		Memory:      262144,
		Iterations:  3,
		Parallelism: 4,
		KeyLength:   32,
	}
}

func (p KDFParams) MarshalJSON() ([]byte, error) {
	type alias KDFParams
	return json.Marshal(alias(p))
}
