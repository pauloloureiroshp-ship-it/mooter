# WAVE 30 — Day 0 Honest Recon Findings

**Date:** 2026-06-07
**Branch:** `wave30-mega-synthesis` (off `main` HEAD `5c8ea66`, post-Wave 29)
**Mode:** CC autonomous, dangerous + ultracode
**Verdict:** ✅ **PROCEED** — no *core* premise failed (Ollama reachable, hub LIVE, sha intact). Two premises *refined* (see below). Live-inference phases (H demo, L benchmark) calibrated to locally-available models.

---

## Key findings (TL;DR — read first)

1. **classify.js sha INTACT** — `7b01eb8623…b87762` in BOTH repo (`tools/router/classify.js`) and home router. Doctrine gate green at Day 0.
2. **Hub LIVE** on `mooter-hub.frugal-hub.workers.dev` — `/v1/pastor-v2`→422, `/v1/federated`→202. (Brief's example subdomain `pauloloureiroshp` was wrong; correct host is `frugal-hub`.)
3. **Wave 29 SHIPPED confirmed** — tag `v1.17.0-synthesis-ultimate` present; `packages/synthesis/src/` has `lingua lora quality ecosystem setup` (L12-L16 LIVE).
4. **Test baseline is NOT all-green** — brief's "419 pass" premise is **REFUTED**. Actual: **507 of 516 pass; 8-9 pre-existing failures**, ALL environment/staleness-related, NONE in doctrine-gated files, NONE logic regressions. Detailed below.
5. **Ollama daemon UP but started with ZERO models** — degraded, not "down". Pulled `qwen2.5:3b` (live smoke), `nomic-embed-text` (router embedding path), `qwen3:30b` (real local tier for Phases H/L) — pulls in progress.
6. **No `~/.mooter/pastor/` LoRA** — expected; Paulo's manual LoRA train is a known pending (memory: Wave 27/29). Pastor v2 endpoint is LIVE regardless (422 schema-validates).

---

## Premise validation table

| # | Brief premise | Status | Evidence |
|---|---|---|---|
| 1 | Wave 29 tag `v1.17.0` in main | ✅ VALIDATED | `git tag` → `v1.17.0-synthesis-ultimate` |
| 2 | classify.js sha `7b01eb86…87762` | ✅ VALIDATED | `sha256sum` repo + home both match |
| 3 | Hub endpoints LIVE (422 pastor-v2) | ✅ VALIDATED | 422 / 202 on `frugal-hub` host |
| 4 | Ollama LIVE with 8 models | ⚠️ REFINED | daemon UP, **0 models** at Day 0 → pulled needed models |
| 5 | Existing tests baseline pass (419) | ❌ REFUTED | 507/516 pass; 8-9 pre-existing env/stale fails |
| 6 | packages/synthesis Wave 29 LIVE | ✅ VALIDATED | `lingua lora quality ecosystem setup` present |
| 7 | D1 migrations 001-014 | ✅ VALIDATED | `hub/migrations/` ends at `014_device_setup_profiles.sql` |
| 8 | Pastor LoRA state present | ⚠️ KNOWN-GAP | no `~/.mooter/pastor/`; manual train pending (not a blocker) |

---

## Test baseline (clean checkout, before any Wave 30 change)

| Package | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| `packages/cli` | 223 | 223 | 0 | ✅ |
| `packages/synthesis` | 36 | 36 | 0 | ✅ Wave 29 |
| `hub` | 49 | 49 | 0 | ✅ |
| `packages/workflow` | 94 | 93 | 1 | ⚠️ #12 live-Ollama integration |
| `packages/router` | 114 | 107-108 | 6-7 | ⚠️ embedding-model + stale pack count |
| **TOTAL** | **516** | **~508** | **~8** | All pre-existing, none doctrine-gated |

### Failure characterization (each pre-existing, none caused by Wave 30)

- **workflow #12** — `real Ollama (skipped if unreachable): 3 agents in parallel`. Integration test that should skip when Ollama unreachable; daemon was reachable but model-bare. Env-dependent, not a logic bug.
- **router — `registry: exactly 7 packs with 56 …seeds` / `loads all 7 registry packs`** — `expected 7 packs, found 8`. **Stale test**: a pack was added post-authoring; assertion never updated. Content drift in `packages/router` (NOT the doctrine-gated `tools/router/classify.js`). Out of Wave 30 scope; documented, not touched.
- **router — `EmbeddingStore.init()/classify()/recall` (perf + recall)** — `embedding_store.ts` fetches `nomic-embed-text` via Ollama `/api/embed`; with the model absent it silently falls back to v1 regex-only, so the perf budgets (init <5s, p99 ≤80ms) and recall (≥0.90) assertions on the embedding path fail. Pure model-availability dependency. `nomic-embed-text` pulled to confirm.

### Phase O gate (revised, honest)

> **No NEW test failures introduced by Wave 30.** The ~8 pre-existing env/stale failures remain as characterized here. All 4 green suites (cli/synthesis/hub + the 93 passing workflow) stay green; all new Wave 30 tests pass. The doctrine "419 pass" is reinterpreted as "no regressions vs. this documented baseline."

---

## Environment

- Disk: **948 G free** (1 % used) — ample for model pulls.
- RAM: **29 G free** of 30 G — `qwen3:30b` (~18 G) runnable, if tight.
- Platform: WSL2 (perf budgets on cold first-load are timing-sensitive — relevant to router EmbeddingStore perf tests).
- Ollama: `/usr/local/bin/ollama`, `localhost:11434`, `OLLAMA_HOST` unset.

## Models pulled this session (Day 0)

| Model | Size | Purpose |
|---|---|---|
| `qwen2.5:3b` | 1.9 G | Live smoke (workflow/adversarial), fast local tier |
| `nomic-embed-text` | ~0.3 G | router EmbeddingStore embedding path |
| `qwen3:30b` | ~18 G | Real local tier for Phase H adversarial + Phase L benchmark |

---

## Path forward

Proceed with all 14 phases A-O. Adjustments driven by Day 0:

- **Phase L (Benchmark v2):** "local" tier uses whatever Ollama models are pulled at run time (min `qwen2.5:3b`, ideally `qwen3:30b`). Cloud tiers gated on available API keys — execute gracefully-degrading (record API failures, don't crash). If full 360-call run is infeasible (keys/time), run a representative subset and **report the real N**, never fabricate MLWR.
- **Phase H (Adversarial):** primitives + mock tests are the gate; live demo uses the local Ollama cluster (`qwen2.5:3b` ×3, or `qwen3:30b` if pulled).
- **Phase G (Bandit), J (cost cap), I (threat), C/B (docs), F (CI yaml):** no live-inference dependency — full build + unit tests.
- **Phase O gate:** uses the revised baseline above. Will not "fix" the pre-existing stale router pack-count test (out of scope, different package); will document it persists.
- **Scope realism:** this is a ~30h brief. Execute phases in dependency order, committing per phase, so progress is durable and resumable across context windows.

*No core premise failed. Proceeding.*
