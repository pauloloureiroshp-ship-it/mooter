-- Wave 29 (Phase 29.I) — L16.1 multi-dimensional decision telemetry (Pastor v2).
--
-- One row per routing decision: structured FEATURES only, NEVER prompt content
-- (enforced client-side by the synthesis decision-logger allowlist + the
-- /v1/pastor-v2 route). Identity follows the Wave 26 model: device_id is the
-- client_id_pseudonymous (SHA256 of a per-machine secret; anonymous).
--
-- Privacy: opt-in (default off); DP noise + k-anonymity ≥ 50 gate any public
-- aggregate (Wave 31+). This migration is additive — Pastor v1 (pastor_state in
-- 011_sync_events.sql) is preserved untouched.

CREATE TABLE IF NOT EXISTS pastor_v2_decisions (
  decision_id              TEXT PRIMARY KEY,   -- client-generated (uuid)
  device_id                TEXT NOT NULL,      -- client_id_pseudonymous (anonymous)
  ts                       INTEGER NOT NULL,   -- client epoch ms

  -- Prompt features (from classify.js) — class/metrics only, never text
  prompt_class             TEXT,               -- 'T0' | 'T1' | 'T2' | 'T3'
  prompt_tokens            INTEGER,
  prompt_complexity        REAL,               -- 0-1
  prompt_language          TEXT,               -- 'en' | 'pt-pt' | 'pt-br' | 'code-only'

  -- Context features
  context_tokens           INTEGER,
  context_freshness_hours  REAL,
  repo_size_files          INTEGER,

  -- Setup features (joined from device_setup_profiles)
  hardware_class           TEXT,
  has_lora_pastor          INTEGER,            -- 0/1/NULL
  subscription_tier        TEXT,

  -- Ecosystem features
  packs_active             TEXT,               -- comma-separated
  providers_active         TEXT,

  -- Routing features (Mooter decision)
  tier_chosen              TEXT,
  model_chosen             TEXT,
  classify_confidence      REAL,
  pastor_hint_applied      INTEGER,            -- 0/1/NULL
  workflow_engaged         INTEGER,            -- 0/1/NULL

  -- Outcome features (post-decision)
  outcome_status           TEXT,               -- 'accepted' | 'edited' | 'retried' | 'abandoned' | 'unknown'
  outcome_dwell_ms         INTEGER,
  outcome_followup_count   INTEGER,

  -- Cost features
  tokens_in                INTEGER,
  tokens_out               INTEGER,
  cost_usd                 REAL,
  latency_first_token_ms   INTEGER,
  latency_full_ms          INTEGER,

  -- Doctrine compliance
  doctrine_violations      INTEGER DEFAULT 0,

  -- Server-side ingestion timestamp (hub convention)
  received_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pastor_v2_device ON pastor_v2_decisions (device_id, ts);
CREATE INDEX IF NOT EXISTS idx_pastor_v2_received ON pastor_v2_decisions (received_at);
CREATE INDEX IF NOT EXISTS idx_pastor_v2_class ON pastor_v2_decisions (prompt_class, tier_chosen);
