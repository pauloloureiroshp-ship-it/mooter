# Wave 19 Day 2 — Enhanced Statusline (19.B-1..6) — Findings

> Branch `wave19-day2-enhanced-statusline` → dev. Tag `v1.9.8-statusline-enhanced-dev`.
> Canonical edits in `frugal/tools/router/`. **`classify.js` byte-identical**
> (sha256 `7b01eb86…87762`, guarded). **0 new test failures** (9 pre-existing,
> identical set before/after) **+6 new tests**. Day 1 🪙 chip intact. Wave 13
> `subagent_tracker.snapshot()` API unchanged. **No prod promote** (closes Day 4).

## TL;DR (3 lines)
1. All 6 Paulo considerations shipped. Full line-2 render verified: `🪙 T0:13.3k(grn) · T1:1.5k(blu) · T2:24.2k(yel) · T3:2.0M(red) · 🎮 RTX 4090 24% VRAM (5.7/24 GB) · ctx ▰▰▱▱▱ 23% · 🐄 3/17/peak9 · ⚡ workflow · 🧬 baseline · trained on 8 decisions`.
2. Cold-spawn render stays **~0.09s** (gate is 600ms) despite the extra file reads — the new VRAM file-cache (5s) means nvidia-smi spawns at most once per 5s instead of every render.
3. Two brief assumptions corrected (both *better* than written) — see Decisions.

## What shipped
| # | Sub-feature | File | Note |
|---|---|---|---|
| 19.B-1 | Tokens-per-tier ANSI colors | `statusline-multi.js` | T0🟢/T1🔵/T2🟡/T3🔴 via `colorize()`; `NO_COLOR`/`MOOTER_NO_COLOR`/`TERM=dumb` → plain |
| 19.B-2 | VRAM live (nvidia-smi, 5s cache) | **`hardware_live.js`** (new) | file-backed cache; `% VRAM (used/total GB)`; null when no live reading |
| 19.B-3 | Context window evolution bar | `statusline-multi.js` (`ctxBar`) | ▰▱ bar, color-graded; driven by Claude Code's authoritative `context.percent_used` |
| 19.B-4 | LoRA/Pastor evolution chip | `statusline-multi.js` | 🧬 + `trained on N decisions` from `tuning-state.json` `sample_size` |
| 19.B-5 | Herds always-on chip | `statusline-multi.js` (`buildHerdsChip`) | `🐄 active/total/peak`, dim when idle; `total` = Σ cumulative (derived, API untouched) |
| 19.B-6 | Concurrent workflow mode ⚡ | `statusline-multi.js` (`buildHerdsChip`) | `⚡ workflow` lights at ≥3 concurrent |

Tests: `enhanced-statusline.test.js` (6, one per sub-feature) + `hardware_live.js` covered there. Updated `statusline-two-line` / `statusline-landing-parity` / `token_tracker` assertions for the intentional ctxBar/adapter/color changes.

## Decisions taken (no Paulo gate — all reversible, additive)
- **19.B-2 — file cache, not in-memory.** `vram_detect.js` already spawns nvidia-smi with a 5s *in-memory* cache, but the statusline is a **fresh process every render**, so that cache never survives → nvidia-smi would spawn on every render. `hardware_live.js` adds a **file-backed** 5s cache (`os.tmpdir()/mooter-vram-cache.json`) — this is the actual fix for the "cache 5s minimum" perf rule. It delegates the real read to `vram_detect.getVram` (no duplicated spawn logic). macOS shared memory (`used_mb < 0`) and no-nvidia hosts cache a `null` → chip falls back to model-only, never an invented %.
- **19.B-3 — reused the existing `ctxBar` (context window already wired).** Claude Code passes `context.percent_used` on stdin → that's the *authoritative* context-window %; we already had a `ctx` bar from W2.8. 19.B-3 upgrades its aesthetic to the brief's ▰▱ evolution bar. **Did not** add `(used/total tokens)`: this session model is `opus-4-8[1m]` (1M ctx) not 200k, so a hard-coded total would be wrong, and the percent is already exact from Claude Code — adding a guessed token total would violate "NÃO inventar". The `5h reset` quota stays a separate chip (`☁ Claude Max N%`), as the brief required.
- **19.B-4 — `trained on N` from real Pastor data only.** `tuning-state.json` (written by `update-router.js`, Wave 16-18 Tier C) carries `sample_size` — that's the real "N decisions tuned". It has **no** `delta_last_7d`/`+pp` field, so the brief's `+N pp last 7d` is **not rendered** (would be invented). The adapter chip label changed `adapter —` → `🧬` to match the brief's evolution framing.
- **19.B-1 — color ON by default.** The rendered statusline supports ANSI even though stdout is a pipe (the existing sparkline/ctxBar already emit escapes). So `useColor()` defaults ON and only backs off on `NO_COLOR`/`MOOTER_NO_COLOR`/`TERM=dumb`, rather than gating on `stdout.isTTY` (which is false under Claude Code and would have killed colors that already work).

## Honesty / privacy
- **No invented metrics**: VRAM only from a real nvidia-smi reading; LoRA count only from `tuning-state.json`; context % only from Claude Code's own stdin payload.
- **Zero PII**: no new persisted data carries prompt/response text (VRAM cache = `{at_ms, value:{usedMb,totalMb,pct}}`).
- **No hub / no CLI / no schema** touched. No extra Anthropic calls. nvidia-smi spawn bounded to ≤1 / 5s.

## Note (cosmetic, deferred)
Line 1 still shows the Wave 13 quick herd badge `🐄×N` (via `appendHerd`) while line 2 now has the detailed `🐄 active/total/peak`. Mild redundancy; kept because the Wave 13 line-1 badge is a shipped contract and removing it is out of 19.B scope. Could be de-duped in a later polish pass.
