package handler

import (
	"log/slog"
	"net/http"

	"auth-box-api/internal/httpx"
	"auth-box-api/internal/service"
)

type WalletHandler struct {
	walletService *service.WalletService
}

func NewWalletHandler(walletService *service.WalletService) *WalletHandler {
	return &WalletHandler{walletService: walletService}
}

func (h *WalletHandler) CreateAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	var req service.CreateWalletAccountRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	// Reject off-vocabulary enums with 400 (not 500), matching the shared/Zod
	// vocabularies. Validation lives here so bad input never reaches the DB.
	if !service.IsValidCoin(req.Coin) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid coin", httpx.CodeBadRequest)
		return
	}
	if req.Network != "" && !service.IsValidNetwork(req.Network) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid network", httpx.CodeBadRequest)
		return
	}
	if req.Coin == "btc" && req.ScriptType != "" && !service.IsValidBtcScriptType(req.ScriptType) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid scriptType", httpx.CodeBadRequest)
		return
	}
	if req.DerivationPath == "" || req.XPub == "" {
		httpx.WriteError(w, http.StatusBadRequest, "derivationPath and xpub are required", httpx.CodeBadRequest)
		return
	}
	if len(req.XPub) > 256 || len(req.Label) > 255 {
		httpx.WriteError(w, http.StatusBadRequest, "field exceeds maximum length", httpx.CodeBadRequest)
		return
	}

	resp, err := h.walletService.CreateAccount(r.Context(), userID, req)
	if err != nil {
		writeInternal(w, err, "create wallet account failed", "failed to create wallet account")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (h *WalletHandler) ListAccounts(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	accounts, err := h.walletService.ListAccounts(r.Context(), userID)
	if err != nil {
		writeInternal(w, err, "list wallet accounts failed", "failed to list wallet accounts")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{"accounts": accounts})
}

func (h *WalletHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	id, ok := uuidParam(w, r, "id", "invalid account id")
	if !ok {
		return
	}
	if err := h.walletService.DeleteAccount(r.Context(), id, userID); err != nil {
		if service.IsNotFound(err) {
			httpx.WriteError(w, http.StatusNotFound, "wallet account not found", httpx.CodeNotFound)
			return
		}
		writeInternal(w, err, "delete wallet account failed", "failed to delete wallet account")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{"deleted": true})
}

func (h *WalletHandler) AddAddress(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	id, ok := uuidParam(w, r, "id", "invalid account id")
	if !ok {
		return
	}

	var req service.AddAddressRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Address == "" || req.PublicKey == "" || req.DerivationPath == "" {
		httpx.WriteError(w, http.StatusBadRequest, "address, publicKey and derivationPath are required", httpx.CodeBadRequest)
		return
	}
	if req.Change != 0 && req.Change != 1 {
		httpx.WriteError(w, http.StatusBadRequest, "change must be 0 or 1", httpx.CodeBadRequest)
		return
	}

	resp, err := h.walletService.AddAddress(r.Context(), id, userID, req)
	if err != nil {
		if service.IsNotFound(err) {
			httpx.WriteError(w, http.StatusNotFound, "wallet account not found", httpx.CodeNotFound)
			return
		}
		writeInternal(w, err, "add wallet address failed", "failed to add wallet address")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (h *WalletHandler) ListAddresses(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	id, ok := uuidParam(w, r, "id", "invalid account id")
	if !ok {
		return
	}
	addrs, err := h.walletService.ListAddresses(r.Context(), id, userID)
	if err != nil {
		if service.IsNotFound(err) {
			httpx.WriteError(w, http.StatusNotFound, "wallet account not found", httpx.CodeNotFound)
			return
		}
		writeInternal(w, err, "list wallet addresses failed", "failed to list wallet addresses")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{"addresses": addrs})
}

func (h *WalletHandler) Broadcast(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	var req service.BroadcastRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	// Reject off-vocabulary / malformed input with 400 before any egress. The tx
	// itself is built+signed client-side; the backend only relays a valid payload.
	if !service.IsValidCoin(req.Coin) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid coin", httpx.CodeBadRequest)
		return
	}
	if req.Network != "" && !service.IsValidNetwork(req.Network) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid network", httpx.CodeBadRequest)
		return
	}
	if !service.IsWellFormedRawTxHex(req.RawTxHex) {
		httpx.WriteError(w, http.StatusBadRequest, "rawTxHex must be even-length hex within size bounds", httpx.CodeBadRequest)
		return
	}

	resp, err := h.walletService.BroadcastTransaction(r.Context(), req.Coin, req.Network, req.RawTxHex)
	if err != nil {
		// A rejected/invalid transaction or an unreachable node both surface here;
		// the upstream message is the actionable signal, mapped to 502 like Balance.
		slog.Warn("wallet broadcast failed", "user", userID, "coin", req.Coin, "network", req.Network, "error", err)
		httpx.WriteError(w, http.StatusBadGateway, "broadcast rejected: "+err.Error(), httpx.CodeUpstream)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

// txPrepNetwork pulls + validates the optional network query param (default
// mainnet). Returns ok=false after writing a 400 when the value is off-vocabulary.
func txPrepNetwork(w http.ResponseWriter, r *http.Request) (string, bool) {
	network := r.URL.Query().Get("network")
	if network != "" && !service.IsValidNetwork(network) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid network", httpx.CodeBadRequest)
		return "", false
	}
	return network, true
}

func (h *WalletHandler) BtcUTXOs(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireUser(w, r); !ok {
		return
	}
	network, ok := txPrepNetwork(w, r)
	if !ok {
		return
	}
	address := r.URL.Query().Get("address")
	if address == "" {
		httpx.WriteError(w, http.StatusBadRequest, "address is required", httpx.CodeBadRequest)
		return
	}
	utxos, err := h.walletService.BtcUTXOs(r.Context(), network, address)
	if err != nil {
		slog.Warn("btc utxo lookup failed", "error", err)
		httpx.WriteError(w, http.StatusBadGateway, "failed to fetch utxos: "+err.Error(), httpx.CodeUpstream)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{"utxos": utxos})
}

func (h *WalletHandler) BtcFees(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireUser(w, r); !ok {
		return
	}
	network, ok := txPrepNetwork(w, r)
	if !ok {
		return
	}
	fees, err := h.walletService.BtcFeeRates(r.Context(), network)
	if err != nil {
		slog.Warn("btc fee lookup failed", "error", err)
		httpx.WriteError(w, http.StatusBadGateway, "failed to fetch fee rates: "+err.Error(), httpx.CodeUpstream)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, fees)
}

func (h *WalletHandler) EthNonce(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireUser(w, r); !ok {
		return
	}
	network, ok := txPrepNetwork(w, r)
	if !ok {
		return
	}
	address := r.URL.Query().Get("address")
	if address == "" {
		httpx.WriteError(w, http.StatusBadRequest, "address is required", httpx.CodeBadRequest)
		return
	}
	nonce, err := h.walletService.EthNonce(r.Context(), network, address)
	if err != nil {
		slog.Warn("eth nonce lookup failed", "error", err)
		httpx.WriteError(w, http.StatusBadGateway, "failed to fetch nonce: "+err.Error(), httpx.CodeUpstream)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]interface{}{"nonce": nonce})
}

func (h *WalletHandler) EthGas(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireUser(w, r); !ok {
		return
	}
	network, ok := txPrepNetwork(w, r)
	if !ok {
		return
	}
	gas, err := h.walletService.EthGas(r.Context(), network)
	if err != nil {
		slog.Warn("eth gas lookup failed", "error", err)
		httpx.WriteError(w, http.StatusBadGateway, "failed to fetch gas: "+err.Error(), httpx.CodeUpstream)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, gas)
}

func (h *WalletHandler) Balance(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	id, ok := uuidParam(w, r, "id", "invalid account id")
	if !ok {
		return
	}
	bal, err := h.walletService.RefreshBalance(r.Context(), id, userID)
	if err != nil {
		if service.IsNotFound(err) {
			httpx.WriteError(w, http.StatusNotFound, "wallet account not found", httpx.CodeNotFound)
			return
		}
		slog.Error("refresh wallet balance failed", "error", err)
		httpx.WriteError(w, http.StatusBadGateway, "failed to fetch balance from indexer", httpx.CodeUpstream)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, bal)
}
