package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// TxPrepProvider supplies the read-only chain data a client needs to ASSEMBLE a
// transaction before signing it locally: BTC spendable UTXOs + a fee-rate
// recommendation, ETH account nonce + gas price. Like BalanceProvider it only
// ever sends PUBLIC addresses to the same fixed (coin, network) indexer hosts —
// no key material, no user-controlled URL (SSRF-safe), addresses format-checked.
//
// It is the read-side complement to BroadcastProvider's write side: TxPrep feeds
// wallet-tx.ts (BuildBtcTxParams.utxos / BuildEthTxParams.nonce+gas), the client
// signs, and BroadcastProvider relays the result.
type TxPrepProvider struct {
	client *http.Client
}

func NewTxPrepProvider() *TxPrepProvider {
	return &TxPrepProvider{client: &http.Client{Timeout: 12 * time.Second}}
}

// SpendableUTXO mirrors the fields wallet-tx.ts BtcSpendableUtxo needs. Value is
// a decimal string of satoshis because JSON numbers can't safely carry the full
// range the client parses to bigint.
type SpendableUTXO struct {
	Txid  string `json:"txid"`
	Vout  int    `json:"vout"`
	Value string `json:"value"`
}

// BtcFeeRates is mempool.space's /v1/fees/recommended (sat/vB tiers).
type BtcFeeRates struct {
	FastestFee  int `json:"fastestFee"`
	HalfHourFee int `json:"halfHourFee"`
	HourFee     int `json:"hourFee"`
	EconomyFee  int `json:"economyFee"`
	MinimumFee  int `json:"minimumFee"`
}

// EthGas carries the two EIP-1559 inputs the client needs (wei, decimal strings).
// SuggestedPriorityFee falls back to 1.5 gwei when the node lacks the dedicated
// RPC, so the client always gets a usable pair.
type EthGas struct {
	GasPrice             string `json:"gasPrice"`
	SuggestedPriorityFee string `json:"suggestedPriorityFee"`
}

const defaultPriorityFeeWei = "1500000000" // 1.5 gwei

// BtcUTXOs lists the confirmed+unconfirmed spendable outputs for an address.
func (p *TxPrepProvider) BtcUTXOs(ctx context.Context, network, address string) ([]SpendableUTXO, error) {
	base, ok := btcExplorerBase[network]
	if !ok {
		return nil, fmt.Errorf("unsupported btc network %q", network)
	}
	if !btcAddrRe.MatchString(address) {
		return nil, fmt.Errorf("invalid btc address")
	}
	endpoint := base + "/address/" + url.PathEscape(address) + "/utxo"

	var raw []struct {
		Txid  string `json:"txid"`
		Vout  int    `json:"vout"`
		Value int64  `json:"value"`
	}
	if err := p.getJSON(ctx, endpoint, &raw); err != nil {
		return nil, err
	}
	out := make([]SpendableUTXO, len(raw))
	for i, u := range raw {
		out[i] = SpendableUTXO{Txid: u.Txid, Vout: u.Vout, Value: strconv.FormatInt(u.Value, 10)}
	}
	return out, nil
}

// BtcFeeRates returns the recommended sat/vB tiers.
func (p *TxPrepProvider) BtcFeeRates(ctx context.Context, network string) (*BtcFeeRates, error) {
	base, ok := btcExplorerBase[network]
	if !ok {
		return nil, fmt.Errorf("unsupported btc network %q", network)
	}
	var fees BtcFeeRates
	if err := p.getJSON(ctx, base+"/v1/fees/recommended", &fees); err != nil {
		return nil, err
	}
	return &fees, nil
}

// EthNonce returns the pending transaction count (the next nonce) as a decimal
// string.
func (p *TxPrepProvider) EthNonce(ctx context.Context, network, address string) (string, error) {
	base, ok := ethRPCBase[network]
	if !ok {
		return "", fmt.Errorf("unsupported eth network %q", network)
	}
	if !ethAddrRe.MatchString(address) {
		return "", fmt.Errorf("invalid eth address")
	}
	hexQty, err := p.ethCall(ctx, base, "eth_getTransactionCount", []interface{}{strings.ToLower(address), "pending"})
	if err != nil {
		return "", err
	}
	return hexToDecimal(hexQty)
}

// EthGas returns the current gas price and a usable priority-fee suggestion.
func (p *TxPrepProvider) EthGas(ctx context.Context, network string) (*EthGas, error) {
	base, ok := ethRPCBase[network]
	if !ok {
		return nil, fmt.Errorf("unsupported eth network %q", network)
	}
	gpHex, err := p.ethCall(ctx, base, "eth_gasPrice", []interface{}{})
	if err != nil {
		return nil, err
	}
	gasPrice, err := hexToDecimal(gpHex)
	if err != nil {
		return nil, err
	}
	priority := defaultPriorityFeeWei
	if pfHex, err := p.ethCall(ctx, base, "eth_maxPriorityFeePerGas", []interface{}{}); err == nil {
		if dec, err := hexToDecimal(pfHex); err == nil {
			priority = dec
		}
	}
	return &EthGas{GasPrice: gasPrice, SuggestedPriorityFee: priority}, nil
}

// ethCall performs one JSON-RPC call and returns the raw string result.
func (p *TxPrepProvider) ethCall(ctx context.Context, base, method string, params []interface{}) (string, error) {
	body, err := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0", "method": method, "params": params, "id": 1,
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base, strings.NewReader(string(body)))
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
		return "", fmt.Errorf("eth rpc error: %s", rpcResp.Error.Message)
	}
	return rpcResp.Result, nil
}

func (p *TxPrepProvider) getJSON(ctx context.Context, endpoint string, out interface{}) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("indexer status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// hexToDecimal converts a 0x-prefixed hex quantity to a decimal string.
func hexToDecimal(h string) (string, error) {
	v, ok := new(big.Int).SetString(strings.TrimPrefix(h, "0x"), 16)
	if !ok {
		return "", fmt.Errorf("invalid hex quantity %q", h)
	}
	return v.String(), nil
}
