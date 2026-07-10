# PAULO QUEUE — human-gated items the wave-runner generated

> Two-factor: the runner never merges, deploys, or makes machine-state changes.
> Everything that needs Paulo lands here. Newest wave on top.

## From Wave 1 — W-LAND · batch landing (2026-07-10)

Full detail: `_handoff/waves/WLAND_INVENTORY.md`. Inspected the 23 most recent unmerged branches (read-only).

### Draft PRs opened by the runner — review + merge/close (5)
- [ ] **PR #235** — `feat/pm-adapters` (opt-in Ledger→PM bridge). Clean merge.
- [ ] **PR #236** — `feat/lp-cockpit-layout` (deterministic trivial-bypass classifier). Clean, but **standalone/unwired** and its test is a narrative print script — decide policy + wire before relying on it.
- [ ] **PR #237** — `wave/directors-cut-v2` (local Live-Preview DCv2, ~1300 lines tests). ⚠️ Conflicts `SYNC.md` + `extension.js`; confirm it is NOT folded into the cloud MP5 trilho before landing.
- [ ] **PR #238** — `feat/moo-dispatch` (⇄ Moo Dispatch F0 cockpit). ⚠️ Conflicts in `extension.js` + a webview test.
- [ ] **PR #239** — `feat/wire-adaptive-learner-decide-agent` (opt-in `use_learned`, default-off). Clean merge (was local-only; runner pushed it).

### Needs Paulo decision (not auto-PR'd)
- [ ] **`feat/site-v2`** — inspection agent flagged LANDABLE, but the branch has **no local ref** (only `origin/`), so the agent's git commands were unreliable. **Re-inspect manually** (`git log origin/main..origin/feat/site-v2`) before trusting; likely additive marketing sections vs open site PRs (#200 pilar/site-clean).
- [ ] **June-23 cluster — `wave-WN1-niche-eval` · `wave-WFV-fleet-view` · `wave-W3-loop-polish` · `wave/cockpit-w1-autoskill`** — all LANDABLE but **local-only, ~295 commits behind, and overlapping** (WN1 niche-eval bench + 🚀 Fleet tab + autopilot chip appear across 3 of them; W3 looks like the superset). The runner did **not** open 4 redundant PRs. Pick **one** (likely W3), rebase, cherry-pick the niche-eval uplift (67.9%→80.4%) + Fleet tab, land as a single PR — or prune if newer cockpit work already covers it.

### Prune candidates (SUPERSEDED / STALE — safe `git branch -D` after a glance)
- `feat/overclock-moo-p1`, `wave/cockpit-handoff`, `wave/cockpit-handoff-v2`, `fleet-f1`, `wave-W4-council-chip`, `pilar/council`, `wave-W5-council-revert`, `pilar/site`, `wave-council-w2`, `wave60_design_redesign` (all superseded by open PRs / newer branches); `wave66-graphify` (empty CI-resync commit). See inventory for the superseding ref of each.
- **Do not touch** `feat/live-edit` / `feat/lp-preview-diagnostics` — Live-Preview MP5, cloud-managed trilho.
- **~85 older branches** (pre-2026-06-22, single-commit, 300–750 behind) were not individually inspected — bulk prune review recommended; landing any would reintroduce ancient divergence.

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
