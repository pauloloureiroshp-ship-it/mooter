# ADR 019 — Bilingual embedding seeds (known-residual)

## Context
Day 3 (the original 3 packs — animation-web, code-audit, diagram-systems) used
PT-PT embedding seeds. Day 5 (the 4 new packs — voice-tts, knowledge-third-brain,
prd-strategy, data-spreadsheet) used English seeds. The embedding store is
therefore mixed-language, which causes a distribution mismatch for queries
issued in the language a given pack was *not* seeded in.

## Decision
Defer standardization to Wave 3+. Document the mixed-language store as a
known-residual rather than rewriting seeds now.

## Why not fix now
- Recall is 100% on the validation set for single-language queries (Day 5).
- Scope-creep risk: rewriting the original 3 packs' seeds would invalidate the
  Day 3/Day 5 calibration (ADR 018) and force a fresh grid search.
- The better fix is *bilingual* seeds (≈4 PT-PT + 4 EN per pack), which needs a
  proper re-calibration pass, not a one-off swap.

## Consequences
- Cross-language queries carry a misroute risk (e.g. an English voice prompt vs
  the PT-PT animation-web seeds). Acceptable at current single-user scale.
- `packs/README.md` documents the per-pack seed-language convention so future
  pack authors know which language a pack currently leans on.

## When to revisit
- Cross-language misroute rate > 5% in prod telemetry (Wave 3+ once execution
  events accumulate).
- Embedding-model swap (e.g. a multilingual `nomic-embed-text v2`).
- Community pack contributions arrive in non-English locales.
