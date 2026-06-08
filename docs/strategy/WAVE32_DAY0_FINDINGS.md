# Wave 32 — Day 0 Honest Recon Findings

**Date:** 2026-06-08
**Branch:** `wave32-transparency-performance` (base `795f8f9`, post Wave 31 `v1.19.0-pastor-v2`)
**Verdict:** ✅ All CORE premises hold → PROCEED. Several brief architectural details are wrong; documented below with adaptations.

---

## ✅ Core premises confirmed

| Premise | Status | Evidence |
|---|---|---|
| Wave 31 SHIPPED in `main` | ✅ | tag `v1.19.0-pastor-v2`, HEAD `795f8f9`/`eb57bda` |
| `classify.js` sha intact | ✅ | `7b01eb8623a0b8fc…` matches expected `7b01eb86…87762` |
| Hub LIVE | ✅ | `GET /v1/wave-status` → **200**; `POST /v1/pastor-adapters {}` → **422** (validation) |
| Ollama available | ⚠️ partial | `qwen3:30b`, `qwen2.5:3b`, `nomic-embed-text` present — **`qwen2.5-coder:7b` NOT installed** |
| LORAUTER / Pastor v2 code | ✅ | exists in `packages/synthesis/src/lora/` + `src/pastor/` |
| Baseline tests pass | ✅ | 504 tests: synthesis 90/90, workflow 93/94*, validation 69/69, mcp-server 13/13, cli 238/238 |

\* The 1 workflow failure is `real Ollama (skipped if unreachable): 3 agents in parallel` — an environment-dependent integration test, flaky (passed in a prior run same session). **Not a regression.**

---

## ⚠️ Brief architectural premises that are WRONG (adaptations required)

The kickoff brief assumed a structure that does not match the repo. Corrections:

1. **No npm workspaces root.** There is **no root `package.json`**. Each package (`packages/cli`, `synthesis`, `workflow`, `validation`, `mcp-server`, `router`) is standalone with its own `package.json`. Plus separate roots: `hub/`, `dashboard/`, `landing/`, `packs/`, `tools/router/`, `mooter-package/`, `vscode-extension/`.
   → **New Wave 32 packages will be standalone** under `packages/`, consumed by `cli` via relative imports, matching the existing convention (`test: tsx --test tests/*.test.ts`, no build step except cli's esbuild bundle).

2. **`packages/lora-routing/` does NOT exist.** The brief's "NÃO QUEBRAR" list names it, but LORAUTER actually lives in **`packages/synthesis/src/lora/`** (`adapter-registry.ts`, `routing-lorauter.ts`) and **`packages/synthesis/src/pastor/`** (`per-task-router.ts`, `feedback-incorporator.ts`). Wave 31 extended synthesis, not a new package. (Memory note "packages/lora-routing" is also imprecise.)
   → Multi-LoRA (Phase I) will **import from `@mooter/synthesis`**, not a non-existent package.

3. **MCP server uses a single `tools.ts`, not a `tools/` directory.** Current 10 tool definitions (incl. helper interface): `mooter_status`, `mooter_dogfood_log`, `mooter_workflow_create`, `mooter_ecosystem_recommend`, `mooter_pastor_hint`, `mooter_notion_write`, `mooter_pastor_adapter_suggest`, `mooter_obsidian_sync` (8 real tools).
   → The 4 new MCP tools (Phase J adjunct) will be **added to `tools.ts`**, not new files in a `tools/` dir.

4. **`mooter dashboard` already exists** — `packages/cli/src/commands/dashboard.ts` (337 lines). Phase D must **extend/replace honestly**, not greenfield. Existing CLI commands: adapter, benchmark, compression, dashboard, digest, dogfood, ecosystem, env-detect, explain, feedback, forge, hub, init, login, lora, mcp, pack, pastor, quality, quiet, setup, sync, trail, wave, workflow.

5. **`qwen2.5-coder:7b` not installed.** Quant chip (Phase G) and any worker defaults must read **actual** `ollama list` output, not assume that model. Available: `qwen3:30b`, `qwen2.5:3b`, `nomic-embed-text`.

6. **"Ratatui" is a Rust library — this is a Node/TS project.** TUIs (Phases D/E/F) will be implemented as ANSI/escape-sequence renderers in TypeScript (synchronized output, no external Rust dep), "Ratatui-*style*" not literal Ratatui.

7. **vLLM (Phases H/I) requires CUDA/NVIDIA.** Environment is WSL2; no GPU assumed. The installer will be a **real, honest opt-in** that detects prerequisites and refuses gracefully when absent (matching the project's honest-disclosure tradition), with Ollama fallback as the default path. Multi-LoRA serving will be implemented against the vLLM HTTP contract with a deterministic fallback to the Wave 31 LORAUTER selection when vLLM is unreachable.

---

## Current state inventory

- **Hub migrations:** 010–016 present → next is **017**.
- **Hub routes:** delta, events, federated, feedback, heartbeat, models, pastor-adapters, pastor-v2, stats, sync_events, version, wave-status, workflows → add **transparency.js**.
- **`.claude/skills/`:** only `pastor-distill`, `workflows` → add 8 `mooter-*`.
- **`~/.mooter/`:** has `limits.toml`, `state.json`, `dogfood.jsonl`, `mlwr_snapshot.json`, packs/, cli/, auth — no `effort.json`/`statusline.toml`/`transparency.toml` yet.
- **`packs/obsidian-vault-sync/`** present ✅; caveman pack present ✅.

---

## Path forward (adapted phase plan)

Build new standalone TS packages under `packages/` (`transparency`, `effort`, `data-rights`, `vllm-backend`), wired into `cli`. Extend `synthesis` consumers (not core), add to `mcp-server/tools.ts`, add hub `017` + `transparency.js`, publish 8 `.claude/skills/mooter-*`. Honest disclosure for vLLM/Multi-LoRA where GPU is absent. Tag only after dev→main merge.
