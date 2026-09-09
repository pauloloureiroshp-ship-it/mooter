# Slide P4 · Critic ≠ author did not catch more planted defects than self-review — both caught ~all; what the pipeline adds is a verified citation on 59/59 findings

**Setup:** 28 single-line mutants killed by the repo's own tests (mooter 10, fastify 8, hono 10; the protocol asked for 10 per repo, fastify yielded 8 in the time cap) plus 28 identical control windows with the original line. Same review system prompt, ±25-line window, no repo access. Pre-registered, committed before mutation.

| | Self-review (Opus, `claude -p`, hooks/tools off) | Critic in a different engine (Codex, read-only, empty cwd) |
|---|---|---|
| Recall on 28 mutants (95 % CI) | **27/28 · 96 % [82, 99]** | 26/28 · 93 % [77, 98] |
| False alarms on 28 controls | **2/28 · 7 % [2, 23]** | 4/28 · 14 % [6, 31] |
| Wrong-line findings | 0 | 0 |
| `PROVA: file:line` resolving to a real line | 29/29 | 30/30 |

**Pre-registered test (McNemar, one-sided, α 0.05):** "critic catches more" — discordant 0 vs 1, p = 1.0; "critic has fewer false alarms" — discordant 2 vs 0, p = 1.0. **Neither holds.** 53/56 windows agree; both engines flag the same two control lines (candidate real defects, not verified) and miss the same mutant.

**Printed loss:** on syntactic one-line mutations both engines sit at the ceiling; the engine swap buys nothing measurable here. The measurable value is provenance: every finding carries a citation that a verifier checked against the tree, which only became true after fixing the verifier that accepted line N+1 (defect D2, found while building this proof).

*Does not prove: real production defects; human time; the local ($0) critic (measured 2026-08-21 with zero discrimination, not repeated); multi-file PR review; run-to-run stability (1 run per window). Cost: self-review ≈ US$ 0.51 list per window on subscription; Codex tokens n/d.*
