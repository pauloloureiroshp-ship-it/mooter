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

## A4 — 2 Ollama (T0) invocation failures (P005/A, P012/A)

- **When**: 2026-05-27, Phase E run (run_id 019e6b63-0cc6-7987-9254-4673b27fa2dd).
- **Description**: P005/A and P012/A (both routed by Pastor to T0 → `qwen3:30b`) FAILED with "operation aborted" after the 120s timeout × 4 attempts. qwen3:30b is a reasoning model that emits long internal-thinking chains and did not finish within 120s on these prompts.
- **Impact**: 2/102 rows = 2.0% FAILED (within DoD ≤5%). Both are arm A → they drag arm A's mean quality DOWN (empty response judged ~low) and mean latency UP massively (each failed row ≈ retries × 120s). **Arm A's mean latency (51101ms) is dominated by these 2 outliers** — exclude `status='failed'` rows for a representative latency. `n_ok` for arm A is 32/34.
- **Decision**: Kept as FAILED + logged per §E retry policy ("marca FAILED + log + continua"). NOT re-run — qwen3:30b being too slow for T0 is a REAL Pastor finding (Q3/Q4): the T0 model choice should be a fast small model (e.g. qwen2.5:3b), not a 30B reasoner. The 120s timeout is a harness parameter (caveat for analysis). Wave 2 signal.

## A5 — 2 judge JSON parse fallbacks (P021, P022)

- **When**: 2026-05-27, Phase E judging.
- **Description**: For P021 and P022 (diagram-systems / mermaid) the judge's response did not parse as the expected JSON (the greedy `{…}` extractor is confused by braces inside mermaid code in the outputs). Per design, neutral scores (correctness 0.5, completeness/relevance/actionability 3, hallucination 0) were used.
- **Impact**: 2/34 judge calls = neutral fallback. For these 2 prompts, completeness/relevance/actionability/hallucination are neutral for all 3 arms; **correctness is still objective** (mermaid-syntax deterministic check overrides the judge). 6 rows partially affected.
- **Decision**: Kept neutral-fallback (pre-registered behavior) + logged. NOT re-judged — impact bounded and correctness preserved via deterministic check. A more robust judge-JSON parser is a Wave 2 harness improvement.

## A6 — Cost figures: invocation vs total; judge cost separate

- **When**: 2026-05-27, reporting.
- **Description**: `SUMMARY.json.total_cost_usd` = $2.86 sums only the 102 invocation rows. The run's true total incl. the 39 judge calls (34 base + 5 repeats) is **$3.52**. Per-arm `mean_cost_usd` is invocation-only (judge cost is shared infrastructure, not attributable to an arm).
- **Impact**: None on per-arm cost comparison (judge cost is symmetric). Just clarifies the headline "$3.52 total" vs "$2.86 invocation".
- **Decision**: Report both explicitly in README. No change.

## A7 — Judge repeat variance = 0.041 (metric initially mis-reported 0.000 — bug found at pre-push review, fixed)

- **When**: 2026-05-27, Phase E judging + pre-push review.
- **Description**: The 5 sanity-check repeats (§4.6) re-judge the same outputs in a DIFFERENT blind order to measure judge order-bias. The reliability metric first reported **0.000**, which was a code defect: `summary.ts` read `rep.positionToArm` (camelCase) while the serialized field is `position_to_arm` (snake-case), so the comparison loop skipped every iteration and `mean([])` forced 0. The pre-push final-reviewer caught it. After the one-line fix and recompute (no new API calls — recomputed from the existing JUDGE_LOG), the true value is **repeat_variance_mean = 0.0413** (75 per-dimension diffs).
- **Impact**: The corrected variance (0.041) is low and well under the 0.3 alert threshold → judge is reliable across presentation orders, **but it is NOT zero** — the earlier "fully reproducible / no order bias" claim was false. Verdict unchanged (no alert). Note: this measures order sensitivity on identical content, not sensitivity to rephrased inputs; inter-rater calibration (Opus judge) remains a Wave 2 item (§9.3).
- **Decision**: Field-name bug fixed in `summary.ts`; SUMMARY.json + SUMMARY.parquet + README + this entry regenerated with the true 0.041. Logged transparently rather than silently corrected.
