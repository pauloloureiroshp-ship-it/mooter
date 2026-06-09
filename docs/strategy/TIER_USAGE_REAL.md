# Tier usage — real data (Wave 48, items 9 & 10)

Source: `~/.claude/tools/router/decisions.log` (2063 lines · `"tier"` field on `event:"classified"` rows). Read-only Day 0 recon, 2026-06-10. Advisory — these are routing *decisions*, not billed figures.

## Tier distribution (all-time)

| Tier | Model | Classifications | Share |
|---|---|---|---|
| T3 | Opus 4.6 / 4.8 | 501 | ~39% |
| T1 | Haiku 4.5 | 410 | ~32% |
| T0 | Ollama local | 273 | ~21% |
| **T2** | **Sonnet 4.6** | **96** | **~7.5%** |

(~1280 classified rows; remainder are non-`classified` events — `turn_end`, etc.)

## Item 9 — "T2 nunca usado?" → refuted (partial)

T2 **is** used, but it is the rarest tier at ~7.5%. This is **not a bug** — it is the shape of the work:

- Most prompts are either clearly trivial (T0/T1 — file ops, transforms, commit msgs) or clearly architectural (T3 — multi-file, critical).
- The middle "mid-complexity reasoning" zone that T2 (Sonnet) owns is genuinely narrow for this workload.
- No demote rule is silently starving T2 — the classifier emits it when reasoning signals fire; they just fire seldom.

**Conclusion:** keep T2. The honest framing (now in `mooter explain tiers`): *"T2 is the rarest tier (~7-8%) — the mid reasoning zone is genuinely narrow, not a bug."*

## Item 10 — T0 coherence + savings source

- `classify.js` currently emits **only T0–T3** (4 tiers). There is no T4/T5 in the log — the "6-tier" framing is aspirational, not current state. (Tier 5 = Fable 5 deferred to a future wave; classify.js sha unchanged this wave.)
- **Savings come from, by lever (largest first):**
  1. Running **local** (T0 Ollama, $0) — 21% of decisions, zero marginal cost.
  2. **Cheaper cloud tiers** in place of Opus (T1 Haiku $1/$5, T2 Sonnet $3/$15) — 39% of decisions combined.
  3. Reserving the frontier tier for genuine architecture work (T3).
- Net headline: **~47% less cost vs an all-Opus baseline** across 658 real routed calls (the figure now used in `mooter explain saved` and the friends DM, corrected down from an earlier 78%).

## Pricing — authoritative (corrects the Wave 48 brief)

The Wave 48 brief listed Opus 4.6 = $15/M and Opus 4.8 = $20/M. **Both wrong.** Authoritative (Anthropic, via the `claude-api` skill, cache 2026-05-26), input / output per million tokens:

| Tier | Model | Input | Output |
|---|---|---|---|
| T0 | Ollama local | $0 | $0 |
| T1 | Haiku 4.5 | $1 | $5 |
| T2 | Sonnet 4.6 | $3 | $15 |
| T3 | Opus 4.6 / 4.8 | **$5** | **$25** |
| (future) | Fable 5 | $10 | $50 |

`mooter explain tiers` ships these corrected numbers.

## Pastor algorithm note (Phase 3.3)

Each tier decision already logs the fields the Pastor needs (tier, model, confidence, cost signals, subagent dispatches folded in per Wave 34.5 Bug C). No schema change shipped this wave — the data coherence work here is **observational** (this doc + corrected `explain` copy), not a re-train. A Pastor re-train on these patterns is a candidate for a follow-up wave once Tier 5 routing lands.
