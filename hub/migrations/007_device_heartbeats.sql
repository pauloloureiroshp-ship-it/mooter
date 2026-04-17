-- 007_device_heartbeats.sql
-- Tracks install and runtime heartbeats from mooter devices.
-- Powers onboarding-success telemetry and hw/sw fleet distribution.

CREATE TABLE IF NOT EXISTS device_heartbeats (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  event TEXT NOT NULL,                 -- install_start | install_ok | install_fail | alive
  setup_version TEXT,
  hw_tier TEXT NOT NULL DEFAULT 'unknown',
  sub_profile TEXT NOT NULL DEFAULT 'unknown',
  platform TEXT,
  node_version TEXT,
  claude_code_version TEXT,
  error TEXT,
  client_ts TEXT,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_device ON device_heartbeats(device_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_event ON device_heartbeats(event);
CREATE INDEX IF NOT EXISTS idx_heartbeats_received ON device_heartbeats(received_at);
