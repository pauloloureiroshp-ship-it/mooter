# Wave 64 — Report · Compaction Advisor (Fase 1, context-lifecycle axis)

**Branch:** `wave64-compaction-advisor` (off `main` @ v1.39.0) · **Worktree:** `../mooter-wave64-compaction`
**Tag β (CC creates, Paulo applies final):** `v1.44.0-compaction-advisor`
**final-reviewer (Opus, read-only, constrained):** **SHIP-WITH-NITS · 0-HIGH · 1 MED (fixed in-wave) · 2 LOW**.
The reviewer was constrained read-only and **made no commits/tags** (verified via reflog). The MED it caught
was a real bug — **fixed in commit before tagging**.

## What shipped (Fases 1 + 3 — host-side only, zero `packages/*`)

| Item | File | Tests |
|---|---|---|
| Deterministic boundary advisor + **cache-aware gate (Fase 3)** | `tools/router/compaction-advisor.js` (NEW) | `compaction-advisor.test.js` (17) |
| `🪶` opt-in chip | `tools/router/compaction-status.js` (NEW) + `chip-composer.js` | `compaction-status.test.js` (5) |
| Opt-in nudge | `tools/router/inject_context.js` (Option-A region) | non-regression (base-vs-wave 4/4) |

**The differentiator:** every compaction tool fires on a dumb trigger (% of window / tool-call count). This
advises by the **semantic task boundary**, deterministic & host-side. Stage-1 weighted vote: commit/test-PR
(0.5) + `classify.js` category transition (0.4) + focus/`cwd` change (0.3) + user-away gap >10min (0.3);
`≥0.5` = strong boundary. Decision `HOLD`/`PREP_SNAPSHOT`/`ADVISE_NOW` (B.5), **never advises mid-HIGH_RISK**.
Advisory only — CC can't auto-fire `/compact` (issue #58538); Fase 4 flips one line when it can.

**Fase 3 — cache-aware timing (`cacheState`).** The prompt-cache has a ~5-min TTL; compacting rewrites the
prefix and loses a warm cache. So the advisor derives the cache temperature from the inter-turn gap (hot
<90s · cooling · cold ≥5min) and, on a strong boundary, **PREP_SNAPSHOT while the cache is hot** (don't churn
mid-task) vs **ADVISE_NOW when cooling/cold** (the prefix was going to churn anyway). Pure; the risk guard
still wins (HIGH_RISK → HOLD regardless of cache).

## Invariants (verified by final-reviewer + orchestrator)

| # | Invariant | Status |
|---|---|---|
| 1 | classify.js FROZEN (`427d8c0b…364bc48f`) | ✅ intact, not in diff |
| 2 | No `packages/*` / engine edits | ✅ diff = `tools/router/*` + docs only |
| 3 | Default OFF ⇒ hint + statusline byte-identical | ✅ proven (inject_context base-vs-wave 4/4; chip self-gates to '') |
| 4 | Never advises mid-HIGH_RISK | ✅ `compactionDecision(risk:'high')→HOLD` even at boundary 1 + emergency (test) |
| 5 | Best-effort wiring | ✅ try/catch; advisor IO swallows throws |
| 6 | No live `~/.mooter` pollution | ✅ both test files isolate to `mkdtemp` MOOTER_HOME |
| 7 | No shared-config change | ✅ zero `settings.json` / global PreCompact hook (Fase 0 parked) |

## Gate findings (all resolved or intentional)
- **MED — prefs opt-in for the nudge was dead code (FIXED in-wave).** It read prefs via `badge.js readPrefs()`,
  a whitelisting normalizer that strips unknown keys → `compaction_advisor` was always undefined (only the env
  var worked). Now reads raw `preferences.json` directly (mirrors `compaction-status.js`). Verified: prefs
  opt-in resolves `true`; non-regression still 4/4. **⚠️ Same latent bug exists in Wave 62.5's
  `confidence_cascade` prefs path** (also via `readPrefs`) — its env var works; flagged for a 1-line follow-up.
- **LOW — pressure-ladder doc said "Monitor <70" but code is <80 (FIXED).** Doc corrected to `<80`.
- **LOW — `buildSnapshot` is exported/tested but has no Fase-1 caller (intentional).** It's the restorable
  "previously on" capability a future PreCompact hook (Fase 0/4) will use — deliberately dormant, documented.

## Test state
- 22/22 new (advisor 17 + chip 5). `inject_context.test.js` 4/5 (the 1 fail = haiku-pin beaten by active
  beast mode, **pre-existing**; base `0759f85` gives identical 4/5). ReDoS-checked; path-traversal-safe.

## Deferred (the spec's other phases — each ships value isolated)
- **Fase 0** (global PreCompact hook + `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`) — **shared config; needs Paulo's OK**
  (would affect every open CC session).
- **Fase 2** (Ollama embedding-drift detector + qwen3 arbiter), **Fase 4** (auto-trigger when #58538 ships).
  *(Fase 3 cache-aware gate — **shipped this release**.)*

## Handoff to Paulo
1. Push `wave64-compaction-advisor` → PR → merge `main` + apply tag `v1.44.0-compaction-advisor`.
2. Post-merge: `/mooter-update` (touched `tools/router/`).
3. Try it: `MOOTER_COMPACTION_ADVISOR=1` + `MOOTER_STATUSLINE_COMPACTION=1`; commit something and watch `🪶 compact?`.
4. 1-line follow-up: fix Wave 62.5 `confidence_cascade` prefs read the same way (raw JSON, not `readPrefs`).
5. `git worktree remove ../mooter-wave64-compaction` after merge. ⚠️ trivial top-of-`SYNC.md` merge conflict expected.

## Arc status (verified live this session)
- ✅ 60.5 `v1.40.0` · ✅ 60 `v1.41.0` · ✅ 61 `v1.42.0` · ✅ 62.5 `v1.43.0-confidence-cascade` · ✅ 63 `v1.43.0-cheap-guardrails` (parallel session)
- ✅ **64 Compaction Advisor Fase 1 (this wave, `v1.44.0-compaction-advisor`)**
- ⏸ 61-graphify + 65 Context-Bridge — blocked on Paulo's architecture decision
- ⏸ 64 Fases 0/2/3/4 — parked (Fase 0 shared-config; 2/3/4 follow-on)
