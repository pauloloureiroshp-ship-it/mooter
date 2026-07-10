# Wave 54 — Day 0 Recon (read-only)

> **Phase 0 deliverable.** CCA-F audit harness overnight. Read-only verification of the
> brief's premises BEFORE any code is written. No files outside this doc were changed.
>
> Branch `wave54-ccaf-audit` · classify.js sha **INTACT** · date 2026-06-10.

---

## 1. Recon checklist (with evidence)

| Item | Result | Evidence |
|---|---|---|
| classify.js sha | ✅ **INTACT** | `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` matches the CI-frozen hash |
| Wave 53 merged in main | ✅ **YES** | `7393abb feat(wave53): Local CC Mirror + Anthropic Pride layer (#157)` is HEAD of main |
| fable-observe subsystem present | ✅ **YES** | `packages/cli/src/fable-observe/` → baseline, cca-f-export, config, replicate, schema, store |
| `mooter cca-f export` wired | ✅ **YES** | `index.ts:510` `command === "cca-f"` → `runCcaFExport(rest)` |
| `mooter cca-f export --dry-run` | ❌ **NO SUCH FLAG** | USAGE only supports `--last <N>{d\|h\|w}` and `--format jsonl\|json`. Brief's recon command is wrong (harmless). |
| Pastor LoRA state on disk | ⚠️ **ABSENT** | `~/.mooter/` exists but has **no `pastor/` dir**. No trained adapter materialised on this machine. |
| Pastor code present | ✅ **YES** | `packages/synthesis/src/pastor/` (pastor-state, per-task-router, feedback-incorporator, **adapter-trainer-stub**) + `src/lora/` |
| VRAM free | ✅ **16.6 GB** (16973 MiB / 24564 MiB) | `nvidia-smi` — well over the 6 GB overnight floor |
| Ollama qwen present | ✅ **qwen3:30b** (+ qwen2.5-coder:32b, qwen3.6:27b, qwen2.5-coder:7b, qwen2.5:3b) | `ollama list` |
| `claude` CLI on PATH | ✅ **YES** | `…\npm\claude.cmd` — self-judge can use Claude Max via CLI |
| `ANTHROPIC_API_KEY` | ❌ **NOT set** | env empty → the SDK path (`anthropic-client.ts`) would throw `ANTHROPIC_API_KEY missing` |
| classify.js callable from node | ✅ **YES** | `require('tools/router/classify.js').classify(p)` returns `{tier, recommended_model, confidence, …}` |
| Reusable bench infra | ✅ **YES** | `packages/router/scripts/wave2-benchmark/lib/` → judge.ts, anthropic-client.ts, ollama-client.ts, pricing.ts, stats.ts (mulberry32) + `packages/mooter-bench/` |

---

## 2. Refutations (brief vs reality) — **the brief V2 still has 4 material errors**

Per Doctrine V4 ("refutações são valiosas; se descobres o brief errado, REFUTA + propõe alternative").

### R1 — Audit output path is WRONG (high impact)
- **Brief says:** logs go to `~/.mooter/fable-observe/audit/<timestamp>/`.
- **Reality:** there is **no `~/.mooter/fable-observe/` runtime dir**. The shipped `config.ts` defines:
  - observations → `~/.mooter/fable-observations/`
  - CCA-F export → `~/.mooter/cca-f/` (`ccafDir()`)
- **Fix:** audit run dir = **`~/.mooter/cca-f/audit/<session_id>/`** (sibling under the real `cca-f/` tree). `fable-observe` is the *source folder name* (`packages/cli/src/fable-observe/`), never a runtime path.

### R2 — "Pastor LoRA classifies tier" is FALSE (high impact)
- **Brief B.1 pseudocode:** `tier_pastor = await pastor.classify(prompt)`, then `pastor_match = tier_pastor === tier_classify`.
- **Reality:** `mooter pastor route` / `routeRequest({dryRun:true})` returns an **adapter + task_type**, and explicitly states `tier: classifier owns this — never changed`. **classify.js is the sole tier owner.** Pastor never picks a tier.
- **Fix:** `tier_chosen` = `classify.js`. Pastor contributes a *secondary* signal: `pastor_adapter` / `pastor_task_type` / `pastor_confidence` / `pastor_matched`. Replace the meaningless `pastor_match` (tier==tier) with `pastor_matched` (did Pastor match a per-task adapter at all). Also: no adapter on disk → Pastor will report `matched: no — baseline`, low confidence. Honest.

### R3 — Self-judge transport: SDK reuse will FAIL without the API key (high impact)
- **Brief:** smoke-tests `claude --print --model sonnet` (CLI / Claude Max) **but** Phase B implies reusing the rubric judge.
- **Reality:** the reusable `judge.ts` → `anthropic-client.ts` uses the **Anthropic SDK with `ANTHROPIC_API_KEY`**, which is **absent**. That path throws.
- **Fix:** reuse the judge **rubric + JSON-parse + seeded-order logic**, but swap the transport to `claude --print --model sonnet` (subprocess, Claude Max — no key, no per-token cost). Cost reporting becomes "Claude Max quota usage", not USD. (If Paulo prefers the SDK/USD path, set `ANTHROPIC_API_KEY` and the existing client is drop-in.)

### R4 — Phase C (Pastor learning loop) must be SKIPPED for now (medium impact)
- **Brief's own honest caveat** already allows this: "se Pastor LoRA training infra incompleto → SKIP Phase C".
- **Reality confirms it:** `adapter-trainer-stub.ts` + `bandit-stub.ts` are stubs; no adapter on disk; retrain is manual (`LORA_TRAINING_RUNBOOK.md`). 
- **Fix:** Phase C **writes the high-confidence training-sample `.jsonl` only** (to `~/.mooter/pastor/training_data/`), schedules nothing, and makes **no "Pastor delta" claim** (C.3) until a first adapter is actually trained. The morning report says "Pastor delta: N/A (no trained adapter yet — samples staged for first distill)". No fabrication.

### R5 (minor) — `--dry-run` doesn't exist on `mooter cca-f export`
- Already noted in §1. The export reads the real observation store; with `enabled:false` (default) it simply reports "no observations yet". Not a blocker.

---

## 3. Five mandatory premise checks (brief §Phase 0)

| # | Premise | Verdict | Why |
|---|---|---|---|
| P1 | cca-f export schema matches question-generator input | **FALSE (harmless)** | Export emits *past Fable decisions* (`CcaFExportRecord`); the generator emits *fresh* `CCAFQuestion` from templates+seed. They're orthogonal — the harness does **not** feed export→generator. Mis-framed premise, no blocker. |
| P2 | Pastor LoRA queryable during audit (not training-only) | **TRUE (with correction)** | `routeRequest({dryRun:true})` is deterministic, side-effect-free, queryable live. **But** it returns adapter/task_type, not tier (see R2), and reports baseline (no adapter on disk). |
| P3 | Self-judge rubric achievable in small JSON output | **TRUE** | `judge.ts` already does a 5-field JSON rubric, parsed + clamped. "4-token" is loose; real output ~30-60 tokens. Fully achievable. |
| P4 | 60 q × LLM calls fit Claude Max 5h quota | **TRUE (re-stated)** | NOT "4 LLM calls each": route = classify.js + Pastor (both **zero-LLM**); resolve = 1 call (mostly **free local Ollama**); judge = 1 Sonnet call. ≈60 Sonnet calls over ~4h is trivial for Claude Max **via the CLI** (key absent → CLI, see R3). |
| P5 | Seed-deterministic question generation | **TRUE** | `mulberry32(seed)` already in `lib/stats.ts`; reuse it → same seed ⇒ same 60 questions. |

**Score: 1/5 false (and that one is harmless / mis-framed). < 3 → PROCEED**, with the re-scoping in §2.

---

## 4. Reuse map (do NOT rebuild — Doctrine: "reuse, não duplicate")

| Need | Reuse from |
|---|---|
| Tier decision | `tools/router/classify.js` → `classify(prompt)` (FROZEN, call only) |
| Pastor adapter signal | `@mooter/synthesis` → `routeRequest({prompt, dryRun:true})` |
| Local LLM resolve | `wave2-benchmark/lib/ollama-client.ts` |
| Cloud self-judge | `judge.ts` rubric logic + **new `claude` CLI transport** (not the SDK client) |
| Seeded RNG | `wave2-benchmark/lib/stats.ts` → `mulberry32` |
| Cost/pricing | `wave2-benchmark/lib/pricing.ts` (USD only meaningful if API-key path used) |
| Domain taxonomy | `cca-f-export.ts` already defines `agentic\|cc_config\|prompt_eng\|mcp\|context` — reuse the union |
| Audit dir helper | extend `config.ts` with `ccafAuditDir(home)` = `join(ccafDir, "audit", session_id)` |

---

## 5. Corrected scope for Phases A–F

- **A** Question generator — as briefed (60 = 16+12+12+11+9), seed-deterministic via `mulberry32`, domains reuse the `CcaFDomain` union. ✅
- **B** Orchestrator — **tier from classify.js** (R2), Pastor as secondary signal, resolve via Ollama, **self-judge via `claude` CLI** (R3), logs → **`~/.mooter/cca-f/audit/<session_id>/`** (R1). Failure modes as briefed.
- **C** Pastor learning — **write training-sample `.jsonl` only**, no delta claim, no retrain trigger (R4).
- **D** Report — markdown + JSON; "Pastor delta: N/A" until first adapter; honest caveats verbatim.
- **E** Notion HQ + dashboard chip — Notion MCP available; fallback markdown.
- **F** final-reviewer Opus gate → commit (selective) → PR `--base dev` → schedule overnight cron.

**Honest disclaimer (must appear in every output):**
> "Internal audit using public CCA-F rubric. NOT the official Anthropic exam. Single-cohort
> (Paulo's machine, N=1). LLM self-judge (Sonnet) — bias present. Methodology: packages/mooter-bench/README.md."

---

## 6. Go / No-Go

**GO** — premises hold (1/5 false, harmless). Four design corrections (R1–R4) fold cleanly into
Phases A–F without re-architecting. One open decision for Paulo before the overnight run:

- **Self-judge transport (R3):** use `claude` CLI / Claude Max (no key, "quota" cost) — *recommended*,
  matches the brief's smoke test — **or** set `ANTHROPIC_API_KEY` to use the existing SDK judge (USD cost).
