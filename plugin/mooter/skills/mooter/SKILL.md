---
name: mooter
description: Mooter router shortcuts — route a prompt, show the routing digest, explain a chip/topic, list local models, check the sandbox tier ladder. Use when the user types /mooter <sub-command> (route · digest · explain · local · why-not-fable · tier · mcp · vision · bench).
---

# /mooter <sub-command>

Map the sub-argument to the real Mooter CLI and run it. Show the command's
output verbatim — never paraphrase or invent the numbers.

## Sub-command → command

| Sub-command | Run |
|---|---|
| `/mooter route <prompt>` | `node ~/.claude/tools/router/classify.js "<prompt>"` (inside the Mooter repo use `node tools/router/classify.js "<prompt>"`). For a natural-language dispatch use `mooter intent "<prompt>"` instead. |
| `/mooter savings` | `mooter digest` — and see the caveat below: the digest reports tasks and tiers, not a savings figure |
| `/mooter explain <topic>` | `mooter explain <topic>` (e.g. `tiers`, `saved`, `confidence`, `vision`) |
| `/mooter digest` | `mooter digest` |
| `/mooter local` | `mooter local-models` |
| `/mooter why-not-fable` | `mooter why-not-fable` |
| `/mooter tier` | `mooter status` |
| `/mooter mcp` | `mooter mcp status` |
| `/mooter vision` | `mooter explain vision` |
| `/mooter bench` | `cd packages/mooter-bench && npm run bench` |

With no sub-command, run `mooter status --didactic`.

## Honest caveats

- `/mooter bench` ONLY works inside the Mooter repo checkout — the
  `mooter-bench` package is not installed globally. Outside the repo, say so
  instead of running it.
- The tier ladder is T0–T3 auto-routed plus T5 (Fable 5) strictly opt-in via
  an explicit `@fable` pin. There is no T4 — don't present one.
- **Never state a savings number, percentage or dollar amount.** Mooter does
  not publish one without tokens measured on BOTH sides (≥20 paired tasks).
  Measured 2026-09-10: 0 of 156 ledger events carry structured token fields.
  If asked "how much did I save?", answer: *we don't publish a savings number
  without tokens measured on both sides — here are tasks routed, local
  coverage and window preserved*. Decision: `docs/adr/ADR-onboarding-v2.md`.
- **Never say "0 bytes left the machine."** Say "no cloud call was dispatched
  by Mooter" — that is what the ledger can actually prove.
- **Never show a quota bar without the word "estimated".** Quota is counted by
  Mooter's own window arithmetic, not read from the provider.
