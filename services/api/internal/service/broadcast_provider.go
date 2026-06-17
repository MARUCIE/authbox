package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// BroadcastProvider relays a client-built, client-SIGNED raw transaction to a
// fixed public node and returns the resulting txid. It is the write-side mirror
// of BalanceProvider's read-side balance lookups.
//
// Trust model: this service NEVER holds or touches key material — signing happens
// entirely client-side; the backend only forwards an already-signed rawTxHex.
// SSRF is prevented the same two ways as BalanceProvider: the node base URL is
// chosen from the same fixed (coin, network) maps (never user input), and the
// payload is a hex-charset-validated, length-bounded body — never spliced into a
// URL. Mainnet money movement is gated CLIENT-side (explicit double-confirm);
// this relay is network-agnostic and carries no extra mainnet privilege.
type BroadcastProvider struct {
	client *http.Client
}

func NewBroadcastProvider() *BroadcastProvider {
	return &BroadcastProvider{client: &http.Client{Timeout: 15 * time.Second}}
}

// rawTxHexRe guards the charset only; the real validity check is the upstream
// node's mempool/consensus acceptance. Bounds keep an oversized body from ever
// reaching egress: 20 hex chars (10 bytes) floor, 200_000 (100 KB) ceiling —
// well above any standard transaction, well below a memory-abuse payload.
var rawTxHexRe = regexp.MustCompile(`^[0-9a-fA-F]+$`)

const (
	rawTxMinHex = 20
	rawTxMaxHex = 200_000
)

// IsWellFormedRawTxHex reports whether raw is a plausibly-shaped signed-tx hex
// payload (optional 0x prefix, even-length hex, within size bounds). Handlers use
// it to reject malformed input with 400 before any relay attempt; the provider
// re-validates as defense-in-depth.
func IsWellFormedRawTxHex(raw string) bool {
	h := strings.TrimSpace(raw)
	h = strings.TrimPrefix(h, "0x")
	h = strings.TrimPrefix(h, "0X")
	return len(h) >= rawTxMinHex && len(h) <= rawTxMaxHex && len(h)%2 == 0 && rawTxHexRe.MatchString(h)
}

// normalizeRawTx validates the hex payload and shapes it for the target node:
// Ethereum's JSON-RPC wants a 0x prefix, mempool.space's /tx wants bare hex.
func normalizeRawTx(coin, raw string) (string, error) {
	h := strings.TrimSpace(raw)
	h = strings.TrimPrefix(h, "0x")
	h = strings.TrimPrefix(h, "0X")
	if len(h) < rawTxMinHex {
		return "", fmt.Errorf("rawTxHex too short")
	}
	if len(h) > rawTxMaxHex {
		return "", fmt.Errorf("rawTxHex too long")
	}
	if len(h)%2 != 0 {
		return "", fmt.Errorf("rawTxHex must be even-length")
	}
	if !rawTxHexRe.MatchString(h) {
		return "", fmt.Errorf("rawTxHex must be hexadecimal")
	}
	switch coin {
	case "eth":
		return "0x" + strings.ToLower(h), nil
	case "btc":
		return strings.ToLower(h), nil
	default:
		return "", fmt.Errorf("unsupported coin %q", coin)
	}
}

// Broadcast submits a signed raw transaction and returns its txid. coin and
// network MUST already be vocabulary-validated by the caller (handler returns
// 400 for off-vocabulary input); this method re-resolves the endpoint from the
// fixed map and fails closed on an unknown key.
func (p *BroadcastProvider) Broadcast(ctx context.Context, coin, network, rawTxHex string) (string, error) {
	if network == "" {
		network = "mainnet"
	}
	payload, err := normalizeRawTx(coin, rawTxHex)
	if err != nil {
		return "", err
	}
	switch coin {
	case "btc":
		return p.btcBroadcast(ctx, network, payload)
	case "eth":
		return p.ethBroadcast(ctx, network, payload)
	default:
		return "", fmt.Errorf("unsupported coin %q", coin)
	}
}

func (p *BroadcastProvider) btcBroadcast(ctx context.Context, network, rawHex string) (string, error) {
	base, ok := btcExplorerBase[network]
	if !ok {
		return "", fmt.Errorf("unsupported btc network %q", network)
	}
	// mempool.space: POST /tx with the bare raw hex as a text body; 200 returns
	// the txid as plain text, non-200 returns the rejection reason as text.
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/tx", strings.NewReader(rawHex))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "text/plain")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	txid := strings.TrimSpace(string(body))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("btc broadcast rejected (%d): %s", resp.StatusCode, txid)
	}
	if !isTxid64(txid) {
		return "", fmt.Errorf("btc broadcast returned unexpected body: %s", txid)
	}
	return txid, nil
}

func (p *BroadcastProvider) ethBroadcast(ctx context.Context, network, rawHex string) (string, error) {
	base, ok := ethRPCBase[network]
	if !ok {
		return "", fmt.Errorf("unsupported eth network %q", network)
	}
	reqBody, err := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "eth_sendRawTransaction",
		"params":  []string{rawHex},
		"id":      1,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base, strings.NewReader(string(reqBody)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("eth rpc status %d", resp.StatusCode)
	}
	var rpcResp struct {
		Result string `json:"result"`
		Error  *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return "", err
	}
	if rpcResp.Error != nil {
		return "", fmt.Errorf("eth broadcast rejected: %s", rpcResp.Error.Message)
	}
	if !isEthTxHash(rpcResp.Result) {
		return "", fmt.Errorf("eth broadcast returned unexpected result: %s", rpcResp.Result)
	}
	return rpcResp.Result, nil
}

// isTxid64 reports whether s is a 64-char hex string (a BTC/ETH txid sans prefix).
func isTxid64(s string) bool {
	if len(s) != 64 {
		return false
	}
	return rawTxHexRe.MatchString(s)
}

// isEthTxHash reports whether s is a 0x-prefixed 32-byte hash.
func isEthTxHash(s string) bool {
	return strings.HasPrefix(s, "0x") && isTxid64(strings.TrimPrefix(s, "0x"))
}
