package handler

import (
	"errors"
	"net/http"
	"strings"

	"auth-box-api/internal/httpx"
	"auth-box-api/internal/service"
)

type TOTPHandler struct {
	totpService *service.TOTPService
	audit       auditRecorder
}

func NewTOTPHandler(totpService *service.TOTPService, audit auditRecorder) *TOTPHandler {
	return &TOTPHandler{totpService: totpService, audit: audit}
}

func (h *TOTPHandler) Status(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	enabled, err := h.totpService.IsEnabled(r.Context(), userID)
	if err != nil {
		writeInternal(w, err, "Failed to check TOTP status", "Failed to check TOTP status")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"enabled": enabled})
}

func (h *TOTPHandler) Enroll(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	resp, err := h.totpService.Enroll(r.Context(), userID)
	if err != nil {
		writeTOTPError(w, err, "enroll TOTP")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *TOTPHandler) Verify(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	newlyEnabled, err := h.totpService.Verify(r.Context(), userID, req.Code)
	if err != nil {
		writeTOTPError(w, err, "verify TOTP")
		return
	}
	if newlyEnabled {
		recordAudit(h.audit, r, userID, "totp.enable", "user", userID.String())
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "totp_enabled"})
}

func (h *TOTPHandler) Disable(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}

	if err := h.totpService.Disable(r.Context(), userID, req.Code); err != nil {
		writeTOTPError(w, err, "disable TOTP")
		return
	}
	recordAudit(h.audit, r, userID, "totp.disable", "user", userID.String())

	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "totp_disabled"})
}

// writeTOTPError shows user-actionable TOTP errors with 400 and hides
// everything else behind a logged, generic 500.
func writeTOTPError(w http.ResponseWriter, err error, op string) {
	if errors.Is(err, service.ErrTOTPInput) {
		httpx.WriteError(w, http.StatusBadRequest, strings.TrimPrefix(err.Error(), service.ErrTOTPInput.Error()+": "), httpx.CodeTOTP)
		return
	}
	writeInternal(w, err, op+" failed", "failed to "+op)
}
