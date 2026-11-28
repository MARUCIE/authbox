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

- [ ] T1: Wallet architecture sync: `WALLET_ARCHITECTURE.md` states the shipped state (broadcast relay, tx-prep reads, Send UI, live testnet proof) and the Chinese companion `.html` matches it; flips source row "WALLET_ARCHITECTURE.html" | files: doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.md, doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.html | verify: test "$(grep -c '^## ' doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.md)" = "$(grep -c '<h2' doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.html)" && ! grep -q 'QUEUED' doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.md && grep -q 'wallet/broadcast' doc/00_project/initiative_10_auth_box/WALLET_ARCHITECTURE.md
- [ ] T2: Decision pack: web onboarding dead-end (`/create` local-only vs server-backed vault guard) | files: doc/00_project/initiative_10_auth_box/decisions/DP-01-onboarding-dead-end.md | verify: test -s doc/00_project/initiative_10_auth_box/decisions/DP-01-onboarding-dead-end.md
- [ ] T3: Decision pack: AI-Fleet key broker integration (P6 broker client + key migration) | files: doc/00_project/initiative_10_auth_box/decisions/DP-02-ai-fleet-broker.md | verify: test -s doc/00_project/initiative_10_auth_box/decisions/DP-02-ai-fleet-broker.md
- [ ] T4: Owner runbook: macOS signing, Touch ID vault provisioning, Developer ID notarization | files: doc/00_project/initiative_10_auth_box/decisions/DP-03-macos-signing-runbook.md | verify: test -s doc/00_project/initiative_10_auth_box/decisions/DP-03-macos-signing-runbook.md
- [ ] T5: Decision pack: Sparkle auto-update (adopt, defer, or drop) | files: doc/00_project/initiative_10_auth_box/decisions/DP-04-sparkle-auto-update.md | verify: test -s doc/00_project/initiative_10_auth_box/decisions/DP-04-sparkle-auto-update.md
- [ ] T6: Final independent verifier grades R1-R7 over T1-T5 and the draft PR | files: doc/00_project/initiative_10_auth_box/goal/GOAL_LOOP_PLAN.md | verify: grep -q 'Final verdict: PASS' doc/00_project/initiative_10_auth_box/goal/GOAL_LOOP_PLAN.md

## Needs the owner's decision

Filled as the queue runs; each entry links its pack.

## Audit log

Filled as the queue runs.
