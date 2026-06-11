# CCA-F Audit — Setup & Validation (Wave 55, Phase C.1/C.2)

> The Wave 54 CCA-F harness shipped but had **never run** (Day-0 P3:
> `~/.mooter/cca-f/audit/` absent). This is how to set up and validate it.
> **NOT the official Anthropic Claude Certified Architect exam** — an internal,
> deterministic self-check.

## Corrections to the kickoff (Honest > Forced)

The kickoff's C.2 command `mooter cca-f audit --seed 42 --dry-run --questions 5`
uses flags that **do not exist**. The real interface is:

```
mooter cca-f audit [--seed N] [--count N] [--overnight] [--json]
```

- there is **no `--dry-run`** and **no `--questions`** — use `--count N`.
- output goes to **`~/.mooter/cca-f/audit/<session_id>/`**, NOT
  `~/.mooter/fable-observe/audit/` (`fable-observe` is the source folder; the
  config refutes the brief — see `packages/cli/src/fable-observe/config.ts`).

## Setup (worktree CLI)

The `mooter` on PATH is the PowerShell launcher; the worktree CLI is run via tsx
(ADR 016 — tsx-native, no build step):

```powershell
cd C:\Users\Paulo Loureiro\frugal-wave55\packages\cli
npm install            # first time only (js-yaml, p-limit, tsx, …)
# run any mooter command from source:
npx tsx src/index.ts cca-f audit --help
```

(Optionally `npm link` to expose a global `mooter` pointing at this worktree.)

## Validate the harness offline ($0, no Ollama/cloud) — the real "dry run"

The audit pipeline (route → resolve → judge → learn → report → publish) is fully
exercised with **injected stub transports** by its test suite. This is the honest,
free equivalent of a dry-run — it proves B→E wiring without spending any quota:

```powershell
cd packages\cli
npx tsx --test tests/cca-f-audit.test.ts
# → 25/25 pass (stubbed deps; runAuditPipeline({seed:42,count:5}) among them)
```

A **small live run** (5 questions on real Ollama + a Sonnet self-judge) is:

```powershell
npx tsx src/index.ts cca-f audit --seed 42 --count 5
```

This needs Ollama up and the `claude` CLI (Claude Max — no API key, no per-token
cost). It writes a real `~/.mooter/cca-f/audit/<session>/report.json`, after which
the opt-in `📜 cca-f` statusline chip shows a real number instead of `?`.

## The statusline chip

Once a report exists, enable the chip:

```jsonc
// ~/.mooter/preferences.json
{ "statusline_line3": true, "statusline_chips": { "cca_f": true } }
```

or `MOOTER_STATUSLINE_CCAF=1`. It reads the **newest** audit report; stale
(>30 days) / absent / malformed → honest `📜 cca-f ?`. Explain it with
`mooter explain cca-f`.
