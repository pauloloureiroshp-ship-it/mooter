# Slide P1 · Deciding costs zero — and, off the training set, it is often wrong

**Deciding costs 0 tokens and sends 0 bytes.** Measured: 1,176 classifications, 0 model calls, 0 hosts contacted, 6/6 runs byte-identical. The rule itself takes 0.002 ms; the process the hook spawns takes ~97 ms; the hook the user feels takes 119–211 ms.

**Accuracy against blind labels (a different engine, Codex, labeled before any classification):**

| | Rule (`classify.js`) | Local LLM judge (14B, ~393 tokens/prompt) |
|---|---|---|
| 35 training prompts | 88.6 % [74.0, 95.5] | 82.9 % [67.3, 91.9] |
| **40 real prompts, September, out of training** | **35.0 % [22.1, 50.5]** | **52.5 % [37.5, 67.1]** |
| McNemar, one-sided (judge > rule), n=40 | p = 0.059 | |

**We print the loss.** The rule under-tiers: it says T0 on 30 of 40 real prompts; two independent raters put 12 of those at T2/T3. The "tie with an LLM router" measured on 2026-09-01 was a training-set number and does not generalize.

Inter-rater agreement on labels: Cohen's kappa 0.62 (n=63, local 27B model vs Codex). Competitor hook (tzachbon) abstains on all 63 (English-only heuristics). Proxies (claude-code-router, LiteLLM) have no complexity classifier: accuracy n/d by construction.

*Does not prove: commercial value; obedience (P3); anything above 4k-token prompts; that the blind label is ground truth.*
