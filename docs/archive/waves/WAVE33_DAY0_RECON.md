# Wave 33 Ultimate — Day 0 Honest Recon

**Date:** 2026-06-08 · **Branch:** `wave33-ultimate` (base `main @ 32d0c9c`)
**Verdict:** No finding reveals a bug >30min. Proceeding without escalation. Two brief premises corrected below.

---

## The 10 recon points

### 1. classify.js sha INTACT ✅
- Canonical path is **`tools/router/classify.js`** (NOT `packages/router/src/classify.js` as the brief assumed).
- `shasum -a 256` = `7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762` → matches sacred `7b01eb86…87762`.
- Last content modification was Wave 9 (`d46f8c2`); frozen since Wave 11 (12 waves). The brief's "git log should be empty since Wave 11" is satisfied in spirit — no mutating commit since.

### 2. 3 LOW nits Wave 32 final-reviewer — ⚠️ only 1 recoverable
- **Nit #1 (FIXED):** `mooter data delete-all` also wipes the router `decisions.log` (`~/.claude/tools/router/decisions.log`) but the GDPR doc didn't disclose it. Fixed in commit `1568b24` (`docs/compliance/GDPR_DATA_RIGHTS.md`).
- **Nits #2 & #3: UNRECOVERABLE.** The full final-reviewer report was never committed; Notion session page (`3796f6e4-2bc4-8110…`) records only the *count* "0-HIGH / 0-MED / 3-LOW", not the text. Repo + Notion both checked.
- **A.4 plan (honest):** address #1 (already done) + run a fresh LOW-severity mini-audit on the 4 Wave 32 packages (`transparency`, `effort`, `data-rights`, `vllm-backend`) to surface equivalent nits. Do NOT fabricate the missing two.

### 3. Statusline audit — ✅ rename targets located
- Source of truth: **`tools/router/statusline-multi.js`**. Modes dispatcher: `tools/router/statusline-modes.js` (`VALID_MODES` = mini/compact/full/didactic; reads `~/.mooter/preferences.json` key `statusline_mode` at line 47).
- `turn`/`alltime` UX labels emitted at `statusline-multi.js:367,368` (1-line proof), `:975,976` (2-line), `:546` (view-C rotation), and `dashboard.ts:280` (SAVINGS box row). **These are the A.3 rename targets.**
- `mooter explain statusline` = `packages/cli/src/commands/explain.ts` (`STATUSLINE_GUIDE` const lines 10-38; predates turn/alltime + modes → needs A.3 doc update).

### 4. Workflow widget — ✅ ALREADY SHIPPED (Cenário A)
- `packages/cli/src/commands/dashboard.ts:343-355` renders `WORKFLOWS (recent)` always; `runDashboard()` (`:389-401`) lazily imports `listRuns(5)` from `workflow/src/state.ts`. Empty state prints "no workflow runs yet". The validation "absent" was just the empty state.
- **C.2 reduces to:** verify rendering + improve empty-state copy. No new widget needed.

### 5. Hardware widget COLUMNS gate — ⚠️ brief mis-located it
- The dashboard `HARDWARE` widget (`dashboard.ts:330-340`) has **NO** COLUMNS gate — always renders inside the box.
- The gate is on the **statusline GPU chip**: `statusline-multi.js` `TWO_LINE_THRESHOLD=120` (`:567`) + `COMPACT = COLUMNS<100` (`:512`). Below 120 cols the whole 2-line layout (incl. `gpuChip`) collapses to 1 line → GPU chip vanishes.
- **C.1 reorients to:** add a compact GPU render (`🎮 RTX4090 50%`) into the 1-line / narrow path of the statusline, with breakpoints (<100 / 100-119 / ≥120). Dashboard widget already fine.

### 6. unsloth + transformers compat (web, 2026-06) — ✅ resolved
- Blocker was `unsloth==2025.5.1` (needs transformers `<4.46`). Current unsloth = **`2026.6.1`** (PyPI 2026-06-03), pins transformers `>=4.51.3,<=5.5.0` minus a known-broken exclusion list.
- **Recommended pin set:** `unsloth==2026.6.1` · `transformers==4.56.0` (clears all `!=` exclusions) · `peft>=0.18.0` · `trl>=0.18.2,<=0.24.0` · `accelerate>=0.34.1` · `bitsandbytes>=0.45.5,!=0.46.0,!=0.48.0`.
- A.5 = update requirements + `pip install --dry-run` smoke (no GPU train; Paulo runs RTX 4090 overnight).

### 7. TurboQuant AmesianX fork — ⚠️ SOURCE-ONLY, MED risk
- No binary releases. Build = CMake + CUDA 12.8 (standard llama.cpp toolchain). Fork actively rebased on mainline (last commit 2026-06-07).
- Enable via CLI flags: `--cache-type-k tbq3 --cache-type-v tbq3`. Verified 3.6–5.2× KV reduction (model-dependent, ~8-17% math-bench accuracy cost).
- **Mainline llama.cpp REJECTED the PR (#21089 closed 2026-06-02); Ollama PRs closed too.** No convergence path → fork is the only route.
- **B.1 plan:** ship `@mooter/turboquant-backend` as an opt-in build-script wrapper (clone+cmake+make) + feature flag `MOOTER_TURBOQUANT=1` + statusline chip. Mark `experimental`. Actual build deferred to Paulo's GPU box (no GPU here) — same pattern as vllm-backend.

### 8. vLLM backend EAGLE-3 hook points — ✅ located
- `packages/vllm-backend/src/installer.ts:57-64` `planInstall()` steps array launches `python -m vllm.entrypoints.openai.api_server --port N --enable-lora` (no speculative flags). `client.ts:25-31` `CompletionRequest` has no speculative field.
- **B.2 hook:** extend `planInstall()` opts with `eagle3?` → append `--speculative-model <draft> --num-speculative-tokens N` to the launch step; add GPU-memory check + graceful fallback. Add `eagle3` field to install opts + statusline chip.

### 9. MiniMax M3 weights — ⚠️ NOT released yet
- As of 2026-06-08 weights are NOT public. `MiniMax-AI/MiniMax-M3` GitHub = placeholder; HuggingFace `MiniMaxAI` org has no M3; no `*-M3-GGUF` repos exist. Expected ~June 10-11.
- **B.3 plan (correct as briefed):** ship `@mooter/minimax-watcher` (poll HF API) + opt-in `mooter minimax-m3 install` + statusline chip. Do NOT build on weights — watcher flips when they land.

### 10. FRIENDS_LAUNCH_DMS — ✅ exists
- `audit/FRIENDS_LAUNCH_DMS.md` (6KB) + `_v7.md` + `_v8.md` (today, 11KB). D.1 will produce a Wave-33-numbers refresh (the brief's `_v2` name collides with existing `_v7/_v8` → will use `FRIENDS_LAUNCH_DMS_v9.md`).

---

## Brief corrections (carry forward)
| Brief assumed | Reality |
|---|---|
| classify.js at `packages/router/src/` | It's `tools/router/classify.js` |
| 3 LOW nits findable in repo/PR | Only 1 recoverable; 2 lost (never committed) |
| Workflow widget never shipped | Shipped & rendering (empty-state only) |
| Hardware COLUMNS gate in `dashboard.ts` | Gate is in `statusline-multi.js` (GPU chip) |
| MiniMax M3 weights ~live | Not released as of 2026-06-08 (watcher only) |
| `FRIENDS_LAUNCH_DMS_v2.md` is the next name | `_v7/_v8` exist → use `_v9` |

## Scope reality (Blocks B-class)
TurboQuant build, EAGLE-3 draft, MiniMax weights, and LoRA training all require GPU/weights NOT available in this environment. Per Waves 29-32 precedent, these ship as **real opt-in TS packages (installers + detection + honest stubs/disclosure)**; the GPU-bound execution is documented as a Paulo pendente. classify.js stays INTACT throughout.
