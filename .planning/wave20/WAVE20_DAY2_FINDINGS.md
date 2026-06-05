# Wave 20 — Day 2 Findings (Friends Launch Polish)

**Date:** 2026-06-05 · Branch: `wave20-friends-launch-polish` (on top of Day 1 `db6f5f7`)
**Pre-flight:** Day 1 = 20.A branding (`mooter →`) + 20.B session-id foundation. Day 2 = 20.B core wiring + 20.C–F + tests.

---

## TL;DR (3 lines)
- **20.B core LANDED**: the herd tracker is now WRITTEN at runtime (Day 1 root cause fixed) — PostToolUse detects `Agent`/`Task`, maps `subagent_type`→tier, and records the spawn. Proven by unit + integration tests AND a direct stdin test against the **wired production hook** (wrote a real `/tmp/mooter-herd-*.json`).
- **20.C/D/E/F shipped**: `tkns` unit label · `🏠 calls % + tokens local %` dual metric · `🐄` live pulse · Stop digest per-task breakdown.
- **Guards held**: `classify.js` byte-identical (`7b01eb86…87762`); Wave 19 token tracker + Wave 13.1 stderr fix intact; **0 regressions** (the 6 full-suite failures are pre-existing & identical at clean `db6f5f7`).

---

## What changed (per sub-feature)

| # | File(s) | Change | Verified by |
|---|---|---|---|
| **20.B** | `post_tool_badge.js` | `recordSpawn()` + `SUBAGENT_TIER` map + `readHookPayload()`/`sessionIdFrom()`; `main()` reads stdin once, records the spawn before the badge gate (so the 🐄 chip is honest even in quiet mode), prefers the just-spawned agent for the annotation. trackSpawn→trackComplete idempotent by `tool_use_id`. | 2 new tests + live wired-hook stdin test wrote the real cache |
| **20.C** | `statusline-multi.js` `buildTokenChip()` | single `tkns` unit label on the first tier (`🪙 T0:13.3k tkns · T1:0 · …`) | 1 new test + updated 4 existing expectations |
| **20.D** | `statusline-multi.js` `tokensLocalPct()` + `fmtSharePct()` + home chip | `🏠 6/10 calls (60%) · 0.1% tokens local` — exposes that a high call-share can mask a tiny token-share (one Opus turn dwarfs many Ollama calls) | 2 new tests + updated 2 existing expectations |
| **20.E** | `statusline-multi.js` `buildHerdsChip()` | subtle dim pulse (`◉`/`◯`) trailing the chip, alternating per render tick, only while ≥1 Moo active; never splits the `⚡ workflow` cue | 1 new test |
| **20.F** | `stop_hook.js` `buildPerTaskLines()` + report section | additive `PER-TASK BREAKDOWN` (`N. op → llm · in→out (via x) · reason`); capped with honest "showing last N of M". **Kept** grouped CHOICE REASONS so Wave 19.D stays intact. | 2 new tests; existing report tests unchanged |

Plus: `package.json` — added the orphaned `stop-session-report.test.js` to the `test` script (it was never wired into CI). `sync-to-runtime.sh` — added the herd/digest hook module set (`subagent_tracker`, `post_tool_badge`, `stop_hook`, `decisions_v2`) to `SYNC_FILES` to stop runtime drift.

## Decisions / trade-offs
- **20.F additive, not replace.** The kickoff said "replace simple count with full per-task list". I kept the grouped `CHOICE REASONS` (Wave 19.D non-negotiable: "Wave 19 intacto") AND added the full `PER-TASK BREAKDOWN` below it. Net effect = the digest now shows the per-task list; the summary is a bonus, and zero Wave 19 tests had to change.
- **20.F privacy.** `decisions_v2` carries **no prompt text** (whitelisted schema). The per-task line is labelled by `op`/category, never the prompt — zero PII, as required.
- **20.B active/peak approximate.** PostToolUse fires post-completion, so `total spawned` is accurate but `active`/`peak` are approximate (we never see the in-flight window). This is the Day-1-accepted trade-off for not touching `settings.json` (shared-config guardrail).

## 20.B live-validation note (honest)
The wired runtime hook is `node /home/paulo/mooter/tools/router/post_tool_badge.js` (symlink chain → this repo; same inode, so edits are live). Feeding it a standard `Task` PostToolUse payload **wrote** `/tmp/mooter-herd-<sid>.json` with `count:1 · local-summarizer · T0 · peak 1 · avg 1ms` and printed the `🐄 local-summarizer × 1` annotation — exactly as designed.

A real in-session `local-summarizer` spawn did **not** create a file in **this** harness (FleetView). This session's token cache *did* update (PostToolUse fires for ordinary tools), so the gap is that this harness runs the Agent tool in-process and does **not** emit a standard `Task` PostToolUse event. The production Claude Code CLI **does** — which is the Day-1-designed path and what **20.G E2E (Cowork, Chrome MCP)** gates before prod promote. No code change needed; documented limitation only.

## Verification
- Touched suites: **150/150 pass** (`post_tool_badge`, `statusline-multi`, `statusline-two-line`, `sparkline`, `enhanced-statusline`, `token_tracker`, `stop-session-report`, `stop-hook`, `herd-chip`, `herd-integration`, `subagent_tracker`, `statusline-landing-parity`, `moo-card-parity`, `badge-always-on`).
- Full npm-test list: 6 failures — **identical at clean `db6f5f7`** (stash-verified), all in untouched `classify`/`router-execute`/`update-router` model-specialist & tuning tests (env/model-availability dependent; 3 are in the repo's own skip-pattern). **Zero regressions from Day 2.**
- `classify.js` sha256 = `7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762` (== guard). `eslint statusline-multi.js`: 0 errors (1 pre-existing warning, line 568).
- New tests added: **6 in the CI list** (20.B×2, 20.C×1, 20.D×2, 20.E×1) + **2 in stop-session-report** (20.F×2, now CI-wired) = 8 total, ≥1 per sub-feature.

## Next
- PR squash → `dev`; `final-reviewer` (Sonnet T2); tag `dev v1.11.0-friends-launch-polish-dev`.
- **Aviso a Paulo:** Cowork runs 20.G E2E (9-step script in Day 1 findings) via Chrome MCP — **gate: prod promote blocked until PASS**, including a live `local-summarizer` spawn producing `🐄 N>0` in the real CLI (the one path this harness can't exercise).
