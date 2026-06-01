---
Title: macOS Native App — Feature Index
Scope: feature
Owner: ai-agent
Status: active
LastUpdated: 2026-06-01
---

# Feature: Auth Box for Mac (native macOS app)

Native SwiftUI macOS app fusing password vault + AI provider hub (70+ providers)
+ agent-authorization broker, gated by Touch ID, reusing `AuthBoxCrypto` and the
authbox v5 zero-knowledge core.

## Docs
- `ARCHITECTURE.md` — canonical architecture (machine-readable, English)
- `ARCHITECTURE.html` — human-facing companion (Chinese, VAULT ONYX styling)

## Status
- Architecture: DONE (2026-06-01)
- Implementation: in progress — see `task_plan.md §WP-020` for the atomic queue

## Key decisions
- ADR-001 native SwiftUI (not Tauri/Catalyst)
- ADR-002 Touch ID = backend for existing `step_up` policy
- ADR-003 deny-by-default policy (PM-20260531-002 lesson)
- ADR-004 secrets only in Keychain + Secure Enclave (fixes the AI-Fleet git-key-leak class)
