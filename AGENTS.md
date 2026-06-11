# AGENTS.md — Mooter

Tool-agnostic instructions for any coding agent working in this repository.
Claude-specific instructions live in `CLAUDE.md` (root) — read that too if you are Claude.

## Project overview

**Mooter** (mooter.ai, MIT) is a local-first LLM router for Claude Code. A deterministic
regex classifier routes every prompt in <50ms to the minimum viable tier: local Ollama
models first (free), cloud models (Haiku/Sonnet/Opus) only when justified. The router
learns forever from local telemetry (the "Pastor"), never proxies prompts, and never
fabricates metrics. Mission: **"Your LLM router. Local-first. Learns forever."**

## Architecture map

| Path | What it is |
|---|---|
| `tools/router/` | The live engine: **frozen classifier** (`classify.js`), Claude Code hooks (`inject_context.js`, badges), statusline, telemetry. This directory is wired into the user's live Claude Code session. |
| `packages/*` | Standalone npm packages (NOT a workspace/monorepo — each has its own `package.json` and `node_modules`). |
| `landing/` | Next.js 15 marketing + dashboard site (mooter.ai, Vercel, Supabase auth). |
| `hub/` | Cloudflare Workers backend + D1 database (anonymous telemetry sync, `/v1/*` API). |

### Packages (one-line purpose each)

- `packages/cli` — the `mooter` CLI (packs, digest, explain, doctor, sync, workflow…); tsx-native, esbuild-bundled for install.
- `packages/router` — domain router: axis-2 `classify_domain()` regex layer.
- `packages/workflow` — local-first workflow engine: Ollama worker fan-out + ≤1 cloud synthesis, sandboxed, SQLite resume.
- `packages/synthesis` — LLMLingua compression · LoRA hot-swap foundation · setup intelligence · ecosystem awareness · prompt-quality telemetry.
- `packages/validation` — bandit learner (Thompson sampling) · adversarial review · Benchmark v2 (MLWR) · CI regression gate · cost-cap · recovery.
- `packages/transparency` — 4 statusline modes, inline token tracker, dashboard/watch TUIs.
- `packages/effort` — effort modes (low/default/high/ultramoo); advisory only, tier floors win.
- `packages/data-rights` — GDPR export / delete-all / forget-me (redacted, privacy-audited).
- `packages/mcp-server` — zero-dep MCP stdio server (20 tools, hand-rolled JSON-RPC 2.0).
- `packages/sessions-orchestrator` — cross-session intelligence over local Claude Code transcripts (read-only, no network).
- `packages/spawn-orchestrator` — local-first agent spawning in isolated worktrees + 4-layer bwrap sandbox.
- `packages/worktree-conductor` — cross-terminal orchestration: atomic locks, heartbeats, serial intent queue.
- `packages/vllm-backend` — opt-in vLLM serving + Multi-LoRA (graceful refusal without CUDA).
- `packages/turboquant-backend` — opt-in experimental 3-bit KV-cache quantization (source build).
- `packages/arbitrage-monitor` — opt-in provider status-page poller; advisory within-tier bias only.
- `packages/minimax-watcher` — polls HuggingFace for MiniMax-M3 GGUF weights; opt-in install when released.
- `packages/mooter-bench` — MooterBench: open, reproducible routing benchmark (honest methodology).

## Conventions

- **TypeScript via `tsx`** at runtime (no build step for most packages); `node:test` for tests.
- **Zero-dependency bias**: prefer Node builtins. New runtime deps need a strong reason.
- **esbuild bundle for the CLI**: `packages/cli/mooter.js` is built on install/CI, never committed. Engine packages with native deps must NOT be imported into the CLI bundle (use graceful shell-out/refusal instead).
- **Standalone packages, no workspaces**: install and test each package in its own directory.
- **Selective commits**: stage exactly the files you changed; never `git add -A`.
- **Honest-copy doctrine**: never fabricate metrics, benchmark numbers, ratings, or user counts. Every public claim cites a real source (test run, log, commit). When a premise is wrong, refute it rather than build on it.
- All I/O in packages is injectable for tests; packages are privacy-first (no prompt content leaves the machine).

## Invariants (hard, CI-enforced where noted)

1. **`tools/router/classify.js` is FROZEN.** Never modify it. CI enforces its sha256:
   `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
2. **Frozen engine packages** (waves 28-34.5) stay untouched unless the active wave brief explicitly allowlists specific files.
3. **Tier ladder**: T0-T3 are auto-routed; **T5 (Fable) is opt-in only via `@fable`** and is never auto-routed. There is no T4. High-risk prompts (deploy/secrets/migrations) floor to T3.
4. No new root `.md` files without an explicit request.

## Running tests

```sh
# CLI (the main suite)
cd packages/cli && npm install && npm test

# Fresh worktrees: packages/router must be installed too (cli depends on it locally)
cd packages/router && npm install && npm test

# Any other package — same pattern, each standalone
cd packages/<name> && npm install && npm test

# Router engine / hooks / statusline tests
cd tools/router && npm test

# Landing (vitest + next build)
cd landing && npm install && npm test && npm run build
```

## Running the bench

```sh
cd packages/mooter-bench && npm install && npm test
# then see its README / package.json scripts for the benchmark run itself
```

## Cross-references

- `CLAUDE.md` — Claude Code-specific project instructions (lean; pointers).
- `docs/strategy/STRATEGY.md` — strategic single source of truth.
- `SYNC.md` — current state, last sessions, next mission.
- `INFRA.md` — deploy targets, service IDs, endpoints.
