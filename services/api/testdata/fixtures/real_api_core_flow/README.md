# real_api_core_flow fixtures

This fixture pack is generated from **real API calls** in non-production environment.

## Files
- `manifest.json`: canonical scenario, expected status codes, token roles.
- `latest/`: most recent captured request/response/status artifacts from real run.

## Rules
- Final acceptance must pass real API (`/health` + `/api/v1/*`) end-to-end.
- Mock responses are forbidden for final validation.

## Generate Capture
```bash
services/api/scripts/real_api_core_flow.sh --mode capture --project-dir .
```

## Replay Regression
```bash
services/api/scripts/replay_real_api_fixtures.sh --project-dir .
```
