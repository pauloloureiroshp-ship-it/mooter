# Wave 62.5 — Day-0 Recon · Local-First Confidence Cascade (execution axis)

> **Branch:** `wave62_5-confidence-cascade` (off `main` @ v1.39.0), isolated worktree `../mooter-wave62_5`.
> **Thesis:** the local moo already drafts answers for confident T0 prompts (Option A). Today it injects
> **any** draft >5 chars verbatim with **no quality gate**. The cascade adds a deterministic confidence
> gate on the draft already in hand: confident → keep local; shaky → suppress + emit an escalation hint.
> Companion: [[REFUTATIONS_LOG.md]] · [[TOKEN_ECONOMY_SOTA_GAP_2026-06.md]].

---

## 0. Invariant checks (before first line of code)
- `classify.js` sha256 == `427d8c0b…364bc48f` ✅ verified on the worktree.
- `classify.js` is **NOT touched** — the cascade is a host-side EXECUTION mode downstream of the decision.
  Tier stays 100% classifier-owned (NO-PROXY, mission §3/§4).
- New files only: `tools/router/confidence-probe.js` + test, `docs/ux/CONFIDENCE_CASCADE.md`. Host-side
  edits confined to `inject_context.js` (Option-A path) + `savings-tracker.js` (advisory aggregation).

## 1. Anchors (read, real line numbers)
- **Option A** — `inject_context.js:1101-1131`. Runs `ollama_call_node.js` via `spawnSync` (timeout 8000ms)
  when `tier==='T0' && backend==='ollama' && confidence>=0.75 && prompt.length<800 && !pinned && !quality_intent`.
  On a draft >5 chars → `suggestedAnswer = stdout.trim()` → injected as `<suggested_answer>` (output verbatim).
  **No assessment of the draft's quality.** This is the single integration point.
- **`ollama_call_node.js:38,62-63`** — POSTs `/api/generate` with `options:{temperature:0.2,num_predict:256}`,
  prints `JSON.parse(data).response` (plain text) to stdout. **No logprobs are returned or requested.**
- **`savings-tracker.js:95,439-596`** — aggregates `decisions.log`; has `guaranteed_saved` (option_a_hits ×
  avgOpusTurn, REAL) vs `advisory_saved`, with the honesty invariant `guaranteed ≤ advisory` (`:547-550`).
  Readers filter by `e.event` and tolerate extra fields → safe to add new event types.
- **`classify.js` / `patterns.js`** — `HIGH_RISK` is a hard T3 floor (`router-logic.md`). Option A requires
  `tier==='T0'`, so a HIGH_RISK prompt is structurally never an Option-A draft → the cascade **cannot fire
  on HIGH_RISK**. DoD "never escalate-decision in HIGH_RISK" is satisfied by construction (asserted anyway).

## 2. Refutations (repo/platform contradicted the brief)

**W62.5-R1 — no logprobs available; confidence must be textual, not mean-logprob.** The brief proposes
"mean log-prob normalizado / self-consistency leve". Reality: `ollama_call_node.js` returns only the
response text; Ollama's `/api/generate` does not plumb per-token logprobs here. **Self-consistency (2-3×
re-sampling) is non-viable inside the hook** — the hook rule is "never await network / ≤5s" and Option-A
already spends up to 8s on one draft; 2-3× would blow the budget. **⇒ MVP confidence = a deterministic,
zero-extra-call heuristic over the draft text already produced** (refusal/hedging/degeneracy/truncation/
fence-balance signals). Logprob/self-consistency are a documented future enhancement, not the MVP.

**W62.5-R2 — the cascade does NOT manufacture new $ savings; it prevents false ones.** Today every
`option_a_hit` is counted as a guaranteed save regardless of draft quality. A bad draft output verbatim
actually costs MORE (user re-prompts → full cloud turn). So the cascade's value is **correctness/trust**,
not extra dollars. **⇒ savings attribution stays `advisory`**: count `cascade_local_kept` (drafts trusted)
vs `cascade_escalated` (shaky drafts withheld). It must **never** be added to `guaranteed_saved`, and the
existing `guaranteed ≤ advisory` invariant is preserved. Honest framing in the report.

**W62.5-R3 — default must be OFF (hint byte-identical).** Suppressing a `<suggested_answer>` changes the
hint. Mission invariant #6 + DoD require the default hint byte-identical. **⇒ the cascade is opt-in**
(`MOOTER_CONFIDENCE_CASCADE=1` or `~/.mooter/preferences.json confidence_cascade:true`); OFF → Option A
behaves exactly as today (any draft injected). Best-effort try/catch → any probe error falls back to the
current behavior (inject the draft), never blocks the hint.

**W62.5-R4 — MVP scope = piggyback the existing T0 draft, not new "T1-borderline" drafts.** The brief
mentions T0/T1-borderline. Producing a draft for a prompt that did NOT already trigger Option A would
need an extra in-hook Ollama call (latency-prohibited, R1). **⇒ MVP gates only drafts Option A already
produces.** The pure probe is also exported for the agentic loop (`spawn-orchestrator`/workflow), which
controls its own timing and CAN do a full cascade later — same function, different caller.

## 3. Scope (final — A is the new primitive; B/C/D wire it, all opt-in)
- **A** `tools/router/confidence-probe.js` (NEW, pure) — `draftConfidence(text, opts) → {score, band, reasons}`.
- **B** `inject_context.js` Option-A path — opt-in gate: confident → keep; low → suppress + `<confidence-cascade>` note (pairs with Wave 60.5 reasoning-effort). Default OFF ⇒ byte-identical.
- **C** `savings-tracker.js` — advisory counters `cascade_local_kept` / `cascade_escalated` (never `guaranteed`).
- **D** opt-in flag + percentile threshold calibration (static fallback when samples are few); never HIGH_RISK.

## 4. Gate (end of wave)
final-reviewer 0-HIGH (read-only — constrained: no write/commit/tag) · re-verify sha · diff confined ·
handoff · β tag `v1.43.0-confidence-cascade` (Paulo applies final). Tests: probe unit + Option-A
non-regression (default OFF byte-identical) + savings aggregation.
