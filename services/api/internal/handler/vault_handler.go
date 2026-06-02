package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"errors"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/domain"
	"auth-box-api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// parsePaginationParam reads an integer query parameter and clamps it to [0, max].
// Returns defaultVal if the parameter is missing or unparseable.
func parsePaginationParam(r *http.Request, key string, defaultVal, max int) int {
	s := r.URL.Query().Get(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil || v < 0 {
		return defaultVal
	}
	if v > max {
		return max
	}
	return v
}

type VaultHandler struct {
	vaultService *service.VaultService
}

func NewVaultHandler(vaultService *service.VaultService) *VaultHandler {
	return &VaultHandler{vaultService: vaultService}
}

func (h *VaultHandler) GetVaultKey(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	resp, err := h.vaultService.GetVaultKey(r.Context(), userID)
	if err != nil {
		slog.Error("get vault key failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to get vault key", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *VaultHandler) SyncPull(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	sinceVersion := 0
	if v := r.URL.Query().Get("sinceVersion"); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "sinceVersion must be an integer", "BAD_REQUEST")
			return
		}
		if parsed < 0 {
			parsed = 0
		}
		sinceVersion = parsed
	}

	limit := parsePaginationParam(r, "limit", 500, 1000)

	items, err := h.vaultService.SyncPull(r.Context(), userID, sinceVersion, limit)
	if err != nil {
		slog.Error("sync pull failed", "error", err)
		writeError(w, http.StatusInternalServerError, "sync pull failed", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items":   items,
		"hasMore": len(items) == limit,
	})
}

func (h *VaultHandler) SyncPush(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	var req service.SyncPushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if len(req.Items) == 0 {
		writeError(w, http.StatusBadRequest, "items array is empty", "BAD_REQUEST")
		return
	}
	if len(req.Items) > 500 {
		writeError(w, http.StatusBadRequest, "too many items (max 500 per sync)", "BAD_REQUEST")
		return
	}

	results, err := h.vaultService.SyncPush(r.Context(), userID, req)
	if err != nil {
		slog.Error("sync push failed", "error", err)
		writeError(w, http.StatusInternalServerError, "sync push failed", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items": results,
	})
}

func (h *VaultHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	limit := parsePaginationParam(r, "limit", 100, 500)
	offset := parsePaginationParam(r, "offset", 0, 5000)

	items, err := h.vaultService.ListItems(r.Context(), userID, limit, offset)
	if err != nil {
		slog.Error("list items failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list items", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items":  items,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *VaultHandler) CreateItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	var req service.ItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.EncryptedData == "" || req.Nonce == "" || req.Tag == "" {
		writeError(w, http.StatusBadRequest, "missing required fields", "BAD_REQUEST")
		return
	}

	if req.ItemType != "" && !service.IsValidItemType(req.ItemType) {
		writeError(w, http.StatusBadRequest, "invalid itemType", "BAD_REQUEST")
		return
	}

	resp, err := h.vaultService.CreateItem(r.Context(), userID, req)
	if err != nil {
		slog.Error("create item failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create item", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

func (h *VaultHandler) GetItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	itemID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id", "BAD_REQUEST")
		return
	}

	resp, err := h.vaultService.GetItem(r.Context(), itemID, userID)
	if err != nil {
		slog.Error("get item failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to get item", "INTERNAL_ERROR")
		return
	}
	if resp == nil {
		writeError(w, http.StatusNotFound, "item not found", "NOT_FOUND")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *VaultHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	itemID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id", "BAD_REQUEST")
		return
	}

	var req service.ItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if err := h.vaultService.UpdateItem(r.Context(), itemID, userID, req); err != nil {
		if errors.Is(err, domain.ErrItemNotFound) {
			writeError(w, http.StatusNotFound, "item not found", "NOT_FOUND")
			return
		}
		slog.Error("update item failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update item", "INTERNAL_ERROR")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *VaultHandler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	itemID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid item id", "BAD_REQUEST")
		return
	}

	if err := h.vaultService.DeleteItem(r.Context(), itemID, userID); err != nil {
		if errors.Is(err, domain.ErrItemNotFound) {
			writeError(w, http.StatusNotFound, "item not found", "NOT_FOUND")
			return
		}
		slog.Error("delete item failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete item", "INTERNAL_ERROR")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
