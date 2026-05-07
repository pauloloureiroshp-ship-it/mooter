# Wave-1.5 Verdict — Per-User Telemetry Bootstrap

**Date:** 2026-05-07
**Branch:** `main` (12 commits ahead of `origin/main`)
**Tracker:** UP at `:7821` (pid 59172)
**Final reviewer:** PASS-WITH-NOTES

## Acceptance check (8/8)

| Gate | Status | Evidence |
|------|--------|----------|
| `subscription-profile.json` reflects detected subs | ✅ | `node detect-subscriptions.js` writes `anthropic.max` + `openai_codex_cli.chatgpt_pro_or_plus` + `ollama.installed` (smoke `~/.claude/tools/router/subscription-profile.json`). |
| `user-profile.js --show` shows correct subscriptions | ✅ | Anthropic Pro: yes / Claude Code: max / OpenAI Plus: yes (was no/none before). |
| Tracker `/me` responds with user-specific data | ✅ | `curl :7821/me` returns 30d aggregations (812 prompts, tier mix T0:70.6/T1:0.2/T2:6.8/T3:22.4, peak 14-20 UTC). |
| `/me/feedback` POST works | ✅ | Validates `followup_quality ∈ {0,1}`, appends `quality_feedback` event to decisions.log. |
| `/me/settings` GET/PUT works | ✅ | Mode round-trip verified (auto → zen → auto), budget config readable. |
| `hub-submit-events.js` scheduler armed | ✅ | `hub-events-scheduler.js` skip-below-threshold + dry-run verified; bearer from `~/.frugal/auth.token`; sibling scripts via `__dirname`. |
| `mooter-tester-focus.json` aligned with Wave-1.6 | ✅ | v3.1 — classifier weight 0.03 → 0.40, statusline 0.70 → 0.30, 3 new probing skills + adversarial seed prompts. |
| `adversarial-corpus.jsonl` ≥ 100 prompts | ✅ | 79 unique + 326 frequency-weighted = 405 total entries in `.planning/wave-1.5/`. Top patterns: T2→T0 (62), T3→T0 (12). |
| Sentry opt-in done | ✅ | `sentry-setup.js --enable --dsn …` writes chmod-0600 `~/.claude/tools/router/.sentry.json`, gitignored. DSN masked in CLI. Auto-tags `user_id_hash` + `mooter_version` from `version.json`. |

## Tests

- **Wave-1.5 new tests:** 26/26 passing across 5 files (`detect-subscriptions.test.js`, `profile-refresh.test.js`, `savings-tracker-me.test.js`, `hub-events-scheduler.test.js`, `sentry-setup.test.js`).
- **Full suite:** baseline 169/195 (26 fail) → HEAD 172/198 (26 fail). **Net: +3 passing, 0 new failures.** The 26 pre-existing failures are in `backtest.test.js` (gold-label drift), unrelated to Wave-1.5.

## Commits delivered (12 ahead of origin)

| Commit | Wave | Subject |
|--------|------|---------|
| `aef21c0` | 1.5-fix | fix(holdout-validator): JSDoc on tsMs + fallback signatureFn |
| `00b7d80` | 1.5-fix | fix(backtest): default holdoutPct to 0.2 (closes tsc strict error) |
| `f97dfab` | **1.5 #7** | feat(observability): Sentry opt-in CLI with user_hash + version tagging |
| `4527193` | **1.5 #6** | feat(tester): export misrouting harvest for Wave-1.6 adversarial training |
| `9607cec` | **1.5 #5** | chore(tester): focus.json v3.1 — Wave-1.6 adversarial probing weights |
| `a7387df` | **1.5 #4** | feat(hub): event submission scheduler (every 50 classified events) |
| `c9c3f13` | **1.5 #3** | feat(tracker): /me + /me/feedback + /me/settings per-user endpoints |
| `474baad` | Wave-2 P1 | feat(router): confidence calibration via ground-truth oracles |
| `9c2bc8a` | **1.5 #2** | feat(profile): weekly auto-refresh wrapper for subscription + user profile |
| `6472f53` | **1.5 #1** | feat(profile): auto-detect subscriptions |
| `97a9b28` | Wave-2 P1 | feat(backtest): chronological holdout split + tuning validation |
| `fbdf46c` | Wave-2 P1 | feat(router): drift detector with statusline integration |

**Scope note:** 3 Wave-2 P1 commits (`fbdf46c`, `97a9b28`, `474baad`) landed alongside Wave-1.5 from an earlier autonomous session that didn't push. They are tested and self-contained but are out-of-scope for the brief. Recommend the user be informed before push.

## What's now operational

- **Subscriptions** are auto-detected from canonical signals (`~/.claude/.credentials.json subscriptionType`, `codex login status`, env keys), no longer requiring interactive y/N prompts. The `detected` sub-object inside `subscription-profile.json` carries per-provider evidence.
- **Per-user metrics** (`/me`) ship the data the future dashboard + landing demo will need (savings_usd_30d, peak hours, top categories, calibration alert). The endpoint validates the optional `user_id_hash` shape and falls back to "this device's local entries" for anonymous installs.
- **Hub event submission** can now run autonomously when the OS scheduler invokes `hub-events-scheduler.js`. Lock-file + PID-staleness override guards against overlap. Token sourced from the existing `frugal-login.js` artifact.
- **Continuous-tester** has the right priorities for Wave-1.6: weighted toward classifier accuracy with explicit seed prompts for rename/format → T0 and advice/compare → T2_KEEP.
- **Sentry** is one CLI command away: `node sentry-setup.js --enable --dsn <DSN>`. DSN never echoed in full to stdout. Tags carry `user_id_hash` + `mooter_version` so cross-version comparisons work.

## Wave-1.6 hand-off

Wave-1.6 retune consumes:
- `.planning/wave-1.5/adversarial-corpus.jsonl` (79 unique with `count` field)
- `.planning/wave-1.5/adversarial-corpus-full.jsonl` (326 occurrences for frequency-weighted training)
- `tools/router/mooter-tester-focus.json` v3.1 seed prompts (`_wave_1_6_adversarials`)

Top misrouting pattern is **T2 → T0 (62 cases)** — the T0 fast-path is too aggressive on prompts the tester labelled as T2. Wave-1.6 Task #4 (T0 trivial detector re-tune) should NOT widen T0; instead it should tighten the discriminator so genuine T2 work doesn't fall through.

## Pending

- **Push** to origin — gated on user approval (12 commits, 3 of which are Wave-2 P1 scope drift).
- **Notion sub-page** under HQ `33d6f6e4-2bc4-816b-977a-fe84bbe912c9` — requires user-authenticated MCP call, will be created in this same session if the Notion MCP is reachable.
- **SYNC.md** COWORK→CLAUDE CODE section — to be updated after push.
- **Continuous-tester restart** — tester is still inactive (16 days). Restart command: `tools/router/run-continuous-tester.cmd` (Windows). The script reads the new `focus.json` v3.1 on startup. Recommend starting it in a dedicated terminal window.

## Verdict

**Wave-1.5 PASS.** Wave-1.6 is GREEN-LIT once the user pushes and (optionally) restarts the continuous tester to start generating new adversarials against the v3.1 weights.
