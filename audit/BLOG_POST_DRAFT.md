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

## Closing the loop (Wave 26, shipped 2026-06-06)

The audit was the diagnosis; Wave 26 was the treatment. We shipped the part that makes the whole thing more than a one-off report: a real CLI→hub sync. `mooter sync` now POSTs your local routing decisions — tier counts, average confidence, coarse hardware class, *never* prompt text — to a Cloudflare Worker backed by D1. The 212 high-quality pairs the audit exported became the corpus for `scripts/train_lora.sh`, a QLoRA 4-bit trainer over `qwen2.5-coder:7b` with a seed-fixed 80/20 split and early stopping. The adapter that's meant to close the 5.2/10 quality gap finally has both the data and the pipeline behind it.

The other half is the Pastor — a pull-based loop that reads your synced decisions back and nudges your setup. It isn't a mock. The first real sync after shipping landed 43 decisions (t0=9, t1=13, t2=1, t3=20) at 0.872 average confidence, and the Pastor computed the rates and fired exactly the hint it should: *"Over 25% of your prompts hit T3 Opus. Consider `complexity_bias: T2` in CLAUDE.md for routine work."* That message was derived in production, from real data, with no human in the loop — the learning loop is live.

We're keeping the same honesty bar we set in the audit. There's no organic external traffic yet — Wave 26 shipped the day before this writeup, so the only client so far is our own test device, and we say so. Coarse hardware classes only, no device fingerprint, no prompt text on the wire. The next milestone isn't a vanity metric; it's the first *external* `mooter sync` producing a hint someone other than us acts on.

## Cost table (audit phase)

| Phase | Tier | Actual | All-Opus | Saved |
|---|---|---|---|---|
| 1 Corpus | T0 | $0.00 | $4.44 | $4.44 |
| 2 Validate | T1 | $1.27 | $6.36 | $5.09 |
| 3 Insights | T2 | $0.32 | $0.53 | $0.21 |
| 4 Benchmark | T3 | $0.45 | $0.45 | $0.00 |
| **Total** | mixed | **$2.04** | **$11.78** | **$9.74 (82.7%)** |

## Repo

github.com/pauloloureiroshp-ship-it/mooter — see `AUDIT_REPORT.md` and `AUDIT_BENCHMARK.md`. Wave 26 shipped as `v1.15.0-pastor-live`.
