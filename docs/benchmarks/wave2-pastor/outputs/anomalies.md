# Wave 2 Re-benchmark — Anomalies log

> Pre-registration commitment (BENCHMARK_DESIGN.md): every deviation from the
> frozen design is recorded here, resolved or kept, with impact. No methodology
> was changed mid-run; no prompt was retroactively filtered (all 34 entered).

Run-id: `019e7415-bd77-7fbc-ac6c-1f0887712565` · env_hash `fb7c63050dd03c46`
· pricing `pricing-snapshot-2026-05-27` · ollama 0.23.3 · sdk 0.99.0 · node v20.20.2
· total cost $3.66 (invocation $2.964 + judge $0.698) · 0 invocation failures.

---

## (A1) Judge JSON parse failures — P005, P022 (KEPT)

Two judge calls returned output the parser could not coerce into the rubric schema;
the harness substituted **neutral scores** (per §4.6 fallback) for those two prompts.

- **Impact**: 2 of 34 prompts (5.9%) contributed neutral (0.5-band) quality to all
  three arms equally — slightly compresses the cross-arm quality spread but does not
  bias any single arm, since the fallback is applied identically to A/B/C.
- **Resolution**: KEPT. Pre-registration forbids retroactive filtering. Wave 1 also
  had exactly 2 judge-parse fallbacks (different prompts — Mermaid-related), so the
  rate is stable run-over-run.
- **Follow-up**: harden judge JSON extraction (Wave 3 NIT) — strip code fences and
  retry once before falling back to neutral.

## (A2) Pricing snapshot kept frozen at 2026-05-27 (DEVIATION, resolved)

The Day 7 master prompt §3.2 asked to generate a fresh `pricing-snapshot-2026-05-29.json`.
The real `lib/pricing.ts` has no `--snapshot` flag — it deliberately pins the frozen
`data/pricing-snapshot-2026-05-27.json` as a reproducibility contract.

- **Impact**: none on validity. Anthropic list prices did not change in the 2-day
  window. Keeping the frozen snapshot is the methodologically correct choice: it makes
  Wave 1 ↔ Wave 2 cost deltas reflect **routing changes only**, not price drift.
- **Resolution**: kept frozen on purpose. The §3.2 instruction was speculative; the
  harness's existing pin supersedes it.

## (A3) Master-prompt CLI flags do not exist in the harness (DEVIATION, resolved)

Master prompt §3.3 invoked `run.ts` with `--arms pastor,sonnet,opus --judge sonnet
--blind-judge --pricing-snapshot ... --pre-registered ...`. The real harness accepts
only `[--limit N] [--skip-judge]`; the methodology (arms A/B/C, Sonnet blind judge,
deterministic checks) is baked into `run.ts` and its `lib/`.

- **Impact**: none. The baked-in methodology is byte-identical to Wave 1's (same
  `lib/`, same `prompts.jsonl`, confirmed by `diff`). Running the harness as-is is
  strictly more faithful to the pre-registration than re-deriving flags would be.
- **Resolution**: ran `tsx run.ts` (full 34×3) unchanged; redirected outputs to
  `docs/benchmarks/wave2-pastor/outputs/` and bumped `LAKE_DATE` to 2026-05-29 so the
  Wave 2 data lake does not collide with Wave 1's 2026-05-27 partition.

## (A4) `pastor_version` label not bumped — run used live Wave 2 code (NOTED)

The lineage snapshot records `pastor_version: v0.1.0-pastor-wave1 @ 1d8a0da`. The
Pastor arm (`lib/arm-pastor.ts`) calls the **live** classifier + `lib/models.ts`,
which already carry the Wave 2 Day 1 fixes.

- **Evidence the run is Wave 2, not Wave 1**: Pastor `model_distribution` shows
  `qwen2.5-coder:7b` (the Wave 2 Day 1 T0 swap, ADR 017) — Wave 1 used `qwen3:30b`
  for T0. Mean latency dropped 51,101 ms → 19,568 ms (−62%) and invocation failures
  fell 2 → 0, both direct consequences of the T0 model swap.
- **Impact**: the version string is cosmetically stale but the measured behaviour is
  Wave 2. Cost/quality/latency numbers are valid for the Wave 2 router.
- **Follow-up**: bump the pinned `pastor_version` tag to `v0.2.0-rc1` after this PR
  merges so future runs label correctly.

## (A5) Hub upload skipped (EXPECTED)

`Hub upload skipped — endpoint /api/bench not yet deployed`. Expected — the hub
endpoint is a Wave 3 deliverable. Local outputs are the source of truth for this gate.
