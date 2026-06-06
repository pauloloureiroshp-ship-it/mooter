# Wave 24 — Day 1 Findings (Pre-Launch Fixes)

> Branch `wave24-pre-launch-fixes` · 2026-06-06 · CC autonomous.
> Scope: 6 critical friends-launch blockers (24.A–F). 1 consolidated PR.
> classify.js sha `7b01eb86…87762` — **byte-identical, untouched** (guarded).

## TL;DR (key findings first)

1. **24.A root cause was a missing CSS state, not a JS bug.** `.flow-tooltip`
   had no `opacity:0/visibility:hidden` default and no `:hover` reveal rule, so
   all 9 tooltips rendered permanently, stacking over the body copy. One CSS
   block fixed it + `tabIndex`/`:focus-within` for keyboard a11y.
2. **24.E is a diagnosis, not a blind patch.** The hub `tier_distribution`
   schema *matches* the real delta client (`hub-push.js` sends lowercase
   `{t0,t1,t2,t3}`, the stats query reads `$.t0`). The all-zero average is most
   likely the `AND trust_score >= 0.4` filter excluding a single new/low-trust
   device — `prompt_count` has no such filter, which is why it shows 5 while the
   average shows 0. **This needs Paulo's `wrangler tail` to confirm the stored
   rows before any hub change.** No hub files were touched (per the gate).
3. **24.F: detection was already correct; the path in the kickoff was wrong.**
   There is no `tools/router/hw-detect.js`; the logic lives in
   `tools/router/gpu-probe.js` (`classifyHwTier`). It already handles win32 via
   `nvidia-smi`. The new `mooter env-detect` confirms `gpu-high` for the RTX
   4090 on WSL2 — **not** apple-silicon. The hub "apple-silicon" row is stale /
   cross-machine data; dedup is by `user_id_hash`, surfaced by the new command.

## What shipped

| Sub | Status | Change |
|---|---|---|
| 24.A | ✅ done | `globals.css` `.flow-tooltip` hidden-by-default + hover/focus reveal, box-shadow, viewport-clamped max-width, z-index 20. `FlowNode`/`ModelCard` get `tabIndex={0}` + `aria-label` + `cursor:help`. Removed duplicate version chip mid-content in "How it works" (kept in Overview/Devices). |
| 24.B | ✅ done | Prominent stale-data banner (⚠ + bold + one-click `mooter sync` copy + "Update mooter →"). Hero numbers dimmed (`opacity:0.5`) when stale. First-run empty state when never synced. |
| 24.C | ✅ done | Removed unqualified "No data sent anywhere". "Your prompt" / "Pre-processing" / Ollama tooltips now state routing-is-local vs execution-may-be-cloud + divergence chip. `/privacy` gains a "Routing vs execution" section with the T0→cloud-Haiku caveat. |
| 24.D | ✅ done (γ) | `mooter init` end now prints the post-install nudge: run `mooter sync` to populate the dashboard; states mooter does not auto-sync. Dashboard persistent reminder = the 24.B banner/empty-state. |
| 24.E | ⚠ diagnosed | Root-cause hypothesis documented (trust filter). **Blocked on Paulo runtime validation** — see below. Hub untouched. |
| 24.F | ✅ done | New `mooter env-detect [--json]` command (`packages/cli/src/commands/env-detect.ts`) prints OS/GPU/hw_tier + `instance_id` (per-machine) + `user_id_hash` (stable, cross-machine dedup). Self-contained probe mirroring `gpu-probe.js`. |

## Files changed (Wave 24 only — selective commit)

- `landing/app/globals.css` — tooltip reveal-on-hover/focus.
- `landing/app/(app)/dashboard/page.tsx` — tooltip a11y, version consolidation, stale banner, empty state, dimmed numbers, honest copy.
- `landing/app/(marketing)/privacy/page.tsx` — Routing vs execution section + caveated T0 card.
- `landing/app/_components/VersionBadge.tsx` — stale chip gains actionable `· update` → /install.
- `packages/cli/src/commands/init.ts` — post-install onboarding nudge.
- `packages/cli/src/commands/env-detect.ts` — **new** command.
- `packages/cli/src/index.ts` — register `env-detect` + usage.
- `packages/cli/tests/env-detect.test.ts` — **new** (6 tests).
- `landing/app/_components/wave24-prelaunch.test.ts` — **new** (6 regression guards).

## Tests

- `packages/cli` — 210/210 pass (incl. 6 new env-detect).
- `landing` wave24 + VersionBadge + dashboard/marketing parity — 24/24 pass.
- `landing tsc --noEmit` — 0 errors in changed files.
- CLI `esbuild` bundle — builds clean.
- classify.js sha — `7b01eb86…87762` byte-identical ✅.
- **Pre-existing unrelated failure**: `tools/router/classify.test.js`
  "tuned_demote still works…" fails due to runtime `router-tuning.json` state,
  **not** Wave 24 (zero router files touched). Left for a router-tuning wave.

## 24.E — diagnostic steps for Paulo (E2E gate)

The fix cannot be made safely without seeing the stored rows. Run:

```bash
# 1. From WSL Linux, push a real delta
node ~/.claude/tools/router/hub-push.js

# 2. Inspect what the hub actually stored
wrangler tail mooter-hub        # while the push runs
# then query the deltas table directly:
#   SELECT received_at, trust_score, tier_distribution, prompt_count FROM deltas
#   ORDER BY received_at DESC LIMIT 5;
```

Decision tree once the rows are visible:
- **tier_distribution JSON is `{t0..t3}` populated but `trust_score < 0.4`** →
  confirmed: the `tierAvg` filter is too strict for a single new device. Fix =
  lower/bootstrap the threshold in `hub/routes/stats.js` (1-line, then redeploy).
  This is the most likely cause given `prompt_count:5, avg all 0`.
- **tier_distribution is `{}`/null** → the delta client wrote the fallback;
  trace `backtest.js --export-delta` producing `backtest-delta.json`.
- **rows older than 7 days** → just stale; a fresh `hub-push.js` repopulates.

Only after this confirmation should a hub change land (then `final-reviewer`).
The optional `/api/pastor/learning-health` endpoint is deferred until the data
is confirmed non-zero (kickoff step 4 is conditional).

## C4 (apple-silicon mislabel) — resolved at tooling level

`mooter env-detect` output on Paulo's WSL2 box:

```
OS          Linux (WSL2) 6.6.87.2-microsoft-standard-WSL2
GPU         RTX 4090 · 24564 MB VRAM
hw_tier     gpu-high
instance_id 8d254748        (per-machine)
user_id_hash f50b36ca0764bbb4  (stable — same on all your machines)
```

Correct. The hub's "apple-silicon" row is stale/other-machine data; aggregation
dedups by `user_id_hash`, which `env-detect` now surfaces so Paulo can verify
the same hash on each machine.

## final-reviewer gate

Verdict: **PASS-WITH-NOTES** (Opus). Non-negotiables all clean (classify sha,
zero hub touch, no unqualified "no data sent", router untouched). Two real
issues found and **fixed before the gate closed**:

1. **Model-card tooltip over-reveal** — the reveal rule used a descendant
   combinator, so hovering one model card revealed all 4 (the 4 cards nest in
   an outer `.flow-node`). Fixed with the child combinator `>`.
2. **`env-detect` user_id_hash always null** — read only `~/.frugal/user.hash`,
   but `mooter login` persists to `~/.mooter/auth.json`. Now reads auth.json
   first (CLI login) then falls back to the router file. Verified: now resolves
   `f50b36ca…` for a logged-in user.

Both fixes are in the amended commit `2a3d65f` (re-tested green).
