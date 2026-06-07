-- Wave 29 (Phase 29.K) — L14/L15 device setup profiles (federated cohort).
--
-- Opt-in (default off). One row per device: coarse hardware/subscription class
-- only — never raw serial numbers, hostnames or paths. device_id is the
-- client_id_pseudonymous (anonymous). Joined into pastor_v2_decisions' setup
-- features. Any PUBLIC aggregate over this table must pass k-anonymity ≥ 50
-- (enforced by the /v1/federated route); DP noise is added from Wave 31.
--
-- Additive — does not touch any 001-013 table.

CREATE TABLE IF NOT EXISTS device_setup_profiles (
  device_id            TEXT PRIMARY KEY,   -- client_id_pseudonymous (anonymous)
  hardware_class       TEXT,               -- 'apple-silicon', 'nvidia-rtx-4090', 'cpu-only', …
  vram_gb              INTEGER,
  has_npu              INTEGER,            -- 0/1/NULL
  os_class             TEXT,               -- 'darwin' | 'linux' | 'wsl2' | 'windows'
  ollama_models_count  INTEGER,
  subscription_tier    TEXT,               -- 'claude-max' | 'claude-pro' | 'none' | 'multi'
  last_updated         INTEGER,            -- client epoch ms
  received_at          TEXT NOT NULL       -- server ingestion timestamp
);

CREATE INDEX IF NOT EXISTS idx_setup_hardware ON device_setup_profiles (hardware_class);
CREATE INDEX IF NOT EXISTS idx_setup_received ON device_setup_profiles (received_at);
