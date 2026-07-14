---
name: moo-verify
description: Deterministic, free, local verification gate for agentic loops. Runs project checks (tests, type-check, lint, build) and returns a single pass/fail signal WITHOUT calling any paid LLM. Use after an agent edits code, before declaring a task done, or as the stop-condition of any loop. Replaces the "LLM-as-judge" with a shell command — eliminating self-preferential bias and token cost.
---

# moo-verify — the free deterministic critic

## Why this exists
Anthropic named the core failure of agentic loops **self-preferential bias**: a model
prefers its own output when asked to judge it. The fix is doctrine, not magic — the
critic must be **external and machine-checkable**, not the model's opinion.

`moo-verify` is that critic, run **locally at $0**. It is the stop-condition for every
loop in Mooter and the Stop-hook gate. It never calls a paid model.

## Run it
```sh
node ~/.Codex/tools/router/moo-verify.js          # prints the JSON verdict, exit 0/2
node ~/.Codex/tools/router/moo-verify.js --gate   # Stop-hook mode (self-gating)
```

## Contract
- **stdout (JSON):** `{ pass, checks:[{name, kind, pass, signal}], blocking:[...] }`
- **exit code:** `0` if every **required** check passes (or none ran); `2` if any
  required check fails — so a `Stop` hook can keep the turn going until green.
- `pass` per check: `true` (passed) · `false` (failed) · `null` (skipped — tool absent,
  reported as `—`, **never a fabricated pass**) · signal `pending` (a later check not run
  because of fast-fail).

## How it decides what to run (auto, zero config)
Detects the stack from the working dir and runs only what exists:
- `package.json` → `tsc --noEmit` (if `tsconfig.json` + local `tsc`), `eslint`,
  `npm test` / `vitest run` / `jest`. The npm placeholder `"no test specified"` is
  treated as **absent**, not a failure.
- `pyproject.toml` / `requirements.txt` → `ruff check`, `mypy`, `pytest -q`
  (each only if importable).
- `Cargo.toml` → `cargo check`, `cargo test` (if `cargo` is on PATH).
Anything not present is skipped and reported as `—`.

## Required vs advisory — `mooter.verify.json` (optional)
```json
{
  "required": ["test", "typecheck"],
  "advisory": ["lint"],
  "checks":   { "build": "npm run -s build" }
}
```
- `required` checks block (exit 2 on fail). Default: `["test", "typecheck"]`.
- `advisory` checks report only. Default: `["lint"]`.
- `checks` adds custom `name → shell command` entries.

## As a Stop-hook gate (opt-in — default stays byte-identical)
The gate is **self-gating**: it is a no-op unless the project ships a `mooter.verify.json`
**or** `MOOTER_VERIFY_GATE=1` is set. It also fails **open** on any internal error, so it
can never wedge a session. Register it in `~/.Codex/settings.json`:

```jsonc
{
  "hooks": {
    "Stop": [
      { "matcher": "*", "hooks": [
        { "type": "command",
          "command": "node \"$HOME/.Codex/tools/router/moo-verify.js\" --gate" }
      ] }
    ]
  }
}
```
On a turn that ends with required checks failing, the gate prints the failing signal to
stderr and returns `2`, which keeps the agent working until `pass:true` — bounded by
Codex's native **8 consecutive Stop-block** safety cap. **$0 — no LLM judge.**

## Doctrine (non-negotiable)
- **Zero-LLM.** Only shell tools. No Anthropic/OpenAI call, ever.
- **No-proxy.** Reads the repo, runs checks, writes only `~/.mooter/verify-last.json`.
- **Honest signal.** Missing check = `—`, not pass. No fabricated metrics.
- **Fast-fail.** Stops at the first required failure; remaining checks reported `pending`.

## What it deliberately does NOT do
- It does not judge "code quality" subjectively (that is the model's drift trap).
- It does not auto-fix. It reports; the agent fixes, then re-runs.
- It does not spawn agents. It is a leaf primitive (used by `moo-loop`).
