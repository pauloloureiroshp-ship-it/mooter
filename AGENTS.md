# AGENTS.md — Mooter

Tool-agnostic instructions for any coding agent working in this repository.
Claude-specific instructions live in `CLAUDE.md` (root) — read that too if you are Claude.

## Project overview

**Mooter** (mooter.ai, MIT) exists so a vibe coder can operate like a master without studying
every day: it sets up, watches, and pilots a real multi-agent project from inside VS Code with
total visibility — alerting foundation gaps (skills, memory, loops, file structure), applying
vibe-coding best practices automatically, and making the magic visible (Live Preview).
Under the hood, the engine and moat: a deterministic local-first router (<50ms, $0 to classify)
that orchestrates multiple LLM subscriptions (Anthropic, OpenAI, Google) plus the user's own
GPU (Ollama), routing every prompt to the minimum viable tier and learning forever from local
telemetry — never proxying prompts, never fabricating metrics. The engine is the moat; the
cockpit is the product. A change earns its place by improving one of five experiences:
**Resume · Plan · Route (invisible) · Watch · Review**.

## Agent boot & freshness

Every agent (Codex especially — it reads this file natively) boots the same way, so all three
planes (Claude Code · Codex · local moos) start on the same page:

1. **Read** this `AGENTS.md` + the tail of `SYNC.md` (current state).
2. **Consult the vault** for anything about Paulo's identity, project strategy, or a stable
   decision — don't guess. `VAULT_PATH` is exported per-machine — vault at the home root on both OSes, outside Documents/OneDrive/iCloud (Win:
   `…\paulo-vault`, Mac: `~/paulo-vault`):

   ```sh
   # if the retriever exists use it; otherwise read the vault canon files directly and continue
   if [ -f "$VAULT_PATH/.claude/3rd-brain/retrieve.js" ]; then
     node "$VAULT_PATH/.claude/3rd-brain/retrieve.js" "<topic in Paulo's words>"
   else
     ls "$VAULT_PATH"/00-*/ "$VAULT_PATH"/80-notion-mirror/ 2>/dev/null   # then read the top matches
   fi
   ```

   Read the top 1-2 files it returns. **Order of truth:** vault canon (`00-90`) >
   `80-notion-mirror` > repo `MEMORY.md` > conversation. Never fabricate context.
3. **Freshness — vault (Obsidian):** before consulting, refresh —
   `git -C "$VAULT_PATH" pull --ff-only` (if it has a remote) + `node "$VAULT_PATH/.claude/3rd-brain/build-index.js"`
   (~80ms). In Claude Code this is automatic on SessionStart; Codex/moos run it by hand.
4. **Freshness — Notion (honest):** the `80-notion-mirror/` may be days behind — check
   `…/_sync/manifest.json`; if stale and relevant, say "Notion ~N days behind — run the
   `notion-to-vault` skill." Never present a stale mirror as the current state.

**Roles.** Codex works in its own worktree/branch and **never** merges, pushes, deploys, or
deletes (Paulo's gate). **Output:** every handoff follows `docs/strategy/PERFECT_HANDOFF_SPEC.md`
(STATE · mechanical GATE · worktree-true provenance · complete PENDING · `n/d`, never a guess).

## Pre-Dispatch Red-Team Gate

Before emitting a MASTERPROMPT, HANDOFF, DECISION CONTRACT, public copy, canon,
or architectural decision, answer all eight canonical question keys in order
with concrete evidence:

1. **fonte de verdade**
2. **escritor único**
3. **reversível vs irreversível**
4. **script-first**
5. **projeção vs 2ª verdade**
6. **degradação graciosa**
7. **frozen/allowlist/n-d**
8. **custo de reverter**

**Anti-sycophancy:** o gate DEVE produzir ≥1 objeção real ou declarar o que
tentou refutar; gate que só aprova = não rodou. Level-2 MASTERPROMPT and
DECISION CONTRACT artifacts carry the visible council footer defined by
`docs/agent-context/AGENT_CONTEXT_PROTOCOL.md`; an unverified run is `n/d`, never
fabricated `8/8`. Conceptual mirror: Paulo's vault
`00-core/reasoning-protocol.md` Axiom 4. The repo section above is the operational
canon for the eight questions; the vault is not duplicated here.

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

## Communication protocol (orchestrator ⇄ this agent)

Mooter is developed across two agents plus a human gate:

- **Cowork** (Claude Desktop) — orchestrator/architect: designs, red-teams, writes masterprompts, confronts the git/Ledger, keeps memory.
- **Claude Code** (this agent) — executor: worktrees, code, tests, merges; delegates iterative work to local moos ($0).
- **Paulo** (human) — authorizes every irreversible action (merge, push, delete). Never self-authorize these.

**Inbound (Cowork → you)** arrives as a typed handoff:

```
⇄ COWORK → CC · <task>
🎯 GOAL   one line, tied to the thesis
📍 WHERE  worktree ../frugal-X · branch feat/X · from main
▶  DO     steps, or "read and follow _handoff/X.md"
🔒 GUARD  classify.js frozen · selective git add · no push without OK
✅ GATE   node --test · sha intact · required proof
⏭  NEXT   what comes next
📋 BACK   what to paste back for Cowork to validate
```

**Outbound (you → Cowork) — the handoff that never lies:**

- **Run the preflight FIRST — before you write a single line of the handoff:**
  ```
  npm run handoff:preflight        # skeleton: every spec field, mechanical ones pre-filled
  npm run handoff:qa               # this session's Q&A, verbatim, zero LLM
  ```
  This is not advice. On 2026-07-16 a handoff was written **three times** before it was right, by an
  agent that had read this very file — because a rule in prose does not enforce itself. The preflight
  parses `PERFECT_HANDOFF_SPEC.md` for the required fields, fills the ~90% that are mechanical (git,
  sha, unpushed across **all** worktrees, derived STATE), marks judgement fields as loud `<<TODO>>`,
  and writes `n/d` wherever it cannot verify. It fails (`--check`) if the spec grows a field it does
  not know, so the format cannot silently drift. Cost: $0, no model.
- **`DECISIONS` is recovered, never remembered.** `npm run handoff:qa` reads the Claude Code transcript
  and emits every question with **all** options and the chosen answer, verbatim. Do not hand-transcribe
  it — that is how the spec's hole nº2 (truncated questions) comes back. Note the Ledger cannot serve
  this: `kind:decision` carries only `output_hash`/`idem_key` — the shape, not the content.
- Report the branch where **work** happened (the git-write worktree), never where you last `cd`'d. Provenance is the Ledger (`tools/router/*ledger*`).
- Include real git state (unpushed / uncommitted / PR / CI), completed steps (for dedup), and a confidence signal. Reference context, don't dump it.
- `uncommitted` is the red alert — it is the only work that can be lost.
- **Confront before you emit:** before issuing a handoff that touches a front, read that front's real state (git/worktree/last handoff). Never assume it is undone; if it exists, iterate — don't restart.

**Rule of thumb:** structured handoff for execution; prose for deciding. The human authorizes the irreversible. Canonical repo contract: `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md`. Conceptual mirror in Paulo's vault (maintained by Cowork).


## Information architecture — where a doc lives (and when it dies)

Every `.md` in this repo has exactly one home and one lifecycle. Before creating a file, find its row. Canonical repo source: this `AGENTS.md` § Information architecture. Conceptual mirror in Paulo's vault (maintained by Cowork).

| Type of content | Home | Lifecycle / trigger |
|---|---|---|
| Masterprompt / handoff to execute | `_handoff/` | **Ephemeral.** When the wave ships (or is superseded), move to `_handoff/_archive/YYYY-MM/` **in the same PR that ships it**. Never leave executed masterprompts at top level. |
| Living feature spec (1 per feature) | `docs/strategy/<FEATURE>_ROADMAP.md` | Updated in place while the feature evolves. Multiple overlapping studies ⇒ consolidate into the one canonical file, archive the rest. |
| Strategy canon (STRATEGY, ARCHITECTURE, VISION) | `docs/strategy/` | Stable; updated by decision. Historical wave kickoffs/findings do NOT live here — archive to `docs/archive/`. |
| Current project state | `SYNC.md` (root) | **Snapshot, not a log.** Current state + last few sessions only (~200 lines). Older entries roll into `docs/foundation/SYNC_ARCHIVE_<year>.md`. |
| Durable architectural decision | `MEMORY.md` (root) | Distilled from LOOP/waves, append-only. If a decision survives ~a month of sessions, it belongs here. |
| Execution learning (observed/hypothesis/experiment) | `LOOP.md` (root) | Append-only, same day as the learning. |
| Infra / endpoints / service IDs | `INFRA.md` (root) | Update in the same PR that changes infra. |
| Stable personal decision / identity / cross-project | Cowork vault (`~/paulo-vault`) | By decision, never by session. |
| Work log / milestones | Notion HQ Mooter | Per session/milestone. |
| Mechanical provenance | Ledger (`tools/router/*ledger*`) | Automatic, append-only. |

**Consolidation triggers (the loop that prevents re-pollution):**

1. **Wave shipped** ⇒ same PR: archive its masterprompt → `_handoff/_archive/YYYY-MM/` · update `SYNC.md` snapshot · append `LOOP.md` if something was learned.
2. **3+ stable LOOP entries on one theme** ⇒ distill one `MEMORY.md` entry.
3. **Feature studies multiply** (2+ docs on the same feature) ⇒ merge into the feature's single living spec; archive the sources.
4. **`SYNC.md` > ~200 lines** ⇒ roll history into the archive file.
5. **Strategic decision made in conversation** ⇒ vault entry (Paulo's side) + `MEMORY.md` if it constrains this repo.

**Never:** `node_modules/` under `docs/` (add to `.gitignore`) · new root `.md` without explicit request · deleting instead of archiving (moves are Paulo-reviewed; git writes are Paulo's).

## Cross-references

- `CLAUDE.md` — Claude Code-specific project instructions (lean; pointers).
- `docs/strategy/STRATEGY.md` — strategic single source of truth.
- `SYNC.md` — current state, last sessions, next mission.
- `INFRA.md` — deploy targets, service IDs, endpoints.
