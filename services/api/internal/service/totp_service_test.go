package service

import (
	"context"
	"encoding/base32"
	"testing"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

func TestTOTPEnrollStoresEncryptedSecretAndVerifiesRawCode(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	user := &domain.User{
		ID:        uuid.New(),
		Email:     "totp-enroll@authbox.io",
		KDFParams: domain.DefaultKDFParams(),
	}
	userRepo := newFakeUserRepo(user)
	service := NewTOTPService(userRepo, testTOTPSecretKey)

	resp, err := service.Enroll(ctx, user.ID)
	if err != nil {
		t.Fatalf("Enroll: %v", err)
	}

	rawSecret, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(resp.Secret)
	if err != nil {
		t.Fatalf("DecodeString(secret): %v", err)
	}

	stored := userRepo.byID[user.ID].TOTPSecret
	if string(stored) == string(rawSecret) {
		t.Fatal("stored TOTP secret matched plaintext raw secret")
	}
	if !hasTOTPSecretEnvelope(stored) {
		t.Fatalf("stored TOTP secret missing encrypted envelope prefix: %q", string(stored))
	}

	code := generateTOTP(rawSecret, time.Now().Unix()/30)
	if err := service.Verify(ctx, user.ID, code); err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !userRepo.byID[user.ID].TOTPEnabled {
		t.Fatal("expected TOTP to be enabled after verification")
	}
}

func TestTOTPCheckRejectsPlaintextStoredSeed(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	user := &domain.User{
		ID:          uuid.New(),
		Email:       "totp-plaintext@authbox.io",
		KDFParams:   domain.DefaultKDFParams(),
		TOTPSecret:  []byte("01234567890123456789"),
		TOTPEnabled: true,
	}
	userRepo := newFakeUserRepo(user)
	service := NewTOTPService(userRepo, testTOTPSecretKey)

	ok, err := service.Check(ctx, user.ID, "000000")
	if err == nil {
		t.Fatal("expected plaintext TOTP secret to be rejected")
	}
	if ok {
		t.Fatal("plaintext TOTP secret unexpectedly validated")
	}
}

func hasTOTPSecretEnvelope(secret []byte) bool {
	return len(secret) > len(totpSecretEnvelopePrefix) &&
		string(secret[:len(totpSecretEnvelopePrefix)]) == totpSecretEnvelopePrefix
}
