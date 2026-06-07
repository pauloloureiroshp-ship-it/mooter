# Speculative Decoding — benchmark plan (stub)

**Status:** 📐 stub (Wave 29 Phase 29.F). Executed in **Wave 33**. No numbers here are measured — this is the *plan* and the *hypotheses* we will test.

Companion: `docs/integrations/speculative-decoding.md`.

## Goal

Decide whether to ship an optional vLLM speculative-decoding serving path for Mooter's local tier, and if so, which draft/target pairs to recommend per hardware class. The bar: a **real, reproducible** tokens/sec gain on representative Mooter workloads with **zero output-quality change**.

## Hypotheses (to confirm or refute)

- **H1** — On a gpu-high box (≥20GB VRAM), `qwen2.5:3b → qwen3:30b` speculative serving yields a meaningful decode speedup on code/agentic prompts. *(Literature suggests roughly 1.5–2.5× on aligned pairs; treat as a hypothesis to measure, not a claim.)*
- **H2** — Acceptance rate is materially higher for low-entropy, code-heavy prompts (Mooter's T0/T1 majority) than for open-ended prose.
- **H3** — On gpu-mid (8–16GB), hosting draft + target together pushes VRAM past headroom, making the speedup uneconomic vs just running a smaller target. (→ Setup Intelligence should gate the recommendation.)
- **H4** — Output is bit-for-bit distribution-identical to target-only at temperature 0 (correctness guarantee holds in our stack).

## Method

1. **Workload set** — reuse `test/fixtures/` prompts + a sampled, anonymised slice of real tier-mix (T0/T1/T2) from local telemetry. Bucket by task category (code, prose, agentic) and prompt-length bucket.
2. **Conditions** — for each draft/target pair and hardware class:
   - baseline: target-only (Ollama and vLLM, to separate serving-stack effects from speculation).
   - speculative: vLLM with draft model, methods {ngram, EAGLE} where available.
3. **Metrics** — tokens/sec (decode), time-to-first-token, end-to-end latency, **acceptance rate**, peak VRAM, and an output-equality check (temperature 0 → assert identical token stream vs baseline).
4. **Repeats** — ≥5 runs per condition; report median + IQR, not a single number. Warm the model first (OLLAMA_KEEP_ALIVE / vLLM warmup) to exclude cold-start.

## Pairs to test

| Draft | Target | HW class |
|---|---|---|
| qwen2.5:0.5b | qwen2.5-coder:7b | gpu-mid / gpu-low |
| qwen2.5:3b | qwen3:30b | gpu-high / apple-silicon |
| gemma (small) | gemma3:12b | gpu-mid |

## Ship gate (Wave 33)

Recommend speculative serving for a hardware class **only if** all hold for that class:
- median decode speedup ≥ 1.4× on the code/agentic buckets, AND
- output-equality check passes at temperature 0, AND
- peak VRAM stays within the class's detected headroom (Setup Intelligence gate), AND
- net latency win survives draft overhead on short prompts (no regression on the T0 majority).

If a class fails the gate, **log the negative result** (no silent drop) and do not recommend it there.

## Out of scope (stub)
- No code, no vLLM dependency, no measured figures in Wave 29.
- Training custom draft heads (EAGLE fine-tunes) is a separate future investigation.
