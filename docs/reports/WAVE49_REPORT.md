# 🐮 Wave 49 — Anthropic-Aligned: Report

**Date:** 2026-06-10 · **Branches:** `wave49-pr1-alignment-observability`, `wave49-pr2-tier5-localmodels` (stacked) · **Base:** main @ `56ae6d2` (v1.25.0)
**Doctrine:** V4 honest > forced. Pricing correct. Zero fabrication.

## TL;DR (3 lines)

- **Shipped (2 stacked PRs):** Anthropic-aligned honesty layer (low-conf ⚠ + explain confidence/uncertainty + alignment statement); Tier 5 Fable (opt-in only, sha-change **Paulo-approved**); `mooter local-models`; correct-pricing tiers + honest vision doc.
- **Pulled (Paulo-approved):** `qwen3.6:27b` (17GB) + `qwen2.5-coder:32b` (19GB) — both smoke-tested OK.
- **Deferred to Wave 50 (honest):** Phase 4 OpenTelemetry, Phase 5 MooterBench, Phase 6 MCP increment — each is a new-package/frozen-package effort that needs its own scope.

## Day 0 recon — ground truth (corrected the brief's stale premises)

| Premise checked | Reality |
|---|---|
| Wave 48 "NOT merged" (memory) | **MERGED** — `f8c6077`, tag `v1.25.0-statusline-honest`. Composed on top. |
| classify.js sha | `7b01eb86…` INTACT at start (now bumped, see Phase 7) |
| Frontier models installed | NONE — confirmed; pulled 2 of 4 (Paulo's choice) |
| GPU | RTX 4090, 24GB, 17.9GB free; 922GB disk free |
| Phase 6 MCP "to build" | **Already exists** — 16-tool MCP server + `mooter mcp {serve,list,install}` |

## Paulo's gating decisions (AskUserQuestion, start of session)

1. **sha change → "só Tier 5 (Phase 7)"** — classify.js edited for Tier 5 only. Multi-model T0 routing (P2) + vision routing (P3) stayed doc-only.
2. **pulls → Qwen 3.6 27B + Qwen2.5-Coder 32B** (NOT DeepSeek-R1, NOT VL). Consequence: Phase 3 vision is cloud-only (honest), no local VL.
3. **PR strategy → scoped multi-PR** (stacked to avoid shared-file conflicts).

## Phase status

| Phase | Brief | Status |
|---|---|---|
| 0 | Day 0 recon + research | ✅ done |
| 1 | Alignment layer (honesty/uncertainty/statement) | ✅ shipped (PR #1) |
| 2 | Local model frontier | ◑ partial — pulls + `mooter local-models`; classify.js routing NOT changed (Paulo's call) |
| 3 | Multimodal vision | ◑ doc-only — no local VL pulled; vision → @fable/cloud (honest) |
| 4 | OpenTelemetry observability | ⏭ deferred Wave 50 (new deps + instrumentation; own PR) |
| 5 | MooterBench (à la Bloom) | ⏭ deferred Wave 50 (new Apache-2.0 package) |
| 6 | MCP first-class | ◑ 16-tool server already exists; route/savings tools + consumer + registry → Wave 50 (touches frozen pkg) |
| 7 | Tier 5 Fable correct pricing | ✅ shipped (PR #2, sha-change approved) |
| 8 | DM v15 + showcase prep + report | ✅ this doc + `docs/strategy/ANTHROPIC_SHOWCASE_PACK.md` |

## What shipped — detail

### PR #1 `wave49-pr1-alignment-observability` (no sha change)
- `tools/router/statusline-multi.js`: single low-confidence route (<0.60) marked **⚠** in-line (new `TH.CONFIDENCE_WARN=0.60`). Healthy/unknown confidence → no marker.
- `packages/cli/src/commands/explain.ts`: `confidence` split into a dedicated topic; new `uncertainty` (metacognition) topic. Honest, no correctness claims.
- `docs/ANTHROPIC_ALIGNMENT.md`: verifiable value-mapping + explicit "what is NOT claimed" (no affiliation/endorsement).
- Tests: explain 14/14, statusline +2 (the 1 remaining statusline fail is a pre-existing GPU/COLUMNS env failure on this WSL host, not new).

### PR #2 `wave49-pr2-tier5-localmodels` (sha change — **REVIEW BEFORE MERGE**)
- `tools/router/classify.js`: Fable 5 reachable **only** via explicit override (`@fable` / `usa fable`) → T5 / `claude-fable-5`. Classifier **never** auto-routes to T5 (verified). Honored even on high-risk prompts (upgrade).
- `packages/synthesis/src/state/central-state.ts`: `EXPECTED_CLASSIFY_SHA` bumped `7b01eb86…` → `427d8c0b…` (one line; registers the approved change; touches a frozen Wave-29 pkg — flagged).
- `packages/cli/src/commands/local-models.ts` (NEW): `list / recommend / install / switch-default`. `switch-default` persists a pref + prints the `ROUTER_OLLAMA_GENERAL` export; does **not** edit classify.js.
- `explain tiers`: now shows T5 ($10/$50) + honest "no T4" note. `explain vision`: honest "no local vision model today".
- Tests: classify-branches 24/24 (+4 Tier5), explain 16/16, local-models 5/5, sha-guards green (wave 7/7, doctor 6/6), synthesis 90/90, **full CLI 362/362**, build clean.

## ⚠ Pendente Paulo (manhã)

1. **Review the classify.js diff** (PR #2) — sha change `7b01eb86…→427d8c0b…`. Approve before merge.
2. **Merge order:** PR #1 first (no sha), then PR #2 (re-targets main).
3. Tag `v1.27.0-anthropic-aligned` after both merge.
4. Decide DM v15 vs keep v13 (see showcase pack).
5. Wave 50 scope: Phase 4 (OTel) · Phase 5 (MooterBench) · Phase 6 increment (route/savings MCP tools + consumer + registry).
6. DeepSeek-R1 32B + Qwen2.5-VL 7B still NOT pulled (declined this session) — pull when vision/reasoning specialists are wanted.

## Honest expectation vs outcome

Brief predicted "5–7 phases ship, 1–3 deferred." Outcome: **3 fully shipped (1, 7, 8), 3 partial (2, 3, 6), 3 deferred (4, 5, + 6-increment).** Chose depth + honesty over breadth — every shipped claim is tested and verifiable.
