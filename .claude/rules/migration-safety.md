---
paths: ["hub/migrations/**/*.sql", "supabase/migrations/**/*.sql", "**/migrations/**/*.sql"]
description: Safety rules for database migrations
---

# Migration Safety

## Hard rules
- **Never** add `NOT NULL` without a `DEFAULT` on a table with existing rows.
- **Never** drop a column in the same migration that renames another — split into two.
- **Never** write a migration that cannot be re-run idempotently if it's a DDL change (use `IF NOT EXISTS`, `IF EXISTS`).

## Backfill strategy
- Schema change + backfill = two migrations. Schema first, backfill second.
- For tables > 100k rows, backfill in batches with explicit `LIMIT` + pagination.
- Document the expected runtime in a header comment: `-- expected runtime: ~30s @ 200k rows`.

## Review gate (MANDATORY for this path)
- Any file under `migrations/` is a **T3 gate**. Final-reviewer must PASS before merge.
- If the migration touches `auth.*`, `profiles`, `routing_decisions`, `deltas` → also require explicit `confirm migration` from Paulo in the session.

## Supabase-specific
- Enable RLS on every new table in the same migration that creates it. Default policy: no access.
- Never put service-role operations in a client-reachable RPC.

## Testing
- Every new migration needs a regression test in `hub/test/migrations.test.js` (or equivalent).
- Test must cover: fresh install, re-run idempotency, rollback (where supported).
