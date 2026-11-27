// Package httpx owns the API's wire format for responses: the JSON envelope,
// its content type and the error codes. Every layer that answers a request
// (handlers, auth middleware, rate limiter, security middleware) writes
// through it, so the error shape cannot drift between them.
//
// httpx imports nothing from this module; it sits below every other
// internal package (enforced by internal/archtest).
package httpx

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// Error codes carried in the "code" field of every error response.
const (
	CodeBadRequest         = "BAD_REQUEST"
	CodeUnauthorized       = "UNAUTHORIZED"
	CodeInvalidCredentials = "INVALID_CREDENTIALS"
	CodeNotFound           = "NOT_FOUND"
	CodeConflict           = "CONFLICT"
	CodeEmailExists        = "EMAIL_EXISTS"
	CodeTOTP               = "TOTP_ERROR"
	CodeRateLimited        = "RATE_LIMITED"
	CodeInvalidContentType = "INVALID_CONTENT_TYPE"
	CodeUpstream           = "UPSTREAM_ERROR"
	CodeInternal           = "INTERNAL_ERROR"
)

// ErrorBody is the error envelope: {"error": message, "code": code}.
type ErrorBody struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

// WriteJSON answers with status and data encoded as JSON.
func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		slog.Error("failed to write JSON response", "error", err)
	}
}

// WriteError answers with status and the error envelope.
func WriteError(w http.ResponseWriter, status int, message, code string) {
	WriteJSON(w, status, ErrorBody{Error: message, Code: code})
}
