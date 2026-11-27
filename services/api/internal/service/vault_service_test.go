package service

import (
	"context"
	"encoding/base64"
	"errors"
	"testing"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

type recordingVaultRepo struct {
	created []*domain.VaultItem
	updated []*domain.VaultItem
}

func (r *recordingVaultRepo) CreateItem(_ context.Context, item *domain.VaultItem) error {
	item.ID = uuid.New()
	r.created = append(r.created, item)
	return nil
}
func (r *recordingVaultRepo) GetItem(context.Context, uuid.UUID, uuid.UUID) (*domain.VaultItem, error) {
	return nil, nil
}
func (r *recordingVaultRepo) ListItems(context.Context, uuid.UUID, int, int) ([]domain.VaultItem, error) {
	return nil, nil
}
func (r *recordingVaultRepo) UpdateItem(_ context.Context, item *domain.VaultItem) error {
	r.updated = append(r.updated, item)
	return nil
}
func (r *recordingVaultRepo) DeleteItem(context.Context, uuid.UUID, uuid.UUID) error { return nil }
func (r *recordingVaultRepo) SyncPull(context.Context, uuid.UUID, int, int) ([]domain.VaultItem, error) {
	return nil, nil
}

func validItemRequest(itemType string) ItemRequest {
	b64 := base64.StdEncoding.EncodeToString
	return ItemRequest{
		EncryptedData: b64([]byte("ciphertext")),
		Nonce:         b64([]byte("123456789012")),
		Tag:           b64([]byte("1234567890abcdef")),
		ItemType:      itemType,
	}
}

func TestUpdateItemWithoutItemTypeKeepsStoredType(t *testing.T) {
	repo := &recordingVaultRepo{}
	svc := NewVaultService(nil, repo)

	if err := svc.UpdateItem(context.Background(), uuid.New(), uuid.New(), validItemRequest("")); err != nil {
		t.Fatalf("UpdateItem: %v", err)
	}
	// The repository keeps the stored type when it receives "" (COALESCE in SQL);
	// the service must not substitute a default that would overwrite it.
	if got := repo.updated[0].ItemType; got != "" {
		t.Fatalf("update passed itemType %q, want empty so the stored type is kept", got)
	}
}

func TestUpdateItemRejectsUnknownItemType(t *testing.T) {
	repo := &recordingVaultRepo{}
	svc := NewVaultService(nil, repo)

	err := svc.UpdateItem(context.Background(), uuid.New(), uuid.New(), validItemRequest("bogus"))
	if !errors.Is(err, ErrInvalidItem) {
		t.Fatalf("err = %v, want ErrInvalidItem", err)
	}
	if len(repo.updated) != 0 {
		t.Fatal("invalid update reached the repository")
	}
}

func TestSyncPushRejectsBatchBeforeAnyWrite(t *testing.T) {
	repo := &recordingVaultRepo{}
	svc := NewVaultService(nil, repo)

	bad := validItemRequest("login")
	bad.Nonce = "not base64!"
	_, err := svc.SyncPush(context.Background(), uuid.New(), SyncPushRequest{
		Items: []ItemRequest{validItemRequest("login"), validItemRequest("card"), bad},
	})
	if !errors.Is(err, ErrInvalidItem) {
		t.Fatalf("err = %v, want ErrInvalidItem", err)
	}
	if len(repo.created) != 0 {
		t.Fatalf("%d items written before the invalid one was found", len(repo.created))
	}
}

func TestSyncPushDefaultsItemTypeToLogin(t *testing.T) {
	repo := &recordingVaultRepo{}
	svc := NewVaultService(nil, repo)

	out, err := svc.SyncPush(context.Background(), uuid.New(), SyncPushRequest{
		Items: []ItemRequest{validItemRequest(""), validItemRequest("api_key")},
	})
	if err != nil {
		t.Fatalf("SyncPush: %v", err)
	}
	if len(out) != 2 || out[0].ItemType != "login" || out[1].ItemType != "api_key" {
		t.Fatalf("unexpected result %+v", out)
	}
}
