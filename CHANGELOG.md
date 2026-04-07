# Changelog

All notable changes to frugal are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions follow [Semantic Versioning](https://semver.org/).

---

## [0.6.0] — 2026-04-07

### The "honest numbers" release

A deep audit of `savings-tracker.js` turned up 13 gaps between what frugal claimed to measure and what it actually measured. The flat-per-tier cost model was ~25-60× under real Anthropic prices, system prompts were inflating Ollama %, and Option-A hits (the only *real* Opus skips) were indistinguishable from tier-routing estimates. v0.6 rewrites the tracker around a single-source pricing module, separates guaranteed savings from advisory estimates, and adds dual-currency support (USD + BRL / EUR / GBP).

### Added

- **`tools/router/pricing.js`** — authoritative model pricing table (`{input, output}` $/MTok) for every Claude model (Opus 4.6, Opus 4.6 [1M ctx], Sonnet 4.6, Haiku 4.5), Ollama variants, Gemini 2.5 Flash/Pro, GPT-4o/4o-mini. Exports `priceTurn(model, in, out)`, `estimateTurnCost(tier, prompt_len)`, and `naiveOpusCost(prompt_len)` as the single source of truth consumed by `savings-tracker.js` and (next release) `stats.js`. Includes a `SESSION_CONTEXT_BASE_TOKENS` constant (default 8000) so cost estimates include the system prompt + tools schema weight, not just the user's typed prompt.
- **`tools/router/fx.js`** — USD→BRL/EUR/GBP foreign exchange cache. Fetches `exchangerate.host` once per 24h via a 2.5s-timeout subprocess, caches in `.fx-cache.json`, falls back to a hard-coded rate on network failure. Never throws, never blocks the hook.
- **`/real` endpoint** on the savings tracker — surfaces the OAuth 5h usage reading from `.budget-cache.json` with explicit error flags. When the bearer token is stale, returns `{ok: false, reason: "oauth_error", hint: "Run claude auth login to refresh the bearer token."}` instead of silently showing zeros.
- **`guaranteed_saved` metric** — sum of `option_a_hits × avg_naive_opus_turn`. These are the only prompts where Opus was *actually* skipped (Ollama's answer was emitted verbatim by the session). Labelled as such in `/metrics`, `/summary`, and the statusline. When non-zero, the statusline drops the tilde prefix to mark the number as cash-accurate rather than estimated.
- **`advisory_saved` metric** — explicit alias for the old tier-routing estimate, kept for backwards compatibility but labelled clearly as an approximation in `/summary`. The statusline prefixes it with `~` when displayed.
- **`system_prompts_filtered` counter** — tracks how many entries in `decisions.log` were filtered as hook echoes (`<task-notification>`, `<system-reminder>`, `<command-name>`). These were previously counted as real user prompts, inflating Ollama percentages.
- **Dual currency support** — set `FRUGAL_CURRENCY=BRL` in your shell, and `/metrics` gains an `in_brl` block with `{real_cost, naive_cost, saved, guaranteed_saved, symbol: "R$"}`. The statusline shows the target currency in the primary position with USD in parentheses: `R$18.11 ($3.34)`.
- **6 new tests** in `backtest.test.js` — pricing math round-trips (Opus/Haiku ratio sanity check), Ollama free + unknown model fallback, `estimateTurnCost` monotonic in prompt length, `isSystemPrompt` filter coverage, `computeMetrics` excludes system prompts correctly, `saved_pct` stays in 0-100 range on realistic corpora. Total suite: **17 tests, 0 failures**, ~193ms.
- **`docs/COST_MODEL.md`** — deep-dive methodology doc explaining what v0.6 measures (`real_cost_estimated`, `naive_cost`, `advisory_saved`, `guaranteed_saved`), what it still *doesn't* measure (sub-agent double-dipping, real OAuth per-window reconciliation, actual invocation telemetry), and how to verify the numbers on your own corpus.

### Changed

- **`savings-tracker.js`** — complete rewrite around `pricing.js`. Cost model is now token-based (`input_tokens × input_price + output_tokens × output_price`), anchored to `SESSION_CONTEXT_BASE_TOKENS + prompt_len/3.5` for input estimation and `AVG_OUTPUT_TOK[tier]` for output. Added `require.main === module` guard so the HTTP server only starts when run as a script, not when required from tests — fixes EADDRINUSE-driven test suite crashes. `/metrics` response is a backwards-compatible superset (all v0.5 fields retained, v0.6 fields added).
- **`inject_context.js`** — OAuth fetcher now checks `data.type === 'error'` before writing `.budget-cache.json`. An auth-error response is cached with `error: true` flag so `/real` can surface it, but `fetchBudgetSync()` returns `null` (not the error object) so the budget guardrail doesn't poison itself. Root cause of the `{"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"}}` state we observed in production — once cached, the guardrail never retried because the TTL was still valid.
- **`gsd-statusline.js`** — picks the best available savings number (`guaranteed_saved` → `advisory_saved`), displays it in the user's preferred currency with USD in parens, and prefixes advisory numbers with `~` so they are never mistaken for OAuth-real figures. Still shows the `Ollama:X% Sonnet:Y% Opus:Z%` breakdown, now computed over user prompts only (system prompts filtered).

### Fixed

- **Gap #1** — flat-per-tier cost was ~25-60× under real Anthropic pricing. On the dogfood 68-line corpus: `real_cost` went from $0.575 → $2.9387, `naive_cost` from $2.52 → $13.876. Both numbers are now the right order of magnitude.
- **Gap #7** — Option-A hits (13 on the dogfood corpus) were previously invisible in cost accounting. They now produce a distinct `guaranteed_saved = $3.34` line item, the only cash-accurate savings number frugal reports.
- **Gap #8** — BRL (and EUR, GBP) support finally exists. Set `FRUGAL_CURRENCY=BRL` and the statusline shows `R$18.11 ($3.34)` instead of USD-only.
- **Gap #10** — `<task-notification>` and other Claude Code hook echoes were counted as user prompts. The `isSystemPrompt` filter now skips them (3 filtered on the dogfood corpus, shifted Ollama from 62.5% → 66.7% and reduced Opus noise by ~1pp).
- **Gap #13 (new, discovered during audit)** — `.budget-cache.json` was caching `{"type":"error","error":{"type":"authentication_error"}}` responses and honoring the TTL, silently blinding the budget guardrail until a manual cache delete. Now caches the error for observability but doesn't let it poison the guardrail path. The `/real` endpoint points the user at `claude auth login` when detected.

### Known gaps (deferred to v0.7)

- **Sub-agent double-dipping telemetry** — when Opus spawns `model-reasoner` or `local-summarizer`, the Opus session still pays tokens for the round-trip. Requires a `PostToolUse` hook that reads `usage.input_tokens`/`usage.output_tokens` from each model response.
- **Real OAuth per-window reconciliation** — cross-reference `/api/oauth/usage` readings against `decisions.log` windows to derive ground-truth per-prompt cost. Blocked on a healthy OAuth token and a `SessionEnd` hook.
- **Non-Anthropic invocation coverage** — `pricing.js` has Gemini + GPT entries but the classifier never emits those models today. Will matter when multi-provider routing lands.

See `docs/COST_MODEL.md` and `AUDIT.md` for the full methodology and the complete gap list.

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
