---
Title: PM-20260531-001 PostgreSQL Partial Index Volatile Predicate
Status: fixed
Owner: ai-agent
LastUpdated: 2026-05-31
Scope: database-migrations
---

# Summary
Migration `009_critical_indexes.up.sql` failed on a fresh PostgreSQL database because it created a partial index with `NOW()` in the predicate.

# Symptoms
- Fresh migrations stopped at version 9.
- PostgreSQL returned `functions in index predicate must be marked IMMUTABLE`.
- Real API E2E could not start from an empty database.

# Root Cause
- PostgreSQL partial index predicates cannot depend on volatile time functions.
- The migration used `WHERE expires_at > NOW()` as if the predicate would be re-evaluated dynamically.

# Fix
- Replaced the volatile partial index with a regular composite index on `(token_hash, expires_at)`.
- Added a migration SQL regression test that scans `*.up.sql` for volatile functions in partial index predicates.

# Prevention
- Database migrations must be tested from an empty database before release gates are considered representative.
- Static migration lint should reject volatile functions in index predicates.

# Triggers (machine-matchable)
TRIGGER_REGEX: CREATE\s+INDEX[\s\S]+WHERE[\s\S]+\bNOW\s*\(
TRIGGER_REGEX: CREATE\s+INDEX[\s\S]+WHERE[\s\S]+\bCURRENT_TIMESTAMP\b
TRIGGER_PATH: services/api/migrations/*.up.sql

# References
- `services/api/migrations/009_critical_indexes.up.sql`
- `services/api/migrations/migration_sql_test.go`
- `outputs/sop-one-click-delivery/20260531T104046Z-wp015/logs/final-verification/package-api-web-codegraph.log`
