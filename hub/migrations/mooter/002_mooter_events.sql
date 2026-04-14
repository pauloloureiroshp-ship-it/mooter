-- mooter-hub D1 schema — events table (v2.0)

CREATE TABLE IF NOT EXISTS mooter_events (
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

CREATE INDEX IF NOT EXISTS idx_mooter_events_instance_date
  ON mooter_events(instance_id, event_date);
CREATE INDEX IF NOT EXISTS idx_mooter_events_tier_quality
  ON mooter_events(decided_tier, explicit_rating);
CREATE INDEX IF NOT EXISTS idx_mooter_events_actual_model
  ON mooter_events(actual_model_used, event_date);
