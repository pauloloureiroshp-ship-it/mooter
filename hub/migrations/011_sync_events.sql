-- Wave 26 (26.B + 26.D) — real CLI→hub sync ingestion + pull-based Pastor.
--
-- `mooter sync` (runSyncReal) emits ONE aggregate window per 24h, not per-decision
-- events. That payload shape (tier counts, safety reasons, pack ids, hardware
-- class) does not fit the per-decision `frugal_events` table, so it lands here.
-- Auth model α (Wave 26 decision): identify by client_id_pseudonymous (SHA256 of
-- the device's local secret, which never leaves the machine), rate-limit per
-- client. The HMAC signature is stored for audit but is self-signed and NOT
-- hub-verifiable by design (the secret is private) — so it is integrity, not auth.

CREATE TABLE IF NOT EXISTS sync_events (
  event_id          TEXT PRIMARY KEY,   -- MooterSyncEvent.event_id (client-generated)
  client_id         TEXT NOT NULL,      -- client_id_pseudonymous (8+ hex, anonymous)
  schema_version    INTEGER NOT NULL,
  emitted_at_utc    TEXT NOT NULL,
  window_start_utc  TEXT,
  window_end_utc    TEXT,
  -- tier_distribution.counts
  t0                INTEGER NOT NULL DEFAULT 0,
  t1                INTEGER NOT NULL DEFAULT 0,
  t2                INTEGER NOT NULL DEFAULT 0,
  t3                INTEGER NOT NULL DEFAULT 0,
  avg_confidence    REAL,
  -- safety_boost_reasons
  safety_applied    INTEGER,
  safety_total      INTEGER,
  -- pack_usage (ids only, no per-pack counts in this build)
  pack_ids          TEXT,               -- JSON array string
  -- hardware_info (coarse classes only — no device fingerprint)
  os                TEXT,
  gpu_class         TEXT,
  ram_class         TEXT,
  ollama_available  INTEGER,
  -- integrity (self-signed, not verified — see header)
  sig_value         TEXT,
  received_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_events_client ON sync_events (client_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_received ON sync_events (received_at);

-- Pull-based Pastor (26.D). No cron (Free-plan slots exhausted) — state is
-- (re)computed on ingest and returned to the device in the /v1/events response,
-- so the device "pulls" its own hint on the next sync. Threshold: a hint is only
-- emitted once a client has >= 20 cumulative decisions (brief risk: n=1 noise).
CREATE TABLE IF NOT EXISTS pastor_state (
  client_id        TEXT PRIMARY KEY,
  total_decisions  INTEGER NOT NULL DEFAULT 0,
  t0_rate          REAL,
  t1_rate          REAL,
  t2_rate          REAL,
  t3_rate          REAL,
  ollama_available INTEGER,
  hint             TEXT,                -- JSON {code, message} or NULL until threshold
  updated_at       TEXT NOT NULL
);
