# CI Gate Status

- This repo currently has no `.github/workflows` CI.
- A local gate was added:
  - Script: `scripts/postmortem_scan.sh`
  - Make target: `make postmortem-scan`
- To enforce in CI: add a workflow step to run `make postmortem-scan` on PRs.
