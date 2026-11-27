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

// writeConnectionError maps connection-service errors: client mistakes become
// 400 or 409, a missing row 404, anything else a logged 500.
func writeConnectionError(w http.ResponseWriter, err error, op string) {
	switch {
	case errors.Is(err, service.ErrInvalidConnection):
		writeError(w, http.StatusBadRequest, err.Error(), "BAD_REQUEST")
	case errors.Is(err, domain.ErrConflict):
		writeError(w, http.StatusConflict, "this provider account is already connected", "CONFLICT")
	case errors.Is(err, domain.ErrConnectionNotFound):
		writeError(w, http.StatusNotFound, "connection not found", "NOT_FOUND")
	default:
		slog.Error(op+" failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to "+op, "INTERNAL_ERROR")
	}
}

type ConnectionHandler struct {
	connService *service.ConnectionService
	audit       auditRecorder
}

func NewConnectionHandler(connService *service.ConnectionService, audit auditRecorder) *ConnectionHandler {
	return &ConnectionHandler{connService: connService, audit: audit}
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

	resp, err := h.connService.CreateConnection(r.Context(), userID, req)
	if err != nil {
		writeConnectionError(w, err, "create connection")
		return
	}

	recordAudit(h.audit, r, userID, "connection.create", "connection", resp.ID)
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
		writeConnectionError(w, err, "update connection")
		return
	}
	recordAudit(h.audit, r, userID, "connection.update", "connection", connID.String())

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
	recordAudit(h.audit, r, userID, "connection.delete", "connection", connID.String())

	w.WriteHeader(http.StatusNoContent)
}
