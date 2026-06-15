# RFC — Context Bridge: coherent context across local + subscription models

- **Status:** Draft (decision needed before build)
- **Date:** 2026-06-14
- **Scope (lane):** engine — `tools/router/`, `packages/router/`, providers. Cockpit gets a small read-only surface.
- **Decision asked:** approve P0+P1, defer P3 behind cost data. (See §8.)

---

## 1. Problem

Mooter routes each prompt to the cheapest capable model — local Ollama, Claude (Haiku/Sonnet/Opus), soon Codex/Gemini. But each dispatch path has a **different context model**:

| Path | Context today |
|---|---|
| Claude Code session (the host) | ✅ full native conversation context |
| Local Ollama (`router-execute` → `providers/ollama-api.callOllama`) | ❌ **stateless** — receives only the single prompt |
| Codex CLI | its own session/context |
| Gemini / OpenAI API | stateless |

Confirmed empirically: pinning `qwen2.5:3b` for a prompt and asking "tens o histórico?" returns *"não tenho acesso ao histórico"* — because `router-execute` passes only that one prompt. So **routing/pinning to any non-host model loses the thread**. This blocks multi-model from being usable for anything context-dependent ("continue what we discussed", "fix the bug you found").

## 2. Goals / Non-goals

**Goals**
- Give stateless dispatches (Ollama, later Gemini/OpenAI) a **budgeted, coherent slice** of the conversation so they answer in-context.
- Preserve the local-first **cost advantage** — don't spend the savings on context tokens.
- **Privacy-safe** — the transcript is sensitive.
- **Transparent** — surface "context injected" in the cockpit (Live cow).

**Non-goals**
- Perfect parity with the host's full window (local models are small — impossible by construction).
- Touching the host: when Claude (host) answers, it already has native context → **no injection**.
- `classify.js` (FROZEN) — untouched.

## 3. Architecture — the Context Bridge

Three pieces, all keyed by the **`session_id`** the hook already carries (`inject_context.js` L609/923; per-session state already exists via `readSessionCompliance`).

### 3.1 Transcript store (per session)
`~/.claude/tools/router/.session-context/<session_id>.jsonl` — append-only, one record per turn:
```jsonc
{ "ts": "...", "role": "user"|"assistant", "model": "claude-opus-4-7", "text": "...", "tokens": 123 }
```
- `0600` perms · sanitized via existing `privacy.sanitize()` before write · TTL cleanup (e.g. 7d) · **opt-in** flag.

### 3.2 Writer (host side)
- **User turn:** `inject_context.js` already runs per prompt with `session_id` → append the user turn (it already has the prompt + sanitizer).
- **Assistant turn:** the turn-end/Stop hook (`gsd-turn-end.js` / `stop_hook.js`) appends the assistant response (or a summary). Start→end is already paired by `session_id` (L921).

### 3.3 Reader / injector (dispatch side)
- In `router-execute`, **before** calling a *stateless* provider, build a context slice and inject it:
  - **Budget:** hard token cap per dispatch (e.g. ~1.5k for local; tie to the model's window from the specialization matrix).
  - **Slice** = last *N* turns verbatim **+** a rolling summary of older turns.
  - **Inject** via the existing seam: `callOllama(prompt, { system: <context> + base SYSTEM })` (or prepend to `prompt`). No new provider API.
- **Claude (host) → NO injection** (native context; avoids double-context + cost).
- **Codex CLI → bridge differently** (pass context in its invocation shape).

### 3.4 Rolling summary
- When the transcript exceeds budget, compress older turns into a summary.
- Do it with a **cheap local model (qwen) → $0**; cache the summary in the store; re-summarize incrementally.

## 4. The cost trade-off (the crux)

Injecting context inflates input tokens → **erodes the savings that justify local-first**. Mitigations:

- **Budget cap** per dispatch (hard ceiling).
- **Selective injection:** default to a *small recent window*; optionally only inject when the prompt references prior context (heuristic: "continue", "that", "it", pronouns) — keeps most calls lean.
- **Free summarization:** summaries via local qwen → $0.
- **Honest accounting:** log the extra tokens as a **`context_tax`** field in `decisions_v2.jsonl` so the savings report never hides it.
- Net: **local** calls stay ~$0 (local is free) but pay **latency** (bigger prompt). **Cloud stateless** (Gemini/OpenAI) the context tax is real $ → cap tighter, opt-in only.

## 5. Phased plan

| Phase | Deliverable | Risk |
|---|---|---|
| **P0** | Transcript store + writer (user+assistant turns, sanitized, per-session, opt-in). No injection yet — just observable (the store fills; cockpit can show it). | low |
| **P1** | Injector for **Ollama** in `router-execute` (recent-window slice, budgeted). Pinned local model becomes **context-aware**. | medium |
| **P2** | Rolling summary (free local summarization) for long sessions. | medium |
| **P3** | Extend to **Gemini/OpenAI** (tighter $ budget) + **Codex CLI** bridge. Gate behind P0/P1 cost data. | higher |

## 6. Privacy & guardrails
- Reuse `privacy.sanitize()` + `scanLog()` (already in `tools/router/privacy.js`).
- `0600`, per-session files, TTL cleanup, **opt-in** (default off), and a cockpit toggle.
- Never sync the transcript to the hub (local-only).

## 7. Cockpit surface (read-only)
- On the **Live cow**, while a stateless model runs, show `context: N turns · ~Xk tok` — total transparency about what context the local model got.
- A Setup toggle: "Share conversation context with local models (opt-in)".

## 8. Open decisions (for the team)
1. **Default ON vs opt-in?** → recommend **opt-in**, surfaced in the cockpit (privacy + cost).
2. **Budget size per model** → tie to the model's context window (specialization-matrix) or a flat 1.5k to start.
3. **Summary model/cadence** → qwen, incremental.
4. **Assistant-turn capture** — full text vs summary in the store (size vs fidelity).

## 9. Recommendation
Build **P0 + P1** first — that's the 80/20: the transcript store + the Ollama injector make local pins context-aware, at ~$0 (local) with a measured latency cost. **Gate P3 (cloud) behind the cost measurement** from P0/P1. This is a real wave (a focused build), not an afternoon. **Honest limit:** local models get a *compressed* view of the conversation — never the host's full context. That's a fundamental window constraint, not a bug.
