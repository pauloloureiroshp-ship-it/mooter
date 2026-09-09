# Slide P6 · Prototype cost-line coverage: 156 records in one instrumented run. Not yet emitted by the installed product.

**Today's ledger on this machine: 0 lines carrying a cost *and* where the number came from — on both cuts.** Pre-registered cut (arm A: 939 `classified` + 492 `executed` + 20 ledger `done` = **1,451** events): 0. Exploratory cut (ledger `all` 726 instead of `done`: **2,157** events): 0. Source: `results/ledger-actual.json`. 479 `executed` lines say `cost_usd: 0` without saying why (478 are recorded as `deferred`); 20 `done` lines have token counts but no origin.

**With the cost line (`tools/router/cost-line.js`, 15 unit tests with hand-computed expected values): 156/156 records carry a cost basis, its declared origin and token fields; 0 `n/d`.** 63 rule records carry synthetic zero token counts by policy; the origin is declared by the caller, not verified.

| Declared origin | Records | Incremental cost | Completeness |
|---|---|---|---|
| `rule_local` | 63 | 0 | complete (0/0 by policy) |
| `ollama_local` | 73 | 0 | complete (Ollama's own two counts, both required) |
| `subscription_included` (Haiku via `claude -p`) | 20 | 0 | `partial_no_cache_pricing` — list price is input/output only |

**Reconciliation, 20 Haiku calls (pre-registered):** input/output list price **US$ 0.079605** vs **US$ 1.318525** reported by the CLI — **Δ −94 %**. Adding the supplied cache counts at the published 1-hour write rate reconstructs **US$ 1.3185247, residual 0 on 20/20 calls** (exploratory; those multipliers are not in our price table). Fix proposed to the price table; not applied here.

**This demonstrates instrumentation, not savings or verified billing.** Zero incremental cost describes *how it was paid* (rule, local GPU, subscription), never *what was saved*. No ledger writer calls this module yet.

*Does not prove: savings (forbidden); that list price is what the owner pays; that the declared origin is the real one; that the product emits these lines. Pre-registration chronology: protocol commit `61007b23` (`%cI` 13:51:24Z, 1-s resolution) and the v1 `analysis.json` (`at` 13:51:24.449Z, commit `030374b1`) fall in the same second; the order comes from the shell command sequence (`git commit && node run.mjs`), not from the timestamps. The hand-typed `congelado_em` was wrong (errata on file).*
