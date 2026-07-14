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
