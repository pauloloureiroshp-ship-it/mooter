# Wave 62.5 — Report · Local-First Confidence Cascade (execution axis)

**Branch:** `wave62_5-confidence-cascade` (off `main` @ v1.39.0) · **Worktree:** `../mooter-wave62_5`
**Tag β (CC creates, Paulo applies final):** `v1.43.0-confidence-cascade`
⚠️ **Version collision:** a parallel session already tagged Wave 63 as `v1.43.0-cheap-guardrails`. Both
are β tags (distinct git refs); Paulo reconciles the final numbering at merge.
**final-reviewer (Opus, read-only, constrained):** **SHIP · 0-HIGH · 0-MED · 2 LOW** (non-blocking).
The reviewer was explicitly constrained to read-only and **made no commits/tags** (verified via reflog) —
correcting the Wave 60 deviation. Verdict independently corroborated by the orchestrator.

## What shipped (host-side only — zero `packages/*` touched)

| Block | File | Tests |
|---|---|---|
| **A** confidence primitive | `tools/router/confidence-probe.js` (NEW) | `confidence-probe.test.js` (12) |
| **B** opt-in cascade gate | `tools/router/inject_context.js` (Option-A path) | non-regression (base-vs-wave 4/4) |
| **C** advisory telemetry | `tools/router/savings-tracker.js` | `cascade-savings.test.js` (5) |
| **D** opt-in + calibration | `inject_context.js` + `confidence-probe.js` | (calibrate fn ∈ A's 12) |

**The gap it closes:** Option A injected **any** local draft >5 chars as a `<suggested_answer>` for
verbatim output — with **no quality gate**. The cascade adds a deterministic, zero-extra-call confidence
score over the draft already in hand: confident → keep (stay local, `option_a_hit` as before); shaky →
withhold + emit `<confidence-cascade>` so the agent reasons/escalates instead of echoing a weak draft.

- **A** `draftConfidence(text,opts)→{score∈[0,1],band,reasons}` — pure, deterministic; signals: refusal/
  hedging/degeneracy/truncation/code-fence balance. Zero LLM, zero IO, no network (W62.5-R1: Ollama
  returns only text + re-sampling in-hook is latency-prohibited, so confidence is textual). Plus
  `calibrateLowThreshold(scores)` (percentile, clamped [0.3,0.6], static fallback <8 samples).
- **B** opt-in (`MOOTER_CONFIDENCE_CASCADE=1` / prefs `confidence_cascade`). Default OFF ⇒ Option A
  behaves exactly as before. Best-effort try/catch (probe error keeps the draft). `option_a_hit` logged
  ONLY when the draft is kept.
- **C** advisory counters `cascade_local_kept` / `cascade_escalated` → `cascade_decisions`,
  `cascade_escalation_rate`. **Never added to `guaranteed_saved`** (W62.5-R2: the cascade prevents
  *false* savings, it doesn't make real ones); `guaranteed ≤ advisory` invariant preserved.
- **D** calibrated `lowThreshold` read out-of-band from env/prefs (no hot-path IO); never HIGH_RISK.

## Invariants (verified by final-reviewer + orchestrator)

| # | Invariant | Status |
|---|---|---|
| 1 | classify.js FROZEN (sha `427d8c0b…364bc48f`) | ✅ intact, not in diff |
| 2 | No `packages/*` / engine edits | ✅ diff = `tools/router/*` + docs only (zero packages) |
| 3 | NO-PROXY / zero-LLM-in-decision | ✅ probe pure; no new Ollama/LLM call added to the hook |
| 4 | Default OFF ⇒ hint byte-identical | ✅ proven: base-vs-wave inject_context.test.js identical 4/4 |
| 5 | Never fires on HIGH_RISK | ✅ structural — Option A is T0-only; HIGH_RISK floors to T3 |
| 6 | Advisory honesty (`guaranteed ≤ advisory`) | ✅ cascade counters never touch guaranteed_saved (test) |
| 7 | Best-effort wiring | ✅ try/catch keeps the draft on any probe error |

## Test state
- Block A 12/12 · Block C 5/5 (17/17 new) — re-run green by orchestrator and reviewer.
- `inject_context.test.js`: 4/5 on this machine (global beast active) / 5/5 in auto — the 1 failure is a
  haiku-pin test beaten by beast forcing Opus, **proven pre-existing** (base `0759f85` gives identical 4/5
  without Block B). Not a Wave 62.5 regression.
- ReDoS-checked (linear regexes; 50k words in ~4ms). No fs/network in the probe → no path traversal.

## LOW (non-blocking, from the gate)
- Day-0 recon doc has minor line-number drift vs the post-edit files (non-load-bearing; claims accurate).
- `codeish` heuristic treats a draft ending in `;`/`}` as code — intentional/conservative (worst case a
  small penalty that only escalates if it crosses the low band).

## Handoff to Paulo
1. Push `wave62_5-confidence-cascade` → PR → merge `main` + apply tag (reconcile the `v1.43.0` collision
   with Wave 63 — likely 62.5 → `v1.43.0`, Wave 63 → `v1.44.0`, since 62.5 precedes 63 in the arc).
2. Post-merge: `/mooter-update` (touched `tools/router/`).
3. Try it: set `MOOTER_CONFIDENCE_CASCADE=1` and watch low-confidence T0 drafts get withheld.
4. `git worktree remove ../mooter-wave62_5` after merge. ⚠️ trivial top-of-`SYNC.md` merge conflict
   expected with the other wave branches (all prepend off main).

## Arc status (verified live this session)
- ✅ 60.5 Reasoning-Effort (`v1.40.0`) · ✅ 60 Cache-Aware + Affinity (`v1.41.0`) · ✅ 61 Context-Budget (`v1.42.0`)
- ✅ **62.5 Confidence Cascade (this wave, `v1.43.0-confidence-cascade`)**
- ✅ 63 Cheap Guardrails (`v1.43.0-cheap-guardrails`, shipped by a parallel session)
- ⏸ 61-graphify + 65 Context-Bridge — **blocked on Paulo's architecture decision** (not effort)
- ⏸ 64 Compaction Advisor — Fase 0 is shared-config (needs Paulo OK); Fases 1-3 buildable
