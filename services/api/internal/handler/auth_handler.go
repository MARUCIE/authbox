package handler

import (
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"sync"
	"time"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/httpx"
	appmw "auth-box-api/internal/middleware"
	"auth-box-api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type AuthHandler struct {
	authService  *service.AuthService
	emailLimiter *emailRateLimit
}

// emailRateLimit prevents email enumeration via registration/login brute-force.
// The per-email threshold is configurable so E2E and production can use the
// same code path with different envelopes.
// Background cleanup runs every 60s; memory capped at maxEntries.
type emailRateLimit struct {
	mu          sync.Mutex
	entries     map[string]emailEntry
	maxAttempts int
	maxEntries  int
	window      time.Duration
}

type emailEntry struct {
	count int
	start time.Time
}

func newEmailRateLimit(maxAttempts int) *emailRateLimit {
	rl := &emailRateLimit{
		entries:     make(map[string]emailEntry),
		maxAttempts: maxAttempts,
		maxEntries:  10000,
		window:      5 * time.Minute,
	}
	go rl.cleanup()
	return rl
}

func (rl *emailRateLimit) cleanup() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		rl.mu.Lock()
		for key, entry := range rl.entries {
			if now.Sub(entry.start) > rl.window {
				delete(rl.entries, key)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *emailRateLimit) allow(email string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	maxAttempts := rl.maxAttempts
	if maxAttempts <= 0 {
		maxAttempts = 5
	}
	// Memory cap: reject new entries if at capacity
	e, ok := rl.entries[email]
	if !ok {
		if len(rl.entries) >= rl.maxEntries {
			return false // shed load when map is full
		}
		rl.entries[email] = emailEntry{count: 1, start: now}
		return true
	}
	if now.Sub(e.start) > rl.window {
		rl.entries[email] = emailEntry{count: 1, start: now}
		return true
	}
	e.count++
	rl.entries[email] = e
	return e.count <= maxAttempts
}

func NewAuthHandler(authService *service.AuthService, maxEmailAttempts int) *AuthHandler {
	return &AuthHandler{
		authService:  authService,
		emailLimiter: newEmailRateLimit(maxEmailAttempts),
	}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req service.RegisterRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Email == "" || req.SRPSalt == "" || req.SRPVerifier == "" || req.EncryptedVaultKey == "" {
		httpx.WriteError(w, http.StatusBadRequest, "missing required fields", httpx.CodeBadRequest)
		return
	}
	// RFC 5321 email format validation via net/mail.
	if _, err := mail.ParseAddress(req.Email); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid email format", httpx.CodeBadRequest)
		return
	}
	// Per-email rate limit to prevent enumeration
	if !h.emailLimiter.allow(strings.ToLower(req.Email)) {
		httpx.WriteError(w, http.StatusTooManyRequests, "too many attempts for this email", httpx.CodeRateLimited)
		return
	}

	// String length bounds to prevent abuse.
	if len(req.Email) > 254 || len(req.SRPSalt) > 1024 || len(req.SRPVerifier) > 4096 || len(req.EncryptedVaultKey) > 4096 {
		httpx.WriteError(w, http.StatusBadRequest, "field length exceeds limit", httpx.CodeBadRequest)
		return
	}

	resp, err := h.authService.Register(r.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrEmailExists) {
			httpx.WriteError(w, http.StatusConflict, "email already registered", httpx.CodeEmailExists)
			return
		}
		writeInternal(w, err, "register failed", "registration failed")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, resp)
}

// loginVerifyRequest extends the service request to also include clientPublicA.
type loginVerifyRequest struct {
	Email         string `json:"email"`
	ClientPublicA string `json:"clientPublicA"`
	ClientProofM1 string `json:"clientProofM1"`
}

func (h *AuthHandler) LoginInit(w http.ResponseWriter, r *http.Request) {
	var req service.LoginInitRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Email == "" || req.ClientPublicA == "" {
		httpx.WriteError(w, http.StatusBadRequest, "missing required fields", httpx.CodeBadRequest)
		return
	}

	// Per-email rate limit to prevent enumeration
	if !h.emailLimiter.allow(strings.ToLower(req.Email)) {
		httpx.WriteError(w, http.StatusTooManyRequests, "too many attempts for this email", httpx.CodeRateLimited)
		return
	}

	resp, err := h.authService.LoginInit(r.Context(), req)
	if err != nil {
		// Don't reveal whether user exists
		httpx.WriteError(w, http.StatusUnauthorized, "invalid credentials", httpx.CodeInvalidCredentials)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) LoginVerify(w http.ResponseWriter, r *http.Request) {
	var req loginVerifyRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Email == "" || req.ClientPublicA == "" || req.ClientProofM1 == "" {
		httpx.WriteError(w, http.StatusBadRequest, "missing required fields", httpx.CodeBadRequest)
		return
	}

	clientA, err := base64.StdEncoding.DecodeString(req.ClientPublicA)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid clientPublicA encoding", httpx.CodeBadRequest)
		return
	}
	// SRP-6a public keys are big-integer values; legitimate sizes are 32-512 bytes.
	// Reject undersized or oversized payloads.
	if len(clientA) < 32 || len(clientA) > 512 {
		httpx.WriteError(w, http.StatusBadRequest, "clientPublicA length out of range", httpx.CodeBadRequest)
		return
	}
	clientM1, err := base64.StdEncoding.DecodeString(req.ClientProofM1)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid clientProofM1 encoding", httpx.CodeBadRequest)
		return
	}
	if len(clientM1) < 32 || len(clientM1) > 512 {
		httpx.WriteError(w, http.StatusBadRequest, "clientProofM1 length out of range", httpx.CodeBadRequest)
		return
	}

	ipAddress := appmw.ClientIP(r)
	userAgent := r.UserAgent()

	resp, err := h.authService.LoginVerify(r.Context(), req.Email, clientA, clientM1, ipAddress, userAgent)
	if err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid credentials", httpx.CodeInvalidCredentials)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) LoginVerifyTOTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email          string `json:"email"`
		Code           string `json:"code"`
		LoginChallenge string `json:"loginChallenge"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Email == "" || req.Code == "" || req.LoginChallenge == "" {
		httpx.WriteError(w, http.StatusBadRequest, "missing required fields", httpx.CodeBadRequest)
		return
	}
	if len(req.Code) > 16 || len(req.LoginChallenge) > 128 {
		httpx.WriteError(w, http.StatusBadRequest, "field length exceeds limit", httpx.CodeBadRequest)
		return
	}

	ipAddress := appmw.ClientIP(r)
	userAgent := r.UserAgent()

	resp, err := h.authService.LoginVerifyTOTP(r.Context(), req.Email, req.LoginChallenge, req.Code, ipAddress, userAgent)
	if err != nil {
		if !errors.Is(err, service.ErrInvalidCredentials) {
			slog.Error("totp login verify failed", "error", err)
		}
		// Same vague answer for every failure: never reveal whether the
		// challenge, the account state or the code was the problem.
		httpx.WriteError(w, http.StatusUnauthorized, "invalid credentials", httpx.CodeInvalidCredentials)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	header := r.Header.Get("Authorization")
	token, _ := strings.CutPrefix(header, "Bearer ")
	if token == "" {
		httpx.WriteError(w, http.StatusBadRequest, "missing bearer token", httpx.CodeBadRequest)
		return
	}

	tokenHash, err := auth.HashToken(token)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid token", httpx.CodeBadRequest)
		return
	}

	// Scope deletion to the authenticated user to prevent cross-session logout
	if err := h.authService.LogoutScoped(r.Context(), tokenHash, userID); err != nil {
		writeInternal(w, err, "logout failed", "logout failed")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

// ListSessions returns all active sessions for the current user.
func (h *AuthHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	sessions, err := h.authService.ListSessions(r.Context(), userID)
	if err != nil {
		writeInternal(w, err, "list sessions failed", "Failed to list sessions")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{"sessions": sessions})
}

// RevokeSession deletes a specific session.
func (h *AuthHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	sessionID := chi.URLParam(r, "sessionId")
	if sessionID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "Missing session ID", httpx.CodeBadRequest)
		return
	}

	sid, err := uuid.Parse(sessionID)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid session ID", httpx.CodeBadRequest)
		return
	}

	if err := h.authService.RevokeSession(r.Context(), sid, userID); err != nil {
		writeInternal(w, err, "revoke session failed", "Failed to revoke session")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

// RevokeAllSessions deletes all sessions for the current user.
func (h *AuthHandler) RevokeAllSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	if err := h.authService.RevokeAllSessions(r.Context(), userID); err != nil {
		writeInternal(w, err, "revoke all sessions failed", "Failed to revoke sessions")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "all sessions revoked"})
}
