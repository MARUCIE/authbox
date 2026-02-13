---
Title: Release Record (Governance)
SOP: 5.2
RunTS: 20260213T043942Z
CreatedAtUTC: 2026-02-13T04:46:28Z
VerifiedTargetSHA: cf1f01416614493115cd0297b410896a81870dcf
PreviousSHA: dd466b6a7acb8ee63b11c5c618b3c9c30a147d04
---

# Release Candidate
- target_sha: cf1f01416614493115cd0297b410896a81870dcf
- release_id: 20260213T043942Z

# Verification
- ai check: PASS (this run used --no-sbom, rounds=2)
  - evidence: outputs/agent-release/20260213T043942Z/reports/ai_check_round1.json
  - outdir: outputs/agent-release/20260213T043942Z/reports/ai_check
- UX Map Round 2: PASS
  - assertion: outputs/agent-release/20260213T043942Z/reports/uxmap_round2/uxmap_round2_assertion.txt
  - script: outputs/agent-release/20260213T043942Z/reports/uxmap_round2/run_uxmap_round2.sh

# Rollback Plan
- If deployment uses SHA-based artifacts: redeploy artifact built from dd466b6a7acb8ee63b11c5c618b3c9c30a147d04.
- Git rollback (safe): revert the deployed SHA(s) and redeploy.

```bash
git revert --no-edit <DEPLOYED_SHA>
```

# Deployment
- VPS/Production deploy: N/A in this run (governance + verification only).
