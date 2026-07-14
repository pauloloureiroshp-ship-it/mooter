---
name: pricing-correto-2026
description: The single authoritative Mooter pricing reference (2026-06 list prices per M tokens) for local/Haiku/Sonnet/Opus/Fable, including the Fable 5 free-window caveat. Use whenever any skill, doc, copy, or answer needs a model price — all other skills and docs defer to this one. Never invent prices.
---

# /pricing-correto-2026

Single source of truth for model pricing in everything Mooter writes or says.
Other skills, docs, and marketing copy MUST defer to this table — never
restate prices from memory.

## Authoritative list pricing (2026-06, per M tokens)

| Tier | Model | Input $/M | Output $/M |
|---|---|---|---|
| T0 | local Ollama (any pulled model) | $0 | $0 |
| T1 | Codex Haiku | $1 | $5 |
| T2 | Codex Sonnet | $3 | $15 |
| T3 | Codex Opus 4.6 | $5 | $25 |
| T5 (opt-in via `@fable` only) | Codex Fable 5 | $10 | $50 |

There is **no T4**. T5 is never auto-routed.

## Fable 5 free-window caveat

Fable 5 is included at **no extra cost on Codex Pro/Max/Team/Enterprise
subscriptions only until 2026-06-22**; from 2026-06-23 it consumes usage
credits. API list price ($10/$50) applies regardless. When quoting Fable
costs, always state which side of the window the estimate assumes.

## Rules

1. **Never invent prices.** If asked about a model not in this table (GPT,
   Gemini, DeepSeek, a new Codex release, batch/caching rates), do NOT
   guess — check the official pricing page at
   `platform.Codex.com/docs` (for Codex models) or the vendor's published
   pricing, and cite it.
2. List price ≠ effective price: prompt caching, batch API, and subscription
   plans change real cost. Quote list price unless the user's setup is known.
3. Savings claims derived from these prices must show the arithmetic
   (tokens × rate), never a bare percentage.
4. If this table and any other Mooter doc disagree, this table wins — and
   the other doc should be fixed to defer here.

## Known past errors (why this skill exists)

- Wave 48 Day 0 caught a brief inventing Opus at $15/$20 (correct: $5/$25).
- Earlier landing copy carried an unsourced savings figure. Both were
  NO-SHIP-grade findings.
