---
name: moo-loop
description: Run agentic loops cheaply and safely — the governance layer under loop engineering. Iterate until a deterministic critic passes (moo-verify, $0), cap cost/iterations HARD, never run a destructive action (moo-risk), route local-first and escalate to the cloud only near the objective. Also wraps the native /loop for free local polling, feeds /goal's evaluator a deterministic verdict, and gates Dynamic-Workflows fan-out per subagent. Use when a task needs iteration until a machine-checkable criterion, recurring local-first monitoring, or per-subagent budget/risk control.
---

# moo-loop — cheap, safe agentic loops

> The native `/loop` runs expensive, `/goal` stops on a model's opinion, and an
> ungoverned loop can wreck things. **moo-loop is the layer that's missing under
> loop engineering:** it keeps the loop but makes it **stop by proof, cap hard, and
> never make a mess** — in any model. The whole stop/risk/budget path is pure
> Node+shell (**zero paid LLM**); the code-fixing attempt is delegated.

It reuses the shipped primitives — never duplicates them: `moo-verify` (the $0
deterministic critic), `moo-risk` (the destructive-action gate), `subagent-route`
(local-first cost plane), `handoff-bus` (distilled handoff), `run-savings` +
`pricing.js` (honest cost). `classify.js` is never touched.

## `until` — loop until the critic proves it's done
```
moo-loop until <verify-profile> --max-cost $X --max-iters N \
  [--goal "<predicate>"] [--attempt-cmd "<coder>"] [--no-progress N] \
  [--escalate-near [--near-threshold N]] [--cockpit]
```
- **Stop = `moo-verify`** ($0, deterministic), checked first every tick → stops the
  instant the tests pass, never on the model's opinion (no self-preference).
- **Caps are ENFORCEMENT:** `--max-cost` cuts the expensive source *before* the spend,
  `--max-iters` is the backstop, and a `no-progress` abort stops "trying the same
  thing". **Opt-in by design:** refuses to run without BOTH caps.
- **`moo-risk`** vetoes a destructive attempt before it runs.
- **Local-first**; `--escalate-near` escalates to the cloud maestro only when the
  critic's *signal* says you're near the objective (the last jump), handing it a
  **distilled** working-state via `handoff-bus`. Savings vs all-frontier are
  reported (estimate; the coder is delegated, so tokens aren't measured).
- **`--cockpit`** streams the live panel (iteration · stop_reason · cost/model per
  tick · budget remaining · signal · risk) to the existing cockpit.

## `poll` — recurring monitoring where the tick is free
```
moo-loop poll <interval> "<check>" [--max-cost $X] [--actionable-when …] [--escalate "<what>"]
```
Wraps the **native `/loop`** (does not reinvent cron). Prints the `/loop` wiring; each
fire runs the check **locally ($0)** and only signals **ACTIONABLE** — i.e. spends a
paid model — when the check finds something real AND the per-window budget allows it.

## `goal-check` — feed `/goal` ground truth
```
moo-loop goal-check [<verify-profile>]
```
`/goal`'s native evaluator (Haiku) **doesn't run commands — it only judges visible
text**, and it isn't replaceable. So don't try to replace it: **feed** it. `goal-check`
runs the deterministic critic and prints one canonical line:
```
MOO-VERIFY: pass=true (all required checks green)
```
Then make the `/goal` condition reference it, e.g.:
> *"the most recent line starting `MOO-VERIFY:` says `pass=true`"*
The evaluator now judges machine-checked ground truth instead of the executor's prose.
(Caveat: a project with **no** configured checks verifies vacuously — `pass=true` — so
`goal-check` is only as strong as the checks `moo-verify` detects.)

## `gate` — per-subagent risk + budget for a fan-out
```
moo-loop gate --task "<subagent task>" --window <id> --max-cost $X [--tier T0|T1|T2|T3]
```
Native Dynamic Workflows fan out subagents with **no granular per-subagent budget or
risk gate**. Call `gate` before spawning each agent: a task **`moo-risk` flags as
destructive** is blocked (the gate's risk coverage is exactly `moo-risk`'s — no more),
and a per-window budget caps the cumulative paid spend (**budget-exhausted**).
Verdicts: `allow` (exit 0) · `risk-blocked` (3) · `budget-exhausted` (4).

**Caveat (concurrency):** the window cap is best-effort under a *concurrent* fan-out —
separate `gate` processes can read the same prior spend before either appends, and so
over-grant by up to one subagent each. It is exact under serial use; treat the cap as a
soft ceiling when many agents gate in parallel (a lockfile guard is a backlog item).

## Doctrine
- Zero paid LLM in the stop/risk/budget/poll path — pure Node + shell.
- No fabricated metrics: cost only via `pricing.js`; missing data is `null`/`—`.
- Hard caps stop the loop (enforcement, not warnings).
- State lives on disk: `MOO_LOOP.md` (versioned scratchpad, goal re-injected each
  tick) + `~/.mooter/loop-<id>.jsonl` (append-only audit).
