# Auth Box — Crypto Wallet Architecture

Status: Phases 1–4 + 5a shipped on web; full native parity shipped on iOS.
Mainnet broadcast (5b) + Send UI (5c) queued behind a HITL fund-movement gate.
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

### Web (`packages/crypto`, TypeScript)

| Concern | Library | Why |
|---------|---------|-----|
| BIP-32 HD derivation | `@scure/bip32` | audited; same author as the in-use `@noble/hashes` |
| secp256k1 | `@noble/curves` | audited reference impl across the ecosystem |
| BTC addresses / PSBT / signing | `@scure/btc-signer` | correct bech32/base58check + `selectUTXO` coin selection |
| ETH tx build / EIP-1559 / signing | `micro-eth-signer` | paulmillr, audited, same @noble/@scure ecosystem; avoids hand-rolled RLP |
| keccak256 | `@noble/hashes/sha3` | already a dependency |

### iOS (`apps/ios/AuthBoxCrypto`, Swift)

| Concern | Library / impl | Why |
|---------|----------------|-----|
| secp256k1 | `swift-secp256k1` 0.21 (`libsecp256k1` C product) | the same libsecp256k1 reference C library; no Swift-side curve math |
| SHA-256/512, HMAC | CryptoKit | first-party, hardware-backed |
| keccak256 / RIPEMD-160 / bech32 / base58check | vendored (`Keccak256` / `RIPEMD160` / `Bech32` / `Base58Check`) | CryptoKit lacks Keccak and RIPEMD-160; each is anchored to public vectors |

Hand-rolling secp256k1 child-key derivation is precisely where wallets acquire
CVEs (constant-time scalar add, `IL ≥ n` retry). On both platforms the curve math
is delegated to the audited libsecp256k1 lineage; only BIP-39 phrase logic and the
hash/encoding primitives (pure bit manipulation) are hand-written, against vectors.

iOS gotcha worth recording: libsecp256k1's *static* context lacks the `ecmult_gen`
table, so `pubkey_create` aborts — the wrapper must build a context with
`secp256k1_context_create(SECP256K1_CONTEXT_NONE)`; the static singleton is marked
`nonisolated(unsafe)` for Swift 6 concurrency.

## 7. Cross-platform parity (the 打通 contract)

Web and iOS derive from the same seed and **must** produce identical addresses.
The Swift stack (`apps/ios/AuthBoxCrypto/Sources/AuthBoxCrypto/Wallet.swift`)
mirrors the TypeScript stack (`packages/crypto/src/wallet.ts`) step for step:
"Bitcoin seed" master → hardened + non-hardened CKDpriv
(`childPriv = (IL + parentPriv) mod n`, where
`IL = HMAC-SHA512(chainCode, compressedParentPubkey ‖ index)`) → BIP-84 P2WPKH /
BIP-44 P2PKH / ETH EIP-55 → account xpub.

Parity is proven against shared external anchors for the public all-zeros
`abandon … about` mnemonic — both platforms emit, byte-for-byte:

| Coin | Path | Address |
|------|------|---------|
| BTC native segwit | `m/84'/0'/0'/0/0` | `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu` |
| BTC legacy | `m/44'/0'/0'/0/0` | `1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA` |
| ETH | `m/44'/60'/0'/0/0` | `0x9858EfFD232B4033E47d90003D41EC34EcaEda94` |

Because both sides anchor to the *same external vectors* (not to each other), a
drift on either platform fails its own test suite independently — the parity is a
property of two independent implementations agreeing with the standard, not of one
copying the other.

## 8. Transaction signing (Phase 5a — web, fund-safe)

`packages/crypto/src/wallet-tx.ts` adds client-side build + sign (no broadcast):

- `buildBtcTransaction` — `@scure/btc-signer` `selectUTXO(..., 'default', { … })`
  for coin selection + change, P2WPKH `witnessUtxo` / P2PKH `nonWitnessUtxo`,
  per-input derive → sign → `fill(0)` the private key in `finally`. Returns
  `{ hex, txid, fee, vsize }`; `txid` is big-endian display order.
- `buildEthTransaction` — `micro-eth-signer` `Transaction.prepare({type:'eip1559'})`
  `.signBy(priv)`. The recovered `sender` is asserted equal to the independently
  derived address (throws on mismatch rather than hand back a tx spending an
  unexpected key); the private key is zeroed in `finally`.

Recorded finding: `micro-eth-signer` ECDSA is **hedged** (extra entropy on the
RFC6979 nonce → non-deterministic but valid signatures that recover the same
sender), whereas `@scure/btc-signer` signs deterministically. The tests assert the
right invariant per coin — validity + sender-recovery for ETH, determinism for
BTC. Keys are derived locally, used once, and zeroed; nothing here touches the
network. **Broadcast is deliberately not built** — that is Phase 5b, behind HITL.

## 9. Server surface (Go API, watch-only)

`services/api` exposes a watch-only account surface under `/wallet/accounts`
(chi router, pgx repo). It stores xpub + addresses + cached balance; it holds no
key material and cannot sign.

| Method | Route | Handler |
|--------|-------|---------|
| POST | `/wallet/accounts` | `CreateAccount` (register an account by xpub + metadata) |
| GET | `/wallet/accounts` | `ListAccounts` |
| DELETE | `/wallet/accounts/{id}` | `DeleteAccount` |
| GET | `/wallet/accounts/{id}/balance` | `Balance` (via public indexers) |
| POST | `/wallet/accounts/{id}/addresses` | `AddAddress` |
| GET | `/wallet/accounts/{id}/addresses` | `ListAddresses` |

Balances come from `balance_provider.go` → mempool.space (BTC) / publicnode RPC
(ETH). The server is a convenience indexer, never a custodian.

## 10. iOS app integration (local-first, no server round-trip)

The iOS app is **local-first** and does not use the Go wallet API. `APIClient` is
dead code there (no login flow is wired; the vault is Keychain seed + SwiftData,
fully on-device). Rebuilding an absent auth flow merely to fetch a balance would
be net-negative, so the iOS wallet derives client-side and queries the **same
public indexers directly** (`WalletBalanceService`: mempool.space / publicnode).
This is strictly stronger zero-knowledge than the web path — no address list ever
leaves the device to our own server — and is consistent with the local-first
vault.

Persistence (`WalletAccountStore`, UserDefaults) holds only the **public account
descriptor** (coin / network / scriptType / index / label) — no keys, no
addresses. The receive address is re-derived live from the in-memory seed whenever
the vault is unlocked, so the at-rest footprint carries nothing sensitive.

## 11. Verification

- **Web crypto**: `packages/crypto/src/__tests__/wallet.test.ts` (derivation) +
  `wallet-tx.test.ts` (signing) green; full crypto suite **80/80**. Three external
  iancoleman.io/bip39 anchors prove standard-wallet importability; signing tests
  anchor on the same mnemonic (ETH sigs recover `0x9858…Eda94`, BTC inputs owned
  by `bc1qcr8te4…306fyu`).
- **iOS crypto**: `WalletTests` **13/13**; iOS derives the identical canonical
  addresses (anchored to the iancoleman vectors + the TS reference) — the
  cross-platform 打通 proof.
- **iOS visual verification (3 rounds, real iPhone-17 simulator pixels)**:
  `AuthBoxUITests/WalletFlowUITests` (xcodebuild test PASSED). A DEBUG-only
  `--wallet-demo-seed` hook boots an unlocked vault from the public test mnemonic
  so the screens render the canonical, real-on-chain addresses. Seven inspected
  PNGs in `state/screenshots/authbox-ios-uxmap/`: empty state (R1), BTC add +
  derived address + live balance (R2), ETH EIP-55 + multi-coin list + balance (R3).

## 12. Phased delivery (actual state)

- **Phase 0 — Architecture** (this doc). DONE.
- **Phase 1 — Crypto foundation** (`wallet.ts` + tests). DONE.
- **Phase 2 — Schema + shared types** (`Wallet*` types + Zod, watch-only). DONE.
- **Phase 3 — API (read)**: account CRUD + balance via public indexers. DONE.
- **Phase 4 — Web UI**: accounts, receive addresses, balances. DONE.
- **Phase 5a — Signing (web)**: client-side build/sign, no broadcast. DONE (fund-safe).
- **iOS 5a/5b/5c — Native parity + local-first UI + 3-round visual verify**. DONE.
- **Phase 5b — Broadcast relay**: Go forwards signed bytes to fixed trusted
  endpoints (never signs); testnet-first live proof. QUEUED — HITL.
- **Phase 5c — Send UI**: amount/fee/confirm; **mainnet fund movement HITL-gated**
  per the safety rules. QUEUED — HITL.

## 13. Non-goals (this iteration)

- Custodial holding of any kind.
- Server-side key storage or server-side signing.
- DeFi / swap / bridging.
- Privacy coins or non-secp256k1 chains (Solana, etc.) — deferred.

---
Maurice | maurice_wen@proton.me
