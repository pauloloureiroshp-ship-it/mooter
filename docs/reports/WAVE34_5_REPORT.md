# Wave 34.5 — Bug Trinity (B + C + D) — Final Report

**Date:** 2026-06-09 · **Branch:** `fix/wave34_5-bugfix-trinity` · **PR:** [#142](https://github.com/pauloloureiroshp-ship-it/mooter/pull/142) · **Status:** SHIPPED to PR (gated on Paulo merge+tag)

## Key findings (TL;DR — 3 lines)
1. **Bug C was the real, demonstrated bug** — the digest counted only top-level prompts; subagent delegation was invisible. Fixed: dispatches now fold into the tier mix.
2. **Bug D's "ultracode bypass" root cause was a misdiagnosis** (Day 0 refuted it) — the "$0 saved" symptom is the Bug C gap. A hook can't detect the harness thinking-flag nor force delegation, so a fake detector was rejected in favour of an honest caveat.
3. **classify.js sha INTACT** (`7b01eb8623a0b8fc…`), frozen engine packages untouched, **344/344 tests** (335+9), final-reviewer **SHIP** 0-HIGH/0-MED.

## Bugs × fix × tests

| Bug | Severity | Fix approach | Files | Tests |
|---|---|---|---|---|
| **B** Workflow native deps | MED | `describeEngineError()` — precise, actionable message (names missing dep + build cmd / source-checkout guidance / raw error). Frozen `@mooter/workflow` engine untouched. | `commands/workflow.ts` | +4 |
| **C** MLWR digest invisible subagents | HIGH | `buildDigest()` folds the session's **recorded** subagent dispatches (herd state from SubagentStop hook) into per-tier counts. `prompts` vs `delegated` distinct; cloud tier never guessed; savings $ still from tracker (uninflatable). | `commands/digest.ts` | +5 |
| **D** Ultracode bypass | CRITICAL → re-scoped | Day 0 **refuted** premise. Honest caveat in `mooter explain saved` (delegated work counts; inline-Opus reads near 0%). No fake detector, no unenforceable force-delegation. | `commands/explain.ts` | +1 |

## Day 0 premises refuted
- Scope paths `tools/router/digest.js` + `packages/cli/src/digest/` **do not exist** — digest lives in `packages/cli/src/commands/digest.ts`; subagent tracking already in `tools/router/subagent_tracker.js` + `subagentstop_hook.js`.
- Bug C **partially pre-built**: SubagentStop hook already records dispatches; the gap was only that the *digest* never read them.
- Bug D "ultracode forces inline Opus" **not in the validation report** — invented in the kickoff; the symptom equals the Bug C gap.

## Friends DMs — caveats removed
- Delegation is now **visible** in `mooter digest` (Bug C) → "78% saved" no longer silently hides delegated work.
- `mooter explain saved` is **honest** about when savings read low (inline-Opus) → no overclaim.
- `mooter workflow` failure is now **actionable** → a friend on the npm bundle gets a real next step, not a dead end.

## Verification
- `npm test` (packages/cli): 344 pass / 0 fail.
- esbuild bundle: clean.
- final-reviewer (Opus): SHIP; 3 LOW optional nits (global-herd reader under-counts conservatively; substring match in describeEngineError; all doctrinally safe).
- `git diff main -- tools/router/classify.js`: empty.

## Pending Paulo
- Review PR #142 → merge to main → apply tag `v1.23.0-bugfix-trinity`.
- Send Friends DMs (Task #218) — now defensible.
- LoRA train (RTX 4090) · Smoke Mac.

## Deferred (per kickoff)
Friends DMs send · Mac smoke · LoRA train · TurboQuant build · Tailwind v4 · Adapter Forge · Wave 41 NL intent.
