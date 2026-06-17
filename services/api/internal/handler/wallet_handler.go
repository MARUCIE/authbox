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

func (h *WalletHandler) Broadcast(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}

	var req service.BroadcastRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	// Reject off-vocabulary / malformed input with 400 before any egress. The tx
	// itself is built+signed client-side; the backend only relays a valid payload.
	if !service.IsValidCoin(req.Coin) {
		writeError(w, http.StatusBadRequest, "invalid coin", "BAD_REQUEST")
		return
	}
	if req.Network != "" && !service.IsValidNetwork(req.Network) {
		writeError(w, http.StatusBadRequest, "invalid network", "BAD_REQUEST")
		return
	}
	if !service.IsWellFormedRawTxHex(req.RawTxHex) {
		writeError(w, http.StatusBadRequest, "rawTxHex must be even-length hex within size bounds", "BAD_REQUEST")
		return
	}

	resp, err := h.walletService.BroadcastTransaction(r.Context(), req.Coin, req.Network, req.RawTxHex)
	if err != nil {
		// A rejected/invalid transaction or an unreachable node both surface here;
		// the upstream message is the actionable signal, mapped to 502 like Balance.
		slog.Warn("wallet broadcast failed", "user", userID, "coin", req.Coin, "network", req.Network, "error", err)
		writeError(w, http.StatusBadGateway, "broadcast rejected: "+err.Error(), "UPSTREAM_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// txPrepNetwork pulls + validates the optional network query param (default
// mainnet). Returns ok=false after writing a 400 when the value is off-vocabulary.
func txPrepNetwork(w http.ResponseWriter, r *http.Request) (string, bool) {
	network := r.URL.Query().Get("network")
	if network != "" && !service.IsValidNetwork(network) {
		writeError(w, http.StatusBadRequest, "invalid network", "BAD_REQUEST")
		return "", false
	}
	return network, true
}

func (h *WalletHandler) BtcUTXOs(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.UserIDFromContext(r.Context()); !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}
	network, ok := txPrepNetwork(w, r)
	if !ok {
		return
	}
	address := r.URL.Query().Get("address")
	if address == "" {
		writeError(w, http.StatusBadRequest, "address is required", "BAD_REQUEST")
		return
	}
	utxos, err := h.walletService.BtcUTXOs(r.Context(), network, address)
	if err != nil {
		slog.Warn("btc utxo lookup failed", "error", err)
		writeError(w, http.StatusBadGateway, "failed to fetch utxos: "+err.Error(), "UPSTREAM_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"utxos": utxos})
}

func (h *WalletHandler) BtcFees(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.UserIDFromContext(r.Context()); !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}
	network, ok := txPrepNetwork(w, r)
	if !ok {
		return
	}
	fees, err := h.walletService.BtcFeeRates(r.Context(), network)
	if err != nil {
		slog.Warn("btc fee lookup failed", "error", err)
		writeError(w, http.StatusBadGateway, "failed to fetch fee rates: "+err.Error(), "UPSTREAM_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, fees)
}

func (h *WalletHandler) EthNonce(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.UserIDFromContext(r.Context()); !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}
	network, ok := txPrepNetwork(w, r)
	if !ok {
		return
	}
	address := r.URL.Query().Get("address")
	if address == "" {
		writeError(w, http.StatusBadRequest, "address is required", "BAD_REQUEST")
		return
	}
	nonce, err := h.walletService.EthNonce(r.Context(), network, address)
	if err != nil {
		slog.Warn("eth nonce lookup failed", "error", err)
		writeError(w, http.StatusBadGateway, "failed to fetch nonce: "+err.Error(), "UPSTREAM_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"nonce": nonce})
}

func (h *WalletHandler) EthGas(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.UserIDFromContext(r.Context()); !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "UNAUTHORIZED")
		return
	}
	network, ok := txPrepNetwork(w, r)
	if !ok {
		return
	}
	gas, err := h.walletService.EthGas(r.Context(), network)
	if err != nil {
		slog.Warn("eth gas lookup failed", "error", err)
		writeError(w, http.StatusBadGateway, "failed to fetch gas: "+err.Error(), "UPSTREAM_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, gas)
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
