# Auth Box — Crypto Wallet Architecture

Status: Phase 1 shipped (crypto foundation). Phases 2–5 queued.
Owner: Maurice. Last updated: 2026-06-03.

## 1. Goal

Upgrade Auth Box from a zero-knowledge vault + agent broker into **also a
self-custodial multi-coin crypto wallet**, supporting Bitcoin and other
mainstream currencies (Ethereum / EVM first), without weakening the existing
security model.

## 2. Core insight — the seed is already a wallet seed

Auth Box already protects a **BIP-39 24-word mnemonic** (`packages/crypto/src/seed.ts`).
`mnemonicToSeed` is fully BIP-39-compliant (PBKDF2-HMAC-SHA512, salt `"mnemonic"`,
2048 iterations, 64-byte output). Therefore the same phrase the user already
holds **is** a standard wallet seed. A crypto wallet is not a bolt-on secret; it
is a new derivation branch off the seed the user already controls.

## 3. Two independent HD trees from one seed

| Tree | HMAC key | Derivation | Purpose | Interop |
|------|----------|------------|---------|---------|
| Auth Box internal | `"authbox seed"` | custom hardened-only (`deriveKey`) | vault / sync / agent / password keys | none (intentional) |
| Wallet | `"Bitcoin seed"` | standard BIP-32 (`@scure/bip32`) | BTC / ETH keys | full (BIP-44/84) |

The two trees are cryptographically independent (different HMAC keys → disjoint
key material) even though they share one seed. The internal tree stays custom
(its keys are symmetric secrets for AES/HKDF — interop is irrelevant and a
non-standard structure is fine). The wallet tree is **standard** so the phrase
recovers identical addresses in Electrum / MetaMask / Ledger. No lock-in is a
hard requirement: it is the entire value proposition of self-custody.

## 4. Derivation standards

| Coin | Purpose | Path | Address |
|------|---------|------|---------|
| BTC native segwit (default) | BIP-84 | `m/84'/0'/0'/{change}/{i}` | bech32 `bc1…` (P2WPKH) |
| BTC legacy | BIP-44 | `m/44'/0'/0'/{change}/{i}` | base58 `1…` (P2PKH) |
| ETH / EVM | BIP-44 | `m/44'/60'/0'/{change}/{i}` | EIP-55 `0x…` |
| testnet (any) | — | coin_type `1'` per SLIP-44 | `tb1…` / etc. |

Adding BTC-like coins (LTC, DOGE) is a network-version-byte change; adding EVM
chains reuses the ETH address unchanged. The two coins implemented span both
cryptographic regimes (UTXO/secp256k1+hash160 and account/secp256k1+keccak), so
expansion is parameterisation, not new cryptography.

## 5. Security model — self-custodial + watch-only server

The vault's zero-knowledge property extends to the wallet unchanged:

- **Private keys are derived client-side and never leave the device.** Signing
  happens locally from the seed; the server never sees key material.
- **The server is watch-only.** It persists the account-level **xpub** (extended
  *public* key) and derived addresses — enough to scan balances and history via
  public indexers, never enough to spend.
- **The server can never move funds.** Same trust boundary as the vault: a full
  server compromise leaks public addresses and balances (a privacy loss), not
  custody.

Threat-model note: deriving wallet keys from the same seed that secures the
vault means seed compromise loses both vault and funds. This is inherent to the
"one seed" model (identical to every hardware wallet) and does not change the
existing posture — the seed was always the crown jewel because it already
derives the vault key.

## 6. Library choices (audited, no hand-rolled curve crypto)

| Concern | Library | Why |
|---------|---------|-----|
| BIP-32 HD derivation | `@scure/bip32` | audited; same author as the in-use `@noble/hashes` |
| secp256k1 | `@noble/curves` | audited reference impl across the ecosystem |
| BTC addresses / PSBT | `@scure/btc-signer` | correct bech32/base58check + future signing |
| keccak256 | `@noble/hashes/sha3` | already a dependency |

Hand-rolling secp256k1 child-key derivation is precisely where wallets acquire
CVEs (constant-time scalar add, `IL ≥ n` retry). BIP-39 phrase logic stays
hand-rolled (bit manipulation only); curve math is delegated.

## 7. Verification (Phase 1)

`packages/crypto/src/__tests__/wallet.test.ts` — 14 tests, all green.
Three are **external interoperability anchors** (published iancoleman.io/bip39
vectors for the `abandon … about` mnemonic): BTC bip84 `bc1qcr8te4kr609…`,
BTC bip44 `1LqBGSKuX5yYU…`, ETH `0x9858EfFD232B40…`. Matching them proves the
derivation is importable into standard wallets. Remaining tests cover
change/account/testnet regression, determinism, xpub format, EIP-55 casing, and
private-key↔public-key↔address consistency.

## 8. Phased delivery

- **Phase 0 — Architecture** (this doc). DONE.
- **Phase 1 — Crypto foundation** (`wallet.ts` + tests, offline/deterministic). DONE.
- **Phase 2 — Schema + shared types**: migration `011_wallet_accounts`, shared
  `Wallet*` types + Zod schemas (watch-only metadata: coin, network, xpub,
  derivation path, label, cached balance). No private material in the schema.
- **Phase 3 — API (read)**: account CRUD + balance/history via public indexers
  (BTC: mempool.space/Blockstream; ETH: public RPC/Etherscan). Watch-only.
- **Phase 4 — Web UI**: wallet accounts, receive addresses + QR, balances.
- **Phase 5 — Transactions**: client-side build/sign/broadcast. **Testnet-first;
  mainnet fund movement is HITL-gated** per the safety rules.

## 9. Non-goals (this iteration)

- Custodial holding of any kind.
- Server-side key storage or server-side signing.
- DeFi / swap / bridging.
- Privacy coins or non-secp256k1 chains (Solana, etc.) — deferred.

---
Maurice | maurice_wen@proton.me
