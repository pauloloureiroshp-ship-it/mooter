# Mooter — Project Instructions

**Mooter** is a local-first LLM router for Claude Code (mooter.ai, MIT). It classifies every
prompt deterministically in <50ms (regex, zero LLM cost) and routes it to the minimum viable
tier — local Ollama first, cloud only when it earns its cost. Mission:
**"Your LLM router. Local-first. Learns forever."**

> Paulo's personal routing doctrine lives in `~/.claude/CLAUDE.md` and still applies globally.
> The long version that used to live here is archived at
> `docs/foundation/CLAUDE_MD_ARCHIVE_2026-06-11.md`.

## Hard invariants (CI-enforced where noted)

- **`tools/router/classify.js` is FROZEN** — never modify it. Its sha256 is CI-enforced:
  `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- **Frozen engine packages**: `packages/*` shipped in waves 28-34.5 stay untouched unless the
  current wave brief explicitly allowlists specific files.
  Wave 58 allowlisted **additions** to `packages/router/src/` (new files only — no existing
  engine file is modified): `specialization-matrix.ts`, `decide-agent.ts`, `task-categories.ts`,
  `adaptive-learner.ts`, `tes-calculator.ts`, `benchmark-fetcher.ts`, `fable-5-routing.ts`.
- **Selective git adds only** — never `git add -A`. Stage exactly the files you changed.
- **No new root `.md` files** without an explicit request.
- **PT-PT in conversation, English in code** and identifiers.

## Tier ladder (the truth, no embellishment)

| Tier | Routing | Notes |
|---|---|---|
| T0 | auto | local Ollama (free) |
| T1 | auto | Haiku |
| T2 | auto | Sonnet |
| T3 | auto | Opus — high-risk floors (deploy/secrets/migrations) force T3 |
| T5 | **opt-in only via `@fable`** | Fable — NEVER auto-routed; there is no T4 |

## Where things live (do not duplicate — point)

| Need | File |
|---|---|
| Strategy (single source of truth) | `docs/strategy/STRATEGY.md` |
| Infra, URLs, credentials, endpoints | `INFRA.md` |
| Current project state / next mission | `SYNC.md` |
| Routing policy detail | `~/.claude/docs/ROUTING_POLICY.md` |
| Cross-tool agent instructions | `AGENTS.md` |
| Personal per-dev preferences | `CLAUDE.local.md` (gitignored; template at `CLAUDE.local.md.template`) |

## Tests

- CLI: `cd packages/cli && npm test`
- Fresh worktrees need `npm install` in **both** `packages/cli` and `packages/router` first.
- Other packages: each is standalone — `cd packages/<name> && npm test`.

## After every release (keep `~/.claude/` in sync)

`/mooter-update` syncs **files** (router `*.js`, skills, agents) **and mirrors the
wired `~/.claude/hooks/` copies** (`sync-hooks.js`), then **self-checks the turn-end
accumulator** — it never sets environment variables, and runtime mirrors live
outside the repo. (The hooks mirror exists because `settings.json` wires the Stop
hook at `~/.claude/hooks/gsd-turn-end.js`; the plain router glob only refreshes
`~/.claude/tools/router/`, so the wired Stop hook used to go stale and silently
drop the Live Context Accumulator — 63 sessions, 0 journals.) After any release
that touches `tools/router/`:

1. `git pull origin main` in `~/frugal`.
2. In Claude Code, run `/mooter-update` (idempotent — safe to run twice).
3. Verify the new runtime files landed:
   `Test-Path ~/.claude/tools/router/<new-file>.js`
4. Confirm the wired accumulator is intact:
   `node ~/.claude/tools/router/sync-hooks.js --check` (must print `OK self-check`).
5. Kill stale CC sessions: `Get-Process claude | Stop-Process -Force`.
6. Open a **fresh** CC terminal and confirm the statusline.

**Statusline depends on machine state `/mooter-update` cannot restore** — if it
drops to 3 lines after a fresh profile/OS, re-apply (see `~/.claude/PREFERENCES.md`):

- expanded layout: `[Environment]::SetEnvironmentVariable('MOOTER_MODE','1','User')`
- GPU chip + dense line: `~/.mooter/preferences.json` → `{"statusline_line3": true}`
  (path is `~/.mooter/`, **not** `~/.claude/`).
