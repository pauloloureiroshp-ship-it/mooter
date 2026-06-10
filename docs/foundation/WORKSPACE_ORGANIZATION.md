# Workspace Organization — Mooter Monorepo

> **Audience**: any agent (Claude Code session, subagent, spawn) or human landing in this
> repo for the first time. Read this before exploring. ~3 minutes.
>
> Canonical strategy lives in [`docs/strategy/STRATEGY.md`](../strategy/STRATEGY.md) —
> this doc is the *map*, not the strategy. For the self-improving routing loop, see
> [`AUTO_RESEARCH_LOOP.md`](./AUTO_RESEARCH_LOOP.md).

---

## 1. Project graph

```
mooter (monorepo, aka "frugal")
│
├── tools/router/            ❄️ FROZEN CORE — classify.js (sha-pinned) + hooks + statusline
│   │                           UserPromptSubmit hook → <router-hint>; writes decisions.log
│   ├── classify.js          deterministic tier classifier (T0–T3) — NEVER edit (see §3)
│   ├── inject_context.js    live UserPromptSubmit hook (router-hint, Option A, directives)
│   └── statusline*.js       honest cost/savings statusline (4 modes, Wave 32/33.8/48)
│
├── packages/                product engine (TypeScript, mostly wave-frozen — see §3)
│   ├── cli/                 ★ THE product CLI (`mooter …`) — commands + index.ts registry
│   ├── router/              domain classify_domain() regex layer (axis 2)
│   ├── workflow/            local-first dynamic workflows (Ollama fan-out + 1 cloud synth)
│   ├── synthesis/           LLMLingua · LoRA foundation · setup/ecosystem intelligence
│   ├── validation/          bandit learner · adversarial · benchmark v2 · cost-cap
│   ├── mcp-server/          20-tool zero-dep MCP stdio server
│   ├── mooter-bench/        open reproducible routing benchmark (MooterBench)
│   ├── transparency/        statusline modes · token tracker · TUIs
│   ├── effort/              low/default/high/ultramoo session effort modes
│   ├── data-rights/         GDPR export / delete-all / forget-me
│   ├── sessions-orchestrator/  cross-session intelligence over local transcripts
│   ├── spawn-orchestrator/  sandboxed local-first agent spawning (bwrap 4-layer)
│   ├── worktree-conductor/  atomic locks · heartbeats · serial intent queue
│   └── {vllm,turboquant}-backend, arbitrage-monitor, minimax-watcher  (opt-in perf/watchers)
│
├── hub/                     Cloudflare Workers + D1 backend (worker.js, routes/, migrations/)
├── landing/                 Next.js 15 site on Vercel → mooter.ai (auth = Supabase)
│
├── docs/strategy/           canonical strategy docs (STRATEGY.md is the SSoT)
├── docs/foundation/         this doc + AUTO_RESEARCH_LOOP.md + archives
├── .claude/skills/          slash skills (/moo-*, /mooter, workflows…) — 16 after Wave 50-51
├── .planning/               active wave reports (archived to docs/archive/sessions/ on close)
├── SYNC.md                  current project state + next-session handoff
└── INFRA.md                 URLs / IDs / endpoints for every service
```

### Data-flow arrows (the spine of the system)

```
prompt ──► tools/router/classify.js ──► decisions.log (+ deterministic span_id)
                                            │
              ┌─────────────┬───────────────┼──────────────────┐
              ▼             ▼               ▼                  ▼
         statusline    mooter digest   observability      span feedback
         (live chips)  (daily rollup)  export (OTel-ish)  (mooter feedback span)
                                                               │
                                                               ▼
                                          Pastor training (features-only JSONL)
                                          ~/.mooter/pastor/span-training.jsonl
                                          → see AUTO_RESEARCH_LOOP.md

packages/cli ──HTTP──► hub/ (CF Workers + D1)  /v1/events · /v1/pricing · /v1/transparency …
landing/ ◄──fetch──── hub/ /v1/user/dashboard?user_hash=…  (anonymous hash, never raw id)
```

---

## 2. Agent navigation guide — "if your task touches X, read Y first"

| Your task touches… | Read first | Then |
|---|---|---|
| Router behavior / tiers / hints | `tools/router/README.md` + `docs/strategy/ROUTING.md` | `tools/router/inject_context.js` (live hook!) |
| A CLI command (`mooter foo`) | `packages/cli/src/commands/<foo>.ts` | `packages/cli/src/index.ts` (command registration) |
| Benchmark / MLWR numbers | `packages/mooter-bench/` | `packages/validation/` (benchmark v2 + CI gate) |
| MCP tools | `packages/mcp-server/README.md` (20 tools) | `packages/cli/src/commands/mcp.ts` |
| Statusline chips | `tools/router/statusline*.js` | `packages/transparency/` (modes/TUIs) |
| Workflows / local fan-out | `packages/workflow/` | `docs/strategy/MOOTER_DYNAMIC_WORKFLOW_LOCAL.md` |
| Pastor / learned routing / LoRA | `packages/cli/src/commands/pastor.ts` | `docs/strategy/LORA_TRAINING_RUNBOOK.md`, [`AUTO_RESEARCH_LOOP.md`](./AUTO_RESEARCH_LOOP.md) |
| Hub API / D1 schema | `hub/README.md` + `hub/routes/` | `hub/migrations/` (apply via `d1 execute --file`) |
| Landing / mooter.ai | `landing/README.md` | hand-rolled CSS — NOT Tailwind; auth is Supabase |
| Strategy / positioning / copy | `docs/strategy/STRATEGY.md` (SSoT) | `ARCHITECTURE_V4.md` / `V5.md` |
| Current state / what's next | `SYNC.md` | `.planning/` (active wave) |
| Any URL / credential / endpoint | `INFRA.md` | — |

Rules of thumb:
- **Grep before Read; Read windows, not whole files.** The repo is large; most answers fit in 30 lines.
- `tools/cli/` is the legacy *installer* CLI; `packages/cli/` is the *product* CLI. Two CLIs by design (Wave 8).
- `inject_context.js` in the repo IS the live UserPromptSubmit hook of this machine — edits take effect on the next prompt.

---

## 3. Frozen vs editable map

| Zone | Status | Rule |
|---|---|---|
| `tools/router/classify.js` | ❄️ **sha-frozen** | Byte-identical across waves; sha pinned in `classify.js.sha256` and CI-checked. Tier guardrail is the product's trust anchor. Changing it requires Paulo's explicit approval (it has happened exactly once, Wave 49, Tier-5-only). |
| Engine packages (Waves 28–34.5): `workflow`, `synthesis`, `validation`, `mcp-server`*, `transparency`, `effort`, `data-rights`, `vllm-backend`, `turboquant-backend`, `arbitrage-monitor`, `minimax-watcher`, `sessions-orchestrator`, `spawn-orchestrator`, `worktree-conductor` | 🧊 **wave-frozen** | Shipped and reviewer-gated. Don't refactor "while we're at it". Compose around them (host-side bridges, new commands) instead of editing. A wave brief can explicitly unfreeze one (e.g. mcp-server in Wave 50-51 1.C). |
| `packages/cli/` | ✏️ editable | The usual landing zone for new features: new command file + `index.ts` registration. |
| `hub/`, `landing/` | ✏️ editable, deploy-gated | Code edits fine; deploys (wrangler / Vercel) and D1 migrations are Paulo-gated or wave-explicit. |
| `docs/`, `.planning/`, `.claude/skills/`, `SYNC.md` | ✅ always editable | Docs and skills evolve every wave. Strategy docs: semantic names only, no `_V2`/date suffixes (git versions them). |

Invariant restated everywhere because it matters: **anything learned, advisory, or opt-in
biases *within* a tier — `classify.js` tier floors always win.**

---

## 4. Applying this template to other workspaces

This file follows a generic pattern that transfers to any multi-area workspace. Checklist:

1. **Project graph doc** — one ASCII tree, one line of purpose per area, plus the 3–5
   data-flow arrows that explain how the areas feed each other.
2. **Frozen map** — name explicitly what must not be touched (and *how* that's enforced:
   sha pin, CI gate, review gate) vs what is always fair game.
3. **Navigation table** — "task touches X → read Y first". Saves every fresh agent its
   first 20 exploratory tool calls.
4. **AGENTS.md / CLAUDE.md pair** — short operational rules for agents (AGENTS.md,
   tool-agnostic) and the Claude-specific doctrine (CLAUDE.md), both pointing at the
   three artifacts above instead of duplicating them.

Candidate workspaces of Paulo's where this template applies: **Cloude Home**,
**Cloude Speaker**, **Marley Living**. Note: this doc makes **no claims about their
internals** — they were not inspected from this repo and there is no access to them here.
The checklist above is the deliverable to replicate there, with each workspace's own
graph, frozen map, and navigation table filled in on-site.

---

*Wave Mega 50-51, Phase 3.F · Cross-links: [`AUTO_RESEARCH_LOOP.md`](./AUTO_RESEARCH_LOOP.md) · [`../strategy/STRATEGY.md`](../strategy/STRATEGY.md)*
