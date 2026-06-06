# Wave 22 — Day 0 Recon: SubagentStop payload capture

> **Status**: ✅ COMPLETE · **Decision**: **Path α** (SubagentStop fires natively)
> **Captured**: 2026-06-05 · CC v2.1.165 · session `4e8669d3…8005d5`
> **Method**: live in-session capture (NOT synthetic) per Wave 21 lesson.

---

## TL;DR (3 lines)

1. **SubagentStop FIRES** in CC v2.1.165 — and **hot-reloads mid-session** (the debug
   hook added this session fired for a subagent spawned the same session). → Path α.
2. Payload carries the reliable spawn signal: `agent_id` + `agent_type` + `session_id`
   + `agent_transcript_path`. No prompt text in the event itself (PII-safe).
3. **No token counts in the event** — but `agent_transcript_path` points at the
   subagent's own jsonl, where wrapper-model `usage` is recorded (basis for 22.B).

---

## 1. Capture method

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.wave22-bak     # backup
# Added debug-only SubagentStop hook to settings.json:
#   node -e "...append fd0 to /tmp/mooter-subagentstop-debug.log..."
rm -f /tmp/mooter-subagentstop-debug.log
# Spawned a real subagent (Agent tool, local-summarizer):
#   "Resume o ficheiro /etc/os-release em 3 linhas"
cat /tmp/mooter-subagentstop-debug.log
```

**Surprise (good)**: the hook was added *during* the running session and still fired
for a subagent spawned afterward — CC v2.1.165 re-reads `settings.json` hooks without a
restart. This means **Wave 22 can be validated end-to-end autonomously in one session**,
not deferred to a Paulo fresh-session round-trip.

## 2. Captured payload (verbatim, one spawn)

```json
{
  "session_id": "4e8669d3-41b8-4a4e-a080-f7a79c8005d5",
  "transcript_path": "/home/paulo/.claude/projects/-home-paulo/4e8669d3-…8005d5.jsonl",
  "cwd": "/home/paulo",
  "permission_mode": "acceptEdits",
  "agent_id": "ac6a61bd3948398a9",
  "agent_type": "local-summarizer",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_transcript_path": "/home/paulo/.claude/projects/-home-paulo/4e8669d3-…8005d5/subagents/agent-ac6a61bd3948398a9.jsonl",
  "last_assistant_message": "Ubuntu 22.04.5 LTS …",
  "background_tasks": [],
  "session_crons": []
}
```

## 3. Field analysis → Day 1 architecture

| Field | Value | Use in 22.A / 22.B |
|---|---|---|
| `session_id` | parent session (top-level) | herd/token state-file key — **correct file** |
| `agent_id` | `ac6a61bd3948398a9` | **spawn_id** — equals the Agent tool's returned `agentId` |
| `agent_type` | `local-summarizer` | tier/model map key (reuse `SUBAGENT_TIER`) — **reliable spawn signal** |
| `hook_event_name` | `SubagentStop` | dispatch guard |
| `agent_transcript_path` | subagents/agent-<id>.jsonl | **22.B**: parse wrapper-model `usage`; **duration** via first/last ts |
| `last_assistant_message` | final text | NOT stored (PII discipline — only counts/metadata persisted) |
| `background_tasks` / `session_crons` | `[]` | per changelog #369; unused by Wave 22 |
| `stop_hook_active` | `false` | guards re-entrancy (matches Stop-hook semantics) |

**No `duration_ms`, no `usage`/token fields in the event.** Duration & tokens must be
derived from `agent_transcript_path` if wanted (optional for 22.A; needed for 22.B).

## 4. Idempotency — Path α + Path β coexist safely

The Wave 21 Day 2 fallback (`post_tool_badge.recordSpawn`) uses `payload.agent_id` as the
tracker `spawn_id`. The new SubagentStop handler will use the **same `agent_id`**. Because
`subagent_tracker.trackSpawn/trackComplete` are **idempotent by spawn_id** (`__done_ids`),
whichever path fires first wins and the other no-ops — **zero double-count**. The fallback
stays wired and intact (non-negotiable #2 satisfied) with no risk of inflation.

## 5. Honesty finding (feeds 22.B + 22.C) ⚠

The captured `local-summarizer` spawn ran on **`claude-haiku-4-5` (T1)** — it used the
`Read` tool directly and answered from Haiku. **It never invoked Ollama** → produced
**zero real T0 tokens** this spawn. Per the agent definition, local-summarizer only
"falls through to local Ollama if ANTHROPIC_API_KEY is unavailable". With a key present
it is a **Haiku** agent, not a qwen3:30b agent.

Implications:
- The 3 wrapper assistant messages (Haiku, in≈11 / out≈111 tokens) are **real T1 tokens**
  currently **invisible** to `token_tracker` (it syncs only the *main* transcript; subagent
  transcripts are separate files under `…/subagents/`). **This is the real ~64% gap** —
  not "partial Ollama capture" but "subagent wrapper tokens never read".
- `ollama_call.sh` already records real T0 tokens via `trackCall(prompt_eval_count,
  eval_count)` (lines 80-91) **when Ollama is actually called**. So T0 honesty is fine on
  the keyless path; the gap is the cloud-wrapper path.
- **22.C consequence**: the hint `🌱 T0 · qwen3:30b` is itself partly dishonest when a key
  is present (the agent ran on Haiku/T1). The honest exec chip should reflect the *wrapper
  model actually used*, read from the subagent transcript — not the routing intent.

### 22.B design (decided from this finding)

On SubagentStop: parse `agent_transcript_path`, aggregate each assistant `usage` by
`model→tier` (`token_tracker.modelToTier`), and push via `token_tracker.trackCall(tier,…)`.
Subagent transcripts are disjoint from the main transcript → no double-count with
`syncFromTranscript`. This captures the previously-invisible wrapper tokens (T1/T2/T3 of
the subagents) AND, on the keyless path, leaves the existing `ollama_call.sh` T0 push intact.

## 6. Path decision

**Path α — native SubagentStop handler** (`tools/router/subagentstop_hook.js`):
- read payload → `{session_id, agent_id, agent_type, agent_transcript_path}`
- `trackSpawn(agent_id)` + `trackComplete(agent_id, duration_ms)` (idempotent)
- 22.B: aggregate subagent-transcript usage → `trackCall` per tier
- wire in `settings.json` (replaces the Day 0 debug handler)
- unhide `buildHerdsChip` (remove the `return ''` at line 604)
- **keep** PostToolUse `recordSpawn` as fallback (idempotent, no double-count)

Path β (PostToolUse-only fallback) is **retained but demoted** to safety net.

---

**Recon complete. Proceeding to Day 1 implementation (22.A → 22.F).**
</content>
</invoke>
