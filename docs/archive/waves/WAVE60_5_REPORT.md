# Wave 60.5 — Report · Reasoning-Effort Axis (GAP 1)

**Branch:** `wave60_5-reasoning-axis` (off `main` @ v1.39.0) · **Worktree:** `../mooter-wave60_5`
**Tag β (CC creates, Paulo applies final):** `v1.40.0-reasoning-axis`
**final-reviewer (Opus):** SHIP-WITH-NITS · **0-HIGH · 0-MED** · 2 non-blocking NITs

## Definition of Done (from the Master Prompt §4 Wave 60.5)

| DoD item | Status | Evidence |
|---|---|---|
| Mapping tested (HIGH_RISK→high; trivial→low) | ✅ | `reasoning-effort.test.js` — 23 tests, every branch |
| Hint default byte-identical without the module | ✅ | `reasoning-effort-hint.test.js` — splice-and-compare proof |
| `classify.js` sha intact | ✅ | `427d8c0b…364bc48f` — verified pre-first-line, per block, post-review |
| final-reviewer 0-HIGH | ✅ | SHIP-WITH-NITS, 0-HIGH/0-MED |

## Invariants (Master Prompt §1)

| # | Invariant | Status |
|---|---|---|
| 1 | classify.js FROZEN (sha) | ✅ intact, not in diff |
| 2 | `packages/*` frozen; host-side additions only | ✅ zero `packages/` files touched |
| 3 | NO-PROXY | ✅ host-side hint annotation + 1 local file; never on request path |
| 4 | Zero LLM in the decision | ✅ `reasoningEffort()` is pure lookups |
| 5 | Doctrine > optimiser (HIGH_RISK→high) | ✅ first precedence branch, never cut |
| 6 | Statusline default byte-identical | ✅ chip opt-in (CHIP_MODULES not DEFAULT_ELIGIBLE) |
| 7 | Selective git adds | ✅ 5 clean commits; package-lock NOT staged |
| 8 | No new root `.md` | ✅ docs in `docs/strategy/` + `docs/ux/` |
| 9 | PT-PT convo, English code | ✅ |

> Special note on `max_tokens`: never tightened — the only knob is the effort level (the brief
> forbids squeezing max_tokens because it truncates reasoning models and still bills the thinking).

## Deliverables

| Block | File(s) | Tests |
|---|---|---|
| A | `tools/router/reasoning-effort.js` (NEW) | `reasoning-effort.test.js` (23) |
| B | `tools/router/inject_context.js` (host-side edit) | `reasoning-effort-hint.test.js` (3) |
| C | `tools/router/reasoning-effort-status.js` (NEW), `chip-composer.js` (host-side edit), `inject_context.js` persistence | `reasoning-effort-status.test.js` (6) |
| D | `docs/ux/REASONING_EFFORT.md` (NEW) | — |
| recon | `docs/strategy/WAVE60_5_DAY0_RECON.md`, `REFUTATIONS_LOG.md` (R1–R5) | — |

`tools/router/package.json` — registered the 3 new test files + lint + c8 coverage for the new modules.

## Refutations (REFUTATIONS_LOG.md R1–R5)

- **R1** Derive from the real `classify.js` category vocabulary, not the 24-cat matrix taxonomy.
- **R2** Branch off `main`, not the dirty `wave60_design_redesign` HEAD.
- **R3** In-place collided with a concurrent session → recovered into an isolated worktree (cherry-pick).
- **R4** T5/Fable tracks the task's risk/category, not forced to `high`.
- **R5** `mooter explain reasoning` CLI deferred (frozen `packages/cli` explain.ts, no allowlist).

## Test state

- New tests (this wave): **32/32 pass** (23 + 3 + 6).
- Full router suite (auto mode): **771/777 pass**. The 5 failures are PRE-EXISTING / environmental and
  independent of this wave: `getActiveAdapter` ×2 (test sets `process.env.HOME` but `os.homedir()`
  reads `USERPROFILE` on Windows), `statusLine honours hidden_chips opt-out` ×3 (agent-focus / sister
  chips appear from live session state). Verified the same set fails on the pre-wave tree.
- Lint clean on all new/changed files.

## Non-blocking NITs (final-reviewer)

1. `tools/router/package-lock.json` — pre-existing drift (`0.9.9`→`1.0.0`; `main`'s lock was stale).
   Auto-synced by npm during install; **not staged** into any wave commit. Leave unstaged or land as a
   standalone `chore: sync lockfile`.
2. `reasoning-effort-status.js` `prefs()` reads homedir-only (ignores `MOOTER_HOME`) while `statePath()`
   honors it — intentional, matches sibling chips (`effort-status.js`, `quant-status.js`). Harmless.

## Handoff to Paulo

1. Review/push `wave60_5-reasoning-axis` → PR → merge `main` + apply tag `v1.40.0-reasoning-axis`.
2. Post-merge: `/mooter-update` (this wave touched `tools/router/`).
3. Decide cleanup of the 3 reasoning-effort commits that also landed on `wave60_design_redesign` during
   the concurrent-session race (history rewrite — deliberately not done while that branch is active).
4. `git worktree remove ../mooter-wave60_5` only after merge.
5. Restore the design-session `SYNC.md` WIP: `git stash pop` on `wave60_design_redesign`.
