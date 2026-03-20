package service

import (
	"context"
	"encoding/base64"
	"errors"
	"time"

	"auth-box-api/internal/domain"
	"auth-box-api/internal/repository/pg"

	"github.com/google/uuid"
)

type ConnectionService struct {
	connRepo *pg.ConnectionRepository
}

func NewConnectionService(connRepo *pg.ConnectionRepository) *ConnectionService {
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

func (s *ConnectionService) CreateConnection(ctx context.Context, userID uuid.UUID, req CreateConnectionRequest) (*ConnectionResponse, error) {
	if req.Provider == "" {
		return nil, errors.New("provider is required")
	}
	if req.AccessTokenEnc == "" || req.AccessTokenNonce == "" || req.AccessTokenTag == "" {
		return nil, errors.New("access token encryption fields are required")
	}

	accessEnc, err := base64.StdEncoding.DecodeString(req.AccessTokenEnc)
	if err != nil {
		return nil, errors.New("invalid accessTokenEnc encoding")
	}
	accessNonce, err := base64.StdEncoding.DecodeString(req.AccessTokenNonce)
	if err != nil {
		return nil, errors.New("invalid accessTokenNonce encoding")
	}
	accessTag, err := base64.StdEncoding.DecodeString(req.AccessTokenTag)
	if err != nil {
		return nil, errors.New("invalid accessTokenTag encoding")
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

	if req.RefreshTokenEnc != "" {
		refreshEnc, err := base64.StdEncoding.DecodeString(req.RefreshTokenEnc)
		if err != nil {
			return nil, errors.New("invalid refreshTokenEnc encoding")
		}
		refreshNonce, err := base64.StdEncoding.DecodeString(req.RefreshTokenNonce)
		if err != nil {
			return nil, errors.New("invalid refreshTokenNonce encoding")
		}
		refreshTag, err := base64.StdEncoding.DecodeString(req.RefreshTokenTag)
		if err != nil {
			return nil, errors.New("invalid refreshTokenTag encoding")
		}
		conn.RefreshTokenEnc = refreshEnc
		conn.RefreshTokenNonce = refreshNonce
		conn.RefreshTokenTag = refreshTag
	}

	if req.TokenExpiresAt != nil {
		t, err := time.Parse("2006-01-02T15:04:05Z", *req.TokenExpiresAt)
		if err != nil {
			return nil, errors.New("invalid tokenExpiresAt format, expected RFC3339")
		}
		conn.TokenExpiresAt = &t
	}

	if req.Metadata != "" {
		meta, err := base64.StdEncoding.DecodeString(req.Metadata)
		if err != nil {
			return nil, errors.New("invalid metadata encoding")
		}
		conn.Metadata = meta
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

func (s *ConnectionService) UpdateConnection(ctx context.Context, id, userID uuid.UUID, req UpdateConnectionRequest) error {
	accessEnc, err := base64.StdEncoding.DecodeString(req.AccessTokenEnc)
	if err != nil {
		return errors.New("invalid accessTokenEnc encoding")
	}
	accessNonce, err := base64.StdEncoding.DecodeString(req.AccessTokenNonce)
	if err != nil {
		return errors.New("invalid accessTokenNonce encoding")
	}
	accessTag, err := base64.StdEncoding.DecodeString(req.AccessTokenTag)
	if err != nil {
		return errors.New("invalid accessTokenTag encoding")
	}

	conn := &domain.AuthConnection{
		ID:                id,
		UserID:            userID,
		Provider:          req.Provider,
		ProviderAccountID: req.ProviderAccountID,
		DisplayName:       req.DisplayName,
		AccessTokenEnc:    accessEnc,
		AccessTokenNonce:  accessNonce,
		AccessTokenTag:    accessTag,
		Scopes:            req.Scopes,
		Status:            req.Status,
	}

	if req.RefreshTokenEnc != "" {
		refreshEnc, err := base64.StdEncoding.DecodeString(req.RefreshTokenEnc)
		if err != nil {
			return errors.New("invalid refreshTokenEnc encoding")
		}
		refreshNonce, err := base64.StdEncoding.DecodeString(req.RefreshTokenNonce)
		if err != nil {
			return errors.New("invalid refreshTokenNonce encoding")
		}
		refreshTag, err := base64.StdEncoding.DecodeString(req.RefreshTokenTag)
		if err != nil {
			return errors.New("invalid refreshTokenTag encoding")
		}
		conn.RefreshTokenEnc = refreshEnc
		conn.RefreshTokenNonce = refreshNonce
		conn.RefreshTokenTag = refreshTag
	}

	if req.TokenExpiresAt != nil {
		t, err := time.Parse("2006-01-02T15:04:05Z", *req.TokenExpiresAt)
		if err != nil {
			return errors.New("invalid tokenExpiresAt format, expected RFC3339")
		}
		conn.TokenExpiresAt = &t
	}

	if req.Metadata != "" {
		meta, err := base64.StdEncoding.DecodeString(req.Metadata)
		if err != nil {
			return errors.New("invalid metadata encoding")
		}
		conn.Metadata = meta
	}

	return s.connRepo.UpdateConnection(ctx, conn)
}

func (s *ConnectionService) DeleteConnection(ctx context.Context, id, userID uuid.UUID) error {
	return s.connRepo.DeleteConnection(ctx, id, userID)
}
