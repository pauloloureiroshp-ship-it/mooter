# Token Efficiency Score (TES) — Spec

**Wave 58 (matrix engine).** Implementation: `packages/router/src/tes-calculator.ts`.
Tests: `packages/router/tests/tes-calculator.test.ts`.

## Purpose

TES is the per-cell number of the Wave 58 model × category matrix. For each
`(model, category)` it answers a single question:

> How much measured benchmark quality do I get per dollar of tokens spent?

A higher TES is strictly better — more capability for the same spend. It lets
the matrix rank models *within a category* on a value basis, not raw quality
(Opus may win quality everywhere but lose TES to Haiku where Haiku is "good
enough"). The 24 categories are the Wave 58 set (`coding.*`, `reasoning.*`,
`writing.*`, `agents.*`, `context.*`).

## Formula

```
TES = (benchmark_score * 100) / (cost_per_1k_in + 0.3 * cost_per_1k_out)
```

- `benchmark_score` — a real, citable score in **[0, 1]** for that
  `(model, category)` (e.g. a SWE-bench pass rate, an arena win-rate). Supplied
  by the caller; never invented by this module.
- `cost_per_1k_in` / `cost_per_1k_out` — USD cost per **1 000 tokens**, input
  and output, derived from the frozen pricing snapshot
  (`data/pricing-snapshot-2026-05-27.json`).
- `* 100` — a readability scalar only; it keeps typical scores in a
  human-friendly magnitude (tens–thousands) instead of fractions. It cancels in
  any ranking, so it has no effect on ordering.

### Why the `0.3` output weight

The denominator blends input and output cost with a fixed **30% output / 70%
input** weighting. This models a typical coding / agentic turn, which reads far
more context (files, history, tool results) than it writes. It is a deliberate
**convention of the score**, not a per-turn measurement — see
`OUTPUT_WEIGHT = 0.3` in the implementation. If a future workload is
output-heavy (long prose generation), a variant score with a higher weight
would be more representative; that would be a new, separately-named metric, not
a silent change to TES.

## How cost is derived (chosen path)

Two paths were available:

1. Read `input_per_mtok` / `output_per_mtok` directly from the snapshot.
2. Probe `computeCostMicros(model, 1000, 0)` and `computeCostMicros(model, 0,
   1000)` and divide by 1e6.

**Chosen: path 2 (probe).** Rationale: `cost.ts::computeCostMicros` is the
single owner of pricing math (model-id normalisation, the integer-microUSD
rounding contract from §13.3, local-model handling). Re-reading the raw fields
and re-doing the arithmetic would duplicate — and could drift from — that
contract. Probing reuses it verbatim: a 1 000-in / 1 000-out probe returns
integer microUSD, which we divide by 1e6 to get USD-per-1k.

**One thing the probe cannot tell us**, and why we *also* read the snapshot
directly: `computeCostMicros` returns `0` for **both** a free local model **and**
a pending (null-priced) cloud model. Those are completely different situations
for TES (free → a real, floored number; pending → no number at all). So
`tes-calculator.ts` reads the snapshot's `pricing_status` / null prices *only*
to classify the model into `priced | pending | free | unknown`
(`priceStatusForModel`). It never re-implements the cost arithmetic.

## Honesty conventions (Doctrine V4 #5 — NO FABRICATION)

This is the project's brand. TES **never** emits a number that looks real but
isn't. The `pricing-correto-2026` skill exists because past fabrication was a
NO-SHIP. Concretely:

| Situation | `tes` | `status` | Why |
|---|---|---|---|
| Priced model + valid score | finite number | `ok` | the real case |
| Free local model + valid score | floored number | `free` | see below |
| Price is `pending` (null in snapshot) | **`null`** | `pending` | no real price exists yet |
| Model not in snapshot at all | **`null`** | `pending` | cannot price it |
| `benchmark_score` missing | **`null`** | `pending` | no measured score |
| `benchmark_score` out of [0,1] / NaN / ∞ | **`null`** | `pending` | refuse to fabricate |
| Priced but `$0/1k` denominator | **`null`** | `pending` | ambiguous; do not divide by zero |

We **never** divide by an epsilon to manufacture a large-but-fake TES for a
pending model. `null` is the honest answer until a real price is supplied
(`mooter price-update`).

### Pending vs free — the critical distinction

The Wave 58 model roster lists ~14 models (briefs label it "12" — coverage is
reported honestly, not forced to 12). Of these, only **three** have real prices
in the current snapshot:

- **Priced (real):** `claude-opus-4-7` ($5/$25), `claude-sonnet-4-6` ($3/$15),
  `claude-haiku-4-5` ($1/$5).
- **Pending (null price, awaiting `mooter price-update`):** `claude-opus-4-6`,
  `claude-opus-4-8`, `claude-fable-5`, `gpt-5`, `gpt-5-3-codex`, `gpt-oss`,
  `gemini-3.1-pro`, `deepseek-v3.2`, `minimax`.
- **Free local:** `qwen3:30b` (and the other Ollama ids in
  `ollama_models` / `local_models_free`).

All pending models return `{ tes: null, status: 'pending' }` today. This is
expected and correct — the matrix shows "pending" cells, not invented values.

### Free local models — the cost floor

Local Ollama models cost **$0** (electricity not accounted, per the snapshot).
Dividing by zero is undefined, so for free models TES is computed against a
documented, clearly-labelled cost floor:

```
FREE_COST_FLOOR_PER_1K = $0.001 / 1k   (in and out)
```

- It is **not a real price**. It stands in for the marginal local cost.
- It is chosen ≈ the cheapest cloud input rate (Haiku, $1/MTok ⇒ $0.001/1k) so a
  free model's TES is comparable in scale to — and never absurdly larger than —
  the cheapest paid option.
- The result always carries `status: 'free'` and a `reason` saying so, so a
  consumer can render it distinctly (e.g. "floored") and never confuse it with a
  priced `ok` TES.

## API

```ts
computeTES({ model, category, benchmark_score }): TESResult
computeTESBatch(inputs: TESInput[]): TESResult[]   // order-preserving
priceStatusForModel(model): 'priced' | 'pending' | 'free' | 'unknown'
```

`TESResult` carries `tes`, `status`, `benchmark_score` (echoed/validated),
`cost_per_1k_in/out`, `price_status`, and a human-readable `reason` that is
**always** populated (including the explanation when `tes` is `null`).

The function is **pure** (only the snapshot read that `cost.ts` already does),
**never throws**, and **never fabricates** a number.

## Caveats

- TES ranks *value*, not absolute quality. A high-TES cheap model can still be
  the wrong pick for a task that needs the ceiling — use it alongside the raw
  benchmark score, not instead of it.
- `benchmark_score` must be measured **on the same category** it is passed
  with. TES does not verify this; supplying a model's global score under a
  specific category mislabels the cell (a data-entry error, not a math error).
- The `0.3` output weight is a workload assumption. Output-heavy workloads will
  see relatively cheaper models rank higher than this score suggests.
- Prices are a frozen 2026-05-27 snapshot. When pending prices land via
  `mooter price-update`, those cells flip from `pending` to `ok`
  automatically — no code change needed.
