# Slide P1 · Classifying costs no inference — and, off the training set, the rule is wrong more often than "always T2"

**0 inference tokens, 0 external hosts to classify.** Measured with a positive-control instrument: 1,176 classifications, 0 model calls, 0 hosts, 6/6 runs byte-identical. The rule takes 0.002 ms in-process. **The hook it lives in is not free:** 207 ms p50 / 1,272 ms p95 per prompt, ~870 bytes of hint injected per prompt, and a local pre-answer call for T0 prompts that timed out 75/75 times in this run (374 misses vs 36 hits in the live log).

**Accuracy against blind labels** (labeled by a different engine before any classification; 40 real September prompts, out of training):

| | Rule (`classify.js`) | Local LLM judge (14B, ~393 tokens/prompt) | Constant "always T2" |
|---|---|---|---|
| 35 training prompts | 88.6 % [74.0, 95.5] | 82.9 % [67.3, 91.9] | 14.3 % |
| **40 real prompts** | **35.0 % [22.1, 50.5]** | **52.5 % [37.5, 67.1]** | **45.0 % [30.7, 60.2]** |
| McNemar one-sided, judge > rule, n=40 | p = 0.059 (not significant) | | |

**We print the loss.** The rule under-tiers: T0 on 30 of 40 real prompts; two independent raters put 12 of those at T2/T3. The "tie with an LLM router" measured on 2026-09-01 was a training-set number and does not generalize. Label agreement between raters on the 40: Cohen's kappa 0.50.

Competitors on this corpus: tzachbon hook abstains 63/63 (English-only intent gate; its CLI fallback costs ~52k cached tokens and 6 s per call). claude-code-router and LiteLLM have no complexity classifier: accuracy n/d by construction; egress compared in P5.

*Does not prove: commercial value; obedience (P3); anything above 500 characters; that the blind label is ground truth; the configuration with a real API key and the arbiter on.*
