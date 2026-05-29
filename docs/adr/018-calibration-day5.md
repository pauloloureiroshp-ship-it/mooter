# ADR 018 — Calibration update Day 5 (pack set 3 → 7)

Status: accepted · Date: 2026-05-28 · Wave 2 Day 5

## Context

Day 3 shipped the combined axis-2 classifier: v1 (regex, `classify_domain.ts`)
plus v2 (embedding similarity, `embedding_store.ts`). The two are combined by
**rules**, not by a weighted score blend — v1 wins when confident; v2 may only
*promote* a v1 `GENERAL`/`AMBIGUOUS` verdict when its cosine similarity clears
`EMBED_PROMOTE_SIM`, and adds `AGREEMENT_BONUS` to confidence when v1 and v2
agree. There is therefore **no `REGEX_WEIGHT`/`EMBED_WEIGHT` to tune** (the Day-5
brief sketched an env-var weight grid that does not match the implementation);
the single accuracy-relevant knob is `EMBED_PROMOTE_SIM`. `AGREEMENT_BONUS`
only nudges confidence — it never changes the chosen pack, so it moves neither
recall nor precision and was left at 0.10.

Day 5 added four packs (`voice-tts`, `knowledge-third-brain`, `prd-strategy`,
`data-spreadsheet`), growing the registry 3 → 7 and the seed pool 24 → 56. The
`classify_domain.ts` calibration note already predicted the failure mode: *more
packs ⇒ the nearest seed's similarity rises for any prompt ⇒ a fixed threshold
becomes more permissive than intended.*

## Decision

Raise `EMBED_PROMOTE_SIM` **0.55 → 0.70**. Leave `WEIGHTS`, `THRESHOLDS` and
`AGREEMENT_BONUS` unchanged.

Evidence (`packages/router/scripts/recalibrate.ts`, sweep over the 34-prompt
Wave-1 validation set, 7 packs, embedding init 0.79s, p99 classify 24ms):

| EMBED_PROMOTE_SIM | single_recall | general_keep | ambiguous_keep |
|---|---|---|---|
| 0.55 (Day 3) | 1.00 | 0.00 | 0.00 |
| 0.65 | 1.00 | 0.00 | 0.17 |
| **0.70 (chosen)** | **1.00** | **0.75** | **0.83** |
| 0.75 | 0.92 | 0.75 | 1.00 |
| 0.80 | 0.92 | 0.75 | 1.00 |

- `single_recall` — the 24 single-pack prompts land on the right pack (brief gate ≥ 0.90).
- `general_keep` — `GENERAL`-labelled prompts STAY `GENERAL` (precision guard).
- `ambiguous_keep` — `AMBIGUOUS`-labelled prompts are not over-promoted into a pack.

At 0.55 with 7 packs the embedding cleared the bar for *every* prompt, so a
generic question (e.g. "debounce vs throttle in JS") was force-promoted into
`animation-web` and got animation scaffolding injected — a real misroute the
Day-3 recall test cannot see (it excludes `GENERAL`/`AMBIGUOUS` prompts). 0.70
restores the `GENERAL`/`AMBIGUOUS` escape hatch while keeping single-pack recall
at 100%. 0.75+ starts costing recall.

`general_keep` caps at 0.75 because P032 ("parse a CSV file…") is now matched by
**v1 regex** (keyword `csv`, confidence 1.00) → `data-spreadsheet`. This is
threshold-independent and arguably *more* correct than the historical `GENERAL`
label, so it is accepted rather than suppressed.

### Recall vs Day 3 baseline

- Combined recall on the single-pack validation set: **100% (24/24)** — unchanged
  from Day 3. The new packs' keywords/seeds do not overlap the original three
  packs' prompts, so the registry growth caused no recall regression.
- v1-only recall: 91.7% (22/24); v2 still lifts it to 100%.
- p99 classify: 24ms (budget 80ms). Embedding init: 0.79s for 56 embeddings
  (budget 5s), via the Day-4 batch-embed path (`EMBED_BATCH_SIZE`).

### Test impact (one pre-existing test re-pointed)

The Day-3 `ambiguous.test.ts` disambiguation case promoted a weak dual-domain
prompt (sim 0.559, with a *new* pack `voice-tts`@0.531 right behind) — it only
passed because the threshold was 0.55. The structurally identical validation
prompt P004 sits at 0.672 and must *stay* `AMBIGUOUS`; no single threshold both
promotes 0.559 and keeps 0.672 ambiguous. The test was rewritten to pin the
boundary deterministically with a stub store: it now asserts both that a genuinely
strong v2 (≥0.70) still disambiguates and that a weak v2 (0.60) correctly stays
`AMBIGUOUS`. `classify_domain.test.ts`'s pack-count assertion was updated 3 → 7.
(Decision confirmed with Paulo before merge.)

## Consequences

- Routing distribution shift: more prompts resolve to `GENERAL`/`AMBIGUOUS`
  instead of being force-promoted, i.e. fewer wrong-pack scaffolds in production.
- v2 disambiguation of `AMBIGUOUS` prompts is now conservative — it fires only on
  strong, single-domain embedding signals.
- `AGREEMENT_BONUS` documented as accuracy-neutral; future sweeps need not touch it.

## Re-evaluate when

- Pack count > 7 (Wave 4 community packs) — re-sweep `EMBED_PROMOTE_SIM`.
- Embedding model swap (e.g. nomic-embed-text v2) — similarities re-scale.
- Original packs' seeds are translated to English / multilingual — the PT-PT
  seeds currently make English paraphrases low-similarity (out of distribution).
- Recall drops below 85% sustained in prod telemetry (event-writer rollups).
