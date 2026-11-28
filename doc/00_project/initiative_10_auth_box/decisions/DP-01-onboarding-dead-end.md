# DP-01: Web onboarding dead-end (`/create` local-only vs server-backed vault guard)

> 中文摘要
> - 落地页 "Get Started Free" 指向 `/create`（纯本地助记词流程，只在内存写入 `vaultKey`），但 `(vault)` 布局守卫在没有服务器 `sessionToken` 时跳转 `/login`，首次用户必然卡死；`/restore` 同样如此。`/login` 唯一出路是去 `/register` 新建账户，刚抄下的 24 个词对它无效。
> - 选项：(A) 服务器账户路线：入口改指 `/register`，重写 `/create` 及"无邮箱/无服务器"文案；(B) 真正本地优先：为整个 vault 区建立无服务器模式（大改）；(C) 临时止血：只改入口并下线 `/create`、`/restore`，文案留待决定。
> - 安全风险：已登录用户若经客户端导航（如 `/unlock` 的 Logo 回到首页）进入 `/create`，种子密钥会替换内存中的服务器 `vaultKey` 而 `sessionToken` 仍在，之后新增条目会用错误密钥加密并上传，正常登录后无法解密。另：24 词单独不能恢复，`/create` 的 "Device Password" 是 BIP-39 口令。
> - 建议 A（代码支持：服务器只有邮箱 + SRP 登录路由，所有 vault 页面都依赖 `sessionToken`），可先做 C 止血。这是产品定位决定，归 Maurice。

Status: open, owner decision. Source checkbox stays `[ ]`. No code was changed for this pack.

## 1. Context

Line numbers cited for `task_plan.md` refer to `main` at `186f009`. This branch adds decision-pack link lines to that
file, which moves later rows down by a few lines.

Source row: `doc/00_project/initiative_10_auth_box/task_plan.md` line 532, under the heading at line 531
("卡点 discovered by the UX-map walkthrough (2026-06-17) — needs Maurice's PRODUCT decision"). The row says:
"Get Started Free" goes to `/create`, which only sets the in-memory `vaultKey` and never a server `sessionToken`;
the `(vault)` layout guard sends a missing token to `/login`; so first-run users dead-end. It lists (A) server-backed
and (B) true local-first, leans to A "consistent with the server-backed wallet", and flags it for Maurice.

What the code shows today (all paths under `apps/web/` unless noted):

| Step | Evidence |
|---|---|
| Landing hero CTA | `app/page.tsx:118` `<Link href="/create">` "Get Started Free"; footer `app/page.tsx:319` also `href="/create"`. |
| Landing promise copy | `app/page.tsx:113-114` "24 words. That's all you need. No email, no account, no server dependency. Even if we disappear, your passwords survive."; `:40-43` "How it works" seed steps ("No email needed", "24 words = full recovery. Even without us."); `:48-49` "No Email Required ... No signup, no account, no email."; `:53-54` "Survive Without Us"; `:57-58` "Passwords Without Storage ... Vault can be empty."; `:267` "The server never sees any of them." |
| `/create` flow | Five steps (`app/(auth)/create/page.tsx:19`): generate, write down 24 words, re-type 3 of them, set a "Device Password" of 8+ chars, "ready". `:73-77` derives `mnemonicToSeed(mnemonic, masterPassword)` + `deriveAllKeys` and calls only `unlockVault(keys.vaultKey)`; the "Device Password" is the BIP-39 passphrase (`packages/crypto/src/seed.ts:144-147` salts PBKDF2 with `'mnemonic' + passphrase`), so it encrypts nothing on the device despite `:245`, and the 24 words alone do not reproduce the key: recovery needs the words plus that exact password (`restore/page.tsx:82` does the same). This makes "24 words = full recovery" (`app/page.tsx:43`) and "24 words. That's all you need" (`:113`) inaccurate even for the local flow; `:82` pushes `/passwords` after 1.5 s. Copy `:124` "No email. No account. No server dependency."; `:245` "It works offline -- no server involved." Nothing is persisted (no storage or API call in the file). `:138-139` links to `/restore`. |
| `/restore` flow | Same pattern: `app/(auth)/restore/page.tsx:83-88` calls only `unlockVault` then pushes `/passwords`; `:155` links back to `/create`. Same dead-end. |
| Arrival at `/passwords` | `app/(vault)/passwords/page.tsx:30-36` calls `syncVault()` because `status` is `unlocked`; `lib/vault-service.ts:36-37` throws "Vault is locked" when `sessionToken` is null, which the page stores as its error (`:34`, rendered at `:128`); the layout effect then redirects to `/login`. |
| Where the user lands | `/login` asks for email + master password and gives no reason for the redirect (`app/(auth)/login/page.tsx:95-106` shows only the post-register notice). Its only way forward is "New to Auth Box? Create an account" (`:238-240`) to `/register`, whose heading is again "Create Your Vault" (`register/page.tsx:65`) with a 12-char rule. The 24 words just written down cannot open that account (see "Key models differ"), so the user's `/create` work is lost. |
| Landing links | `/register` is linked only from `/login:239` (grep of `apps/web/app`). The landing offers `/create` (CTA, footer "Get Started") and footer "Sign In" to `/login` (`app/page.tsx:322`); no direct sign-up link. |
| Store | `lib/vault-store.ts:58-72`: `setSession` sets `sessionToken`; `unlockVault` sets only `vaultKey` + `status`. Memory only. |
| Guard | `app/(vault)/layout.tsx:34-36` `if (!sessionToken) { router.push('/login') }`; `:40-41` locked goes to `/unlock`. No `middleware.ts` exists in `apps/web`. |
| Vault pages need the server | `lib/vault-service.ts:35-43,99-113,189-194` require `sessionToken` and call `vaultApi`; `sessionToken` is read in `app/(vault)/{agents,audit,authorizations,settings,wallet}/page.tsx`; wallet calls `walletApi.listAccounts(sessionToken)` (`app/(vault)/wallet/page.tsx:179-181`). |
| `/unlock` | `app/(auth)/unlock/page.tsx:26-32` needs a token, else `/login`; then fetches the server-held encrypted vault key. |
| Working onboarding | `app/(auth)/register/page.tsx:51-52` calls `register(email, password)` then `/login?registered=true`; `lib/auth.ts:42-70` builds salt, SRP verifier and a random vault key wrapped by the Argon2id `encKey`. `app/(auth)/login/page.tsx:36-40` sets session + vault key, then `/passwords`. |
| Server auth surface | `services/api/cmd/api/main.go:188-191`: the only public auth routes are `/auth/register`, `/auth/login/init`, `/auth/login/verify`, `/auth/login/totp/verify` (email + SRP); `:199-207` (logout, sessions, TOTP) need an existing session. No seed-based auth route found. |
| Key-swap hazard (signed-in user) | `/create` and `/restore` sit in the unguarded `(auth)` group, whose logo is a client-side `<Link href="/">` (`app/(auth)/layout.tsx:14`), and the landing CTA is a client `<Link>` (`app/page.tsx:118`), so in-app navigation keeps the Zustand store. A signed-in user who locks (`(vault)/layout.tsx:45-48` keeps `sessionToken`), goes to `/` and runs `/create` gets `unlockVault(seedKey)` with the server `sessionToken` still set; the guard then admits `/passwords`. `syncVault` cannot decrypt any server item and keeps nothing (`lib/vault-service.ts:73-78`, items were cleared by `lockVault`), so the vault looks empty; new items are encrypted with the seed key and uploaded (`createVaultItem` from `passwords/page.tsx:54`, `api-keys/page.tsx:137`, `import-dialog.tsx:145`). The server cannot tell (it stores ciphertext only), and after the next normal login those items fail to decrypt and are dropped with a console error. Read from code, not reproduced. |
| Key models differ | `/create` key = `deriveAllKeys(seed).vaultKey` (`packages/crypto/src/seed.ts:335-342`); `/register` key = random `generateVaultKey()` (`lib/auth.ts:56`). A `/create` key cannot open a `/register` vault. |

Root contradiction: the web marketing and `/create` promise local-first; every page behind the guard is server-backed.
(The native apps are local-first: `apps/macos/AuthBoxMac/Features/Onboarding/OnboardingView.swift:3-8` provisions from a
mnemonic that is never persisted. That is context for positioning, not a web code path.)

## 2. The decision

Maurice decides whether the web product is an email + SRP account service (fix the entry and the copy) or a
local-first vault (build a server-less vault area), and in the meantime whether to stop sending new users to `/create`.

## 3. Options

### (A) Server-backed web: repoint to `/register`, rework `/create` copy

- Gets: first-run users land in the flow that already works end to end (`/register` then `/login` then `/passwords`).
  Web matches the wallet's watch-only-server model (`doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.md`
  §5 "Security model — self-custodial + watch-only server"; line 53 at branch head 1b7f122, line 50 on `main` 186f009).
- Files that would change: `apps/web/app/page.tsx` (CTA hrefs at 118 and 319; copy at 40-43, 48-49, 53-54, 57-58,
  113-114, and possibly 267); `apps/web/app/(auth)/create/page.tsx` and `apps/web/app/(auth)/restore/page.tsx` (retire, redirect to
  `/register`, or relabel as "offline key tool" with no `/passwords` hand-off); `README.md:20,26,51` (same promises).
- Risk to SRP/session code: none required. `lib/auth.ts`, `lib/vault-store.ts`, `app/(vault)/layout.tsx` and the Go
  handlers stay as they are. One condition: if `/create` is kept as an "offline key tool", it must stop calling
  `unlockVault` on the shared store (and `/restore` too), otherwise the key-swap hazard above stays.
- Privacy copy that must change: "No email, no account, no server dependency", "No Email Required ... no signup",
  "Survive Without Us / Even if we disappear, your passwords survive", "Create a vault in 45 seconds", the seed-based
  "How it works" steps, and "Passwords Without Storage". The last one matters: the derive dialog uses the vault key as
  seed material (`components/vault/derive-password-dialog.tsx:48-57`), and a `/register` vault key is random
  (`lib/auth.ts:56`), so derived passwords are not recoverable from 24 words for server accounts. The zero-knowledge
  claims ("The server never sees any of them", `register/page.tsx:68` "We never see it, store it, or transmit it") can
  stay if they remain true of SRP; that truth check is unverified here.
- Consequences: gives up the "no email" positioning on web; web and native onboarding differ (email vs mnemonic).
  Minimum password rule differs today (`create` 8 chars at `:63`, `register` 12 at `:37`); copy should name 12.
  The working journey still has two forms: `/register` ends at `/login?registered=true` (`register/page.tsx:52`), where
  the user signs in again (`login/page.tsx:100-106` notice); folding these into one step would be a separate UX change.
- Undo: yes. Links and copy revert by commit; no data or schema change. Retiring `/create` strands no one: it and
  `/restore` persist nothing (no storage or API call in either file, grep).

### (B) True local-first web vault

- Gets: keeps the current promises; aligns web with the native mnemonic model.
- Files that would change (at minimum): `lib/vault-store.ts` (a local-session state distinct from `sessionToken`);
  `app/(vault)/layout.tsx` (guard accepts a local session); `lib/vault-service.ts` (local encrypted store, e.g.
  IndexedDB, instead of `vaultApi`); `app/(auth)/create/page.tsx`, `restore/page.tsx`, `unlock/page.tsx` (persist and
  re-open a local vault); every page under `app/(vault)/` that calls a server API (agents, audit, authorizations,
  settings, wallet) needs a server-less behaviour or must be hidden; later, a sync design that bridges seed-derived keys
  (`packages/crypto/src/seed.ts:335`) and the server account model (`lib/auth.ts:42-70`).
- Risk to SRP/session code: high. It touches the session guard and adds a second session kind next to SRP; the two
  kinds must never share one `vaultKey` slot with a server `sessionToken` (the key-swap hazard above); the Goal
  Contract (`goal/GOAL_LOOP_PLAN.md`, "Out of scope") forbids this on the current branch.
- Privacy copy: can stay, but "Survive Without Us" must then be proven for browser storage loss (unverified design).
- Consequences: largest rework; two key models to keep correct; agent gateway, audit and wallet features have no
  local equivalent today.
- Undo: partly. Code reverts, but any user vaults created in browser storage would be stranded by a later reversal.

### (C) Interim stop-gap: stop routing new users into `/create` and `/restore`

- Gets: removes the dead-end within one small change while A or B is decided.
- Files that would change: `apps/web/app/page.tsx` (hrefs 118 and 319 to `/register`); `create/page.tsx` and
  `restore/page.tsx` (redirect to `/register`, or a notice that local vaults are not available on web yet);
  the `create/page.tsx:138-139` and `restore/page.tsx:155` cross-links (otherwise each still leads into the other).
  The rest of the path already works: `/register` then `/login` then `/passwords`, and `/login:239` links back to `/register`.
- Risk to SRP/session code: none. Redirecting `/create` and `/restore` (rather than only repointing the landing links)
  also closes the key-swap hazard, because no page then calls `unlockVault` with a seed key.
- Privacy copy: unchanged, so the hero still says "No email" while the CTA asks for an email. This contradiction is
  the known cost; it should not outlive the A/B decision.
- Consequences: honest only as a short bridge; it keeps option B open because nothing is deleted.
- Undo: yes, trivially.

## 4. Recommendation

Option A, with C as the same-day bridge if the copy rewrite needs review time. Main reason: the code already commits the
web vault to the server. The only public (session-creating) auth routes are email + SRP (`services/api/cmd/api/main.go:188-191`), every
guarded page needs `sessionToken` (`app/(vault)/layout.tsx:34`, `lib/vault-service.ts`), and the `/create` key is a
different key model that cannot open a server vault, so B is a new product surface, not a fix. This matches the lean
in the source row. It is still a product-positioning call: if Maurice wants "no email" to be the web promise, B is the
only honest path and the recommendation does not apply.

## 5. Owner's exact next steps

1. (Owner only) Choose A, B, or C-then-A/B, and say so in one line (for example "DP-01: C now, then A"). The
   agent then records it under the source row (`task_plan.md` line 532) and adds a link to this pack.
2. (Owner only) If A: approve the replacement wording for the hero (`app/page.tsx:113-114`), the "How it works"
   steps (`:40-43`), the promise cards (`:48-58`), and `README.md:20,26,51`. Decide whether `/create` is retired or kept as an offline tool.
3. (Agent, after step 1) Open a separate branch and implement the chosen option; for A/C no file under `lib/auth.ts`,
   `lib/vault-store.ts` or `app/(vault)/layout.tsx` changes.
4. (Agent) Verify the journey on the local stack described at `task_plan.md` line 527: local Postgres on :5432
   (database `auth_box`), `cd services/api && go run ./cmd/api` (API on :4010, the web default at
   `apps/web/lib/api.ts:7`), and `cd apps/web && pnpm dev` (`next dev --port 3010`, `apps/web/package.json:6`; repo uses pnpm, `package.json:5`);
   the API's own env vars are not listed here (unverified). Then check at http://localhost:3010: landing, "Get Started Free", register, login, `/passwords` loads with no redirect to `/login`; and typing `/create`
   or `/restore` directly no longer ends on `/login`; and, signed in, Lock, click the `/unlock` logo to `/`, then
   "Get Started Free": `/passwords` must not open with a seed-derived key (no item written under a key other than
   the account's).
5. (Owner only) If B: approve a separate design doc for local storage, key model and sync before any code, since it
   changes the session guard (outside this branch's allowed scope).

## 6. Verified vs unverified

Verified by opening the file: `apps/web/app/page.tsx`, `apps/web/app/(auth)/{create,restore,register,login,unlock}/page.tsx`,
`apps/web/app/(auth)/layout.tsx` (no guard), `apps/web/app/(vault)/layout.tsx`, `apps/web/lib/vault-store.ts`,
`apps/web/lib/auth.ts`, `apps/web/lib/api.ts`, `apps/web/package.json:6`, root `package.json:5`, `apps/web/lib/vault-service.ts` (`:30-90`, `:185-196`, grep for the rest),
`packages/crypto/src/seed.ts:141-149` (`mnemonicToSeed` passphrase), `createVaultItem` callers (grep), `apps/web/app/(vault)/passwords/page.tsx:1-45`,
`apps/web/components/vault/derive-password-dialog.tsx` (grep), route links across `apps/web/app` (grep for `/register`, `/create`, `/restore`, `/login`), `apps/web/app/(vault)/wallet/page.tsx`
(grep), `packages/crypto/src/seed.ts:325-342`, `services/api/cmd/api/main.go:188-207` (grep), `README.md` (grep),
`apps/macos/AuthBoxMac/Features/Onboarding/OnboardingView.swift` (grep). Absence of `apps/web/middleware.ts` checked.

Unverified:
- The dead-end was not reproduced in a running browser for this pack; it is read from code (guard runs in a client
  `useEffect`, so the redirect fires after `/passwords` first renders). Whether the "Vault is locked" error is visible
  before the redirect depends on effect and render timing and was not observed.
- The key-swap hazard was traced in code only (client navigation keeps the in-memory store; a full page load clears it,
  so typing a URL does not trigger it). Whether a user would take this path in practice is unverified.
- Whether SRP-era zero-knowledge claims (`app/page.tsx:267`, `register/page.tsx:68`) are accurate in full.
- No end-to-end test covering `/create` was found (`tests/` holds only `test_all.py`; grep found no `/create` reference).
- Incidental: `app/(auth)/unlock/page.tsx:26,56` reads and removes `sessionStorage['authbox_session']`, but no web code
  writes that key (grep), while the layout comment (`app/(vault)/layout.tsx:32`) says no sessionStorage is used. Dead
  read; noted for the implementing branch, not changed here.
