---
type: BRIEF
id: <ID>
from: <FROM>
to: <TO>
status: <STATUS> # lifecycle
state: <FM_STATE> # execution
worktree: <WORKTREE>
branch: <BRANCH>
sha: <SHA>
uncommitted: <UNCOMMITTED_COUNT>
tests: <TESTS>
decisions_pending: <DECISIONS_PENDING>
---

# ⇄ <FROM> → LEDGER → <TO> · BRIEF — <TITLE>
> Budget: ≤ 1k tokens · event_id: <ID> · source: <SOURCE_REF>

STATUS: <STATUS> # lifecycle
SCOPE: <SCOPE>
CONFIDENCE: <CONFIDENCE>
EVIDENCE: <EVIDENCE_TAGS>
STATE: <STATE> # execution
GIT:
- worktree: <WORKTREE>
- branch/head/base: <GIT_REF>
- uncommitted: <UNCOMMITTED>
- unpushed: <UNPUSHED>

TASK: <TASK>
CONTEXT: <CONTEXT>
DELIVERABLE: <DELIVERABLE>

FILES:
<FILES>
GUARDRAILS:
<GUARDS>
ACCEPTANCE:
<ACCEPTANCE>

NEXT EVENT: <NEXT_EVENT>
⛔ STOP: <STOP>
EVIDENCE POINTER: <EVIDENCE_POINTER>

⇄ END
