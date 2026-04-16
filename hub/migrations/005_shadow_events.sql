-- Shadow pairs table — stores primary/shadow response pairs for nightly judging.
-- Sprint B.1: Shadow Mode Lite (see docs/METHODOLOGY.md §7).
--
-- Each row pairs a primary (tier >= T2) response with a shadow (tier-1) response
-- to the same prompt. The judge field is populated nightly by shadow-judge.js.
--
-- Privacy: primary_preview and shadow_preview are truncated to 200 chars.
-- No raw prompt or code is stored.

CREATE TABLE IF NOT EXISTS shadow_pairs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id     TEXT NOT NULL,
  session_id      TEXT,
  primary_tier    TEXT NOT NULL,
  shadow_tier     TEXT NOT NULL,
  primary_preview TEXT,
  shadow_preview  TEXT,
  judge_verdict   TEXT,     -- 'primary_better' | 'shadow_better' | 'tie' | NULL
  judge_model     TEXT,     -- model used to judge (e.g. 'llama3.2:3b')
  judge_confidence REAL,
  judged_at       TEXT,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shadow_unjudged
  ON shadow_pairs(judge_verdict) WHERE judge_verdict IS NULL;

CREATE INDEX IF NOT EXISTS idx_shadow_by_tiers
  ON shadow_pairs(primary_tier, shadow_tier, judge_verdict);
