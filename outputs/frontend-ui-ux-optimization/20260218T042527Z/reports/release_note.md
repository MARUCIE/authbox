# Release Note · UI/UX Optimization

- release_scope: frontend-ui-ux-optimization
- run_id: `20260218T042527Z`
- release_commit: `7b00ec6`
- release_date_utc: `2026-02-18T05:52:00Z`

## Included Changes
- Home information hierarchy refactor with single primary CTA (`Start onboarding`).
- Global UI rhythm polish for home sections and CTA semantics (`cta-primary`, `cta-link`).
- Marketing page onboarding CTA aligned to primary button style.
- PDCA/docs updates and audit evidence bundle under `outputs/frontend-ui-ux-optimization/20260218T042527Z`.

## Verification
- frontend audit (post): network/console/performance PASS.
- visual regression: expected changed routes asserted PASS.
- UX Map Round 2: PASS, including `primary_cta_count_home=1`.
- ai check: PASS (`--no-sbom`, after docs).

## Evidence Index
- `reports/frontend_audit/post/frontend_audit_assertion.txt`
- `reports/frontend_audit/post/visual_regression_assertion.txt`
- `reports/uxmap_round2/uxmap_round2_assertion.txt`
- `logs/ai_check_after_docs.log`
- `reports/three_end_consistency.txt`

## Constraints
- three-end consistency: local/GitHub PASS; VPS is N/A in this workspace (no reachable VPS target configured).
