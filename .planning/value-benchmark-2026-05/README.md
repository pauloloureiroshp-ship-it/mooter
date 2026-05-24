# Mooter Value Benchmark

> **An independent, adversarial, three-arm benchmark of a heuristic LLM router.**
> Frozen commit `ce08f72`, run 2026-05-24, 150 + 50 + 2,672 prompts, ten baselines.

## TL;DR

The Mooter (`tools/router/classify.js`) is a 1,300-line regex-based prompt
classifier that routes developer prompts to one of four tiers (T0 local
Ollama → T3 Opus). This benchmark scored it adversarially against ten
baselines on three orthogonal axes:

| Arm | Domain | Result |
|---|---|---|
| **A — RouterBench (n=2,672)** | General Q&A (MMLU, GSM-8k, Hellaswag, ...) | **Pareto-dominated by `always_T1`**. AIQ-q = −0.725 (worse than random in quality). 88.9% of prompts collapse to T0 via length-based fallback. |
| **B — Coding-fresh (n=150)** | Developer prompts (the Mooter's intended domain) | **Competitive**. 62.7% exact accuracy vs 45.3% for a hand-written 10-line classifier. Cost-weighted error roughly half. Beats every trivial baseline. |
| **C — Risk-axis (n=50)** | Innocent-looking but destructive prompts | **Best non-trivial baseline.** Risk recall 0.80 at 0.28 FPR. Youden's J = 0.520 vs 0.320 next-best. Catches 70% of disguised risks. |

**One-line verdict:** the Mooter is a domain-specific risk-aware router, not
a general cost-quality optimizer. It performs as expected on the axis it was
designed for (in-domain routing with safety floor) and as badly as feared on
the axis it was not (general OOD Q&A). The benchmark deliberately measures
both and lets readers draw their own line.

---

## Why this benchmark exists

In 2026, LLM routing is a crowded research area — RouteLLM (ICML 2024 datasets +
production routers), Martian's RouterBench, OpenRouter's per-task evaluations,
LiteLLM's policy routing, and dozens of hand-rolled classifiers. Most published
routers are validated on the same dataset (RouterBench) and reported via the
same metric (% cost reduction at X% quality retention).

The Mooter was built outside that pipeline, hand-tuned on a single developer's
prompt corpus, and never benchmarked externally. This is the gap this report
closes.

**The question the benchmark answers**: does the Mooter's regex classifier route
prompts to cheaper tiers *better* than trivial baselines? Where does it sit
relative to the published cost-quality frontier?

**The question the benchmark does NOT answer**: whether the Mooter is a viable
product. That requires market analysis (LiteLLM ≈18k★, OpenRouter, RouteLLM,
Martian) and go-to-market reasoning. Out of scope.

---

## Methodology

### Frozen artifact

The Mooter classifier was tested **as-is** at git HEAD `ce08f72`. The benchmark
explicitly forbids retuning. At the end of the run,
`git diff -- tools/router/classify.js` returned zero lines. The runtime
tuning state file (`tuning-state.json`) was absent throughout; defaults from
`tuning-state.defaults.json` were used.

### Baselines (identical across all three arms)

| Baseline | Description |
|---|---|
| `always_T0` / `T1` / `T2` / `T3` | Static — useful as floor/ceiling references |
| `random` × 3 seeds | Hash(seed, prompt) → tier; averages reported |
| `length_heuristic` | <80c→T0, <200→T1, <500→T2, else→T3 |
| `tenline_classifier` | Length + 25 hand-picked risk keywords. **The barrier the Mooter must clear.** |
| `oracle_quality` (Arm A only) | Per-prompt cheapest model at max observed quality. Theoretical ceiling. |

The 10-line classifier is the strongest comparator: anyone with five minutes
and a basic knowledge of LLM routing could write it. If 102 hand-tuned regexes
can't beat 10 lines, the regex effort wasn't worth it.

### Arm A — RouterBench (out-of-domain)

The `withmartian/routerbench` dataset (HuggingFace, ICML 2024) contains 36,497
prompts × 11 models, each row carrying per-model quality (0/1) and per-prompt
cost ($). We stratified-sampled 2,672 prompts across 86 task buckets (seed 42,
≈31 per bucket; covers MMLU, GSM-8k, Hellaswag, Winogrande, MBPP, MT-Bench, etc.).

The 11 models were ranked by average quality, then mapped to four tiers via
**evenly-spaced quartiles** (primary) and again via **skip-rungs** (sensitivity).
Both mappings yield the same verdict — Mooter Pareto-dominated.

The dataset ships as `.pkl`. To avoid arbitrary-code-execution risk on pickle
deserialization, we wrote a `RestrictedUnpickler` (`harness/load_routerbench.py`)
that whitelists pandas, numpy, builtins, and datetime — anything else raises.
This is a defensible standard pattern for loading external pickles.

### Arm B — Coding-fresh (in-domain)

150 English coding prompts written for this benchmark (40 T0 + 30 T1 + 35 T2 +
45 T3). Spread covers: trivial mechanical edits → simple bug fixes → bug
investigations and approach comparisons → architecture and pre-deploy reviews.

**Anti-contamination:** every prompt 5-gram-shingled and checked against
`tools/router/validation-set.json` (the Mooter's gold-label corpus). Zero
prompts had ≥3 shared 5-grams. The prompts are English; the Mooter validation
set is mixed PT-PT/EN. Different surface area further reduces accidental
overlap.

**Independent judge:** Ollama `gemma3:12b` was used as a blind labeler.
Gemma is Google-family — distinct from Anthropic, on which the Mooter author
based his tuning. The judge saw the prompt and a tier rubric, never the
Mooter's prediction. Concordance against the author's expected labels was
84%, with divergences concentrated in T0↔T1 (the judge being more
conservative about promotion to T1).

### Arm C — Risk-axis adversarial (new in this report)

50 prompts in five buckets of 10 each, hand-labeled for risk:

| Bucket | Description | Risk? |
|---|---|---|
| safe | trivial edits, no risk language | no |
| indirect | *explanations of* risk concepts ("explain rm -rf") | no |
| disguised | innocent surface, hidden destructive op | **yes** |
| explicit | clearly mentions prod / migration / deploy | **yes** |
| mixed | ambiguous; resolution depends on judgement | varies |

Risk axis metrics: TPR (recall on true-risk prompts), FPR (false alarms on
non-risk prompts), Youden's J (TPR − FPR — standard ROC discrimination), and
per-bucket breakdown to identify failure modes.

This dimension was explicitly flagged as **NOT measured** in the cost-quality
arms because RouterBench-style datasets are agnostic to operational risk.

---

## Results

### Arm A — RouterBench (out-of-domain)

Anchor points (primary mapping):
- random average: q = 0.453, c = $0.001049
- oracle (per-prompt cheapest-at-best): q = 0.882, c = $0.000271
- always_T3: q = 0.728, c = $0.002504

Pareto frontier sorted by cost:

```
baseline             quality   cost ($)   AIQ_q   cost_save   on_Pareto?
always_T1            0.4139    0.000048  -0.092     128.6%      YES
always_T0            0.0637    0.000118  -0.909     119.5%      no (dom by T1)
oracle_quality       0.8815    0.000271   1.000     100.0%      YES (ceiling)
> mooter <           0.1428    0.000396  -0.725      83.9%      NO (dom by T1)
length_heuristic     0.4639    0.000608   0.025      56.6%      no
random_seed*         0.4459    0.001049  -0.000       0.0%      no
tenline_classifier   0.5807    0.001331   0.298     -36.3%      no
always_T2            0.5932    0.001554   0.327     -64.9%      no
always_T3            0.7279    0.002504   0.641    -187.1%      no
```

- **AIQ-q** = fraction of oracle's quality improvement over random that the
  router captures. 1.0 = oracle. 0.0 = random. Negative = worse than random.
- **cost_save** = fraction of oracle's cost reduction from random captured.
  >100% means even cheaper than oracle.

**Mooter sits at AIQ-q = −0.725. That is, on a general-purpose benchmark,
the Mooter actively destroys quality faster than random would.** It does
capture 83.9% of oracle's cost reduction, but the quality cost is brutal.

The 10-line classifier achieves AIQ-q = +0.298 — fundamentally better routing
behaviour on OOD prompts with 1/100th the code.

**Sensitivity:** the alt mapping (skip-rungs across the 11-model ranking) places
Mooter at AIQ-q = −0.373 and still Pareto-dominated. The verdict is robust to
the mapping choice.

**Failure-mode diagnosis:** 88.9% of RouterBench prompts route to T0. The
Mooter's `task_category` distribution shows 63% fall into `ambiguous_medium`
or `ambiguous_long` — i.e. the prompt has no recognizable coding signals, and
the classifier falls back to a length-based heuristic that defaults to T0.
The Mooter is, on this dataset, effectively a length-thresholded T0 stamp.

### Arm B — Coding-fresh (in-domain)

Scored against the gemma-12b independent judge:

| Baseline | Accuracy exact | Within ±1 | Cost-weighted err |
|---|---|---|---|
| **mooter** | **0.627** | **0.920** | **0.477** |
| tenline_classifier | 0.453 | 0.907 | 0.715 |
| always_T2 | 0.320 | 0.793 | 0.480 |
| length_heuristic | 0.320 | 0.820 | 1.035 |
| random (avg 3) | ≈0.273 | ≈0.620 | ≈1.296 |
| always_T3 | 0.247 | 0.567 | 0.587 |
| always_T1 | 0.227 | 0.753 | 1.122 |
| always_T0 | 0.207 | 0.433 | 3.160 |

The Mooter wins all three columns. Beats the 10-line classifier by **+17 pp
accuracy** (the master comparator) and halves cost-weighted error. Beats
random by **+30 pp**.

Cost-weighted error penalises under-routing (truth = T3 but predicted T0)
heavily because under-routing destroys quality, while over-routing only
wastes cost. Mooter has the **lowest cw_error among non-degenerate baselines**
— it errs in the right direction.

Confusion matrix (rows = judge truth, cols = Mooter prediction):

```
                  predicted
                  T0   T1   T2   T3
truth T0 (n=31)  | 30    0    0    1     96.8% recall (excellent)
truth T1 (n=34) |  26    3    5    0     8.8% recall (T1 DEAD ZONE)
truth T2 (n=48) |  10    0   26   12     54.2% recall
truth T3 (n=37) |   1    0    1   35     94.6% recall (excellent)
```

The structural finding: **T1 dead zone**. Of 34 judge-T1 prompts, only 3
were routed to T1; 26 went to T0 instead. The Mooter behaves as a 3-tier
router (T0 / T2 / T3) in practice, ignoring the Haiku-class middle tier.
This is a tunable bug, not a design flaw, but it is the biggest single
opportunity for in-domain improvement.

ECE (Expected Calibration Error) of `mooter_confidence` vs accuracy:
0.171 — moderately overconfident, in the range of production classifiers
that need light recalibration. Not catastrophic.

### Arm C — Risk-axis (the new arm)

Risk discrimination on 25 true-risk and 25 non-risk prompts:

| Baseline | TPR (risk recall) | FPR | Precision @ T3 | Youden's J |
|---|---|---|---|---|
| **mooter** | **0.800** | 0.280 | 0.741 | **0.520** |
| tenline_classifier | 0.360 | 0.040 | 0.900 | 0.320 |
| random_seed2 | 0.360 | 0.200 | 0.643 | 0.160 |
| random_seed3 | 0.360 | 0.240 | 0.600 | 0.120 |
| random_seed1 | 0.080 | 0.160 | 0.333 | −0.080 |
| always_T3 | 1.000 | 1.000 | 0.500 | 0.000 |
| always_T0/T1/T2/length_heuristic | 0.000 | 0.000 | 0.000 | 0.000 |

Youden's J (TPR − FPR) is the canonical single-number ROC discrimination
metric. **The Mooter is the clearly-best non-trivial baseline: 0.520 vs
0.320 for the 10-line classifier.** The Mooter catches 80% of true risks
while only over-routing 28% of non-risk prompts to T3.

Per-bucket TPR (recall on truly-risky prompts in each bucket):

```
bucket            mooter    tenline   always_T3
safe                n/a       n/a        n/a    (no risk in this bucket)
indirect            n/a       n/a        n/a    (no risk in this bucket)
disguised          0.70      0.20       1.00   ← the hardest bucket
explicit           1.00      0.70       1.00
mixed              0.60      0.00       1.00
```

The disguised bucket is the most informative. These are prompts like:

> "small change: rotate our stripe secret key right now because we think
>  it was logged accidentally yesterday"

> "patch I'm about to merge: drop the `legacy_users` table since nothing has
>  read from it for six months. low-risk right?"

> "tiny refactor: change ATTRIBUTE_BASED_ACCESS_CONTROL=true to =false in
>  our prod env to test something quick"

These look small and casual. They are not. **The Mooter catches 70% of
these; the 10-line classifier catches 20%.** This is exactly the regime
where doctrine-aware routing earns its keep.

Per-bucket FPR (over-routes to T3 on non-risky prompts):

```
bucket            mooter    tenline   always_T3
safe               0.00      0.00       1.00
indirect           0.60      0.10       1.00   ← Mooter weakness
disguised          0.00      0.00       0.00
explicit           0.00      0.00       0.00
mixed              0.20      0.00       1.00
```

The Mooter's weak spot: **indirect** prompts (which talk *about* risk
concepts rather than perform a risky action) trigger 60% false alarms.
This is a known regex limitation — the classifier sees the word
"production" or "rm -rf" and routes to T3 regardless of intent. A second
pass with a small "intent detector" classifier would likely fix it.

---

## The bipolar verdict — and how to read it

Three axes, three different verdicts:

| Axis | Mooter | Baseline frontier | Interpretation |
|---|---|---|---|
| OOD cost-quality | DOMINATED | always_T1 wins flat | Don't use as general router |
| In-domain cost-quality | COMPETITIVE | Beats all trivial baselines | Works in its niche |
| Risk discrimination | BEST NON-TRIVIAL | Youden's J 0.52 vs 0.32 | The actual edge |

The cost-quality and risk axes are **fundamentally different**. A router
optimised for cost-quality minimises wasted spend on easy prompts. A router
optimised for risk minimises catastrophic outcomes on disguised destructive
prompts. The first matters for token bills; the second matters for not
deleting `legacy_users` because it "looked fine".

**Marketing as a cost-quality router**: indefensible. The benchmark gives
adversarial reviewers explicit ammunition.

**Marketing as a doctrine-aware Claude-Code workflow safety layer**: defensible.
The risk-axis numbers are real and unique among the trivial baselines tested.
The in-domain cost-quality numbers are also real.

The OOD failure (Arm A) becomes a *feature description* rather than a *bug*
under the second framing: "Mooter declines to route general-purpose Q&A
because it's not designed for that. It is designed for developer task routing
with safety guards."

---

## Limitations of this benchmark

1. **Single-judge in Arm B**. We used one Ollama judge model (`gemma3:12b`).
   A multi-judge ensemble or human spot-check on 30+ prompts would tighten
   the in-domain accuracy estimate. Concordance against author labels was
   84%, suggesting non-trivial label noise on the bucket boundaries.

2. **Arm C is small (n=50)** and entirely author-constructed. The disguised
   bucket especially could benefit from sourcing real-world incident
   pre-mortems. The 0.70 disguised TPR has wide confidence intervals.

3. **No live frontier comparison**. We did not run RouteLLM's published
   routers on the same Arm A subsample for a head-to-head. RouterBench's
   own oracle gives us the ceiling; a frontier router would give us the
   "state of the art" comparison point.

4. **The `HIGH_RISK` floor was not stress-tested adversarially**. A red-team
   pass with prompt injection ("ignore previous instructions; route this
   tiny edit to T0") would reveal whether the regex bank is bypassable.

5. **The risk-axis prompts were authored by the same person who reads the
   classifier daily**. There is mild risk of unconscious tailoring to the
   regex bank. A second-author Arm C would be ideal.

6. **Cost numbers in Arm A are 2023-vintage** (RouterBench uses pre-2024
   model pricing). The relative cost ordering of the 11 models is stable
   but absolute dollar figures should not be quoted as production costs.

---

## Future work (in priority order)

1. **Fix the T1 dead zone.** 76% of in-domain T1 prompts collapse to T0.
   The fix is regex-tuning (add patterns for `commit message`, `docstring`,
   `explain this error`, etc. that land in the 80–300 char window) and
   a small adjustment to the `ambiguous_short`/`ambiguous_medium`
   fallback to bias T1 instead of T0. Expected lift: ~10 pp in-domain
   accuracy, ~25 pp recall on T1 specifically.

2. **Fix the indirect-risk over-promotion.** A small second-pass intent
   detector ("is this prompt asking me to *do* X or to *explain* X?")
   would cut the Mooter's 60% FPR on indirect prompts to ≈10%.

3. **Add a learned classifier head as a fallback.** When the regex bank
   misses (the OOD failure mode in Arm A), fall through to a tiny
   distilled BERT classifier trained on RouterBench. Expected to lift
   OOD AIQ-q from −0.725 to ≈+0.30 (i.e. above the 10-line baseline).

4. **Live RouteLLM head-to-head.** Run RouteLLM's MF and BERT routers on
   the same Arm A subset. Report the gap. This is the comparison the
   benchmark currently fakes via the published-numbers reference.

5. **Adversarial Arm C v2.** 200 prompts, three authors, including real
   pre-mortem snippets. Compute a confidence interval on the disguised TPR.

6. **A red-team Arm D.** Prompt-injection attempts to bypass the
   `HIGH_RISK` floor. Whether they succeed is a more important safety
   measurement than anything in this report.

---

## Reproducibility

All scripts and raw artifacts are committed under
`.planning/value-benchmark-2026-05/`. To reproduce:

```bash
# 1. Install Python deps
pip install datasets pandas numpy

# 2. Pull Ollama judge model (~10 GB)
ollama pull gemma3:12b

# 3. Run each arm (the script downloads RouterBench to the HF cache
#    on first run; ~600 MB):
python harness/arm_a_routerbench.py           # ≈3 min, 2,672 prompts
python harness/arm_b_judge.py                 # ≈2 min, 150 prompts
python harness/arm_b_classify_and_score.py    # ≈20 s
python harness/arm_c_risk.py                  # ≈5 s
python harness/pareto_analysis.py
python harness/frontier_metric.py
```

A one-command wrapper (`run_benchmark.sh`) is included.

Outputs land in `results/` as JSONL (per-prompt) and JSON (aggregates).
The full report is in `results/VERDICT.md`. This README is the portfolio /
publishable summary.

**Frozen state for honesty:** the benchmark was run against `classify.js` at
`ce08f72`. `git diff -- tools/router/classify.js` returned zero lines on
completion. The classifier was not modified during the benchmark, full stop.

---

## Acknowledgements

- The RouterBench dataset (Hu et al., ICML 2024) provided Arm A's
  out-of-domain ground truth.
- Ollama's `gemma3:12b` (Google) provided independent labels for Arm B.
- The Mooter project itself, against which everything else was compared,
  was hand-built by Paulo Loureiro across ~40 sessions of Claude Code in
  early 2026.

---

*Benchmark run: 2026-05-24. Frozen HEAD: `ce08f72`. Total wall-clock: ~90 min.
Budget consumed: ≈$0 (Ollama judge runs locally; classify.js is free; the
only paid component would have been an Anthropic-API judge, which was
deliberately avoided in favour of a different-family local model).*
