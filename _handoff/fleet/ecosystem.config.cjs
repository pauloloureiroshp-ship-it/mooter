// ecosystem.config.cjs — pm2 supervisor config for the $0 Mooter fleet (F4 hardened).
//
//   pm2 start _handoff/fleet/ecosystem.config.cjs
//   pm2 save              # persist across reboots (with a boot-persistence service)
//   pm2 stop mooter-fleet # or: create _handoff/fleet/STOP for a clean in-loop shutdown
//
// The fleet runs the DAY model (qwen2.5-coder:14b ≈ 9GB) which fits alongside the
// router; the VRAM pre-flight in local-pillar guards against contention regardless.
// exp-backoff + min_uptime/max_restarts kill crash-loops; max-memory-restart caps RAM.
module.exports = {
  apps: [
    {
      name: "mooter-fleet",
      script: "_handoff/fleet/fleet-forever.mjs",
      cwd: "C:/Users/Paulo Loureiro/frugal-fleet-arm",
      interpreter: "node",
      exp_backoff_restart_delay: 100,   // crash → 100ms, then exponential backoff
      max_memory_restart: "1G",
      min_uptime: "30s",                // < 30s alive = counts as a failed start
      max_restarts: 10,                 // 10 fast failures in a row → give up (crash-loop guard)
      autorestart: true,
      kill_timeout: 8000,               // give a round time to finish on restart
      env: {
        FLEET_MODEL: "qwen2.5-coder:14b",
        FLEET_MODEL_VRAM_GB: "9",
        FLEET_IDLE_PILLARS: "site,design,vscode-plugin,skills",
        FLEET_POOL_WIDTH: "16",
        FLEET_GPU_CONCURRENT: "16",
        FLEET_ROUNDS_PER_CYCLE: "3",
        FLEET_CYCLE_GAP_MS: "15000",
        FLEET_NIGHT_MODEL: "qwen3:30b", // reserved; window enforcement is a follow-up
      },
    },
  ],
};
