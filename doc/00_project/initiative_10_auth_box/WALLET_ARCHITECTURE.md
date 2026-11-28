# Auth Box — Crypto Wallet Architecture

Status: Phases 0–5c shipped on web (derivation, watch-only API, client-side signing,
transaction-prep reads, broadcast relay `POST /wallet/broadcast`, Send dialog with a
mainnet double-confirm gate). iOS ships the same wallet local-first, including Send.
A live **testnet** broadcast is recorded in `task_plan.md` (sections 5b, 5c,
§WALLET-SEND); `task_plan.md` records no mainnet send.
Owner: Maurice. Last updated: 2026-11-28 (code re-read on branch `claude/project-thread-xqvs06`).

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
- **The server can never move funds on its own.** Same trust boundary as the vault:
  a full server compromise leaks public addresses and balances (a privacy loss), not
  custody. It can still degrade a send the user approves; see the last point below.
- **The server relays, it does not sign.** Since Phase 5b the web path sends an
  already-signed raw transaction to `POST /api/v1/wallet/broadcast`, which forwards
  the bytes to a fixed public node (`services/api/internal/service/broadcast_provider.go`,
  `BroadcastProvider` doc comment). A compromised relay could withhold or delay a
  broadcast, but it cannot change amount, recipient or fee without invalidating the
  signature. The relay is network-agnostic: the mainnet gate lives in the client
  (comment above the route in `services/api/cmd/api/main.go`, L250-252).
- **What a compromised server can still do.** It cannot sign, but on the web it
  supplies the data the client signs over, and it relays the result:
  - *Inflate fees.* BTC fee tiers come from `GET /wallet/btc/fees`;
    `buildBtcTransaction` refuses any rate above `MAX_BTC_FEE_RATE_SAT_PER_VB`
    (5000 sat/vB, `packages/crypto/src/wallet-tx.ts`), so the loss is bounded, not
    zero. ETH gas from `GET /wallet/eth/gas` has no ceiling in `wallet-send.ts` or
    `wallet-tx.ts` (whether `micro-eth-signer` applies its own limit is unverified
    here). The human check is the fee and total shown on Review before Confirm (§8.3).
  - *Feed wrong UTXOs or a wrong nonce.* A P2WPKH signature commits to each input's
    amount, so a false amount produces a transaction the node rejects; a wrong ETH
    nonce produces a rejected or stuck transaction. This is denial of service, not theft.
  - *Withhold a broadcast or report a false txid.* The dialog shows whatever txid the
    relay returns.
  - *Read the xpub,* which reveals every address of the account, including ones not
    yet used.

  On the web the phrase is typed into page code served by the web host. "Your seed
  never leaves the browser" (`apps/web/app/(vault)/wallet/page.tsx` L1230) is true of
  the shipped code; a compromised web host or build could ship code that captures
  the phrase, as for any browser-delivered wallet. iOS has no such code-delivery hop,
  but it trusts mempool.space / publicnode directly for the same tx-prep data (§10).

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

## 8. Transaction signing and the Send flow (Phases 5a + 5c — web)

### 8.1 Signing layer (`packages/crypto/src/wallet-tx.ts`)

Client-side build + sign. The module itself never touches the network:

- `buildBtcTransaction` — `@scure/btc-signer` `selectUTXO(..., 'default', { … })`
  for coin selection + change, P2WPKH `witnessUtxo` / P2PKH `nonWitnessUtxo`.
  A key is derived up front for every candidate UTXO; only the inputs `selectUTXO`
  picked are signed (input by input, `signIdx`), and every derived key, selected or
  not, is `fill(0)`-ed in `finally`. Returns `{ hex, txid, fee, vsize }`; `txid` is
  big-endian display order. Fee rates below 1 or above `MAX_BTC_FEE_RATE_SAT_PER_VB`
  (5000 sat/vB) are refused. A legacy P2PKH input cannot be signed from the outpoint
  alone: the caller must pass the previous transaction (`prevTxHex` →
  `nonWitnessUtxo`), otherwise the function throws.
- `buildEthTransaction` — `micro-eth-signer` `Transaction.prepare({type:'eip1559'})`
  `.signBy(priv)`. It refuses a `chainId` that does not match the key's network
  (mainnet ⇔ chain 1), so a testnet-path key cannot sign for mainnet or the reverse.
  The recovered `sender` is asserted equal to the independently
  derived address (throws on mismatch rather than hand back a tx spending an
  unexpected key); the private key is zeroed in `finally`.

Recorded finding: `micro-eth-signer` ECDSA is **hedged** (extra entropy on the
RFC6979 nonce → non-deterministic but valid signatures that recover the same
sender), whereas `@scure/btc-signer` signs deterministically. The tests assert the
right invariant per coin — validity + sender-recovery for ETH, determinism for
BTC. Keys are derived locally, used once, and zeroed.

### 8.2 Funds-critical send helpers (`packages/crypto/src/wallet-send.ts`)

Pure functions (no network, clock or randomness), exported from
`packages/crypto/src/index.ts`, so the two costliest wallet bugs are pinned by tests
outside React:

- `parseAmount(input, decimals)` — decimal string → base-unit `bigint` with no
  float path; throws on sub-unit precision, scientific notation, negatives and zero
  instead of silently truncating.
- `selectBtcFeeRate(fees, tier)` — picks a sat/vB tier, floored at `minimumFee` and 1.
- `deriveEthFeeParams(gasPrice, priority)` — EIP-1559 ceiling `maxFeePerGas =
  gasPrice + priority`, so `maxFeePerGas ≥ maxPriorityFeePerGas` always holds.
- `ethChainId(network)` — mainnet `1`, testnet (Sepolia) `11155111`.

### 8.3 Send dialog (`apps/web/app/(vault)/wallet/page.tsx`)

Two stages; the second is the only network mutation in the flow:

1. **Review** (`handleSendReview`) — validates the recovery phrase, `parseAmount`,
   then `assertSeedMatchesAccount` refuses a phrase whose derived xpub differs from
   the selected account. BTC: fetch fee tiers, list the account's addresses, fetch
   UTXOs per address and tag each UTXO with that address's `change`/`index` (the
   UTXO payload carries no derivation path), derive a fresh change address (one past
   the highest registered `change:1` index), sign. ETH: fetch nonce + gas in
   parallel, derive fee params, sign a 21000-gas transfer from the account's
   `change:0/index:0` address. The dialog shows fee and total before anything is
   sent (sign-then-review, because BTC fee depends on vsize known only after
   signing): for BTC the fee is the exact signed fee; for ETH it is the ceiling
   `21000 × maxFeePerGas`, and the amount actually paid is at most that. The phrase
   is cleared from React state in `finally`; that only drops the reference. Neither
   the JS string nor the 64-byte seed derived in the handler is zeroed, so wiping is
   best-effort and left to garbage collection. The dialog never passes `prevTxHex`
   and the UTXO endpoint does not return it, so a send from a Legacy (P2PKH) BTC
   account, which the add-account form offers (L927), throws at signing: web Send
   works for native-segwit BTC and for ETH (read from code, not run).
2. **Confirm** (`handleSendConfirm`) — registers the BTC change address with the
   API first (so change stays visible in the in-app balance; an unused address is
   harmless if broadcast then fails), then calls `walletApi.broadcast`, shows the
   txid and a block-explorer link (`explorerTxUrl`: mempool.space / Etherscan,
   network-aware), and refreshes addresses and balance.

**Mainnet HITL gate.** On mainnet the Review shows a red checkbox ("This is a
mainnet transaction moving real funds. It is irreversible. I have verified the
recipient and amount.") and the Confirm button is `disabled` until it is ticked;
on testnet there is no checkbox, and the send form's badge row reads "Safe
testnet -- no real value". The gate is enforced by the
button's `disabled` state only; neither `handleSendConfirm` nor the relay checks
it again (see §12, open points).

The change-address registration and the seed-to-account check landed later than
the dialog itself, in commit `01583fb` (2026-11-27); the dialog shipped in
`be6ede8` (2026-06-17).

## 9. Server surface (Go API — watch-only reads, tx-prep reads, broadcast relay)

All wallet routes live under `/api/v1` inside the group that applies
`auth.Middleware(authService)` and the protected rate limiter
(`services/api/cmd/api/main.go` L184-197, routes L253-270). Handlers are in
`services/api/internal/handler/wallet_handler.go`; services in
`services/api/internal/service/`. The API stores xpub + addresses + cached balance;
it holds no key material and cannot sign.

| Method | Route (under `/api/v1`) | Handler | Role |
|--------|-------|---------|------|
| POST | `/wallet/accounts` | `CreateAccount` | register an account by xpub + metadata |
| GET | `/wallet/accounts` | `ListAccounts` | watch-only read |
| DELETE | `/wallet/accounts/{id}` | `DeleteAccount` | watch-only write |
| GET | `/wallet/accounts/{id}/balance` | `Balance` | balance via public indexers |
| POST | `/wallet/accounts/{id}/addresses` | `AddAddress` | register a derived address (incl. change) |
| GET | `/wallet/accounts/{id}/addresses` | `ListAddresses` | watch-only read |
| GET | `/wallet/btc/utxos?address=&network=` | `BtcUTXOs` | tx-prep: spendable UTXOs |
| GET | `/wallet/btc/fees?network=` | `BtcFees` | tx-prep: sat/vB tiers |
| GET | `/wallet/eth/nonce?address=&network=` | `EthNonce` | tx-prep: pending nonce |
| GET | `/wallet/eth/gas?network=` | `EthGas` | tx-prep: gas price + priority fee |
| POST | `/wallet/broadcast` | `Broadcast` | relay a client-signed raw tx |

Providers, all keyed on the same fixed `(coin, network)` endpoint maps
`btcExplorerBase` / `ethRPCBase` in `balance_provider.go` (mempool.space mainnet +
testnet; publicnode Ethereum mainnet + Sepolia), so no request can be steered at a
user-supplied host:

- `balance_provider.go` — balances.
- `txprep_provider.go` (`TxPrepProvider`) — `BtcUTXOs` (mempool `/address/{a}/utxo`,
  values returned as decimal strings), `BtcFeeRates` (`/v1/fees/recommended`; on a
  non-mainnet failure it retries the mainnet endpoint, since mainnet rates are a safe
  over-estimate for a valueless testnet send — commit `8f5193f`), `EthNonce`
  (`eth_getTransactionCount … "pending"` → decimal), `EthGas` (`eth_gasPrice` +
  `eth_maxPriorityFeePerGas`, falling back to 1.5 gwei). Addresses are format-checked
  with `btcAddrRe` / `ethAddrRe`; the BTC address is path-escaped into the UTXO URL and the
  ETH address goes in the JSON-RPC body.
- `broadcast_provider.go` (`BroadcastProvider`) — BTC: `POST {base}/tx` with bare hex,
  expects a 64-hex txid; ETH: `eth_sendRawTransaction`, expects a `0x` 32-byte hash.
  `IsWellFormedRawTxHex` bounds the payload (optional `0x`, even-length hex,
  20–200 000 hex chars) and the provider re-validates.

Validation and errors: off-vocabulary `coin`/`network` and malformed `rawTxHex`
return 400 before any egress; a missing `address` on the tx-prep reads returns 400,
but a present-yet-malformed address fails the provider's format check and comes
back as 502, like any other tx-prep upstream failure. A failed broadcast returns
502 carrying the provider's error text: the node's rejection reason when the node
gives one, otherwise the transport or status error (`wallet_handler.go`,
`Broadcast`). A broadcast with no `network` goes to **mainnet**
(`broadcast_provider.go` `Broadcast`, L88-89); the web client always sends it.
Broadcasts are not written to the audit chain: the handler logs only failures
(`slog.Warn` with user, coin, network and the error). The web client for all of these is
`walletApi` in `packages/api-client/src/client.ts` (instantiated by
`apps/web/lib/api.ts`).

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

**Send on iOS** follows the same local-first rule. `WalletTxPrepService.swift`
fetches UTXOs, fee tiers, nonce and gas and broadcasts (`broadcastBtc` →
mempool.space `POST /tx`, `broadcastEth` → publicnode JSON-RPC) directly against the
same fixed hosts the Go providers use; it does not call the Go relay. Signing is
native in `apps/ios/AuthBoxCrypto/Sources/AuthBoxCrypto/WalletTx.swift`
(`buildBtcTransaction` P2WPKH / BIP-143, `buildEthTransaction` EIP-1559 with `RLP.swift`)
plus `WalletTx.isValidRecipient` for inline recipient checks. The native signers
set no fee upper bound: BTC only requires at least 1 sat/vB (there is no counterpart
to the web `MAX_BTC_FEE_RATE_SAT_PER_VB`) and ETH takes the gas values as given, so
the "Network fee" row on Review is the check against a bad fee feed. `SendWalletView.swift`
is a two-stage Review → Confirm sheet; on mainnet the Confirm button stays disabled
until the "I confirm sending real … on mainnet." toggle is on. A DEBUG
visual-acceptance seam (`--send-demo-broadcast`, read in `App/ContentView.swift`)
can auto-confirm, but `SendWalletView` only fires it when `isTestnet` is true.

## 11. Verification

What the code and git history show (opened on this branch):

- **Web crypto tests**: `packages/crypto/src/__tests__/wallet.test.ts` (derivation,
  14 cases), `wallet-tx.test.ts` (signing, 18 cases), `wallet-send.test.ts` (send
  helpers, 13 cases). Three external iancoleman.io/bip39 anchors prove
  standard-wallet importability; signing tests anchor on the same mnemonic (ETH sigs
  recover `0x9858…Eda94`, BTC inputs owned by `bc1qcr8te4…306fyu`). `task_plan.md`
  (5c) records the full crypto suite at 119 passing after `wallet-send.ts` landed;
  that count was not re-run for this document.
- **Go tests**: `broadcast_provider_test.go` (BTC + ETH `httptest` round-trips,
  upstream rejection, malformed hex, unknown network, `IsWellFormedRawTxHex`) and
  `txprep_provider_test.go` (UTXOs, bad address, fee tiers incl. testnet→mainnet
  fallback and no self-loop, nonce, gas with and without priority fee, unknown
  network). `txprep_live_integration_test.go` is opt-in (`//go:build integration`)
  and hits the real nodes. These were not re-run here: the module dependencies are
  not in this environment's local Go module cache, so an offline
  (`GOPROXY=off`) `go test ./internal/service/` stops at module lookup.
- **Live testnet broadcast (web path)** — recorded in `task_plan.md` §5c and commit
  `c3235d9` ("live testnet broadcast proof … txid 10622ca6…"): `task_plan.md` gives
  txid `10622ca67545a9cd955ab7e7ac231fa5d95e1110e36da449936a556d76a6f9a1`, 1 input of
  3618 sat → 2000 sat self-send + 1336 sat change, fee 282 sat / vsize 140, with the
  fee taken from the mainnet fallback. The proof ran through
  `scripts/live-testnet-send.ts`, which uses the same `@authbox/crypto` signer as the
  dialog but POSTs the signed hex **directly** to `https://mempool.space/testnet/api/tx`
  (script L80), not through `POST /wallet/broadcast`. So the Go relay is proven by its
  unit tests, and a live broadcast through the relay itself is unverified in the repo.
  The on-chain status of the txid was not re-checked for this document.
- **Live testnet broadcast (iOS path)** — recorded in `task_plan.md` §WALLET-SEND R3-c
  and commit `95d2a3a`: txid `12a19a5b844e7eef…f5e4d6b4`, fee 141 sat, reported as
  confirmed on testnet. Not re-checked here.
- **Web Send dialog render** — `task_plan.md` §5c records a full-stack run (local
  Postgres + Go API + web dev) that rendered the dialog with zero console errors;
  the screenshots sit under the gitignored `design/visual-acceptance/` and were not
  opened for this document.
- **iOS crypto**: `WalletTests` (13 cases), `WalletTxTests`, `WalletTxBtcTests`,
  `RLPTests` under `apps/ios/AuthBoxCrypto/Tests/AuthBoxCryptoTests/`;
  `task_plan.md` records 96/96 AuthBoxCrypto tests green after Send.
- **iOS visual verification (3 rounds, iPhone-17 simulator)**:
  `AuthBoxUITests/WalletFlowUITests` (xcodebuild test PASSED, per `task_plan.md`). A
  DEBUG-only `--wallet-demo-seed` hook boots an unlocked vault from the public test
  mnemonic. `task_plan.md` lists seven PNGs under `state/screenshots/authbox-ios-uxmap/`
  in the owner's AI-Fleet workspace (not in this repo; not opened here): empty state
  (R1), BTC add + derived address + live balance (R2), ETH EIP-55 + multi-coin list +
  balance (R3). The Send sheet's three polish rounds are listed in `task_plan.md`
  §WALLET-SEND.

## 12. Phased delivery (actual state)

- **Phase 0 — Architecture** (this doc). DONE.
- **Phase 1 — Crypto foundation** (`wallet.ts` + tests). DONE.
- **Phase 2 — Schema + shared types** (`Wallet*` types + Zod, watch-only). DONE.
  Since then the unused Zod schemas were deleted (commit `29ad87f`, 2026-11-27) and
  the wallet DTO now lives in the shared API client (`WalletAccountDTO` in
  `packages/api-client/src/client.ts`, commit `4089e59`); the Go API is the
  validator of record.
- **Phase 3 — API (read)**: account CRUD + balance via public indexers. DONE.
- **Phase 4 — Web UI**: accounts, receive addresses, balances. DONE.
- **Phase 5a — Signing (web)**: client-side build/sign in `wallet-tx.ts`. DONE.
- **Phase 5b — Broadcast relay**: `POST /wallet/broadcast`, Go forwards signed bytes
  to fixed endpoints and never signs (`broadcast_provider.go`, commit `30cf115`). DONE
  2026-06-17 per `task_plan.md`.
- **Phase 5b2 — Transaction-prep reads**: `GET /wallet/btc/utxos`, `/wallet/btc/fees`,
  `/wallet/eth/nonce`, `/wallet/eth/gas` (`txprep_provider.go`, commit `ab16449`).
  DONE 2026-06-17 per `task_plan.md`.
- **Phase 5c — Send UI**: `wallet-send.ts` (commit `a13ffd1`) + two-stage Send dialog
  (commit `be6ede8`) with the mainnet double-confirm gate; change tracking and
  seed-to-account check added in `01583fb`. DONE per `task_plan.md` (heading reads
  "WIRED"; the live testnet proof and render check under it are ticked).
- **iOS 5a/5b/5c — Native parity + local-first UI + 3-round visual verify**. DONE.
- **iOS Send (§WALLET-SEND)** — native BTC + ETH signers, local-first tx-prep and
  broadcast, Send sheet with mainnet toggle (commits `e3e7bc1`, `ec38078`, `5ea950b`,
  `95d2a3a`). DONE 2026-06-18 per `task_plan.md`.

Open points (for the owner; not changed in code by this document):

- **Mainnet sends have not been exercised.** Every recorded broadcast is testnet.
  A first mainnet send moves real funds and is an owner-only action.
- **Where the mainnet gate lives.** Web enforces it only through the Confirm button's
  `disabled` state; the relay accepts mainnet bytes from any authenticated session.
  Whether to add a second, server-side or handler-side check is a product/security
  decision.
- **Relay never proven live.** The web live proof bypassed `POST /wallet/broadcast`
  (§11). A testnet send through the running dialog would close that leg.
- **Fee ceilings.** Web BTC caps the fee rate at 5000 sat/vB; web ETH and native iOS
  BTC/ETH have no ceiling in repo code (§5, §10). Whether to add one is a
  security decision.
- **Legacy BTC send on web.** The web form creates Legacy (P2PKH) accounts, but the
  Send dialog cannot sign for them (§8.3). Either supply `prevTxHex` or stop
  offering Send for those accounts.
- **No audit record of broadcasts.** A successful relay leaves no audit-chain entry
  (§9).
- **Web onboarding.** `task_plan.md` (5c, "Onboarding dead-end") records that the
  `/create` path never obtains a server session, so the server-backed wallet is only
  reachable after `/register`. That is a separate product decision tracked there.

## 13. Non-goals (this iteration)

- Custodial holding of any kind.
- Server-side key storage or server-side signing.
- DeFi / swap / bridging.
- Privacy coins or non-secp256k1 chains (Solana, etc.) — deferred.

---
Maurice | maurice_wen@proton.me
