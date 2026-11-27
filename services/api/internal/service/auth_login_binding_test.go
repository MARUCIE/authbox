package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"testing"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

// totpLoginFixture is one TOTP-enabled account plus the service under test.
type totpLoginFixture struct {
	service     *AuthService
	sessionRepo *fakeSessionRepo
	email       string
	password    string
	salt        []byte
	secret      []byte
}

func newTOTPLoginFixture(t *testing.T) *totpLoginFixture {
	t.Helper()
	ctx := context.Background()
	f := &totpLoginFixture{
		email:    fmt.Sprintf("binding-%s@authbox.io", uuid.NewString()[:8]),
		password: "MasterPassword!123",
		salt:     make([]byte, 32),
		secret:   []byte("01234567890123456789"),
	}
	if _, err := rand.Read(f.salt); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}
	user := &domain.User{
		ID:                uuid.New(),
		Email:             f.email,
		SRPSalt:           f.salt,
		SRPVerifier:       testGenerateVerifier(f.email, f.password, f.salt),
		EncryptedVaultKey: []byte("encrypted-vault-key"),
		VaultKeyNonce:     []byte("123456789012"),
		VaultKeyTag:       []byte("1234567890abcdef"),
		KDFParams:         domain.DefaultKDFParams(),
		TOTPEnabled:       true,
	}
	userRepo := newFakeUserRepo(user)
	f.sessionRepo = &fakeSessionRepo{}
	f.service = NewAuthService(userRepo, f.sessionRepo, NewTOTPService(userRepo, testTOTPSecretKey), time.Hour)
	enc, err := f.service.totpService.encryptSecret(f.secret)
	if err != nil {
		t.Fatalf("encryptSecret: %v", err)
	}
	if err := userRepo.SetTOTPSecret(ctx, user.ID, enc); err != nil {
		t.Fatalf("SetTOTPSecret: %v", err)
	}
	return f
}

// passSRP runs init+verify for a fresh client and returns the TOTP challenge.
func (f *totpLoginFixture) passSRP(t *testing.T) string {
	t.Helper()
	client, err := newTestSRPClientState()
	if err != nil {
		t.Fatalf("newTestSRPClientState: %v", err)
	}
	initResp, err := f.service.LoginInit(context.Background(), LoginInitRequest{
		Email:         f.email,
		ClientPublicA: base64.StdEncoding.EncodeToString(client.publicA),
	})
	if err != nil {
		t.Fatalf("LoginInit: %v", err)
	}
	B, _ := base64.StdEncoding.DecodeString(initResp.ServerPublicB)
	proof := client.computeProof(t, f.email, f.password, f.salt, B)
	resp, err := f.service.LoginVerify(context.Background(), f.email, client.publicA, proof, "127.0.0.1", "ua")
	if err != nil {
		t.Fatalf("LoginVerify: %v", err)
	}
	if !resp.TOTPRequired || resp.LoginChallenge == "" {
		t.Fatalf("expected TOTP challenge, got %+v", resp)
	}
	return resp.LoginChallenge
}

func (f *totpLoginFixture) validCode() string {
	return generateTOTP(f.secret, time.Now().Unix()/30)
}

func (f *totpLoginFixture) wrongCode() string {
	valid := map[string]bool{}
	now := time.Now().Unix() / 30
	for i := int64(-2); i <= 2; i++ {
		valid[generateTOTP(f.secret, now+i)] = true
	}
	for n := 0; ; n++ {
		c := fmt.Sprintf("%06d", n)
		if !valid[c] {
			return c
		}
	}
}

// Regression: before the fix the TOTP step was keyed by email only, so anyone
// who knew the email could submit codes for a victim's half-finished login and
// receive the session.
func TestLoginVerifyTOTPRequiresTheChallengeFromTheSRPStep(t *testing.T) {
	t.Parallel()
	f := newTOTPLoginFixture(t)
	_ = f.passSRP(t) // victim completed SRP

	for _, challenge := range []string{"", "attacker-guess", base64.RawURLEncoding.EncodeToString(make([]byte, 32))} {
		resp, err := f.service.LoginVerifyTOTP(context.Background(), f.email, challenge, f.validCode(), "10.0.0.66", "attacker")
		if !errors.Is(err, ErrInvalidCredentials) || resp != nil {
			t.Fatalf("challenge %q: expected ErrInvalidCredentials, got resp=%v err=%v", challenge, resp, err)
		}
	}
	if len(f.sessionRepo.created) != 0 {
		t.Fatalf("no session may be issued without the challenge, got %d", len(f.sessionRepo.created))
	}
}

func TestLoginVerifyTOTPRejectsChallengeForAnotherEmail(t *testing.T) {
	t.Parallel()
	f := newTOTPLoginFixture(t)
	challenge := f.passSRP(t)
	if _, err := f.service.LoginVerifyTOTP(context.Background(), "someone-else@authbox.io", challenge, f.validCode(), "ip", "ua"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}
}

func TestLoginVerifyTOTPChallengeIsExhaustedAfterMaxAttempts(t *testing.T) {
	t.Parallel()
	f := newTOTPLoginFixture(t)
	challenge := f.passSRP(t)
	ctx := context.Background()

	for i := 0; i < maxTOTPAttempts; i++ {
		if _, err := f.service.LoginVerifyTOTP(ctx, f.email, challenge, f.wrongCode(), "ip", "ua"); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("attempt %d: expected ErrInvalidCredentials, got %v", i, err)
		}
	}
	if _, err := f.service.LoginVerifyTOTP(ctx, f.email, challenge, f.validCode(), "ip", "ua"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("challenge must be dead after %d failures, got %v", maxTOTPAttempts, err)
	}
	if len(f.sessionRepo.created) != 0 {
		t.Fatal("exhausted challenge issued a session")
	}
}

func TestLoginVerifyTOTPChallengeIsSingleUse(t *testing.T) {
	t.Parallel()
	f := newTOTPLoginFixture(t)
	challenge := f.passSRP(t)
	ctx := context.Background()

	if _, err := f.service.LoginVerifyTOTP(ctx, f.email, challenge, f.validCode(), "ip", "ua"); err != nil {
		t.Fatalf("first use: %v", err)
	}
	if _, err := f.service.LoginVerifyTOTP(ctx, f.email, challenge, f.validCode(), "ip", "ua"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("second use must fail, got %v", err)
	}
	if len(f.sessionRepo.created) != 1 {
		t.Fatalf("expected exactly one session, got %d", len(f.sessionRepo.created))
	}
}

// Regression: pending SRP state used to be keyed by email alone, so any
// unauthenticated LoginInit for the same email silently replaced a user's
// in-flight handshake and their correct proof then failed.
func TestConcurrentLoginInitDoesNotClobberAnotherHandshake(t *testing.T) {
	t.Parallel()
	f := newTOTPLoginFixture(t)
	ctx := context.Background()

	victim, _ := newTestSRPClientState()
	initResp, err := f.service.LoginInit(ctx, LoginInitRequest{Email: f.email, ClientPublicA: base64.StdEncoding.EncodeToString(victim.publicA)})
	if err != nil {
		t.Fatalf("victim LoginInit: %v", err)
	}

	attacker, _ := newTestSRPClientState()
	if _, err := f.service.LoginInit(ctx, LoginInitRequest{Email: f.email, ClientPublicA: base64.StdEncoding.EncodeToString(attacker.publicA)}); err != nil {
		t.Fatalf("attacker LoginInit: %v", err)
	}

	B, _ := base64.StdEncoding.DecodeString(initResp.ServerPublicB)
	proof := victim.computeProof(t, f.email, f.password, f.salt, B)
	if _, err := f.service.LoginVerify(ctx, f.email, victim.publicA, proof, "ip", "ua"); err != nil {
		t.Fatalf("victim handshake was clobbered: %v", err)
	}
}

func TestLoginVerifyHandshakeIsSingleUse(t *testing.T) {
	t.Parallel()
	f := newTOTPLoginFixture(t)
	ctx := context.Background()

	client, _ := newTestSRPClientState()
	initResp, err := f.service.LoginInit(ctx, LoginInitRequest{Email: f.email, ClientPublicA: base64.StdEncoding.EncodeToString(client.publicA)})
	if err != nil {
		t.Fatalf("LoginInit: %v", err)
	}
	B, _ := base64.StdEncoding.DecodeString(initResp.ServerPublicB)
	proof := client.computeProof(t, f.email, f.password, f.salt, B)
	if _, err := f.service.LoginVerify(ctx, f.email, client.publicA, proof, "ip", "ua"); err != nil {
		t.Fatalf("first verify: %v", err)
	}
	if _, err := f.service.LoginVerify(ctx, f.email, client.publicA, proof, "ip", "ua"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("replayed proof must fail, got %v", err)
	}
}

func TestLoginInitRejectsOutOfRangeClientPublic(t *testing.T) {
	t.Parallel()
	f := newTOTPLoginFixture(t)
	nPlusOne := testPadTo(testSRPN, 256)
	nPlusOne[255]++
	for name, a := range map[string][]byte{
		"zero": make([]byte, 256),
		"N":    testPadTo(testSRPN, 256),
		"N+1":  nPlusOne,
		"long": make([]byte, 300),
	} {
		_, err := f.service.LoginInit(context.Background(), LoginInitRequest{Email: f.email, ClientPublicA: base64.StdEncoding.EncodeToString(a)})
		if err == nil {
			t.Fatalf("%s: LoginInit accepted an out-of-range A", name)
		}
	}
	if len(f.service.pendingSRP) != 0 {
		t.Fatal("rejected A must not create pending state")
	}
}
