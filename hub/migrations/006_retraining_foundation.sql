-- 006_retraining_foundation.sql — Data foundation for continuous algorithm improvement
-- Created: 2026-04-16 (A/B test session)
--
-- Purpose: Every routing decision must be traceable back to:
--   WHO (instance_id) + WHAT (prompt features) + DECIDED (tier/model) +
--   HOW (algorithm_version) + WHEN (date) + RESULT (outcome_score) + COST (savings)
--
-- This migration adds:
--   1. algorithm_version + prompt_complexity_score + outcome_score to mooter_events
--   2. algorithm_versions table — tracks each classify.js release
--   3. user_profiles table — per-instance aggregate for personalization
--   4. retraining_export view — curated rows ready for model retraining
--   5. category_performance view — per-category accuracy tracking
--   6. drift_monitor view — detects accuracy degradation over time
--
-- Execute via:
--   wrangler d1 execute frugal-hub --remote --file=hub/migrations/006_retraining_foundation.sql

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ENHANCE mooter_events with retraining columns
-- ═══════════════════════════════════════════════════════════════════════════

-- NOTE: SQLite ALTER TABLE ADD COLUMN has no IF NOT EXISTS.
-- This migration must only run ONCE per database. Re-running will fail
-- with "duplicate column name". Check via: PRAGMA table_info(frugal_events);

-- Which version of the algorithm made this decision?
-- Format: "v0.9.10-65ba0d3" (semver + git short hash)
ALTER TABLE frugal_events ADD COLUMN algorithm_version TEXT;

-- Composite complexity score 0.0-1.0 computed from prompt features
ALTER TABLE frugal_events ADD COLUMN prompt_complexity_score REAL;

-- Outcome quality score: -1.0 (bad) to +1.0 (good), NULL = unknown
ALTER TABLE frugal_events ADD COLUMN outcome_score REAL;

-- Source of the outcome_score: 'explicit'|'implicit'|'shadow'|'heuristic'|'composite'
ALTER TABLE frugal_events ADD COLUMN outcome_source TEXT;

-- Estimated savings in USD for THIS specific decision
ALTER TABLE frugal_events ADD COLUMN per_decision_savings_usd REAL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ALGORITHM VERSIONS — track every classify.js release
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS algorithm_versions (
  version_id        TEXT PRIMARY KEY,     -- "v0.9.10-65ba0d3"
  released_at       TEXT NOT NULL,        -- ISO 8601

  -- What changed in this version
  patterns_added    INTEGER DEFAULT 0,    -- count of new regex patterns
  patterns_removed  INTEGER DEFAULT 0,
  patterns_modified INTEGER DEFAULT 0,
  gold_labels_count INTEGER NOT NULL,     -- snapshot of gold-labels.json size

  -- Benchmark at release time (from backtest.js)
  benchmark_accuracy   REAL,              -- % on gold-labels at release
  benchmark_f1         REAL,              -- macro F1 across all categories
  benchmark_savings_pct REAL,             -- projected savings %

  -- A/B test results (if run before release)
  ab_test_quality_retention REAL,         -- % where B >= A
  ab_test_saving_usd        REAL,         -- total saving in test suite

  -- Per-category accuracy at release
  accuracy_by_category TEXT,              -- JSON: {"trivial_local": 0.95, "reasoning_intermediate": 0.88, ...}

  -- Per-tier distribution at release
  tier_distribution    TEXT,              -- JSON: {"T0": 0.35, "T1": 0.15, "T2": 0.25, "T3": 0.25}

  notes              TEXT                 -- free-form release notes
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. USER PROFILES — per-instance aggregate for personalization & cohort analysis
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_profiles (
  instance_id         TEXT PRIMARY KEY,   -- SHA256(host|user)[:8]
  first_seen          TEXT NOT NULL,      -- first event_date
  last_seen           TEXT NOT NULL,      -- most recent event_date

  -- Volume
  total_decisions     INTEGER DEFAULT 0,
  total_sessions      INTEGER DEFAULT 0,

  -- Tier distribution (lifetime)
  pct_t0              REAL DEFAULT 0,
  pct_t1              REAL DEFAULT 0,
  pct_t2              REAL DEFAULT 0,
  pct_t3              REAL DEFAULT 0,

  -- Category distribution (top 5 JSON)
  top_categories      TEXT,               -- JSON: [{"cat": "trivial_local", "pct": 0.35}, ...]

  -- Quality metrics
  avg_outcome_score   REAL,               -- weighted average of outcome_score
  explicit_feedback_count INTEGER DEFAULT 0,
  positive_feedback_pct   REAL,           -- % of explicit ratings that are positive

  -- Savings
  total_savings_usd   REAL DEFAULT 0,
  avg_savings_per_decision REAL DEFAULT 0,

  -- Environment
  hardware_tier       TEXT,               -- latest hw_tier
  has_ollama          INTEGER,            -- 0/1
  has_api_key         INTEGER,            -- 0/1

  -- Complexity profile
  avg_prompt_complexity REAL,             -- average complexity_score
  complexity_bucket     TEXT,             -- 'beginner' | 'intermediate' | 'advanced' | 'expert'

  -- Algorithm performance FOR THIS USER
  algorithm_accuracy  REAL,               -- % of decisions where outcome_score > 0
  worst_category      TEXT,               -- category with lowest accuracy for this user

  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen
  ON user_profiles(last_seen);
CREATE INDEX IF NOT EXISTS idx_user_profiles_hw_tier
  ON user_profiles(hardware_tier);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RETRAINING EXPORT VIEW — curated rows for model retraining
-- ═══════════════════════════════════════════════════════════════════════════
-- Only rows with known outcomes (outcome_score IS NOT NULL) are eligible.
-- Weighted by outcome confidence:
--   explicit > shadow > implicit > heuristic

CREATE VIEW IF NOT EXISTS retraining_candidates AS
SELECT
  e.id,
  e.instance_id,
  e.algorithm_version,
  e.decided_tier,
  e.task_category,
  e.confidence,
  e.prompt_len_bucket,
  e.has_file_refs,
  e.has_code_block,
  e.keyword_signals,
  e.prompt_complexity_score,
  e.outcome_score,
  e.outcome_source,
  e.per_decision_savings_usd,
  e.wall_clock_ms,
  e.event_date,
  -- Derived: was this a good decision?
  CASE
    WHEN e.outcome_score >= 0.3 THEN 'correct'
    WHEN e.outcome_score <= -0.3 THEN 'incorrect'
    ELSE 'ambiguous'
  END AS decision_quality,
  -- Derived: confidence of the outcome label
  CASE e.outcome_source
    WHEN 'explicit' THEN 1.0
    WHEN 'shadow' THEN 0.8
    WHEN 'implicit' THEN 0.5
    WHEN 'heuristic' THEN 0.3
    WHEN 'composite' THEN 0.6
    ELSE 0.1
  END AS label_confidence,
  -- Derived: should tier have been different?
  CASE
    WHEN e.outcome_score <= -0.3 AND e.cascade_upgrade = 1 THEN 'should_have_been_higher'
    WHEN e.outcome_score >= 0.5 AND e.decided_tier IN ('T2', 'T3') THEN 'could_be_lower'
    ELSE 'tier_ok'
  END AS tier_recommendation
FROM frugal_events e
WHERE e.outcome_score IS NOT NULL
ORDER BY
  -- Prioritize high-confidence labels for training
  CASE e.outcome_source
    WHEN 'explicit' THEN 1
    WHEN 'shadow' THEN 2
    WHEN 'composite' THEN 3
    WHEN 'implicit' THEN 4
    WHEN 'heuristic' THEN 5
    ELSE 6
  END,
  e.event_date DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. CATEGORY PERFORMANCE VIEW — per-category accuracy tracking
-- ═══════════════════════════════════════════════════════════════════════════

CREATE VIEW IF NOT EXISTS category_performance AS
SELECT
  e.task_category,
  e.algorithm_version,
  COUNT(*) AS total_decisions,
  -- Accuracy: % of labeled decisions with positive outcome
  ROUND(
    100.0 * SUM(CASE WHEN e.outcome_score >= 0.3 THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN e.outcome_score IS NOT NULL THEN 1 ELSE 0 END), 0),
    1
  ) AS accuracy_pct,
  -- Tier distribution within this category
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T0' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t0,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T1' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t1,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T2' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t2,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T3' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t3,
  -- Savings
  ROUND(SUM(COALESCE(e.per_decision_savings_usd, 0)), 2) AS total_savings_usd,
  ROUND(AVG(COALESCE(e.per_decision_savings_usd, 0)), 4) AS avg_savings_per_decision,
  -- Quality
  ROUND(AVG(e.outcome_score), 3) AS avg_outcome,
  SUM(CASE WHEN e.outcome_score IS NOT NULL THEN 1 ELSE 0 END) AS labeled_count,
  -- Latency
  ROUND(AVG(e.wall_clock_ms), 0) AS avg_latency_ms
FROM frugal_events e
GROUP BY e.task_category, e.algorithm_version
ORDER BY total_decisions DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. DRIFT MONITOR VIEW — detect accuracy degradation over time
-- ═══════════════════════════════════════════════════════════════════════════

CREATE VIEW IF NOT EXISTS drift_monitor AS
SELECT
  e.event_date,
  e.algorithm_version,
  COUNT(*) AS decisions_that_day,
  -- Daily accuracy
  ROUND(
    100.0 * SUM(CASE WHEN e.outcome_score >= 0.3 THEN 1 ELSE 0 END)
    / NULLIF(SUM(CASE WHEN e.outcome_score IS NOT NULL THEN 1 ELSE 0 END), 0),
    1
  ) AS daily_accuracy_pct,
  -- Daily tier distribution
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T0' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t0,
  ROUND(100.0 * SUM(CASE WHEN e.decided_tier = 'T3' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pct_t3,
  -- Daily savings
  ROUND(SUM(COALESCE(e.per_decision_savings_usd, 0)), 2) AS daily_savings_usd,
  -- Labeled count (how much feedback we got)
  SUM(CASE WHEN e.outcome_score IS NOT NULL THEN 1 ELSE 0 END) AS labeled_count,
  -- Average complexity (are prompts getting harder?)
  ROUND(AVG(e.prompt_complexity_score), 3) AS avg_complexity
FROM frugal_events e
GROUP BY e.event_date, e.algorithm_version
ORDER BY e.event_date DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. INDEXES for retraining queries
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_frugal_events_algorithm
  ON frugal_events(algorithm_version, event_date);
CREATE INDEX IF NOT EXISTS idx_frugal_events_outcome
  ON frugal_events(outcome_score) WHERE outcome_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_frugal_events_category_outcome
  ON frugal_events(task_category, outcome_score);
