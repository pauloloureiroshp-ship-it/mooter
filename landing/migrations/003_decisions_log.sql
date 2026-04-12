-- MP-13 PEÇA 6: decisions_log table for historical trend tracking
-- Run manually in Supabase SQL Editor — NOT auto-executed
--
-- Each sync from /api/install-complete inserts a row here,
-- enabling trend charts of decisions over time per user/device.

CREATE TABLE IF NOT EXISTS decisions_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  device_id   TEXT REFERENCES devices(device_id) ON DELETE SET NULL,
  decisions   INTEGER NOT NULL,
  savings_usd DECIMAL(10,2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decisions_log_user_idx ON decisions_log(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS decisions_log_device_idx ON decisions_log(device_id, recorded_at DESC);

-- RLS: only the user who owns the row can read it; admin can read all
ALTER TABLE decisions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own decisions_log"
  ON decisions_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own decisions_log"
  ON decisions_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin bypass (same pattern as profiles/devices)
CREATE POLICY "Admin reads all decisions_log"
  ON decisions_log FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'paulo.loureiro.shp@gmail.com'
  );
