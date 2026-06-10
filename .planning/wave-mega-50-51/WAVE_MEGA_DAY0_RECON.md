# WAVE MEGA 50-51 — Day 0 Recon (2026-06-09)

> Orchestrator: **claude-fable-5** (confirmed running). Worktree `wave-mega-50-51-fable` @ `341b0a9` (= main HEAD).

## Gate Phase 0 — PASS

| Check | Result |
|---|---|
| classify.js sha | ✅ `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — INTACT, matches brief |
| Fable 5 access | ✅ Confirmed de facto — this session runs on `claude-fable-5` via Claude Max |
| Fable 5 pricing | ✅ **$10 in / $50 out per M** confirmed (anthropic.com/news/claude-fable-5-mythos-5, openrouter.ai/anthropic/claude-fable-5) — matches brief assumption |
| Claude Max free window | ✅ Fable 5 included at no extra cost on Pro/Max/Team/Enterprise **2026-06-09 → 2026-06-22**; from Jun 23 burns usage credits (techcrunch.com 2026-06-09, claudefa.st fable-5-usage-credits) |
| git state | ✅ clean, branch `wave-mega-50-51-fable` |

**No STOP criteria triggered. Proceeding — no Opus 4.8 fallback needed.**

## Refuted / corrected brief premises

1. **version.json = `1.25.0`, NOT 1.27.0.** Brief (and memory) assumed 1.27.0 post-Wave-49. The tag `v1.27.0-anthropic-aligned` appears not pushed yet, so the version-sync workflow never bumped it. Wave Mega tags must account for this (version-sync will land the right number on tag push; do not hand-edit out of band).
2. **MCP server already exists as `packages/mcp-server` (16 tools), NOT `packages/mooter-mcp-server`.** Phase 1.C = increment the existing package; creating a new one would violate the frozen-packages doctrine *and* duplicate Wave 30/49 work.
3. **Wave 49 deferred phases confirmed absent** (expected): no `packages/cli/src/observability/`, no `packages/mooter-bench/`.
4. **`~/.claude/skills/` is empty** — the `/moo-*` skills live in repo `.claude/skills/` (10 dirs). Phase 2.C's `~/.claude/skills/mooter/` is personal-infra (allowed per doctrine: harness setup → `~/.claude/`).
5. **`~/.mooter/sessions/` does not exist** on this machine — sessions-orchestrator state not yet materialized here. Phase 4.C must handle empty-state honestly.
6. **AGENTS.md does not exist; CLAUDE.md = 313 lines** — Phase 3 premises confirmed true.
7. **No root package.json / workspaces** — packages are standalone npm packages. MooterBench (1.B) must follow that convention.

## Environment

- Node v20.20.2; Ollama healthy at 127.0.0.1:11434 (qwen2.5-coder:32b present)
- Existing hooks in `~/.claude/hooks/`: PostToolUse.js, conductor-autolock.js, exec-logger.js, frugal-turn-header.js, gsd-statusline.js, gsd-turn-end.js
- statusline-multi.js = narrative single-line (Wave 49 era); Phase 4.B extends with width-aware layouts
- CLI test baseline: **362/362 pass** (fresh worktree needed `npm install` in `packages/cli` AND `packages/router` — cross-package test imports)

## Ship probability estimates (post-recon)

| Phase | Estimate | Notes |
|---|---|---|
| 1 deferred (OTel+Bench+MCP) | 75% | OTel as *optional* dep — must not bloat bundle; MCP increment trivial |
| 2 vibe best | 65% | cascading is advisory-only (sha frozen) — design constraint clear |
| 3 foundation | 85% | mostly docs/skills/hooks, low risk |
| 4 session intel | 70% | statusline width detection straightforward; quota honest-estimates only |
| 5 fable-observe | 55% | logger + commands feasible; Pastor training extension must not corrupt existing LoRA path |
| 6 PRs/report | 100% | — |

## Constraints carried into every phase

- classify.js sha `427d8c0b…` must remain byte-identical (CI-enforced; this wave is observe/learn only).
- Frozen packages untouched except the explicit allowlist in the brief.
- Each phase = own branch off `main` (`feat/wave_mega-N-*`), independently mergeable.
