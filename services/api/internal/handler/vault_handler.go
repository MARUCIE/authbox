package handler

import (
	"errors"
	"net/http"
	"strconv"

	"auth-box-api/internal/domain"
	"auth-box-api/internal/httpx"
	"auth-box-api/internal/service"
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

// writeVaultError maps vault-service errors: invalid input 400 with the
// service's message, a missing item 404, anything else a logged 500.
func writeVaultError(w http.ResponseWriter, err error, logMsg, clientMsg string) {
	switch {
	case errors.Is(err, service.ErrInvalidItem):
		httpx.WriteError(w, http.StatusBadRequest, err.Error(), httpx.CodeBadRequest)
	case errors.Is(err, domain.ErrItemNotFound):
		httpx.WriteError(w, http.StatusNotFound, "item not found", httpx.CodeNotFound)
	default:
		writeInternal(w, err, logMsg, clientMsg)
	}
}

type VaultHandler struct {
	vaultService *service.VaultService
}

func NewVaultHandler(vaultService *service.VaultService) *VaultHandler {
	return &VaultHandler{vaultService: vaultService}
}

func (h *VaultHandler) GetVaultKey(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	resp, err := h.vaultService.GetVaultKey(r.Context(), userID)
	if err != nil {
		writeInternal(w, err, "get vault key failed", "failed to get vault key")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *VaultHandler) SyncPull(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	sinceVersion := 0
	if v := r.URL.Query().Get("sinceVersion"); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "sinceVersion must be an integer", httpx.CodeBadRequest)
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
		writeInternal(w, err, "sync pull failed", "sync pull failed")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"items":   items,
		"hasMore": len(items) == limit,
	})
}

func (h *VaultHandler) SyncPush(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	var req service.SyncPushRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Items) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "items array is empty", httpx.CodeBadRequest)
		return
	}
	if len(req.Items) > 500 {
		httpx.WriteError(w, http.StatusBadRequest, "too many items (max 500 per sync)", httpx.CodeBadRequest)
		return
	}

	results, err := h.vaultService.SyncPush(r.Context(), userID, req)
	if err != nil {
		writeVaultError(w, err, "sync push failed", "sync push failed")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"items": results,
	})
}

func (h *VaultHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	limit := parsePaginationParam(r, "limit", 100, 500)
	offset := parsePaginationParam(r, "offset", 0, 100000)

	items, err := h.vaultService.ListItems(r.Context(), userID, limit, offset)
	if err != nil {
		writeInternal(w, err, "list items failed", "failed to list items")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"items":  items,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *VaultHandler) CreateItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	var req service.ItemRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.EncryptedData == "" || req.Nonce == "" || req.Tag == "" {
		httpx.WriteError(w, http.StatusBadRequest, "missing required fields", httpx.CodeBadRequest)
		return
	}

	if req.ItemType != "" && !service.IsValidItemType(req.ItemType) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid itemType", httpx.CodeBadRequest)
		return
	}

	resp, err := h.vaultService.CreateItem(r.Context(), userID, req)
	if err != nil {
		writeVaultError(w, err, "create item failed", "failed to create item")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (h *VaultHandler) GetItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	itemID, ok := uuidParam(w, r, "id", "invalid item id")
	if !ok {
		return
	}

	resp, err := h.vaultService.GetItem(r.Context(), itemID, userID)
	if err != nil {
		writeVaultError(w, err, "get item failed", "failed to get item")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *VaultHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	itemID, ok := uuidParam(w, r, "id", "invalid item id")
	if !ok {
		return
	}

	var req service.ItemRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if err := h.vaultService.UpdateItem(r.Context(), itemID, userID, req); err != nil {
		writeVaultError(w, err, "update item failed", "failed to update item")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *VaultHandler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	itemID, ok := uuidParam(w, r, "id", "invalid item id")
	if !ok {
		return
	}

	if err := h.vaultService.DeleteItem(r.Context(), itemID, userID); err != nil {
		writeVaultError(w, err, "delete item failed", "failed to delete item")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
