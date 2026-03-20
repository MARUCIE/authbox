package handler

import (
	"encoding/json"
	"net/http"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/service"
)

type TOTPHandler struct {
	totpService *service.TOTPService
}

func NewTOTPHandler(totpService *service.TOTPService) *TOTPHandler {
	return &TOTPHandler{totpService: totpService}
}

func (h *TOTPHandler) Status(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Not authenticated", "UNAUTHORIZED")
		return
	}

	enabled, err := h.totpService.IsEnabled(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to check TOTP status", "INTERNAL")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"enabled": enabled})
}

func (h *TOTPHandler) Enroll(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Not authenticated", "UNAUTHORIZED")
		return
	}

	resp, err := h.totpService.Enroll(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error(), "TOTP_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *TOTPHandler) Verify(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Not authenticated", "UNAUTHORIZED")
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if err := h.totpService.Verify(r.Context(), userID, req.Code); err != nil {
		writeError(w, http.StatusBadRequest, err.Error(), "TOTP_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "totp_enabled"})
}

func (h *TOTPHandler) Disable(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "Not authenticated", "UNAUTHORIZED")
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if err := h.totpService.Disable(r.Context(), userID, req.Code); err != nil {
		writeError(w, http.StatusBadRequest, err.Error(), "TOTP_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "totp_disabled"})
}
