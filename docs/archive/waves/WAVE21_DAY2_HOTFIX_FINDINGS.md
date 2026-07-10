# Wave 21 Day 2 — C1 Herd Writer Hot-Fix Findings

**Date:** 2026-06-05
**Branch:** `wave21-critical-fixes`
**Scope:** `tools/router/post_tool_badge.js` (`recordSpawn`), `tools/router/post_tool_badge.test.js`

## Key findings (TL;DR)

- **Root cause confirmed empirically.** Claude Code v2.1.165 does **not** emit a
  PostToolUse event for the *outer* Agent/Task tool carrying `tool_input.subagent_type`.
  Instead it emits PostToolUse for each of the subagent's **inner Bash tool calls**,
  each payload carrying `agent_id` + `agent_type` at the **top level**.
- The Wave 21 C1 fix keyed on `tool_name === 'Agent'|'Task'` + `tool_input.subagent_type`
  — a signal that **never matches a real payload** → herd file never written → `∅ 0%`.
- **New signal:** presence of `agent_type` + `agent_id` top-level ⇒ we are inside a
  subagent spawn. `agent_type` is the canonical subagent name; `agent_id` is idempotent
  per spawn (all inner Bash calls of one spawn share it).

## Change

`recordSpawn(payload, sessionId)` rewritten to:
1. Return `null` unless both `payload.agent_type` and `payload.agent_id` are present.
2. Map `agent_type` → tier/model via `SUBAGENT_TIER`.
3. `trackSpawn` + `trackComplete` keyed on `spawn_id = agent_id` (idempotent — the
   N inner Bash calls of a single spawn collapse to **one** counted spawn).

PII: never logs `tool_input.prompt` or `tool_input.command`. The Wave 21 C1
stderr "herd write missed" guard was dropped with the old body (it keyed on the
broken signal); the writer is once again silent best-effort.

## Tests

`npm`/`node --test tools/router/post_tool_badge.test.js` → **19 pass / 0 fail**.

- Added `21.D2 recordSpawn: real CC payload … writes herd` — proves the real
  `{agent_id, agent_type, tool_name:'Bash'}` payload writes the herd, counts once,
  is `🐄 local`, and is idempotent across repeated inner-Bash fires (same `agent_id`).
- Added `21.D2 recordSpawn: outer Agent tool without agent_id is now skipped` —
  proves the outer Agent payload (no `agent_type`) is skipped; spawns are counted
  via the inner Bash instead.
- **Migrated** the two pre-existing `20.B` tests to the real-payload schema
  (`agent_id` + `agent_type` top-level). They used the old heuristic and would
  otherwise fail under the new signal. Coverage preserved: total accuracy,
  cache-file written, idempotency-by-`agent_id`, cloud-vs-local, non-spawn ignored.
  *(The prompt named only the first; the integration test relied on the same
  broken schema and was migrated for the same reason.)*

## Invariants verified

- `classify.js` byte-identical — `sha256 7b01eb86…87762` ✓
- `subagent_tracker.js` untouched (`snapshot()`/`trackSpawn` shape unchanged) ✓
- Hooks never throw (try/catch → `null`) ✓
- Zero PII logged ✓

## Runtime sync note

`~/.claude/tools/router` → `~/mooter/tools/router` → `frugal` repo are the **same
inodes** (confirmed via `stat`/`readlink -f`). Editing the canonical repo file is
**live in-session** — no `cp` needed (a copy would be file-onto-self). See memory
`mooter-runtime-symlink-topology`.

## Not done (gated on Paulo + Cowork)

Per instruction: **do NOT promote to prod** until Paulo + Cowork re-run the full
E2E (5 prompts) and observe `🐄 5/5 · peak 1`. This hot-fix lands on
`wave21-critical-fixes` and the `v1.11.0-coherence-critical-dev` dev tag only.
