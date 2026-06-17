# Auth Box — iPad Design Language (WP-021)

> Canonical translation reference for turning the won bake-off direction into
> SwiftUI iPad-adaptive screens. Source of decision: `design/bigao-result.json`
> (winner = **B-inspector**) + the real HTML drafts under `design/ipad-bakeoff/`.
> Tokens: `design/tokens/vault-onyx.tokens.json` + `vault-onyx.css`.

## 1. The decided idiom (app-wide)

```
┌──────┬─────────────────────┬──────────────────┬─────────────┐
│ RAIL │  MASTER (sidebar/    │   DETAIL         │  INSPECTOR  │
│ 72pt │  content List)      │   (pinned record)│  (collapsible)
│ icon │  grouped sections   │                  │  metadata/  │
│ modes│  + .searchable      │                  │  actions    │
└──────┴─────────────────────┴──────────────────┴─────────────┘
  TabView        NavigationSplitView(sidebar/content/detail)    .inspector
```

Three composed SwiftUI primitives:

1. **RAIL = outer `TabView`** — top-level app modes (Vault / Generator / Wallet /
   Settings). On iPad regular width SwiftUI renders a `TabView` as a slim leading
   rail automatically (iOS 18+ `TabView` sidebar adaptation); on iPhone compact it
   becomes the bottom tab bar — **this is today's iPhone app, zero rework**.
2. **MASTER + DETAIL = `NavigationSplitView`** inside each tab — master is a grouped
   `List` with `.searchable`; selecting a row drives the detail. On compact it
   auto-collapses to a `NavigationStack` push flow (free).
3. **INSPECTOR = `.inspector(isPresented:)`** on the detail view — the collapsible
   right panel for secondary metadata/security/actions. Native `.inspector`
   auto-collapses under width pressure; on compact, present as a `.sheet` with
   `.presentationDetents` OR fold inline at the bottom of the detail scroll.

**Graft from direction A** (removes B's only weakness): let credential CATEGORIES be
a real `NavigationSplitView` sidebar column so the compact collapse is near-zero
custom code; the icon rail stays for app *modes*, the split sidebar holds *categories*.

## 2. Token → SwiftUI bridge

The HTML drafts consume `--vo-*` CSS vars; SwiftUI cannot read CSS vars, so mirror
the token VALUES into an asset-catalog `Color` set + a `Color` extension. Authoritative
hex lives in `vault-onyx.tokens.json` — never hand-type a second copy; generate the
Swift from the JSON (extend the existing `pnpm run gen:swift-catalog` codegen or add a
small token codegen). Key roles:

| Token role | hex | SwiftUI use |
|---|---|---|
| surface | `#0b1326` | window background |
| surface-container | `#171f33` | cards / List rows |
| surface-container-highest | `#2d3449` | inputs / selected row |
| primary | `#c3c0ff` | accent text/icons on dark |
| primary-container | `#3730a3` | brand fill / hero gradient start |
| secondary | `#ffb77d` | amber accent (lock, warnings) |
| tertiary | `#68dba9` | success / TOTP ring / "copied" |
| error | `#ffb4ab` | error |
| outline-variant @ 20% | `#464553` | ghost border (depth via tonal tiers, not 1px lines) |

Rules carried from VAULT ONYX: **no 1px solid borders** (use surface-tier shifts for
depth); ambient shadows are tinted-indigo, never pure black; hero CTAs use the 135°
primary→primary-container gradient; ring gauges (TOTP/health) use `Circle().trim().stroke`
with the tertiary token.

## 3. Per-screen mapping

### 3.1 Vault (flagship — full bake-off winner)
- RAIL: Vault tab active.
- SIDEBAR: credential categories (Logins / Servers & Tokens / Payments / Wallets /
  Secure Notes) — grafted from A as a real collapsible column.
- CONTENT: credential `List` for the selected category, `.searchable`, add (+) toolbar
  button, category chip filter, dense rows (favicon, username, inline TOTP dot, safety dot).
- DETAIL: credential record — Credentials card (copy/reveal), One-Time Password card
  (monospaced code + `Circle().trim` countdown ring in tertiary), Website, Notes.
- INSPECTOR: security score ring (graft A's larger ring + "HIBP checked N min ago" +
  password-age), health chips (HIBP/reuse/2FA/age), metadata rows, favorite/move/export/delete.
- COMPACT: rail→bottom tabs; sidebar+content+detail→NavigationStack pushes; inspector→sheet.

### 3.2 Wallet (bake-off winner = B)
- SIDEBAR: chains + watch-only portfolio total card ("only xpub/zpub stored, keys never leave hardware").
- CONTENT: accounts `List` for the selected chain (coin badge, script-type tag, truncated address, balance+fiat).
- DETAIL **pinned** (value-bearing — never a popover): balance hero + receive address (QR +
  verified/fresh safety chips + copy/share) + derived-address table (path, per-row balance, copy).
- INSPECTOR: account metadata, zpub, security posture, rename/rescan/export, danger zone.
- Watch-only framing explicit (仅查看·无私钥 pills) on every pane.

### 3.3 Settings (applied language)
- `NavigationSplitView` categories sidebar (Account / Security / 2FA / iCloud Sync /
  Pro / About) + detail pane. **No inspector** (settings detail is self-contained).
- The iCloud Sync toggle binds the real `VaultSyncEngine` (already wired); Pro detail = `ProUpgradeView`.

### 3.4 Onboarding (applied language)
- Full-screen modal, **not** a split surface: centered Create-vault (BIP-39 mnemonic
  ceremony) vs Restore on a generous iPad canvas (max content width ~720pt, centered,
  generous vertical rhythm). Same on compact, narrower.

### 3.5 Generator (applied language)
- iPad: controls master (length/charset/deterministic toggles) + live-preview detail
  (generated password, strength, history). Compact: single centered card with controls
  above preview.

## 4. Acceptance hooks (WP-021 R3–R6)
- R3: every screen uses `NavigationSplitView`/`TabView` adaptation + `horizontalSizeClass`;
  iPad shows multi-pane, iPhone collapses to today's stack — no feature loss.
- R4: `xcodebuild ... -destination 'platform=iOS Simulator,name=iPad Pro 13-inch ...'` build + tests GREEN.
- R5: 3 rounds of visual polish on the iPad simulator (real device-pixel screenshots inspected).
- R6: UX-map simulation per journey; every read-binding has a writer (no stub passes as done).

---
Maurice | maurice_wen@proton.me
