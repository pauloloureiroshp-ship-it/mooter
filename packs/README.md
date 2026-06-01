# Pastor packs

Each pack is a directory under `packs/<id>/` with:

- `pack.yaml` — manifest (validated against `packs/pack.schema.yaml`)
- `scaffold.md` — prompt scaffold injected when the pack matches

The router's axis-2 (`classify_domain`) resolves a prompt to a pack via regex
signals + embedding similarity over each pack's `embedding_seeds`.

## Embedding-seeds language convention

- **Original 3 packs** (`animation-web`, `code-audit`, `diagram-systems`): seeds
  in **PT-PT** (legacy from Wave 1).
- **Wave 2 Day 5 packs** (`voice-tts`, `knowledge-third-brain`, `prd-strategy`,
  `data-spreadsheet`): seeds in **English**.

**Decision (ADR 019):** the store stays mixed-language for now. Cross-language
queries carry a documented misroute risk (a known-residual, not a bug). Wave 3+
may standardize to bilingual seeds (≈4 PT-PT + 4 EN per pack) behind a proper
re-calibration.

The validation set should include prompts in **both** languages so a regression
in either is caught.

See `docs/adr/018-calibration-day5.md` (weights/thresholds) and
`docs/adr/019-bilingual-seeds-known-residual.md` (this convention).
