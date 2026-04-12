# Overnight Auto-tuning Log — 2026-04-11/12

## Baseline
- Gold-labels: 59/62 (95.2%)
- Tier distribution: T0=222(43.5%), T1=1(0.2%), T2=71(13.9%), T3=214(42.0%)
- Mismatches: gl-026 (commit→T1 vs expected T0), gl-046 (implement compound→T0 vs T2), gl-051 (implement compound→T0 vs T2)

---

## [02:25] P1 — Compound "implement" pattern → MED_RISK
- Hipotese: prompts "implement X with Y, Z and W" (30+ chars after "implement") are compound features needing T2 reasoning, not trivial T0
- Pattern added: `/\bimplement\w*\b.{30,}/i` to MED_RISK in patterns.js
- Resultado: APROVADO — gold-labels 61/62 (98.4%, was 95.2%), +3.2pp
- Fixes: gl-046 ("implement pagination with cursor-based navigation...") and gl-051 ("implement search with autocomplete, filters...")
- Remaining mismatch: gl-026 (commit msg → T1 by design, gold label says T0)
- Accao: patterns.js updated, commit b13262a

## [02:30] P2 — S3 optimizer category framing expansion
- Hipotese: categoryFrame() only handles categories classify.js rarely emits (code_generation, bug_investigation). Expanding to trivial_local, ambiguous_*, and simple_transform_or_explain with sub-intent detection will increase S3 hits.
- Sub-intents added: summarize/explain, translate, format/transform
- Resultado: APROVADO — S3 hits increased from 14 to 21 (+50%) in optimizer-dryrun. All 46 optimizer tests pass.
- Accao: prompt-optimizer.js updated, commit 9c85446

## [02:32] P3 — TUNED_DEMOTE refinement from real corpus
- Analysis: 90 real T3 prompts (non-stress-test) examined. All are legitimately T3: master prompts, architecture discussions, deploy signals, user overrides to Opus.
- The 3 existing TUNED_DEMOTE patterns (pensa bem antes, sonnet diagnostica este, ultrathink this problem) are all from stress tests and are already handled.
- Resultado: NO ACTION — no safe additional demote candidates in the real corpus
- T3 confidence distribution: 36×0.75, 34×0.9, 10×0.99, 8×0.7, 2×0.45

## [02:35] P4 — Apply TUNED_DEMOTE to classify.js
- Skipped: P3 found no new patterns. Existing TUNED_DEMOTE_T3 in classify.js already has the 3 stress-test patterns. No changes needed.

## [02:38] P5 — --optimizer-dryrun flag for backtest.js
- Implemented: `node tools/router/backtest.js --optimizer-dryrun`
- Simulates optimizer against full historical corpus (365 classified events)
- Results: 233/365 optimized (63.8%), ~346 tokens saved est
- Strategy breakdown: s1+s2 (135), s1 (39), s2 (38), s3 (21), s1+s3 (8)
- By tier: T0 82.3% optimized, T1 100%, T2 100%, T3 19.2%
- Accao: backtest.js updated, commit f343226

---

## Resumo
- Melhorias aplicadas: 3 (P1, P2, P5)
- Accuracy gold-labels: 98.4% (era 95.2%) — +3.2pp
- S3 optimizer hits: 21 (era 14) — +50%
- New feature: --optimizer-dryrun permanently available
- Commits: 3 (locais, nao pushed)
  - b13262a: feat(tuning): overnight P1 — compound implement pattern
  - 9c85446: feat(optimizer): overnight P2 — expand S3 category framing
  - f343226: feat(backtest): overnight P5 — optimizer-dryrun flag
- Guardrails respeitados: accuracy never dropped below 95.2%, zero API calls paid, all tests pass
