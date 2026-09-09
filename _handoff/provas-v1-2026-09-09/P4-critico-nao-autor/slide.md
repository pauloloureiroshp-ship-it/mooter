# Slide P4 · On 28 selected test-killed mutants, an Opus reviewer scored 27/28 and a Codex reviewer 26/28; superiority of the second-engine critic was not established

**Setup:** 28 single-line mutants killed by the repo's own paired tests (mooter 10, hono 10, fastify 8 — fastify ran out of eligible source/test pairs, not of time) plus 28 original, unmutated windows. Same review system prompt, ±25-line window, target line marked in both groups, no repo access. Pre-registered and committed before mutation. Deterministic selection (first killed, alphabetical), 15 files, 8 of 12 operators exercised.

| | Opus reviewer (`claude -p`, hooks/tools off) | Codex reviewer (read-only, empty cwd) |
|---|---|---|
| Found on the planted line, 28 mutants (95 % CI) | **27/28 · 96 % [82, 99]** | 26/28 · 93 % [77, 98] |
| Findings outside the ±2-line scoring tolerance | 0 (all offsets are 0) | 0 |
| Findings on 28 unmutated windows (scored as false alarms, not adjudicated) | 2/28 · 7 % [2, 23] | 4/28 · 14 % [6, 31] |
| `file:line` references resolving to an existing line (relevance not assessed) | 29/29 | 30/30 |

**Pre-registered tests (one-sided McNemar, α 0.05):** "second engine catches more" — discordant 0 vs 1, p = 1.0; "second engine alarms less" — discordant 2 vs 0, p = 1.0. **Neither superiority hypothesis was supported**; equivalence is not claimed. 53/56 windows agree; both engines alarm on the same two unmutated windows and miss the same mutant (shared alarms, not adjudicated).

**Printed loss:** the pre-registered claim that a critic in a different engine catches more planted defects did not hold here. This design does not test authorship: neither engine wrote the code it reviewed, so it says nothing about self-review.

*Does not prove: real production defects; self-review; that shared alarms are real defects; incremental value of the citation verifier; human time; the local ($0) critic (measured 2026-08-21 with zero discrimination, not repeated); run-to-run stability (1 run per window). Cost: Opus reviewer ≈ US$ 0.51 list per window on subscription; Codex tokens n/d.*
