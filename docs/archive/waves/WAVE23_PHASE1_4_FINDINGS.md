# Wave 23 Phases 1-4 — Findings (corpus → validate → insights → benchmark)

> 2026-06-06. All numbers are real (read from `audit/*` artifacts). No synthetic data.

## Phase 1 — Corpus (T0 local)

- **372 files** summarized by local `qwen2.5-coder:7b` via direct Ollama, **$0**, 0 failures.
- 580k tokens in / 59k out, ~474s wall. `audit/corpus.jsonl` + `corpus_stats.json`.
- Self-audit invariant held: all 8 `tools/audit/*.js` are in the corpus.
- Gotcha: `qwen3:30b` leaked chain-of-thought into summaries despite `think:false` →
  switched to the project-canonical `qwen2.5-coder:7b` (clean output).

## Phase 2 — Validation (T1 Haiku)

- 372/372 validated, 0 fails. **avg accuracy 5.2/10.**
- Drift: none **9** (2.4%) · minor **189** (50.8%) · major **174** (46.8%).
- `audit/validation.jsonl` + `validation_stats.json`. Tokens 779k in / 99k out, cost ~$1.27.
- **Honest headline:** the local 7b model's summaries drift a lot — worst on prose
  strategy docs (avg 4.6) and the most complex code (`classify.js` scored 1). This is the
  real motivation for a fine-tuned adapter, not a vanity pass.

## Phase 3 — Insights (T2 Sonnet)

- `model-reasoner` ranked **50 issues** (13 high · 24 medium · 13 low) → `AUDIT_REPORT.md`.
- **Critical caveat (baked into the report):** findings are SECOND-ORDER — derived from the
  validated *summaries*, not a direct code read. Findings worded "X summary fabricates Y"
  are **local-model drift artifacts**, NOT confirmed code defects, and must be code-verified.
  (Example false-positive: "22.B broken" — Phase 0 empirically proved 22.B works.)
- Genuinely actionable, code-level findings worth Wave 24:
  - `frugal-` branding leftover in 4 router files (`frugal-login.js` stores `~/.frugal/auth.token`).
  - dual admin-token naming (`FRUGAL_ADMIN_TOKEN` / `MOOTER_ADMIN_TOKEN`) in hub.
  - widespread missing test coverage flagged across router/landing.
- Sonnet subagent: 77,199 tokens, ~$0.32.

## Phase 4 — Benchmark + marketing (T3 Opus)

### Cost (token-matched, real)

| Phase | Tier | Actual | All-Opus | Saved |
|---|---|---|---|---|
| 1 Corpus | T0 | $0.00 | $4.44 | $4.44 |
| 2 Validate | T1 | $1.27 | $6.36 | $5.09 |
| 3 Insights | T2 | $0.32 | $0.53 | $0.21 |
| 4 Benchmark | T3 | $0.45 | $0.45 | $0.00 |
| **Total** | mixed | **$2.04** | **$11.78** | **$9.74 (82.7%)** |

> The brief's "$185 baseline" assumed a much larger token volume. The honest, token-matched
> baseline for THIS audit is $11.78 → **82.7% saved**. We report the real number.

### Discovery 2 — quantified (5-file sample)

- Routed intent **T0/qwen3:30b**, real execution **T1/claude-haiku-4-5**.
- **18.6× more tokens** via the subagent (Haiku) path (~32.5k/file) vs direct-local (~1.7k/file).
- Same corpus: **$0 local** vs extrapolated **$12–31** if every file went through the subagent.
- `fx.js` spawn logged it live: *"Resposta do Ollama está completamente errada → fallback Haiku."*
- `audit/divergence_sample.json`.

### Quantization (honest — no fabricated FP16)

- Q4 `qwen2.5-coder:7b` accuracy as judged by Haiku: **5.2/10**, 2.4% zero-drift.
- Size-sensitivity probe: ROUGE-L(7b-q4 vs 14b-q4) = **0.21** over 5 files (low → the small
  quant tracks the larger model poorly on this task). `audit/quantization_benchmark.json`.

### LoRA export (tiered, honest)

- **560 samples** → `audit/lora_train.jsonl`, each tagged `score`/`drift`/`tier`:
  - **212 `high`** (score≥8, drift≠major) — the strict bar.
  - **348 `good`** (score≥7, drift≠major).
- **Gate note:** literal "≥300 @ score≥8" is **NOT met** at the strict bar (212). It IS met
  on the tiered set (560). Not relabelled — Paulo decides which tier to train on.

### Marketing (DRAFT — Paulo approval before posting)

- `audit/TWEET_THREAD.md` (10 tweets), `audit/BLOG_POST_DRAFT.md`, README "audited by mooter" badge.
