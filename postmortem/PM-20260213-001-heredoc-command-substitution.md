---
Title: PM-20260213-001 Heredoc Command Substitution (Backticks) Incident
Status: fixed
Owner: ai-agent
LastUpdated: 2026-02-13
Scope: automation
---

# Summary
Unquoted heredoc (`<<EOF`) + backticks inside the heredoc content can trigger command substitution during file generation, executing unintended commands.

# Symptoms
- Generated markdown content lost inline-code segments.
- Unintended shell commands were executed during document generation.
- Repository state was unexpectedly modified.

# Root Cause
- Shell heredoc delimiter was not quoted, allowing command substitution.
- Backticks inside markdown (inline code) were interpreted by the shell.

# Fix
- Always use quoted heredoc delimiters when emitting markdown that may contain backticks:
  - Preferred: `cat <<'EOF' > file.md`
- Or write files via `python3`/`apply_patch` to avoid shell interpolation.

# Prevention
- Add a postmortem trigger scan that blocks release when unquoted heredocs are introduced.

# Triggers (machine-matchable)
TRIGGER_REGEX: <<\s*-?\s*EOF
TRIGGER_REGEX: git\s+reset\s+--hard

# References
- Safe examples in repo:
  - `scripts/full_loop_closure_check.sh` uses `<<'EOF'`
  - `services/api/scripts/real_api_core_flow.sh` uses `<<'EOF'`
