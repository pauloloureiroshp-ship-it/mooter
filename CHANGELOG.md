# Changelog

All notable changes to frugal are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions follow [Semantic Versioning](https://semver.org/).

---

## [0.5.0] — 2026-04-07

### Added

- **Auto-learning loop** — a daily backtest that analyses `decisions.log`, emits `router-tuning.json`, and idempotently patches `classify.js` with tuned regex patterns. The loop runs overnight via the Windows Task Scheduler entry `FrugalRouterBacktest` @ 02:00 and can also be triggered manually with the `/update-router` slash command.
- **`tools/router/backtest.js`** — pure-stdlib analyser (no deps). Detects `shortHighTier` (<50 chars on T2/T3), `lowConfHighTier` (confidence <0.6 on T2/T3), and `repeated` signatures. Emits top-3 demote candidates + promote-to-T0 candidates + `complexity_threshold`.
- **`tools/router/update-router.js`** — idempotent patcher. Creates `classify.js.bak`, injects/replaces a `TUNED-BLOCK-START`/`TUNED-BLOCK-END` block after `'use strict';`. Re-runs produce byte-identical output (locked by a test).
- **`tools/router/backtest.test.js`** — 11 tests using `node:test` (zero deps): signature() unicode + empty, analyze() tier counting + HIGH_RISK filtering + demote/promote surfacing + empty corpus, buildTuning() range + high-noise tightening, update-router idempotency, classify.js integration (pre-push stays T3).
- **`classify.js` TUNED wire-up** — three new runtime passes read the auto-generated `TUNED_*` constants:
  - `TUNED_DEMOTE_T3` forces T2/T3 → T1 when a pattern matches (guarded by `high === 0`)
  - `TUNED_PROMOTE_T0` forces any tier → T0 when a pattern matches (guarded by `high === 0`)
  - `TUNED_COMPLEXITY_THRESHOLD` scales ambiguous-branch cutoffs by `0.3 / threshold` clamped `[0.7, 1.5]`
- **Dual-enforced doctrine guardrail** — `HIGH_RISK_MARKERS` added to `backtest.js` to filter risky previews *upstream* before they can enter candidate sets. Mirrors `HIGH_RISK` in `classify.js` — prompts containing push/deploy/migration/.env/secret/architect/audit/merge/CI markers are skipped entirely by the analyser. Prevents the backtest from re-learning bad patterns every 24h.
- **`savings-tracker.js` pct_by_model** — `/metrics` now exposes `by_model` and `pct_by_model` alongside `by_tier`/`pct_by_tier`, with labels `Ollama`, `Haiku`, `Sonnet`, `Opus`.
- **`gsd-statusline.js` human-readable breakdown** — prefers `pct_by_model` from the tracker, falls back to the tier heuristic for older trackers. Statusline now shows `Ollama:62% Sonnet:18% Opus:20%` instead of `T0:62% T2:18% T3:20%`.
- **Professional repo restructure** — `ARCHITECTURE.md`, `REQUEST_ACCESS.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `SECURITY.md`, `NOTICE.md`, `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`. Full rewrite of `README.md` with audience segmentation, architecture diagram, and access flow.
- **`/update-router` slash command** documented in `~/.claude/CLAUDE.md` under a new `SLASH COMMANDS PESSOAIS` section.
- **`run-backtest.cmd`** — Windows wrapper for the scheduled task that redirects output to `backtest-latest.log`.

### Changed

- `gsd-statusline.js` — restored the tier breakdown segment (previously missing) and replaced `T0/T1/T2/T3` labels with `Ollama/Haiku/Sonnet/Opus`.
- `classify.js` post-decision passes now run in a strict order: low-confidence escalation → TUNED demote → TUNED promote → Haiku degradation → budget cap.

### Fixed

- Statusline breakdown no longer disappears on tracker restart (was silently dropped before this release).
- `backtest.js` no longer proposes `review final antes` as a demote candidate — dual-enforced guardrail catches it upstream.

### Commits

- `b432a6d` feat: human-readable model names + auto-learning backtest + /update-router command
- `6c1ce2f` feat(router): wire TUNED_DEMOTE_T3 into classify pipeline with high-risk guardrail
- `a66d948` feat(router): phase 1-5 — backtest hardening, promote wire-up, threshold scaling, tests, pct_by_model

---

## [0.4.0] — 2026-04-07

### Added
- **Statusline with live OAuth budget** — `statusline.sh` reads Anthropic OAuth usage every 2 hours:
  `◈ claude-sonnet-4-6 │ ctx:23% │ 5h:37% ↺2h14m │ 7d:12% │ $0.18 │ max:T3`
- **Budget guardrail** — dynamic tier cap based on 5h consumption: 0-50%→T3, 50-70%→T2, 70-85%→T1, >85%→T0
- **MD Enrichment** — classify.js reads `## Router Context` from project CLAUDE.md
- **SHA-256 cache** — identical prompts skip regex, TTL 30 minutes
- **9Router docs** — full multi-provider setup (Codex + Gemini Flash + Ollama)
- **CODEX_SETUP.md, GEMINI_SETUP.md, VSCODE_SETUP.md**
- **Rename: cloude-router → frugal** — install.sh detects and offers migration

### Fixed
- classify.js no longer misclassifies architecture prompts containing "commit" as T0

---

## [0.3.0] — 2026-04-06

### Added
- **replay.js** — replays decisions.log against current classifier
- **Validation on 1,370 real prompts**: T0: 83.9% | T2: 12.4% | T3: 3.6% | low-conf: 2.0% | **savings: 90.2%**
- **3 fast-path detectors** in classify.js v3 (commit→T0, architecture→T3, short→T0)
- **Ambiguous sub-categories** — weighted scoring for multi-tier matches
- **Low-confidence guardrail** — <0.60 confidence escalates one tier

### Changed
- classify.js v3 replaces v1 entirely
- decisions.log format extended with `confidence`, `sub_category`, `ambiguous`

---

## [0.2.0] — 2026-04-06

### Added
- **Mediator doctrine** (`~/.claude/CLAUDE.md`, 165 lines) — the core frugal philosophy
- **stats.js** — aggregate routing stats from decisions.log
- **benchmark.sh** — accuracy validation against labelled dataset
- **install.sh** first version with `--dry-run`, `--force`, `--uninstall`
- **Telemetry hook** — logs every routing decision to decisions.log
- **100% benchmark accuracy** on 200-prompt hand-labelled dataset
- **70% savings validated** on 200-prompt real-session replay

---

## [0.1.0] — 2026-04-06

### Added
- **classify.js** — heuristic regex classifier, <50ms, returns `{tier, confidence, reason}`
- **inject_context.js** — `UserPromptSubmit` hook, injects `router-hint` into metadata
- **6 subagents**: model-architect (Opus), model-reasoner (Sonnet), cheap-triage (Haiku), local-summarizer, local-transformer (Ollama), final-reviewer (Opus)
- **Documentation**: ROUTING_POLICY.md, HOW_IT_WORKS.md, VALIDATION_REPORT.md, MODEL_MAPPING.md, LIMITATIONS.md
- **v1 baseline**: T3 misroutes 31.0%, low-conf 27.1%, savings 27.5%
