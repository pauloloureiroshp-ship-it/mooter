# Mooter Agent Context Protocol

Mooter uses one append-only operational ledger to align Paulo, Claude Code,
Codex, Roo/Gemini, Cowork and local Ollama workers. Private chat memory is not
the source of truth.

## Operational truth

```text
agent action
  -> typed event in _handoff/agent-sync/events.jsonl
  -> snapshot.json + latest.md + per-agent prompts/briefs
  -> MEO Control Tower projection
```

The generated `_handoff/agent-sync/` directory is local runtime state and is
gitignored. Source code, Git, tests and external connectors remain the evidence;
the ledger points to them rather than duplicating transcripts.

## Lingua Franca v1

This section defines the semantic contract for inter-agent messages. It extends,
without replacing, the event transport below, the mechanical handoff contract in
`docs/strategy/PERFECT_HANDOFF_SPEC.md:64`, and the existing work-order scaffold in
`_handoff/codex/scaffold/HANDOFF.template.md:1`.

### (a) Languages and markers

Use PT-BR for conversation and English for code and identifiers. Never translate
proper names. These markers have one canonical meaning:

`✅` done · `🔜` next · `🟡` in progress · `⚠️` attention · `❌` do not ·
`🔥` focus · `❄️` pause · `🛠` maintenance · `⛔ STOP` human gate · `♻️` reuse.

### (b) Four typed message types

Every inter-agent message MUST be exactly one of these four types. If it is not,
do not send it. The ledger event kinds below are transport vocabulary, not a fifth
message type.

| Type | Direction | Function | Target budget |
|---|---|---|---:|
| `MASTERPROMPT` | brain → executor | work to do | ≤ 8k tokens |
| `HANDOFF` | executor → brain | verified real state | ≤ 4k tokens |
| `DECISION CONTRACT` | brain → executor | typed response to decisions | ≤ 2k tokens |
| `BRIEF` | executor → ledger | minimum durable record | ≤ 1k tokens |

Every HANDOFF and BRIEF starts with stable YAML frontmatter containing `type`,
`id`, `from`, `to`, `state`, `worktree`, `branch`, `sha`, `uncommitted`, `tests`
and the string array `decisions_pending`. It also carries `status`: `status` is
the message lifecycle, while `state` is execution state. Unknown scalar facts
remain `n/d`; an unknown decisions array is `["n/d"]`, never a false empty list.
Lifecycle values follow `_handoff/codex/scaffold/HANDOFF.template.md:4`
(`draft|ready|claimed|blocked|verified|shipped|archived`); execution values follow
`docs/strategy/PERFECT_HANDOFF_SPEC.md:67` (`parked|awaiting-you|landed|in-progress`).
Either scalar may be `n/d` when its value is not verified.
This contract is machine-projectable by the Cockpit without parsing prose; it
does not authorize a second store or a new view.

### (c) Truth rules

- Unknown or unverified data is `n/d`, never a guess.
- `uncommitted` is a **RED ALERT** and includes every affected full path.
- Confront before emit: read the real Git/worktree state and latest handoff first.
- Point to evidence as `path:line`; never paste content the consumer can open.
- If the HANDOFF consumer cannot mount or access the worktree, include
  `git diff --stat` plus the diff of the critical sections. This is the explicit
  exception to references over dumps.
- Report a contradiction when found; never silently absorb it as a new premise.
- If a budget is exceeded, cut prose, never evidence.

#### CCA-F standards gate

Every HANDOFF evaluates the five Claude Certified Architect — Foundations
domains below. The table is the repo-side mechanical canon; the footer projects
the result and never replaces the evidence.

| Pilar CCA-F (peso no exame) | Check mecânico no handoff | Falha real que cobre |
|---|---|---|
| Agentic Architecture & Orchestration (27%) | worktree/branch/deps declarados · 1 executor por frente · plano antes de código em mudança de arquitetura | sessões concorrentes no mesmo tree |
| Tool Design & MCP Integration (18%) | hook/tool novo cita o contrato existente (provider README) · zero ferramenta inventada/duplicada | duplicar codex-cli.js (evitado na W62) |
| Claude Code Config & Workflows (20%) | CLAUDE/AGENTS respeitados · hooks só via fontes versionadas (nunca ~/.claude direto) · sha classify no gate | condição 1 do F1 round 2 |
| Prompt Engineering & Structured Output (20%) | mensagem é 1 dos 4 tipos · campos obrigatórios presentes · budget respeitado | handoffs pré-protocolo |
| Context Management & Reliability (15%) | refs path:linha · n/d nunca palpite · RED ALERT se uncommitted · confront-before-emit | FC-1..FC-8 inteiras |

The required HANDOFF footer is `CCA: <n>/5`, where `n` is the number of checks
passed after all five were evaluated. If any check is unverified, render
`CCA: n/d/5`; never turn missing evidence into `0/5` or assume `5/5`. A score
below `5/5` (including `n/d`) is a lint flag, not an automatic block. Three
consecutive flags require STOP and process review. The
deterministic preflight validates the canonical five rows plus footer presence
and shape; the future mesh lint owns evidence attachment and the Mission Control
time series.

#### Council pre-emit gate

`AGENTS.md` § Pre-Dispatch Red-Team Gate is the single operational source for
the eight question keys and the anti-sycophancy rule. A verified MASTERPROMPT or
DECISION CONTRACT ends with `🔍 council 8/8 · objeção mais forte: <X> · resolvida:
<como>`. When the eight answers or a real objection are not evidenced, the same
footer renders `council n/d` plus `n/d` objection/resolution and the artifact
keeps its STOP; it never fabricates `8/8`. The preflight reads the keys from
`AGENTS.md` and validates footer presence without embedding a second copy.

The detailed HANDOFF fields and their mechanical provenance remain single-sourced
in `docs/strategy/PERFECT_HANDOFF_SPEC.md:64-148`.

### (d) ♻️ REUSE GATE

Every `MASTERPROMPT` MUST contain a `♻️ REUSE` block that answers all three
questions before any new piece is built:

1. Does an internal skill in `.claude/skills/` or `packs/` already do it?
2. Does a maintained public package or repository do it better? Search npm and
   GitHub, and cite the result even when nothing fits.
3. Did Mooter already do it in another wave? Search `_handoff/_archive/` and
   `MEMORY.md`.

Found means adapt and cite; not found means build and record why. Building before
all three answers is a failed gate.

Reuse decision for this v1 (2026-07-16):

- **Internal:** reuse `.claude/skills/wave-brief-compose/SKILL.md:17-48` for
  executable work orders, `.claude/skills/agent-sync/SKILL.md:37-53` for briefs,
  and the existing HANDOFF scaffold cited above. No matching protocol pack exists
  in `packs/`; none of these sources defines all four message types or budgets.
- **Public:** [A2A](https://github.com/a2aproject/A2A),
  [Agent Handoff Protocol](https://github.com/reaatech/agent-handoff-protocol)
  ([npm](https://www.npmjs.com/package/@reaatech/agent-handoff-protocol)), and
  the experimental [ChainThread](https://github.com/eugene001dayne/chain-thread)
  cover transport, routing, compression, or contract-validated envelopes. None
  provides this repo-local, human-gated four-message contract, so no runtime
  dependency is added.
- **Previous waves:** reuse the deterministic handoff and `n/d` doctrine in
  `docs/strategy/PERFECT_HANDOFF_SPEC.md:58-148` and its archived implementation
  brief at `_handoff/_archive/2026-06/PERFECT_HANDOFF_MASTERPROMPT.md:1`.

### (e) Token efficiency

Prefer tables over prose and templates over free-form writing. A HANDOFF points to
evidence instead of repeating it. Local qwen narrative is best-effort garnish and
never load-bearing; that rule remains single-sourced in
`docs/strategy/PERFECT_HANDOFF_SPEC.md:58-62`.

## Commands

Read or initialize the local projection:

```sh
node tools/router/agent-sync-ledger.js status
```

Record a checkpoint:

```sh
node tools/router/agent-sync-ledger.js record \
  --agent codex --provider openai --model codex \
  --channel subscription \
  --kind outcome --cadence checkpoint --status done \
  --session <id> --session-title "MEO Control Tower" \
  --wave wave/meo-cto --pr "#247" \
  --evidence code,test,git \
  --summary "what actually changed" --next "next concrete gate"
```

Create a typed handoff/brief:

```sh
node tools/router/agent-sync-ledger.js brief \
  --from claude-code --to codex,gemini-roo,ollama \
  --task "scoped task" --context "verified shared facts" \
  --files "file-a.js,file-b.md" \
  --acceptance "tests required,blockers named" \
  --guard "do not edit tools/router/classify.js"
```

Validate the four-agent flow without external calls:

```sh
node tools/router/agent-sync-ledger.js simulate
```

It must report `SIMULATION=pass`.

## Event contract

Core identity fields are `agent`, `provider`, `model`, `execution_channel`, `session_id`,
`session_title`, `kind`, `cadence`, `status` and `ts`. Delivery fields are
`wave`, `pr`, `git`, `files`, `artifact` and `links`. Knowledge mirrors use
`notion_ref`, `obsidian_ref` and concrete evidence tags.

Valid event kinds: `sync`, `intent`, `brief`, `turn`, `decision`, `artifact`,
`gate`, `handoff`, `outcome`, `review`, `blocker`.

Valid evidence: `code`, `test`, `git`, `doc`, `handoff`, `notion-export`,
`obsidian-vault`, `runtime`, `connector`, `inference`.

Valid execution channels: `local`, `subscription`, `api`, `cloud`, `unknown`.
Record one explicitly whenever the authentication path is known. Provider/model
fallback remains labelled as inference in the MEO and is never connector proof.

`inference` is only allowed when stronger evidence is unavailable. Missing
fields stay null and the MEO renders `n/d`; it never invents a model, session,
PR, Notion sync or Obsidian sync.

## Producers

- Claude Code: the existing Stop hook records one fail-soft `turn` event after
  `/mooter-update` mirrors the new runtime files.
- Codex: uses the installed `mooter-agent-sync` skill and records checkpoints.
- Roo/Gemini: follows `.roo/rules/mooter-agent-sync.md`.
- Ollama/Moos: receive explicit brief files; they are stateless otherwise.
- Cowork/Paulo: record decisions or handoffs explicitly when a connector or
  local mirror supplies evidence.

## MEO projection

The MEO joins, without rewriting, four local evidence streams:

1. `_handoff/live-preview/events.jsonl` — UI/tool stream for this workspace;
2. `_handoff/agent-sync/events.jsonl` — cross-agent provenance and handoffs;
3. `~/.claude/hooks/execution.log` — actual model-attributed operations;
4. Claude transcripts/session registry — session titles and integration stamps.

The Control, Stream and Sessions lenses show coverage gaps explicitly. Notion
and Obsidian are mirrors, never the bus. Live connector access may only be
claimed when the active agent actually has that connector.

## Guardrails

- Never edit `tools/router/classify.js`.
- Never record secrets or full prompt/code bodies in the agent-sync ledger.
- Never claim a test, model execution, PR, deployment or mirror sync without
  evidence.
- Keep events compact; link to durable artifacts.
- A missing ledger is a visible blocker, not an empty-success state.
