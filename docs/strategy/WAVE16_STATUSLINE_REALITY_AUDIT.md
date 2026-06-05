# Wave 16 — Statusline Reality Audit

> **Run**: 2026-06-05, autonomous read-only self-audit. Orchestrator: Claude Code (Opus).
> Workers: 9 concurrent `local-summarizer` (Ollama qwen3:30b) subagents — one per chip.
> **Read-only**: no code changed. This is a findings doc; no fixes executed.
>
> **Verification note**: the local workers traced the **installed** copy
> (`~/.claude/tools/router/*.js`) in several cases; the **source of truth is the
> repo** (`frugal/tools/router/*.js`). Line numbers below may differ between the
> two — flagged where install-vs-repo drift could matter. The two HIGH-severity
> claims were re-verified by the orchestrator against the **repo source**.

## TL;DR (most → least important)

| # | Chip | Verdict | Severity |
|---|---|---|---|
| 6 | ☁ Claude Max 100% · 5h reset | **LOCAL ESTIMATE (not API-validated)** | **med** |
| 1 | 🐮 saved $X today | **FLAGGED — verify "today" scope** | **med** |
| 9 | adapter / 🧬 LoRA active | **STALE plumbing — deployed adapter never shows** | **med** |
| 2 | ▁▅██ sparkline | REAL | low |
| 3 | T0 · conf 0.85 · 🐄×N | REAL | low |
| 4 | 🏠 N/M local · X% | REAL | low |
| 5 | 🎮 RTX 4090 24% VRAM | REAL | low |
| 7 | quant Q4_K_M (-72% · ~99%) | CACHED (honestly-sourced constants) | low |
| 8 | adapter — baseline | HARDCODED placeholder (by design) | low |

**Headline**: no random fabrication found. The statusline is mostly REAL (live from
`decisions.log` + `nvidia-smi`). Three honesty/staleness items warrant attention
before the friends launch — all in the "implies more than it knows" category, the
same class we just fixed on the LoginHero (fabricated community stats).

---

## 6. ☁ Claude Max 100% · 5h reset — **LOCAL ESTIMATE, not API-validated** (med)

- **Source**: `tools/router/quota-tracker.js` + `statusline-multi.js` (`computeAnthropicRem`).
- **Data path**: a **local rolling 5h window**. `quota-tracker.js` makes **zero network calls** (verified by the orchestrator: `grep -cE 'fetch\(|https?://' → 0`). `FIVE_HOURS_MS` timer + `ANTHROPIC_5H_TOKEN_LIMIT` (hardcoded `200000`, or `MOOTER_ANTHROPIC_5H_LIMIT`); remaining % = `(1 − tokens_used/limit)·100` over locally-tracked usage. `reset_at` is a local wall-clock timer.
- **Verdict**: it tracks *your own local token consumption* against a hardcoded limit — **not** Anthropic's real Max quota. "100%" today = `tokens_used: 0` default. Calling it "Claude Max 100%" implies it reflects your real plan quota, which it does not.
- **Fix path (NOT applied)**: relabel to convey it's a local estimate (e.g. "~5h local est."), or wire to real usage telemetry if/when available. Do **not** imply authoritative Max-plan quota.

## 1. 🐮 saved $X today — **FLAGGED: confirm "today" scope** (med)

- **Source**: headline at `tools/router/statusline-multi.js:458` → `saved $${savedUsd.toFixed(2)} today (…% vs all-Opus)`. `savedUsd` is built in `buildContext` from the savings tracker.
- **The concern**: `tools/router/savings-tracker.js:538` computes `m.saved` as an **all-time** sum (`m.saved = max(0, rawSaved)` over all events; no UTC-date filter), and `/metrics` is all-time. Meanwhile `statusline-multi.js` *does* have today-scoped plumbing (decisions.log "today's UTC date", `prompts_today`). **Could not confirm read-only** whether the headline's `savedUsd` reads a today-scoped field or the all-time `m.saved`.
- **Verdict**: FLAGGED. If `savedUsd` === all-time `m.saved`, the "today" label is wrong (same honesty class as the removed LoginHero stats). If it reads a today-scoped field, it's REAL.
- **Fix path (NOT applied)**: maintainer confirm the field; if all-time, either filter to today or relabel "all-time".

## 9. adapter / "🧬 LoRA active" — **STALE plumbing** (med) + chip-name mismatch

- **Finding**: the chip named in the brief ("🧬 LoRA active") **does not exist**; the real chip is `adapter 🔧 {name}` / `adapter — baseline`.
- **Source**: `statusline-multi.js:getAdapterStatus()` hardcodes `{ status: 'idle', id: null }` (commented "Wave 5 placeholder") and **never calls** the real `adapter_selection.js:getActiveAdapter()` (which genuinely reads `~/.mooter/preferences.json` + `~/.mooter/adapters/{id}/manifest.json` + HMAC-verifies). So a **deployed adapter would never render** on the statusline — it always shows idle/baseline.
- **Verdict**: STALE — real adapter-loading logic exists but is unreachable from the statusline.
- **Fix path (NOT applied)**: wire `getAdapterStatus()` to call `getActiveAdapter()`.

---

## 2. ▁▅██ sparkline (last 10) — REAL (low)
`sparkline.js:tierSparkline()` maps the last 10 classified `decisions.log` events to tier glyphs; `statusline-multi.js:readDecisionsTail()` tail-reads the log fresh each render. Live output matched the actual last-10 tiers. No caching/fabrication.

## 3. T0 · conf 0.85 · 🐄×N — REAL (low)
Tier + confidence read live from the last `decisions.log` classified event. `conf 0.85` originates as a **hardcoded per-category constant** in `classify.js` (e.g. the read-intent category) — legitimate, not fabricated. Herd count (`🐄×N`) reads live from `subagent_tracker.js` state (`/tmp/mooter-herd-<session>.json`, `active_count`).

## 4. 🏠 N/M local · X% — REAL (low)
`localCount = ctx.counts.T0`, `sessionTotal = ctx.total`, both from the `digest()` of today/session-filtered `decisions.log`. Fresh tail read each render. Caveat: per-session scoping — set `MOOTER_STATUSLINE_VIEW=all` for cross-terminal totals.

## 5. 🎮 RTX 4090 24% VRAM — REAL (low)
GPU **name** captured live via `nvidia-smi --query-gpu=name` at `mooter init`, persisted to `~/.mooter/profile.json` (30-day refresh). VRAM **%** is **live** — `vram_detect.js` runs `nvidia-smi --query-gpu=memory.used,memory.total` (~1×/s, 5s cache); 24% ≈ 5803/24564 MB. Accurate.

## 7. quant Q4_K_M (-72% size · ~99% quality) — CACHED (low)
`quantization.js:QUANT_INFO` hardcodes `size_pct_vs_fp16: 28` / `quality_pct: 99`; chip derives `-72%`. Constants are **documented as sourced** from Ollama docs + llama.cpp community ("verifiable, not invented"), **not** read live from the model's metadata (`ollama show`). Honest but static.
- **Fix path (NOT applied)**: optional — add a source URL/commit comment, or compute from real model metadata.

## 8. adapter — baseline — HARDCODED placeholder (low, by design)
`getActiveAdapter()` returns `null` (no `~/.mooter/preferences.json`), so the statusline falls back to the hardcoded `'adapter — baseline · mooter forge install'` CTA. Intentional Wave 5 placeholder. (Related to #9 — the plumbing to show a *real* adapter is the stale part.)

---

## Methodology / herd run
- 9 `local-summarizer` (Ollama) workers spawned concurrently — genuine parallel herd activity, local-first (free GPU compute).
- Orchestrator (Opus) verified the 2 HIGH-severity claims against the repo source; refined "fabricated" → "local estimate" for the quota chip, and downgraded the savings-today claim to FLAGGED pending maintainer confirmation (rigor over a scary verdict).
- **No code changed. No fix executed. Findings only.**
