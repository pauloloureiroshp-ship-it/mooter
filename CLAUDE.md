# Mooter — Project Instructions

**Mooter** (mooter.ai, MIT) exists so a vibe coder can operate like a master without studying
every day: it sets up, watches, and pilots a real multi-agent project from inside VS Code with
total visibility — alerting foundation gaps (skills, memory, loops, file structure), applying
vibe-coding best practices automatically, and making the magic visible (Live Preview).
Under the hood, the engine: a deterministic local-first router (<50ms, $0 to classify)
that orchestrates multiple LLM subscriptions (Anthropic, OpenAI, Google) plus the user's own
GPU (Ollama), routing every prompt to the minimum viable tier and learning forever from local
telemetry — never proxying prompts, never fabricating metrics. The moat is trust: an auditable
receipt and adversarial verification (critic ≠ author) on work a non-dev can check.
The engine is table stakes; the cockpit is where the proof shows. A change earns its place by
improving one of five experiences: **Resume · Plan · Route (invisible) · Watch · Review**.

> Paulo's personal routing doctrine lives in `~/.claude/CLAUDE.md` and still applies globally.
> The long version that used to live here is archived at
> `docs/foundation/CLAUDE_MD_ARCHIVE_2026-06-11.md`.

Tool-agnostic canon — architecture map, conventions, multi-agent communication
protocol, information architecture: see @AGENTS.md (auto-imported into every session).

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
- **PT-BR in conversation, English in code** and identifiers. (Canon PT-BR reconfirmado 2026-07-07.)
- **`owner_tz = America/Sao_Paulo` (UTC-3).** Paulo mora em São Paulo. Armazenamento sempre
  em UTC ISO-8601; **apresentação ao dono sempre convertida** para a hora dele e rotulada
  como tal. Nunca apresentar UTC cru, nunca assumir Europa/Lisboa. Registado também em
  `_handoff/maestro-state/CONFIG.json`. *(Custou uma "correcção" errada a dois ficheiros
  normativos em 2026-08-08: `2026-08-14T01:00Z` é quinta 13/08 às 22:00 na hora dele, que
  era exactamente o que o plano já dizia.)*

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
| Where each `.md` type lives + lifecycle (handoffs, specs, archive) | `AGENTS.md` § Information architecture |
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
5. Espelhar o cockpit e confirmar que e ELE que a maquina corre:
   `npm run sync:cockpit` (deve imprimir `OK self-check`). Ate 2026-08-18 o
   cockpit nao tinha canal de distribuicao nenhum: nada fora de
   `tools/cockpit/` o importava, o `/mooter-update` nao o sincronizava, e o
   LaunchAgent apontava direto para dentro do checkout. Um `AVISO` aqui quer
   dizer que o espelho esta em dia e a maquina corre outra copia — que e
   exactamente como o acumulador morreu 63 sessoes em silencio.
5. Kill stale CC sessions: `Get-Process claude | Stop-Process -Force`.
6. Open a **fresh** CC terminal and confirm the statusline.

**Statusline depends on machine state `/mooter-update` cannot restore** — if it
drops to 3 lines after a fresh profile/OS, re-apply (see `~/.claude/PREFERENCES.md`):

- expanded layout: `[Environment]::SetEnvironmentVariable('MOOTER_MODE','1','User')`
- GPU chip + dense line: `~/.mooter/preferences.json` → `{"statusline_line3": true}`
  (path is `~/.mooter/`, **not** `~/.claude/`).
