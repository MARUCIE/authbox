# Auth Box Web — Page Map & User Journey

Purpose: the canonical map of every user-facing surface, walked in journey order
for visual verification (按图索骥). Each row is a checkpoint; friction found at a
checkpoint is logged as a 卡点 with a fix.

Stack: Next.js 15 web on :3010 → Go API on :4010. Auth = SRP; vault unlock
re-derives the key from the seed; session token lives in Zustand memory only.

## Page inventory

| # | Route | Group | Purpose | Auth state | Notes |
|---|-------|-------|---------|-----------|-------|
| 1 | `/` | (marketing) | Landing / value prop | none | entry point |
| 2 | `/register` | (auth) | Create account (email + SRP verifier) | none | |
| 3 | `/create` | (auth) | Generate 24-word seed, confirm backup | none | seed shown once |
| 4 | `/login` | (auth) | SRP login → session token | none | |
| 5 | `/unlock` | (auth) | Re-derive vault key from seed | session, locked | |
| 6 | `/restore` | (auth) | Recover account from seed phrase | none | |
| 7 | `/passwords` | (vault) | Password items CRUD | unlocked | nav #1 |
| 8 | `/authorizations` | (vault) | Agent authorizations | unlocked | nav #2 |
| 9 | `/api-keys` | (vault) | API key items | unlocked | nav #3 |
| 10 | `/agents` | (vault) | AI agent registry + policies | unlocked | nav #4 |
| 11 | `/audit` | (vault) | Audit log + chain verify | unlocked | nav #5 |
| 12 | `/settings` | (vault) | Account / TOTP / security | unlocked | nav #6 |
| 13 | `/wallet` | (vault) | **Crypto wallet (BTC/ETH)** | unlocked | **MISSING — feature has no page or nav entry** |

## Journey order (the route we walk)

```
(unauth)  1 / landing
            → 2 /register → 3 /create (seed) → 4 /login → 5 /unlock
(unlocked) → 7 /passwords → 8 /authorizations → 9 /api-keys
            → 10 /agents → 13 /wallet → 11 /audit → 12 /settings
            → lock → logout
```

## 卡点 ledger (filled during the walk)

| ID | Page | Friction observed | Severity | Disposition | Re-verified |
|----|------|-------------------|----------|-------------|-------------|
| GAP-WALLET | nav + /wallet | Wallet feature shipped (P1-P3: crypto derivation, watch-only API, balance provider) but had NO web page and NO sidebar entry — user could not reach it at all. | blocker | **FIXED** — built `app/(vault)/wallet/page.tsx` + added Wallet nav item in `(vault)/layout.tsx`. Client-side BIP-32/44/84 derivation, watch-only server, on-demand mnemonic (never persisted). | YES — added BTC + ETH accounts in the live browser; both derived addresses match the audited crypto package and external BIP-84/BIP-44 anchors (see Evidence). |
| GAP-SESSION-PERSIST | all (vault) routes | Hard refresh / direct URL to any protected route bounces to `/login` (full re-auth), not `/unlock` — the whole session is lost on reload. | medium | **BY DESIGN, not a bug.** `(vault)/layout.tsx:31` documents it: "Session token lives only in Zustand memory (no sessionStorage)." A zero-knowledge vault deliberately refuses to persist the session token; reload ⇒ re-auth. Adding persistence would weaken the security posture and needs an explicit architecture decision, so it is recorded, not changed. | n/a |
| GAP-ONBOARDING-SEED | /register vs /create | Two onboarding flows with different key provenance: `/register` (`auth.ts` → `generateVaultKey()`) creates a RANDOM vault key with no mnemonic; `/create` derives the vault key from a 24-word seed. The wallet's "your 24-word vault seed is also a crypto wallet" framing only holds for `/create` users. The wallet page still works for everyone (user supplies any BIP-39 mnemonic on demand), so this is a messaging/onboarding inconsistency, not a wallet defect. | low | **DOCUMENTED, not fixed.** Unifying the two flows touches core auth/onboarding and is an architecture decision outside this goal's scope. Recommendation: converge onboarding on the seed-derived flow, or soften the wallet copy. | n/a |
| GAP-LANDING-WALLET | / (marketing) | Landing "Three Pillars" markets Passwords / Authorization / AI Agent; the crypto wallet capability is absent from marketing copy. | low | **DOCUMENTED, not fixed.** Pure marketing copy; no functional impact. Recommendation: add a wallet pillar/section when the feature is announced. | n/a |
| NOTE-DEVTOOLS-OVERLAP | all (vault) | The Next.js dev-tools "N" badge overlaps the "Sign Out" label bottom-left. | none | **Not a real issue** — dev-only indicator, absent in production builds. | n/a |

## Evidence (real browser, real derivation)

Client-side derivation proven against external anchors (no fabrication):

- BTC native segwit, 24-word `abandon…art`, `m/84'/0'/0'/0/0` →
  `bc1qzmtrqsfuaf6l6kkcsseumq26ukaphfj9skkug6` — matches the audited
  `@authbox/crypto` package byte-for-byte (cross-checked in node).
- BTC native segwit, 12-word `abandon…about` → `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu`
  (BIP-84 spec vector).
- ETH, 12-word `abandon…about`, `m/44'/60'/0'/0/0` →
  `0x9858EfFD232B4033E47d90003D41EC34EcaEda94` (EIP-55 checksum) — canonical anchor,
  produced live in the browser.
- Full UI CRUD cycle verified: create (BTC+ETH) → list (multi-coin) → refresh
  balance (cached→live badge, watch-only endpoint round-trip) → delete both →
  empty state. Screenshots `state/screenshots/authbox-uxmap/13..19`.

## Verification method

Per the visual-verification gate: capture each page with
`mcp__chrome-devtools__take_screenshot` (primary), save to
`state/screenshots/authbox-uxmap/<n>-<route>.png`, inspect, log friction, fix,
re-screenshot the fixed page. A checkpoint is DONE only when its screenshot
shows no unresolved 卡点.

## Visual Verification

Real-browser screenshots captured this pass (chrome-devtools MCP, primary path),
under `/Users/mauricewen/00-AI-Fleet/state/screenshots/authbox-uxmap/`:

| File | Page / checkpoint | Result |
|------|-------------------|--------|
| `01-landing.png` | `/` marketing | OK (wallet absent from copy — GAP-LANDING-WALLET) |
| `02-register.png` | `/register` | OK |
| `07-passwords.png` | `/passwords` (unlocked) | OK |
| `08-authorizations.png` | `/authorizations` | OK (empty state) |
| `09-api-keys.png` | `/api-keys` | OK (empty state) |
| `10-agents.png` | `/agents` | OK (empty state) |
| `11-audit.png` | `/audit` | OK (empty state) |
| `12-settings.png` | `/settings` | OK (sessions + 2FA) |
| `13-wallet-r1.png` | `/wallet` empty state | NEW page reachable — GAP-WALLET fixed |
| `14-wallet-add-dialog.png` | add-account dialog | coin/network/script/label/mnemonic |
| `15-wallet-detail-r1.png` | BTC detail (round 1) | derived `bc1qzmtr…` (== crypto package) |
| `18-wallet-r2-after.png` | BTC detail (round 2) | cached badge + network safety chip + helper |
| `19-wallet-r3-multicoin.png` | BTC+ETH list + ETH detail (round 3) | ETH `0x9858…Eda94` (EIP-55 anchor) |

Layout correctness confirmed by DOM geometry (`getBoundingClientRect`): account
list and detail aside render side-by-side (list x=288 w=779, aside x=1091 w=384,
same y) — not stacked. Full UI CRUD cycle (create → list → refresh → delete →
empty) walked live. No unresolved 卡点 on the wallet surface.
