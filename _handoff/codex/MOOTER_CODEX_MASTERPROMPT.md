# 🐮🤖 MOOTER — Wave 62: The Codex Plane (Tri-Agent Fabric)
### The Master Prompt of Master Prompts — OpenAI Codex as a first-class Mooter agent plane

> **STATUS: SUPERSEDED — NÃO EXECUTAR COMO WAVE ATIVA.** O desenho do capsule
> append-only abaixo é histórico. O template atual em `scaffold/HANDOFF.template.md`
> trata o packet como work order/projeção e aponta para um Ledger único.

> **What this is.** A single, self-contained brief to paste into **Claude Code** (the principal
> orchestrator). It turns OpenAI Codex into a third agent plane inside Mooter — running as
> **parallel workers in isolated git worktrees**, alongside Claude Code (principal) and the local
> **moo** workers (Ollama on the RTX 4090) — with a **perfect, lossless handoff** between all three.
> Written in English on purpose: it is consumed by coding agents (CC + Codex), and Mooter's rule is
> *PT in conversation, English in code & identifiers*. Conversation about it stays PT-BR.

> **House laws (non-negotiable — repeated here so no sub-agent forgets):**
> - `tools/router/classify.js` is **FROZEN**. sha256 `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`. Never touch it. Re-verify before every commit.
> - Frozen engine packages stay untouched **unless this brief allowlists a specific file** (it does — see §0.2). Allowlisted = **new files only**, plus the two surgical edits named in §3. No other existing engine file changes.
> - **Selective git adds only.** Never `git add -A`. Stage exactly the files you changed.
> - **Honest-copy doctrine.** Never fabricate a price, benchmark, rating, or count. Every number cites a real source. A wrong premise gets refuted, not built upon.
> - **Tier ladder:** T0–T3 auto-route; **T5 (Fable) opt-in only via `@fable`**. Codex inherits the same discipline (see §2).

---

## 0. Context you must load before doing anything

### 0.1 The current world (verified against the repo, 2026-06-21)

Mooter is **already pre-wired** for a non-Anthropic provider. Do not rebuild what exists:

| Already there | Where | Consequence |
|---|---|---|
| `Provider` union includes `"openai"` | `packages/router/src/mooter_event.ts` | No type change needed to name Codex's provider. |
| Roster slots `gpt-5`, `gpt-5-3-codex`, `gpt-oss` exist (tier set, `pricing_status: "pending"`) | `data/pricing-snapshot-2026-05-27.json`, `packages/router/src/specialization-matrix.ts` (`MATRIX_MODELS`) | Codex models are placeholders that **do not auto-route** until priced + measured. |
| Provider-agnostic spawning in isolated worktrees + 4-layer bwrap sandbox | `packages/spawn-orchestrator` (`SpawnRequest`, `SpawnRecord`, `worktree.ts`, `runner.ts` → `runSandboxed()` + `buildCommand(mode,task,model)`) | The spawning machine runs **any** executable in a sandboxed worktree. It needs a Codex branch in `buildCommand` / a sibling runner. **There is no `runners/` subdir — files sit at `src/` level.** |
| **Single-turn Codex routing ALREADY EXISTS** | `tools/router/providers/codex-cli.js` (wraps `codex exec`, **ChatGPT-OAuth** auth, returns `{ok,text}`/`null`, updates `quota-tracker.js`), `openai-api.js` (API-key fallback), `pricing.js`, `quota-tracker.js`, `quota-state.json`, `CODEX_CLI_NOTES.md` | **Do not rebuild this.** `classify.js` already emits `codex_cli` in `suggested_providers`. The provider contract is documented in `tools/router/providers/README.md` (`isAvailable()` + call fn returning `null` on soft-fail + quota-tracker side-effect). Read it before adding anything. |
| Cross-terminal orchestration: atomic locks, heartbeats, serial intent queue | `packages/worktree-conductor` (locks at `~/.mooter/orchestration/locks/`, heartbeats, `history.jsonl`) | Collision-free coordination across CC, Codex and moo terminals **already exists**. Reuse it. |
| Cross-session intelligence over CC transcripts | `packages/sessions-orchestrator` (reads `~/.claude/projects/*/*.jsonl`) | Currently CC-only. Extend it to also ingest Codex JSONL rollouts (new file). |
| Agent definitions in `agents/*.md` (YAML frontmatter: `name`, `description`, `model`, `tools` + prose) | `agents/` | Mirror this exact format for the Codex agent. |
| Host-side routing brain | `tools/router/` (`classify.js` FROZEN, `arbiter.js`, `decide-agent.ts`, `inject_context.js` hook, `savings-tracker.js` :7821) | Provider selection is host-side. Codex plugs into `arbiter.js`/`cost.ts`, never into `classify.js`. |

> **So what is actually missing?** Not "Codex routing" — that single-turn path is done (OAuth, cheap,
> subscription-billed). The real gap, and what Paulo is asking for now, is **the parallel-agent /
> worktree plane**: Codex running as a sandboxed worker *alongside* CC and moo, with a lossless
> handoff fabric and **metered** (API-key) spend so the savings-ledger can see it. Before writing
> anything, **read** `tools/router/providers/CODEX_CLI_NOTES.md`, `tools/router/providers/README.md`,
> and any existing `CODEX_INTEGRATION_MASTER.md` — this brief supersedes/extends them, it does not fork them.

### 0.2 Files this brief ALLOWLISTS (the only writes permitted in frozen packages)

**New files (additions only):**
- `packages/spawn-orchestrator/src/codex-runner.ts` (sibling of `runner.ts`; the parallel-worker runner)
- `packages/sessions-orchestrator/src/discovery-codex.ts`
- `agents/codex-specialist.md`

**Surgical edits to existing engine files (named, minimal, additive):**
- `packages/spawn-orchestrator/src/runner.ts` — add a Codex branch to `buildCommand(mode,task,model)` (or wire the sibling runner through `runSandboxed`). One branch; keep it minimal and say so in the commit.
- `tools/router/providers/codex-cli.js` — extend (do **not** replace) to support a **metered** mode that injects `CODEX_API_KEY` per `codex exec` run. Keep the existing OAuth default for the cheap router fallback.
- `packages/router/src/cost.ts` — extend `providerForModel()` with one branch: `if (/^gpt-/.test(model)) return "openai";` (after the `claude-` branch).
- `packages/router/src/specialization-matrix.ts` — append `"gpt-5-5"`, `"gpt-5-4"` to `MATRIX_MODELS` (the `as const` roster). No cell logic changes.
- `data/pricing-snapshot-2026-05-27.json` — fill prices for the gpt-5.x slots (see §3.1 Wave 62.1; gate stays closed).
- `tools/router/quota-tracker.js` — if a metered Codex worker needs its own usage key, add it per the README "Adding a new provider" recipe (additive switch entry only).

> `scaffold/providers/openai-codex.js` is a **reference** for the `codex exec --json` parsing + `CODEX_API_KEY`
> injection the runner needs — mine it for logic; do **not** drop a competing provider file next to the
> existing `codex-cli.js`/`openai-api.js`. Reconcile, don't duplicate.

**Everything else in `packages/spawn-orchestrator`, `packages/worktree-conductor`, `packages/sessions-orchestrator`, and `tools/router/classify.js` stays byte-identical.** If a phase seems to need more, **stop and refute** — do not widen the allowlist silently.

### 0.3 The decision already made (do not re-litigate)
- **Auth = API key for the parallel plane** (metered → feeds the savings-ledger; OpenAI recommends API-key auth for headless workflows). **Reconciliation with what exists:** the repo's `codex-cli.js` deliberately uses **ChatGPT OAuth** so the cheap single-turn router fallback bills against the subscription. Keep that. The parallel worker plane runs metered by injecting **`CODEX_API_KEY` per `codex exec` run** (this env var is honored only by `codex exec`, so it overrides the OAuth default for that run **without** changing `~/.codex/auth.json`). Result: cheap OAuth fallback **and** metered parallel workers coexist. No either/or.
- **Routing role = auto-route as a T2/T3 provider (end-state), behind an honest gate.** Codex enters TES auto-ranking **only** when its snapshot price is `active` (verified) **AND** it has ≥1 measured specialization cell. Until both are true it is **`@codex` opt-in + parallel-worker only**. Phase 1 ships opt-in/parallel; Phase 2 is a flag flip when the numbers are real.

---

## 1. The architecture: three planes, one fabric

```
            ┌──────────────────────────────────────────────────────────────┐
            │                  MOOTER ROUTING BRAIN (host-side)             │
            │   classify.js (FROZEN) → arbiter.js → decide-agent.ts (TES)   │
            │              savings-tracker.js :7821  (cost ledger)          │
            └───────────────┬───────────────┬───────────────┬──────────────┘
                            │ principal      │ parallel       │ free/local
                    ┌───────▼──────┐ ┌───────▼───────┐ ┌──────▼────────┐
                    │  CLAUDE CODE │ │   CODEX PLANE  │ │   moo (local) │
                    │  (conductor) │ │ codex exec     │ │  Ollama       │
                    │  Opus/Sonnet │ │ gpt-5.x        │ │  qwen3:30b    │
                    │  /Haiku      │ │ (OpenAI API)   │ │  RTX 4090     │
                    └──────┬───────┘ └───────┬────────┘ └──────┬────────┘
                           │                 │                 │
                    ┌──────▼─────────────────▼─────────────────▼────────┐
                    │   HANDOFF FABRIC  (already exists — reuse it)       │
                    │   worktree-conductor: locks · heartbeats · queue    │
                    │   spawn-orchestrator: isolated worktree + bwrap     │
                    │   AGENTS.md = lingua franca · HANDOFF.md = live state│
                    └─────────────────────────────────────────────────────┘
```

**The key insight — "perfect handoff, no context loss" is solved by one file: `AGENTS.md`.**
Claude Code reads `CLAUDE.md` + `AGENTS.md`. **Codex natively reads `AGENTS.md`** through its own
instruction-chain (global `~/.codex/AGENTS.md` → project-root `AGENTS.md` → cwd, merged root-down,
32 KiB cap). So both planes already share the same canonical brain **if `AGENTS.md` is the single
source of cross-agent truth.** We then carry *live task state* in a per-worktree `HANDOFF.md` capsule
that every plane reads and appends to. No translation layer, no context loss — one file format, three
readers.

**Why route Codex through `codex exec` (not a raw API client) for parallel work.**
`codex exec --json` inherits Codex's own sandbox, AGENTS.md chain, custom agents and MCP servers, and
the user's auth. So Mooter's Codex *runner* just shells out to `codex exec` inside the worktree the
spawn-orchestrator already created. The runner injects `CODEX_API_KEY` per run so that parallel
worker spend is **metered** (visible to the savings-ledger), while the existing `codex-cli.js` OAuth
fallback stays subscription-billed. For a single routed LLM turn (Phase 2 auto-route), the existing
`openai-api.js` direct path is reused. The reference logic lives in `scaffold/providers/openai-codex.js`.

---

## 2. Routing semantics (the gate, in one table)

| State of `gpt-5.x` in the snapshot | How it can be used | Auto-routed by `arbiter.js`? |
|---|---|---|
| `pricing_status != "active"` OR no measured cell | `@codex` in a prompt → opt-in route · spawn as parallel worker | **No** |
| `pricing_status == "active"` AND ≥1 measured cell | full TES competition inside its tier band (T2/T3) | **Yes** |

- `@codex` is the opt-in marker, exactly parallel to how `@fable` gates T5. It is **never** auto-selected before the gate opens.
- High-risk floors still apply: deploy/secrets/migrations floor to **T3** regardless of provider.
- Parallel spawning (`mooter spawn … --agent codex-*`) is allowed **at any time** — it is explicit user intent, not auto-routing, so the gate does not apply to it.

---

## 3. The waves (execute in order; each is its own master prompt)

> Each phase ends with: re-verify `classify.js` sha → run the named tests → selective commit with the
> exact message → update `SYNC.md`. Tag the whole wave `v1.x.0-codex-plane` at the end.

### Wave 62.0 — Account key + config (Codex CLI is ALREADY installed)  *(human + agent; see `SETUP_RUNBOOK.md`)*
**Reality check first:** `CODEX_CLI_NOTES.md` says Codex CLI **0.118.0 is installed** and **logged in via ChatGPT OAuth**. Do not reinstall or re-login that session. This wave only **adds the metered API key** for the parallel plane and the Mooter config/agents.
1. Verify: `codex --version` and `codex login status` (expect "Logged in using ChatGPT" — leave it).
2. Create an API key at `platform.openai.com/api-keys` (billing on). Store as `OPENAI_API_KEY` user env (Windows: `[Environment]::SetEnvironmentVariable('OPENAI_API_KEY','sk-...','User')`). The router fallback `openai-api.js` already reads it from `tools/router/.env`/env; keep it consistent.
3. **Do not** run `codex login --with-api-key` (that would overwrite the OAuth session). Metered runs use **`CODEX_API_KEY` per `codex exec` call** (set by the runner), leaving the OAuth default intact.
4. Drop the config/agents: `scaffold/config.toml` → `~/.codex/config.toml`; `scaffold/agents/*.toml` → `~/.codex/agents/`. Adjust the `[mcp_servers.mooter]` command to your real entry.
5. Confirm the handoff brain: from `~/frugal`, `codex exec --sandbox read-only "List the hard invariants in AGENTS.md and CLAUDE.md and the frozen classify.js sha."` → Codex must echo the **real** invariants + `427d8c0b…`. **This proves lossless handoff: same brain, different plane.**

**Acceptance:** `codex login status` unchanged (OAuth); `OPENAI_API_KEY` set; the read-only echo returns the real sha. No repo writes yet.

### Wave 62.1 — Provider registration (gated, honest)
> Note: the *provider wrappers* (`codex-cli.js`, `openai-api.js`) and `classify.js`'s `codex_cli` suggestion already exist. This wave only makes the gpt-5.x **models** costable + roster-known; it does not add a provider client.
**Files:** `packages/router/src/cost.ts` (edit), `packages/router/src/specialization-matrix.ts` (edit), `data/pricing-snapshot-2026-05-27.json` (edit).
1. `cost.ts`: add `if (/^gpt-/.test(model)) return "openai";` to `providerForModel()` (after the `claude-` branch). Nothing else.
2. `specialization-matrix.ts`: append `"gpt-5-5"`, `"gpt-5-4"` to `MATRIX_MODELS`. Leave all cells empty/`null` (the adaptive learner + MooterBench fill them honestly later).
3. Snapshot: apply `scaffold/pricing-snapshot.patch.json` (§3.2). Prices are **web-sourced (2026-06-21)** and carry `pricing_status: "web-unverified"` → **gate stays closed.** Before flipping to `"active"`, run `mooter price-update` / verify against `developers.openai.com/api/docs/pricing`.

**Acceptance:** `mooter explain cost gpt-5-3-codex` shows a non-zero cost from the snapshot; `mooter doctor` clean; **no model auto-routes to Codex** (gate closed); `classify.js` sha intact; `cd packages/router && npm test` green.

### Wave 62.2 — Codex runner in the spawn machine  *(allowlisted new file + 1 branch)*
**Files:** `packages/spawn-orchestrator/src/codex-runner.ts` (NEW, sibling of `runner.ts`) + a single Codex branch in `runner.ts`'s `buildCommand(mode,task,model)`. **First read `runner.ts`** to learn the real seam (`runSandboxed()`, `SpawnHandle`, `SpawnImpl`, `buildCommand`).
- The runner, given a `SpawnRecord` (worktree path, branch, task, `SandboxConfig`):
  1. Writes/refreshes the worktree's `HANDOFF.md` capsule (see §4) and ensures the repo `AGENTS.md` is present in the worktree (it is — same repo).
  2. Invokes `codex exec --json --cd <worktreePath> -m <model> --sandbox workspace-write --ask-for-approval never -p mooter-cloud "<task + HANDOFF pointer>"` **with `CODEX_API_KEY` injected in the child env** (metered run; OAuth default untouched).
  3. Streams JSONL → maps token usage into a `MooterEvent` (provider `"openai"`, tier from snapshot) **and** calls `quota-tracker.recordUsage` per the provider contract, so `savings-tracker.js` :7821 ledgers the real spend.
  4. Honors the sandbox: `SandboxConfig.network` → Codex `--sandbox` + `sandbox_workspace_write.network_access`; worktree is the only writable root.
  5. Follows the README contract: returns a result object on success, **`null` on soft-fail** (quota/auth/timeout) so the caller can fall through; never throws on a soft error.
- Mine `scaffold/providers/openai-codex.js` for the JSONL parse + `CODEX_API_KEY` env injection. **Do not** add a new file under `tools/router/providers/` — that single-turn layer already exists.
- **Do not** modify `worktree.ts`, `pipeline.ts`, or `state.ts`. The only `runner.ts` change is the `buildCommand` Codex branch (or one map entry to dispatch to `codex-runner.ts`); state it explicitly in the commit.

**Acceptance:** `mooter spawn "echo hello from codex" --agent codex-worker --mode cloud` creates an isolated worktree, runs Codex headless **metered**, returns output, and the spend appears in `mooter explain savings`. Sandbox holds (no writes outside the worktree). `classify.js` sha intact.

### Wave 62.3 — Codex custom agents + Mooter agent def
**Files:** `~/.codex/agents/mooter-explorer.toml`, `~/.codex/agents/mooter-worker.toml` (from `scaffold/agents/`), and `agents/codex-specialist.md` (NEW, Mooter house format).
- `mooter-explorer` = read-only Codex subagent for fan-out exploration (`sandbox_mode = "read-only"`, cheap model). `mooter-worker` = workspace-write executor (gated model). Both keep `[agents].max_threads`/`max_depth` defaults sane (6 / 1).
- `agents/codex-specialist.md` follows the exact frontmatter (`name`, `description`, `model`, `tools`) + prose contract used by `model-architect.md` etc., and documents *when* to spawn Codex vs CC vs moo.

**Acceptance:** `codex` → `/agent` lists `mooter-explorer`/`mooter-worker`; `mooter agents list` (or the repo's equivalent) shows `codex-specialist`.

### Wave 62.4 — The handoff fabric (lossless, three-way)
**Files:** `scaffold/HANDOFF.template.md` (the capsule), and a context-prepend in the runner (62.2).
- Define `HANDOFF.md` = the live, per-worktree state capsule (§4). CC, Codex and moo all read it on entry and append a dated block on exit. AGENTS.md = static brain; HANDOFF.md = moving state. Together = zero context loss across planes.
- The conductor's locks/heartbeats already prevent two planes writing the same resource. Make the runner take a `worktree-conductor` lock on `HANDOFF.md` before appending.

**Acceptance:** a CC turn writes a HANDOFF block; a spawned Codex worker reads it, does work, appends its own block; a moo worker reads both. Diff the capsule to prove the chain.

### Wave 62.5 — Unified cross-agent intelligence  *(allowlisted new file)*
**File:** `packages/sessions-orchestrator/src/discovery-codex.ts` (NEW).
- Discover Codex JSONL rollouts (under `$CODEX_HOME` / `~/.codex/`) and emit the same `SessionInfo`/`MooterEvent` shape the CC discovery uses, so `aggregator.ts` counts Codex sessions in the savings dashboard **without editing `discovery.ts`**.

**Acceptance:** `mooter sessions` (TUI) shows a Codex session row with tier mix + est. spend next to CC and moo rows.

### Wave 62.6 — Transparency chip  *(allowlisted, additive)*
- Add a `🤖 codex` chip / provider badge to the statusline + dashboard via the existing transparency seams (new file or an allowlisted additive hook — name it in the commit). Default statusline stays byte-identical; the chip is opt-in via `~/.mooter/preferences.json`.

**Acceptance:** opt-in shows the Codex chip when a Codex turn/worker is active; default layout unchanged.

### Wave 62.7 — Verification (do not skip — see §5)
Full gate: sha intact · all package tests green · the **tri-agent live demo** (CC + Codex + moo in three worktrees on one task) · ledger shows real Codex spend · gate still closed (no silent auto-route) · `mooter doctor` clean. Then tag + `SYNC.md`.

---

## 4. The `HANDOFF.md` capsule (the anti-context-loss contract)

Every worktree carries one. Static brain lives in `AGENTS.md`; **this** carries the moving parts:

```markdown
# HANDOFF — <task-id>
mission: <one line>
invariants-ack: classify.js sha 427d8c0b… verified | packages frozen | selective adds
plane-of-record: claude-code        # who is conductor right now
shared-context-ptr: AGENTS.md + CLAUDE.md + SYNC.md  # the canonical brain all planes read

## State ledger (append-only; newest last)
- 2026-06-21T14:00 [claude-code] scoped task, created worktree wt/codex-62-2, lock held
- 2026-06-21T14:08 [codex/gpt-5.3-codex] implemented runner skeleton; tests 12/12; handing back
- 2026-06-21T14:15 [moo/qwen3:30b] summarized diff for review; no cloud cost

## Open intents (claim via worktree-conductor lock before acting)
- [ ] review codex diff (owner: claude-code)
```

Rule: **read the whole ledger on entry, append exactly one block on exit, never rewrite history.**
That single discipline is what makes the handoff "perfect" — any plane can resume any task with full context.

---

## 5. Verification protocol (Wave 62.7, expanded)

1. `node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync('tools/router/classify.js')).digest('hex'))"` → **must equal** `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`.
2. `cd packages/router && npm install && npm test`; repeat for `packages/cli`, `packages/spawn-orchestrator`, `packages/sessions-orchestrator`. All green.
3. `git status` — only the allowlisted files changed. `git diff --stat` reviewed. **No `git add -A`.**
4. **Tri-agent live demo:** one real task, fanned to three worktrees (CC reviews, Codex implements, moo summarizes), coordinated by the conductor, handed off via `HANDOFF.md`. Capture the transcript.
5. `mooter explain savings` / dashboard shows a **real, non-zero** Codex line item (honest-copy: it's a measured spend, not an estimate).
6. Confirm the **gate is still closed**: `mooter explain route "<a normal coding prompt>"` does **not** pick a `gpt-*` model (because price is web-unverified). Codex only appears via `@codex` or `mooter spawn`.
7. **Spawn `final-reviewer` (Opus) on the whole diff** before tagging. Ship only on 0-HIGH / 0-MED.

---

## 6. Phase 2 (later, one flip): turning auto-route on
When you have (a) verified prices (`mooter price-update`, `pricing_status: "active"`) and (b) ≥1 measured
MooterBench cell for a gpt-5.x model: that model joins TES auto-ranking inside its tier with **zero code
change** — the gate in §2 opens by data, not by edits. Re-run §5 and spawn `final-reviewer` again.

---

## 7. Scaffold index (ready-to-commit, in this folder)
- `config.toml` → `~/.codex/config.toml` (provider, profiles, sandbox, Mooter MCP)
- `agents/mooter-explorer.toml`, `agents/mooter-worker.toml` → `~/.codex/agents/`
- `agents/codex-specialist.md` → repo `agents/`
- `providers/openai-codex.js` → **reference only** for the spawn runner's `codex exec --json` parse + `CODEX_API_KEY` injection (do NOT drop next to the existing `codex-cli.js`/`openai-api.js`)
- `pricing-snapshot.patch.json` → merge into `data/pricing-snapshot-2026-05-27.json`
- `HANDOFF.template.md` → per-worktree capsule template
- `SETUP_RUNBOOK.md` → the human-side OpenAI account + Codex login steps

---

*Sources for the external facts in this brief (verified 2026-06-21): OpenAI Codex docs — config-reference, subagents, cli, auth, mcp, agents-md, models, noninteractive, worktrees, pricing; npm `@openai/codex`; OpenAI API pricing (web aggregators, to be re-verified before activation). Repo facts verified directly against `~/frugal`.*
