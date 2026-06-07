# Speculative Decoding — integration note (roadmap)

**Status:** 📐 roadmap / docs-only (Wave 29 Phase 29.F). Real implementation lands in **Wave 33** via vLLM. No code ships in Wave 29.

> This note explains where speculative decoding fits Mooter's local-inference story and what we'll measure before enabling it. It deliberately contains **no benchmark claims as fact** — those come from the Wave 33 benchmark (see `audit/SPECULATIVE_BENCHMARK_STUB.md`).

## What it is

Speculative decoding speeds up autoregressive generation by letting a small, cheap **draft model** propose several tokens ahead, which the large **target model** then verifies in a single forward pass. Accepted tokens are kept; the first rejected token resets the speculation window. Output is **mathematically identical** to running the target model alone (same sampling distribution) — it is a latency optimisation, not a quality trade-off.

Key terms:
- **Draft model** — small model (e.g. a 0.5B–3B) that generates candidate tokens fast.
- **Target model** — the model whose output we want (e.g. qwen3:30b).
- **Acceptance rate** — fraction of drafted tokens the target accepts; the higher, the bigger the speedup.

## Why it matters for Mooter

Mooter routes a large share of T0/T1 work to **FREE local Ollama models**. Local inference is latency-bound on consumer hardware, so anything that raises tokens/sec without changing output quality directly improves the local tier's usefulness — and widens the gap where local beats paying for cloud.

It composes with the other Wave 29 cost layers:
- **L12 LLMLingua** cuts *input* tokens.
- **Caveman pack** cuts *output* tokens.
- **Speculative decoding** cuts *output latency* (same tokens, faster).
- **L13 LoRA hot-swap** (Wave 31) specialises the target without growing it.

These are multiplicative on the local path, not redundant.

## Where it would plug in

- **Backend:** vLLM (`--speculative-model`, ngram/EAGLE/Medusa methods) or llama.cpp speculative support. Ollama does not expose speculative decoding today, so the Wave 33 work introduces an **optional vLLM serving path** behind the existing local-runtime abstraction.
- **Draft/target pairing:** pick a draft model from the same family as the target where possible (tokenizer + distribution alignment → higher acceptance). Candidate pairs to benchmark: `qwen2.5:0.5b → qwen2.5-coder:7b`, `qwen2.5:3b → qwen3:30b`.
- **Routing:** purely a *serving* concern. classify.js and the tier decision are untouched — speculative decoding only changes *how* the chosen local model is served.

## Honest caveats

- Speedup is **hardware- and workload-dependent**. Low acceptance (mismatched draft/target, high-entropy prompts) can make it net-neutral or slightly negative due to draft overhead.
- It needs a serving stack beyond Ollama (vLLM) — an install/ops cost we will not impose by default; it stays opt-in for power users.
- Memory: hosting draft + target simultaneously raises VRAM pressure; the Setup Intelligence layer (L14) must gate the recommendation on detected VRAM.

## Roadmap

| Wave | Deliverable |
|---|---|
| 29 (this) | This note + benchmark plan stub. No code. |
| 33 | Optional vLLM serving path + draft/target config + measured speedups behind a flag; Setup Intelligence recommends it only when VRAM headroom allows. |

## Sources to ground the Wave 33 work
- vLLM speculative decoding docs (vllm.ai).
- "Fast Inference from Transformers via Speculative Decoding" (Leviathan et al., 2022).
- EAGLE / Medusa speculative-head methods (papers + reference impls).
- llama.cpp speculative decoding support notes.

Verify all numbers against the Wave 33 benchmark before publishing any speedup figure.
