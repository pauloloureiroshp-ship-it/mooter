# `classify_domain()` — domain classification (axis 2)

> Pastor Wave 1, Day 3. Source prompt: `docs/strategy/PASTOR.md` §10.3.
> Implementation: `packages/router/src/classify_domain.ts`. Tests:
> `packages/router/tests/classify_domain.test.ts`.

Two-axis routing (ADR 015): **axis 1** maps a prompt to a *complexity tier* (`tools/router/classify.js`, untouched here); **axis 2** maps a prompt to a *domain pack* (`packs/<name>/pack.yaml`). This document specifies axis 2's pure-regex layer. No LLM, no embeddings — those land in later days.

## Pipeline

```
loadPacks(dir)                 # boot: read packs/*/pack.yaml, compile regexes once
   └─ compilePack(id, signals) # word-boundary keyword/negative regexes + lowered phrases/exts
classifyDomain(prompt, packs)  # per call: score each pack → confidence → pack_id
```

`loadPacks()` is generic: it discovers every `packs/<name>/pack.yaml` (skipping `node_modules`, `tests`, `__mock__`) and reads `domain_signals`. Nothing about the specific seed packs is hard-coded. Regexes are compiled **once at boot** and cached on each `CompiledPack`, so per-call work is just matching.

## Scoring

For each pack, against the prompt:

| Signal | Match rule | Weight |
|---|---|---|
| `keywords` | case-insensitive **word boundary** (`\bkw\b`) on the raw prompt | **+1.0** each |
| `intent_phrases` | substring on the lower-cased prompt | **+1.5** each |
| `file_extensions` | substring on the lower-cased prompt (e.g. `.tsx`) | **+0.5** each |
| `negative_keywords` | case-insensitive **word boundary** | **−2.0** each |

`pack_score = 1.0·kw + 1.5·intent + 0.5·ext − 2.0·negative`

Word boundaries prevent substring false positives (`\bER\b` matches the token `ER`, not `er` inside `server`). Intent phrases and extensions use substring on purpose — they are multi-token / punctuated signals where boundaries are unnecessary.

## Confidence & thresholds

```
sort packs by score (desc)
top_score = scores[0]
if top_score <= 0 → { pack_id: "GENERAL", confidence: 0, candidates: [] }

sum_top_3  = Σ max(0, score) over the top 3 packs
confidence = top_score / sum_top_3      # in (0, 1]
candidates = top 3 packs with score > 0 (descending)
```

| Confidence | Result |
|---|---|
| `>= 0.6` | single pack (`pack_id = top`) |
| `[0.4, 0.6)` | `"AMBIGUOUS"` + top-3 `candidates` |
| `< 0.4` | `"GENERAL"` |

Rationale: confidence is the winner's share of the leading field. A lone strong match → `1.0` (clear winner). Two packs tied → `0.5` (genuinely ambiguous, surface both). A scattered field where no pack dominates → low share → `GENERAL`.

## Return shape

```ts
interface DomainClassification {
  pack_id: string;            // a pack name | "AMBIGUOUS" | "GENERAL"
  confidence: number;         // 0..1
  reason: string;             // human-readable explanation
  candidates: { pack_id: string; score: number }[]; // top-3, score > 0
}
```

## Performance

Regexes are pre-compiled at boot; classification is a handful of `RegExp.test` /
`String.includes` calls per pack. Measured over 1000 warm calls (3 packs):
**p50 ≈ 0.004 ms, p99 ≈ 0.01 ms** — three orders of magnitude under the 5 ms p99 budget.

## Validation (test suite)

50 labelled prompts: 30 positive (10/pack), 10 negative, 10 ambiguous.

| Metric | Target | Measured |
|---|---|---|
| Recall (overall + per pack) | ≥ 0.85 | 1.00 |
| Precision / F1 | — | 1.00 / 1.00 |
| False positives (negatives → GENERAL) | 0 | 0 |
| Ambiguous flagged with correct pair | all | all |
| p99 latency | ≤ 5 ms | ~0.01 ms |

## Out of scope (later days)

- `<pack-hint>` emission from the hook — Day 4 (§10.4).
- Semantic fallback (Ollama/Haiku) for low-confidence prompts — Day 6+.
- Embeddings — Wave 2.
- Axis 1 (`classify.js`) is **not** modified.
