// ecosystem.config.js — pm2 config-as-code for the Mooter fleet (flicker fix 2026-07-10).
//
// WHY THIS FILE EXISTS: the mooter-fleet app used to live only in pm2's runtime
// state (`pm2 start … --name mooter-fleet` by hand + `pm2 save`). This file makes
// the config reviewable and pins `windowsHide: true` explicitly, so a
// `pm2 kill && pm2 resurrect` (or the pm2-windows-startup boot path) can never
// come back without it. Defense-in-depth: the real flicker fix is in the code
// (gpu-stream.mjs — ONE persistent hidden nvidia-smi instead of a spawn every
// ~15s), this file guarantees the app process itself stays windowless too.
//
// Apply / re-apply (idempotent, from this directory):
//   pm2 restart ecosystem.config.js --update-env && pm2 save
// NEVER `pm2 delete` — stop/start/restart only (repo guard-rail).

module.exports = {
  apps: [
    {
      name: "mooter-fleet",
      script: "_handoff/fleet/fleet-forever.mjs",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      windowsHide: true,
      autorestart: true,
      // STOP sentinel = clean PAUSE inside the loop (see fleet-forever.mjs);
      // pm2 stop remains the real shutdown, so restarts here are crash-only.
      env: {
        MOOTER_MODE: "1",
        MOOTER_TERMINAL: "1",
        FLEET_MODEL: "qwen2.5-coder:14b",
        FLEET_MODEL_VRAM_GB: "9",
        FLEET_IDLE_PILLARS: "site,design,vscode-plugin,skills",
        FLEET_POOL_WIDTH: "16",
        FLEET_GPU_CONCURRENT: "16",
        FLEET_ROUNDS_PER_CYCLE: "3",
        FLEET_CYCLE_GAP_MS: "15000",
        FLEET_NIGHT_MODEL: "qwen3:30b",
      },
    },
  ],
};
