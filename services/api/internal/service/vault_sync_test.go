package service

import (
	"context"
	"encoding/base64"
	"errors"
	"testing"

	"github.com/google/uuid"
)

// SyncPush input validation runs before any repository access, so a nil repo
// is safe here — these tests pin the 400-class rejections.
func TestSyncPushRejectsInvalidPayloads(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	svc := NewVaultService(nil, nil)
	userID := uuid.New()
	valid := base64.StdEncoding.EncodeToString([]byte("x"))

	cases := []struct {
		name string
		item ItemRequest
	}{
		{"missing ciphertext", ItemRequest{Nonce: valid, Tag: valid, ItemType: "login"}},
		{"missing nonce", ItemRequest{EncryptedData: valid, Tag: valid, ItemType: "login"}},
		{"missing tag", ItemRequest{EncryptedData: valid, Nonce: valid, ItemType: "login"}},
		{"invalid item type", ItemRequest{EncryptedData: valid, Nonce: valid, Tag: valid, ItemType: "not-a-type"}},
		{"bad base64", ItemRequest{EncryptedData: "!!!", Nonce: valid, Tag: valid, ItemType: "login"}},
		{"bad item id", ItemRequest{ID: "not-a-uuid", EncryptedData: valid, Nonce: valid, Tag: valid, ItemType: "login"}},
	}

	for _, tc := range cases {
		_, err := svc.SyncPush(ctx, userID, SyncPushRequest{Items: []ItemRequest{tc.item}})
		if err == nil {
			t.Fatalf("%s: expected rejection", tc.name)
		}
		if !errors.Is(err, ErrInvalidSyncItem) {
			t.Fatalf("%s: expected ErrInvalidSyncItem, got %v", tc.name, err)
		}
	}
}

func TestSyncPushDefaultsEmptyItemTypeToLogin(t *testing.T) {
	t.Parallel()

	// An empty itemType is defaulted (mirroring CreateItem), so validation
	// passes and the request reaches the repository — a nil repo then panics,
	// which we intercept: reaching the repo IS the assertion here.
	defer func() {
		if recover() == nil {
			t.Fatal("expected the defaulted item to reach the repository layer")
		}
	}()

	svc := NewVaultService(nil, nil)
	valid := base64.StdEncoding.EncodeToString([]byte("x"))
	_, _ = svc.SyncPush(context.Background(), uuid.New(), SyncPushRequest{
		Items: []ItemRequest{{EncryptedData: valid, Nonce: valid, Tag: valid}},
	})
}
