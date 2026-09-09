# Slide P1 · Classifying costs no inference — and, on these 40 sampled prompts, the rule is wrong more often than "always T2"

**0 inference tokens, 0 external hosts to classify.** Instruments: an Ollama stub plus in-process http/https/fetch counters (0 calls in 1,176 classifications), and a socket-level tap with positive controls re-run on 270 Node processes (0 connections). 6/6 runs byte-identical. The rule takes 0.002 ms median in-process (p95 1.9 ms). **The hook it lives in is not free:** 207 ms median / 1,272 ms p95 per prompt, ~870 bytes median (~1,000 mean) of hint injected per prompt, and a local pre-answer call for T0 prompts that timed out 75/75 times in this run (the live log shows 377 misses vs 36 hits, of which 67 are timeouts; the rest are `Invalid`).

**Accuracy against blind labels** (labeled by a different engine, without repo access, before any classification; 40 real September prompts sampled by seed from 298 eligible, all unchanged by anonymisation):

| | Rule (`classify.js`, key present) | Local LLM judge (14B, ~393 tokens/prompt) | Constant "always T2" |
|---|---|---|---|
| 35 training prompts | 88.6 % [74.0, 95.5] | 82.9 % [67.3, 91.9] | 14.3 % |
| **40 real prompts** | **35.0 % [22.1, 50.5]** (32.5 % without key) | **52.5 % [37.5, 67.1]** | **45.0 % [30.7, 60.2]** |
| McNemar one-sided, judge > rule, n=40 | p = 0.059 (not significant) | | |

**We print the loss.** The rule under-tiers: T0 on 30 of 40 real prompts; both label engines put 12 of those at T2/T3. The "tie with an LLM router" measured on 2026-09-01 was a training-set number. The judge is only 3 hits above the constant baseline. Agreement between the two label engines on the 40: Cohen's kappa 0.50 (no isolation claim beyond "two different engines").

Competitors on this corpus: tzachbon hook abstains 63/63 (English-only intent gate); one separately invoked fallback call recorded ~52k cached tokens and 5.97 s; none fired on this corpus. claude-code-router and LiteLLM have no complexity classifier: accuracy n/d by construction; egress compared in P5.

*Does not prove: commercial value; obedience (P3); anything above 500 characters; that the blind label is ground truth; the configuration with a real API key and the arbiter on; representativeness beyond the sampled 40 (indirect exposure to the rule's authors' phrasing not excluded).*
