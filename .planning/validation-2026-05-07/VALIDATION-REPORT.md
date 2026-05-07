# Mooter Routing Strategy — Validation Report

**Date:** 2026-05-07
**Session ID:** `4d966b21-aca9-4820-84cd-91757c24985e`
**Branch:** `main` @ `2b7a9fe` (Codex Integration v0.11)
**Wall clock:** ~80 minutes
**Cost:** $0.164 (Anthropic) + 4 Codex msgs + $0.028 (judge) = **$0.192 total**

---

## 1. TL;DR — Verdict

> ## ⚠️ PATCH BEFORE WAVE-2
>
> The strategy itself is **directionally correct** — production /metrics shows 73.7 % real-cost savings over 859 prompts and the budget caps held. But on this 60-prompt validation corpus the classifier is **mis-calibrated and over-routes**, and three infrastructure bugs make the advisor ship recommendations that the executor cannot honor. Wave-2 (`router-execute.js`) on top of these errors would amplify them at scale.

**Top three blockers** (must fix before Wave-2):

1. **Calibration broken** — bin 0.8-1.0 has 75 % real accuracy where acceptance demands ≥95 %. The router *auto-deceives* on prompts it claims to be sure about.
2. **Overrouting confirmed** — in 4/4 horizontal-matrix prompts, **Haiku scored ≥ Opus**; in `prompt-053` (T2) Opus and Ollama tied at 45/100 while Haiku reached 72. Wave-2 would burn money on this.
3. **Operational bugs that hide quality** — `OPENAI_API_KEY` malformed (`sk-sk-proj-…`), `ollama_call.sh` ships a broken `--model` flag, and `classify.js` runs an unguarded IIFE on every `require()`. None of these reach automated tests.

**Tier accuracy:** 77.5 % (target ≥85 %, hard-fail floor was 70 %, so we *pass* the floor and *miss* the target).

---

## 2. Coverage achieved

| Dimension | Planned | Actual | Notes |
|---|---|---|---|
| Test corpus | 60 prompts | 60 prompts | 30 from validation-set, 20 from decisions.log (sanitized + deduped), 10 handcrafted multilingual (5 PT + 5 EN). |
| Accuracy subset | ground-truth labelled | 40 prompts | 20 log-sourced have only previous-prediction; excluded from accuracy math by design. |
| Provider invocation primary | 30 prompts | 24 invocations + 4 OpenAI skipped | OpenAI skipped due to malformed key (DEV-005); Codex picked 4 from corpus, 1 returned null. |
| Horizontal matrix | 5 prompts × ≥3 models | 4 prompts × 6 models | Handcrafted T0/T1/T2/T3 + code-gen, but T1 picks collided so 4 unique. |
| Quality grading | all OK responses | 35 of 35 successful | 13 invocations had empty text or were skipped. |
| Heuristics | 8 | 8 + 3 bonus runtime observations | All 8 evaluated (some with zero hits — H2, H5, H6 had no matches). |
| `/metrics` reconcile | drift ≤5 % | delta = $0 | Validation runner uses fetch directly, never POSTs to savings-tracker — perfect isolation, but reconcile target is moot since the runner contributes zero. See §6. |
| Notion sub-page | yes | **pending** | Will be created at end of session. |
| SYNC.md update | yes | **pending** | Will be appended at end of session. |

**Effective matrix coverage:** ~80 % of planned cells, with deviations documented in `inventory.json`.

---

## 3. Tier accuracy (Layer A)

```
Overall:  77.5 %   (31 / 40)
Target:   ≥85 %    → FAIL
HardFail: ≥70 %    → PASS
```

**Per-tier:**

| Tier | Correct/Total | Acc | Trend |
|---|---|---|---|
| T0 | 8 / 11 | 73 % | Three trivials over-routed to T1 (rename / format) |
| T1 | 8 / 10 | 80 % | Two short explanations under-routed to T0 |
| T2 | 6 / 9 | 67 % | Two reasoning prompts over-promoted to T3 by ARCH_SIGNALS |
| T3 | 9 / 10 | 90 % | One T3 architecture prompt collapsed to T0 (looked like a header listing) |

**Confusion matrix** (rows = ground truth, cols = predicted):

```
        T0    T1    T2    T3
  T0     8     3     0     0      ← 3 over-routes to T1 (rename/format)
  T1     2     8     0     0      ← 2 under-routes to T0
  T2     1     0     6     2      ← 2 over-promotes to T3 (ARCH_SIGNALS)
  T3     1     0     0     9      ← 1 collapse to T0 (header-list look)
```

**Calibration curve** — the most damning chart in this report:

| Confidence bin | Count | Correct | Real accuracy | Acceptance target |
|---|---|---|---|---|
| 0.00 – 0.40 | 0 | 0 | n/a | — |
| 0.40 – 0.60 | 0 | 0 | n/a | — |
| 0.60 – 0.80 | 12 | 10 | **83 %** | OK for this band |
| **0.80 – 1.00** | **28** | **21** | **75 %** | **≥95 % required → FAIL** |

> The classifier's "I'm sure" is wrong 1 in 4 times. Wave-2 (`router-execute.js`) cannot rely on `confidence >= 0.8` as a safe threshold to execute without reflection.

**Category accuracy** (over labelled subset with `expected_category`): 50 % (20 / 40).

**Per-language:** English 80 % (16 / 20), Portuguese 75 % (15 / 20). Acceptable parity.

**Top mis-classifications** (full list in `accuracy-report.json → wrong_predictions`):

```
prompt-005  expected=T0 predicted=T1 conf=0.85  rename variable userId to accountId in auth.ts
prompt-056  expected=T0 predicted=T1 conf=0.85  rename the variable counter to attemptCount in retry.ts
prompt-060  expected=T0 predicted=T1 conf=0.85  format this JSON file with 2-space indentation
prompt-019  expected=T2 predicted=T3 conf=0.75  não uses opus, refactor this entire module to…
prompt-058  expected=T2 predicted=T3 conf=0.75  compare these two refactor approaches…
prompt-026  expected=T3 predicted=T0 conf=0.80  Projecto: frugal — Vibe Coder Intelligence Platform Repo: …
```

The "rename / format" cluster is the simplest fix: tighten the T0 trivial detector with explicit `rename|format` triggers that promote at high confidence to T0, not T1.

---

## 4. Provider accuracy (Layer B)

**Latencies** (full distribution in `latency-stats.json`):

| Provider | n | p50 | p95 | min | max |
|---|---|---|---|---|---|
| Haiku | 8 | **3.6 s** | 4.6 s | 1.0 s | 4.6 s |
| Sonnet | 8 | 7.0 s | 9.3 s | 3.6 s | 9.3 s |
| Opus | 10 | 9.6 s | 11.4 s | 4.8 s | 11.4 s |
| Ollama | 14 | 9.8 s | 15.3 s | 2.6 s | 15.3 s |
| Codex CLI | 3 | **23.5 s** | 31.7 s | 9.0 s | 31.7 s |

> **Speed ranking:** Haiku < Sonnet ≈ Opus < Ollama < Codex.
> Haiku is **2.6× faster than Opus** at p50; Codex is **6.5× slower** than Opus.

**Success rate:**

| Provider | OK | Fail | Skip | Notes |
|---|---|---|---|---|
| Ollama | 14 | 0 | 0 | 100 % |
| Anthropic (Haiku/Sonnet/Opus) | 26 | 0 | 0 | 100 % |
| Codex CLI | 3 | 1 | 0 | 75 % — `prompt-021` returned null silently |
| OpenAI direct | 0 | 0 | 4 | malformed key → all skipped |

**Top model by latency-quality product:** Haiku (~3.6 s, mean score 76 in horizontal). Best per-dollar.
**Worst model:** Ollama qwen3:30b (mean score 23.5 in horizontal, 14 s p50).

---

## 5. Quality scores (Layer C)

**Mean Haiku-judge score by provider:**

| Provider | n | Mean | Comment |
|---|---|---|---|
| Sonnet | 8 | **69.8** | Highest mean across providers |
| Codex CLI | 3 | 69.3 | Strong on code/tasks where it succeeded |
| Haiku | 8 | 66.3 | Strong relative to its cost |
| Opus | 10 | **60.8** | **Lower than Sonnet & Haiku — overrouting signal** |
| Ollama | 6 | 43.5 | Acceptable for trivials, weak on reasoning |

**By tier (recommended by classifier):**

| Recommended tier | n | Mean score |
|---|---|---|
| T0 | 7 | 54.1 |
| T1 | 8 | **71.6** |
| T2 | 10 | 60.5 |
| T3 | 10 | 60.8 |

> T1 prompts route to Haiku and that maps to the best mean score in the corpus.
> T3 prompts route to Opus and that scores **lower** than T1 routes — a structural sign that Opus prompts are also more ambiguous, but still: paying 10× for ~the same score is not a good trade.

**Horizontal matrix winners (by prompt):**

| Prompt | Best (score) | Worst (score) | Cheapest model that ties best |
|---|---|---|---|
| `prompt-051` (T0 trivial) | Haiku & Sonnet (75) | Ollama qwen2.5:3b (35) | **Haiku** |
| `prompt-052` (T1 transform) | **Haiku (85)** | Ollama qwen2.5:3b (72) | **Haiku** (beats Opus 82) |
| `prompt-053` (T2 reasoning) | Haiku & Sonnet (72) | Opus & Ollama (45 tied) | **Haiku** |
| `prompt-054` (T3 architecture) | Haiku/Sonnet/Opus (72 tied) | Ollama qwen2.5:3b (62) | **Haiku** |

> **Haiku is the per-dollar winner on every single horizontal prompt**, including the T3 architecture one. That doesn't mean route everything to Haiku — it means the classifier is currently routing to Opus for prompts where Haiku does the same job. Wave-2 must not bake this in.

---

## 6. Savings math (Layer D)

**Validation-session math** (43 successful invocations with token data; Codex 3 calls counted separately):

| Metric | Value |
|---|---|
| Total tokens in / out | 1 042 / 16 069 |
| Naive cost (all-Opus baseline) | **$0.4069** |
| Mooter actual cost | **$0.1635** |
| Saved | $0.2434 |
| **Savings %** | **59.8 %** |
| Codex calls | 3 (subscription, no $ math) |

**By provider** (saving = Opus baseline minus actual):

| Provider | n | Naive ($) | Actual ($) | Saved ($) | Saved % |
|---|---|---|---|---|---|
| Ollama | 14 | 0.1545 | 0 | 0.1545 | 100 % |
| Haiku | 8 | 0.0705 | 0.0141 | 0.0564 | 80 % |
| Sonnet | 8 | 0.0813 | 0.0488 | 0.0325 | 40 % |
| Opus | 10 | 0.1007 | 0.1007 | 0 | 0 % |
| Codex | 3 | n/a | n/a | subscription |

**Projection** (linear, assuming corpus distribution holds):

```
$0.0057 saved per call
$5.66   saved per 1 000 calls
$84.92  saved per month at 500 calls/day
```

**Reconciliation vs `/metrics` (`http://127.0.0.1:7821/metrics`):**

| Metric | Pre-validation | Post-validation | Delta |
|---|---|---|---|
| prompts | 859 | 859 | 0 |
| real_cost | $19.5441 | $19.5441 | $0 |
| naive_cost | $74.1829 | $74.1829 | $0 |
| saved | $54.6388 | $54.6388 | $0 |
| saved_pct | 73.7 % | 73.7 % | 0 |

> Delta = $0 confirms **perfect isolation** — the validation runner used direct `fetch` to providers and never POSTed to the savings-tracker, so production telemetry is uncontaminated. The acceptance target "drift ≤ 5 %" is satisfied trivially.
>
> A second-order observation: the *production* per-call savings ($0.064) is 11× the *corpus* per-call savings ($0.006). This is **distribution shift**, not drift — production prompts run with much higher max-token budgets and more multi-turn back-and-forth than this corpus's max-tokens=512 cap. Project monthly savings using the production figure, not the corpus figure.

**Provider state at session end:**
```json
{ "claude": "degraded", "ollama": "ok", "gemini": "off", "gpt": "ok" }
```
"degraded" claude is the trigger for **finding H3** below — when Anthropic is degraded the classifier still suggests `[sonnet]` with no fallback.

---

## 7. Loophole catalogue

**14 findings — S0:3 S1:9 S2:2.** Full markdown in `loopholes.md`.

### Severity 0 — strategy is auto-deceiving

| ID | Repro | Impact |
|---|---|---|
| **H1 ×3** | `rename variable …`, `format this JSON …` predicted T1 with conf 0.85 instead of T0 | Calibration broken on the simplest cases. Every `rename` instruction hits this. |

Fix: extend `TUNED_PROMOTE_T0` (`tools/router/classify.js`) to recognise `rename`, `format`, and similar single-action verbs as T0 trivial unambiguously.

### Severity 1 — cost waste / operational bugs

| ID | Repro | Impact |
|---|---|---|
| **H4 ×6** | Paid Anthropic call where judge scored <60 | Money spent on bad answers. Each ~$0.001 – $0.013. At scale, real waste. |
| **H3 ×1** | Anthropic state = degraded, but `suggested_providers = ['sonnet']` only | When Anthropic is rate-limited/down, the advisor leaves no alternative. Wave-2 with executor will harden-fail. |
| **BONUS** | `tools/router/.env` has `OPENAI_API_KEY=sk-sk-proj-…` (duplicated `sk-`) | Every direct OpenAI call returns 401. Silently null-falls in `callOpenAI`. |
| **BONUS** | `tools/router/ollama_call.sh:40-48` — `$MODEL` shell-local, never exported to inline `node -e` | `--model qwen2.5:3b` is silently dropped, payload has `model:""`. Server replies `{"error":"model '' not found"}`. |

Fix priority: the two **BONUS** entries first — they take seconds and unblock the actual provider invocation pipeline.

### Severity 2 — directional concerns

| ID | Repro | Impact |
|---|---|---|
| **H8 ×1** | `prompt-053` horizontal: Opus=45, Ollama qwen2.5:3b=45, Haiku=72 — cheaper model ties Opus, even cheaper model beats both | ARCH_SIGNALS / quality_intent are too eager. Re-tune. |
| **BONUS** | `tools/router/classify.js:1228-1242` IIFE not gated by `require.main === module` | Every `require('./classify')` reads stdin and prints classification of empty prompt. Pollutes runner output, costs ~5 ms per import. |

### Heuristics with **zero hits** in this corpus

- **H2** (T2 code-gen + Codex available + suggested=sonnet) — codex_cli was actually preferred where applicable, this run.
- **H5** (beast on trivial prompt) — beast-mode was disabled (we ran in `/moo` from prompt 1 onward).
- **H6** (last-10 confidence < 0.5 silent drift) — last-10 mean was 0.78, healthy.
- **H7** (decisions.log vs /metrics math mismatch) — decisions.log = 886 classified, /metrics = 859 prompts + 27 system_prompts_filtered = 886 reconcilable.

---

## 8. Conclusion — concrete next steps

> **Verdict: ⚠️ PATCH BEFORE WAVE-2.** The strategy works in production aggregate, but at the prompt level the calibration is loose and three operational bugs hide quality from automated tests. Build Wave-2 only after the items below are green.

### Must-fix before `router-execute.js`

1. **Fix `tools/router/.env`** — strip the duplicated `sk-` from `OPENAI_API_KEY`. (Owner: Paulo. ~10 s.)
2. **Fix `tools/router/ollama_call.sh:40`** — change `PAYLOAD=$(node -e …)` to `PAYLOAD=$(MODEL="$MODEL" node -e …)`. Add a unit test that calls the wrapper with `--model qwen2.5:3b` and asserts the payload field equals `qwen2.5:3b`.
3. **Guard the IIFE in `tools/router/classify.js:1228`** — wrap with `if (require.main === module) { … }`. Add a test that does `require('./classify')` and asserts no stdout is produced.
4. **Re-tune T0 trivial detector** — `rename`, `format`, `change colour`, `move`, `replace … with …` should all promote to T0 with confidence ≥0.9. Re-run accuracy; target ≥85 % overall.
5. **Re-tune ARCH_SIGNALS** — they currently fire on `compare … approaches … recommend` (T2 prompts) and bump them to T3. Add a discriminator: if the prompt asks for *advice* without naming an existing system, stay at T2.

### Should-fix in Wave-2 itself

6. **Provider fallback chain** — when `metrics.providers.claude === 'degraded'`, prepend `codex_cli` (if available) or `ollama` to `suggested_providers` automatically. Add a unit test that mutates `metrics.providers.claude` and asserts the order changes.
7. **Calibration loop** — every 1 000 prompts, the backtest should report bin-0.8-1.0 accuracy and emit a warning if <90 %. This becomes the leading indicator for "router needs re-tuning".

### Nice-to-have (post-Wave-2)

8. **Add a 6th horizontal model** for matrix tests once the OpenAI key is fixed — gpt-4o, gpt-4o-mini, and o3 deserve their own column in the heatmap.
9. **Notion log + SYNC.md update** — at end of every validation session, append the verdict to the Notion HQ session log.

### Confidence in this verdict

The corpus is small (60 prompts, 40 with ground truth) and biased toward the canonical/adversarial cases the team already cares about. A 100-prompt random sample drawn from the next 2 weeks of `decisions.log` *with* human re-labelling would tighten the bound. **Don't ship Wave-2 against this report alone — re-run after fixes to confirm accuracy ≥85 % and calibration ≥95 % at the high-confidence bin.**

---

## Artefacts produced

```
.planning/validation-2026-05-07/
├── inventory.json                 — environment & deviations
├── validation-corpus.jsonl        — 60 prompts
├── corpus-stats.json              — distribution stats
├── accuracy-report.json           — Task #3 raw + aggregated
├── executions.jsonl               — Task #4 per-call records
├── budget-summary.json            — Task #4 budget consumption
├── quality-grades.jsonl           — Task #5 per-judgment records
├── quality-grades.json            — Task #5 aggregated
├── savings-math.json              — Task #6 cost math
├── metrics-snapshot-pre.json      — pre-validation /metrics state
├── metrics-snapshot-post.json     — post-validation /metrics state
├── latency-stats.json             — provider latency p50/p95
├── loopholes.json                 — Task #7 raw findings
├── loopholes.md                   — Task #7 catalogue
├── build-corpus.js                — Task #2 builder
├── run-routing-accuracy.js        — Task #3 runner
├── run-provider-invocation.js     — Task #4 runner
├── run-quality-grading.js         — Task #5 runner
├── run-loophole-detection.js      — Task #7 runner
└── VALIDATION-REPORT.md           — this file (Task #8)
```

---

## Final verdict line

```
⚠️ PATCH BEFORE WAVE-2
   Tier accuracy:        77.5 %  (target ≥85 %)        FAIL
   Calibration 0.8-1.0:  75 %    (target ≥95 %)        FAIL
   Hard fail floor:      77.5 %  (floor ≥70 %)         PASS
   Savings reconcile:    delta = $0                     PASS
   Loopholes found:      14 (S0:3, S1:9, S2:2)
   →  Fix items 1-3 (operational bugs) and 4-5 (re-tuning) before
      starting router-execute.js. Confirm ≥85 % accuracy and ≥95 %
      calibration on a re-run. Then green-light Wave-2.
```
