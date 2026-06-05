# Wave 20 — Day 1 Findings (Critical fixes)

**Date:** 2026-06-05 · Branch: `wave20-friends-launch-polish` (off dev `ef0a018`)
**Pre-flight:** Wave 19 `v1.10.1-day42-followups` EM PROD (main `63d5ff8`).

---

## Recon — root causes (both criticals diagnosed)

### 20.A — "frugal recommends" branding leak ✅ ROOT CAUSE + FIXED
- The `UserPromptSubmit` hook runs **two** commands (settings.json): `inject_context.js` (router-hint/tier-badge) **and** `~/.claude/hooks/frugal-turn-header.js`.
- `frugal-turn-header.js:226` emitted `frugal recommends → …` as the hook `systemMessage` — pre-rebrand leftover (rebrand was 2026-04-14). Confirmed in live transcripts (`d0ef9165…`, `76447f84…`).
- Canonical copy `tools/router/frugal-turn-header.js` IS tracked on dev and was **byte-identical** to the runtime hook.

### 20.B — herd chip 🐄 0/0/peak0 ✅ ROOT CAUSE FOUND
- **`subagent_tracker.trackSpawn()` is never called at runtime.** Proof: zero `/tmp/mooter-herd-*.json` files exist after many local-summarizer spawns.
- No `SubagentStart`/`SubagentStop` hook wired in settings.json; the wired `PostToolUse` (`post_tool_badge.js`) only *reads* the herd snapshot (for the badge annotation) — it never *writes*.
- Secondary: `post_tool_badge.js readSessionId()` had the same Day-4.2 bug (read only `CLAUDE_SESSION_ID`, empty in this runtime) → even once writing is wired, reader/writer must resolve the same session id.

---

## Decisions (Paulo, this turn)
- **20.A format:** `mooter → <tier·model·conf·cost>` (keep correct brand, minimal, no "recommends" frill).
- **20.B wiring:** record spawns from the **already-wired `PostToolUse`** (`post_tool_badge.js`) by detecting `tool_name === 'Agent'`/`'Task'` — **no settings.json change** (shared-config guardrail respected). Trade-off accepted: `active`/`peak` are approximate (PostToolUse sees the subagent already completed); `total spawned` count is accurate.

---

## Status per sub-feature

| # | Item | Status |
|---|---|---|
| 20.A | branding `mooter →` | ✅ **DONE** — edited canonical `tools/router/frugal-turn-header.js:226` + runtime `~/.claude/hooks/frugal-turn-header.js:226`. Zero `frugal recommends` remains. Syntax OK both. |
| 20.B | herd wiring | 🟡 **IN PROGRESS** — foundation done (`post_tool_badge.js readSessionId` now falls back to `CLAUDE_CODE_SESSION_ID`). Remaining: detect Agent/Task in `main()` (read stdin payload once for `session_id`+`tool_name`+`subagent_type`), call `trackSpawn()` + `markDone()` per completed spawn. |
| 20.G | E2E plan | 🟡 **Script ready** (below) for Cowork Chrome MCP |
| 20.C–F | Day 2 | ⏳ pending |

**Verification so far:** classify.js byte-identical (`7b01eb86…87762`); `post_tool_badge.test.js` 15/15 pass.

---

## 20.B remaining implementation plan
1. In `post_tool_badge.js main()`, read the PostToolUse stdin payload **once** (currently `readSessionId()` consumes it) → extract `session_id`, `tool_name`, `tool_input.subagent_type`, and a `spawn_id` (tool_use id if present, else synthesized).
2. When `tool_name` ∈ {`Agent`,`Task`}: map `subagent_type` → tier (local-summarizer→T0, cheap-triage→T1, model-reasoner→T2, model-architect/final-reviewer→T3), then `trackSpawn({agent_name, tier, model, spawn_id, session_id})` immediately followed by `markDone({spawn_id, session_id})` (PostToolUse fires post-completion). Idempotent by `spawn_id`.
3. Keep it best-effort (hooks never throw).
4. Guard: `subagent_tracker.snapshot()` shape unchanged (Wave 13 API non-negotiable).

## 20.G — E2E friends-launch validation script (for Cowork Chrome MCP)
1. Open `mooter.ai` incognito.
2. Click "Sign in with GitHub" → OAuth → callback.
3. `/onboarding` wizard (3 steps) completes.
4. Get install-token URL.
5. CLI install in WSL/Docker (`curl … | bash` → "mooter vX installed").
6. `mooter init` + `mooter login`.
7. First prompt → statusline updates (🪙 token chip, 🐄 herd chip with N>0 after a local spawn).
8. `mooter feedback` → 201.
→ Output: `WAVE20_E2E_FRIENDS_LAUNCH_VALIDATION_RESULTS.md`, PASS/FAIL per step. **Gate: prod promote blocked until PASS.**

## Next
- Finish 20.B trackSpawn wiring + test (spawn local-summarizer → 🐄 0/N/peak1).
- Day 2: 20.C (tkns label), 20.D (calls vs tokens dual metric), 20.E (always-visible), 20.F (per-task Stop breakdown), +7 tests, classify guard, PR squash→dev, final-reviewer (Sonnet).
