# Adaptive Quantization Advisor

> Wave 52 Phase 4. A **pure, offline calculator** that recommends which model
> quantization tag fits your VRAM + context. **Advisory only — it changes no
> routing and no model.**

## The honest limitation (read this first)

Ollama serves every model at a **fixed quantization baked into the model tag** —
`Q4_K_M` is the default for qwen3 / llama3 / most models. There is no runtime
"adaptive requantization": you cannot ask Ollama to serve the same tag at a
different precision per request.

So "adaptive quantization" in Mooter means exactly this and nothing more:

- Given your free VRAM, the model size, and the context length you want, the
  advisor **estimates which quant tag would fit** and tells you which one to
  `ollama pull` (e.g. `qwen2.5-coder:7b-instruct-q5_K_M`), or whether you should
  pick a **smaller model**.
- You act on the recommendation **manually**. Mooter does **not** switch quant
  levels, and `classify.js` (the router) is **untouched** — this is not a routing
  feature.

This honesty is deliberate (doctrine V4: *honest > forced*). The advisor never
claims a capability the stack doesn't have.

## What it is

`tools/router/quant-advisor.js` — a dependency-light CommonJS module + CLI. It
reuses the project's quantization SSoT (`tools/router/quantization.js` →
`QUANT_INFO`) so size/quality figures stay consistent with the statusline chip.

It performs **no** Ollama spawn, **no** network call, and reads no live hardware
— you pass VRAM and model size in. It is a calculator, not a probe.

## Usage

```bash
# Recommend a tag for 24 GB VRAM, a 7.6B model, 8k context
node tools/router/quant-advisor.js --vram 24576 --params 7.6b --ctx 8192

# JSON output (for tooling)
node tools/router/quant-advisor.js --vram 8192 --params 13b --json

# Self-test (calibration assertions)
node tools/router/quant-advisor.js --self-test
```

Example (24 GB / 7.6B / 8k):

```
recommended: Q4_K_M  (best-fitting: FP16)
action:      Ollama default (Q4_K_M) fits — pull nothing, you're set.
budget:      20890 MiB · weights ~4668 MiB + KV ~934 MiB
fits:        FP16 Q8_0 Q6_K Q5_K_M Q4_K_M Q4_0 Q3_K_M Q2_K
```

The most common honest answer is **"the default already fits — pull nothing."**
The advisor only tells you to pull a different tag when `Q4_K_M` is too big
(→ a smaller quant or model) or when you have spare VRAM (→ a higher quant, with
the caveat that gains above `Q4_K_M` are typically <1%).

## API

| Function | Returns |
|---|---|
| `recommendQuant({vramMb, paramsB, contextTokens?, headroomPct?, kvQuantBits?, qualityFloor?})` | `{fits, defaultFits, recommended, best, action, budgetMb, fits_list, breakdown, note}` |
| `maxModelParamsB({vramMb, quant?, contextTokens?, headroomPct?, kvQuantBits?})` | largest model (billions of params) that fits, floored |
| `estimateWeightsMb(paramsB, quant)` | weight VRAM (MiB) |
| `estimateKvCacheMb(contextTokens, paramsB, kvQuantBits?)` | KV-cache VRAM (MiB) |
| `estimateTotalVramMb(paramsB, quant, contextTokens, kvQuantBits?)` | weights + KV (MiB) |

`recommended` is the **sweet spot**: the smallest-VRAM quant whose quality meets
the floor (default 99%, i.e. `Q4_K_M`). `best` is the highest-quality quant that
fits. They differ only when you have lots of headroom.

## The estimate (and why it's first-order)

```
weightsMb = paramsB × FP16_MB_PER_B × (size_pct_vs_fp16 / 100) × WEIGHT_OVERHEAD
kvCacheMb = contextTokens × paramsB × KV_COEFF_FP16 × (kvQuantBits / 16)
budgetMb  = vramMb × (1 − headroomPct / 100)
```

| Constant | Value | Source / calibration |
|---|---|---|
| `FP16_MB_PER_B` | 1907.35 | 1e9 params × 2 bytes ÷ 1024² (exact) |
| `size_pct_vs_fp16` | per-quant | `QUANT_INFO` in `quantization.js` (Ollama docs + llama.cpp community, conservative) |
| `WEIGHT_OVERHEAD` | 1.15 | GGUF metadata + FP16-kept embedding/output layers. Calibrated so qwen2.5-coder:7.6b Q4_K_M ≈ 4.7 GB (matches `pool.ts` `PER_WORKER_VRAM_MB` ≈ 5.2 GB with a small KV cache) |
| `KV_COEFF_FP16` | 0.015 MiB/token/B | Calibrated to GQA-modern models (qwen2.5-7b @ 8k ≈ 0.9 GB) |
| `DEFAULT_HEADROOM_PCT` | 15 | activations / framework overhead / fragmentation |

**Why first-order (the disclaimer in code and output):**

- KV-cache scaling by param-count is an approximation. Models with **grouped-query
  attention** (qwen2.5, llama3) use far less KV than older **multi-head** models —
  legacy MHA models can use **4–8× more** KV than this estimate. Pass
  `kvQuantBits: 3` to model a TurboQuant 3-bit KV cache (see
  `packages/turboquant-backend/`).
- Weight overhead varies by tokenizer/vocab size and how many layers a given GGUF
  keeps at higher precision.
- Real VRAM also depends on batch size and the serving framework.

Keep the 15% headroom (or raise it). The advisor rounds the inverse
(`maxModelParamsB`) **down** to stay on the safe side.

## What this does NOT do

- ❌ Does not change `classify.js` or any routing decision.
- ❌ Does not requantize, re-pull, or switch models — it prints advice.
- ❌ Does not probe live hardware or call Ollama (pass values in).
- ❌ Is not wired as a `mooter` CLI subcommand (kept standalone to avoid touching
  `packages/cli/src/index.ts`); invoke it directly with `node`.

## Hardware tiers (reference)

`HW_TIER_VRAM_MB` mirrors `classifyHwTier()` in
`packages/cli/src/commands/env-detect.ts` (kept in sync by hand):

| Tier | VRAM ≥ |
|---|---|
| `gpu-high` | 20480 MiB |
| `gpu-mid` | 8192 MiB |
| `gpu-low` | 4096 MiB |
