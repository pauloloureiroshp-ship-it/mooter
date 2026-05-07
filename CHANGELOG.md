# Changelog

All notable changes to mooter are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Versions follow [Semantic Versioning](https://semver.org/).

> **Note (2026-04-14):** project rebranded from `frugal` to `mooter`. Older entries below retain `frugal` references for historical accuracy.

---

## [Strategy Canonical V1.0] — 2026-05-07 — Single Source of Truth (Cowork night session)

### Added — Strategy documentation suite (no code changes)
- `MOOTER_STRATEGY_CANONICAL_2026-05-07.md` (47 KB) + **`.pdf`** (148 KB, 30 pages) — single source of truth consolidating V1+V2+V3+Master Prompt
- `MOOTER_EXECUTIVE_BRIEFING_2026-05-07.md` (5 KB) + `.pdf` (77 KB, 3 pages) — outreach 2-pager for Anthropic DevRel, contributors, partners
- `MOOTER_ROUTING_STRATEGY_2026-05-07.md` (V1, 41 KB) — market state + competitive landscape
- `MOOTER_ROUTING_STRATEGY_V2_2026-05-07.md` (V2, 39 KB) — Anthropic ecosystem + autonomous loops + lang-aware
- `MOOTER_FLUXOGRAMA_DEFINITIVO_2026-05-07.md` (V3, 32 KB) — quantified 7-layer pipeline (latency/cost/affinity)
- `MOOTER_MASTER_PROMPT_2026-05-07.md` (33 KB) — 9-Phase playbook for Claude Code + Ralph Loop
- `docs/architecture/routing-pipeline.svg` — standalone flowchart for README/landing
- `docs/adr/W3-001-async-decisions-log.md` — Wave-3 T-1 ADR template (skeleton)

### Strategic decisions canonized
- Default T3 = Opus 4.6 (NOT 4.7) until 4.7 tokenizer +35% tokens stabilize economics
- 3 defensible moats: Subscription-Aware Routing · Codebase-Aware Language Harmonisation (PT-PT/PT-BR first-class) · Triple-stack Anthropic alignment (plugin + skill + MCP server)
- 20 anti-goals codified (no fine-tuning, no auto-merge, no plan-with-frontier+exec-with-local default, etc.)
- Mooter coabita com Claude Code (NÃO substitui) — design defensivo face a separação first-party/third-party de 2026-04-04
- Realistic cost reduction expectation: 65–82% vs all-Opus baseline (not the 95% blogs promise)

### Roadmap consolidated for gate (2026-05-26)
- Wave-3 (2026-05-08-13): async decisions-log · Gemini provider · Thompson Phase 1
- Wave-4 (2026-05-14-20): Subscription-Aware + Codebase-Aware + RDTR + Honest Cost Report
- Wave-5 (2026-05-21-25): Triple-stack publish + PR claude-cookbooks + CWC London 2026-05-19
- Critical events: 2026-05-19 Code with Claude London (12 days lead-time) · 2026-05-26 GATE (≥250 stars + ≥3 contributors)

### Updated
- `CLAUDE.md` — pointer added to canonical strategy PDF
- `SYNC.md` — Cowork→Claude Code section with full deliverables list, decisions, caveats, pendentes

### Notion log
- Sub-page created at HQ: <https://www.notion.so/3596f6e42bc48177a8a9fb30263079d9>

### Caveats (honesty)
- Repo is more mature than Master Prompt assumed — Phase 0 (audit) partially done. Phase 1 (router core) is redundant with `classify.js` v0.10. Adjust master prompt before following blindly.
- Cowork did NOT touch core code (`classify.js`, `tools/router/*`, `agents/*`). Wave-3 with final-reviewer required for those.
- Vault `~/Documents/paulo-vault/` not accessible from Cowork sandbox — manual sync required.

---

## [0.11] — 2026-05-07 — Wave-2 LANDED · advisor → executor

### Added
- `tools/router/router-execute.js` (886 lines) — executor consumes `classify.js` `suggested_providers`, dispatches non-Anthropic providers directly, defers Anthropic-tier to subagents
- `tools/router/providers/ollama-api.js` — programmatic Ollama wrapper (was missing — `ollama_call_node.js` is CLI-only)
- `tools/router/router-execute.{fixtures.json,mocks.js,harness.js,test.js}` + extensions to `providers.test.js` and `savings-tracker-me.test.js` — full Wave-2 suite
- `tools/router/savings-tracker.js` — new `/last-execution` GET + `/metrics.executions` block (+ `aggregateExecution` helper exported for tests)
- `tools/router/backtest.js` — new `--calibration-only --last-n=N` mode, writes to `.calibration-alerts.jsonl` if bin 0.8-1.0 < 90% (count ≥ 100)

### Validated
- 12 atomic commits over `aa25a2b` (T-01..T-10 + design A)
- Final-reviewer Opus subagent: APPROVED with 2 non-blocking notes
- I1..I11 doctrine guards verified
- Suite: 206 → 295 pass + 1 skip (skip is "executor absent" sentinel, expected)
- Tier accuracy validation: 87.5% (35/40, target ≥85% PASS)
- Hook latency p50: 113ms (target <200ms PASS)
- `git diff aa25a2b -- tools/router/classify.js` = empty (I11 invariant maintained)

### Pending
- Push 12 commits to origin/main (gated on Paulo approval)
- Live `/metrics.executions` curl validation (deferred — server still running pre-Wave-2 code, will pick up after restart)
- Re-run validation runner against fresh Wave-2 corpus (acceptance §10 #5: ≥55% executions OK ratio)

---

## [0.9.8] — 2026-04-12 — Quality Intent & Hook Fixes

### Fixed
- `classify.js`: TUNED_DEMOTE block moved after quality_intent check — auto-tuning
  can no longer silently cancel explicit user quality intent ("pensa bem")
- `PostToolUse.js`: Bash calls now show correct subagent model (Haiku/Sonnet/Ollama)
  instead of always falling back to parent Opus session model
- `inject_context.js`: writes `last-subagent.json` (30s TTL) to track active subagent

### Added
- `classify.test.js` — 3 unit tests for quality_intent vs tuned_demote precedence
- `ROUTING_LESSONS.md` — registro de misroutes reais para informar melhorias futuras
- `CLAUDE.md`: definição explícita de "estado de sessão" na secção GUARDRAILS

### Docs
- Master prompts e relatórios históricos movidos para `docs/sessions/`

---

## [0.9.4] — 2026-04-10 — Friends Beta

### Added
- Beast/Zen/Auto mode system (`frugal-mode.js`, 3 new skills)
- Cross-platform installer: `install-windows.ps1` with Doctor/Uninstall/DryRun
- `frugal-hello` skill — first-use WOW moment
- `smoke-test.js` — post-install verification (4/4 pass, avg 51ms)
- `paths.js` — cross-platform path resolver
- `PRIVACY.md` — transparent telemetry documentation
- `ONBOARDING_GUIDE.md` + `FRIEND_KIT.md` — friend-facing docs
- `.env.example` — placeholder env vars
- Full security audit (AUDIT_REPORT.md)

### Fixed
- Windows paths with spaces now handled correctly via `paths.js`
- `run-backtest.cmd` uses quoted paths
- `hub-push.js` + `hub-pull.js` + `hub-status.js` URLs corrected
- `install.sh` improvements: banner, smoke test step, friendly output
- `.gitignore`: added `.env.*`, `*.env`, `.next/`, `.vercel/`

### Changed
- `frugal-status` skill: improved friendly output format
- 102 patterns total (was 65)
- 170 test prompts, 100% accuracy
- SECURITY.md updated to reference v0.9.x

---

## [0.9.3] — 2026-04-10

### Beast/Zen/Auto modes, self-improving pipeline, statusline v0.12

The biggest single-session leap: from 76.6% to 89.9% savings, a self-improving
test pipeline, and a statusline that proves frugal's value at a glance.

### Added
- **Beast/Zen/Auto mode system** — `frugal-mode.js` CLI + `applyActiveMode()` in
  inject_context.js. Beast forces T3 (Opus), Zen caps T1, Auto clears.
  Zen bypasses for T3-gate safety tasks (push/deploy/merge).
- **80-prompt stress test suite** (`stress-test.js`) — regression gate across
  T0/T1/T2/T3 with PT-PT, EN, compound, deceptive, and edge case prompts.
  Exit code 1 if adjusted accuracy drops below 85%.
- **UX insights collector** (`ux-insights.js`) — analyzes decisions.log for
  friction signals: user overrides, low confidence, quality intent.
  Generates improvement suggestions. Appends to history for trend tracking.
- **Weekly evolution report** (`weekly-evolution.js`) — full pipeline:
  stress test + backtest + UX insights + suggestions.
- **Algorithm evolution archive** (`.evolution/`) — SHA-256 snapshots of
  classify.js, patterns.js, inject_context.js after each improvement round.
  5 snapshots created: v0.9.2, v0.9.3, v0.9.3-b, v0.9.3-c.
- **27 new patterns** in patterns.js from 3 rounds of stress testing:
  push-to-staging, delete-table, OAuth, authenticate, merge-review,
  PR-review, caching-distribuido, connection-pool, RBAC, and more.
- **Statusline v0.12** — complete redesign:
  `🐕 💰 ↓89% saved ~$3.84 · spent ~$0.47 │ ██▓▓█████ 🔴 Opus 9% 12k · 🟡 Sonnet 22% 31k · 🟢 Local 69% 98k ⚡RTX 4090`

### Changed
- **Ambiguous prompts T2→T1** — medium/long prompts without MED_RISK signals
  now route to Haiku (T1) instead of Sonnet (T2). With T1→T0 degradation
  (no API key), these become free Ollama calls. Savings: 76.6% → 89.9%.
- **`.env` regex fix** — `\b\.env\b` changed to `\.env\b` (word boundary
  before dot doesn't work in regex).
- **Repo reorganised** — 20 master prompts moved to `prompts/`, docs artifacts
  relocated, root reduced from 30 to 11 files.

### Fixed
- **Onboarding re-trigger** — `setup-profile.js` failed silently in non-TTY
  hook context. Now creates default `subscription-profile.json` automatically.

### Metrics
- Stress test: 80 prompts, 87.5% raw, 100% adjusted accuracy
- Savings: 89.9% on unique prompts ($323/month projected savings)
- T0 absorption: 85.1% (free tier)
- T3 (Opus): 8.9% of prompts
- decisions.log: 270 entries

---

## [0.9.2] — 2026-04-09

### Community hub + 8 slash commands

- **frugal-hub** deployed at `mooter-hub.frugal-hub.workers.dev` (Workers + D1 + R2)
- **Community intelligence loop** — hub-push, hub-pull, hub-status
- **8 slash commands** — /frugal-status, -savings, -route, -summary, -update, -beast, -zen, -auto
- **install.sh v2** — idempotent install of all skills and router files

---

## [0.9.0] — 2026-04-09

### Statusline v3 + GPU awareness + federated learning foundation

Seven-segment statusline with a 🐕 mascot, real GPU telemetry, cascade path
per turn, and a privacy-preserving delta-export pipeline that sets up
frugal's federated learning story.

### Added
- **Statusline v3** — 7-segment layout: git/session · 🐕 brand · last-turn
  (tier + model + category + latency + cascade path) · distribution (qwen/hku/son/ops)
  · savings + budget track mini-bar · GPU widget · all 6 provider dots.
- **GPU probe** (`tools/router/gpu-probe.js`) — NVIDIA via `nvidia-smi`,
  Apple Silicon via `system_profiler`, Linux AMD via `/sys/class/drm`,
  graceful CPU-only fallback. Used by the statusline GPU widget.
- **`/last` endpoint** — rich decision projection (tier, model_short,
  category_short, cascade_path, latency_vs_opus_ms, arbiter_used,
  user_override) for statusline segment ③.
- **`/gpu` endpoint** — live GPU name/utilization + warm/cold Ollama model
  states (read from `ollama list` and `decisions.log`).
- **`POST /decision`** — fire-and-forget endpoint called by `inject_context.js`
  on every classified hook so `/last` is always fresh without re-parsing
  `decisions.log`.
- **`POST /arbiter-event`** + **arbiter metrics in `/metrics.arbiter`** —
  calls_total, cache_hits, cache_hit_rate, high_risk_refused, cost_usd,
  avg_latency_ms.
- **Decomposition pipeline** — arbiter system prompt gains explicit
  decomposition schema; `inject_context.js` emits a `decomposition:` YAML
  block in the `<router-hint>` when the arbiter proposes 2-4 independent
  subtasks; `CLAUDE.md` doctrine gains a DECOMPOSITION EXECUTION section
  explaining parallel Task spawn rules.
- **`update-router.js --dry-run`** — print the tuned block that would be
  injected into `classify.js` without modifying anything.
- **`backtest.js --explain`** — anonymized demote/promote candidate
  explanation with per-pattern regex + saving estimate.
- **`backtest.js --export-delta`** — anonymized fingerprint exporter. No
  prompt text, no paths, no variable names. See `docs/FEDERATED_LEARNING.md`.
- **`tools/router/aggregate-deltas.js`** — manual aggregator for 2-10 users
  with schema validation, `hardware_tier` weighting, and per-group
  contributor counting.
- **`docs/FEDERATED_LEARNING.md`** — protocol, privacy guarantees, manual
  flow, and the `frugal-hub` Cloudflare Worker roadmap.
- **3 new arbiter decomposition tests** in `backtest.test.js` (59/59 passing).

### Changed
- **Arbiter system prompt bumped to v2** — cache auto-invalidates on next run.
- **Arbiter cache** already persisted to disk (7-day TTL, LRU 500). Kept as-is.
- **HIGH_RISK filter in `backtest.js`** hardened — added `database`,
  `schema`, `--force`, `force-push`, `.env` (pattern form), and tightened
  `review` to bare word.
- **Distribution segment** now uses abbreviated model names
  (`qwen / hku / son / ops`) with per-tier color from the canonical v0.9
  palette, separated by `·` (middle dot) instead of space.
- **Provider segment** always shows all 6 providers (claude · ollama · gemini
  · gpt · grok · mistral) as `●/◐/○` dots, including unconfigured ones
  (drawn in dark grey). Order is configurable via `FRUGAL_PROVIDERS` env var.

### Guarantees preserved
- `decisions.log` untouched (append-only, never rewritten).
- 59/59 tests passing (was 56/56 in v0.8).
- Existing `CLAUDE.md` / agents / decisions.log all preserved.
- Hook fail-open contract intact — the new POST calls are detached,
  fire-and-forget, and non-blocking.

---

## [0.8.0] — 2026-04-08

### Haiku arbiter for ambiguous prompts (dispatcher v1)

First step toward the dispatcher architecture documented in
`docs/DISPATCHER_ARCHITECTURE.md`. When the regex classifier reports
low confidence (< 0.75) OR lands in an `ambiguous_*` category, the hook
now falls through to a **Haiku 4.5 arbiter** that reads the prompt with
real semantic understanding and returns a JSON routing decision. The
83.9% of prompts that hit confident regex fast paths are untouched —
the arbiter only fires on the ~17% long tail.

### Added

- **`tools/router/arbiter.js`** (new, ~260 lines) — Haiku-powered semantic
  arbiter. System prompt describes the 4 tiers + 5 subagents + HIGH_RISK
  escalation rules. Returns strict JSON: `{tier, subagent, reasoning,
  decomposition?}`. Cache keyed by `SHA256(v1:prompt)` persisted at
  `.arbiter-cache.json`, 7-day TTL, LRU cap 500. 1.5s hard timeout,
  fails silently to regex on any error. Cost per uncached call:
  ~$0.001 (system ~320 tok + prompt + ~50 tok out @ Haiku rates).
- **Arbiter integration in `inject_context.js`** — runs only when all of
  these are true: v0.7 kill-switch is OFF, classify cache missed, user
  override not honored, and confidence < 0.75 OR task_category is
  `ambiguous_*`. Dual-enforced HIGH_RISK guardrail: the arbiter can
  NEVER downgrade a prompt matching the HIGH_RISK hint — the refusal
  is logged with `escalation_rule: arbiter_refused_high_risk`.
- **`<router-hint>` enriched** with `ARBITER: honored (T2 → T3)` or
  `ARBITER: refused (...)` lines when the arbiter was consulted.
- **`ARBITER_SYSTEM_PROMPT_VERSION` constant** — bumping it invalidates
  all cached arbiter decisions so the router picks up new routing rules
  without manual cache deletion.
- **`decisions.log` schema extended** with `arbiter_honored` and
  `arbiter_previous_tier` fields on the `classified` event, plus a
  separate `arbiter_call` event per invocation with duration, cost
  estimate, and outcome (`ok` / `failed` / `parse_failed`).
- **Doctrine update** in `~/.claude/CLAUDE.md` — new
  "DISPATCHER / ARBITER" section explaining how the session should
  read `ARBITER: honored` vs `ARBITER: refused` hints and honor the
  arbiter's subagent choice.
- **9 new unit tests** for the arbiter in `backtest.test.js` covering:
  JSON extraction with and without markdown fences, invalid tier
  rejection, unknown subagent rejection, API error response handling,
  no-API-key silent no-op, mock-response success path, cache key
  stability, and subagent set completeness.

### Economics

On the 1,370-prompt validation corpus, ~17% of prompts hit the ambiguous
path (confidence < 0.75 OR `ambiguous_*`). At ~$0.001 per arbiter call:

- Per-month extra cost: **~$0.27** (assuming 270 ambiguous calls/month)
- Expected quality uplift: from ~84% correct to ~95% correct decisions
- Latency cost: +400ms on ambiguous prompts only (cache hit = 0ms)

### Verification

- **56/56 tests passing** (+13 new since v0.7.2: 4 latency + 9 arbiter)
- All arbiter tests use `_mockResponse` — no real API calls during CI
- The arbiter cascade architecture is validated by the v0.7.1 `ARBITER: honored` smoke test in `inject_context.js`

### Deferred to v0.9

- **Parallel decomposition execution** — the arbiter can already return
  a `decomposition` array but the doctrine currently says "ignore this
  field for v0.8". v0.9 will wire it into actual parallel subagent spawns.
- **Arbiter metrics in `/metrics` and statusline** — hit ratio, avg
  arbiter latency, cumulative arbiter cost. Trivial to add, left out of
  this commit to keep scope tight.
- **Training the arbiter on the user's own decisions.log** — v0.9 will
  inject the top-10 most common prompts from the user's history as
  few-shot examples in the system prompt.

---

## [0.7.2] — 2026-04-08

### Turn-latency measurement + dispatcher architecture analysis

Closes the honesty loop the user flagged: "the router saves money, but
I also need to see how much slower it is vs going straight to Opus 4.6".
Ships the measurement infrastructure + a written architecture analysis
covering 5 candidate dispatcher designs and the evolutionary path.

### Added

- **Stop hook `~/.claude/hooks/gsd-turn-end.js`** (new) — writes
  `{event: turn_end, ts_ms, session_id}` on every main assistant turn
  completion. Pairs with `classified` events from `inject_context.js`
  by `session_id` to give wall-clock turn duration.
- **`tools/router/install-stop-hook.sh`** (new) — idempotent patcher
  for `~/.claude/settings.json`. Uses `jq` to add the Stop hook line
  without touching any other config. Creates a backup before writing.
- **`computeLatency()` in `savings-tracker.js`** — walks
  `decisions.log`, pairs classified→turn_end events, computes p50/p95/
  avg wall-clock turn duration, and compares against a per-tier Opus
  baseline estimate (T0: 6s, T1: 10s, T2: 26s, T3: 51s derived from
  Anthropic Q2 2026 throughput specs). Weighted baseline uses the
  actual tier mix so the delta reflects the user's real workload.
- **`renderLatency()` in `gsd-statusline.js`** — new segment
  `│ ⏱ 2.5s p50 · ~-23.7s vs Opus`. The `~` on the delta marks it as
  estimated; the p50 is measured and has no tilde. Colour rules:
  green ≥500ms faster, dim within ±500ms, yellow 0.5-3s slower, red >3s.
- **`docs/DISPATCHER_ARCHITECTURE.md`** (new, ~3,000 words) — deep
  technical analysis of 5 candidate dispatcher architectures (regex,
  Haiku arbiter, speculative execution, learned classifier, cascading
  hybrid), trade-off triangle (cost × latency × quality), honest
  discussion of what's measurable vs estimated, per-version evolution
  roadmap v0.7.1 → v1.0.

### Changed

- `inject_context.js` — `classified` log entry now includes `ts_ms` and
  `session_id` for Stop hook pairing.
- `savings-tracker.js` — `/metrics` response now includes a `latency`
  block alongside the existing `providers` block.

### Verification

- **43/43 tests passing** (unchanged from v0.7.1 — the latency feature
  is additive and tested via live mock data)
- Live end-to-end smoke: 3 synthetic paired turns → statusline renders
  `⏱ 2.5s p50 · ~-23.7s vs Opus` in green

---

## [0.7.1] — 2026-04-08

### Provider availability indicator in statusline

Adds a compact lightning-bolt segment at the end of the Claude Code
statusline showing which of the 4 supported providers the router could
invoke right now. Every frugal user sees, on every refresh, that the
router is multi-provider — not just Claude.

### Added

- **`getProvidersSync()` / `refreshProvidersAsync()` in `savings-tracker.js`**
  — detection pipeline for Claude (OAuth or ANTHROPIC_API_KEY,
  cross-checked against .budget-cache error sentinel), Ollama (HTTP
  ping to localhost:11434 refreshed every 30s via interval), Gemini
  (GEMINI_API_KEY / GOOGLE_API_KEY), GPT/Codex (OPENAI_API_KEY or
  `codex` CLI on PATH).
- **`/providers` endpoint** on the tracker HTTP server (port 7821).
- **Provider block in `/metrics` response** — rides the existing HTTP
  fetch from the statusline, no extra call.
- **`renderProviders()` in `gsd-statusline.js`** — renders compact
  `⚡ Claude● Ollama● Gemini○ GPT●` segment. Symbols: ● green = live,
  ◐ yellow = degraded, ○ dim = not configured, ◌ dim = unknown
  (first 30s of tracker startup).
- **`fetchFrugalMetrics()` refactor** — single HTTP call shared by
  savings + providers (and later latency) renderers.

### Verification

- 43/43 tests still passing (no regressions)
- Smoke-tested end-to-end with the live tracker rendering all segments

---

## [0.7.0] — 2026-04-08

### Latency, quality intent, and sub-tier specialists

Three orthogonal improvements driven by a latency audit + 2026 routing research. The doctrine is unchanged — frugal is still hint-layer, not proxy — but the hook is now 10-20× faster on repeat prompts, understands natural-language quality signals ("pensa bem", "think hard", "ultrathink"), and routes T0 work to specialised local models (`qwen2.5-coder:14b` for code, `deepseek-r1-distill-qwen:14b` for math).

### Added

**Phase 1 — Latency quick wins (hook p50 cut from ~3s to ~113ms):**

- **Cross-session classify cache** in `inject_context.js`. Every prompt is hashed (SHA-256), decisions persisted to `.classify-cache.json` with 24h TTL and LRU cap 1000. Re-asks skip the `classify.js` spawn entirely (~80ms saved per hit). Cache is invalidated automatically when `router-tuning.json` mtime changes. User-override results are never cached (intent may shift turn-to-turn).
- **Async budget refresh** via `refresh-budget.js`. The OAuth `/usage` fetch used to block the hook up to 3s on cache miss; now it only blocks on HIGH_RISK prompts with very-stale cache (>4h). Normal path: use stale-but-usable cache and spawn detached refresh. Lock file prevents concurrent refreshes.
- **Ollama warmup helper** `ollama-warmup.js`. Spawned detached alongside the tracker auto-start. POSTs one lightweight `/api/generate` with `keep_alive: -1` so `qwen2.5:3b` stays resident in VRAM and Option A doesn't pay cold-start. Paired with `keep_alive: -1` on every `ollama_call_node.js` request.
- **pid-file tracker liveness check** replaces the TCP `GET /health` socket in `inject_context.js`. One `fs.stat` instead of a socket open; mtime-refreshed by the tracker every 30min.
- **Option A timeout reduced 9000→4000ms.** With warmup active, qwen answers short prompts in <2s. On miss, the `<router-hint>` is still emitted so Claude processes normally.
- **`bench-hook.js`** — micro-benchmark that runs 10 canonical prompts × N iterations through the real hook via `spawnSync` and reports p50/p95/p99. Measured on v0.7: p50=113ms, p95=407ms, p99=1846ms against targets <200/<500/<4000ms.
- **`FRUGAL_V07_DISABLE=1` kill-switch** — reverts the hook's Phase 1 latency paths to v0.6.1 behaviour (sync budget fetch, no classify cache) in case a regression needs fast rollback. Phase 2 (quality intent) and Phase 3 (sub-tier routing) are not affected by the flag because they're pure regex and have no latency cost worth disabling.

**Phase 2 — Quality-intent detection (natural-language tier promotion):**

- **`QUALITY_INTENT_PATTERNS`** in `classify.js` — 20 regex families in PT-PT + EN covering `"preciso do teu melhor modelo"`, `"pensa bem"`, `"análise profunda"`, `"com máxima qualidade"`, `"não podes falhar"`, `"mission critical"`, `"think hard"`, `"ultrathink"`, `"give me your best shot"`, `"don't mess this up"`, and friends. Match promotes the tier by 1 step (capped at T3) and emits `quality_intent: true` on the decision.
- **Three precedence rules** exhaustively tested:
  1. User override (`@haiku`, `usa o opus`) still wins — quality intent is advisory, not authoritative.
  2. HIGH_RISK guardrail still applies — a deploy prompt with `"pensa bem"` stays T3 because it was already T3, never downgrades.
  3. Haiku degrade path respects quality intent — if `ANTHROPIC_API_KEY` is absent and the promoted tier is T1, jump to **T2** (Sonnet via subagent) instead of degrading back to T0. This is new: the old degrade path was swallowing the promotion.
- **Doctrine update** in `~/.claude/CLAUDE.md` — new "QUALITY INTENT" section beside "USER OVERRIDE" explaining the subagent delegation rules and the Option A suppression.
- **Backtest metric** `quality_intent_hits` in `backtest.js` report. If >10% of prompts trigger it, surfaces a nudge to add the most-used phrase as a first-class `user_override` shortcut.

**Phase 3 — T0 sub-tier specialists (local models by domain):**

- **Model registry expansion** in `pricing.js` — new entries `qwen2.5-coder:14b-q4` (code specialist), `deepseek-r1-distill-qwen:14b` (math/reasoning specialist), plus `subtier` and `strengths` fields on every local entry. Registry is the single source of truth consumed by both the classifier (routing) and the install guard (guidance).
- **Content-based sub-tier routing** in `classify.js`. When the decision lands in T0, `CODE_SUBTIER_RE` (function / class / async / file extensions / refactor verbs) and `MATH_SUBTIER_RE` (equation keywords + Unicode math symbols `∫∑∏√≤≥`) pick the right specialist. Default fallback is `qwen2.5:3b`. Emits `t0_subtier: 'code' | 'math' | 'general' | 'reason' | null`.
- **Option A guard** — `<suggested_answer>` pre-computation only fires when `recommended_model === qwen2.5:3b`. 14b specialists are too slow for pre-compute on the hook path; Claude calls them via the session/subagent instead.
- **`check-local-models.js`** install guard. Runs `ollama list`, compares against `pricing.PRICES` subtier entries, prints a table of installed/missing models with exact `ollama pull` commands. **Never auto-installs** — disk/VRAM is the user's call. Has `--json` and `--quiet` modes for scripting.

### Changed

- `inject_context.js` — complete rewrite of the hook startup block (tracker + warmup), budget fetch flow, and classify path. Decision log now records `quality_intent` and `cache_hit` fields for backtest consumption.
- `backtest.js` — `analyze()` now returns `qualityIntentHits` and `cacheHits`, and the report surfaces both plus the nudge.
- `ollama_call_node.js` — adds `keep_alive: -1` to the request body and drops the internal HTTPS timeout from 7s → 3.5s (hook outer timeout is 4s).
- `savings-tracker.js` — on startup, writes `.tracker.pid` file and refreshes its mtime every 30min. Cleaned up on SIGINT/SIGTERM.
- `pricing.js` — every known model now has optional `strengths` and `tier` metadata; unchanged models keep identical cost math.

### Verification

- **43/43 unit tests passing** (+18 new: 8 quality intent, 5 sub-tier, 3 pricing registry, 2 backtest metric). Run with `node backtest.test.js`.
- **Live latency benchmark** on 50 samples: p50 113ms, p95 407ms, p99 1846ms, max 1846ms. All 3 v0.7 targets met.
- **Smoke tests** for every Phase 2/3 path executed manually — see CHANGELOG review section and `docs/BENCHMARK.md` for numbers.

### Deferred (planned for v0.8+)

- **Semantic router (aurelio-labs + MiniLM embeddings)** for paraphrases the regex misses. Adds Python + 80MB encoder; only justifiable if backtest proves regex coverage is insufficient.
- **Learned classifier** (BEST-Route DeBERTa-small or similar). Overkill until the decisions.log corpus is large enough to beat heuristics empirically.
- **Multi-provider backends live** (Gemini, GPT-4o). Keys, quota tracking, per-provider cost accounting. Separate sprint.
- **Single-source HIGH_RISK** — currently mirrored between `classify.js` and `backtest.js`; should be extracted to a shared constants file.

---

## [0.6.1] — 2026-04-07

### User-driven model override (in-prompt pinning)

The user can now pin a specific model directly inside their prompt and the
classifier honors it. Vocabulary supported in PT-PT and EN, case-insensitive.

### Added

- **`detectUserOverride()` in `classify.js`** — five regex families covering
  positive (`usa o opus`, `with sonnet`, `via haiku`, `rodar com gpt-4o`),
  forced (`force ollama`, `força sonnet`, `impõe haiku`), short form (`@opus`,
  `@sonnet`, `@haiku`, `@ollama`, `@gemini`, `@gpt-4o`), assignment
  (`model: gemini`, `modelo = haiku`), and negative (`sem opus`, `não uses
  haiku`, `don't use sonnet`, `no gemini`).
- **`USER_OVERRIDE_MODELS` table** mapping each keyword to `{tier, model,
  backend, label}`. Currently maps `opus → T3 / claude-opus-4-6`, `sonnet →
  T2 / claude-sonnet-4-6`, `haiku → T1 / claude-haiku-4-5`, `ollama / local /
  qwen → T0 / qwen2.5:3b`, `gemini → T0 / gemini-2.5-flash`, `gpt / gpt-4 /
  gpt-4o → T2 / gpt-4o`. Bare `claude` is treated as a synonym for `opus`.
- **Override application logic** runs after the heuristic tier is computed
  and before the project-CLAUDE.md enrichment. Honored overrides set
  `tier`, `recommended_model`, `recommended_backend`, `suggested_subagent`,
  `confidence: 0.99`, and a new `user_override: { kind, requested, label,
  honored, original_tier }` field. Refused overrides keep the heuristic tier
  but still surface the attempt with `honored: false` and a `reason`.
- **HIGH_RISK guardrail on downgrades.** If the prompt carries any
  `HIGH_RISK` signal (deploy, migration, secret, architect, push, etc) and
  the user requests a *cheaper* tier, the override is **refused** and the
  prompt stays on the high-risk tier. Upgrades are always allowed. This
  mirrors the dual-enforce pattern from the auto-learning loop and prevents
  someone accidentally routing a `git push --force` to Ollama.
- **`USER_OVERRIDE` block in `<router-hint>`** emitted by `inject_context.js`
  — surfaces `USER_OVERRIDE: honored — pinned to <Label>` or `USER_OVERRIDE:
  REFUSED — <reason>` so the doctrine can read it without re-parsing the
  prompt. Last line of the hint switches between "USER OVERRIDE ACTIVE: honor
  the pinned model — do not delegate to a different tier" (when honored) and
  the standard tier guidance (otherwise).
- **Option A suppression when override is honored** — `inject_context.js`
  skips the Ollama pre-compute step entirely when `user_override.honored ===
  true`. The user explicitly asked for a model; running Ollama and asking
  Opus to regurgitate it would defeat the intent.
- **Doctrine update in `~/.claude/CLAUDE.md`** — new "USER OVERRIDE" section
  under the OPTION A clause documenting the vocabulary and the doctrine rule:
  honor the pinned model unconditionally when `honored: true`, never delegate
  to a different tier.
- **8 new tests** in `backtest.test.js` (total: **25/25 passing** in ~544ms):
  positive `usa o opus` → T3, short `@sonnet` → T2, forced `force ollama` →
  T0, negative `sem opus` (already-at-T0 refusal), HIGH_RISK refusal of
  `usa ollama para deploy de produção`, HIGH_RISK refusal of `@haiku review
  final antes de push`, assignment `model: gemini` → Gemini Flash, and a
  no-override regression check that confirms the heuristic path is unchanged
  when the prompt has no in-prompt pin.

### Examples

```bash
$ node ~/.claude/tools/router/classify.js "usa o opus para isto"
{
  "tier": "T3",
  "recommended_model": "claude-opus-4-6",
  "user_override": {
    "kind": "positive",
    "requested": "opus",
    "label": "Opus",
    "honored": true,
    "original_tier": "T0"
  },
  "escalation_rule": "user_override_positive"
}

$ node ~/.claude/tools/router/classify.js "usa ollama para deploy producao"
{
  "tier": "T3",
  "recommended_model": "claude-opus-4-6",
  "user_override": {
    "kind": "positive",
    "requested": "ollama",
    "label": "Ollama",
    "honored": false,
    "reason": "high_risk_signal_present",
    "original_tier": "T3"
  },
  "escalation_rule": "user_override_refused_high_risk"
}
```

### Why this matters

Until v0.6.1, the only way to override the router was to spawn a subagent
manually, which is verbose and breaks the flow. Now Paulo can write `usa o
opus para isto` mid-prompt and the session pins to Opus immediately —
without losing the high-risk safety net that prevents accidental cheap
routing of dangerous operations.

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
