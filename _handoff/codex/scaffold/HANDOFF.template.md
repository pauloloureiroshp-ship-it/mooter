---
handoff_schema: 1
task_id: <stable-id>
status: draft # draft|ready|claimed|blocked|verified|shipped|archived
owner: unassigned # cowork|claude-code|codex|gemini-roo|ollama|paulo
created_at: <ISO-8601>
updated_at: <ISO-8601>
worktree: <absolute-or-repo-relative-path>
branch: <branch>
base: main
head: unknown # replace with verified SHA; never guess
ledger_ref: <event-id-or-n/d>
supersedes: null
---

# HANDOFF — <one-line task name>

## GOAL

<One outcome tied to the product thesis.>

## SCOPE

- Allowed files: <explicit allowlist>
- Do: <concrete steps>
- Do not: <out-of-scope work and irreversible actions>

## GUARDS

- `tools/router/classify.js` SHA must equal `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`.
- Preserve unrelated dirty work; selective adds only.
- Confirm the conductor lock before any mutable git operation; a warning is not a lock.
- Push, merge, deploy, delete and invariant overrides require Paulo's explicit approval.

## ACCEPTANCE / GATE

- [ ] <machine-checkable command and expected signal>
- [ ] exact branch/worktree/HEAD recorded
- [ ] dirty, uncommitted and unpushed state reported
- [ ] changed files and artifacts listed

Evidence: <event/outcome, test log, commit, PR, or n/d — never an inferred pass>

## BLOCKERS / HUMAN DECISIONS

- None, or the complete question + all options + minimum context to decide.

## NEXT

`<one exact resume command or action>`

## BACK

Return: status · real worktree/branch/HEAD · files changed · tests actually run ·
blockers · human gate · first action for the next agent.

## RULES

1. This packet is a work order/projection, not a second private ledger. Append durable events to `ledger_ref`.
2. Do not move `status` to `verified` without evidence bound to the recorded HEAD.
3. Do not move `status` to `shipped` until the merge/release is confirmed and the human gate is recorded.
4. On ship or supersession, archive this packet in the same PR; never delete history.
