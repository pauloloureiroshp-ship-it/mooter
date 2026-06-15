# Wave 64 — Day-0 Recon · Compaction Advisor (Fase 1, context-lifecycle axis)

> **Branch:** `wave64-compaction-advisor` (off `main` @ v1.39.0), isolated worktree `../mooter-wave64-compaction`.
> **Scope this wave: Fase 1 only** (the spec's DoD'd MVP) — the deterministic Stage-1 boundary advisor +
> pressure ladder + decision function + opt-in `🪶` chip + nudge + restorable snapshot. Fases 0/2/3/4 deferred.
> Spec: [[COMPACTION_ADVISOR_DESIGN_2026-06.md]]. Companion: [[REFUTATIONS_LOG.md]].

---

## 0. Invariant checks
- `classify.js` sha256 == `427d8c0b…364bc48f` ✅ verified on the worktree. NOT touched (advisor is downstream).
- New files only: `tools/router/compaction-advisor.js` (+ test), `tools/router/compaction-status.js` (+ test).
  Host-side edits confined to `inject_context.js` (opt-in nudge) + `chip-composer.js` (chip registration).

## 1. Anchors (read, real)
- `inject_context.js:587-599` — the hook reads its payload from stdin (`fs.readFileSync(0)`): fields are
  `prompt`, `session_id`, and the standard UserPromptSubmit set (`cwd`, `transcript_path`). **No reliable
  context-token % field** (W64-R1). `decision.task_category` + `decision.risk_level` are available downstream.
- `chip-composer.js:49 DEFAULT_ELIGIBLE` — self-gating opt-in chips (return `''` until opted in); registers
  modules exposing `statusLine(sessionId)`. `gpu-status.js` / `graph-status.js` are the template.
- `session-affinity.js` (Wave 60) — the host-side per-session breadcrumb pattern (safeId, MOOTER_HOME,
  best-effort, never throws) reused verbatim for the advisor's state.

## 2. Refutations (repo/platform contradicted the brief)

**W64-R1 — no reliable context-token % in the hook ⇒ boundary-first, pressure-optional.** The spec's
pressure ladder wants "tokens reportados pela API". The UserPromptSubmit payload exposes no documented
context-% (the spec itself flags this "parcial/instável", PARTE D). **⇒ `pressureLadder(tokenPct)` is a pure
function that degrades to `monitor` when the number is absent; the advisor's MVP decision rests on the
SEMANTIC BOUNDARY (Stage 1), with pressure as an optional upgrade.** This is *exactly* the differentiation —
everyone else triggers on %, the Mooter triggers on the task boundary.

**W64-R2 — `/compact` cannot be auto-fired ⇒ advisory only.** Firing `/compact` from a hook is impossible
today (CC issue #58538, closed). **⇒ Fase 1 ADVISES (chip `🪶` + `<compaction-advisor>` nudge), never
actuates.** Fase 4 flips `ADVISE_NOW` to actuation in one line when upstream ships it.

**W64-R3 — Fase 0 (global PreCompact hook + `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`) is SHARED CONFIG ⇒ NOT in
this wave.** Wiring a global `PreCompact` hook / setting an autocompact env var changes behavior for **every
open Claude Code session on this machine** — it would break Paulo's parallel terminals (his explicit
constraint). **⇒ Fase 0 is parked for Paulo's explicit OK.** Fase 1 ships the snapshot *capability*
(`buildSnapshot`, tested restorable) WITHOUT wiring the global hook.

**W64-R4 — Stage 1 focus signal uses `cwd`, not a live file-set.** "Set de ficheiros em foco" ideally comes
from PostToolUse-tracked Read/Edit paths, not available in UserPromptSubmit. **⇒ MVP uses `payload.cwd`
change as the focus-shift proxy** (coarse but real and zero-cost); a richer focus-set is a Fase-2 refinement.

**W64-R5 — Stage-3 arbiter uses a single topic ANCHOR, not the spec's "last K turns".** The full arbiter
wants recent conversation turns — but that transcript is exactly what **Wave 65's `session-context.js`
store** (already built on a parallel branch) provides. Building a parallel K-turn store here would
duplicate Wave 65 + add the same privacy surface. **⇒ the MVP arbiter judges the current prompt vs a
single sanitized (`privacy.sanitize`) topic anchor** (the seed of the current topic, reset on a fired
boundary) — light, opt-in, and self-contained. **The full last-K-turns arbiter should reuse Wave 65's
sanitized transcript store post-merge** (a clean follow-up, not a duplicate). Honest scope, not a gap.

## 3. Scope (final — Fase 1)
- `compaction-advisor.js` (NEW) — `pressureLadder`, `commitTestPRSignal`, `stage1Boundary`,
  `compactionDecision` (HOLD/PREP_SNAPSHOT/ADVISE_NOW; **never advises mid-HIGH_RISK**), `buildSnapshot`
  (restorable), per-session breadcrumb (`~/.mooter/compaction/<sid>.json`), `advise()` orchestrator. 13 tests.
- `compaction-status.js` (NEW) — `🪶` chip, self-gating opt-in, reads the breadcrumb. Registered in chip-composer.
- `inject_context.js` — opt-in: call `advise()`, push `<compaction-advisor>` on ADVISE_NOW. Default OFF ⇒ byte-identical.

## 4. Gate
final-reviewer 0-HIGH (read-only, **constrained: no write/commit/tag**) · re-verify sha · diff confined ·
default-OFF byte-identical · never-HIGH_RISK proven · tests isolated to a temp MOOTER_HOME (no live ~/.mooter
pollution — a parallel session may be reading it). **Tag β:** `v1.44.0-compaction-advisor` (Paulo applies final).
