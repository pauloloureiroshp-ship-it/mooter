---
name: workflows
description: >
  Local-first dynamic workflows — Mooter writes a JS orchestration script from a
  natural-language task, fans the work out across FREE local Ollama workers in
  parallel, and uses at most ONE cloud (Opus) call for synthesis. Cross-session
  resumable. Use when the user wants to audit/migrate/research across many files
  or says "workflow", "audit codebase", "migrate ... files", or runs /workflows.
---

# Mooter Workflow Engine

A local-first take on dynamic multi-agent workflows. The expensive model (Opus)
is used **once** to author an orchestration script; the script then runs in a
sandboxed V8 isolate, fanning work out across **free local Ollama workers**
(`qwen2.5-coder:7b`) and reserving the cloud for a single synthesis pass.

This is the cost inversion Mooter is about: many free local agents + one paid
cloud agent, instead of one expensive agent doing everything.

## Commands

```bash
# Run a saved/example workflow over a directory (host reads the files, the
# sandbox never touches your filesystem):
mooter workflow run audit-unused-exports --target src/

# Author a new workflow from a task (one Opus call → script + plan):
mooter workflow create "audit src/ for unused exports"

# Observe / inspect:
mooter workflow list                 # recent runs (status, cost)
mooter workflow watch <run_id>       # phase x/N · agents · cost · recent workers
mooter workflow resume <run_id>      # show resumable checkpoints of a killed run

# Flags: --target <dir>, --dry-run (resolve + compile-check only), --yes
```

Workers reach Ollama via `OLLAMA_HOST` (the router convention). In WSL, Ollama
lives on the Windows host — e.g. `export OLLAMA_HOST=http://172.25.48.1:11434`.
`create` needs `ANTHROPIC_API_KEY` (the writer's single Opus call).

## What a workflow script can use (sandbox API)

All are globals — no `require`/`import`/`fetch`/`fs`/`process` (the isolate has
no Node globals, so they're absent by construction):

| API | Purpose |
|---|---|
| `agent({ model, prompt, system?, max_tokens?, temperature? })` | one subtask on a worker; returns `{ result, tokens_in, tokens_out, cost_usd, backend }` |
| `parallel(items, async (item, i) => r, { concurrency })` | bounded fan-out, order preserved |
| `vote(candidates, async (c) => survivors)` | adversarial/voting pass |
| `converge(initial, async (item) => item\|null, maxIter)` | iterate to fixpoint |
| `checkpoint(name, data)` | persist a milestone → **cross-session resume** |
| `log(message, metadata?)` | progress line |
| `INPUT` | host-provided read-only data (e.g. file contents) |

**Models** — local (free): `qwen2.5-coder:7b` (default), `qwen2.5-coder:14b`,
`deepseek-r1:7b`. Cloud (paid, use sparingly): `Codex-haiku-4-5`,
`Codex-sonnet-4-6`, `Codex-opus-4-8` (reserve for one synthesis step).

## Cross-session resume (the differentiator)

State lives in `~/.mooter/workflows/state.db` (SQLite). `checkpoint()` after each
phase; if the run is killed, re-running resumes from the last checkpoint instead
of redoing finished work — unlike same-session-only dynamic workflows.

## Example: `audit-unused-exports`

See `examples/audit-unused-exports.js`. The host gathers the target dir's files
into `INPUT.files`; phase 1 extracts each file's exports (one local worker per
file), phase 2 flags exports unreferenced elsewhere, phase 3 has one Opus call
synthesise a strict-JSON report.

**Real run** (`--target packages/workflow/src`, 12 files):

```
✅ audit-unused-exports · completed
   agents: 25 (24 local, 1 cloud) · cost $0.0028 · saved $0.12
   { "files_audited": 12, "summary": "...", "candidates": [] }
```

25 agents, 24 of them free local workers, one Opus synthesis — **$0.0028 total**.

## Notes / limits (honest)

- Runs from a **source checkout** with the engine's native deps built
  (`isolated-vm`, `better-sqlite3`); the workflow engine is not in the shipped
  npm bundle.
- `agent()`'s `tools: ["Read","Grep","Glob"]` field is reserved; the in-sandbox
  tool-use loop isn't built yet, so give workers their material via `INPUT`
  (the host does the file I/O).
- Statusline line 3 (`tools/router/workflow-status.js`) shows an active run; it
  reads a lightweight JSON pointer, never SQLite (it's on the hot path).
- Run telemetry can POST to the hub `/v1/workflows` (separate from `mooter sync`
  / Pastor); auto-sync from the CLI is not wired in this MVP.
