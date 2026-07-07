# Wave 23 Phase 0 — CC v2.1.167 SubagentStop schema (empirical recapture)

> **Method**: temp debug handler `_debug_subagentstop_v167.js` appended to the
> `SubagentStop` hooks array (alongside the real `subagentstop_hook.js`), one
> live `local-summarizer` spawn, raw stdin payload logged to
> `/tmp/mooter-v167-debug.log`. Captured 2026-06-06.

## Headline finding — NO regression. Schema is backward-compatible.

The brief's premise ("22.A herd file broken in v167") is **empirically false**.
The v167 SubagentStop payload **retains every field** the Wave 22 22.A hook
depends on, and the herd writer fired correctly end-to-end on the test spawn.

## v167 payload (real capture)

```json
{
  "session_id": "fbd62f3b-…",
  "transcript_path": "…/<session>.jsonl",
  "cwd": "/mnt/c/Users/Paulo Loureiro/frugal",
  "permission_mode": "acceptEdits",
  "agent_id": "acf3361fc0a279620",
  "agent_type": "local-summarizer",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_transcript_path": "…/subagents/agent-<agent_id>.jsonl",
  "last_assistant_message": "…",
  "background_tasks": [],
  "session_crons": []
}
```

### Top-level keys

| Key | In v165 (Wave 22 Day 0)? | Used by 22.A hook? |
|---|---|---|
| `session_id` | ✅ | ✅ herd/token scoping |
| `transcript_path` | ✅ | — (main transcript) |
| `agent_id` | ✅ | ✅ spawn dedup id |
| `agent_type` | ✅ | ✅ tier/model lookup |
| `agent_transcript_path` | ✅ | ✅ duration + exec profile + token capture |
| `hook_event_name` | ✅ | — |
| `stop_hook_active` | ✅ | — |
| `cwd` | ✅ | — |
| `permission_mode` | ✅ | — |
| `last_assistant_message` | **NEW v167** | — (privacy: hook never persists it) |
| `background_tasks` | **NEW v167** | — |
| `session_crons` | **NEW v167** | — |

The three new keys are **additive**; none replaces a field 22.A reads. The hook
guards on `agent_type && agent_id` (both present) so it activates exactly as in
v165.

## Live end-to-end validation (same session)

1 `local-summarizer` spawn (summarize `glyphs.js`) →

- **herd file** `/tmp/mooter-herd-<sid>.json` written:
  `cumulative.local-summarizer.count = 1`, `__done_ids` dedup populated,
  `peak_concurrent = 1`.
- **`subagent_tracker.snapshot({session_id})`** returns
  `peak_concurrent:1, cumulative:[{agent_name:"local-summarizer", count:1, tier:"T0", model:"qwen3:30b"}]`.
- **lastexec** `/tmp/mooter-lastexec-<sid>.json` →
  `intent_tier:T0 / intent_model:qwen3:30b` vs
  `exec_tier:T1 / exec_model:claude-haiku-4-5-20251001 / calls:4`.
- **statusline live render** shows the divergence chip
  `⚠ exec T1 haiku · 4 calls` + herd chip `🐄×0` (0 active at render — correct).

### Discovery 2 confirmed LIVE in v167

`local-summarizer` routes as **T0 / qwen3:30b** but actually executes on
**T1 / claude-haiku-4-5** (4 wrapper calls) when `ANTHROPIC_API_KEY` is present.
This is the headline marketing finding and the divergence chip surfaces it
honestly at render time.

## Decision — no code fix required to the hook

`subagentstop_hook.js` accesses only `agent_type`, `agent_id`,
`agent_transcript_path`, `session_id` — all present and identically shaped in
v167. **Shipping a fabricated "fix" would violate the honesty foundation.** The
honest outcome: document the backward-compat, keep the hook as-is, remove the
temp debug handler, restore `settings.json`.

One pre-existing (not v167) cosmetic: `durationFromTranscript` returns ~0
(`total_ms:1`) due to WSL clock skew / single-timestamp transcripts — same as
v165, out of scope for Wave 23.
