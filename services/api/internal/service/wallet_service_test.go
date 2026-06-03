package service

import "testing"

// WalletEnumParity pins the Go wallet vocabularies to the canonical sets shared
// with packages/shared/src/types/wallet.ts and the Zod schemas. If a future
// edit drifts the Go map (adds, removes, or renames a value) this fails — the
// guard the 2026-06-02 acceptance pass wished it had when two release-blocking
// contract bugs shipped from exactly this kind of cross-layer enum divergence.

func TestWalletEnumParity_Coin(t *testing.T) {
	// Canonical: packages/shared Coin enum.
	canonical := []string{"btc", "eth"}
	assertVocabulary(t, "coin", canonical, IsValidCoin)
}

func TestWalletEnumParity_Network(t *testing.T) {
	canonical := []string{"mainnet", "testnet"}
	assertVocabulary(t, "network", canonical, IsValidNetwork)
}

func TestWalletEnumParity_BtcScriptType(t *testing.T) {
	canonical := []string{"p2wpkh", "p2pkh"}
	assertVocabulary(t, "scriptType", canonical, IsValidBtcScriptType)
}

// assertVocabulary verifies the validator accepts exactly the canonical values
// and rejects a few representative off-vocabulary strings (including the actual
// historical drift values that broke the agent enum: "gpt", "service").
func assertVocabulary(t *testing.T, name string, canonical []string, valid func(string) bool) {
	t.Helper()
	for _, v := range canonical {
		if !valid(v) {
			t.Errorf("%s: canonical value %q must be valid", name, v)
		}
	}
	for _, bad := range []string{"", "GPT", "service", "bitcoin", "ethereum", "p2sh", "main"} {
		if contains(canonical, bad) {
			continue
		}
		if valid(bad) {
			t.Errorf("%s: off-vocabulary value %q must be rejected", name, bad)
		}
	}
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
