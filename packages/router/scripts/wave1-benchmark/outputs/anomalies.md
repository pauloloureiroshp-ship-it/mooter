# Anomalies — Wave 1 Pastor Benchmark

> Per P8 / §12: deviations and surprises are logged here, NOT retrofitted into the design.
> Format: timestamp · description · impact · decision.

---

## A1 — Pricing snapshot deviates from BENCHMARK_DESIGN §17.2 (stale prices)

- **When**: 2026-05-27, Phase A (pre-run).
- **Description**: `BENCHMARK_DESIGN.md` §17.2 and `MASTER_PROMPT.md` §4-A.2 hardcoded a pricing snapshot of **Opus $15/$75** and **Haiku $0.80/$4**. Verified against `platform.claude.com/docs/en/about-claude/pricing` on 2026-05-27 and cross-checked with `tools/router/pricing.js` (P7 source of truth): the real 2026-05-27 prices are **Opus 4.7 $5/$25**, **Sonnet 4.6 $3/$15**, **Haiku 4.5 $1/$5**. The design's $15/$75 is deprecated Opus 4.1/4 pricing; $0.80/$4 is retired Haiku 3.5 pricing.
- **Impact**: Using the stale numbers would inflate Pastor's cost-savings vs the Opus "gold" arm (C) by ~3× — anti-defensible. The pre-registered "Pastor wins" cost criterion (§1) is defined vs the **Sonnet baseline ($3/$15, unchanged)**, so the headline thresholds are unaffected; only the A_vs_C delta becomes honest (smaller).
- **Decision**: Used verified real prices in `data/pricing-snapshot-2026-05-27.json`. Authorized by `MASTER_PROMPT.md` §4-A.2 ("Se preços actuais em pricing.js divergirem, alinhar primeiro ou marcar como anomaly") and P7. Confirmed by Paulo at the Phase 2 checkpoint. Not a methodology change — pricing is an input the design itself flagged for cross-check.

## A2 — Opus 4.7 new tokenizer (cross-arm token counts not comparable)

- **When**: 2026-05-27, Phase A (noted from pricing docs).
- **Description**: Per Anthropic docs, Opus 4.7 uses a new tokenizer that may consume **up to ~35% more tokens for the same text** than prior models.
- **Impact**: Cost is priced on actual API `usage` tokens so $ figures stay correct. But raw `tokens_total` comparisons across arms (e.g. Opus-gold vs Sonnet-baseline) are **not apples-to-apples** at the token-count level. Latency/cost comparisons remain valid.
- **Decision**: Documented as a limitation; no methodology change. Report should compare cost/latency/quality, and treat cross-arm token-count deltas as tokenizer-confounded.

## A3 — Ollama reached via HTTP (Windows host), not localhost; `ollama` CLI absent in WSL

- **When**: 2026-05-27, Phase 0/A.
- **Description**: This is WSL2; Ollama runs on the Windows host. Reachable via HTTP at `OLLAMA_HOST=http://host.docker.internal:11434` (also `172.25.48.1:11434`), v0.23.3, all required models present. The `ollama` CLI is NOT installed in WSL, so prod router code paths using `spawnSync('ollama', ...)` would fail here.
- **Impact**: Arm A's T0 (local) invocations must use the Ollama HTTP API, not the CLI.
- **Decision**: Benchmark harness calls Ollama over HTTP (`lib/ollama-client.ts`). Implementation detail, not a methodology change.
