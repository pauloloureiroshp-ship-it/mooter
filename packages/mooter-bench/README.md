# MooterBench

An **open, standalone, reproducible** routing benchmark for the
[Mooter](https://mooter.ai) local-first LLM router.

MooterBench is inspired by Anthropic's
[Bloom](https://www.anthropic.com/research/bloom), an open-source behavioral
evaluation framework. We mirror its spirit, not its code: **open methodology,
reproducible runs, honest metrics** — including the parts that don't flatter us.

License: Apache-2.0.

## What it measures

MooterBench feeds 50 representative coding workflows (the open dataset in
[`dataset/workflows.json`](dataset/workflows.json)) to the **real** Mooter
classifier (`tools/router/classify.js`, run read-only, never modified) and
reports:

| Metric | Definition |
|---|---|
| **Routing accuracy** | `correct / 50`, where *correct* means the classifier's `tier` equals the dataset's `expected_tier` gold label. Invalid decisions count as incorrect. |
| **Per-category accuracy** | Same, partitioned by the 15 workflow categories. |
| **Confusion matrix** | Rows = expected tier (T0–T3), columns = predicted tier, plus `other` (a tier outside T0–T3) and `invalid` (no parseable decision). |
| **Completion rate** | Fraction of classifier invocations that returned valid JSON containing a `tier` field. |
| **Estimated cost savings** | Estimated USD cost of routed execution vs an all-T3 (Opus) baseline, using an assumed token profile of 2,000 input + 600 output tokens per workflow and 2026-06 Anthropic **list prices** (USD per Mtok in/out): Opus $5/$25 · Sonnet $3/$15 · Haiku $1/$5 · local Ollama $0. Failed decisions are costed as T3 (conservative). |

The tier doctrine behind the gold labels: **T0** trivial edits / summarization /
format transforms (local, $0) · **T1** cheap codegen and triage (Haiku) ·
**T2** reasoning, bug hunts, comparisons (Sonnet) · **T3** architecture,
multi-file refactors, pre-merge gates, CI/security (Opus).

No network calls are made: `classify.js` is a local, deterministic
regex/heuristic classifier, so a run is fully reproducible for a given
classifier sha.

## Run it locally

From this directory, inside the Mooter repo:

```bash
npm install --no-audit
npm run bench            # human-readable table
npm run bench -- --json  # machine-readable JSON (includes raw predictions)
npm test                 # dataset schema + scoring + pricing tests
```

To benchmark a different classifier build:

```bash
npx tsx src/run.ts --classifier /path/to/classify.js
```

## Run it in Docker

From the **repo root** (the image needs `tools/router/classify.js`):

```bash
docker build -f packages/mooter-bench/Dockerfile -t mooter-bench .
docker run --rm mooter-bench
docker run --rm mooter-bench --json
```

## Reference results

Real run, **2026-06-10**, classifier sha256
`427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
(dataset v0.1.0, N=50):

- **Routing accuracy: 30/50 = 60.0%**
- **Completion rate: 50/50 = 100.0%**
- **Estimated savings vs all-T3: 62.4%** ($1.2500 → $0.4700, list prices, assumed token profile)

Confusion matrix (rows = expected, cols = predicted):

|       | T0 | T1 | T2 | T3 | other | invalid |
|-------|----|----|----|----|-------|---------|
| **T0** | 12 |  2 |  1 |  0 | 0 | 0 |
| **T1** |  4 |  6 |  1 |  1 | 0 | 0 |
| **T2** |  3 |  0 |  5 |  5 | 0 | 0 |
| **T3** |  3 |  0 |  0 |  7 | 0 | 0 |

Notable, honestly reported: 3 workflows we label T3 (multi-file refactors)
were routed down to T0, and 5 T2 bug hunts were routed up to T3. The
fast-path classifier is regex/heuristic by design — these misses are exactly
what the benchmark exists to surface.

## Limitations (read this before quoting numbers)

- **Gold labels are author judgment.** `expected_tier` encodes the Mooter
  routing doctrine as interpreted by the dataset authors. Reasonable people
  can disagree on individual labels; they are not objective ground truth.
- **N=50.** This is a small, hand-curated set. Accuracy on this set is not
  real-world accuracy, and per-category numbers (some categories have 1–3
  entries) carry large uncertainty.
- **Savings are estimates, not billing.** The cost figures come from
  published 2026-06 list prices and a fixed assumed token profile
  (2,000 in / 600 out per workflow). Real workloads have different token
  shapes, caching, and retries. No measured invoices back these numbers.
- **Prompt-only classification.** The benchmark exercises the fast-path
  classifier on the prompt string alone. The full Mooter runtime adds
  arbiter escalation, user overrides, safety floors, and session context
  that can correct fast-path misses — none of that is measured here.
- **English-only prompts.** The dataset is English; the classifier also
  handles PT-PT in production, which is untested here.

## Dataset

50 workflows across 15 categories (`trivial-edit`, `summarize`, `commit-msg`,
`explain-error`, `test-gen`, `bug-investigation`, `refactor-multi-file`,
`architecture`, `pre-merge-review`, `format-transform`, `docs`, `regex`,
`dependency`, `ci-config`, `security`), distributed 15×T0 / 12×T1 / 13×T2 /
10×T3. Every entry carries a one-line `rationale` for its label so you can
audit — and dispute — each one.

Contributions of better prompts, disputed labels, or larger datasets are
welcome; the schema is validated in `tests/dataset.test.ts`.
