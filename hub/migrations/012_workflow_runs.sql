-- Wave 28 (Phase H) — workflow engine run telemetry.
--
-- POST /v1/workflows lands here: ONE row per local workflow run (the dynamic
-- workflow engine in packages/workflow). This is run METADATA only — never the
-- orchestration script, prompts, or any code/file content. Totally separate from
-- sync_events / pastor_state (Wave 26): workflows report run metadata, sync
-- reports routing decisions. Pastor's tuning logic is untouched.
--
-- Identity follows the Wave 26 model α: device_id is the client_id_pseudonymous
-- (SHA256 of a per-machine secret that never leaves the device). Anonymous.

CREATE TABLE IF NOT EXISTS workflow_runs (
  run_id                TEXT PRIMARY KEY,   -- client-generated run id
  device_id             TEXT NOT NULL,      -- client_id_pseudonymous (anonymous)
  workflow_name         TEXT,
  ts_start              INTEGER NOT NULL,
  ts_end                INTEGER,
  num_phases            INTEGER,
  num_agents_total      INTEGER,
  num_agents_local      INTEGER,            -- free local Ollama workers
  num_agents_cloud      INTEGER,            -- paid cloud agents (synthesis)
  duration_ms           INTEGER,
  status                TEXT,               -- running | completed | failed | cancelled
  estimated_savings_usd REAL,               -- vs an all-Opus baseline
  actual_cost_usd       REAL,               -- real cloud spend for the run
  doctrine_violations   INTEGER DEFAULT 0,  -- sandbox/cost-doctrine breaches (0 = clean)
  received_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_device ON workflow_runs (device_id, ts_start);
CREATE INDEX IF NOT EXISTS idx_workflow_received ON workflow_runs (received_at);
