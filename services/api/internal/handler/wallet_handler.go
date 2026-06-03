package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type WalletHandler struct {
	walletService *service.WalletService
}

func NewWalletHandler(walletService *service.WalletService) *WalletHandler {
	return &WalletHandler{walletService: walletService}
}

func (h *WalletHandler) CreateAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	var req service.CreateWalletAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	// Reject off-vocabulary enums with 400 (not 500), matching the shared/Zod
	// vocabularies. Validation lives here so bad input never reaches the DB.
	if !service.IsValidCoin(req.Coin) {
		writeError(w, http.StatusBadRequest, "invalid coin", "BAD_REQUEST")
		return
	}
	if req.Network != "" && !service.IsValidNetwork(req.Network) {
		writeError(w, http.StatusBadRequest, "invalid network", "BAD_REQUEST")
		return
	}
	if req.Coin == "btc" && req.ScriptType != "" && !service.IsValidBtcScriptType(req.ScriptType) {
		writeError(w, http.StatusBadRequest, "invalid scriptType", "BAD_REQUEST")
		return
	}
	if req.DerivationPath == "" || req.XPub == "" {
		writeError(w, http.StatusBadRequest, "derivationPath and xpub are required", "BAD_REQUEST")
		return
	}
	if len(req.XPub) > 256 || len(req.Label) > 255 {
		writeError(w, http.StatusBadRequest, "field exceeds maximum length", "BAD_REQUEST")
		return
	}

	resp, err := h.walletService.CreateAccount(r.Context(), userID, req)
	if err != nil {
		slog.Error("create wallet account failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create wallet account", "INTERNAL_ERROR")
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (h *WalletHandler) ListAccounts(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}
	accounts, err := h.walletService.ListAccounts(r.Context(), userID)
	if err != nil {
		slog.Error("list wallet accounts failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list wallet accounts", "INTERNAL_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"accounts": accounts})
}

func (h *WalletHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid account id", "BAD_REQUEST")
		return
	}
	if err := h.walletService.DeleteAccount(r.Context(), id, userID); err != nil {
		if service.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "wallet account not found", "NOT_FOUND")
			return
		}
		slog.Error("delete wallet account failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to delete wallet account", "INTERNAL_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"deleted": true})
}

func (h *WalletHandler) AddAddress(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid account id", "BAD_REQUEST")
		return
	}

	var req service.AddAddressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Address == "" || req.PublicKey == "" || req.DerivationPath == "" {
		writeError(w, http.StatusBadRequest, "address, publicKey and derivationPath are required", "BAD_REQUEST")
		return
	}
	if req.Change != 0 && req.Change != 1 {
		writeError(w, http.StatusBadRequest, "change must be 0 or 1", "BAD_REQUEST")
		return
	}

	resp, err := h.walletService.AddAddress(r.Context(), id, userID, req)
	if err != nil {
		if service.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "wallet account not found", "NOT_FOUND")
			return
		}
		slog.Error("add wallet address failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to add wallet address", "INTERNAL_ERROR")
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (h *WalletHandler) ListAddresses(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid account id", "BAD_REQUEST")
		return
	}
	addrs, err := h.walletService.ListAddresses(r.Context(), id, userID)
	if err != nil {
		if service.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "wallet account not found", "NOT_FOUND")
			return
		}
		slog.Error("list wallet addresses failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list wallet addresses", "INTERNAL_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"addresses": addrs})
}

func (h *WalletHandler) Balance(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid account id", "BAD_REQUEST")
		return
	}
	bal, err := h.walletService.RefreshBalance(r.Context(), id, userID)
	if err != nil {
		if service.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "wallet account not found", "NOT_FOUND")
			return
		}
		slog.Error("refresh wallet balance failed", "error", err)
		writeError(w, http.StatusBadGateway, "failed to fetch balance from indexer", "UPSTREAM_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, bal)
}
