# HANDOFF — <task-id>
mission: <one line>
invariants-ack: classify.js sha 427d8c0b…364bc48f verified | packages frozen (allowlist only) | selective adds
plane-of-record: claude-code            # who is conductor right now: claude-code | codex | moo
shared-context-ptr: AGENTS.md + CLAUDE.md + SYNC.md   # the canonical brain ALL planes read first

## State ledger (append-only; newest last; never rewrite history)
- <ISO ts> [claude-code] <what happened>
- <ISO ts> [codex/gpt-5.3-codex] <what happened; tests x/y>
- <ISO ts> [moo/qwen3:30b] <what happened; cloud cost $0>

## Open intents (claim via worktree-conductor lock BEFORE acting)
- [ ] <intent> (owner: <plane>)

## Rules
1. Read the WHOLE ledger on entry.
2. Append EXACTLY ONE dated block on exit, tagged [plane/model].
3. Never rewrite or delete prior blocks.
4. Take the conductor lock on this file before appending.
