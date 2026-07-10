# PAULO QUEUE — human-gated items the wave-runner generated

> Two-factor: the runner never merges, deploys, or makes machine-state changes.
> Everything that needs Paulo lands here. Newest wave on top.

## From Wave 0 — HARMONY CLOSER (2026-07-10)

### Merges (draft PRs — review + merge when ready)
- [ ] **PR #232** — `feat/fleet-arm` → main (Evolution Fleet + Harmony F1–F3).
  - ⚠️ Conflicts **only in `SYNC.md`** (pre-existing main divergence + new `## Fleet (auto)` block). Resolve at merge (keep both).
  - **After merge:** re-point `ecosystem.config.js` cwd + watchdog schtask from `../frugal-fleet-arm` → `~/frugal`, then `pm2 restart mooter-fleet`. Do **not** do this before merge (moves the live fleet off its tree).
- [ ] **PR #233** — `feat/quota-aware` → main (Q0–Q4). Tests **not re-run** by the runner — run `tools/router` suites + a live statusline smoke before merge. Landing this creates `~/.mooter/quota-live.json`, which makes the runner's quota-guard real.

### Admin (machine-state, ~1 min)
- [ ] **Run `_handoff/fleet/ADMIN_FINALIZE.ps1`** (from the fleet-arm worktree, or after merge from `~/frugal`). It sets logrotate config, tries to install pm2-logrotate (blocked on this box by the pm2 space-in-username bug — see script header for workarounds), creates a user-logon `pm2 resurrect` schtask (boot persistence), and `pm2 save`. Idempotent; logs to `ADMIN_FINALIZE.log`. Elevate only if `schtasks` reports it needs admin.

### Notes
- `pm2 install pm2-logrotate` fails via `pm2 install` because pm2 spawns npm with an unquoted path that truncates at the space in `C:\Users\Paulo Loureiro`. Admin does **not** fix it. Tracked in the script; the fleet loop is unaffected (logs just grow until rotated).
