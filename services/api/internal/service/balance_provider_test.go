package service

import (
	"context"
	"math/big"
	"os"
	"testing"
	"time"
)

// Live integration test against real public indexers. Skipped by default (hits
// the network); run with WALLET_LIVE_TEST=1 to prove the watch-only balance
// path end-to-end. Uses famous always-funded public addresses so the assertion
// (balance > 0) is stable.
func TestBalanceProvider_Live(t *testing.T) {
	if os.Getenv("WALLET_LIVE_TEST") != "1" {
		t.Skip("set WALLET_LIVE_TEST=1 to run live indexer test")
	}

	p := NewBalanceProvider()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cases := []struct {
		name, coin, network, address string
	}{
		// Bitcoin genesis (Satoshi) address — permanently funded.
		{"btc-genesis", "btc", "mainnet", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"},
		// Ethereum Foundation address — permanently funded.
		{"eth-foundation", "eth", "mainnet", "0xde0B295669a9FD93d5F28D9Ec85E40f4cB697BAe"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			bal, err := p.AddressBalance(ctx, c.coin, c.network, c.address)
			if err != nil {
				t.Fatalf("%s: %v", c.name, err)
			}
			confirmed, ok := new(big.Int).SetString(bal.Confirmed, 10)
			if !ok {
				t.Fatalf("%s: confirmed %q is not a decimal integer", c.name, bal.Confirmed)
			}
			if confirmed.Sign() <= 0 {
				t.Fatalf("%s: expected positive confirmed balance, got %s", c.name, bal.Confirmed)
			}
			t.Logf("%s confirmed=%s unconfirmed=%s", c.name, bal.Confirmed, bal.Unconfirmed)
		})
	}
}
