package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

type VaultService struct {
	userRepo  domain.UserRepository
	vaultRepo domain.VaultRepository
}

func NewVaultService(userRepo domain.UserRepository, vaultRepo domain.VaultRepository) *VaultService {
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
// Canonical set — must match the shared ItemType enum
// (packages/shared/src/types/vault.ts). The web client sends "login" for
// passwords and "api_key" for keys; the server previously diverged with
// "credential"/"note" and rejected every password create with 500.
var validItemTypes = map[string]bool{
	"login":       true,
	"api_key":     true,
	"secure_note": true,
	"identity":    true,
	"card":        true,
}

// IsValidItemType reports whether t is an allowed vault item type. Exported so
// the handler can reject bad input with 400 before reaching the service (the
// valid set stays single-sourced here).
func IsValidItemType(t string) bool {
	return validItemTypes[t]
}

// ErrInvalidItem marks a vault item request the client must fix (bad
// encoding, empty ciphertext fields or an unknown itemType). Handlers map it
// to 400 so malformed input never surfaces as a 500.
var ErrInvalidItem = errors.New("invalid vault item")

func invalidItem(reason string) error {
	return fmt.Errorf("%w: %s", ErrInvalidItem, reason)
}

// decodeItem validates and decodes the ciphertext fields of req. An empty
// itemType is returned as "" so each caller decides its own default.
func decodeItem(req ItemRequest) (*domain.VaultItem, error) {
	if req.EncryptedData == "" || req.Nonce == "" || req.Tag == "" {
		return nil, invalidItem("missing required fields")
	}
	data, err := base64.StdEncoding.DecodeString(req.EncryptedData)
	if err != nil {
		return nil, invalidItem("invalid encryptedData encoding")
	}
	nonce, err := base64.StdEncoding.DecodeString(req.Nonce)
	if err != nil {
		return nil, invalidItem("invalid nonce encoding")
	}
	tag, err := base64.StdEncoding.DecodeString(req.Tag)
	if err != nil {
		return nil, invalidItem("invalid tag encoding")
	}
	if req.ItemType != "" && !validItemTypes[req.ItemType] {
		return nil, invalidItem("invalid itemType")
	}
	return &domain.VaultItem{
		EncryptedData: data,
		Nonce:         nonce,
		Tag:           tag,
		ItemType:      req.ItemType,
	}, nil
}

// decodeNewItem validates a create request; a missing itemType means "login".
func decodeNewItem(userID uuid.UUID, req ItemRequest) (*domain.VaultItem, error) {
	item, err := decodeItem(req)
	if err != nil {
		return nil, err
	}
	if item.ItemType == "" {
		item.ItemType = "login"
	}
	item.UserID = userID
	item.Version = 1
	return item, nil
}

func (s *VaultService) CreateItem(ctx context.Context, userID uuid.UUID, req ItemRequest) (*ItemResponse, error) {
	item, err := decodeNewItem(userID, req)
	if err != nil {
		return nil, err
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
		return nil, domain.ErrItemNotFound
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

// UpdateItem replaces an item's ciphertext. An empty itemType keeps the
// stored type: clients that only re-encrypt (the web app's edit path) must not
// wipe it.
func (s *VaultService) UpdateItem(ctx context.Context, id, userID uuid.UUID, req ItemRequest) error {
	item, err := decodeItem(req)
	if err != nil {
		return err
	}
	item.ID = id
	item.UserID = userID
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

// SyncPush stores a batch of new items atomically: every item is validated
// first, then all are inserted in one transaction.
func (s *VaultService) SyncPush(ctx context.Context, userID uuid.UUID, req SyncPushRequest) ([]ItemResponse, error) {
	items := make([]*domain.VaultItem, 0, len(req.Items))
	for i, itemReq := range req.Items {
		item, err := decodeNewItem(userID, itemReq)
		if err != nil {
			return nil, fmt.Errorf("item %d: %w", i, err)
		}
		items = append(items, item)
	}
	if err := s.vaultRepo.CreateItems(ctx, items); err != nil {
		return nil, err
	}
	results := make([]ItemResponse, 0, len(items))
	for _, item := range items {
		results = append(results, itemToResponse(item))
	}
	return results, nil
}
