# AUDIT — frugal savings tracker audit, 2026-04-07

> This document captures the 13-gap audit that motivated v0.6. Keep it
> as the historical record of why the cost model changed shape. The
> tl;dr is: the statusline was a morale booster, not a measurement.

## Scope

End-to-end review of the savings pipeline:

```
decisions.log → savings-tracker.js → /metrics → gsd-statusline.js
```

Cross-referenced against real Anthropic pricing (2026-04 pricing page),
the actual `.budget-cache.json` contents in production, and the 68-line
live `decisions.log` accumulated during the v0.3–v0.5 work.

## The 13 gaps

| # | Severity | Gap | Status in v0.6 |
|---|---|---|---|
| 1 | Critical | Flat-per-tier costs were ~25-60× under real Anthropic prices. Opus 4.6 turn on 10k prompt ≈ $1.20 real, tracker said $0.045. | **Fixed** via `pricing.js` token model |
| 2 | Critical | `prompt_len` was logged but never used in the cost formula — a 9 429-char prompt cost the same as a 4-char one. | **Fixed** — `estimateTurnCost` scales with prompt_len |
| 3 | Critical | Sub-agent double-dipping invisible: Opus spawning `local-summarizer` still burned Opus tokens for task dispatch + result integration, but tracker counted it as `T0 = $0`. | **Deferred to v0.7** — needs PostToolUse hook |
| 4 | High | Naive baseline assumed `n_prompts × $0.045` — a fiction. Real baseline = Opus 4.6 processing each turn with 1M context. | **Fixed** via `naiveOpusCost(prompt_len)` |
| 5 | High | `decisions.log` only records classifier *hints*, not the model *actually* invoked. If Claude Code ignored the hint, the log still said "Ollama". | **Deferred to v0.7** — needs invocation telemetry |
| 6 | Medium | Gemini, OpenAI, Codex CLI mentioned in docs but absent from `TIER_TO_MODEL`. Invocations of those would be mis-attributed. | **Partially fixed** — prices in `pricing.js`, but classifier doesn't emit them yet |
| 7 | Critical | `option_a_hit` events (real Opus skips via `<suggested_answer>`) were not counted separately from tier-routing estimates. The only cash-accurate savings number was hiding. | **Fixed** — `guaranteed_saved` metric, statusline drops tilde when present |
| 8 | Medium | BRL (and EUR, GBP) not supported. USD only, hard-coded. User explicitly asked about BRL. | **Fixed** via `fx.js` + `FRUGAL_CURRENCY` env |
| 9 | High | OAuth 5h usage (the only real cost source) was never cross-referenced with `decisions.log`. Statusline showed two unrelated numbers side by side. | **Partially fixed** — `/real` endpoint surfaces OAuth truth, but no window reconciliation yet |
| 10 | Medium | `<task-notification>` and other Claude Code hook echoes were counted as user prompts, inflating Ollama % and the total. | **Fixed** — `isSystemPrompt` filter, 3/68 filtered on dogfood corpus |
| 11 | Low | T1 never appeared in any corpus — the classifier emits T0/T2/T3 directly and `cheap-triage` Haiku invocations are invisible. | **Noted** — needs classifier tuning or invocation telemetry |
| 12 | Low | Windows path quoting in `execFile` with `__dirname` containing spaces was fragile. | **Noted** — no fix, `windowsHide: true` masks symptoms |
| 13 | High | **(Discovered during audit)** `.budget-cache.json` was caching `{"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"}}` and honoring the 2h TTL — the budget guardrail was silently blind until manual cache delete. | **Fixed** — `inject_context.js` refuses to cache error responses; `/real` surfaces error + auth hint |

## Numeric comparison (same 68-line dogfood corpus)

| Metric | v0.5 flat | v0.6 token-est | Delta |
|---|---|---|---|
| Prompts counted | 56 | 54 | -3 system prompts filtered |
| `option_a_hits` counted | 0 (not surfaced) | 13 | +13 |
| `real_cost` | $0.575 | **$2.9387** | 5.1× |
| `naive_cost` | $2.52 | **$13.876** | 5.5× |
| `advisory_saved` | $1.95 | **$10.9373** | 5.6× |
| `guaranteed_saved` | — | **$3.3405** | NEW |
| `saved_pct` | 77.2% | 78.8% | ~same ratio |
| Ollama % | 62.5% | 66.7% | +4pp (system filtered out) |
| Haiku % | 0% | 0% | (T1 gap #11) |
| Sonnet % | 17.9% | 14.8% | -3pp |
| Opus % | 19.6% | 18.5% | -1pp |

And in BRL (first time):

| Metric | USD | BRL (@ 5.42) |
|---|---|---|
| `real_cost` | $2.9387 | R$15.93 |
| `naive_cost` | $13.876 | R$75.21 |
| `advisory_saved` | $10.9373 | R$59.28 |
| `guaranteed_saved` | $3.3405 | R$18.11 |

## What this changes for the user

- **Morale boost → real measurement.** The statusline number is now anchored to something you could defend in a cost review. Not perfect — still an estimate — but within the right order of magnitude.
- **Tilde `~` prefix becomes important.** `~$10.94` = estimated (advisory). `$3.34` (no tilde) = guaranteed (Option-A hits). The user can tell the difference at a glance.
- **BRL support lands.** `FRUGAL_CURRENCY=BRL` and the statusline shows `R$18.11 ($3.34)`.
- **Dead OAuth tokens are visible.** `curl http://127.0.0.1:7821/real` surfaces the problem + hints at the fix.

## What this does NOT fix

The gaps #3, #5, #9 (sub-agent cost, invocation telemetry, per-window reconciliation) are structural — they need a `PostToolUse` hook that reads model usage metadata. That's v0.7 territory and explicitly called out in `ROADMAP.md`.

## References

- `docs/COST_MODEL.md` — methodology deep dive
- `pricing.js` — single-source pricing table
- `fx.js` — FX cache
- `savings-tracker.js` — the rewritten tracker
- `backtest.test.js` — tests 12-17 cover the new cost model
- `CHANGELOG.md` — v0.6.0 section with full fix list

_Audit conducted 2026-04-07 by Paulo + Claude Opus 4.6._
