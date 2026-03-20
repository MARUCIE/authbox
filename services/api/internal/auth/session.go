package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
)

// GenerateSessionToken creates a cryptographically random 32-byte token
// and returns it as a base64url string along with its SHA-256 hash.
// The raw token is returned to the client; the hash is stored in the DB.
func GenerateSessionToken() (token string, hash []byte, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", nil, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	h := sha256.Sum256(raw)
	return token, h[:], nil
}

// HashToken computes SHA-256 of a base64url-encoded session token.
// Used to look up sessions by the presented token.
func HashToken(token string) ([]byte, error) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return nil, err
	}
	h := sha256.Sum256(raw)
	return h[:], nil
}
