package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testBtcAddr = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
const testEthAddr = "0x52908400098527886e0f7030069857d2e4169ee7"

func TestTxPrep_BtcUTXOs(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`[{"txid":"aa","vout":0,"value":50000,"status":{"confirmed":true}},
		                        {"txid":"bb","vout":2,"value":12345,"status":{"confirmed":false}}]`))
	}))
	defer srv.Close()

	withBTCEndpoint("testnet", srv.URL, func() {
		p := NewTxPrepProvider()
		utxos, err := p.BtcUTXOs(context.Background(), "testnet", testBtcAddr)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(utxos) != 2 {
			t.Fatalf("got %d utxos, want 2", len(utxos))
		}
		if utxos[0].Txid != "aa" || utxos[0].Vout != 0 || utxos[0].Value != "50000" {
			t.Errorf("utxo[0] = %+v, want {aa 0 50000}", utxos[0])
		}
		if utxos[1].Value != "12345" {
			t.Errorf("utxo[1].Value = %q, want 12345 (bigint-safe string)", utxos[1].Value)
		}
		if !strings.HasSuffix(gotPath, "/utxo") {
			t.Errorf("upstream path = %q, want .../utxo", gotPath)
		}
	})
}

func TestTxPrep_BtcUTXOs_RejectsBadAddress(t *testing.T) {
	p := NewTxPrepProvider()
	if _, err := p.BtcUTXOs(context.Background(), "testnet", "not a btc addr!!"); err == nil {
		t.Error("expected error for invalid btc address, got nil")
	}
}

func TestTxPrep_BtcFeeRates(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"fastestFee":42,"halfHourFee":30,"hourFee":20,"economyFee":10,"minimumFee":1}`))
	}))
	defer srv.Close()

	withBTCEndpoint("testnet", srv.URL, func() {
		p := NewTxPrepProvider()
		fees, err := p.BtcFeeRates(context.Background(), "testnet")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if fees.FastestFee != 42 || fees.MinimumFee != 1 {
			t.Errorf("fees = %+v, want fastest 42 / min 1", fees)
		}
	})
}

// ethRPCMock dispatches by JSON-RPC method so a single server can serve both
// eth_gasPrice and eth_maxPriorityFeePerGas (the gas path makes two calls).
func ethRPCMock(results map[string]string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string `json:"method"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		res, ok := results[req.Method]
		w.Header().Set("Content-Type", "application/json")
		if !ok {
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"message":"method not supported"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"` + res + `"}`))
	}))
}

func TestTxPrep_EthNonce(t *testing.T) {
	srv := ethRPCMock(map[string]string{"eth_getTransactionCount": "0x2a"})
	defer srv.Close()

	withETHEndpoint("testnet", srv.URL, func() {
		p := NewTxPrepProvider()
		nonce, err := p.EthNonce(context.Background(), "testnet", testEthAddr)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if nonce != "42" {
			t.Errorf("nonce = %q, want 42 (0x2a as decimal)", nonce)
		}
	})
}

func TestTxPrep_EthGas_WithPriority(t *testing.T) {
	// 0x3b9aca00 = 1_000_000_000 wei (1 gwei); priority 0x59682f00 = 1_500_000_000.
	srv := ethRPCMock(map[string]string{
		"eth_gasPrice":             "0x3b9aca00",
		"eth_maxPriorityFeePerGas": "0x59682f00",
	})
	defer srv.Close()

	withETHEndpoint("testnet", srv.URL, func() {
		p := NewTxPrepProvider()
		gas, err := p.EthGas(context.Background(), "testnet")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if gas.GasPrice != "1000000000" {
			t.Errorf("gasPrice = %q, want 1000000000", gas.GasPrice)
		}
		if gas.SuggestedPriorityFee != "1500000000" {
			t.Errorf("priority = %q, want 1500000000", gas.SuggestedPriorityFee)
		}
	})
}

func TestTxPrep_EthGas_PriorityFallback(t *testing.T) {
	// Node lacks eth_maxPriorityFeePerGas → must fall back to the 1.5 gwei default.
	srv := ethRPCMock(map[string]string{"eth_gasPrice": "0x3b9aca00"})
	defer srv.Close()

	withETHEndpoint("testnet", srv.URL, func() {
		p := NewTxPrepProvider()
		gas, err := p.EthGas(context.Background(), "testnet")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if gas.SuggestedPriorityFee != defaultPriorityFeeWei {
			t.Errorf("priority = %q, want fallback %s", gas.SuggestedPriorityFee, defaultPriorityFeeWei)
		}
	})
}

func TestTxPrep_RejectsUnknownNetwork(t *testing.T) {
	p := NewTxPrepProvider()
	if _, err := p.BtcUTXOs(context.Background(), "regtest", testBtcAddr); err == nil {
		t.Error("btc utxos: expected error for unknown network")
	}
	if _, err := p.EthGas(context.Background(), "regtest"); err == nil {
		t.Error("eth gas: expected error for unknown network")
	}
}
