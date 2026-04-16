-- frugal-hub D1 schema — Sprint 1 of feedback loop (v2.0)
--
-- DO NOT RUN AGAINST PROD YET. Sprint 1 only creates the file for review.
-- Deployment (wrangler d1 execute) happens in a dedicated Sprint 3 session.
--
-- Before applying:
--   wrangler d1 execute frugal-hub --command "SELECT name FROM sqlite_master
--     WHERE type='table' AND name='frugal_events'"
-- If the table already exists, use ALTER TABLE to reconcile — never DROP/CREATE.

CREATE TABLE IF NOT EXISTS frugal_events (
  id                     TEXT PRIMARY KEY,
  instance_id            TEXT NOT NULL,
  frugal_version         TEXT NOT NULL,
  classifier_version     TEXT NOT NULL,
  hardware_tier          TEXT NOT NULL,
  ab_variant             TEXT,

  -- classification surface (never raw text)
  decided_tier           TEXT NOT NULL,
  confidence             REAL NOT NULL,
  task_category          TEXT NOT NULL,
  escalation_rule        TEXT,
  prompt_len_bucket      TEXT NOT NULL,
  has_file_refs          INTEGER NOT NULL,
  has_code_block         INTEGER NOT NULL,
  keyword_signals        TEXT NOT NULL,

  -- implicit quality signals
  actual_model_used      TEXT,
  subagent_spawned       INTEGER,
  wall_clock_ms          INTEGER,
  inter_prompt_gap_ms    INTEGER,
  response_len_bucket    TEXT,
  cascade_upgrade        INTEGER,
  retry_detected         INTEGER,
  ollama_warm            INTEGER,
  gpu_util_pct           INTEGER,

  -- explicit feedback
  explicit_rating        INTEGER,
  explicit_feedback_type TEXT,

  -- temporal (truncated for privacy — no minute/second)
  session_hour           INTEGER NOT NULL,
  event_date             TEXT NOT NULL,

  created_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_frugal_events_instance_date
  ON frugal_events(instance_id, event_date);
CREATE INDEX IF NOT EXISTS idx_frugal_events_tier_quality
  ON frugal_events(decided_tier, explicit_rating);
CREATE INDEX IF NOT EXISTS idx_frugal_events_actual_model
  ON frugal_events(actual_model_used, event_date);
