package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// validRawHex is an even-length hex blob above the floor; the exact bytes are
// irrelevant because the upstream node (mocked here) is what judges validity.
const validRawHex = "0200000001abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
// exactly 64 hex chars (32-byte txid / tx hash)
const fakeTxid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

// withBTCEndpoint temporarily points the fixed btc map at a mock server.
func withBTCEndpoint(network, url string, fn func()) {
	prev := btcExplorerBase[network]
	btcExplorerBase[network] = url
	defer func() { btcExplorerBase[network] = prev }()
	fn()
}

func withETHEndpoint(network, url string, fn func()) {
	prev := ethRPCBase[network]
	ethRPCBase[network] = url
	defer func() { ethRPCBase[network] = prev }()
	fn()
}

func TestBroadcast_BTC_RoundTrip(t *testing.T) {
	var gotBody, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(fakeTxid))
	}))
	defer srv.Close()

	withBTCEndpoint("testnet", srv.URL, func() {
		p := NewBroadcastProvider()
		txid, err := p.Broadcast(context.Background(), "btc", "testnet", validRawHex)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if txid != fakeTxid {
			t.Errorf("txid = %q, want %q", txid, fakeTxid)
		}
		if gotPath != "/tx" {
			t.Errorf("upstream path = %q, want /tx", gotPath)
		}
		// btc must receive bare hex (no 0x), lowercased.
		if gotBody != strings.ToLower(validRawHex) {
			t.Errorf("upstream body = %q, want bare lowercased hex", gotBody)
		}
	})
}

func TestBroadcast_ETH_RoundTrip(t *testing.T) {
	var gotMethod, gotParam string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string   `json:"method"`
			Params []string `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		gotMethod = req.Method
		if len(req.Params) > 0 {
			gotParam = req.Params[0]
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":"0x` + fakeTxid + `"}`))
	}))
	defer srv.Close()

	withETHEndpoint("testnet", srv.URL, func() {
		p := NewBroadcastProvider()
		// pass with a 0x prefix to prove normalization is idempotent
		txid, err := p.Broadcast(context.Background(), "eth", "testnet", "0x"+validRawHex)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if txid != "0x"+fakeTxid {
			t.Errorf("txid = %q, want 0x%s", txid, fakeTxid)
		}
		if gotMethod != "eth_sendRawTransaction" {
			t.Errorf("rpc method = %q, want eth_sendRawTransaction", gotMethod)
		}
		if !strings.HasPrefix(gotParam, "0x") {
			t.Errorf("eth param = %q, must be 0x-prefixed", gotParam)
		}
	})
}

func TestBroadcast_BTC_UpstreamRejection(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("sendrawtransaction RPC error: bad-txns-inputs-missingorspent"))
	}))
	defer srv.Close()

	withBTCEndpoint("testnet", srv.URL, func() {
		p := NewBroadcastProvider()
		_, err := p.Broadcast(context.Background(), "btc", "testnet", validRawHex)
		if err == nil {
			t.Fatal("expected error on upstream rejection, got nil")
		}
		if !strings.Contains(err.Error(), "bad-txns") {
			t.Errorf("error %q should surface the upstream rejection reason", err)
		}
	})
}

func TestBroadcast_RejectsMalformedHex(t *testing.T) {
	p := NewBroadcastProvider()
	cases := []struct{ name, coin, raw string }{
		{"too short", "btc", "abcd"},
		{"odd length", "btc", "abc"},
		{"non-hex", "eth", "0xZZZZ1234abcd1234abcd1234abcd1234"},
		{"empty", "btc", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, err := p.Broadcast(context.Background(), c.coin, "testnet", c.raw); err == nil {
				t.Errorf("%s: expected validation error, got nil", c.name)
			}
		})
	}
}

func TestBroadcast_RejectsUnknownNetwork(t *testing.T) {
	p := NewBroadcastProvider()
	if _, err := p.Broadcast(context.Background(), "btc", "regtest", validRawHex); err == nil {
		t.Error("expected error for unknown network, got nil")
	}
}

func TestIsWellFormedRawTxHex(t *testing.T) {
	good := []string{validRawHex, "0x" + validRawHex, strings.ToUpper(validRawHex)}
	for _, g := range good {
		if !IsWellFormedRawTxHex(g) {
			t.Errorf("IsWellFormedRawTxHex(%.20s...) = false, want true", g)
		}
	}
	bad := []string{"", "abcd", "abc", "0xZZ", strings.Repeat("a", rawTxMaxHex+2)}
	for _, b := range bad {
		if IsWellFormedRawTxHex(b) {
			t.Errorf("IsWellFormedRawTxHex(len=%d) = true, want false", len(b))
		}
	}
}
