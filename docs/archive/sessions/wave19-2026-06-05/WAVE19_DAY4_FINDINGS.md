# Wave 19 Day 4 — Stop session report (19.D) + Closure — Findings

> Branch `wave19-day4-stop-digest-closure` → dev. Tag (Paulo applies):
> `v1.10.0-token-transparency-dev`. **`classify.js` byte-identical** (sha256
> `7b01eb86…87762`, guarded). Router suite: **9 pre-existing failures, 0 new**
> (+3). Day 1-3 + Wave 13 intact. **No prod promote** — single Paulo gate before
> the prod tag.

## TL;DR (3 lines)
1. The Wave 13 Stop digest now has a full session-report mode (19.D) that composes all five Wave-19/13 sources into one end-of-session card: per-tier tokens + cost, choice reasons, hardware, herd, context, savings.
2. **Every figure is real**: token counts from the transcript (Day 1 `token_tracker`), per-tier **cost from `pricing.js` × those real tokens** (not estimated), reasons from `decisions_v2.jsonl` (Day 3), VRAM from `hardware_live` (Day 2), tune count from `tuning-state.json`. A section whose source is absent is **omitted, never fabricated**.
3. Opt-in (`session_report_enabled`), rendered on **stderr** (Wave 13.1 fix preserved). Real-hook e2e: **68ms**, stdout empty.

## What shipped (Part 1 — 19.D)
| Piece | File | Note |
|---|---|---|
| Session report builder | `tools/router/stop_hook.js` | `buildSessionReport` (pure, all sources injected) + `gatherReport` (collects them) + `groupReasons`/`tierCost`/`fmtTok`/`fmtDur` |
| v2 reader | `tools/router/decisions_v2.js` | `readRecords()` (newest-N, skips junk) — feeds CHOICE REASONS |
| Tests | `tools/router/stop-session-report.test.js` (3) | format · empty-session edge · all-tiers + grouping + <0.5s @150 decisions |

Verified render (real hook, stderr):
```
🐮 Mooter session report — 32m 0s
  TOKENS BY TIER
  T0 (local ollama)  13.0k tokens · 5 calls · $0.00
  T2 (sonnet-4-6)    49.0k tokens · 3 calls · $0.26
  T3 (opus-4-6)      2.0M tokens · 2 calls · $11.75
  CHOICE REASONS / HARDWARE STATE / HERD / CONTEXT / SAVINGS …
```

## Decisions taken (no Paulo gate — reversible, additive)
- **New opt-in mode, supersedes (not replaces) the Moo card.** Gated by a new pref `session_report_enabled`; when on, the full report renders instead of the Wave 13 Moo card. The Moo-card path + `buildMooCard`/`buildHerdSection` are untouched (15 existing stop-hook tests still green). The brief's "replace the simple digest" is honored as a superseding opt-in rather than deleting the shipped Wave 13 behavior.
- **Cost from real tokens × `pricing.js`, not the savings-tracker HTTP.** Because Day 1 gives *real* per-tier token counts, `pricing.priceTurn(TIER_TO_PRICING_KEY[tier], in, out)` yields an honest per-tier cost without needing the tracker daemon. The SAVINGS line computes the all-Opus baseline the same way (`priceTurn('claude-opus-4-6', …)` over each tier's real tokens). This is self-contained and more honest than an estimate.
- **Savings can read small — and that's correct.** When a session is T3-dominated (e.g. 2M Opus tokens), "saved vs all-Opus" is genuinely small (~3%). Not massaged.
- **"GPU peak" rendered as current live VRAM.** The brief asked for "VRAM peak", but no per-session VRAM high-water mark is tracked anywhere. Rather than invent a peak, the report shows the current `hardware_live` reading. (A true peak would need a sampler across the session — a follow-up, flagged not faked.)
- **Duration derived from `decisions_v2` first/last ts** (no duration field on the Stop stdin). Omitted entirely when <2 records.

## Honesty / privacy
- **Zero PII**: the report reads only metadata — `decisions_v2` records (already PII-stripped at write, Day 3), token aggregates, hardware, herd counts. No prompt text anywhere.
- **No invented metrics**: absent sources → omitted lines; absent tokens → "no LLM calls recorded"; absent decisions → "no decisions logged".
- **No hub touch / no CLI changes** (the report is a router-side Stop hook). No extra Anthropic/Ollama calls beyond Day 1's transcript read. Hook never throws (every source in its own try/catch; `main` exits 0).
- **Wave 13.1 preserved**: render via `process.stderr.write` — stdout stays empty (verified e2e), so nothing is replayed into the shell prompt.

## Part 2 — Closure (consolidation + promote)
- 4 PRs consolidated in dev: #102 (Day 1 token tracker) · #103 (Day 2 enhanced statusline) · #104 (Day 3 decisions_v2 + trail) · #105 (Day 4 this).
- `classify.js` byte-identical across all four (guarded each commit; absent from every diff).
- Promote PR opened **dev → main**: "Promote v1.10.0-token-transparency". It tracks dev HEAD, so it includes Day 4 once Cowork merges #105 into dev.
- **Tags (Paulo applies, per established pattern)**: `v1.9.7-token-tracker-dev` (#102) · `v1.9.8-statusline-enhanced-dev` (#103) · `v1.9.9-mooter-trail-dev` (#104) · `v1.10.0-token-transparency-dev` (#105 merge commit).
- **No prod promote / no prod tag** — single Paulo gate before `v1.10.0-token-transparency` on main.
