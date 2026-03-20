package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/domain"
	"auth-box-api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type ConnectionHandler struct {
	connService *service.ConnectionService
}

func NewConnectionHandler(connService *service.ConnectionService) *ConnectionHandler {
	return &ConnectionHandler{connService: connService}
}

func (h *ConnectionHandler) CreateConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	var req service.CreateConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Provider == "" {
		writeError(w, http.StatusBadRequest, "provider is required", "BAD_REQUEST")
		return
	}
	if len(req.Provider) > 64 {
		writeError(w, http.StatusBadRequest, "provider exceeds 64 characters", "BAD_REQUEST")
		return
	}
	if req.AccessTokenEnc == "" || req.AccessTokenNonce == "" || req.AccessTokenTag == "" {
		writeError(w, http.StatusBadRequest, "access token encryption fields are required", "BAD_REQUEST")
		return
	}

	resp, err := h.connService.CreateConnection(r.Context(), userID, req)
	if err != nil {
		slog.Error("create connection failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create connection", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

func (h *ConnectionHandler) ListConnections(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	conns, err := h.connService.ListConnections(r.Context(), userID)
	if err != nil {
		slog.Error("list connections failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list connections", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"connections": conns,
	})
}

func (h *ConnectionHandler) GetConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	connID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid connection id", "BAD_REQUEST")
		return
	}

	resp, err := h.connService.GetConnection(r.Context(), connID, userID)
	if err != nil {
		slog.Error("get connection failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to get connection", "INTERNAL_ERROR")
		return
	}
	if resp == nil {
		writeError(w, http.StatusNotFound, "connection not found", "NOT_FOUND")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *ConnectionHandler) UpdateConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	connID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid connection id", "BAD_REQUEST")
		return
	}

	var req service.UpdateConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if err := h.connService.UpdateConnection(r.Context(), connID, userID, req); err != nil {
		if errors.Is(err, domain.ErrConnectionNotFound) {
			writeError(w, http.StatusNotFound, "connection not found", "NOT_FOUND")
			return
		}
		slog.Error("update connection failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update connection", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *ConnectionHandler) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	connID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid connection id", "BAD_REQUEST")
		return
	}

	if err := h.connService.DeleteConnection(r.Context(), connID, userID); err != nil {
		if errors.Is(err, domain.ErrConnectionNotFound) {
			writeError(w, http.StatusNotFound, "connection not found", "NOT_FOUND")
			return
		}
		slog.Error("delete connection failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete connection", "INTERNAL_ERROR")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
