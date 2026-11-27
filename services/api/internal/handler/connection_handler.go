package handler

import (
	"errors"
	"net/http"

	"auth-box-api/internal/domain"
	"auth-box-api/internal/httpx"
	"auth-box-api/internal/service"
)

// writeConnectionError maps connection-service errors: client mistakes become
// 400 or 409, a missing row 404, anything else a logged 500.
func writeConnectionError(w http.ResponseWriter, err error, op string) {
	switch {
	case errors.Is(err, service.ErrInvalidConnection):
		httpx.WriteError(w, http.StatusBadRequest, err.Error(), httpx.CodeBadRequest)
	case errors.Is(err, domain.ErrConflict):
		httpx.WriteError(w, http.StatusConflict, "this provider account is already connected", httpx.CodeConflict)
	case errors.Is(err, domain.ErrConnectionNotFound):
		httpx.WriteError(w, http.StatusNotFound, "connection not found", httpx.CodeNotFound)
	default:
		writeInternal(w, err, op+" failed", "failed to "+op)
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
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	var req service.CreateConnectionRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	resp, err := h.connService.CreateConnection(r.Context(), userID, req)
	if err != nil {
		writeConnectionError(w, err, "create connection")
		return
	}

	recordAudit(h.audit, r, userID, "connection.create", "connection", resp.ID)
	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (h *ConnectionHandler) ListConnections(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	conns, err := h.connService.ListConnections(r.Context(), userID)
	if err != nil {
		writeInternal(w, err, "list connections failed", "failed to list connections")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"connections": conns,
	})
}

func (h *ConnectionHandler) GetConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	connID, ok := uuidParam(w, r, "id", "invalid connection id")
	if !ok {
		return
	}

	resp, err := h.connService.GetConnection(r.Context(), connID, userID)
	if err != nil {
		writeConnectionError(w, err, "get connection")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *ConnectionHandler) UpdateConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	connID, ok := uuidParam(w, r, "id", "invalid connection id")
	if !ok {
		return
	}

	var req service.UpdateConnectionRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if err := h.connService.UpdateConnection(r.Context(), connID, userID, req); err != nil {
		writeConnectionError(w, err, "update connection")
		return
	}
	recordAudit(h.audit, r, userID, "connection.update", "connection", connID.String())

	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *ConnectionHandler) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	connID, ok := uuidParam(w, r, "id", "invalid connection id")
	if !ok {
		return
	}

	if err := h.connService.DeleteConnection(r.Context(), connID, userID); err != nil {
		if errors.Is(err, domain.ErrConnectionNotFound) {
			httpx.WriteError(w, http.StatusNotFound, "connection not found", httpx.CodeNotFound)
			return
		}
		writeInternal(w, err, "delete connection failed", "failed to delete connection")
		return
	}
	recordAudit(h.audit, r, userID, "connection.delete", "connection", connID.String())

	w.WriteHeader(http.StatusNoContent)
}
