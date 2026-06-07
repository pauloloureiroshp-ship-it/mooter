# WAVE 29 — Day 0 Honest Recon · Findings

**Run:** 2026-06-07 · CC autonomous (ultracode + dangerous)
**Branch:** `wave29-synthesis-ultimate` (HEAD `cd808df`, off `main` post-Wave 28)
**Verdict:** ✅ **GO** — all core premises pass. One non-core premise (Ollama) fails but is mitigable by design (opt-in + graceful degradation). No STOP condition.

---

## Premise checks

| # | Premise | Status | Evidence |
|---|---|---|---|
| 1 | classify.js sha256 `7b01eb86…87762` intact | ✅ PASS | `sha256sum tools/router/classify.js` → `7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762` |
| 2 | Wave 28 tag `v1.16.0-workflow-engine-mvp` on `main` | ✅ PASS | tag present; `git branch --contains` → `main`; HEAD `cd808df` (Merge PR #127) |
| 3 | `v1.17.0-synthesis-ultimate` not yet created | ✅ PASS | absent (will tag post-merge per lesson) |
| 4 | Existing test baseline | ✅ PASS | **345 total**: cli 219, workflow 94, hub 32 — all green, 0 fail |
| 5 | Setup-detect files exist (reuse, not recreate) | ✅ PASS | `hardware-matcher.js`, `detect-subscriptions.js`, `vram_detect.js`, `gpu-probe.js` all in `tools/router/` |
| 6 | Vision + synthesis + arch docs exist | ✅ PASS | `MOOTER_ULTIMATE_VISION.md`, `MOOTER_STRATEGIC_SYNTHESIS.md`, `ARCHITECTURE_V4.md` present |
| 7 | CF Worker config | ✅ PASS | `hub/wrangler.mooter.toml` → `name = "mooter-hub"` |
| 8 | packages structure | ✅ PASS | `cli`, `router`, `workflow` present; `synthesis` to be created (new) |
| 9 | Ollama models available (qwen2.5-coder:7b, qwen3:30b) | ⚠️ **PARTIAL (non-core)** | daemon IS up (`ollama --version`=0, `/api/tags`→`{"models":[]}`); **zero models installed**. (Day-0 `which ollama` missed the binary; `spawnSync` finds it. Corrected during Phase E.) |
| 10 | node/npm toolchain | ✅ PASS | node v20.20.2, npm 10.8.2; deps installed for cli + workflow |

---

## Ollama failure — analysis & mitigation (non-blocking)

**Why it's not a STOP:** none of Wave 29's *build / test / migration* work requires a live Ollama daemon. The Wave 28 workflow tests (94) and cli tests (219) pass with Ollama down. Every Wave 29 feature is opt-in and must degrade gracefully when no local backend is present — which is the correct architecture regardless:

- **L12 LLMLingua** — compression backend optional; `mooter compression test` reports "no backend (dry-run)" when neither Python `llmlingua` nor a local model is reachable. JS heuristic fallback still demonstrable.
- **L13 LoRA** — `routing-stub.ts` returns `null` by design (no auto-swap until Wave 31); `lora-loader.ts` surfaces a clear "Ollama unreachable" error on manual `load`.
- **L14 Setup / L15 Ecosystem / L16.1 telemetry** — zero Ollama dependency (hardware detect, catalog JSON, D1 schema + logger).

**Impact:** the *live e2e demo with FREE local workers* (Wave-28-style fan-out) cannot be exercised this session — the Ollama daemon is up but has **no models** (`ollama pull qwen2.5-coder:7b` needed). Paulo can run the live demo after pulling a model. All deliverables build, test, and demo (in degraded/dry-run mode) without it.

**Decision:** proceed. Design every runtime feature with explicit "backend absent" handling and assert that path in tests.

---

## Confirmed constraints carried into B–L

- `classify.js`, `inject_context.js`, `subagentstop_hook.js`, `packages/sync/`, `packages/workflow/` — **NOT TOUCHED**.
- `gsd-statusline.js` lines 1–2 — **NOT TOUCHED**; only opt-in line 3 added via separate status helpers.
- Pastor v1 schema (`011_sync_events.sql`) — preserved; only **new** migrations 013/014 added.
- Telemetry: structured features only, **never** prompt content; DP noise + k-anonymity ≥50 on any public aggregate.
- Tag only after dev→main merge; classify.js sha re-verified at the gate.
- `packages/cli npm run build` (esbuild bundle) run **before** PR (Wave 28 Phase I lesson).

**Phase A: ✅ complete. Proceeding to Phase B.**
