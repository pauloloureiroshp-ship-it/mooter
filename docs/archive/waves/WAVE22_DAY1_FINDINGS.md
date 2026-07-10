# Wave 22 — Day 1 Findings (Honesty Foundation implementation)

> **Status**: ✅ Code complete · 2 commits on `wave22-honesty-foundation` · classify.js
> P11 byte-identical · zero Wave 22 regressions (verified vs bd88256 baseline worktree).
> **Pending**: Paulo E2E live gate → promote prod `v1.12.0-honesty-foundation` → Wave 23.

---

## TL;DR (3 lines)

1. **Path α confirmed live**: native `SubagentStop` hook fires once per spawn (and
   hot-reloads mid-session), so the herd + token + exec data are now REAL, not approximated.
2. Biggest honesty win: the ~64% token gap was **subagent wrapper tokens** (Haiku/Sonnet/
   Opus driving "local" agents) recorded in a separate transcript the main sync never read.
3. All 6 sub-features shipped + 6 tests; `trained on N` and the 🐄 chip are no longer lies.

---

## Per-sub-feature outcomes

### 22.A — SubagentStop hook (CRITICAL gate) ✅ Path α
- New `subagentstop_hook.js`: `trackSpawn`+`trackComplete` per spawn, keyed by the real
  `agent_id`. Idempotent → coexists with the Wave 21 Day 2 `recordSpawn` fallback with
  **zero double-count** (whichever fires first wins).
- **Day 0 proved Path α strictly superior**: the test local-summarizer used `Read` only
  (no inner Bash), so the Wave 21 PostToolUse fallback would have MISSED it entirely;
  SubagentStop caught it. Read-only subagents are now counted.
- `buildHerdsChip` UNHIDDEN (removed the Wave 21 Day 3 `return ''`).
- Real duration from the subagent transcript timestamp **span** (WSL clock is skewed —
  signed deltas go negative; span is always ≥ 0, never fabricated).
- **Live-validated in-session**: spawned subagents wrote the current session's herd file
  (count→2, peak1). Chip renders `🐄 N/M/peakK`, dim idle, ⚡ at ≥3, pulse when active.

### 22.B — Token tracker honest counts ✅
- Root cause (NOT "partial Ollama capture"): a "local" agent runs on a **cloud wrapper
  model** (Haiku for local-summarizer when a key is present) whose `usage` lands in a
  SEPARATE `…/subagents/agent-<id>.jsonl`, invisible to the main `syncFromTranscript`.
- `token_tracker.trackSubagentTranscript()`: aggregates that transcript into `_pushed`,
  per-tier, idempotent by `agent_id` (`_subagent_done`). Disjoint from the `_transcript`
  bucket → no double-count. `snapshot()` shape unchanged (Wave 19 non-negotiable).
- Live result: a local-summarizer spawn captured **T1 Haiku** tokens (was invisible);
  **T0 stays 0** because Ollama wasn't invoked — honest, not faked.

### 22.C — Hint vs delegation honest display ✅ (Paulo: "Dual segment + ⚠")
- `subagentstop_hook` writes `mooter-lastexec-<sid>.json` with intent-tier vs the tier
  actually executed (dominant wrapper model). `statusline.buildExecSegment` renders
  ` · ⚠ exec T1 haiku · N calls` on divergence, ` ✓ exec local` when intent == reality.
- Surfaces the routing-intent-vs-reality gap Paulo selected via AskUserQuestion.

### 22.D — Stop digest live validation ✅ (no code change)
- Read-only render against real current-session state: all 5 sections present —
  **TOKENS BY TIER** (incl. the 22.B T1 capture), **CHOICE REASONS**, **PER-TASK
  BREAKDOWN**, **HERD** (real spawns: `local-summarizer avg …ms · peak 1`), **SAVINGS**.
- ⚠ **Honesty caveat (documented, not fixed)**: CHOICE REASONS / PER-TASK / header
  duration are **global**, not session-scoped, because decision records carry **no
  `session_id`** (`keys: ts,op,tier,llm,tokens_in,tokens_out,reason,via`). Session-scoping
  would require changing the hot decisions-writer path → **out of Wave 22 scope; flagged
  as a Wave 23 audit candidate**. The Wave 22 surfaces (TOKENS, HERD) ARE session-scoped.

### 22.E — Branding cleanup ✅ (honestly scoped)
- 23 user-facing `frugal` CLI banner strings → `mooter` across 13 tools (surgical,
  reviewed diff). Preserved: `FRUGAL_*` env back-compat fallbacks, real `~/frugal` paths,
  `require()`s, comments, `frugal-*` filename tokens. Always-on surfaces (statusline,
  digest, badges) were already brand-clean.
- ⚠ The brief's `<5 files` target is **unachievable without breaking the repo's own name
  + env compat** — the repo IS `~/frugal` and 14 files use `FRUGAL_*` fallbacks. Residual
  (~40 files) is **non-user-facing only** (env/paths/comments/filenames). No user-facing
  brand leftover remains (verified by test 22.E).

### 22.F — Pastor "trained on N decisions" sync ✅
- `decisions_v2.recordCount()` (cheap line count) → statusline + stop_hook read the LIVE
  corpus (**188**, matches `wc -l`) instead of the stale `tuning-state.sample_size` (8,
  a backtest metric). tuning-state retained as fallback.

---

## Non-negotiables verification

| # | Item | Result |
|---|---|---|
| 1 | classify.js byte-identical | ✅ `7b01eb86…87762` (checked every commit) |
| 2 | Wave 21 Day 2 recordSpawn preserved | ✅ untouched; coexists idempotently as fallback |
| 3 | Wave 13 subagent_tracker.snapshot() shape | ✅ unchanged (only new tmp file `mooter-lastexec-*`) |
| 4 | Wave 19 token_tracker.snapshot() shape | ✅ unchanged (added fn + internal `_subagent_done`) |
| 5 | Zero PII | ✅ only counts/tiers/models/durations persisted; never `last_assistant_message` |
| 6 | Zero hub touch | ✅ `git diff --name-only bd88256..HEAD` → no `hub/` files |
| 7 | UserPromptSubmit intact | ✅ not touched |
| 8 | settings.json documented + backup | ✅ `.wave22-bak` kept; SubagentStop wired (debug handler replaced) |

## Test results
- 6 new (`wave22-honesty.test.js`, 1 per sub-feature) — all pass.
- Restored 4 herd-chip assertions (20.E, 21.D3, 19.B-5, 19.B-6, herd-chip C4) to the
  Wave 22 unhidden contract.
- Full router suite vs bd88256 baseline worktree: **zero Wave 22 regressions**. Remaining
  failures are all pre-existing (gsd-statusline.js deletion predating this work, env-gated
  specialist/pin tests in backtest.test.js, stale Wave 21 C1 schema test).

## Settings.json change (outside repo — documented here)
Added to `~/.claude/settings.json`:
```json
"SubagentStop": [{ "matcher": "*", "hooks": [{ "type": "command",
  "command": "node /home/paulo/mooter/tools/router/subagentstop_hook.js", "timeout": 5 }] }]
```
Backup: `~/.claude/settings.json.wave22-bak`.

## E2E live gate (Paulo) — not yet run
Per kickoff §7: 5 × `resume /etc/X em 3 linhas` → expect `🐄 5/5/peak1`, T-tier tokens
> 0 (note: **T1 Haiku**, not T0, with a key present — see 22.B), exec chip coherent,
Stop digest 5 sections, herd file count===5. **Do NOT promote prod until PASS.**
</content>
