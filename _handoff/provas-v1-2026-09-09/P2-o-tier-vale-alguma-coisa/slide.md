# Slide P2 · On 20 synthetic tasks, the local/Haiku policy got 17 accepted; local alone 7; Haiku on all 19

20 JSON tasks (L1–L5 ladder; 10 from a prior Codex study, 10 new written by the author and checked by a different engine). Policy = `classify.js` tier with an API key present: T0 → local 14B model, T1 → Haiku (reconstructed from the two arms, not executed as a flow). T2/T3 were never recommended.

| | Local only | Local/Haiku by tier | Haiku on all |
|---|---|---|---|
| Accepted, 20 tasks | 35 % [18, 57] | **85 % [64, 95]** | 95 % [76, 99] |
| Repairs local failures | — | 10 / 13 | 12 / 13 |

Paired gains, policy vs local: 10 to 0 (McNemar p = 0.001 on 20; p = 0.016 on the 10 new). Descriptive signal: the local model failed on 11 of 13 tasks flagged T1 and on 2 of 7 flagged T0. **The reserve:** Haiku on everything is 2 answers better; the policy skips 7 Haiku calls, which are the short ones (8.8 % of output tokens). **Without an API key — this machine's state — `classify.js` says T0 on 20/20 and the offline composition is 7/20.**

Resources per Haiku call via `claude -p`: ~800 output tokens, 16–48k cached-prefix tokens, 8 s median; subscription (incremental API spend 0; CLI list estimate US$ 1.32 for 20 calls, not an invoice).

*Does not prove: intelligent selection among tiers (the test measures paired acceptance); policy ≈ Haiku-everywhere (2 discordant cases); anything about T2/T3; the installed product end to end. One instrument amendment (AMENDMENT-1).*
