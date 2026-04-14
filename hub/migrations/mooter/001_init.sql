-- mooter-hub D1 schema v1

CREATE TABLE IF NOT EXISTS deltas (
  id            TEXT PRIMARY KEY,
  received_at   TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  hw_tier       TEXT NOT NULL,
  sub_profile   TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'en',
  session_count INTEGER,
  prompt_count  INTEGER,
  tier_distribution TEXT,
  keyword_signals   TEXT,
  unknown_models    TEXT,
  feedback_signals  TEXT,
  delta_version     TEXT,
  trust_score       REAL DEFAULT 0.5
);

CREATE INDEX IF NOT EXISTS idx_deltas_received ON deltas(received_at);
CREATE INDEX IF NOT EXISTS idx_deltas_expires ON deltas(expires_at);
CREATE INDEX IF NOT EXISTS idx_deltas_hw_tier ON deltas(hw_tier);

CREATE TABLE IF NOT EXISTS model_signals (
  model_name     TEXT PRIMARY KEY,
  first_seen     TEXT NOT NULL,
  last_seen      TEXT NOT NULL,
  mention_count  INTEGER DEFAULT 1,
  hw_tiers       TEXT,
  status         TEXT DEFAULT 'pending',
  paulo_notified INTEGER DEFAULT 0,
  notes          TEXT
);

CREATE TABLE IF NOT EXISTS aggregated_stats (
  period       TEXT NOT NULL,
  period_start TEXT NOT NULL,
  hw_tier      TEXT NOT NULL,
  sub_profile  TEXT NOT NULL,
  sample_count INTEGER,
  avg_t0_rate  REAL,
  avg_t2_rate  REAL,
  avg_t3_rate  REAL,
  avg_savings  REAL,
  avg_followup REAL,
  PRIMARY KEY (period, period_start, hw_tier, sub_profile)
);

CREATE TABLE IF NOT EXISTS anomalies (
  id             TEXT PRIMARY KEY,
  detected_at    TEXT NOT NULL,
  type           TEXT NOT NULL,
  severity       TEXT NOT NULL,
  description    TEXT NOT NULL,
  payload        TEXT,
  paulo_notified INTEGER DEFAULT 0,
  resolved       INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_anomalies_type ON anomalies(type);
CREATE INDEX IF NOT EXISTS idx_anomalies_notified ON anomalies(paulo_notified);
