# Wave 16–18 Day 2 — Tier C (Hub + Pastor) — Findings

> Branch `wave16-18-day2-tier-c-hub-pastor` → dev. Tag `v1.9.6-hub-pastor-dev`
> (suggest `…-pastor-dev` — **hub deferred**, see below). Edits in canonical
> `frugal/tools/router/`. **`classify.js` byte-identical** (sha256 `7b01eb86…87762`,
> guarded). 0 new test failures. **No prod promote.**

## TL;DR

| Item | Status |
|---|---|
| **Pastor learning loop** | ✅ **WOKEN** — runner + env-overrides + integration test; classify.js untouched |
| **B1 quota est. marker** | ✅ `42% 5h` → `42% 5h est` |
| **Hub schema hardening (D1)** | ⛔ **DEFERRED** — cannot be done zero-downtime (technical reason below) |

---

## Pastor learning loop — woken (the big one) ✅

**Before**: the pipeline existed (`backtest.js` → `router-tuning.json` →
`update-router.js` → `tuning-state.json`; classify.js loads it) but **nothing ran
it** → `tuning-state.json` never existed → classify.js always used the committed
`tuning-state.defaults.json` (QA baseline). The loop was asleep for lack of a trigger.

**Delivered**:
- **`tools/router/pastor-tune.js`** — a runner that chains backtest → update-router with guards (`MOOTER_TUNE_MIN_DECISIONS`, `--dry-run`). This is the trigger that wakes the loop. Verified working: on a fixture it emits a valid `tuning-state.json` (`{complexity_threshold, promote_t0, demote_t3, sample_size}`).
- **`MOOTER_ROUTER_DIR` override** added to `backtest.js` + `update-router.js` (default unchanged) — lets the runner/tests operate in a temp dir without touching `~/.claude`. Safe, additive.
- **`tools/router/pastor-loop.test.js`** — integration test (3 cases): (1) the chain runs end-to-end and emits a `tuning-state.json` whose shape matches the `classify.js _loadTuningState` contract (and every emitted pattern compiles as a regex); (2) the `MIN_DECISIONS` guard skips and writes nothing below threshold; (3) a guard that `update-router` never writes `classify.js`. **classify.js consumption is already covered by `classify.test.js`** (it loads `tuning-state.defaults.json`).
- **`classify.js` byte-identical** — the learning lives entirely in the runtime `tuning-state.json`; classify.js only *reads* it.

**Activation / scheduling (Paulo / per-machine)**: the schedule is **local** by
design — the committed `tuning-state.defaults.json` is the QA baseline and is
**intentionally never written by the pipeline**, so a CI cron that commits tuning
would change that design. Wake it per-machine (documented in `pastor-tune.js`):
- on demand: `node tools/router/pastor-tune.js`
- daily cron: `0 4 * * * node ~/.claude/tools/router/pastor-tune.js`
- Windows Task Scheduler: daily `node %USERPROFILE%\.claude\tools\router\pastor-tune.js`

**Decision for Paulo**: (a) ship `pastor-tune.js` + activate it locally (per-user
learning — recommended), or (b) **also** build community-aggregate tuning (a CI/hub
job that tunes on aggregated `frugal_events` and ships improved *defaults*) — that's
a larger, separate effort that revisits the "defaults never edited by pipeline"
design. (a) is done and safe; (b) is a Wave 17 design decision.

## B1 — quota chip est. marker ✅
`${anthRem}% 5h` → `${anthRem}% 5h est` (line ~361) — signals it's a **local**
estimate (computeAnthropicRem from quota-state.json, 0 network calls), not
Anthropic's authoritative quota. Test updated. Renders: `… · 42% 5h est · …`.

---

## Hub schema hardening (D1) — ⛔ DEFERRED (cannot be zero-downtime)

The Wave 17 finding (FK constraints, ALTER idempotency, RLS) **cannot be applied to
the live D1 safely**, and the non-negotiable is **zero-downtime**:

1. **FK on existing tables needs table recreation.** SQLite/D1 cannot `ALTER TABLE
   ADD CONSTRAINT` — adding a FK to `frugal_events`/`shadow_pairs` etc. requires
   create-new → copy → drop → rename. On a live table with real rows that is a
   **data-migration with downtime/risk** — the opposite of the non-negotiable.
2. **`PRAGMA foreign_keys = ON` would break writes.** The current data has *implied*
   orphans (no FK was ever enforced). Turning enforcement on could **reject inserts**
   that reference missing parents → live ingestion breakage.
3. **RLS is N/A for D1** (Cloudflare D1 has no row-level-security concept; that
   finding only applies if/when a table moves to Supabase — a separate task).

**Safe path (recommend Wave 17, careful, gated)**: a dedicated recreation migration
per table, run off-peak with a backfill + verification, FK enforcement enabled only
after orphan cleanup. ALTER idempotency is a **convention for future migrations**
(check-before-ALTER or a tracked migrations table), not a retro-fix of applied ones.

**So Tier C ships the Pastor wake + B1; the hub hardening is flagged as a separate
zero-downtime migration effort, not forced here.** (Hence the suggested tag rename.)

---

## Gates
- `classify.js` byte-identical (guarded after every edit; not in diff).
- New/changed router files' tests pass: pastor-loop 3/3, statusline-multi/two-line 49/49.
- **0 new failures** vs baseline (verified by stash-compare): the 8 suite failures are pre-existing — model-default drift (`gemini`/`qwen2.5-coder`/`deepseek-r1`/`gemma4` version names), `update-router` needing `~/.claude/router-tuning.json`, and flaky gsd-statusline **latency** timing tests. None touch B1/pastor/env-override.
- Canonical-only edits (`frugal/tools/router/`); no hub/CLI/landing/schema changes (hub deferred).
- No prod promote.
