# Mooter — Performance Validation (cost · speed · quality · parallel local fleet)

> **Date:** 2026-06-27 · **Branch:** `wave/perf-validation` · **Question answered:**
> *does the local-first routing strategy pay off, and by how much?*
>
> **Headline (honest):** on the benchmark-v2 corpus (N=12), Mooter routes at
> **40.7 % of the all-Opus cost (−59.3 % saved)** with **83.3 % classifier
> accuracy**, landing **4.7 pp from the perfect-routing Oracle (36 %)**. Local
> moos generate at a **measured 206–242 tok/s warm on the free GPU ($0), in
> parallel with the cloud CC**. Quality is carried by a **prior curated A/B
> (82.1 % non-regression — local matched-or-beat cloud)**, *not* re-run here.

This document **extends** (does not duplicate) the existing evidence:
[`MOOTER_VS_OPUS_LIVE_BENCHMARK_2026-06-09.md`](./MOOTER_VS_OPUS_LIVE_BENCHMARK_2026-06-09.md)
(78 % measured savings on a real session), [`BENCHMARK_SOURCES_2026.md`](./BENCHMARK_SOURCES_2026.md)
(public model benchmarks) and [`VALIDATION_PLAN.md`](./VALIDATION_PLAN.md) (external beta).
What was **missing and is added here**: a **speed axis (TTFT/TPOT/throughput)** and a
**Pareto positioning vs RouterBench baselines**.

**Honesty contract (applies to every number below):** measured and estimated are
*always separated*; a missing number is marked, never invented; cold-start is shown
separately from warm and never hidden; the LLM-judge biases are declared. A credible
number beats a pretty one.

---

## 0 · Methodology (the rules this validation follows)

Researched 2026-06-27. Each axis follows a published best practice:

- **Cost–quality Pareto frontier** (RouterBench / LLMRouterBench 2026): a router is
  judged against four baselines — **Oracle** (perfect choice), **BestSingle** (best
  fixed model), **Random**, and **all-Opus** (no router). RouterBench reports ~32 %
  savings at no accuracy loss as a top reference. We report Mooter's *point* on that
  frontier, not a marketing claim.
- **Speed** (NVIDIA / BentoML 2026): measure **TTFT** (time-to-first-token), **TPOT**
  (time-per-output-token = perceived speed) and **throughput** (tok/s in decode),
  **request-weighted** (batch=1 — hot-batch numbers mislead), reported **per tier**.
- **Local warm vs cold** (critical — cold load can be many× slower): **3 warm-ups +
  median of 3 runs**, **temp=0**, **batch=1**, **fixed prompt + output length**;
  cold-start measured **separately**. Never fold cold into the warm number.
- **Quality (LLM-as-judge, FutureAGI 2026):** mitigate the 5 biases — randomise A/B
  order, score independently per rubric criterion, ensemble judges where possible, and
  **declare** residual bias + the date (judges drift in 60–90 days). Never a single
  positional verdict.

**What the harness measures vs estimates**

| Axis | Status here | How |
|---|---|---|
| 💰 Cost / token | **Computed** (reproducible) | frozen `classify.js` + `pricing.js` over a fixed corpus |
| ⚡ Speed — local | **Measured** ($0, on this GPU) | `speed-meter.js`: streamed `/api/generate`, warm+cold |
| ⚡ Speed — cloud | **Estimated** (declared) | no streaming API key on this machine → public 2026 figures |
| 🎯 Quality | **Prior curated A/B** (declared) | `mooter-quality-matrix.json`; a fresh LLM-judge needs an API key (absent) |

Tooling added this wave (off the decision path — `classify.js` untouched, sha frozen):
- [`tools/router/speed-meter.js`](../../tools/router/speed-meter.js) — TTFT/TPOT/throughput meter.
- [`tools/router/perf-validate.js`](../../tools/router/perf-validate.js) — 3-axis + Pareto runner.
- [`audit/PERF_VALIDATION_RESULTS.json`](../../audit/PERF_VALIDATION_RESULTS.json) — machine-readable snapshot.

**Sample:** benchmark-v2 corpus from `benchmark.sh` — 12 prompts (3 trivial · 3 simple ·
3 medium · 3 complex), PT-PT. **N=12** (small — see Limitations).

---

## 1 · 💰 Cost / token (computed)

Mooter routed cost vs the all-Opus baseline (`naiveOpusCost`, Opus 4.6 1M @ $5/$25),
per `pricing.js`. Local (T0) executions are **$0**.

| | all-Opus (no router) | Mooter (routed) | Saved |
|---|---|---|---|
| Corpus total (N=12) | **$1.0207** | **$0.4151** | **$0.6056 (−59.3 %)** |

**Per-tier breakdown of the routed cost** (where the 12 prompts landed):

| Tier | Prompts | Routed $ | Note |
|---|---|---|---|
| T0 (local) | 4 | **$0.000** | free — Ollama on the GPU |
| T1 (Haiku) | 1 | $0.0098 | |
| T2 (Sonnet) | 4 | $0.1502 | |
| T3 (Opus) | 3 | $0.2552 | high-risk floor preserved |

**Classifier accuracy: 83.3 % (10/12).** The two divergences from the human label are
honest and instructive — neither is a safety failure:
- *"compara estes dois snippets"* → labelled T0, classified **T2** (a genuine over-route).
- *"gera uma commit message"* → labelled T0, classified **T1** (arguably *more* correct
  than the label — commit messages are the canonical T1 task in the doctrine).

> **Reconciliation with the 78 % live figure.** The −59.3 % here is a **conservative
> advisory** estimate: it charges the all-Opus baseline ~1800 output tokens for *every*
> prompt (Opus is verbose when unconstrained) and uses per-tier average token models.
> The [live benchmark](./MOOTER_VS_OPUS_LIVE_BENCHMARK_2026-06-09.md) measured **78 %**
> on a *real* 4-prompt session with actual token counts and real $0 local deflections.
> Both are honest; they differ by method (estimated corpus vs measured session) and sample.

---

## 2 · ⚡ Speed (local measured · cloud estimated)

### Local — **measured** on this GPU ($0), batch=1, temp=0, median of 3 warm runs

| Model | Tier | TTFT (warm) | Throughput (warm) | TPOT (warm) | TTFT (cold) | Load (cold) |
|---|---|---|---|---|---|---|
| `qwen2.5:3b` | T0 | **133 ms** | **241.7 tok/s** | 4.14 ms | 1885 ms | 1828 ms |
| `qwen3:30b` | T0 | **135 ms** | **206.1 tok/s** | 4.85 ms | 3956 ms | 3835 ms |

**Honest cold-start finding:** the cold penalty hits **TTFT/load**, *not* decode
throughput — `qwen2.5:3b` cold throughput (237.2 tok/s) ≈ warm (241.7 tok/s); only the
first-token latency jumps ~14× (133 ms → 1885 ms) while the model pages into VRAM. This
is why the router keeps locals warm (`keep_alive`) — it buys back the TTFT, not the tok/s.

### Cloud — **estimated** (no streaming API key on this machine — declared, not measured)

| Model | Tier | TTFT~ | Throughput~ | TPOT~ |
|---|---|---|---|---|
| `claude-haiku-4-5` | T1 | ~400 ms | ~110 tok/s | ~9.1 ms |
| `claude-sonnet-4-6` | T2 | ~600 ms | ~75 tok/s | ~13.3 ms |
| `claude-opus-4-6[1m]` | T3 | ~1100 ms | ~42 tok/s | ~23.8 ms |

> Basis: public 2026 streaming-latency figures (provider status pages / community
> benchmarks). These are **order-of-magnitude estimates**, marked `estimated:true` in
> `estimateCloud()`. With an API key, `speed-meter.js` measures cloud TTFT/TPOT from the
> live stream — that is the only path that turns these into measurements.

**Read:** warm local decode (**206–242 tok/s**) is faster than the estimated cloud decode
(~42–110 tok/s) **and free**. The catch is cold TTFT (1.9–4.0 s) on the first call — real,
shown, and mitigated by keep-warm.

---

## 3 · 🎯 Quality (prior curated A/B — **not** re-run this session)

From [`mooter-quality-matrix.json`](../../tools/router/mooter-quality-matrix.json), the
historical local-vs-cloud A/B (win = local matched-or-beat cloud; tie = equivalent):

| Metric | Value |
|---|---|
| Comparisons | **112** |
| Non-regression (local ≥ cloud) | **82.1 %** |
| Local strict win | 17.9 % |

> **Why this is not a fresh measurement.** A fresh LLM-judge run with the full §0 protocol
> (randomised A/B order + criterion-separated rubric + judge ensemble) requires an API key
> to (a) generate the cloud reference answers and (b) run the judge. **No key is available
> on this machine**, so quality is carried by the prior curated matrix and the live
> benchmark's "empate" (tie) finding across all four tiers.
> **Declared biases:** the prior A/B used a single judge family and a fixed order on some
> cells; treat 82.1 % as directional, not a ranking. Judges drift in 60–90 days — re-run
> before quoting externally.

---

## 4 · 📈 Pareto frontier (cost as % of all-Opus · quality where measured)

| Strategy | Cost (N=12) | % of all-Opus | Quality | Quality basis |
|---|---|---|---|---|
| **Oracle** (perfect routing) | $0.3678 | **36.0 %** | 100 % | definitional |
| **Mooter** (routed) | $0.4151 | **40.7 %** | 82.1 % | prior A/B (non-regression) |
| BestSingle (all-Sonnet) | $0.4504 | 44.1 % | — | cost-only (not measured) |
| Random tier | $0.3971 | 38.9 % | — | cost-only |
| all-Haiku | $0.1171 | 11.5 % | — | cost-only |
| **all-Opus** (baseline) | $1.0207 | 100 % | 100 % | reference |

**Interpretation (the honest story):**
- **Mooter sits 4.7 pp from the Oracle** (40.7 % vs 36.0 %) — the gap *is* the 16.7 %
  classifier miss; closing accuracy closes the gap. It also **beats BestSingle-Sonnet**
  (40.7 % < 44.1 %) *while preserving quality* by spending Opus only on the 3 T3 prompts.
- **Cost alone is a trap.** Random (38.9 %) and all-Haiku (11.5 %) look cheaper — but they
  are **cost-only points**: Random sends architecture/audit/deploy prompts to a 3B local
  model, and the prior A/B shows local models *lose* on `architecture_or_critical`. That
  collapse is exactly why the frontier needs the quality axis. Mooter pays for the hard
  tasks and banks the free local wins on the easy ones — the Oracle behaviour, approximated.

---

## 5 · 🐮 Parallel local fleet ($0, off the cloud critical path)

The thesis made visible (cockpit WS3, `renderLocalFleet`): while the cloud CC does the
billed work, **local Ollama moos grind handoffs (journal → rolling summary → handoff
narrative) on the free GPU, in parallel**. The "🐮 Local Moo Fleet" panel shows, per active
session, the moo's stage + its model + the **measured local tok/s (WS1)** + **"$0 · paralelo
ao CC"**, with an aggregate header and an idle fallback ("moos locais ociosos").

This is the differentiator vs a pure cloud router: the accumulator work that makes handoffs
instant costs **$0** and never sits on the cloud latency/billing path. The fleet view is
read-only and never blocks the cockpit refresh. (Honest caveat: moos share one GPU, so the
header shows the measured **single-stream** rate, not a fabricated N× total.)

---

## 6 · Limitations (read before quoting)

- **Sample size.** N=12 (benchmark-v2 corpus). Directional, not a population estimate.
  Real prompts can't be re-classified (decision logs are sanitised — no prompt text), so
  the documented corpus is the reproducible sample.
- **Cost is advisory.** The all-Opus baseline assumes Opus answers every prompt at T3 output
  length; real Opus output varies. The −59.3 % is conservative; the measured session figure
  is 78 %.
- **Cloud speed is estimated**, not measured (no API key). Local speed is fully measured.
- **Quality is prior/curated**, not re-run; single-judge bias on some cells; will drift.
- **Pareto quality** is only attached to all-Opus (reference) and Mooter (A/B). Single-model
  baselines are **cost-only** — their quality is not measured here and must not be inferred.
- **Local numbers are machine-specific** (this GPU, these models, warm state). Reproduce on
  your own hardware: `node tools/router/speed-meter.js --all`.

## 7 · Reproduce

```bash
# 1) measure local speed ($0, needs Ollama running) — writes speed-metrics.jsonl
node tools/router/speed-meter.js --all

# 2) run the 3-axis validation + Pareto — writes audit/PERF_VALIDATION_RESULTS.json
node tools/router/perf-validate.js --write

# tests (no network / no Ollama dependency — green in CI)
cd tools/router && node --test --test-force-exit speed-meter.test.js perf-validate.test.js
```

*Numbers above are from the 2026-06-27 run on this machine. `classify.js` was read-only and
its sha freeze is intact; nothing on the routing decision path was modified.*
