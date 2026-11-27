package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Request-boundary helpers. Each one either returns the parsed value or has
// already written the error response, in which case the handler returns.

// requireUser returns the authenticated user id set by auth.Middleware.
func requireUser(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", httpx.CodeUnauthorized)
	}
	return userID, ok
}

// uuidParam parses the chi URL parameter name as a UUID; invalidMsg is the
// 400 message when it is not one.
func uuidParam(w http.ResponseWriter, r *http.Request, name, invalidMsg string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, invalidMsg, httpx.CodeBadRequest)
		return uuid.Nil, false
	}
	return id, true
}

// decodeJSON decodes the request body into dst.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body", httpx.CodeBadRequest)
		return false
	}
	return true
}

// writeInternal logs err and answers a 500 that reveals nothing about it.
func writeInternal(w http.ResponseWriter, err error, logMsg, clientMsg string) {
	slog.Error(logMsg, "error", err)
	httpx.WriteError(w, http.StatusInternalServerError, clientMsg, httpx.CodeInternal)
}
