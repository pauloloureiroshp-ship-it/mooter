# Mooter Value Benchmark — Methodology & Provenance

**Created**: 2026-05-24
**Purpose**: Independent, adversarial benchmark of `tools/router/classify.js` against trivial baselines and RouterBench's cost-quality frontier. Answers the engineering question "does the Mooter classifier route prompts to cheaper tiers better than trivial baselines?" — NOT the business question "is Mooter a viable product".

## Frozen state

- Repo HEAD: `ce08f72c5b6641f8fa209aab74d3da121ed422b0`
- `tools/router/classify.js`: working tree clean at benchmark start (verified with `git status --short`)
- `tools/router/tuning-state.json`: **NOT present** — defaults loaded from `tuning-state.defaults.json` (no live tuning drift on top)
- `classify.js` algorithm version (from runtime probe): `v0.10.x-ce08f72`
- Benchmark must end with `git diff -- tools/router/classify.js` == empty. **Zero refinement of the classifier.**

## Researcher choices (documented for reproducibility)

### Judge selection
- **Chosen**: Ollama `gemma3:12b` (Google family — distinct from Claude/Anthropic family used by Mooter to construct its tuning corpus)
- **Why**: §4.3 of master prompt requires judge from a different family than the system under test to reduce shared priors. Anthropic API key absent → can't use Haiku. Gemma 3 is a strong-enough open-weights model with no kinship to Anthropic's training data or to the Mooter author. Sensitivity check: spot-check on 20 Arm-B prompts with a second Ollama model (qwen3:30b) if time permits.
- **Trade-off**: Gemma is generally weaker than frontier models. We accept higher label noise in exchange for independence; mitigated with a strict rubric in the judge prompt and spot-checks.

### RouterBench tier→model mapping
- **Will document after dataset inspection**: pick 4 rungs from the ~11 models in the dataset ordered by average quality. Map T0→weakest, T3→strongest. Document the explicit choice, then run a sensitivity check with a different mapping (e.g. skip-rungs) and report whether the verdict changes.

### Sampling
- If the full RouterBench dataset (≈405k inference outcomes) is too slow to score, take a stratified subsample of 3–5k prompts. Document seed and stratification axes.
- Arm B target: 120–150 prompts spanning T0→T3 spectrum.

## Anti-contamination constraints

- Arm B prompts MUST NOT come from: `tools/router/validation-set.json`, `tools/router/validation-set-sample-historical.js`, anything under `.planning/`, `decisions.log`, or any file referenced as tuning corpus.
- Arm B prompts are written in English (the Mooter validation corpus is heavily PT-PT). Different language surface area reduces accidental overlap with the tuning regex bank.
- After Arm B prompt set is built, run a similarity check: any prompt with edit distance < 10 from any validation-set entry is discarded.

## Tier semantics (from `CLAUDE.md` / `ROUTING.md`)

| Tier | Meaning | Mooter expects routing to |
|---|---|---|
| T0 | Trivial / mechanical / single-shot / local-feasible | Ollama (small model) |
| T1 | Mechanical with mild complexity (commit msg, simple regex, single-file fix) | Haiku |
| T2 | Bug investigation, comparison, root cause, multi-file plan | Sonnet |
| T3 | Architecture, multi-file refactor, prod/CI/migration risk, pre-merge gates | Opus |

Note: the Mooter has a `HIGH_RISK` floor that forces T3 regardless of complexity. **This benchmark measures cost-quality only**; the risk-floor dimension is out of scope and reported as a known limitation, not a defect.

## Baselines (mandatory, both arms)

| Baseline | Description |
|---|---|
| always-T3 | Quality ceiling, cost ceiling |
| always-T0 | Cost floor, quality floor |
| random | Uniform tier sampling, averaged over 5 seeds |
| length-heuristic | <80 chars → T0, <200 → T1, <500 → T2, else → T3 |
| 10-line classifier | Length + risk-keyword count (env, deploy, migration, prod, secret) |
| oracle | Per-prompt optimum (RouterBench: cheapest model with quality ≥ best; Arm B: judge label) |

## Output artifacts

- `data/routerbench-prompts.parquet` — sampled Arm A prompts + per-model quality/cost
- `data/coding-fresh-prompts.jsonl` — Arm B prompts + judge labels
- `results/classify-decisions.jsonl` — Mooter `classify.js` output per prompt (both arms)
- `results/baselines.jsonl` — every baseline's tier per prompt
- `results/metrics.json` — aggregated metrics + per-baseline rows
- `results/VERDICT.md` — final report (scorecard §6 of master prompt)

## Honesty clauses

- A `DOMINATED` verdict (some trivial baseline beats Mooter on both cost and quality) is a valid, useful outcome. We will state it plainly if found.
- A `MARGINAL` verdict (Mooter beats trivial baselines but falls short of literature frontier) is also acceptable. Same.
- We separate **what the benchmark measured** (cost-quality routing on these datasets) from **the strategic question** (whether Mooter has product value). The latter requires market analysis out of scope here.
