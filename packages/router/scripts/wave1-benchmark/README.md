# Wave 1 Pastor — End-to-End Benchmark (run outputs)

> **Handoff document — facts only, no interpretation.** Deep analysis is the Cowork's job (see `docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md` §11). This README states what was run, where the data is, and how to reproduce/analyse it.

## What this is

Pre-registered (`BENCHMARK_DESIGN.md`) end-to-end benchmark of the Pastor Wave 1 router (two-axis routing + packs) against two baselines, over 34 prompts × 3 arms + a blind judge.

| Arm | Stack |
|---|---|
| **A — Pastor** | `classify_complexity` + `classify_domain` → minimum-viable tier (T0 Ollama / T1 Haiku / T2 Sonnet / T3 Opus), with the resolved pack's scaffold injected as the system prompt and `model_floor` applied |
| **B — Baseline** | Claude Sonnet 4.6 always, empty system prompt, zero hints |
| **C — Gold** | Claude Opus 4.7 always, empty system prompt, zero hints |

Judge: Claude Sonnet 4.6, blind (3 anonymised outputs per prompt, seed-randomised order), rubrics §4.

## Headline numbers

<!-- NUMBERS:START -->
**Run** `019e6b63-0cc6-7987-9254-4673b27fa2dd` · 102 rows (34×3) · 39 judge calls · **total cost $3.52** ($2.86 invocation + $0.66 judge, §A6) · 2 failed rows (§A4).

| Arm | Mean quality | 95% CI | Mean cost/prompt | Total cost | Mean latency | n_ok | Model mix |
|---|---|---|---|---|---|---|---|
| **A — Pastor** | 0.870 | [0.800, 0.927] | $0.02239 | $0.7613 | 51,101 ms¹ | 32/34 | Opus 15, Sonnet 7, Haiku 7, qwen3:30b 5 |
| **B — Baseline (Sonnet)** | 0.886 | [0.838, 0.931] | $0.02799 | $0.9517 | 27,036 ms | 34/34 | Sonnet 34 |
| **C — Gold (Opus)** | 0.917 | [0.878, 0.951] | $0.03366 | $1.1446 | 20,265 ms | 34/34 | Opus 34 |

¹ Arm A latency is dominated by 2 Ollama-timeout outliers (P005/A, P012/A ≈ retries×120s) — see §A4; exclude `status='failed'` for a representative figure.

| Pair | Paired Cohen's d (quality) | Quality-diff 95% CI | Cost savings | Latency Δ | §1 criteria (quality / cost / latency) | Verdict |
|---|---|---|---|---|---|---|
| **A vs B** | −0.067 | (see SUMMARY) | 20.0% | +89.0% | ✓ / ✗ / ✗ | **WEAK (1/3)** |
| **A vs C** | −0.201 | (see SUMMARY) | 33.5% | +152.2% | ✓ / ✗ / ✗ | **WEAK (1/3)** |

§1 "Pastor wins" criteria: quality ≥ 0.9× · cost ≤ 0.5× · latency ≤ 1.2×. Pastor meets the **quality** bar against both arms but **not cost (saved 20%, not 50%) nor latency** (slower). Mis-routing: pack-correct **22/24 (91.7%)**, tier-appropriate **70.6%**, would-higher-tier-help **14.7%** (review: P005, P012, P018, P029, P032, P034). Judge repeat-variance **0.000** (no order bias; §A7).
<!-- NUMBERS:END -->

These are **facts, not verdicts**. N=34 is small (§6.1): effect sizes d<0.3 are statistical noise. Read `SUMMARY.json` for CIs, Cohen's d, per-pack and mis-routing detail.

## Files

| File | What |
|---|---|
| `RAW_RESULTS.jsonl` | 102 rows (34 prompts × 3 arms), one per (prompt, arm). Full responses + judge scores + lineage. |
| `RAW_RESULTS.parquet` | Columnar (flattened) version for DuckDB. Responses dropped (only `response_len`); query the JSONL for full text. |
| `JUDGE_LOG.jsonl` | Every judge call (base + 5 sanity-check repeats), with blind order map and raw judge response — auditable. |
| `JUDGE_LOG.parquet` | Flattened: one row per (judge call, arm). |
| `SUMMARY.json` | Per-arm + per-pack metrics, paired Cohen's d, bootstrap 95% CIs, mis-routing rates, judge reliability, §1 verdict. |
| `SUMMARY.parquet` | Per-arm summary table. |
| `queries.sql` | 10 pre-canned DuckDB queries (cost/quality/latency/mis-routing/hallucination/…). |
| `lineage-snapshot.json` | The run's pinned versions + env_hash (reproducibility). |
| `anomalies.md` | Deviations logged during the run (pricing, tokenizer, Ollama transport). |

## Methodology notes (read before interpreting)

- **Pricing**: cost is priced against the FROZEN `data/pricing-snapshot-2026-05-27.json` (verified real 2026-05-27 prices: Opus 4.7 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5), **not** the live `pricing.js`. The design's §17.2 numbers were stale — see `anomalies.md` A1. Ollama (T0) is $0.
- **Cost is integer microUSD** (`cost_micros`) to avoid float drift; divide by 1e6 for USD.
- **Quality** = composite of 5 judge dimensions with pre-registered weights (§3.2): correctness 0.30, completeness 0.20, relevance 0.20, actionability 0.20, (1−hallucination) 0.10. Normalised 0–1.
- **Deterministic correctness overrides the judge** where a check ran (§3.2): regex-present / mermaid-syntax / yaml-lint / json-valid (pass→1.0, fail→0.0). `ts-compile` degrades to judge-fallback (no `tsc` in this env). See each row's `deterministic` field.
- **Mis-routing diagnostics** (arm A; §3.3 had no pre-registered rubric, so operationalised objectively here):
  - `pack_correct` = `pack_routed == expected_pack`; `null` for AMBIGUOUS/GENERAL.
  - `tier_appropriate` = routed tier ≥ `expected_tier_floor`.
  - `would_higher_tier_help` = routed tier < T3 **and** (gold-arm quality − Pastor quality) > 0.15. Uses the experiment's own gold arm rather than a separate subjective judge call.
- **Blind judging** (§4.6): outputs presented unlabelled in seed-randomised order; the de-blind map is in `JUDGE_LOG`. 5 prompts re-judged with a different order to measure judge variance (alert if mean variance > 0.3).
- **P012 and P018** are intentional cross-vocabulary mis-routes (animation/code-audit prompts that the regex sends to AMBIGUOUS) — Q4 findings, not bugs. Specific-pack routing accuracy is therefore 22/24, not 24/24.

## Honest limitations (from BENCHMARK_DESIGN §9)

1. N=34 is small — only medium-large effects detectable.
2. Only 3 of the 7 designed packs exist (animation-web, code-audit, diagram-systems). No generalisation to the other 4.
3. Sonnet judge has its own biases; Opus-judge calibration is a Wave 2 item.
4. Prompts are authored, not sampled from real traffic.
5. Composite quality with fixed weights is a simplification — per-dimension data retained.
6. Prices are point-in-time 2026-05-27.
7. **Opus 4.7 uses a new tokenizer (~35% more tokens for the same text)** — cross-arm token-count comparisons are confounded; cost/latency/quality comparisons are valid (`anomalies.md` A2).

## Reproduce

```bash
cd ~/mooter && git checkout v0.1.0-pastor-wave1 && git checkout -b wave1-benchmark-repro
cd packages/router && npm install
export ANTHROPIC_API_KEY=sk-ant-...
export OLLAMA_HOST=http://host.docker.internal:11434   # Ollama on the Windows host (WSL)
npx tsx scripts/wave1-benchmark/run.ts                  # full run
# dry-run first if you like:  npx tsx scripts/wave1-benchmark/run.ts --dry-run
```

The run is pinned: it benchmarks the tagged code (`v0.1.0-pastor-wave1` @ `1d8a0da`) against the frozen pricing snapshot, with all versions captured in `lineage-snapshot.json`.

## Analyse

```bash
# DuckDB (single binary, no infra)
cd outputs && duckdb -c ".read queries.sql"
# or interactively
duckdb -c "SELECT arm, AVG(quality_score), SUM(cost_micros)/1e6 FROM 'RAW_RESULTS.parquet' GROUP BY arm;"

# Python
python3 -c "import pandas as pd; df=pd.read_parquet('outputs/RAW_RESULTS.parquet'); print(df.groupby('arm')[['quality_score','cost_micros','latency_total_ms']].mean())"
```

Data lake (unified prod+bench, §15): events also mirrored to `~/.mooter/cache/events/2026-05-27.jsonl` and compacted to `~/.mooter/cache/parquet/2026-05-27.parquet` (`latest.parquet` symlink).

**Hub**: schema is hub-ready (`bench_event` table, §14.3) but upload is skipped this run — `/api/bench` lands in Wave 2.
