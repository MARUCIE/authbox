# DP-02: AI-Fleet key broker integration (P6 broker client + key migration)

> 中文摘要
> - 两个 "gemini-proxy"（Cloudflare Worker 与 Mac LaunchAgent）都是透传代理，代码里不持有任何 Google key，key 由调用方随请求携带；真正读取 `gemini-api-config.json` 的是本地 CLI 工具 `gemini-manager.js` / `gemini-api-switcher.js`。
> - Mac 端 broker 目前只返回允许/拒绝（`AccessEffect`），没有"交付密钥值"的能力；Worker 也无法访问 Mac 的 127.0.0.1:19876。只有 Mac 上的 LaunchAgent 代理在技术上能做 loopback 客户端，但 vault 闲置 300 秒自动上锁，无人值守取 key 会失败。
> - 选项：(A) broker 经主人批准把 key 推送到 Worker secret；(B) 仅本地消费者经 loopback broker 取 key；(C) 只轮换 + 用已有的 `api_key_secret` 间接引用，不接 broker。
> - 建议 C 先行（轮换是唯一真正降低已泄露风险的动作，且无需新代码），A/B 作为后续代码决定。key 轮换与线上代理切换只能由 Maurice 本人完成。

Status: open, owner decision plus owner-only steps. Both source checkboxes stay `[ ]`. No code in either repo was changed for this pack.

## 1. Context

Line numbers cited for `task_plan.md` refer to `main` at `186f009`. This branch adds decision-pack link lines to that
file, which moves later rows down by a few lines.

Source rows: `doc/00_project/initiative_10_auth_box/task_plan.md` line 458 ("Broker client so gemini-proxy et al. request keys
from broker instead of gemini-api-config.json") and line 459 ("Migrate AI-Fleet provider keys → broker; remove from git-tracked
config (HITL: touches live proxy)"), under the heading at line 457 ("P6 — AI-Fleet integration (bonus, fixes the 2026-06-01
git-key-leak class)").

Broker side (this repo, `apps/macos/AuthBoxMac/`):

| Fact | Evidence |
|---|---|
| WebSocket listener, loopback interface only, port 19876 | `Core/Broker/AuthorizationBroker.swift:21` (`port = 19876`), `:45` (`requiredInterfaceType = .loopback`), `:86-95` (peer must be a loopback IP literal, SEC-006). |
| Per-agent bearer token checked before any policy | `Core/Broker/AuthorizationBroker.swift:133-138`; `Domain/Delegation/DelegationModel.swift:24-47` (`AgentToken`: 256-bit token, SHA-256 hash stored, constant-time compare). |
| Response carries a decision only, never a secret value | `DelegationModel.swift:116-122` (`AccessEffect` = `allowed`, `reason`, `appliedPolicies`, `pendingApprovalId`); `AuthorizationBroker.swift:108-115` encodes and sends only that struct. |
| Deny-by-default policies, step-up via Touch ID, 60 s timeout denies | `Core/Policy/PolicyEngine.swift:47-67`, `:157-160`, `:168-191`; Touch ID gate in `Features/Authorizations/AuthorizationsView.swift` (`resolve`, after line 78). |
| Agents granted by Quick Connect get read+use, 60 req/h, step-up on every use | `Domain/Delegation/QuickConnectService.swift:62-63`, `:91-97`. |
| Broker starts on operator action (toggle or after a grant), not at app launch | `AuthorizationsView.swift:72-74`, `:167`, `:203`, `:345`. |
| `proxy` action exists in the vocabulary, but no proxying code exists | `DelegationModel.swift:50-52`; only use is the grant toggle at `AuthorizationsView.swift:453,467`. |
| Any value release needs an unlocked vault; it auto-locks after 300 s idle and on sleep | `Core/Vault/VaultSession.swift:4`, `:58` (`idleTimeout = 300`). The broker's `decide` path itself never touches the vault. |
| The app's only egress is a user-initiated health probe that sends a credential to its own provider | `Domain/Providers/CredentialHealth.swift:1-8`, `:37-60` (`URLSessionHealthTransport`, SSRF redirect guard); a `cloudflare` token-verify probe exists at `:271-272`. Nothing sends one credential to a different service. |
| A separate TS MCP server defines `get_credential` / `proxy_authenticated_request` and defaults to the same port 19876, but nothing in this repo starts that server | `packages/mcp-protocol/src/tools.ts:9,31`; `server.ts:104-108` (`AuthBoxMCPServer`, WebSocket, default port 19876) is constructed only in `server.test.ts`. The one runnable entry is the Dockerfile ENTRYPOINT `packages/mcp-protocol/dist/stdio-server.js` (`Dockerfile:24`; the package's `authbox-mcp` bin points at the same file), a stdio discovery stub whose tools answer "Vault bridge not configured" (`stdio-server.ts:37`). Useful as a value-release design reference, not as a running value-release service. |
| Agent tokens have no in-place rotation: only revoke, then a new grant | `AuthorizationsView.swift:209-212` (`revoke`), `:143-147` (new token per grant). The agent id is built from `capabilities.count` (`:115`), and the broker's map uses `Dictionary(uniqueKeysWithValues:)` (`:38`), which traps on a duplicate id; a revoke followed by a regrant under a name a surviving grant already uses can collide. Code defect for a later task; not fixed here. |
| Tests | `apps/macos/AuthBoxMacTests/BrokerTests.swift` has 9 tests (allow, unknown agent, wrong token, step-up, loopback round trip). Not run for this pack. |

Consumer side (sibling repo `/home/user/ai-fleet-os`, read-only; shallow clone, so history claims below come from its docs):

| Fact | Evidence |
|---|---|
| "gemini-proxy" #1 is a Cloudflare Worker named `gemini-api-proxy` | `workers/gemini-proxy/wrangler.toml:1-3`. It runs on Cloudflare's edge, so it can never reach a socket bound to the Mac's loopback interface. |
| The Worker holds no provider key; the caller's request carries it | `workers/gemini-proxy/index.js:3-4` (comment), `:27-31` (forwards caller headers), `:9` (`fetch(request)` takes no `env`, so no secret binding is read). |
| The Worker declares `PROXY_TOKEN` as a plaintext `[vars]` entry in a git-tracked file, and never checks it | `wrangler.toml:5-8`; no reference to it in `index.js`. Value not reproduced here. |
| "gemini-proxy" #2 is a Mac LaunchAgent running a Node passthrough on port 9099, bound to `0.0.0.0` | `configs/com.ai-fleet.gemini-proxy.plist:6,10,25-28`; `scripts/gemini-api-proxy.mjs:2-4,19,27-31`. Peer filter is the regex `^100\.` plus `127.0.0.1`, i.e. all of 100.0.0.0/8, wider than Tailscale's 100.64.0.0/10. Passes the caller's key through; holds none. On a denied request it logs the full URL, query included, so a `?key=` caller's key lands in `/tmp/gemini-proxy.log` (`gemini-api-proxy.mjs:30`; log path at plist `:20,22`); the allowed path strips the query (`:57`). Its stated purpose is egress location ("VPS is geo-restricted", `:3-4`), not key custody. It runs on the Mac, so it is the only "gemini-proxy" that could reach the loopback broker. |
| The callers of both proxies are on the VPS, off the Mac | `wrangler.toml:7` (comment), `scripts/gemini-api-proxy.mjs:10` (comment). A second Worker caller: `runtime/orchestration/x_engine/embed_bridge.py:71-77` reads `GOOGLE_AI_STUDIO_KEY` and puts it in the URL as `?key=`, with the base taken from `GEMINI_EMBEDDING_BASE_URL` (Worker on the VPS per `doc/00_project/initiative_ai_tools/FLEET_SEMANTIC_FABRIC_ARCHITECTURE.md:155-156`). That key comes from process env merged with the plaintext `~/.openclaw/.env` (`runtime/orchestration/x_engine/runtime.py:10,38-48`). Where the OpenClaw gateway itself keeps its key: unverified. |
| The real readers of `gemini-api-config.json` are two local CLI tools | `gemini-manager.js:13`, `gemini-api-switcher.js:12`. They write the chosen key in plaintext as env (`ANTHROPIC_AUTH_TOKEN` / `OPENAI_API_KEY` / `GOOGLE_API_KEY`) into `~/.claude/settings.ai-tools.proxy.json` by default, or `~/.claude/settings.json` with `--apply` (`gemini-manager.js:17,19`; `buildClaudeEnvForSource` / `switchToSource` at `:152-212`; write at `:130-145`). Its "update key" menu writes a new value inline into the config for any source without indirection (`:479-484`), and refuses for indirect ones (`:473-478`). |
| Other AI-Fleet key readers use other stores, not this file | macOS Keychain via `security find-generic-password` (e.g. `scripts/ai-api-router.sh:193`, 40 hits repo-wide); `~/.ai-fleet/device-secrets.json` (e.g. `runtime/integrations/content_pipeline/telegram_approval.py:25`). Standing rule `knowledge/facts/engineering-baseline/20-credential-handling.md:7-12` names the login Keychain with a per-read Allow prompt as the one store. |
| Those readers already support indirection: env var, then `~/.ai-fleet/device-secrets.json` path, then inline `api_key` | `gemini-manager.js:58-82` (`readDeviceSecrets`, `resolveSourceApiKey`); same in `gemini-api-switcher.js:45-67`. |
| The file is no longer tracked and is ignored | `.gitignore:427-429` (2026-06-09 containment, "values remain in git HISTORY until rotated+scrubbed"), `.gitignore:445` (`*-api-config.json`); `git ls-files` returns nothing for it. |
| Leaked values in history, rotation owed | `doc/00_project/initiative_ai_tools/SECURITY_AUDIT_fleet-secret-sweep-2026-06-01.md:15,18,37-39,107,113-119`; `knowledge/facts/engineering-baseline/36-git-push-security-gate.md:216-226` ("Owner action: rotate the values if they are live"). |

Correction to the row and to the audit: the audit's line 45 says blanking the file "breaks the running gemini-proxy". The code does
not support that: neither proxy reads the file. Blanking it breaks `gemini-manager.js` / `gemini-api-switcher.js` only.

## 2. The decision

Maurice decides whether AI-Fleet provider keys move behind the Auth Box broker at all (and if so, to the edge or to local tools),
or whether the leak class is closed by rotation plus the existing env/device-secrets indirection; the rotation and any live proxy
cutover are his to perform in any case.

## 3. Options

### A. Broker-to-edge secret sync (broker pushes to the Worker's secret store on owner approval)

- Gets: callers stop carrying the Google key; the Worker injects it from a Cloudflare secret. Rotation becomes "rotate in the
  provider console, approve one push in Auth Box".
- Costs: code in both repos. Worker: read the key and an enforced `PROXY_TOKEN` from `env` secrets (`wrangler secret put`), not
  `[vars]`. Auth Box: a new outbound "sync" feature holding a Cloudflare API token, which becomes the highest-value secret in the
  vault (it can rewrite the Worker); it needs the narrowest scope Cloudflare offers (exact permission name unverified) and its
  own rotation schedule. The broker has no egress at all; the app's health-probe transport
  (`CredentialHealth.swift:37-60`) is a reusable seam, but sending a Google key to the Cloudflare API is a new kind of flow.
  Callers must also stop sending their own key (`embed_bridge.py:77` puts it in the URL).
- Consequences: the Worker becomes a key-holding service; anyone with `PROXY_TOKEN` can spend the quota, so the token must be
  rotated (its current value is in git) and enforced first. Mac off: the Worker keeps serving with the last pushed secret;
  only rotation pauses. The Mac LaunchAgent proxy is untouched.
- Undo: yes. Delete the Worker secret, revoke the sync's Cloudflare API token and redeploy the passthrough `index.js`;
  callers go back to carrying the key.

### B. Local consumers only, via the loopback broker

- Gets: `gemini-manager.js` / `gemini-api-switcher.js` ask the broker (bearer token, policy, audit) instead of reading a file.
  Every key read becomes a sealed audit Fact (`AuthorizationBroker.swift:151-157`).
- Costs: the broker must gain a value-release response (today it returns only `AccessEffect`), which is a change to broker and
  crypto-adjacent code, out of scope on this branch. Quick Connect's default step-up means a Touch ID tap per read
  (`QuickConnectService.swift:97`). The tools then write the key into `~/.claude/settings*.json` (`gemini-manager.js:130-145`),
  so it lands on disk in plaintext anyway. The agent's bearer token (shown once, `AuthorizationsView.swift:93-95`) becomes a new
  secret the tools must store on the Mac; rotating it means revoke plus regrant under a fresh name (see the id-collision row).
- Consequences: does nothing for the Worker or the VPS callers. It could be extended to the LaunchAgent proxy (same Mac) so it
  injects the key and the VPS stops carrying it, but that consumer is unattended: it needs a no-step-up policy, the app running
  with the broker started by hand, and an unlocked vault, which auto-locks after 300 s idle (`VaultSession.swift:58`), so it
  would fail most of the time unless the lock model changes. Mac off: the LaunchAgent path is already dead then; for the CLI
  tools it is irrelevant. Vault locked or broker stopped means fail closed.
- Undo: yes. Revoke the agent grant (`AuthorizationsView.swift:209-212`) and point the source back at `api_key_secret` / env.

### C. Rotate-only, keep the existing indirection (no broker work now)

- Gets: the only step that reduces the real exposure (values in published history). Uses indirection the readers already have
  (`gemini-manager.js:74-82`); no code change. The tracked-file class is already contained (`.gitignore:429,445`) and guarded by
  the AI-Fleet pre-push gate (`36-git-push-security-gate.md`).
- Costs: keys stay in `~/.ai-fleet/device-secrets.json` or env, outside Auth Box's audit and step-up. No per-read record.
  `device-secrets.json` is a plaintext file, short of the audit's "env/Keychain" target (`SECURITY_AUDIT_fleet-secret-sweep-2026-06-01.md:45,47`) and of
  rule 20's Keychain store; the readers have no Keychain branch (`gemini-manager.js:74-82`), so Keychain means `api_key_env`
  filled from `security find-generic-password` at shell start, which prompts per read under rule 20's empty ACL.
- Consequences: both P6 rows stay `[ ]` until Maurice closes them as superseded or opens A/B (step 8); Mac off changes nothing.
- Undo: rotation cannot be undone (old keys die), which is the point; the config shape change can be reverted.

### Threat model and Mac-off summary

| Threat | A (edge sync) | B (loopback) | C (rotate) |
|---|---|---|---|
| Old values in published git history | rotation still needed first | same | closed by rotation |
| Key copied from a VPS env file (`~/.openclaw/.env`) | closed (key moves to Worker secret) | open | open (new value, same place) |
| Anyone holding `PROXY_TOKEN` spends quota | new risk, token must be secret | n/a | n/a (Worker holds no key) |
| Local process on the Mac reads the key | n/a | gated by bearer token + policy; any local process can reach the socket (`AuthorizationBroker.swift:84-85`) | open (file or env) |
| Key in a URL query (`embed_bridge.py:77`) kept in logs (`/tmp/gemini-proxy.log` on denials; Worker logs unverified) | closed only if callers stop sending a key | open | open; owner clears the log after rotation |
| Agent bearer token stolen on the Mac | n/a | token alone is not enough while step-up is on; without step-up (unattended use) it is | n/a |
| Mac off or app quit | Worker keeps last secret; only sync stops | CLI tools fail closed | no effect |

Exposing the broker to the edge through a tunnel daemon on the Mac (for example cloudflared) is not a fourth option: its
connections arrive from 127.0.0.1, so the loopback check passes for remote traffic and only the bearer token remains.

## 4. Recommendation

Option C now, then decide A or B as a separate code task. Main reason: neither proxy holds a key and the broker cannot return a
secret value today, so a broker client reduces no risk until both sides are redesigned, while rotation is the one action that
closes the 2026-06-01 exposure and needs no code. If a later step is wanted, A addresses the remote caller (the actual key
holder off the Mac); B audits two local CLI tools and reaches the LaunchAgent proxy only if the vault lock model changes.

## 5. Owner's exact next steps

Steps marked OWNER can only be done by Maurice. Run AI-Fleet commands from the AI-Fleet checkout on the Mac.

1. OWNER: rotate each key listed in `SECURITY_AUDIT_fleet-secret-sweep-2026-06-01.md:113-120` in its provider console. The
   five `gemini-api-config.json` fingerprints are rows 113 and 116-119 (Google AI Studio, Anthropic, SiliconFlow, Kimi/Moonshot,
   DeepSeek); rows 114-115 and 120 cover the same leak class elsewhere. Rotate per fingerprint: one key may also live in other
   repos (line 63).
2. OWNER: choose the new store. Either put each value in `~/.ai-fleet/device-secrets.json` and `chmod 600` it (plaintext, what
   the readers support natively), or keep it in the Keychain and export it as an env var for `api_key_env` (rule 20).
3. Do this before typing any rotated value into the tools. In the local `gemini-api-config.json`, for each `sources.<name>`
   delete `api_key` and add `api_key_secret` (dotted path into the secrets file) or `api_key_env`. Delete `api_key` even after
   adding an indirection: for an `api_key_env` source whose variable is unset the readers fall back to it
   (`gemini-manager.js:74-82`), and in every case the old value stays in the file in plaintext. The "update key" menu writes a
   typed value inline only for a source with no `api_key_secret`/`api_key_env` (`:479-484`; it refuses otherwise, `:473-478`),
   which is why this step comes before typing any rotated value.
   Check: run `node gemini-manager.js` (interactive), pick menu 6, then each source; the `当前密钥` line must read
   `<configured via ...>`, not `<configured in config>` or `<missing ...>` (`:93-104`, `:472`); press Enter to leave without typing.
4. Confirm containment: `git ls-files gemini-api-config.json` prints nothing; `git check-ignore -v gemini-api-config.json` names
   `.gitignore`.
5. OWNER (live caller): on the VPS, update the Google key wherever OpenClaw and the x_engine runtime read it (the runtime reads
   process env, then `~/.openclaw/.env`, per `runtime.py:10,38-48`), then send one test request through whichever proxy each
   uses (`google.baseUrl` for OpenClaw per `gemini-api-proxy.mjs:10`, `GEMINI_EMBEDDING_BASE_URL` for `embed_bridge.py`).
   Which proxy is live is unverified. On the Mac, clear `/tmp/gemini-proxy.log`, which can hold keys from denied requests
   (`gemini-api-proxy.mjs:30`).
6. OWNER, only after step 1: decide on a history purge. It needs a force-push, which is a confirm-first action
   (`SECURITY_AUDIT_fleet-secret-sweep-2026-06-01.md:146` says not to run the purge step before the rotation step).
7. OWNER (live Worker): decide whether the Worker is still needed. `PROXY_TOKEN` is not in the audit's rotation list (grep of
   the audit finds no match); it is unenforced today, so its leak matters only once a key sits behind it. If yes, rotate it, move it to
   `wrangler secret put PROXY_TOKEN`, remove it from `wrangler.toml` `[vars]`, and enforce it in `index.js` before redeploying
   with `wrangler deploy` from `workers/gemini-proxy/`. If no, first repoint any VPS `GEMINI_EMBEDDING_BASE_URL` that targets
   it, then run `wrangler delete` from `workers/gemini-proxy/` (name read from `wrangler.toml`; flag syntax unverified against
   the installed wrangler version).
8. OWNER (decision): choose A, B, or "close P6 as superseded by C". A or B opens a separate code task (broker value-release or edge sync, plus the
   Worker change), each with its own security review.

## 6. Verified vs unverified

Verified by opening the file: every path and line cited in sections 1 and 3, in both repos (re-checked in audit round 1). The
two `gemini-api-config.json` readers were found by `grep -rIl gemini-api-config` over `/home/user/ai-fleet-os` (15 files; only
the two JS tools and `scripts/legacy/gemini-quick-start.sh:29` read it at runtime). `git check-ignore -v` resolves the file to
`.gitignore:445`. The other key stores were found by grep for `find-generic-password` and `device-secrets.json`. Audit round 2
(security) opened `AuthorizationsView.swift:38,93-147,209-212`, `gemini-api-proxy.mjs:23-60`, the plist log keys and
`gemini-manager.js:104-212,470-492`; it grepped the audit for `PROXY_TOKEN` (no match) and scanned this pack for key-shaped
strings (none). Round 3 (PM) opened the menu flow at `gemini-manager.js:289-292,453-484,497-520` and
the audit's rows 113-120. No key value was printed or copied while reading.

Unverified:
- Whether the Worker is deployed and whether `PROXY_TOKEN` is set differently in the Cloudflare dashboard.
- Which proxy the VPS OpenClaw caller uses today, and where the OpenClaw gateway stores its Google key; the VPS placement of
  `embed_bridge.py` comes from a doc (`FLEET_SEMANTIC_FABRIC_ARCHITECTURE.md:152-156`), not from the VPS.
- Whether a cloudflared or similar tunnel already runs on the Mac.
- Whether Cloudflare keeps Worker request URLs (and so `?key=` values) in logs; whether `/tmp/gemini-proxy.log` holds keys today.
- The agent-id collision was found by reading code, not reproduced in a test.
- Which leaked keys are still live; the history commits named in `36-git-push-security-gate.md:221-222` are not in this shallow
  clone (`git cat-file` fails on them).
- The current shape of the owner's local `gemini-api-config.json` and `~/.ai-fleet/device-secrets.json` (not present here).
- Broker tests were not run for this pack; the count of 9 comes from reading `BrokerTests.swift`.
