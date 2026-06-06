# How we used Mooter to audit Mooter

> **DRAFT — Paulo approval required before publishing.**

## TL;DR

We pointed Mooter's own tiered-routing pipeline at Mooter's codebase: 372 files, summarized by a local model, validated by Haiku, ranked by Sonnet, reported by Opus. Total spend $2.04 vs $11.78 all-Opus — **82.7% saved**.

## Method

| Phase | Tier | Model | What it did |
|---|---|---|---|
| 1 | T0 | local qwen2.5-coder | 5-line summary of every file ($0, runs on your machine) |
| 2 | T1 | Haiku | validate each summary vs the real file, score drift |
| 3 | T2 | Sonnet | rank the top issues across 10 categories |
| 4 | T3 | Opus | cost breakdown, LoRA export, this writeup |

## The honest discovery

Our `local-summarizer` subagent is *routed* as T0/local, but when an `ANTHROPIC_API_KEY` is present it actually **executes on cloud Haiku**. Rather than bury that, Mooter's statusline renders a live divergence chip: `⚠ exec T1 haiku · N calls`. Intent and execution can differ — the honest move is to show it.

## Cost breakdown

| Phase | Tier | Tokens (in/out) | Actual | All-Opus | Saved |
|---|---|---|---|---|---|
| 1 Corpus | T0 | 588540/59769 | $0.00 | $4.44 | $4.44 |
| 2 Validate | T1 | 778835/98824 | $1.27 | $6.36 | $5.09 |
| 3 Insights | T2 | 70000/7199 | $0.32 | $0.53 | $0.21 |
| 4 Benchmark | T3 | 45000/9000 | $0.45 | $0.45 | $0.00 |
| **Total** | mixed | 1482375/174792 | **$2.04** | **$11.78** | **$9.74 (82.7%)** |

## What the audit found

- **classify.js local summary catastrophically wrong (score=1) — core routing logic undocumented** (Dead code) — `tools/router/classify.js`
- **_debug_subagentstop_v167.js is empty/vestigial debug artifact checked into router** (Dead code) — `tools/router/_debug_subagentstop_v167.js`
- **subagentstop_hook.js missing token-aggregation job 22.B and dominant-model extraction from transcript** (Architecture violation) — `tools/router/subagentstop_hook.js`
- **hub/routes/stats.js fabricates require(invariant) and require(./env) — wrong import model in corpus** (Stale docs) — `hub/routes/stats.js`
- **FRUGAL_ADMIN_TOKEN and MOOTER_ADMIN_TOKEN dual-token auth in hub — inconsistent secret naming** (Security gap) — `docs/strategy/WAVE13_X_DAY1_FINDINGS.md`

## Quantization, honestly

The shipped Q4_K_M local model scored **5.2 /10** accuracy as judged by Haiku. We don't have FP16 weights in our test environment, so we don't publish a fabricated "Q4 vs FP16" delta — we report what we can actually measure.

## Repo

github.com/pauloloureiroshp-ship-it/mooter — see `AUDIT_REPORT.md` and `AUDIT_BENCHMARK.md`.
