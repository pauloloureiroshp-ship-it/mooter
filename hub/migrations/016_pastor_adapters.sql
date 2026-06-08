-- Wave 31 (Pastor v2) — per-task LoRA adapter usage telemetry (opt-in, anonymous).
--
-- One row per (device, adapter): which per-task LORAUTER adapter a device used, how
-- often, and the rolling average routing confidence. FEATURES ONLY — never code,
-- prompts, or content. Identity follows the Wave 26/30 model: device_id is the
-- client_id_pseudonymous (SHA256 of a per-machine secret; anonymous). Additive —
-- migrations 001-015 untouched.
--
-- Privacy: opt-in (default off). Any public aggregate over this table is
-- k-anonymity ≥ 50 gated (consistent with /v1/federated and /v1/wave-status).

CREATE TABLE IF NOT EXISTS pastor_adapters (
  adapter_id    TEXT PRIMARY KEY,    -- client-generated, unique per (device, adapter)
  device_id     TEXT NOT NULL,       -- client_id_pseudonymous (anonymous)
  adapter_name  TEXT NOT NULL,       -- e.g. 'pastor-frontend'
  task_type     TEXT,                -- e.g. 'coding-frontend' | 'baseline'
  usage_count   INTEGER DEFAULT 0,   -- routes attributed to this adapter on this device
  avg_score     REAL,                -- rolling avg routing confidence 0..1
  first_used    INTEGER,             -- client epoch ms
  last_used     INTEGER,             -- client epoch ms
  received_at   TEXT                 -- server ISO timestamp (rate-limit + freshness)
);

CREATE INDEX IF NOT EXISTS idx_pastor_adapters_device ON pastor_adapters (device_id, received_at);
CREATE INDEX IF NOT EXISTS idx_pastor_adapters_task ON pastor_adapters (task_type);
