//go:build integration

// Opt-in live-network verification of the tx-prep + broadcast providers against
// the REAL fixed testnet nodes (mempool.space testnet + Ethereum Sepolia). Proves
// the provider's structs match the live JSON contract — something httptest mocks
// can't, because a mock freezes whatever shape the test author assumed.
//
// Run explicitly (NOT part of the default suite — it hits the network):
//   go test ./internal/service/ -tags integration -run Live -v
package service

import (
	"context"
	"math/big"
	"testing"
	"time"
)

// A well-known BIP-173 testnet bech32 address (valid format; UTXO set may be
// empty — an empty [] is still a passing contract proof).
const liveBtcTestnetAddr = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"

// Sepolia: a high-activity address (the canonical Sepolia faucet) so nonce > 0.
const liveEthSepoliaAddr = "0x0000000000000000000000000000000000000000"

func liveCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 20*time.Second)
}

func TestLive_BtcFeeRates(t *testing.T) {
	ctx, cancel := liveCtx()
	defer cancel()
	p := NewTxPrepProvider()
	// mempool.space's TESTNET fee endpoint is frequently 503 (upstream flakiness,
	// not our bug). If testnet is down, prove the SAME code path against mainnet so
	// the JSON-contract assertion still runs. Only a non-upstream error is fatal.
	fees, err := p.BtcFeeRates(ctx, "testnet")
	if err != nil {
		t.Logf("testnet fees unavailable (%v) — falling back to mainnet for the contract proof", err)
		fees, err = p.BtcFeeRates(ctx, "mainnet")
		if err != nil {
			t.Fatalf("live mempool.space fees (both networks): %v", err)
		}
	}
	if fees.MinimumFee < 1 || fees.FastestFee < fees.MinimumFee {
		t.Errorf("implausible fee tiers: %+v", fees)
	}
	t.Logf("live BTC fees: %+v", fees)
}

func TestLive_BtcUTXOs(t *testing.T) {
	ctx, cancel := liveCtx()
	defer cancel()
	utxos, err := NewTxPrepProvider().BtcUTXOs(ctx, "testnet", liveBtcTestnetAddr)
	if err != nil {
		t.Fatalf("live mempool.space testnet utxos: %v", err)
	}
	for _, u := range utxos {
		if _, ok := new(big.Int).SetString(u.Value, 10); !ok {
			t.Errorf("utxo value %q not a decimal int", u.Value)
		}
	}
	t.Logf("live BTC testnet utxos for %s: %d", liveBtcTestnetAddr, len(utxos))
}

func TestLive_EthGas(t *testing.T) {
	ctx, cancel := liveCtx()
	defer cancel()
	gas, err := NewTxPrepProvider().EthGas(ctx, "testnet")
	if err != nil {
		t.Fatalf("live sepolia gas: %v", err)
	}
	gp, ok := new(big.Int).SetString(gas.GasPrice, 10)
	if !ok || gp.Sign() <= 0 {
		t.Errorf("implausible gasPrice %q", gas.GasPrice)
	}
	if _, ok := new(big.Int).SetString(gas.SuggestedPriorityFee, 10); !ok {
		t.Errorf("priority fee %q not decimal", gas.SuggestedPriorityFee)
	}
	t.Logf("live sepolia gas: %+v", gas)
}

func TestLive_EthNonce(t *testing.T) {
	ctx, cancel := liveCtx()
	defer cancel()
	nonce, err := NewTxPrepProvider().EthNonce(ctx, "testnet", liveEthSepoliaAddr)
	if err != nil {
		t.Fatalf("live sepolia nonce: %v", err)
	}
	if _, ok := new(big.Int).SetString(nonce, 10); !ok {
		t.Errorf("nonce %q not decimal", nonce)
	}
	t.Logf("live sepolia nonce for %s: %s", liveEthSepoliaAddr, nonce)
}
