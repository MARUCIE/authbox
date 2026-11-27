package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

// decodeB64 decodes a base64-encoded string, returning a descriptive error on failure.
func decodeB64(value, fieldName string) ([]byte, error) {
	b, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("invalid %s encoding", fieldName)
	}
	return b, nil
}

type ConnectionService struct {
	connRepo domain.ConnectionRepository
}

func NewConnectionService(connRepo domain.ConnectionRepository) *ConnectionService {
	return &ConnectionService{connRepo: connRepo}
}

// --- Request / Response types ---

type CreateConnectionRequest struct {
	Provider          string   `json:"provider"`
	ProviderAccountID string   `json:"providerAccountId"`
	DisplayName       string   `json:"displayName"`
	AccessTokenEnc    string   `json:"accessTokenEnc"`
	AccessTokenNonce  string   `json:"accessTokenNonce"`
	AccessTokenTag    string   `json:"accessTokenTag"`
	RefreshTokenEnc   string   `json:"refreshTokenEnc,omitempty"`
	RefreshTokenNonce string   `json:"refreshTokenNonce,omitempty"`
	RefreshTokenTag   string   `json:"refreshTokenTag,omitempty"`
	TokenExpiresAt    *string  `json:"tokenExpiresAt,omitempty"`
	Scopes            []string `json:"scopes,omitempty"`
	Metadata          string   `json:"metadata,omitempty"` // JSON string
}

type UpdateConnectionRequest struct {
	Provider          string   `json:"provider"`
	ProviderAccountID string   `json:"providerAccountId"`
	DisplayName       string   `json:"displayName"`
	AccessTokenEnc    string   `json:"accessTokenEnc"`
	AccessTokenNonce  string   `json:"accessTokenNonce"`
	AccessTokenTag    string   `json:"accessTokenTag"`
	RefreshTokenEnc   string   `json:"refreshTokenEnc,omitempty"`
	RefreshTokenNonce string   `json:"refreshTokenNonce,omitempty"`
	RefreshTokenTag   string   `json:"refreshTokenTag,omitempty"`
	TokenExpiresAt    *string  `json:"tokenExpiresAt,omitempty"`
	Scopes            []string `json:"scopes,omitempty"`
	Status            string   `json:"status"`
	Metadata          string   `json:"metadata,omitempty"`
}

type ConnectionResponse struct {
	ID                string   `json:"id"`
	Provider          string   `json:"provider"`
	ProviderAccountID string   `json:"providerAccountId"`
	DisplayName       string   `json:"displayName"`
	AccessTokenEnc    string   `json:"accessTokenEnc"`
	AccessTokenNonce  string   `json:"accessTokenNonce"`
	AccessTokenTag    string   `json:"accessTokenTag"`
	RefreshTokenEnc   string   `json:"refreshTokenEnc,omitempty"`
	RefreshTokenNonce string   `json:"refreshTokenNonce,omitempty"`
	RefreshTokenTag   string   `json:"refreshTokenTag,omitempty"`
	TokenExpiresAt    *string  `json:"tokenExpiresAt,omitempty"`
	Scopes            []string `json:"scopes,omitempty"`
	Status            string   `json:"status"`
	Metadata          string   `json:"metadata,omitempty"`
	CreatedAt         string   `json:"createdAt"`
	UpdatedAt         string   `json:"updatedAt"`
}

func connectionToResponse(c *domain.AuthConnection) ConnectionResponse {
	resp := ConnectionResponse{
		ID:                c.ID.String(),
		Provider:          c.Provider,
		ProviderAccountID: c.ProviderAccountID,
		DisplayName:       c.DisplayName,
		AccessTokenEnc:    base64.StdEncoding.EncodeToString(c.AccessTokenEnc),
		AccessTokenNonce:  base64.StdEncoding.EncodeToString(c.AccessTokenNonce),
		AccessTokenTag:    base64.StdEncoding.EncodeToString(c.AccessTokenTag),
		Scopes:            c.Scopes,
		Status:            c.Status,
		CreatedAt:         c.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt:         c.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
	if len(c.RefreshTokenEnc) > 0 {
		resp.RefreshTokenEnc = base64.StdEncoding.EncodeToString(c.RefreshTokenEnc)
		resp.RefreshTokenNonce = base64.StdEncoding.EncodeToString(c.RefreshTokenNonce)
		resp.RefreshTokenTag = base64.StdEncoding.EncodeToString(c.RefreshTokenTag)
	}
	if c.TokenExpiresAt != nil {
		t := c.TokenExpiresAt.UTC().Format("2006-01-02T15:04:05Z")
		resp.TokenExpiresAt = &t
	}
	if len(c.Metadata) > 0 {
		resp.Metadata = base64.StdEncoding.EncodeToString(c.Metadata)
	}
	return resp
}

// --- Connection operations ---

// ErrInvalidConnection marks a connection request the client must fix (bad
// encoding, a partial token, metadata that is not JSON or an over-long field).
// Handlers map it to 400 so malformed input never surfaces as a 500.
var ErrInvalidConnection = errors.New("invalid connection")

func invalidConnection(reason string) error {
	return fmt.Errorf("%w: %s", ErrInvalidConnection, reason)
}

// Column limits from migrations/005_auth_connections.up.sql.
const (
	maxProviderLen          = 64 // tighter than the VARCHAR(100) column, matching the handler
	maxProviderAccountIDLen = 255
	maxDisplayNameLen       = 255
	maxStatusLen            = 20
)

func checkLen(value, field string, max int) error {
	if len(value) > max {
		return invalidConnection(fmt.Sprintf("%s exceeds %d characters", field, max))
	}
	return nil
}

// decodeToken decodes one encrypted token. All three parts must be present
// together: a ciphertext without its nonce or tag can never be decrypted.
func decodeToken(enc, nonce, tag, name string) (e, n, t []byte, err error) {
	if enc == "" || nonce == "" || tag == "" {
		return nil, nil, nil, invalidConnection(name + " requires enc, nonce and tag together")
	}
	if e, err = decodeB64(enc, name+"Enc"); err != nil {
		return nil, nil, nil, invalidConnection(err.Error())
	}
	if n, err = decodeB64(nonce, name+"Nonce"); err != nil {
		return nil, nil, nil, invalidConnection(err.Error())
	}
	if t, err = decodeB64(tag, name+"Tag"); err != nil {
		return nil, nil, nil, invalidConnection(err.Error())
	}
	return e, n, t, nil
}

func parseExpiry(v string) (*time.Time, error) {
	t, err := time.Parse("2006-01-02T15:04:05Z", v)
	if err != nil {
		return nil, invalidConnection("invalid tokenExpiresAt format, expected RFC3339")
	}
	return &t, nil
}

// decodeMetadata decodes base64 metadata and requires it to be JSON, since it
// is stored in a JSONB column.
func decodeMetadata(v string) ([]byte, error) {
	b, err := decodeB64(v, "metadata")
	if err != nil {
		return nil, invalidConnection(err.Error())
	}
	if !json.Valid(b) {
		return nil, invalidConnection("metadata must be JSON")
	}
	return b, nil
}

func (s *ConnectionService) CreateConnection(ctx context.Context, userID uuid.UUID, req CreateConnectionRequest) (*ConnectionResponse, error) {
	if req.Provider == "" {
		return nil, invalidConnection("provider is required")
	}
	for _, c := range []struct {
		v, f string
		max  int
	}{
		{req.Provider, "provider", maxProviderLen},
		{req.ProviderAccountID, "providerAccountId", maxProviderAccountIDLen},
		{req.DisplayName, "displayName", maxDisplayNameLen},
	} {
		if err := checkLen(c.v, c.f, c.max); err != nil {
			return nil, err
		}
	}

	accessEnc, accessNonce, accessTag, err := decodeToken(req.AccessTokenEnc, req.AccessTokenNonce, req.AccessTokenTag, "accessToken")
	if err != nil {
		return nil, err
	}

	conn := &domain.AuthConnection{
		UserID:            userID,
		Provider:          req.Provider,
		ProviderAccountID: req.ProviderAccountID,
		DisplayName:       req.DisplayName,
		AccessTokenEnc:    accessEnc,
		AccessTokenNonce:  accessNonce,
		AccessTokenTag:    accessTag,
		Scopes:            req.Scopes,
		Status:            "active",
	}

	if req.RefreshTokenEnc != "" || req.RefreshTokenNonce != "" || req.RefreshTokenTag != "" {
		if conn.RefreshTokenEnc, conn.RefreshTokenNonce, conn.RefreshTokenTag, err =
			decodeToken(req.RefreshTokenEnc, req.RefreshTokenNonce, req.RefreshTokenTag, "refreshToken"); err != nil {
			return nil, err
		}
	}

	if req.TokenExpiresAt != nil {
		if conn.TokenExpiresAt, err = parseExpiry(*req.TokenExpiresAt); err != nil {
			return nil, err
		}
	}

	if req.Metadata != "" {
		if conn.Metadata, err = decodeMetadata(req.Metadata); err != nil {
			return nil, err
		}
	}

	if err := s.connRepo.CreateConnection(ctx, conn); err != nil {
		return nil, err
	}

	resp := connectionToResponse(conn)
	return &resp, nil
}

func (s *ConnectionService) GetConnection(ctx context.Context, id, userID uuid.UUID) (*ConnectionResponse, error) {
	conn, err := s.connRepo.GetConnection(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if conn == nil {
		return nil, nil
	}
	resp := connectionToResponse(conn)
	return &resp, nil
}

func (s *ConnectionService) ListConnections(ctx context.Context, userID uuid.UUID) ([]ConnectionResponse, error) {
	conns, err := s.connRepo.ListConnections(ctx, userID)
	if err != nil {
		return nil, err
	}

	result := make([]ConnectionResponse, len(conns))
	for i := range conns {
		result[i] = connectionToResponse(&conns[i])
	}
	return result, nil
}

// UpdateConnection applies a partial update: an empty string, a nil slice or
// a nil expiry leaves the stored value unchanged, so a client that only renames
// a connection cannot wipe its encrypted tokens. A token is replaced only when
// its enc, nonce and tag are all sent.
func (s *ConnectionService) UpdateConnection(ctx context.Context, id, userID uuid.UUID, req UpdateConnectionRequest) error {
	for _, c := range []struct {
		v, f string
		max  int
	}{
		{req.Provider, "provider", maxProviderLen},
		{req.ProviderAccountID, "providerAccountId", maxProviderAccountIDLen},
		{req.DisplayName, "displayName", maxDisplayNameLen},
		{req.Status, "status", maxStatusLen},
	} {
		if err := checkLen(c.v, c.f, c.max); err != nil {
			return err
		}
	}

	return s.connRepo.UpdateConnection(ctx, id, userID, func(conn *domain.AuthConnection) error {
		var err error
		if req.Provider != "" {
			conn.Provider = req.Provider
		}
		if req.ProviderAccountID != "" {
			conn.ProviderAccountID = req.ProviderAccountID
		}
		if req.DisplayName != "" {
			conn.DisplayName = req.DisplayName
		}
		if req.Status != "" {
			conn.Status = req.Status
		}
		if req.Scopes != nil {
			conn.Scopes = req.Scopes
		}
		if req.AccessTokenEnc != "" || req.AccessTokenNonce != "" || req.AccessTokenTag != "" {
			if conn.AccessTokenEnc, conn.AccessTokenNonce, conn.AccessTokenTag, err =
				decodeToken(req.AccessTokenEnc, req.AccessTokenNonce, req.AccessTokenTag, "accessToken"); err != nil {
				return err
			}
		}
		if req.RefreshTokenEnc != "" || req.RefreshTokenNonce != "" || req.RefreshTokenTag != "" {
			if conn.RefreshTokenEnc, conn.RefreshTokenNonce, conn.RefreshTokenTag, err =
				decodeToken(req.RefreshTokenEnc, req.RefreshTokenNonce, req.RefreshTokenTag, "refreshToken"); err != nil {
				return err
			}
		}
		if req.TokenExpiresAt != nil {
			if conn.TokenExpiresAt, err = parseExpiry(*req.TokenExpiresAt); err != nil {
				return err
			}
		}
		if req.Metadata != "" {
			if conn.Metadata, err = decodeMetadata(req.Metadata); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *ConnectionService) DeleteConnection(ctx context.Context, id, userID uuid.UUID) error {
	return s.connRepo.DeleteConnection(ctx, id, userID)
}
