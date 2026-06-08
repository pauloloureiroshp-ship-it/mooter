-- 018_user_dashboard_index.sql — Wave 33.7 per-user dashboard read path
-- Created: 2026-06-08
--
-- CONTEXT (honest, see WAVE33_7_DAY0_RECON.md §7):
-- The Wave 33.7 kickoff proposed an `018_user_link.sql` creating a
-- `user_device_links(user_id, device_id)` table. Day 0 recon REFUTED that:
--   • Migration 008 already links users↔devices, but via an ANONYMOUS
--     `user_id_hash` (SHA256(supabase_user_id)[:16]) column on `frugal_events`
--     and `device_heartbeats` — never a raw `user_id`.
--   • Storing raw `user_id` would re-introduce reversible PII the hub
--     deliberately avoids ("anonymous-by-default" — 008 header).
-- So 018 does NOT create a user_device_links table. The per-user dashboard
-- (GET /v1/user/dashboard?user_hash=<16hex>) reads the EXISTING `user_id_hash`
-- column. This migration is the one additive thing that pattern still wants:
-- a covering index tuned for the dashboard's per-user tier+savings aggregation.
--
-- Forward-only, additive, idempotent (CREATE INDEX IF NOT EXISTS). Migrations
-- 001-017 untouched. No PII column is added.

-- Covering index for: SELECT decided_tier, SUM(per_decision_savings_usd) ...
--                      FROM frugal_events WHERE user_id_hash = ? GROUP BY decided_tier
-- 008 already has idx_events_user_id_hash (single col); this composite lets the
-- per-user tier+savings rollup resolve from the index without a table scan.
CREATE INDEX IF NOT EXISTS idx_events_user_tier_savings
  ON frugal_events(user_id_hash, decided_tier, per_decision_savings_usd)
  WHERE user_id_hash IS NOT NULL;
