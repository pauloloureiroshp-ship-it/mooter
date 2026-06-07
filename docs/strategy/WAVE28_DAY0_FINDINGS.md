# Wave 28 — Day 0 Honest Recon · Findings

**Date:** 2026-06-06 · **Branch:** `wave28-workflow-engine` (off `main` @ `29583d7`)
**Verdict:** ✅ **GO for Phase B.** All core premises hold; three brief premises need minor adjustment (documented below). No core-premise failure.

---

## Key findings (TL;DR — read first)

1. **classify.js sha intact** — `7b01eb8623a0b8…87762` ✔ matches the frozen gate value.
2. **Ollama is available** — but on the **Windows host (`172.25.48.1:11434`)**, not WSL `localhost`. `qwen2.5-coder:7b` present (the router's canonical worker). `qwen3:30b` **absent** — but the router itself deprecated it in Wave 2 (ADR 017), so this is *consistent*, not a blocker. Alternatives present: `qwen2.5-coder:14b`, `deepseek-r1:7b`.
3. **Baseline green** — `packages/cli` 212/212 tests pass before any change.

---

## 1. Stack confirmed

| Check | Result |
|---|---|
| `packages/` contents | `cli`, `router` only — **`workflow/` does NOT exist yet** ✔ |
| `packages/cli` module system | `"type": "module"` (ESM), **tsx-native, no build step** (ADR 016), `bin → ./src/index.ts` |
| Command dispatch | `if (command === "…")` chain in `src/index.ts` (243 lines), not a `switch` |
| Command return contract | `CmdResult { exitCode: number; output: string }` (defined in `commands/trail.ts:23`) |
| Test runner | `tsx --test tests/*.test.ts` (node:test), tsx in `packages/cli/node_modules/.bin` |
| Node version | `v20.20.2` |
| `tools/router/vram_detect.js` | **exists** ✔ (Phase C import target — do NOT recreate) |
| Root `package.json` workspaces | **none** — packages are standalone (each owns its deps) |
| Any `tsconfig.json` in repo | **none** — fully tsx-native, no typecheck in test path |

## 2. Subagents (intact, 6)

`cheap-triage`, `final-reviewer`, `local-summarizer`, `local-transformer`, `model-architect`, `model-reasoner` — all present in `~/.claude/agents/`. None to be renamed (anti-pattern checklist).

## 3. Ollama models available (Windows host)

Reached at `http://172.25.48.1:11434/api/tags` (WSL gateway = Windows host; `localhost:11434` is **refused** from inside WSL — NAT networking):

| Model | Size | Role for Wave 28 |
|---|---|---|
| `qwen2.5-coder:7b` | 4.7 GB (Q4_K_M) | **Primary worker** (matches router default, ADR 017) |
| `qwen2.5-coder:14b` | 9.0 GB (Q4_K_M) | Heavier code worker (alternative) |
| `deepseek-r1:7b` | 4.7 GB | Reasoning worker (alternative to the absent qwen3:30b) |
| `nomic-embed-text` | 0.27 GB | Embeddings (future) |
| `gemma4:e4b` | 9.6 GB | General (alternative) |

`ollama` binary is **not on the WSL PATH** — it runs as the Windows app (`…/AppData/Local/Programs/Ollama/ollama.exe`). The CLI router talks to it over HTTP, so this is fine.

## 4. Concurrency (theoretical)

`nvidia-smi` (from WSL): **18984 MiB free / 24564 MiB total** (RTX 4090-class). Comfortable for ~2–3 concurrent `qwen2.5-coder:7b` instances (~5 GB each) or the 14b plus headroom. Ollama itself serialises/queues, so the pool concurrency target (~8 in the brief) is bounded more by Ollama's internal scheduling than VRAM at the 7b size. Phase C will use `vram_detect.js` for the real number.

## 5. V4 doctrine confirmed (with a naming nuance)

`docs/strategy/ARCHITECTURE_V4.md` confirms the skill-graph concept, but the **layer numbering differs from the brief**:
- §2.4 — "Gap nº 4 — Skill graph (task decomposition routing)"
- §3.3 — **Layer 9** = Skill graph decomposition
- §3.4 — **Layer 10** = Provider arbitrage monitor

The brief calls this "Layer 10 — Skill Graph"; V4 actually files skill-graph under **Layer 9** (Layer 10 = provider arbitrage). Cosmetic — the *concept* is squarely in V4. Findings/commits will refer to it as "skill-graph (V4 Layer 9/10)".

## 6. CF Worker config confirmed

`hub/wrangler.mooter.toml` is canonical (`mooter-hub`, D1 `mooter-hub` id `3659b56e…`, R2 `mooter-hub-storage`). Migrations present: **001–011** → Phase H adds **012** only. Crons currently disabled (Free-plan limit) — Phase H telemetry is request-driven, unaffected.

---

## Brief premises that need adjustment

| # | Brief said | Reality | Action |
|---|---|---|---|
| P1 | Ollama models incl. `qwen3:30b` | `qwen3:30b` absent; router deprecated it in Wave 2 (ADR 017) | Use `qwen2.5-coder:7b` (primary) + `deepseek-r1:7b` as the "reasoning" alternative. Update Phase C worker list. |
| P2 | `tsconfig.json` "extends do packages/cli" | `packages/cli` has **no** tsconfig (none in repo) | `packages/workflow/tsconfig.json` is **standalone** (target ES2022, NodeNext-ish, `allowImportingTsExtensions`, `noEmit`). |
| P3 | Ollama at `localhost:11434` | Reachable only at Windows-host gateway `172.25.48.1:11434` from WSL | Phase C pool must honour `OLLAMA_HOST` env (reuse `ollama_call.sh` convention); recommend `OLLAMA_HOST=http://172.25.48.1:11434` in this env, or WSL mirrored networking. |
| P4 | "333 existing tests" | Baseline is **212** in `packages/cli` (other suites — router/hub — counted separately) | Gate phrasing: "all existing suites still green" rather than a fixed 333. |

## Phase B path forward (what gets built)

- New standalone package `packages/workflow/` (own `package.json`, `tsconfig.json`).
- **Stubs are dependency-free at module load** — they do NOT import the native/heavy deps (`isolated-vm`, `better-sqlite3`, `ink`, …) yet. Those are *declared* in `package.json` for Phase C's `npm install`, but importing them now would (a) require native compilation this session and (b) risk breaking test load. Stubs throw `NotImplementedError(feature, phase)` instead.
- CLI integration via **dynamic import only** — `packages/cli/src/commands/workflow.ts` never statically imports the engine, so the existing CLI never loads native deps at startup (keeps all 212 CLI tests load-safe).
- Phase B gate for `packages/workflow` tests runs via the CLI's already-installed tsx (`../cli/node_modules/.bin/tsx`) since there are no workspaces and no `packages/workflow/node_modules` yet; Phase C runs a real `npm install` there.

## Anti-break checklist status (Phase B scope)

`classify.js` sha intact · `inject_context.js` untouched · 6 subagents untouched · `subagentstop_hook.js` untouched · `mooter sync` untouched · CF routes untouched (012 deferred to H) · statusline untouched (line 3 deferred to H) · existing CLI tests green.
