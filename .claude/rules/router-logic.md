---
paths: ["tools/router/**/*.js", "hooks/**/*.js"]
description: Router classifier and hook conventions
---

# Router Logic Conventions

## classify.js
- Patterns sorted by specificity (most specific first). Never reorder without running `node backtest.js`.
- **Tier selection is category-driven** (not confidence-threshold). Categories fire in a fixed order: early fast-paths (bash_paste, file_read) → HIGH_RISK → MED_RISK → LOW_RISK → TRIVIAL → ambiguous length bucket. Each branch assigns both `tier` and `confidence` together. Confidence is a quality signal **derived per category**, not a threshold that drives tier.
- `HIGH_RISK` regex bank is a hard floor — if any match fires, tier cannot drop below T3 via any downstream rule (guardrail).
- Downstream modifiers (`TUNED_PROMOTE_T0`, `TUNED_DEMOTE_T3`, `ARCH_SIGNALS`, `QUALITY_INTENT`, `BEAST_INTENT`, `USER_OVERRIDE`, budget cap, active-mode) can adjust the tier post-category, but `HIGH_RISK` always wins.
- Never modify pricing constants without running `npm test` in `tools/router/`.
- When adding new patterns, update `validation-set.test.js` in the same commit.

## Low-confidence handling
- If `confidence < 0.4` after primary classification, attempt a secondary pass with normalized input (lowercase + whitespace strip). Keep the higher-confidence result.
- Never return confidence `0` silently — fallthrough must include `escalation_rule: "classifier_error_fallthrough"` for audit.

## Hooks (PreToolUse / PostToolUse)
- Exit 0 = allow. Exit 2 = block and surface stderr to user. Never exit >2 (harness treats as transient).
- Timeout ≤ 5s. Never `await` network calls in hooks.
- Log structured JSON to `~/.claude/hooks/execution.log` — one line per event.
- Tool outputs must be trimmed before injection into context (see `inject_context.js` `trimToolOutput`).

## Tuning pipeline
- `backtest.js` excludes tester events (`source: mooter-tester`) to prevent meta-prompt pollution.
- `update-router.js` must back up `classify.js` → `classify.js.bak` before writing.
- Promote/demote pools must exclude `quality_intent=true` and `user_override=true` events.

## Source of truth — canonical vs runtime locations

The router lives in **three** filesystem locations. Edit the canonical one; the runtime copy is kept in sync by `/mooter-update`:

| Path | Role | Edit here? |
|---|---|---|
| `frugal/tools/router/*.js` | **Canonical (versioned)** | ✅ Yes — all changes start here |
| `~/.claude/tools/router/*.js` | Runtime (what `inject_context.js` hook actually loads) | ❌ No — will be overwritten by `/mooter-update` |
| `~/.claude/hooks/*.js` | Wired by `settings.json` (`PostToolUse.js`, `exec-logger.js`, `frugal-turn-header.js`, `gsd-*-guard.js`) | Edit via frugal mirror + sync |

**Drift protocol** (AUDIT-MOOTER-2026-04-19 F1.1):
1. Edit canonical under `frugal/tools/router/`.
2. For files wired in `settings.json` that live in `~/.claude/hooks/`, edit both the frugal mirror and the hooks copy until `/mooter-update` automates it.
3. Stale legacy copies (`~/.claude/hooks/gsd-statusline.js`, `~/.claude/hooks/inject_context.js`) are not wired — safe to remove when confirmed.
4. `~/.claude/tools/router/classify.js.bak` is an expected artifact produced by `update-router.js` — not drift.

## Mode state file schema (v1.1)

`~/.claude/tools/router/.mooter-mode.json` uses a **union schema**:

```json
{
  "mode": "beast" | "zen" | "auto",
  "beast_mode": boolean,
  "zen_mode":   boolean,
  "active_since": "ISO-8601",
  "version": "1.1",
  "... feature flags ...": true
}
```

- Writers (`mooter-mode.js`, `mooter-autopilot.js`) emit both `mode` string AND `beast_mode`/`zen_mode` flags.
- Readers (`inject_context.js`, `gsd-statusline.js`, `mooter-mode.js` readMode) prefer `mode` string, fall back to flags.
- `mode === "auto"` or absent ⇒ no override.
- Gate tasks (push / merge / deploy / migration) bypass zen for safety.
