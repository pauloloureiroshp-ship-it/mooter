-- MP-12: Multi-device support (1 user → N devices)
-- Run manually in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS devices (
  device_id     TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_name   TEXT,
  os_type       TEXT,
  arch          TEXT,
  hw_tier       TEXT,
  has_ollama    BOOLEAN DEFAULT false,
  ollama_models JSONB DEFAULT '[]',
  ollama_has_qwen3b  BOOLEAN DEFAULT false,
  ollama_has_qwen30b BOOLEAN DEFAULT false,
  has_anthropic_key  BOOLEAN DEFAULT false,
  has_openai_key     BOOLEAN DEFAULT false,
  has_gemini_key     BOOLEAN DEFAULT false,
  frugal_version     TEXT,
  decisions_count    INTEGER DEFAULT 0,
  savings_usd        DECIMAL(10,2) DEFAULT 0,
  last_sync_at       TIMESTAMPTZ DEFAULT now(),
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devices_user_id_idx ON devices(user_id);

-- RLS: users can only see/modify their own devices
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own devices"
  ON devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own devices"
  ON devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices"
  ON devices FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own devices"
  ON devices FOR DELETE
  USING (auth.uid() = user_id);
