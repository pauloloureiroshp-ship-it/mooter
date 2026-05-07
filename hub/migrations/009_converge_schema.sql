-- 009_converge_schema.sql — repair production schema drift
-- Created: 2026-05-07
-- Author: Wave-2 P1 + final-reviewer
--
-- Background
-- ──────────
-- Production D1 (`mooter-hub`) was bootstrapped via the parallel
-- `hub/migrations/mooter/` set during the Phase-1 rebrand (commit
-- 0187b46). That set created `mooter_events` as a TABLE (not the
-- VIEW that migration 004 intended), and skipped 005/006/008. Hub
-- code (`hub/lib/db.js`, `hub/routes/events.js`) still INSERTs and
-- SELECTs from `frugal_events` — which does not exist in prod.
-- Result: every `POST /submit-events` has been silently failing, and
-- `mooter_events` has 0 rows.
--
-- Verified state (2026-05-07, ENAM v3-prod):
--   • mooter_events       : TABLE, 28 cols, 0 rows  → safe to drop
--   • frugal_events       : missing
--   • device_heartbeats   : TABLE, 12 cols, no user_id_hash
--   • shadow_pairs        : missing                  (was in 005)
--   • algorithm_versions  : missing                  (was in 006)
--   • user_profiles       : missing                  (was in 006)
--
-- Strategy — single converge migration
-- ────────────────────────────────────
-- Re-apply 002 + 005 + 006 + 008 idempotently against the current
-- prod state, then add the `mooter_events` VIEW (migration 004's
-- original intent). All `CREATE` statements use `IF NOT EXISTS`;
-- the only non-idempotent step is the `DROP TABLE mooter_events`,
-- which is safe because the table is empty (verified) and immediately
-- replaced by a VIEW of the same name.
--
-- Rollback
-- ────────
-- Reversible. To revert: drop the new tables/views and recreate
-- mooter_events as a TABLE per `migrations/mooter/002_mooter_events.sql`.
-- No production data is at risk because no events have ever landed.
--
-- Apply via:
--   wrangler d1 execute mooter-hub --local  --file=hub/migrations/009_converge_schema.sql
--   wrangler d1 execute mooter-hub --remote --file=hub/migrations/009_converge_schema.sql

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Drop the empty `mooter_events` TABLE so the VIEW can take its name.
--    Verified 0 rows in prod 2026-05-07. If this assumption is ever wrong
--    in another environment, comment out this line and reconcile manually.
-- ═══════════════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS mooter_events;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Canonical frugal_events table — schema is the union of migration 002
--    (28 base columns), migration 006 (5 retraining columns), and
--    migration 008 (user_id_hash). Single CREATE keeps DDL atomic.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS frugal_events (
  id                       TEXT PRIMARY KEY,
  instance_id              TEXT NOT NULL,
  frugal_version           TEXT NOT NULL,
  classifier_version       TEXT NOT NULL,
  hardware_tier            TEXT NOT NULL,
  ab_variant               TEXT,
  -- classification surface (never raw text)
  decided_tier             TEXT NOT NULL,
  confidence               REAL NOT NULL,
  task_category            TEXT NOT NULL,
  escalation_rule          TEXT,
  prompt_len_bucket        TEXT NOT NULL,
  has_file_refs            INTEGER NOT NULL,
  has_code_block           INTEGER NOT NULL,
  keyword_signals          TEXT NOT NULL,
  -- implicit quality signals
  actual_model_used        TEXT,
  subagent_spawned         INTEGER,
  wall_clock_ms            INTEGER,
  inter_prompt_gap_ms      INTEGER,
  response_len_bucket      TEXT,
  cascade_upgrade          INTEGER,
  retry_detected           INTEGER,
  ollama_warm              INTEGER,
  gpu_util_pct             INTEGER,
  -- explicit feedback
  explicit_rating          INTEGER,
  explicit_feedback_type   TEXT,
  -- temporal (truncated for privacy — no minute/second precision)
  session_hour             INTEGER NOT NULL,
  event_date               TEXT NOT NULL,
  created_at               TEXT NOT NULL,
  -- migration 006 — retraining foundation
  algorithm_version        TEXT,
  prompt_complexity_score  REAL,
  outcome_score            REAL,
  outcome_source           TEXT,
  per_decision_savings_usd REAL,
  -- migration 008 — link authenticated users to anonymous telemetry
  user_id_hash             TEXT
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Indexes on frugal_events — union of 002 + 006 + 008.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_frugal_events_instance_date
  ON frugal_events(instance_id, event_date);
CREATE INDEX IF NOT EXISTS idx_frugal_events_tier_quality
  ON frugal_events(decided_tier, explicit_rating);
CREATE INDEX IF NOT EXISTS idx_frugal_events_actual_model
  ON frugal_events(actual_model_used, event_date);
CREATE INDEX IF NOT EXISTS idx_frugal_events_algorithm
  ON frugal_events(algorithm_version, event_date);
CREATE INDEX IF NOT EXISTS idx_frugal_events_outcome
  ON frugal_events(outcome_score) WHERE outcome_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_frugal_events_category_outcome
  ON frugal_events(task_category, outcome_score);
CREATE INDEX IF NOT EXISTS idx_events_user_id_hash
  ON frugal_events(user_id_hash) WHERE user_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_user_date
  ON frugal_events(user_id_hash, event_date) WHERE user_id_hash IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. mooter_events VIEW — restores migration 004's original intent.
--    Backward-compat for any consumer that already reads `mooter_events`.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW IF NOT EXISTS mooter_events AS
  SELECT * FROM frugal_events;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. shadow_pairs — from migration 005.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shadow_pairs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id      TEXT NOT NULL,
  session_id       TEXT,
  primary_tier     TEXT NOT NULL,
  shadow_tier      TEXT NOT NULL,
  primary_preview  TEXT,
  shadow_preview   TEXT,
  judge_verdict    TEXT,
  judge_model      TEXT,
  judge_confidence REAL,
  judged_at        TEXT,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shadow_unjudged
  ON shadow_pairs(judge_verdict) WHERE judge_verdict IS NULL;
CREATE INDEX IF NOT EXISTS idx_shadow_by_tiers
  ON shadow_pairs(primary_tier, shadow_tier, judge_verdict);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. algorithm_versions + user_profiles — from migration 006.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS algorithm_versions (
  version_id                TEXT PRIMARY KEY,
  released_at               TEXT NOT NULL,
  patterns_added            INTEGER DEFAULT 0,
  patterns_removed          INTEGER DEFAULT 0,
  patterns_modified         INTEGER DEFAULT 0,
  gold_labels_count         INTEGER NOT NULL,
  benchmark_accuracy        REAL,
  benchmark_f1              REAL,
  benchmark_savings_pct     REAL,
  ab_test_quality_retention REAL,
  ab_test_saving_usd        REAL,
  accuracy_by_category      TEXT,
  tier_distribution         TEXT,
  notes                     TEXT
);

CREATE TABLE IF NOT EXISTS user_profiles (
  instance_id              TEXT PRIMARY KEY,
  first_seen               TEXT NOT NULL,
  last_seen                TEXT NOT NULL,
  total_decisions          INTEGER DEFAULT 0,
  total_sessions           INTEGER DEFAULT 0,
  pct_t0                   REAL DEFAULT 0,
  pct_t1                   REAL DEFAULT 0,
  pct_t2                   REAL DEFAULT 0,
  pct_t3                   REAL DEFAULT 0,
  top_categories           TEXT,
  avg_outcome_score        REAL,
  explicit_feedback_count  INTEGER DEFAULT 0,
  positive_feedback_pct    REAL,
  total_savings_usd        REAL DEFAULT 0,
  avg_savings_per_decision REAL DEFAULT 0,
  hardware_tier            TEXT,
  has_ollama               INTEGER,
  has_api_key              INTEGER,
  avg_prompt_complexity    REAL,
  complexity_bucket        TEXT,
  algorithm_accuracy       REAL,
  worst_category           TEXT,
  updated_at               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen ON user_profiles(last_seen);
CREATE INDEX IF NOT EXISTS idx_user_profiles_hw_tier  ON user_profiles(hardware_tier);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Analytical views — from migration 006. Now that `frugal_events` has the
--    006 columns these views can finally compile and return data.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW IF NOT EXISTS retraining_candidates AS
SELECT
  e.id, e.instance_id, e.algorithm_version, e.decided_tier, e.task_category,
  e.confidence, e.prompt_len_bucket, e.has_file_refs, e.has_code_block,
  e.keyword_signals, e.prompt_complexity_score, e.outcome_score,
  e.outcome_source, e.per_decision_savings_usd, e.wall_clock_ms, e.event_date,
  CASE
    WHEN e.outcome_score >= 0.3  THEN 'correct'
    WHEN e.outcome_score <= -0.3 THEN 'incorrect'
    ELSE 'ambiguous'
  END AS decision_quality,
  CASE e.outcome_source
    WHEN 'explicit'  THEN 1.0 WHEN 'shadow'    THEN 0.8
    WHEN 'implicit'  THEN 0.5 WHEN 'heuristic' THEN 0.3
    WHEN 'composite' THEN 0.6 ELSE 0.1
  END AS label_confidence,
  CASE
    WHEN e.outcome_score <= -0.3 AND e.cascade_upgrade = 1            THEN 'should_have_been_higher'
    WHEN e.outcome_score >= 0.5  AND e.decided_tier IN ('T2', 'T3')   THEN 'could_be_lower'
    ELSE 'tier_ok'
  END AS tier_recommendation
FROM frugal_events e
WHERE e.outcome_score IS NOT NULL
ORDER BY
  CASE e.outcome_source
    WHEN 'explicit'  THEN 1 WHEN 'shadow'    THEN 2
    WHEN 'composite' THEN 3 WHEN 'implicit'  THEN 4
    WHEN 'heuristic' THEN 5 ELSE 6
  END,
  e.event_date DESC;

CREATE VIEW IF NOT EXISTS category_performance AS
SELECT
  e.task_category, e.algorithm_version,
  COUNT(*) AS total_decisions,
  ROUND(100.0 * SUM(CASE WHEN e.outcome_score >= 0.3 THEN 1 ELSE 0 END)
        / NULLIF(SUM(CASE WHEN e.outcome_score IS NOT NULL THEN 1 ELSE 0 END), 0), 1) AS accuracy_pct,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T0' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t0,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T1' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t1,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T2' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t2,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T3' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t3,
  ROUND(SUM(COALESCE(e.per_decision_savings_usd, 0)), 2) AS total_savings_usd,
  ROUND(AVG(COALESCE(e.per_decision_savings_usd, 0)), 4) AS avg_savings_per_decision,
  ROUND(AVG(e.outcome_score), 3) AS avg_outcome,
  SUM(CASE WHEN e.outcome_score IS NOT NULL THEN 1 ELSE 0 END) AS labeled_count,
  ROUND(AVG(e.wall_clock_ms), 0) AS avg_latency_ms
FROM frugal_events e
GROUP BY e.task_category, e.algorithm_version
ORDER BY total_decisions DESC;

CREATE VIEW IF NOT EXISTS drift_monitor AS
SELECT
  e.event_date, e.algorithm_version,
  COUNT(*) AS decisions_that_day,
  ROUND(100.0 * SUM(CASE WHEN e.outcome_score >= 0.3 THEN 1 ELSE 0 END)
        / NULLIF(SUM(CASE WHEN e.outcome_score IS NOT NULL THEN 1 ELSE 0 END), 0), 1) AS daily_accuracy_pct,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T0' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t0,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T3' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t3,
  ROUND(SUM(COALESCE(e.per_decision_savings_usd, 0)), 2) AS daily_savings_usd,
  SUM(CASE WHEN e.outcome_score IS NOT NULL THEN 1 ELSE 0 END) AS labeled_count,
  ROUND(AVG(e.prompt_complexity_score), 3) AS avg_complexity
FROM frugal_events e
GROUP BY e.event_date, e.algorithm_version
ORDER BY e.event_date DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. device_heartbeats — add user_id_hash column (from migration 008).
--    `ALTER TABLE ADD COLUMN` is NOT idempotent in SQLite/D1; this migration
--    must run only ONCE per database. Verified (2026-05-07) that the column
--    does not exist in prod.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE device_heartbeats ADD COLUMN user_id_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_heartbeats_user_id_hash
  ON device_heartbeats(user_id_hash) WHERE user_id_hash IS NOT NULL;
