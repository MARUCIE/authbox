package service

import (
	"context"
	"encoding/base64"
	"errors"

	"auth-box-api/internal/domain"
	"auth-box-api/internal/repository/pg"

	"github.com/google/uuid"
)

type VaultService struct {
	userRepo  *pg.UserRepository
	vaultRepo *pg.VaultRepository
}

func NewVaultService(userRepo *pg.UserRepository, vaultRepo *pg.VaultRepository) *VaultService {
	return &VaultService{userRepo: userRepo, vaultRepo: vaultRepo}
}

// VaultKeyResponse is returned when the client requests the encrypted vault key.
// Includes srpSalt so the client can re-derive keys from the master password.
type VaultKeyResponse struct {
	EncryptedVaultKey string           `json:"encryptedVaultKey"`
	VaultKeyNonce     string           `json:"vaultKeyNonce"`
	VaultKeyTag       string           `json:"vaultKeyTag"`
	SRPSalt           string           `json:"srpSalt"`
	KDFParams         domain.KDFParams `json:"kdfParams"`
}

func (s *VaultService) GetVaultKey(ctx context.Context, userID uuid.UUID) (*VaultKeyResponse, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("user not found")
	}

	return &VaultKeyResponse{
		EncryptedVaultKey: base64.StdEncoding.EncodeToString(user.EncryptedVaultKey),
		VaultKeyNonce:     base64.StdEncoding.EncodeToString(user.VaultKeyNonce),
		VaultKeyTag:       base64.StdEncoding.EncodeToString(user.VaultKeyTag),
		SRPSalt:           base64.StdEncoding.EncodeToString(user.SRPSalt),
		KDFParams:         user.KDFParams,
	}, nil
}

// ItemRequest is the JSON body for creating/updating a vault item.
type ItemRequest struct {
	EncryptedData string `json:"encryptedData"`
	Nonce         string `json:"nonce"`
	Tag           string `json:"tag"`
	ItemType      string `json:"itemType"`
}

// ItemResponse is the JSON response for a single vault item.
type ItemResponse struct {
	ID            string `json:"id"`
	EncryptedData string `json:"encryptedData"`
	Nonce         string `json:"nonce"`
	Tag           string `json:"tag"`
	ItemType      string `json:"itemType"`
	Version       int    `json:"version"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

func itemToResponse(item *domain.VaultItem) ItemResponse {
	return ItemResponse{
		ID:            item.ID.String(),
		EncryptedData: base64.StdEncoding.EncodeToString(item.EncryptedData),
		Nonce:         base64.StdEncoding.EncodeToString(item.Nonce),
		Tag:           base64.StdEncoding.EncodeToString(item.Tag),
		ItemType:      item.ItemType,
		Version:       item.Version,
		CreatedAt:     item.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt:     item.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

// validItemTypes is the allowed set of vault item types.
var validItemTypes = map[string]bool{
	"credential": true,
	"note":       true,
	"card":       true,
	"identity":   true,
	"api_key":    true,
}

func (s *VaultService) CreateItem(ctx context.Context, userID uuid.UUID, req ItemRequest) (*ItemResponse, error) {
	data, err := base64.StdEncoding.DecodeString(req.EncryptedData)
	if err != nil {
		return nil, errors.New("invalid encryptedData encoding")
	}
	nonce, err := base64.StdEncoding.DecodeString(req.Nonce)
	if err != nil {
		return nil, errors.New("invalid nonce encoding")
	}
	tag, err := base64.StdEncoding.DecodeString(req.Tag)
	if err != nil {
		return nil, errors.New("invalid tag encoding")
	}

	itemType := req.ItemType
	if itemType == "" {
		itemType = "credential"
	}
	if !validItemTypes[itemType] {
		return nil, errors.New("invalid itemType")
	}

	item := &domain.VaultItem{
		UserID:        userID,
		EncryptedData: data,
		Nonce:         nonce,
		Tag:           tag,
		ItemType:      itemType,
		Version:       1,
	}

	if err := s.vaultRepo.CreateItem(ctx, item); err != nil {
		return nil, err
	}

	resp := itemToResponse(item)
	return &resp, nil
}

func (s *VaultService) GetItem(ctx context.Context, id, userID uuid.UUID) (*ItemResponse, error) {
	item, err := s.vaultRepo.GetItem(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	if item == nil {
		return nil, nil
	}
	resp := itemToResponse(item)
	return &resp, nil
}

func (s *VaultService) ListItems(ctx context.Context, userID uuid.UUID, limit, offset int) ([]ItemResponse, error) {
	items, err := s.vaultRepo.ListItems(ctx, userID, limit, offset)
	if err != nil {
		return nil, err
	}

	result := make([]ItemResponse, len(items))
	for i := range items {
		result[i] = itemToResponse(&items[i])
	}
	return result, nil
}

func (s *VaultService) UpdateItem(ctx context.Context, id, userID uuid.UUID, req ItemRequest) error {
	data, err := base64.StdEncoding.DecodeString(req.EncryptedData)
	if err != nil {
		return errors.New("invalid encryptedData encoding")
	}
	nonce, err := base64.StdEncoding.DecodeString(req.Nonce)
	if err != nil {
		return errors.New("invalid nonce encoding")
	}
	tag, err := base64.StdEncoding.DecodeString(req.Tag)
	if err != nil {
		return errors.New("invalid tag encoding")
	}

	item := &domain.VaultItem{
		ID:            id,
		UserID:        userID,
		EncryptedData: data,
		Nonce:         nonce,
		Tag:           tag,
		ItemType:      req.ItemType,
	}

	return s.vaultRepo.UpdateItem(ctx, item)
}

func (s *VaultService) DeleteItem(ctx context.Context, id, userID uuid.UUID) error {
	return s.vaultRepo.DeleteItem(ctx, id, userID)
}

// SyncPull returns items with version > sinceVersion, limited to limit rows.
func (s *VaultService) SyncPull(ctx context.Context, userID uuid.UUID, sinceVersion, limit int) ([]ItemResponse, error) {
	items, err := s.vaultRepo.SyncPull(ctx, userID, sinceVersion, limit)
	if err != nil {
		return nil, err
	}
	result := make([]ItemResponse, len(items))
	for i := range items {
		result[i] = itemToResponse(&items[i])
	}
	return result, nil
}

// SyncPushRequest represents a batch push of items.
type SyncPushRequest struct {
	Items []ItemRequest `json:"items"`
}

func (s *VaultService) SyncPush(ctx context.Context, userID uuid.UUID, req SyncPushRequest) ([]ItemResponse, error) {
	results := make([]ItemResponse, 0, len(req.Items))
	for _, itemReq := range req.Items {
		resp, err := s.CreateItem(ctx, userID, itemReq)
		if err != nil {
			return nil, err
		}
		results = append(results, *resp)
	}
	return results, nil
}
