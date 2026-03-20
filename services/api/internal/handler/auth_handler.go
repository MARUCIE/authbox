package handler

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"auth-box-api/internal/auth"
	appmw "auth-box-api/internal/middleware"
	"auth-box-api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req service.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Email == "" || req.SRPSalt == "" || req.SRPVerifier == "" || req.EncryptedVaultKey == "" {
		writeError(w, http.StatusBadRequest, "missing required fields", "BAD_REQUEST")
		return
	}
	// Basic email format check (contains @ with non-empty local and domain parts).
	if atIdx := strings.Index(req.Email, "@"); atIdx < 1 || atIdx >= len(req.Email)-1 || !strings.Contains(req.Email[atIdx+1:], ".") {
		writeError(w, http.StatusBadRequest, "invalid email format", "BAD_REQUEST")
		return
	}

	// String length bounds to prevent abuse.
	if len(req.Email) > 254 || len(req.SRPSalt) > 1024 || len(req.SRPVerifier) > 4096 || len(req.EncryptedVaultKey) > 4096 {
		writeError(w, http.StatusBadRequest, "field length exceeds limit", "BAD_REQUEST")
		return
	}

	resp, err := h.authService.Register(r.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrEmailExists) {
			writeError(w, http.StatusConflict, "email already registered", "EMAIL_EXISTS")
			return
		}
		slog.Error("register failed", "error", err)
		writeError(w, http.StatusInternalServerError, "registration failed", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

// loginVerifyRequest extends the service request to also include clientPublicA.
type loginVerifyRequest struct {
	Email         string `json:"email"`
	ClientPublicA string `json:"clientPublicA"`
	ClientProofM1 string `json:"clientProofM1"`
}

func (h *AuthHandler) LoginInit(w http.ResponseWriter, r *http.Request) {
	var req service.LoginInitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Email == "" || req.ClientPublicA == "" {
		writeError(w, http.StatusBadRequest, "missing required fields", "BAD_REQUEST")
		return
	}

	resp, err := h.authService.LoginInit(r.Context(), req)
	if err != nil {
		// Don't reveal whether user exists
		writeError(w, http.StatusUnauthorized, "invalid credentials", "INVALID_CREDENTIALS")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) LoginVerify(w http.ResponseWriter, r *http.Request) {
	var req loginVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Email == "" || req.ClientPublicA == "" || req.ClientProofM1 == "" {
		writeError(w, http.StatusBadRequest, "missing required fields", "BAD_REQUEST")
		return
	}

	clientA, err := base64.StdEncoding.DecodeString(req.ClientPublicA)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid clientPublicA encoding", "BAD_REQUEST")
		return
	}
	// SRP-6a public keys are big-integer values; legitimate sizes are 32-512 bytes.
	// Reject undersized or oversized payloads.
	if len(clientA) < 32 || len(clientA) > 512 {
		writeError(w, http.StatusBadRequest, "clientPublicA length out of range", "BAD_REQUEST")
		return
	}
	clientM1, err := base64.StdEncoding.DecodeString(req.ClientProofM1)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid clientProofM1 encoding", "BAD_REQUEST")
		return
	}
	if len(clientM1) < 32 || len(clientM1) > 512 {
		writeError(w, http.StatusBadRequest, "clientProofM1 length out of range", "BAD_REQUEST")
		return
	}

	ipAddress := appmw.ClientIP(r)
	userAgent := r.UserAgent()

	resp, err := h.authService.LoginVerify(r.Context(), req.Email, clientA, clientM1, ipAddress, userAgent)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials", "INVALID_CREDENTIALS")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	header := r.Header.Get("Authorization")
	token, _ := strings.CutPrefix(header, "Bearer ")
	if token == "" {
		writeError(w, http.StatusBadRequest, "missing bearer token", "BAD_REQUEST")
		return
	}

	tokenHash, err := auth.HashToken(token)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid token", "BAD_REQUEST")
		return
	}

	if err := h.authService.Logout(r.Context(), tokenHash); err != nil {
		slog.Error("logout failed", "error", err)
		writeError(w, http.StatusInternalServerError, "logout failed", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

// ListSessions returns all active sessions for the current user.
func (h *AuthHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Not authenticated", "UNAUTHORIZED")
		return
	}

	sessions, err := h.authService.ListSessions(r.Context(), userID)
	if err != nil {
		slog.Error("list sessions failed", "error", err)
		writeError(w, http.StatusInternalServerError, "Failed to list sessions", "INTERNAL")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"sessions": sessions})
}

// RevokeSession deletes a specific session.
func (h *AuthHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Not authenticated", "UNAUTHORIZED")
		return
	}

	sessionID := chi.URLParam(r, "sessionId")
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "Missing session ID", "BAD_REQUEST")
		return
	}

	sid, err := uuid.Parse(sessionID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid session ID", "BAD_REQUEST")
		return
	}

	if err := h.authService.RevokeSession(r.Context(), sid, userID); err != nil {
		slog.Error("revoke session failed", "error", err)
		writeError(w, http.StatusInternalServerError, "Failed to revoke session", "INTERNAL")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

// RevokeAllSessions deletes all sessions for the current user.
func (h *AuthHandler) RevokeAllSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Not authenticated", "UNAUTHORIZED")
		return
	}

	if err := h.authService.RevokeAllSessions(r.Context(), userID); err != nil {
		slog.Error("revoke all sessions failed", "error", err)
		writeError(w, http.StatusInternalServerError, "Failed to revoke sessions", "INTERNAL")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "all sessions revoked"})
}
