# Slide P2 · When the router says "escalate", it is right — on these 20 tasks

**11 of 13 local-model failures were flagged for escalation before running.** 20 JSON tasks (L1–L5 ladder; 10 from a prior Codex study, 10 new with oracles reviewed by a different engine). Local 14B model: 7/20. Routed to the recommended tier (local for T0, Haiku for T1): **17/20**, solving 10 of the 13 local failures (McNemar B > A, p = 0.001; holdout only, p = 0.016).

**The reserve, printed:** Haiku on everything scores 19/20. The tier signal saves 7 Haiku calls and costs 2 correct answers. **And without an API key — this machine's real state — the router marks all 20 as T0 and the user gets 7/20.**

| | Local only | Recommended tier | Haiku on all |
|---|---|---|---|
| Accepted, 20 tasks | 35 % [18, 57] | **85 % [64, 95]** | 95 % [76, 99] |
| Solves local failures | — | 10 / 13 | 12 / 13 |

Cost: local 55–171 tokens in, ~300 ms. Haiku via `claude -p`: ~800 output tokens and 16–48k cached-prefix tokens per call, 8 s median; subscription, API spend US$ 0.

*Does not prove: real long prompts (P1 shows the rule under-tiers them); obedience (P3); that Haiku is cheap; anything about T2/T3, which were never recommended here.*
