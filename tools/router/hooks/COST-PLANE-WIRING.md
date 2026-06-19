# Cost plane — heterogeneous fleet wiring (First Magic FASE 3)

Three host-side, zero-LLM primitives + one hook. All opt-in; default install stays
byte-identical.

## 1. `SubagentStart` hook — per-subagent local|cloud routing (bias only)
Registers a deterministic router that, when a subagent starts, decides local Ollama vs the
cloud maestro by ROLE and emits `additionalContext` (it BIASES, never blocks):

```jsonc
{
  "hooks": {
    "SubagentStart": [
      { "matcher": "*", "hooks": [
        { "type": "command",
          "command": "node \"$HOME/.claude/tools/router/hooks/SubagentStart-moo-route.js\"" }
      ] }
    ]
  }
}
```
- Leaf/verbose roles (retrieval, grep, read logs, run tests, summarize, extract) → **local Ollama ($0)**.
- Synthesis/decision/design/review → **cloud maestro**.
- **Only-upgrade:** a HIGH_RISK task (via `moo-risk`, which reuses the frozen classify.js
  HIGH_RISK bank) is forced to **cloud Opus** regardless of role — risky/architectural work
  never silently lands on a small local Moo.
- The number of concurrent local Moos is HW-derived (`local-fleet.js`), never invented
  (≈2 on an 8GB M3; scales with RAM).

> The exact `SubagentStart` payload field names should be confirmed against the live hook
> schema; the parser is tolerant and degrades to a no-op rather than misfiring.

## 2. Handoff bus — distilled working-state, not a dump
`handoff-bus.js` writes `~/.mooter/run/<id>/state.md`: `## Goal / Decisions / State / Open /
Artifacts`, **capped** (per-section line caps + a 4 KB hard total). The maestro receives the
distilled working-state — not a transcript — so its prompt cache survives the handoff.
The arbiter keeps **one paid thread per provider** (`arbitrate()`): once a run pins a
maestro provider, cloud handoffs stay on it (cache preserved) unless a forced switch.

## 3. Run savings — honest, vs the all-Opus counterfactual
`run-savings.js` (`computeRunSavings`) prices every lane's **real measured tokens** with the
pricing SSOT (`pricing.js`): `counterfactual = all lanes @ Opus`, `actual = local $0 + cloud
@ real`. No measured tokens → `saved = null` ("—"), **never fabricated**.

## Verify (reproducible)
```sh
cd tools/router
node subagent-route.js "grep the logs"                 # → local
node subagent-route.js "read logs" "drop prod table"   # → cloud Opus (only-upgrade)
node cost-plane-demo.js                                 # real local Moos in parallel ($0) + savings
node --test subagent-route.test.js run-savings.test.js handoff-bus.test.js hooks/SubagentStart-moo-route.test.js
```
