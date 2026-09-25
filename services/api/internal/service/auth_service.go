package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/domain"

	"github.com/google/uuid"
)

// ErrEmailExists is returned when attempting to register an already-registered email.
var ErrEmailExists = errors.New("email already registered")

// ErrInvalidLoginCredentials marks authentication failures the handler maps to
// a constant 401; any other error from the login flow is an internal fault
// and must surface as a 5xx, not eat the user's retry budget.
var ErrInvalidLoginCredentials = errors.New("invalid credentials")

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
	// LoginToken is a single-use random token minted when TOTP is required.
	// It binds the TOTP step to the client that completed the SRP proof —
	// without it, anyone who knew the email could race the victim to
	// /auth/login/totp/verify and take over the session.
	LoginToken string `json:"loginToken,omitempty"`
}

// pendingLogin holds ephemeral server-side SRP state between init and verify.
type pendingLogin struct {
	srp          *auth.SRPServer
	user         *domain.User
	createdAt    time.Time
	srpVerified  bool // set to true after SRP proof succeeds (guards TOTP bypass)
	totpAttempts int  // failed TOTP codes against this pending login
}

const maxTOTPAttempts = 3

// maxPendingLogins caps the in-memory handshake map so unauthenticated
// LoginInit calls cannot grow process memory without bound.
const maxPendingLogins = 10000

type AuthService struct {
	userRepo    domain.UserRepository
	sessionRepo domain.SessionRepository
	totpService *TOTPService
	sessionTTL  time.Duration
	audit       *AuditService // optional; nil-safe

	// enumKey feeds deterministic fake SRP parameters for unknown emails so
	// LoginInit timing/output does not reveal whether an account exists.
	enumKey []byte

	mu      sync.Mutex
	pending map[string]*pendingLogin // keyed by email (init -> verify)
	// totpPending is keyed by a random single-use login token minted at
	// LoginVerify, so the TOTP step is bound to the SRP-verified client.
	totpPending map[string]*pendingLogin
}

func NewAuthService(userRepo domain.UserRepository, sessionRepo domain.SessionRepository, totpService *TOTPService, sessionTTL time.Duration) *AuthService {
	s := &AuthService{
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
		totpService: totpService,
		sessionTTL:  sessionTTL,
		pending:     make(map[string]*pendingLogin),
		totpPending: make(map[string]*pendingLogin),
		enumKey:     make([]byte, 32),
	}
	if _, err := rand.Read(s.enumKey); err != nil {
		panic("auth: cannot seed enumeration key: " + err.Error())
	}
	go s.cleanupPending()
	return s
}

// WithAuditor wires the audit trail. Login outcomes are security events; a
// credential product with an empty audit chain has no story to tell after an
// incident.
func (s *AuthService) WithAuditor(a *AuditService) *AuthService {
	s.audit = a
	return s
}

func (s *AuthService) logAuth(ctx context.Context, userID uuid.UUID, action, decision, ip, ua string) {
	if s.audit == nil {
		return
	}
	if _, err := s.audit.LogEvent(ctx, userID, AuditEventRequest{
		ActorType: "user",
		ActorID:   userID.String(),
		Action:    action,
		Decision:  decision,
		IPAddress: ip,
		UserAgent: ua,
	}); err != nil {
		slog.Warn("audit log write failed", "action", action, "error", err)
	}
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
		// Unknown email: perform the SAME modular exponentiation against a
		// deterministic fake verifier and return plausible salt/B. Returning
		// early made known vs unknown emails separable by response timing.
		return s.fakeLoginInit(req.Email)
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
	if len(s.pending) >= maxPendingLogins {
		s.mu.Unlock()
		return nil, errors.New("too many pending logins")
	}
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
	// Fetch AND delete under one lock: pending state is single-use, so
	// concurrent verify calls cannot race on the shared SRPServer big.Ints.
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
		s.logAuth(ctx, pl.user.ID, "user.login", "deny", ipAddress, userAgent)
		return nil, errors.New("invalid credentials")
	}

	currentUser, err := s.userRepo.FindByID(ctx, pl.user.ID)
	if err != nil || currentUser == nil {
		return nil, errors.New("invalid credentials")
	}
	pl.user = currentUser

	// TOTP 2FA enabled: mint a single-use login token that the TOTP step must
	// present. Keying the second factor by email alone would let anyone who
	// knows the email complete the login the victim's SRP proof opened.
	if currentUser.TOTPEnabled {
		loginToken, _, err := auth.GenerateSessionToken()
		if err != nil {
			return nil, err
		}
		pl.srpVerified = true
		pl.createdAt = time.Now()
		s.mu.Lock()
		s.totpPending[loginToken] = pl
		s.mu.Unlock()
		return &LoginVerifyResponse{
			ServerProofM2: base64.StdEncoding.EncodeToString(m2),
			TOTPRequired:  true,
			LoginToken:    loginToken,
		}, nil
	}

	return s.issueSession(ctx, currentUser, m2, ipAddress, userAgent)
}

// fakeLoginInit produces a deterministic, plausible LoginInit response for a
// nonexistent account, doing the same expensive SRP work as the real path.
func (s *AuthService) fakeLoginInit(email string) (*LoginInitResponse, error) {
	saltMAC := hmac.New(sha256.New, s.enumKey)
	saltMAC.Write([]byte("salt:" + email))
	fakeSalt := saltMAC.Sum(nil)

	// Expand a 256-byte fake verifier deterministically from the email.
	fakeVerifier := make([]byte, 0, 256)
	for i := 0; len(fakeVerifier) < 256; i++ {
		m := hmac.New(sha256.New, s.enumKey)
		fmt.Fprintf(m, "verifier:%d:%s", i, email)
		fakeVerifier = append(fakeVerifier, m.Sum(nil)...)
	}
	fakeVerifier = fakeVerifier[:256]

	srpServer, err := auth.NewSRPServer(fakeVerifier)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	return &LoginInitResponse{
		SRPSalt:       base64.StdEncoding.EncodeToString(fakeSalt),
		ServerPublicB: base64.StdEncoding.EncodeToString(srpServer.PublicB()),
	}, nil
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

	s.logAuth(ctx, user.ID, "user.login", "allow", ipAddress, userAgent)

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
// Called after LoginVerify returns totpRequired=true with a loginToken.
//
// Security: the login token is minted only after a successful SRP proof and
// is single-use with a bounded retry budget. Every failure returns the same
// constant error so an unauthenticated caller learns nothing about pending
// state or TOTP enrollment.
func (s *AuthService) LoginVerifyTOTP(ctx context.Context, loginToken, totpCode, ipAddress, userAgent string) (*LoginVerifyResponse, error) {
	// Fetch AND delete under one lock (single use); re-inserted below only
	// while the retry budget lasts.
	s.mu.Lock()
	pl, exists := s.totpPending[loginToken]
	if exists {
		delete(s.totpPending, loginToken)
	}
	s.mu.Unlock()

	if !exists || !pl.srpVerified || time.Since(pl.createdAt) > 5*time.Minute {
		return nil, ErrInvalidLoginCredentials
	}

	restorePending := func() {
		s.mu.Lock()
		s.totpPending[loginToken] = pl
		s.mu.Unlock()
	}

	user, err := s.userRepo.FindByID(ctx, pl.user.ID)
	if err != nil {
		// Backend fault, not a wrong code: keep the token alive and do not
		// spend an attempt — a DB hiccup must not dead-end the login.
		restorePending()
		return nil, err
	}
	if user == nil || !user.TOTPEnabled {
		return nil, ErrInvalidLoginCredentials
	}
	pl.user = user

	valid, err := s.totpService.Check(ctx, user.ID, totpCode)
	if err != nil {
		restorePending()
		return nil, err
	}
	if !valid {
		s.logAuth(ctx, user.ID, "user.login", "deny", ipAddress, userAgent)
		pl.totpAttempts++
		if pl.totpAttempts < maxTOTPAttempts {
			restorePending()
		}
		return nil, ErrInvalidLoginCredentials
	}

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
		for token, pl := range s.totpPending {
			if time.Since(pl.createdAt) > 5*time.Minute {
				delete(s.totpPending, token)
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
