package service

import (
	"context"
	"encoding/base64"
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
}

// pendingLogin holds ephemeral server-side SRP state between init and verify.
type pendingLogin struct {
	srp         *auth.SRPServer
	user        *domain.User
	createdAt   time.Time
	srpVerified bool // set to true after SRP proof succeeds (guards TOTP bypass)
}

type AuthService struct {
	userRepo    domain.UserRepository
	sessionRepo domain.SessionRepository
	totpService *TOTPService
	sessionTTL  time.Duration

	mu       sync.Mutex
	pending  map[string]*pendingLogin // keyed by email
}

func NewAuthService(userRepo domain.UserRepository, sessionRepo domain.SessionRepository, totpService *TOTPService, sessionTTL time.Duration) *AuthService {
	s := &AuthService{
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
		totpService: totpService,
		sessionTTL:  sessionTTL,
		pending:     make(map[string]*pendingLogin),
	}
	go s.cleanupPending()
	return s
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
	user, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("invalid credentials")
	}

	srpServer, err := auth.NewSRPServer(user.SRPVerifier)
	if err != nil {
		return nil, err
	}

	// Decode client's A to validate it
	clientA, err := base64.StdEncoding.DecodeString(req.ClientPublicA)
	if err != nil {
		return nil, errors.New("invalid clientPublicA encoding")
	}
	_ = clientA // We store it for verify step

	s.mu.Lock()
	s.pending[req.Email] = &pendingLogin{
		srp:       srpServer,
		user:      user,
		createdAt: time.Now(),
	}
	s.mu.Unlock()

	return &LoginInitResponse{
		SRPSalt:       base64.StdEncoding.EncodeToString(user.SRPSalt),
		ServerPublicB: base64.StdEncoding.EncodeToString(srpServer.PublicB()),
	}, nil
}

// LoginVerify validates the client's SRP proof and creates a session.
func (s *AuthService) LoginVerify(ctx context.Context, email string, clientA, clientM1 []byte, ipAddress, userAgent string) (*LoginVerifyResponse, error) {
	s.mu.Lock()
	pl, ok := s.pending[email]
	if ok {
		delete(s.pending, email)
	}
	s.mu.Unlock()

	if !ok {
		return nil, errors.New("no pending login for this email")
	}

	m2, err := pl.srp.VerifyProof(clientA, clientM1)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	// Check if TOTP 2FA is enabled — if so, require TOTP before issuing session.
	// Mark SRP as verified so LoginVerifyTOTP can confirm proof was completed.
	if pl.user.TOTPEnabled {
		pl.srpVerified = true
		return &LoginVerifyResponse{
			ServerProofM2: base64.StdEncoding.EncodeToString(m2),
			TOTPRequired:  true,
		}, nil
	}

	return s.issueSession(ctx, pl.user, m2, ipAddress, userAgent)
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

	return &LoginVerifyResponse{
		SessionToken:      token,
		ServerProofM2:     base64.StdEncoding.EncodeToString(m2),
		EncryptedVaultKey: base64.StdEncoding.EncodeToString(user.EncryptedVaultKey),
		VaultKeyNonce:     base64.StdEncoding.EncodeToString(user.VaultKeyNonce),
		VaultKeyTag:       base64.StdEncoding.EncodeToString(user.VaultKeyTag),
		KDFParams:         user.KDFParams,
	}, nil
}

// LoginVerifyTOTP completes login when TOTP 2FA is required.
// Called after LoginVerify returns totpRequired=true.
//
// Security: requires that SRP proof was completed first (srpVerified=true).
// Without this check, an attacker with email + TOTP seed could bypass the
// master password entirely.
func (s *AuthService) LoginVerifyTOTP(ctx context.Context, email, totpCode, ipAddress, userAgent string) (*LoginVerifyResponse, error) {
	// Verify SRP proof was completed before allowing TOTP
	s.mu.Lock()
	pl, exists := s.pending[email]
	s.mu.Unlock()

	if !exists || !pl.srpVerified {
		return nil, errors.New("SRP authentication required before TOTP verification")
	}

	user := pl.user
	if !user.TOTPEnabled {
		return nil, errors.New("TOTP not enabled for this account")
	}

	valid, err := s.totpService.Check(ctx, user.ID, totpCode)
	if err != nil {
		return nil, err
	}
	if !valid {
		return nil, errors.New("invalid TOTP code")
	}

	// Clean up pending state now that login is fully complete
	s.mu.Lock()
	delete(s.pending, email)
	s.mu.Unlock()

	// TOTP verified — issue session (m2 already sent in prior response)
	return s.issueSession(ctx, user, nil, ipAddress, userAgent)
}

// cleanupPending removes stale login attempts older than 5 minutes.
func (s *AuthService) cleanupPending() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		for email, pl := range s.pending {
			if time.Since(pl.createdAt) > 5*time.Minute {
				delete(s.pending, email)
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
