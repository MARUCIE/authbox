# Goal loop: close the open rows of `task_plan.md`

Source plan: `doc/00_project/initiative_10_auth_box/task_plan.md` (8 open rows on `main` 186f009).
Branch: `claude/project-thread-xqvs06`. Delivery: one draft PR, never merged to `main` without the owner's yes.

## Goal Contract

- Objective: every open row of `task_plan.md` either reaches a verified done state on this branch, or
  carries a complete, reviewable decision pack (options, recommendation, consequences, exact owner steps)
  when the row needs the owner in person or a product decision.
- Owner-only boundary: no row that names the owner (Apple ID sign-in, Touch ID tap, Developer ID cert,
  notarytool profile, live proxy keys) and no product-positioning call is performed or decided here.
  Its source checkbox stays `[ ]`; the pack is linked under it.
- Out of scope on this branch: changes to auth, SRP, session, crypto, wallet signing, broker, or proxy code;
  data migrations; public API changes; new dependencies. Any such need is written into the decision list.
- Allowed scope: `doc/00_project/initiative_10_auth_box/**` only.
- Valid evidence: an independent verifier's grade against the rubric below (opened paths, `git diff` against `main`), and
  GitHub check runs on the PR head. A writer's own claim never counts.
- Preserved constraints: the owner-only boundary and out-of-scope list above; no merge to `main` without the owner's yes;
  no secret values in any file.
- Allowed boundary: edits under `doc/00_project/initiative_10_auth_box/**` on branch `claude/project-thread-xqvs06`, one
  draft PR; read-only access to code and to the AI-Fleet repo for evidence.
- Next-action policy: take the first unchecked queue row; on a verifier FAIL, apply its fixes and re-verify the same row
  before moving on.
- Stop/blocker report: stop when the Stop line below holds, or report a blocker (a row that needs the owner, red CI that a
  doc change cannot fix) with what was tried.
- Loop: one queue row at a time. Each row runs a role-agent Workflow, then three audit rounds by
  agents that did not write it (each round fixes what it confirms), then an independent verifier grades
  the row against the rubric below. Only a passing grade flips the row here and, for doc rows, in the source.
- Stop: all queue rows `[x]`, CI green on the draft PR, final independent verifier pass recorded below.

## Rubric (graded by an independent verifier, never the writer)

| ID | Criterion | Proof |
|---|---|---|
| R1 | Every factual claim about the code names a repo path that exists, and the claim matches that file. | Verifier samples at least 8 claims per row and opens each path. |
| R2 | No source checkbox for an owner-only or decision row is flipped. | `git diff origin/main -- task_plan.md` shows only rows T1 is allowed to flip, plus link lines. |
| R3 | No file outside the allowed scope changed. | `git diff --name-only origin/main` lists only `doc/00_project/initiative_10_auth_box/**`. |
| R4 | Each decision pack has at least two options, a recommendation with its main reason, consequences of each option, whether it can be undone, and the owner's exact next steps. | Verifier reads each pack against this list. |
| R5 | The Chinese HTML companion carries the same sections, in the same order, as the English Markdown, and states the same current state. | Section count and order match; phase status matches. |
| R6 | CI is green on the draft PR head. | GitHub check runs on the PR head. |
| R7 | Each row records three audit rounds with the auditors' roles and what each round changed. | Audit log section below. |

## Queue (chapter-level, atomic)

- [x] T1: Wallet architecture sync: `WALLET_ARCHITECTURE.md` states the shipped state (broadcast relay, tx-prep reads, Send UI, live testnet proof) and the Chinese companion `.html` matches it; flips source row "WALLET_ARCHITECTURE.html" | files: doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.md, doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.html | verify: test "$(grep -c '^## ' doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.md)" = "$(grep -c '<h2' doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.html)" && ! grep -q 'QUEUED' doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.md && grep -q 'wallet/broadcast' doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.md
- [x] T2: Decision pack: web onboarding dead-end (`/create` local-only vs server-backed vault guard) | files: doc/00_project/initiative_10_auth_box/decisions/DP-01-onboarding-dead-end.md | verify: test -s doc/00_project/initiative_10_auth_box/decisions/DP-01-onboarding-dead-end.md
- [x] T3: Decision pack: AI-Fleet key broker integration (P6 broker client + key migration) | files: doc/00_project/initiative_10_auth_box/decisions/DP-02-ai-fleet-broker.md | verify: test -s doc/00_project/initiative_10_auth_box/decisions/DP-02-ai-fleet-broker.md
- [x] T4: Owner runbook: macOS signing, Touch ID vault provisioning, Developer ID notarization | files: doc/00_project/initiative_10_auth_box/decisions/DP-03-macos-signing-runbook.md | verify: test -s doc/00_project/initiative_10_auth_box/decisions/DP-03-macos-signing-runbook.md
- [x] T5: Decision pack: Sparkle auto-update (adopt, defer, or drop) | files: doc/00_project/initiative_10_auth_box/decisions/DP-04-sparkle-auto-update.md | verify: test -s doc/00_project/initiative_10_auth_box/decisions/DP-04-sparkle-auto-update.md
- [x] T6: Final independent verifier grades R1-R7 over T1-T5 and the draft PR | files: doc/00_project/initiative_10_auth_box/goal/GOAL_LOOP_PLAN.md | verify: grep -q 'Final verdict: PASS' doc/00_project/initiative_10_auth_box/goal/GOAL_LOOP_PLAN.md

## Needs the owner's decision

Each entry links its pack. None of these is done or decided on this branch.

- DP-01 onboarding dead-end: product positioning, server-backed account (A) vs local-first vault (B), or interim CTA fix (C). `decisions/DP-01-onboarding-dead-end.md`
- DP-02 AI-Fleet key broker: sync to Worker secrets (A), loopback-only local consumers (B), or rotate-only (C, recommended first); key rotation and live proxy cutover are owner-only. `decisions/DP-02-ai-fleet-broker.md`
- DP-03 macOS signing: Apple ID sign-in, Touch ID "Finish setup", Developer ID cert and notarytool profile are owner-only; order of development signing vs Developer ID; a later code row to fix the RELEASE tier re-sign that drops entitlements. `decisions/DP-03-macos-signing-runbook.md`
- DP-04 Sparkle: adopt, defer (after DP-03), or drop; new dependency and new EdDSA update key are owner decisions. `decisions/DP-04-sparkle-auto-update.md`
- From T1 (wallet): first mainnet send; whether the mainnet gate should also be enforced in the handler or relay (today it is only the Confirm button's disabled state); whether to prove `POST /wallet/broadcast` end to end with a live testnet send through the web dialog (the recorded proof bypassed the relay).
- Code defects found while auditing, left for a code row (out of scope here): broker agent-id collision in `AuthorizationsView.swift` (DP-02); RELEASE tier `codesign --force --deep` without `--entitlements` in `scripts/package-dmg.sh` (DP-03); web onboarding key-swap hazard (DP-01).

## Audit log

Run `wf_3da5142c-138` (2026-11-28): one author agent per row, then three audit-and-fix rounds, each by a different agent with a different lens. No auditor wrote the row it audited. All rounds reported `scope_ok`.

| Row | Author role | Round 1 lens (issues fixed) | Round 2 lens (issues fixed) | Round 3 lens (issues fixed) |
|---|---|---|---|---|
| T1 | wallet/crypto engineer + writer | code truth (8) | Chinese companion parity (6) | security architect (7) |
| T2 | PM + security architect | UX journey (8) | security engineer (3) | decision quality (3) |
| T3 | secrets security architect | platform/infra (9) | security engineer (8) | decision quality (5) |
| T4 | Apple release engineer | release engineer #2 (7) | security engineer (8) | owner usability (7) |
| T5 | macOS release engineer + PM | security engineer (9) | release engineer (4) | decision quality (5) |

Carried as unverified in the packs (no Go module cache, no node_modules, no Xcode in this environment): Go and crypto test pass counts, on-chain status of the recorded testnet txids, Sparkle-specific facts, Apple tool output strings.

## Final verification (T6)

Independent read-only verifier, 2026-11-28, on head `1b7f122` against `main` `186f009`: about 150 code claims opened across
T1-T5, every `task_plan.md` line cite checked against `main`. R2, R3, R4, R5, R6, R7 and the no-secrets check passed. R1 found
one stale cite (DP-01, WALLET_ARCHITECTURE.md §5 line number) plus two optional wording nits; all three were applied verbatim
from the verifier's replacement text in `7890f69`, which the verifier stated is the only change needed for R1 to pass. T3 was
ticked on this verifier's DP-02 grade (R1 and R4 pass; DP-02 unchanged since).

Earlier per-row verifiers: T1 PASS (30 claims), T2 PASS, T4 PASS, T5 PASS. T3 failed twice (the MCP server row; owner step 3's
fallback claim) and was fixed both times before this pass. The fix for the class of error found on the way: `task_plan.md`
line numbers in every pack are now pinned to `main` `186f009`, because this branch's link lines shift later rows.

CI on `7890f69`: go, typescript, architecture, e2e, release-gate and agent-design-check all success.

Final verdict: PASS
