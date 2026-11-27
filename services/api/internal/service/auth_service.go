package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

// ErrEmailExists is returned when attempting to register an already-registered email.
var ErrEmailExists = errors.New("email already registered")

type RegisterRequest struct {
	Email             string           `json:"email"`
	SRPSalt           string           `json:"srpSalt"`
	SRPVerifier       string           `json:"srpVerifier"`
	EncryptedVaultKey string           `json:"encryptedVaultKey"`
	VaultKeyNonce     string           `json:"vaultKeyNonce"`
	VaultKeyTag       string           `json:"vaultKeyTag"`
	KDFParams         domain.KDFParams `json:"kdfParams"`
	PublicKey         string           `json:"publicKey,omitempty"`
}

type RegisterResponse struct {
	UserID string `json:"userId"`
}

type LoginInitRequest struct {
	Email        string `json:"email"`
	ClientPublicA string `json:"clientPublicA"`
}

type LoginInitResponse struct {
	SRPSalt       string `json:"srpSalt"`
	ServerPublicB string `json:"serverPublicB"`
}

type LoginVerifyResponse struct {
	SessionToken      string           `json:"sessionToken,omitempty"`
	ServerProofM2     string           `json:"serverProofM2"`
	EncryptedVaultKey string           `json:"encryptedVaultKey,omitempty"`
	VaultKeyNonce     string           `json:"vaultKeyNonce,omitempty"`
	VaultKeyTag       string           `json:"vaultKeyTag,omitempty"`
	KDFParams         domain.KDFParams `json:"kdfParams,omitempty"`
	TOTPRequired      bool             `json:"totpRequired,omitempty"`
	// LoginChallenge is returned with TOTPRequired and must be echoed back to
	// /auth/login/totp/verify. It binds the TOTP step to the client that
	// completed SRP.
	LoginChallenge string `json:"loginChallenge,omitempty"`
}

// ErrInvalidCredentials is the single, deliberately vague error every login
// failure maps to, so responses never reveal which step or check failed.
var ErrInvalidCredentials = errors.New("invalid credentials")

const (
	// pendingLoginTTL bounds how long an SRP handshake or a TOTP challenge stays
	// usable between steps.
	pendingLoginTTL = 5 * time.Minute
	// maxTOTPAttempts caps wrong TOTP codes per login challenge. A 6-digit code
	// with a ±1 step window has 3 valid values out of 10^6; five guesses per
	// fully-authenticated SRP handshake keeps online guessing impractical.
	maxTOTPAttempts = 5
)

// pendingSRP is the server half of one in-flight SRP handshake. It is keyed by
// email AND the client's ephemeral A, so a second LoginInit for the same email
// (from anyone) cannot overwrite or hijack another client's attempt, and it is
// consumed exactly once by LoginVerify.
type pendingSRP struct {
	srp       *auth.SRPServer
	userID    uuid.UUID
	createdAt time.Time
}

// pendingMFA is a login that passed SRP and now waits for a TOTP code. It is
// keyed by the hash of a random loginChallenge that only the client which
// completed SRP receives, so knowing the email alone is never enough to submit
// TOTP guesses for someone else's half-finished login.
type pendingMFA struct {
	userID    uuid.UUID
	email     string
	createdAt time.Time
	failures  int
}

type AuthService struct {
	userRepo    domain.UserRepository
	sessionRepo domain.SessionRepository
	totpService *TOTPService
	sessionTTL  time.Duration

	mu         sync.Mutex
	pendingSRP map[string]*pendingSRP // keyed by srpKey(email, A)
	pendingMFA map[string]*pendingMFA // keyed by challengeKey(loginChallenge)
}

func NewAuthService(userRepo domain.UserRepository, sessionRepo domain.SessionRepository, totpService *TOTPService, sessionTTL time.Duration) *AuthService {
	s := &AuthService{
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
		totpService: totpService,
		sessionTTL:  sessionTTL,
		pendingSRP:  make(map[string]*pendingSRP),
		pendingMFA:  make(map[string]*pendingMFA),
	}
	go s.cleanupPending()
	return s
}

func srpKey(email string, clientA []byte) string {
	h := sha256.Sum256(clientA)
	return email + "\x00" + hex.EncodeToString(h[:])
}

func challengeKey(challenge string) string {
	h := sha256.Sum256([]byte(challenge))
	return hex.EncodeToString(h[:])
}

func (s *AuthService) Register(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	salt, err := base64.StdEncoding.DecodeString(req.SRPSalt)
	if err != nil {
		return nil, errors.New("invalid srpSalt encoding")
	}
	verifier, err := base64.StdEncoding.DecodeString(req.SRPVerifier)
	if err != nil {
		return nil, errors.New("invalid srpVerifier encoding")
	}
	vaultKey, err := base64.StdEncoding.DecodeString(req.EncryptedVaultKey)
	if err != nil {
		return nil, errors.New("invalid encryptedVaultKey encoding")
	}
	nonce, err := base64.StdEncoding.DecodeString(req.VaultKeyNonce)
	if err != nil {
		return nil, errors.New("invalid vaultKeyNonce encoding")
	}
	tag, err := base64.StdEncoding.DecodeString(req.VaultKeyTag)
	if err != nil {
		return nil, errors.New("invalid vaultKeyTag encoding")
	}

	var pubKey []byte
	if req.PublicKey != "" {
		pubKey, err = base64.StdEncoding.DecodeString(req.PublicKey)
		if err != nil {
			return nil, errors.New("invalid publicKey encoding")
		}
	}

	existing, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrEmailExists
	}

	user := &domain.User{
		Email:             req.Email,
		SRPSalt:           salt,
		SRPVerifier:       verifier,
		EncryptedVaultKey: vaultKey,
		VaultKeyNonce:     nonce,
		VaultKeyTag:       tag,
		KDFParams:         req.KDFParams,
		PublicKey:         pubKey,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	return &RegisterResponse{UserID: user.ID.String()}, nil
}

func (s *AuthService) LoginInit(ctx context.Context, req LoginInitRequest) (*LoginInitResponse, error) {
	clientA, err := base64.StdEncoding.DecodeString(req.ClientPublicA)
	if err != nil {
		return nil, errors.New("invalid clientPublicA encoding")
	}
	if err := auth.ValidateClientPublic(clientA); err != nil {
		return nil, err
	}

	user, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrInvalidCredentials
	}

	srpServer, err := auth.NewSRPServer(user.SRPVerifier)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.pendingSRP[srpKey(req.Email, clientA)] = &pendingSRP{
		srp:       srpServer,
		userID:    user.ID,
		createdAt: time.Now(),
	}
	s.mu.Unlock()

	return &LoginInitResponse{
		SRPSalt:       base64.StdEncoding.EncodeToString(user.SRPSalt),
		ServerPublicB: base64.StdEncoding.EncodeToString(srpServer.PublicB()),
	}, nil
}

// takePendingSRP removes and returns the handshake for (email, A). Taking it
// makes every handshake single-use: a failed or replayed proof cannot be
// retried against the same server ephemeral, and concurrent verifies cannot
// race on the same SRPServer.
func (s *AuthService) takePendingSRP(email string, clientA []byte) (*pendingSRP, bool) {
	key := srpKey(email, clientA)
	s.mu.Lock()
	defer s.mu.Unlock()
	pl, ok := s.pendingSRP[key]
	if !ok {
		return nil, false
	}
	delete(s.pendingSRP, key)
	if time.Since(pl.createdAt) > pendingLoginTTL {
		return nil, false
	}
	return pl, true
}

// LoginVerify validates the client's SRP proof. Without TOTP it issues the
// session directly; with TOTP it returns a single-use loginChallenge that the
// same client must present to LoginVerifyTOTP.
func (s *AuthService) LoginVerify(ctx context.Context, email string, clientA, clientM1 []byte, ipAddress, userAgent string) (*LoginVerifyResponse, error) {
	pl, ok := s.takePendingSRP(email, clientA)
	if !ok {
		return nil, ErrInvalidCredentials
	}

	m2, err := pl.srp.VerifyProof(clientA, clientM1)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	// Re-read the user: TOTP may have been enabled (or the account removed)
	// between LoginInit and LoginVerify.
	currentUser, err := s.userRepo.FindByID(ctx, pl.userID)
	if err != nil || currentUser == nil {
		return nil, ErrInvalidCredentials
	}

	if currentUser.TOTPEnabled {
		challenge, _, err := auth.GenerateSessionToken()
		if err != nil {
			return nil, err
		}
		s.mu.Lock()
		s.pendingMFA[challengeKey(challenge)] = &pendingMFA{
			userID:    currentUser.ID,
			email:     email,
			createdAt: time.Now(),
		}
		s.mu.Unlock()
		return &LoginVerifyResponse{
			ServerProofM2:  base64.StdEncoding.EncodeToString(m2),
			TOTPRequired:   true,
			LoginChallenge: challenge,
		}, nil
	}

	return s.issueSession(ctx, currentUser, m2, ipAddress, userAgent)
}

func (s *AuthService) Logout(ctx context.Context, tokenHash []byte) error {
	return s.sessionRepo.DeleteByTokenHash(ctx, tokenHash)
}

// LogoutScoped deletes a session only if it belongs to the specified user.
// Prevents cross-user session revocation via token manipulation.
func (s *AuthService) LogoutScoped(ctx context.Context, tokenHash []byte, userID uuid.UUID) error {
	return s.sessionRepo.DeleteByTokenHashAndUser(ctx, tokenHash, userID)
}

func (s *AuthService) ValidateSession(ctx context.Context, tokenHash []byte) (uuid.UUID, error) {
	return s.sessionRepo.ValidateSession(ctx, tokenHash)
}

func (s *AuthService) TouchSession(ctx context.Context, tokenHash []byte) error {
	return s.sessionRepo.TouchSession(ctx, tokenHash)
}

// issueSession creates a session and returns the full login response.
func (s *AuthService) issueSession(ctx context.Context, user *domain.User, m2 []byte, ipAddress, userAgent string) (*LoginVerifyResponse, error) {
	token, tokenHash, err := auth.GenerateSessionToken()
	if err != nil {
		return nil, err
	}

	session := &domain.Session{
		UserID:     user.ID,
		TokenHash:  tokenHash,
		DeviceName: deviceFromUA(userAgent),
		IPAddress:  ipAddress,
		UserAgent:  userAgent,
		ExpiresAt:  time.Now().Add(s.sessionTTL),
	}

	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return nil, err
	}

	resp := &LoginVerifyResponse{
		SessionToken:      token,
		ServerProofM2:     base64.StdEncoding.EncodeToString(m2),
		EncryptedVaultKey: base64.StdEncoding.EncodeToString(user.EncryptedVaultKey),
		VaultKeyNonce:     base64.StdEncoding.EncodeToString(user.VaultKeyNonce),
		VaultKeyTag:       base64.StdEncoding.EncodeToString(user.VaultKeyTag),
		KDFParams:         user.KDFParams,
	}
	return resp, nil
}

// LoginVerifyTOTP completes a login that LoginVerify answered with
// totpRequired=true.
//
// Security: the caller must present the loginChallenge returned by the SRP
// step, so only the client that proved knowledge of the master password can
// submit codes. Each challenge allows maxTOTPAttempts wrong codes, expires
// after pendingLoginTTL, and yields at most one session.
func (s *AuthService) LoginVerifyTOTP(ctx context.Context, email, loginChallenge, totpCode, ipAddress, userAgent string) (*LoginVerifyResponse, error) {
	if loginChallenge == "" {
		return nil, ErrInvalidCredentials
	}
	key := challengeKey(loginChallenge)

	s.mu.Lock()
	pm, ok := s.pendingMFA[key]
	if ok && (pm.email != email || time.Since(pm.createdAt) > pendingLoginTTL) {
		ok = false
	}
	var userID uuid.UUID
	if ok {
		userID = pm.userID
	}
	s.mu.Unlock()
	if !ok {
		return nil, ErrInvalidCredentials
	}

	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user == nil || !user.TOTPEnabled {
		s.dropPendingMFA(key)
		return nil, ErrInvalidCredentials
	}

	valid, err := s.totpService.Check(ctx, user.ID, totpCode)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	pm, ok = s.pendingMFA[key]
	if !ok {
		// A concurrent request already consumed or exhausted this challenge.
		s.mu.Unlock()
		return nil, ErrInvalidCredentials
	}
	if !valid {
		pm.failures++
		if pm.failures >= maxTOTPAttempts {
			delete(s.pendingMFA, key)
		}
		s.mu.Unlock()
		return nil, ErrInvalidCredentials
	}
	delete(s.pendingMFA, key)
	s.mu.Unlock()

	// m2 was already returned by LoginVerify.
	return s.issueSession(ctx, user, nil, ipAddress, userAgent)
}

func (s *AuthService) dropPendingMFA(key string) {
	s.mu.Lock()
	delete(s.pendingMFA, key)
	s.mu.Unlock()
}

// cleanupPending removes handshakes and challenges older than pendingLoginTTL.
func (s *AuthService) cleanupPending() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		for key, pl := range s.pendingSRP {
			if time.Since(pl.createdAt) > pendingLoginTTL {
				delete(s.pendingSRP, key)
			}
		}
		for key, pm := range s.pendingMFA {
			if time.Since(pm.createdAt) > pendingLoginTTL {
				delete(s.pendingMFA, key)
			}
		}
		s.mu.Unlock()
	}
}

// SessionResponse is the JSON-safe representation of a session for the management UI.
type SessionResponse struct {
	ID           string `json:"id"`
	DeviceName   string `json:"deviceName"`
	IPAddress    string `json:"ipAddress"`
	CreatedAt    string `json:"createdAt"`
	LastActiveAt string `json:"lastActiveAt"`
	ExpiresAt    string `json:"expiresAt"`
}

func (s *AuthService) ListSessions(ctx context.Context, userID uuid.UUID) ([]SessionResponse, error) {
	sessions, err := s.sessionRepo.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}

	responses := make([]SessionResponse, len(sessions))
	for i, sess := range sessions {
		responses[i] = SessionResponse{
			ID:           sess.ID.String(),
			DeviceName:   sess.DeviceName,
			IPAddress:    sess.IPAddress,
			CreatedAt:    sess.CreatedAt.Format(time.RFC3339),
			LastActiveAt: sess.LastActiveAt.Format(time.RFC3339),
			ExpiresAt:    sess.ExpiresAt.Format(time.RFC3339),
		}
	}
	return responses, nil
}

func (s *AuthService) RevokeSession(ctx context.Context, sessionID, userID uuid.UUID) error {
	return s.sessionRepo.DeleteByID(ctx, sessionID, userID)
}

func (s *AuthService) RevokeAllSessions(ctx context.Context, userID uuid.UUID) error {
	return s.sessionRepo.DeleteByUserID(ctx, userID)
}

func deviceFromUA(ua string) string {
	if ua == "" {
		return "Unknown Device"
	}
	if len(ua) > 50 {
		return ua[:50]
	}
	return ua
}
