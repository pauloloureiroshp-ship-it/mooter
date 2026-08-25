# PROPOSTA · CLAUDE.md v2026-07-12 — para aplicar na F3 (lote E′) ou F7 do Foundation Reset
# NÃO aplicar antes do snapshot F1. Base: working tree de 2026-07-12 (inclui o +3 do lote G).
# Delta vs atual: −duplicação de invariantes/testes (AGENTS.md já é importado) · +disciplina de sessão
# (worktree-por-sessão, build-from-main, boot SYNC) · allowlist wave 58 compactada · rito de release mantido.
# ─────────────────────────────────────────────────────────────────────────────

# Mooter — Project Instructions

**Mooter** is a local-first LLM router for Claude Code (mooter.ai, MIT). It classifies every
prompt deterministically in <50ms (regex, zero LLM cost) and routes it to the minimum viable
tier — local Ollama first, cloud only when it earns its cost. Mission:
**"Your LLM router. Local-first. Learns forever."**

> Paulo's personal routing doctrine lives in `~/.claude/CLAUDE.md` and still applies globally.
> Historical long version: `docs/foundation/CLAUDE_MD_ARCHIVE_2026-06-11.md`.

Tool-agnostic canon — architecture map, conventions, invariants, multi-agent communication
protocol, information architecture, test commands: see @AGENTS.md (auto-imported into every
session — do not duplicate its content here).

## Session discipline (the rules that keep truth knowable)

1. **Never work in the main tree.** Every session opens a fresh worktree from `origin/main`
   (`git fetch origin && git worktree add ../frugal-<task> origin/main -b <branch>`).
   The main tree is Paulo's staging ground, not a workspace.
2. **Boot ritual:** read `SYNC.md` (📥 section first) before any work. Confront real git state
   (branch, HEAD, dirty) before emitting or acting on any handoff.
3. **Build/package only from `main` or a tag** — never from a feature branch or dirty tree
   (prevents installed-vs-git drift; see the 0.16.65/0.16.66 incident, Notion 2026-07-12).
4. Uncommitted work is the only work that can be lost. Land it or hand it off — same day.

## Hard invariants (belt-and-braces; full list in AGENTS.md)

- **`tools/router/classify.js` is FROZEN** — never modify it. CI-enforced sha256:
  `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- **Selective git adds only** — never `git add -A`. Git writes (commit/push/merge/delete) are
  authorized by Paulo; agents prepare, Paulo pulls the trigger.
- Frozen engine packages (`packages/*`, waves 28-34.5): touch only files allowlisted by the
  **active wave brief** (allowlists live in the brief, not here; wave-58 router additions list
  archived in `docs/foundation/CLAUDE_MD_ARCHIVE_2026-06-11.md`).
- **PT-BR in conversation, English in code** and identifiers.

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
| Cross-agent operating checkpoint | `docs/ai/AI_SETUP_SUMMARY.md` |
| Routing policy detail | `~/.claude/docs/ROUTING_POLICY.md` |
| Doc types × home × lifecycle | `AGENTS.md § Information architecture` |
| Personal per-dev preferences | `CLAUDE.local.md` (gitignored; template at `CLAUDE.local.md.template`) |

## Tests

Commands per package: `AGENTS.md § Running tests`. Claude-specific gotcha: fresh worktrees need
`npm install` in **both** `packages/cli` and `packages/router` before the CLI suite runs.
Tests must never write inside the repo — temp fixtures go to `os.tmpdir()` (CI-checked after
Foundation Reset F4).

## After every release that touches `tools/router/` (keep `~/.claude/` in sync)

`/mooter-update` syncs files (router `*.js`, skills, agents), mirrors the wired
`~/.claude/hooks/` copies (`sync-hooks.js`), and self-checks the turn-end accumulator —
it never sets environment variables. (The hooks mirror exists because the Stop hook is wired at
`~/.claude/hooks/gsd-turn-end.js`; without the mirror it goes stale and silently drops the
Live Context Accumulator — 63 sessions, 0 journals, once.)

1. `git pull origin main` in `~/frugal`.
2. Run `/mooter-update` (idempotent — safe to run twice).
3. `Test-Path ~/.claude/tools/router/<new-file>.js` — new runtime files landed.
4. `node ~/.claude/tools/router/sync-hooks.js --check` → must print `OK self-check`.
5. Kill stale CC sessions: `Get-Process claude | Stop-Process -Force`; open a fresh terminal
   and confirm the statusline.

**Statusline depends on machine state `/mooter-update` cannot restore** — if it drops to
3 lines after a fresh profile/OS (see `~/.claude/PREFERENCES.md`):
expanded layout `[Environment]::SetEnvironmentVariable('MOOTER_MODE','1','User')` ·
GPU chip + dense line `~/.mooter/preferences.json` → `{"statusline_line3": true}`
(path is `~/.mooter/`, **not** `~/.claude/`).
