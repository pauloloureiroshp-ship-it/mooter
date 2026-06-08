-- Wave 32 (Transparency) — opt-in UX telemetry + GDPR forget-me queue.
--
-- transparency_events: which transparency surfaces a device uses (statusline mode,
-- effort change, dashboard open). FEATURES ONLY — never code, prompts, or content.
-- Identity follows the Wave 26/30/31 model: device_id is the anonymous
-- client_id_pseudonymous (SHA256 of a per-machine secret). Opt-in (default off);
-- any public aggregate is k-anonymity ≥ 50 gated, consistent with /v1/federated.
--
-- forget_me_requests: GDPR erasure queue. A signed device_id lands here and the
-- next k-anonymity pass removes that device's contributions. Additive — migrations
-- 001-016 untouched.

CREATE TABLE IF NOT EXISTS transparency_events (
  event_id   TEXT PRIMARY KEY,   -- client-generated, unique per event
  device_id  TEXT NOT NULL,      -- client_id_pseudonymous (anonymous)
  ts         INTEGER NOT NULL,   -- client epoch ms
  event_type TEXT,               -- 'statusline_mode' | 'effort_change' | 'dashboard_open'
  metadata   TEXT,               -- JSON, FEATURES ONLY (e.g. {"mode":"ultramoo"})
  received_at TEXT               -- server ISO timestamp (rate-limit + freshness)
);

CREATE INDEX IF NOT EXISTS idx_transparency_device ON transparency_events (device_id, received_at);
CREATE INDEX IF NOT EXISTS idx_transparency_type ON transparency_events (event_type);

CREATE TABLE IF NOT EXISTS forget_me_requests (
  device_id   TEXT PRIMARY KEY,  -- the device asking to be forgotten (anonymous)
  ts          INTEGER NOT NULL,  -- client epoch ms
  signature   TEXT,              -- HMAC(device_id|ts) with the device's local secret
  status      TEXT DEFAULT 'queued', -- 'queued' | 'erased'
  received_at TEXT
);
