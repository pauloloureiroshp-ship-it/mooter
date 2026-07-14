# Mooter Agent Sync

generated_at: 2026-07-13T12:18:53.260Z
events: 1
git: n/d @n/d dirty=n/d ahead=n/d
classify.js: intact 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f

## Latest By Agent

- claude-code: done / turn - Claude Code turn completed

## Shared Language

- intent: what Paulo or an agent is trying to accomplish
- brief: a scoped task packet from one agent to another
- turn: a single meaningful agent interaction
- decision: a choice that changes future work
- artifact: a file, command output, PR, report or generated prompt
- gate: a required proof before merge, wave close or handoff
- handoff: the compact state another agent must read first
- outcome: what actually happened, including blockers
- sync: the ledger event that keeps agents aligned

## Active Briefs

- none

## Recent Decisions

- none

## Recent Gates / Outcomes

- none

## Open Items

- none

## Use

- Before acting: read this file plus `_handoff/agent-context/bundle.md` if present.
- After a prompt/checkpoint: append one compact typed event.
- When delegating to another agent or a local Moo, write a `brief` event.
- At PR/wave/release boundaries: append an event with gate evidence and next step.

