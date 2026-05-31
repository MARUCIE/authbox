package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"math/big"
	"testing"
	"time"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

var (
	testSRPN          *big.Int
	testSRPG          = big.NewInt(2)
	testSRPK          *big.Int
	testTOTPSecretKey = []byte("authbox-test-totp-secret-key-v1!")
)

func init() {
	testSRPN, _ = new(big.Int).SetString(
		"AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050"+
			"A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50"+
			"E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8"+
			"55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B"+
			"CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748"+
			"544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6"+
			"AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6"+
			"94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73", 16)
	testSRPK = testComputeK(testSRPN, testSRPG)
}

func TestLoginVerifyWithTOTPAllowsFollowUpVerification(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	email := "totp-login@authbox.io"
	password := "MasterPassword!123"
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}

	user := &domain.User{
		ID:                uuid.New(),
		Email:             email,
		SRPSalt:           salt,
		SRPVerifier:       testGenerateVerifier(email, password, salt),
		EncryptedVaultKey: []byte("encrypted-vault-key"),
		VaultKeyNonce:     []byte("123456789012"),
		VaultKeyTag:       []byte("1234567890abcdef"),
		KDFParams:         domain.DefaultKDFParams(),
		TOTPSecret:        []byte("01234567890123456789"),
		TOTPEnabled:       true,
	}

	userRepo := newFakeUserRepo(user)
	sessionRepo := &fakeSessionRepo{}
	service := NewAuthService(userRepo, sessionRepo, NewTOTPService(userRepo, testTOTPSecretKey), time.Hour)
	encryptedSecret, err := service.totpService.encryptSecret(user.TOTPSecret)
	if err != nil {
		t.Fatalf("encryptSecret: %v", err)
	}
	if err := userRepo.SetTOTPSecret(ctx, user.ID, encryptedSecret); err != nil {
		t.Fatalf("SetTOTPSecret: %v", err)
	}

	clientState, err := newTestSRPClientState()
	if err != nil {
		t.Fatalf("newTestSRPClientState: %v", err)
	}

	initResp, err := service.LoginInit(ctx, LoginInitRequest{
		Email:         email,
		ClientPublicA: base64.StdEncoding.EncodeToString(clientState.publicA),
	})
	if err != nil {
		t.Fatalf("LoginInit: %v", err)
	}

	serverPublicB, err := base64.StdEncoding.DecodeString(initResp.ServerPublicB)
	if err != nil {
		t.Fatalf("DecodeString(ServerPublicB): %v", err)
	}

	clientProof := clientState.computeProof(t, email, password, salt, serverPublicB)

	verifyResp, err := service.LoginVerify(ctx, email, clientState.publicA, clientProof, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("LoginVerify: %v", err)
	}
	if !verifyResp.TOTPRequired {
		t.Fatal("expected LoginVerify to require TOTP")
	}
	if verifyResp.ServerProofM2 == "" {
		t.Fatal("expected server proof to be returned before TOTP step")
	}

	pending, ok := service.pending[email]
	if !ok {
		t.Fatal("pending login state was cleared before TOTP verification")
	}
	if !pending.srpVerified {
		t.Fatal("pending login was not marked as SRP-verified")
	}

	code := generateTOTP(user.TOTPSecret, time.Now().Unix()/30)
	finalResp, err := service.LoginVerifyTOTP(ctx, email, code, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("LoginVerifyTOTP: %v", err)
	}
	if finalResp.SessionToken == "" {
		t.Fatal("expected a session token after successful TOTP verification")
	}
	if len(sessionRepo.created) != 1 {
		t.Fatalf("expected 1 session to be created, got %d", len(sessionRepo.created))
	}
	if _, ok := service.pending[email]; ok {
		t.Fatal("pending login state was not cleared after successful TOTP verification")
	}
}

func TestLoginVerifyRefreshesUserStateBeforeTOTPDecision(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	email := "totp-refresh@authbox.io"
	password := "MasterPassword!123"
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}

	user := &domain.User{
		ID:                uuid.New(),
		Email:             email,
		SRPSalt:           salt,
		SRPVerifier:       testGenerateVerifier(email, password, salt),
		EncryptedVaultKey: []byte("encrypted-vault-key"),
		VaultKeyNonce:     []byte("123456789012"),
		VaultKeyTag:       []byte("1234567890abcdef"),
		KDFParams:         domain.DefaultKDFParams(),
	}

	userRepo := newFakeUserRepo(user)
	sessionRepo := &fakeSessionRepo{}
	service := NewAuthService(userRepo, sessionRepo, NewTOTPService(userRepo, testTOTPSecretKey), time.Hour)

	clientState, err := newTestSRPClientState()
	if err != nil {
		t.Fatalf("newTestSRPClientState: %v", err)
	}

	if _, err := service.LoginInit(ctx, LoginInitRequest{
		Email:         email,
		ClientPublicA: base64.StdEncoding.EncodeToString(clientState.publicA),
	}); err != nil {
		t.Fatalf("LoginInit: %v", err)
	}

	secret := []byte("01234567890123456789")
	encryptedSecret, err := service.totpService.encryptSecret(secret)
	if err != nil {
		t.Fatalf("encryptSecret: %v", err)
	}
	if err := userRepo.SetTOTPSecret(ctx, user.ID, encryptedSecret); err != nil {
		t.Fatalf("SetTOTPSecret: %v", err)
	}
	if err := userRepo.EnableTOTP(ctx, user.ID); err != nil {
		t.Fatalf("EnableTOTP: %v", err)
	}

	pendingBefore := service.pending[email]
	if pendingBefore == nil {
		t.Fatal("expected pending login state after LoginInit")
	}
	if pendingBefore.user.TOTPEnabled {
		t.Fatal("expected pending login snapshot to predate TOTP enablement")
	}

	serverPublicB := pendingBefore.srp.PublicB()
	clientProof := clientState.computeProof(t, email, password, salt, serverPublicB)

	verifyResp, err := service.LoginVerify(ctx, email, clientState.publicA, clientProof, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("LoginVerify: %v", err)
	}
	if !verifyResp.TOTPRequired {
		t.Fatal("expected LoginVerify to require TOTP after refreshed user lookup")
	}

	code := generateTOTP(secret, time.Now().Unix()/30)
	finalResp, err := service.LoginVerifyTOTP(ctx, email, code, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("LoginVerifyTOTP: %v", err)
	}
	if finalResp.SessionToken == "" {
		t.Fatal("expected session token after refreshed TOTP verification")
	}
}

type fakeUserRepo struct {
	byEmail map[string]*domain.User
	byID    map[uuid.UUID]*domain.User
}

func newFakeUserRepo(users ...*domain.User) *fakeUserRepo {
	repo := &fakeUserRepo{
		byEmail: make(map[string]*domain.User, len(users)),
		byID:    make(map[uuid.UUID]*domain.User, len(users)),
	}
	for _, user := range users {
		stored := cloneUser(user)
		repo.byEmail[stored.Email] = stored
		repo.byID[stored.ID] = stored
	}
	return repo
}

func (r *fakeUserRepo) Create(_ context.Context, u *domain.User) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	stored := cloneUser(u)
	r.byEmail[stored.Email] = stored
	r.byID[stored.ID] = stored
	return nil
}

func (r *fakeUserRepo) FindByEmail(_ context.Context, email string) (*domain.User, error) {
	return cloneUser(r.byEmail[email]), nil
}

func (r *fakeUserRepo) FindByID(_ context.Context, id uuid.UUID) (*domain.User, error) {
	return cloneUser(r.byID[id]), nil
}

func (r *fakeUserRepo) SetTOTPSecret(_ context.Context, userID uuid.UUID, secret []byte) error {
	if user := r.byID[userID]; user != nil {
		user.TOTPSecret = append([]byte(nil), secret...)
	}
	return nil
}

func (r *fakeUserRepo) EnableTOTP(_ context.Context, userID uuid.UUID) error {
	if user := r.byID[userID]; user != nil {
		user.TOTPEnabled = true
		now := time.Now().UTC()
		user.TOTPVerifiedAt = &now
	}
	return nil
}

func (r *fakeUserRepo) DisableTOTP(_ context.Context, userID uuid.UUID) error {
	if user := r.byID[userID]; user != nil {
		user.TOTPEnabled = false
		user.TOTPVerifiedAt = nil
	}
	return nil
}

func cloneUser(user *domain.User) *domain.User {
	if user == nil {
		return nil
	}

	cloned := *user
	cloned.SRPSalt = append([]byte(nil), user.SRPSalt...)
	cloned.SRPVerifier = append([]byte(nil), user.SRPVerifier...)
	cloned.EncryptedVaultKey = append([]byte(nil), user.EncryptedVaultKey...)
	cloned.VaultKeyNonce = append([]byte(nil), user.VaultKeyNonce...)
	cloned.VaultKeyTag = append([]byte(nil), user.VaultKeyTag...)
	cloned.PublicKey = append([]byte(nil), user.PublicKey...)
	cloned.TOTPSecret = append([]byte(nil), user.TOTPSecret...)
	if user.TOTPVerifiedAt != nil {
		ts := *user.TOTPVerifiedAt
		cloned.TOTPVerifiedAt = &ts
	}
	return &cloned
}

type fakeSessionRepo struct {
	created []domain.Session
}

func (r *fakeSessionRepo) Create(_ context.Context, s *domain.Session) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	if s.CreatedAt.IsZero() {
		s.CreatedAt = time.Now().UTC()
	}
	if s.LastActiveAt.IsZero() {
		s.LastActiveAt = s.CreatedAt
	}
	r.created = append(r.created, *s)
	return nil
}

func (r *fakeSessionRepo) ValidateSession(_ context.Context, _ []byte) (uuid.UUID, error) {
	return uuid.Nil, nil
}

func (r *fakeSessionRepo) DeleteByTokenHash(_ context.Context, _ []byte) error {
	return nil
}

func (r *fakeSessionRepo) DeleteByTokenHashAndUser(_ context.Context, _ []byte, _ uuid.UUID) error {
	return nil
}

func (r *fakeSessionRepo) DeleteByUserID(_ context.Context, _ uuid.UUID) error {
	return nil
}

func (r *fakeSessionRepo) ListByUserID(_ context.Context, _ uuid.UUID) ([]domain.Session, error) {
	return nil, nil
}

func (r *fakeSessionRepo) DeleteByID(_ context.Context, _ uuid.UUID, _ uuid.UUID) error {
	return nil
}

func (r *fakeSessionRepo) TouchSession(_ context.Context, _ []byte) error {
	return nil
}

type testSRPClientState struct {
	privateA *big.Int
	publicA  []byte
}

func newTestSRPClientState() (*testSRPClientState, error) {
	a, err := testRandBigInt(256)
	if err != nil {
		return nil, err
	}
	A := new(big.Int).Exp(testSRPG, a, testSRPN)
	return &testSRPClientState{
		privateA: a,
		publicA:  testPadTo(A, len(testSRPN.Bytes())),
	}, nil
}

func (c *testSRPClientState) computeProof(t *testing.T, email, password string, salt, serverPublicB []byte) []byte {
	t.Helper()

	A := new(big.Int).SetBytes(c.publicA)
	B := new(big.Int).SetBytes(serverPublicB)
	nLen := len(testSRPN.Bytes())

	u := testComputeU(A, B)
	if u.Sign() == 0 {
		t.Fatal("u is zero")
	}

	inner := sha256.Sum256([]byte(email + ":" + password))
	h := sha256.New()
	h.Write(salt)
	h.Write(inner[:])
	x := new(big.Int).SetBytes(h.Sum(nil))

	gx := new(big.Int).Exp(testSRPG, x, testSRPN)
	kgx := new(big.Int).Mul(testSRPK, gx)
	kgx.Mod(kgx, testSRPN)
	base := new(big.Int).Sub(B, kgx)
	base.Mod(base, testSRPN)
	if base.Sign() < 0 {
		base.Add(base, testSRPN)
	}

	exp := new(big.Int).Mul(u, x)
	exp.Add(exp, c.privateA)
	S := new(big.Int).Exp(base, exp, testSRPN)

	K := testHashBytes(testPadTo(S, nLen))
	return testHashBytes(c.publicA, testPadTo(B, nLen), K)
}

func testGenerateVerifier(email, password string, salt []byte) []byte {
	inner := sha256.Sum256([]byte(email + ":" + password))
	h := sha256.New()
	h.Write(salt)
	h.Write(inner[:])
	x := new(big.Int).SetBytes(h.Sum(nil))
	v := new(big.Int).Exp(testSRPG, x, testSRPN)
	return testPadTo(v, len(testSRPN.Bytes()))
}

func testComputeK(N, g *big.Int) *big.Int {
	nLen := len(N.Bytes())
	return new(big.Int).SetBytes(testHashBytes(testPadTo(N, nLen), testPadTo(g, nLen)))
}

func testComputeU(A, B *big.Int) *big.Int {
	nLen := len(testSRPN.Bytes())
	return new(big.Int).SetBytes(testHashBytes(testPadTo(A, nLen), testPadTo(B, nLen)))
}

func testHashBytes(parts ...[]byte) []byte {
	h := sha256.New()
	for _, part := range parts {
		h.Write(part)
	}
	return h.Sum(nil)
}

func testPadTo(n *big.Int, length int) []byte {
	b := n.Bytes()
	if len(b) >= length {
		return b
	}
	padded := make([]byte, length)
	copy(padded[length-len(b):], b)
	return padded
}

func testRandBigInt(bits int) (*big.Int, error) {
	buf := make([]byte, bits/8)
	if _, err := rand.Read(buf); err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(buf), nil
}
