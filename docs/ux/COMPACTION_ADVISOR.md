# Compaction Advisor (Wave 64 · Fase 1)

**Context-lifecycle axis.** Every compaction system in the wild fires on a **dumb trigger** — % of the
window or tool-call count. None decides by the **semantic task boundary**, and none uses the cache state
to pick the instant. The Mooter Compaction Advisor decides **when** to compact by detecting the task
boundary, host-side, deterministic, zero-cloud — and (today) **advises**, because Claude Code can't yet
auto-fire `/compact` from a hook (issue #58538).

> **Fase 1 (this release)** = the deterministic Stage-1 advisor + chip + nudge. Fases 2 (Ollama embedding
> drift), 3 (cache-aware TTL gate), 4 (auto-trigger when #58538 ships), and 0 (global PreCompact hook /
> autocompact override — **shared config, parked for your OK**) are separate phases.

## How it decides

`tools/router/compaction-advisor.js` — pure, deterministic, <1ms:

1. **Stage-1 boundary gate** (`stage1Boundary`): weighted vote over signals the harness already has —
   commit/test-pass/PR language (0.5, strongest), `classify.js` category transition (0.4), focus/`cwd`
   change (0.3), user-away temporal gap >10min (0.3). `score ≥ 0.5` ⇒ a **strong, causal boundary**.
2. **Pressure ladder** (`pressureLadder`): Monitor <80 · Mask 80 · Prune 85 · Advise 90 · Emergency 99,
   from an API-reported fill %. **Degrades to `monitor` when no % is available** (the hook exposes none
   reliably) — so the MVP rests on the *boundary*, which is the differentiation.
3. **Decision** (`compactionDecision`): 
   - `HOLD` — weak boundary, low pressure.
   - `PREP_SNAPSHOT` — strong boundary but cache still hot (don't churn the prefix yet).
   - `ADVISE_NOW` — strong boundary AND cache not hot, **or** pressure ≥ Advise.
   - **SAFETY: never `ADVISE_NOW` mid-HIGH_RISK** — returns `HOLD` regardless (never interrupt a
     deploy/migration/secret unit of work).

The best moment is **right after a commit/test-pass + a pause**: zero in-flight work to lose, and the
prompt-cache (5-min TTL) was about to churn anyway — so compacting there is "free of regret."

## Surfaces

- **Nudge** (`<compaction-advisor>` in the router-hint) when the decision is `ADVISE_NOW`.
- **Chip** `🪶 compact?` / `🪶 prep` (`compaction-status.js`) — opt-in, self-gating.
- **Snapshot** `buildSnapshot(state)` — a restorable "previously on" payload (the capability a PreCompact
  hook would persist). The global PreCompact wiring is **not** enabled here (Fase 0, shared config).

## Turning it on (opt-in — default OFF, hint + statusline byte-identical)

- Advisor nudge: `MOOTER_COMPACTION_ADVISOR=1` or prefs `{ "compaction_advisor": true }`.
- Chip: `MOOTER_STATUSLINE_COMPACTION=1` or prefs `{ "statusline_chips": { "compaction": true } }`.

## Doctrine

Host-side, no-proxy, zero-LLM on the critical path (the local LLM is Fase 2, grey-zone only). State lives
in a per-session breadcrumb `~/.mooter/compaction/<session>.json` (same pattern as session-affinity);
all IO is best-effort and never throws. `classify.js` is untouched — the advisor is downstream and only
*reads* the category. Risk: over-compaction → require a **strong boundary** to advise, and **never** in
HIGH_RISK.
