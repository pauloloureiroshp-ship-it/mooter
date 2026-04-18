---
paths: ["tools/router/**/*.js", "hooks/**/*.js"]
description: Router classifier and hook conventions
---

# Router Logic Conventions

## classify.js
- Patterns sorted by specificity (most specific first). Never reorder without running `node backtest.js`.
- Tier thresholds (fixed): T0 confidence ≤ 0.3, T1 ≤ 0.5, T2 ≤ 0.7, T3 > 0.7.
- `HIGH_RISK` regex bank is a hard floor — if any match fires, tier cannot drop below T3 via any downstream rule (guardrail).
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
