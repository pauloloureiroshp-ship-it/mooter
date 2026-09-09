# Slide P6 · Every decision line carries its cost and where the number came from — and we print the gap to the host

**Today's ledger on this machine: 2,134 events, 0 lines with a cost and its origin.** 479 `executed` lines say `cost_usd: 0` without saying why; 20 `done` lines have tokens but no origin.

**With the cost line (C2-min, `tools/router/cost-line.js`, 11 biting tests): 156/156 lines from this run carry cost, origin and token counts; 0 `n/d`.**

| Origin | Lines | Incremental cost | What the line carries |
|---|---|---|---|
| `rule_local` | 63 | 0 | 0 tokens by construction |
| `ollama_local` | 73 | 0 | Ollama's own `prompt_eval_count` / `eval_count` |
| `subscription_included` | 20 | 0 | SSOT list price alongside, cache counts, host-reported cost |

**Reconciliation, 20 Haiku calls:** our list price (input+output) US$ 0.080 vs host-reported US$ 1.319 — **Δ −94 %**. The gap is fully explained and printed: the host prices 602k cache-creation and 354k cache-read tokens; our price table has no cache multipliers. Fix proposed to the price table; not applied here.

**Not savings.** Zero incremental spend describes *how it was paid* (rule, local GPU, subscription), never *what was saved*. The line is written by this run's instrument; the installed product does not write it yet.

*Does not prove: savings (forbidden); that list price is what the owner pays; that the product emits these lines.*
