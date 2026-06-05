# Wave 19 Day 3 — decisions_v2.jsonl + `mooter trail --calls` (19.B) — Findings

> Branch `wave19-day3-mooter-trail` → dev. Tag `v1.9.9-mooter-trail-dev`.
> **`classify.js` byte-identical** (sha256 `7b01eb86…87762`, guarded). Router
> suite: **9 pre-existing failures, 0 new** (+2 new). CLI suite: **204/204** (+5
> new, 9 existing trail tests still green). **No prod promote** (closes Day 4).

## TL;DR (3 lines)
1. New router module `decisions_v2.js` dual-writes a structured per-call record `{ts,op,tier,llm,tokens_in,tokens_out,reason,via}` to `decisions_v2.jsonl` — the legacy `decisions.log` writer is untouched, so every existing reader keeps working.
2. `mooter trail` already existed (provenance over decisions.log); I **extended** it with a `--calls` mode that reads `decisions_v2.jsonl` and pretty-prints the per-call breakdown + per-tier token totals — rather than shipping a competing command.
3. Honest gap surfaced (not invented): decision-time records carry `tokens 0` for cloud tiers — see Decisions.

## What shipped
| Piece | File | Note |
|---|---|---|
| v2 writer + schema | **`tools/router/decisions_v2.js`** (new) | `recordFromDecision` (pure map) + `sanitize` (PII whitelist) + `appendFromDecision` (best-effort, never throws) |
| Dual-write hook | `tools/router/inject_context.js` | one line after the `classified` `logDecision` — where the full `decision` (incl. `suggested_subagent`) is in scope |
| `--calls` mode | `packages/cli/src/commands/trail.ts` | `buildCalls`/`printCallsHuman`/`runCalls`; `--json` supported; per-tier TOTALS |
| CLI wiring | `packages/cli/src/index.ts` | `--calls` flag + usage line |
| Tests | `tools/router/decisions_v2.test.js` (2), `packages/cli/tests/trail-calls.test.ts` (5) | schema/PII/reason + breakdown/limit/json/empty |

Verified render (`mooter trail --calls`):
```
T0  qwen3:30b  summarize_file     1.2k→300      via local-summarizer
    06-05 08:46:15 · classify_score=0.85 T0
T3  opus       architecture       0→0           via inline
    06-05 08:46:15 · beast_intent_force_t3
TOTALS
  T0: 1 call(s) · 1.2k→300 tokens   ...
```

## Decisions taken (no Paulo gate — reversible, additive)
- **Extended `mooter trail`, did not create a new command.** `mooter trail` (Wave 2.5) already prints provenance from `decisions.log`; `--safety`/`--evolution` are existing modes. `--calls` is a fourth mode reading the new `decisions_v2.jsonl`. All 9 existing trail tests still pass (backwards-compat). The brief said "implement `mooter trail`" — it exists, so this is the faithful interpretation.
- **Dual-write at the call site, not inside `logDecision`.** `logDecision()` fires for many non-routing events (`prompt_optimized`, `option_a_hit`, `classifier_failed`…). Hooking the v2 write generically there would log noise. Instead the v2 append sits right after the single `classified` `logDecision`, where the full `decision` object (with `suggested_subagent` → the real `via`) is in scope. Lower risk, richer record. Still a true "dual write" — same decision, two sinks.
- **`tokens 0` at decision time for cloud tiers — honest, not invented.** A classify decision is made *before* the LLM runs, so token counts aren't known yet. Local (T0) executions can pass real `tokens_in/out` through `appendFromDecision` (and do, when the executor calls it). For T1–T3 the authoritative per-tier token totals already live in **Day 1's `token_tracker.js`** (sourced from the Claude Code transcript). Enriching individual v2 records with post-execution cloud tokens is a follow-up (would require the executor/Stop hook to correlate a decision id with its transcript usage) — deliberately **not** faked here.
- **`reason` vocabulary from real fields only**: `safety_boost_<kind>` (from `safety_boost_reason`), else `escalation_rule`, else `classify_score=<conf> <tier>`. No invented reasons.

## Honesty / privacy
- **Zero PII**: `sanitize()` whitelists exactly the 8 schema fields. A test feeds a decision carrying `prompt` + `prompt_preview` containing `SECRET` and asserts it never reaches the file. The richer `decisions.log` keeps its `prompt_preview` (unchanged, existing behavior); `decisions_v2.jsonl` does not.
- **No new endpoints**; **no hub sync** (`decisions_v2.jsonl` stays local per the anti-pattern); no extra Anthropic/Ollama calls. Writer is best-effort and never throws (hook safety).
- Day 1 (🪙 token tracker) and Day 2 (enhanced statusline) untouched.
