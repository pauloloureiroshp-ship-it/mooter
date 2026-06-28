-- Frente F (Sync cross-machine) — live-session-state mirror, per device.
--
-- Purpose: let a user's OWN cockpits (e.g. a Windows PC and a Mac) see each
-- other's live Claude Code sessions + the latest combined handoff, mirrored
-- through the hub that already exists. ONE row per device (latest wins): the
-- device upserts its current snapshot; the other device polls by owner.
--
-- Scope/privacy: rows are partitioned by `owner_hash` (a pseudonymous per-user
-- secret hash — NEVER an email or any PII). A GET only ever returns rows that
-- share the requesting owner_hash, minus the caller's own device. The payload
-- is session METADATA (sid, short topic, model, tier, branch, status) + an
-- optional handoff text — the same surface the user already sees locally. No
-- prompt bodies, code, or file contents. Opt-in (the bg writer runs only when
-- the user enables cross-machine sync).
--
-- Additive — migrations 001-019 are untouched. Identity model mirrors the
-- Wave 26/30 device pseudonym used by sync_events/heartbeats.

CREATE TABLE IF NOT EXISTS live_session_state (
  device_id    TEXT PRIMARY KEY,   -- pseudonymous per-device id (anonymous)
  owner_hash   TEXT NOT NULL,      -- pseudonymous per-user scope key (anonymous)
  os_type      TEXT,               -- 'windows' | 'macos' | 'linux' | 'unknown'
  device_label TEXT,               -- friendly, user-chosen ('PC do escritório')
  payload      TEXT NOT NULL,      -- JSON: { sessions:[...], handoff?, totals? }
  updated_at   TEXT NOT NULL       -- server ISO timestamp (freshness / offline calc)
);

CREATE INDEX IF NOT EXISTS idx_live_session_owner ON live_session_state (owner_hash, updated_at);
