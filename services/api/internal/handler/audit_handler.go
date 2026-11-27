package handler

import (
	"net/http"
	"strconv"

	"auth-box-api/internal/httpx"
	"auth-box-api/internal/service"
)

type AuditHandler struct {
	service *service.AuditService
}

func NewAuditHandler(service *service.AuditService) *AuditHandler {
	return &AuditHandler{service: service}
}

func (h *AuditHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 50
	offset := 0

	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil {
			limit = v
		}
	}
	if offsetStr != "" {
		if v, err := strconv.Atoi(offsetStr); err == nil {
			offset = v
		}
	}

	// Clamp pagination bounds to prevent abuse.
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	events, err := h.service.ListEvents(r.Context(), userID, limit, offset)
	if err != nil {
		writeInternal(w, err, "failed to list events", "failed to list events")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *AuditHandler) VerifyChain(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	result, err := h.service.VerifyChain(r.Context(), userID)
	if err != nil {
		writeInternal(w, err, "failed to verify chain", "failed to verify chain")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, result)
}
