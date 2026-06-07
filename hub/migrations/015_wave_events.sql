-- Wave 30 (Phase O) — wave shipping events (cross-session wave status sync).
--
-- One row per wave status update from `mooter wave` (opt-in, anonymous). Stores
-- ONLY wave/phase progress metadata — never code, prompts, or content. Identity
-- follows the Wave 26 model: device_id is the client_id_pseudonymous (SHA256 of
-- a per-machine secret; anonymous). Additive — migrations 001-014 untouched.
--
-- Privacy: opt-in (default off). Any public aggregate over this table is
-- k-anonymity ≥ 50 gated (consistent with /v1/federated).

CREATE TABLE IF NOT EXISTS wave_events (
  event_id     TEXT PRIMARY KEY,    -- client-generated (uuid)
  device_id    TEXT NOT NULL,       -- client_id_pseudonymous (anonymous)
  ts           INTEGER NOT NULL,    -- client epoch ms
  wave_number  INTEGER NOT NULL,
  phase        TEXT,                -- current phase id e.g. 'O'
  done         INTEGER,             -- phases done
  total        INTEGER,             -- total phases
  tag          TEXT,                -- e.g. 'v1.18.0-mega-synthesis' (on ship)
  status       TEXT                 -- 'in_progress' | 'shipped'
);

CREATE INDEX IF NOT EXISTS idx_wave_events_device ON wave_events (device_id, ts);
CREATE INDEX IF NOT EXISTS idx_wave_events_wave ON wave_events (wave_number, ts);
