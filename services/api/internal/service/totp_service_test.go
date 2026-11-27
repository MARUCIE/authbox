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
	if _, err := service.Verify(ctx, user.ID, code); err != nil {
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

// Regression (RFC 6238 §5.2): an accepted code must not be accepted again.
func TestTOTPCheckRejectsReplayOfAcceptedCode(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	secret := []byte("01234567890123456789")
	user := &domain.User{ID: uuid.New(), Email: "totp-replay@authbox.io", KDFParams: domain.DefaultKDFParams(), TOTPEnabled: true}
	userRepo := newFakeUserRepo(user)
	service := NewTOTPService(userRepo, testTOTPSecretKey)
	enc, err := service.encryptSecret(secret)
	if err != nil {
		t.Fatalf("encryptSecret: %v", err)
	}
	if err := userRepo.SetTOTPSecret(ctx, user.ID, enc); err != nil {
		t.Fatalf("SetTOTPSecret: %v", err)
	}

	now := time.Now().Unix() / 30
	current := generateTOTP(secret, now)
	ok, err := service.Check(ctx, user.ID, current)
	if err != nil || !ok {
		t.Fatalf("first use of a valid code must pass: ok=%v err=%v", ok, err)
	}
	ok, _ = service.Check(ctx, user.ID, current)
	if ok {
		t.Fatal("the same code was accepted twice")
	}
	ok, _ = service.Check(ctx, user.ID, generateTOTP(secret, now-1))
	if ok {
		t.Fatal("an older step was accepted after a newer one was consumed")
	}

	// Another user's state is independent.
	other := &domain.User{ID: uuid.New(), Email: "totp-other@authbox.io", KDFParams: domain.DefaultKDFParams(), TOTPEnabled: true, TOTPSecret: enc}
	userRepo.byID[other.ID] = other
	if ok, _ := service.Check(ctx, other.ID, current); !ok {
		t.Fatal("replay state leaked across users")
	}
}
