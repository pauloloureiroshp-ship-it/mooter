-- 008_link_user_device.sql — link anonymous device tracking to authenticated users
-- Created: 2026-05-07
--
-- Purpose: enable per-user aggregation across devices ("Paulo's prompts this
-- month", "savings per authenticated user", "DAU as humans, not instances")
-- without sacrificing the anonymous fallback for users who never authenticate.
--
-- Approach: opt-in user_id_hash. After GitHub OAuth via the landing page,
-- /api/cli-token issues a 16-hex-char SHA256(user_id) hash that the local
-- CLI persists to ~/.frugal/user.hash. event-builder.js reads it on every
-- event and the heartbeat sender attaches it to install pings.
--
-- Why a hash, not the raw Supabase user_id:
--   - The hub remains anonymous-by-default — no PII column is ever populated.
--   - The hash is stable per Supabase user but cannot be reversed into email.
--   - Aggregations like "total savings by user" still work via GROUP BY.
--
-- Idempotent: every DDL guarded with IF NOT EXISTS where supported.
-- ALTER TABLE ADD COLUMN has no IF NOT EXISTS in SQLite/D1, so this migration
-- must run ONCE — re-runs will fail on "duplicate column name". To re-apply
-- after a partial failure, drop the columns or restore from a backup.
--
-- Forward-only: existing rows have user_id_hash = NULL. No backfill required.
--
-- Execute via:
--   wrangler d1 execute mooter-hub --remote --file=hub/migrations/008_link_user_device.sql
-- (or `--local` first to sanity-check against the local D1 binding)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Add user_id_hash to device_heartbeats
-- ═══════════════════════════════════════════════════════════════════════════
-- 16-char hex string = SHA256(supabase_user_id)[:16]. Nullable: anonymous
-- installs (no GitHub login) keep their NULL value forever.
ALTER TABLE device_heartbeats ADD COLUMN user_id_hash TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Add user_id_hash to frugal_events
-- ═══════════════════════════════════════════════════════════════════════════
-- Same shape; populated by event-builder.js when ~/.frugal/user.hash exists.
ALTER TABLE frugal_events ADD COLUMN user_id_hash TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Indexes — per-user cohort queries
-- ═══════════════════════════════════════════════════════════════════════════
-- Partial index: only authenticated rows pay the index storage cost.
CREATE INDEX IF NOT EXISTS idx_heartbeats_user_id_hash
  ON device_heartbeats(user_id_hash) WHERE user_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_user_id_hash
  ON frugal_events(user_id_hash) WHERE user_id_hash IS NOT NULL;

-- Composite for the "this user's recent activity across devices" query.
CREATE INDEX IF NOT EXISTS idx_events_user_date
  ON frugal_events(user_id_hash, event_date) WHERE user_id_hash IS NOT NULL;
