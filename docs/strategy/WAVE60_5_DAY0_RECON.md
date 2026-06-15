# Wave 60.5 — Day-0 Recon · Reasoning-Effort Axis (GAP 1)

> **Mission:** add axis 2 (reasoning/output) to the Mooter multi-axis router. Emit a
> per-task `reasoning_effort` (`none|low|medium|high`) derived deterministically from
> signals `classify.js` already computes — zero LLM, no proxy, no frozen-file edits.
> **Branch:** `wave60_5-reasoning-axis` (off `main` @ v1.39.0). **Companion:**
> [[REFUTATIONS_LOG.md]] · [[TOKEN_ECONOMY_SOTA_GAP_2026-06.md]] · [[MASTERPROMPT_MULTIAXIS_2026-06.md]].

---

## 0. Invariant checks (before first line of code)

| Invariant | Status |
|---|---|
| `classify.js` sha256 == `427d8c0b…364bc48f` | ✅ verified on `main` **and** on `wave60_5-reasoning-axis` |
| Engine packages `packages/*` untouched | ✅ this wave adds **host-side** files under `tools/router/` only; zero `packages/` edits |
| NO-PROXY | ✅ host-side annotation of `router-hint` + new files only; never on the request path |
| Zero LLM in decision | ✅ `reasoningEffort()` is pure regex/set lookups over the existing `decision` object |
| Doctrine > optimiser | ✅ HIGH_RISK / architecture / cross-file / safety-floor → `high`, never cut |
| Statusline default byte-identical | ✅ chip is opt-in self-gating; hint tag is best-effort (omitted if module absent) |
| Selective git add | ✅ staging only the files this wave creates/edits |
| No new root `.md` | ✅ docs land in `docs/strategy/` and `docs/ux/` |

## 1. Anchor files (read, real line numbers)

- `tools/router/classify.js` — **FROZEN**, read-only. Category vocabulary harvested (see §2).
- `packages/router/src/classify_complexity.ts:25-36` — `ComplexityClassification` interface: the
  fields surfaced into the hint (`tier, task_category, risk_level, recommended_*, confidence,
  escalation_rule`). Confirms which signals the host-side `decision` carries.
- `packages/router/src/task-categories.ts` — the **24-category matrix taxonomy** (`coding.frontend`…).
  Refuted as the derivation source (see §2/R1).
- `tools/router/inject_context.js`
  - `:1056-1067` — `adapter_selection` layer = the best-effort template (require sibling → annotate
    `decision` → try/catch swallow). Block B mirrors this shape.
  - `:1295-1321` — the `lines` const that builds `<router-hint>` (`.filter(Boolean)` drops nulls).
  - `:1329-1339` — `<tier-badge>` emission = the standalone-tag template Block B copies exactly.
  - `:1432` — `process.stdout.write(lines.join('\n') + '\n')` — single emission point.
- `tools/router/adapter_selection.js` — module style template (`'use strict'`, CommonJS, pure,
  best-effort, `module.exports`).
- Test harness: `node --test` (`*.test.js`). `inject_context.test.js` shows the `runHook()`
  spawn-with-stdin-JSON pattern reused for the Block B non-regression test.

## 2. Refutations (repo contradicted the brief — registered in REFUTATIONS_LOG.md)

**R1 — derivation source.** The brief says derive effort from `task_category` (implying the 24-cat
`task-categories.ts` taxonomy). **Reality:** that taxonomy is the Wave 58 *matrix engine* and never
reaches the host-side `decision`. `classify.js` emits a **different, smaller** vocabulary via its
`category` variable (`classify.js:666-729`) + early fast-paths:
`cross_file_change`, `architecture_or_critical` (T3/high) · `reasoning_intermediate` (T2/med) ·
`simple_transform_or_explain`, `cheap_task`, `ambiguous_medium`, `ambiguous_long` (T1/low) ·
`trivial_local`, `mechanical_trivial`, `ambiguous_short`, `bash_command_paste`, `file_read_intent`
(T0/minimal). **Action:** Block A keys off these real values, not the 24-cat names.

**R2 — git base.** The brief's §3 worktree command branches off current `HEAD`. **Reality:** the
working repo was on `wave60_design_redesign`, **20 commits of landing-page design ahead of `main`**,
dirty tree. Those 20 commits touch **zero** `tools/router` / `packages/router` files (42 `landing/`,
7 non-router `packages/`). **Action:** branch off `main` (v1.39.0 = the brief's stated world-state),
not HEAD. The design-session `SYNC.md` WIP was stashed (`git stash` — restore on
`wave60_design_redesign` with `git stash pop`).

**R3 — execution shape.** Paulo chose **in-place branch off `main`, no worktree** (the §3 Windows
spawn-sandbox caveat only bites *parallel* worktrees; this is one sequential wave). `mooter` CLI is
not on PATH (bin = `./src/index.ts` via tsx), so `mooter conductor lock` is **skipped** — an isolated
fresh branch has negligible race surface and no other worktree holds `main`/`wave60_5`.

**R4 — T5/Fable effort.** Naively `tier → effort` would map T5 (Fable) to `high`. **Reality:** T3 is
*complexity-driven* (classify.js only assigns T3 on high signals), but T5 is *pin-driven* (`@fable`,
decoupled from task complexity). Mapping T5→high would force max thinking on a trivial pinned task.
**Action:** T5 is **not** special-cased; it falls through to risk/category derivation, so effort
tracks the *task*, not the pinned model. (T3 stays `high` because T3 ⟺ high complexity.)

## 3. Block plan (each with ≥1 test, atomic commit)

- **A** `tools/router/reasoning-effort.js` (NEW) — pure `reasoningEffort(decision) → none|low|medium|high`.
  Unit test covers every branch (coverage gate ≥70%).
- **B** `inject_context.js` — best-effort block after the `lines` const: emit
  `<reasoning-effort>LEVEL</reasoning-effort>` (mirror `<tier-badge>`). Non-regression test: tag
  present for a known prompt; default byte-identity preserved when the module is absent.
- **C** `mooter explain reasoning` CLI + opt-in self-gating `🧠eff` chip (default off).
- **D** `docs/ux/REASONING_EFFORT.md` — category→effort map + rationale.

## 4. Gate (end of wave)

final-reviewer (Opus) 0-HIGH · re-verify classify.js sha · diff confined to allowlist · handoff
(`SYNC.md` entry + `WAVE60_5_REPORT.md`) · `/mooter-update` (touches `tools/router/`) · β tag
`v1.40.0-reasoning-axis` (Paulo applies final).
