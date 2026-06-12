-- 019_admin_data_layer.sql — Wave 56 admin panel data layer
-- Created: 2026-06-11
--
-- CONTEXT (honest, see WAVE56_DAY0_RECON.md):
-- The Wave 56 admin panel needs four additional FEATURE columns on
-- `frugal_events` (subscriptions / ollama_status / packs_installed /
-- local_models_reason) plus a privacy-preserving audit log of which admin
-- viewed what. Day 0 recon verified against live D1 (`mooter-hub`):
--   • All four columns are ABSENT from `frugal_events` (34 cols, cid 0-33).
--   • `audit_admin_views` does NOT exist (sqlite_master, 0 rows).
-- So every statement here is purely ADDITIVE — migrations 001-018 are untouched.
--
-- PRIVACY: these columns are FEATURES ONLY (subscription tier names, ollama
-- daemon status, installed pack ids, a reason code for local-model fallback) —
-- never raw email, github handle/id, or raw user_id. The audit table stores
-- only HASHES (admin_email_hash, target_user_hash, ip_hash), consistent with
-- the anonymous-by-default model of migrations 008/017/018.
--
-- Apply via:
--   wrangler d1 execute mooter-hub --local  --file=hub/migrations/019_admin_data_layer.sql
--   wrangler d1 execute mooter-hub --remote --file=hub/migrations/019_admin_data_layer.sql

-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️  RUN ONCE PER DATABASE — the ALTER TABLE ADD COLUMN block below.
-- ═══════════════════════════════════════════════════════════════════════════
-- `ALTER TABLE ADD COLUMN` has NO `IF NOT EXISTS` form in SQLite/D1 (documented
-- in migrations 006/008/009). Each of the four ALTERs must therefore run EXACTLY
-- ONCE per database — a re-run fails with "duplicate column name". Before
-- re-applying after a partial failure, inspect `PRAGMA table_info(frugal_events)`
-- and run only the ALTERs whose columns are still missing.
--
-- All four columns are NULLABLE (no DEFAULT): `frugal_events` already has rows,
-- so a `NOT NULL` without `DEFAULT` would abort the migration. Existing rows
-- keep NULL forever; the CLI event-builder populates them going forward.
-- is_synthetic is intentionally NOT added here (deferred to Wave 58).
-- ═══════════════════════════════════════════════════════════════════════════

-- Subscription tiers the device reports (FEATURE only, e.g. JSON list of plan
-- names) — never the underlying account identity.
ALTER TABLE frugal_events ADD COLUMN subscriptions TEXT;

-- Local Ollama daemon status as seen at decision time (e.g. 'up' | 'down' |
-- 'unknown') — drives the admin "local-first health" view.
ALTER TABLE frugal_events ADD COLUMN ollama_status TEXT;

-- Installed Mooter pack ids (FEATURE only, e.g. JSON list of pack slugs).
ALTER TABLE frugal_events ADD COLUMN packs_installed TEXT;

-- Reason code for why a local model was / was not used (e.g. 'no_gpu' |
-- 'cold_start' | 'forced_cloud') — never prompt or response content.
ALTER TABLE frugal_events ADD COLUMN local_models_reason TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- audit_admin_views — privacy-preserving log of admin panel reads.
-- Idempotent (CREATE TABLE IF NOT EXISTS). Access control lives in the handler
-- (adminAuthorized / Bearer MOOTER_ADMIN_TOKEN); D1 has no native RLS.
-- Stores ONLY hashes — no raw email, no raw user_id, no raw IP.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_admin_views (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_email_hash TEXT NOT NULL,   -- SHA256 hash of the admin identity (never raw email)
  endpoint         TEXT NOT NULL,   -- which admin endpoint was hit
  target_user_hash TEXT,            -- user_id_hash (16-hex) of the row viewed, if any
  ts               INTEGER NOT NULL, -- server epoch ms
  ip_hash          TEXT             -- SHA256 hash of the request IP (never raw IP)
);

-- Indexes — distinct table from frugal_events, so no collision with its 9
-- existing idx_frugal_events_* / idx_events_user_* indexes.
CREATE INDEX IF NOT EXISTS idx_audit_admin_views_ts
  ON audit_admin_views(ts);
CREATE INDEX IF NOT EXISTS idx_audit_admin_views_admin_email
  ON audit_admin_views(admin_email_hash);
