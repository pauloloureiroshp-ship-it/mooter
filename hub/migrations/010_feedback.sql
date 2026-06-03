-- 010_feedback.sql
-- Anonymous, pseudonymous free-text feedback from `mooter feedback "<msg>"`.
-- Wave 12 D1-2 (carryover Wave 11 PR-C): feedback no longer requires login —
-- it ingests here on the hub (anon by design + F-1 rate-limit), NOT the
-- Supabase landing endpoint. NO PII: content is PII-rejected client+server side;
-- user_id_hash is a one-way hash (nullable for fully-anonymous senders);
-- ip_hash is a salted hash used only for rate-limiting (never raw IP).
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id_hash TEXT,                       -- nullable: anonymous senders have none
  content TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT 'other',     -- bug | feature | performance | docs | other
  severity TEXT NOT NULL DEFAULT 'low',    -- low | medium | high
  mooter_version TEXT,
  hw_tier TEXT,
  ip_hash TEXT,                            -- salted hash, rate-limit only
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_received ON feedback(received_at);
CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback(ip_hash, received_at);
