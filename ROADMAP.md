# Roadmap

> Last updated: 2026-04-11

This roadmap is the single source of truth for what's done, what's next, and what's explicitly deferred. It supersedes the summary table in [README.md](README.md) when there's a conflict.

---

## Legend

- ✅ **Released** — shipped and running in production (dogfooded daily)
- 🟡 **Planned** — committed for a specific version, designed, not yet built
- 🔵 **Vision** — desirable but not yet designed, may change
- ⏸ **Deferred** — considered and explicitly postponed with rationale

---

## Released

### v0.1.0 — Foundation (2026-04-06)

The classifier and the hook, wired into Claude Code.

- ✅ `classify.js` v1 — heuristic regex classifier (<50 ms, returns `{tier, confidence, reasoning}`)
- ✅ `inject_context.js` — UserPromptSubmit hook that emits `<router-hint>`
- ✅ 6 subagents — `model-architect`, `model-reasoner`, `cheap-triage`, `local-summarizer`, `local-transformer`, `final-reviewer`
- ✅ Documentation — `docs/ROUTING_POLICY.md`, `docs/HOW_IT_WORKS.md`, `docs/MODEL_MAPPING.md`, `docs/LIMITATIONS.md`, `docs/VALIDATION_REPORT.md`
- ✅ v1 baseline measured: 31.0% T3 misroutes, 27.1% low-confidence, 27.5% savings

### v0.2.0 — Doctrine (2026-04-06)

Made the session itself the router.

- ✅ Mediator doctrine (`~/.claude/CLAUDE.md`, 165 lines) — the core frugal philosophy Claude Code reads at session start
- ✅ `stats.js` — aggregate routing stats from `decisions.log`
- ✅ `benchmark.sh` — labelled-dataset accuracy harness
- ✅ `install.sh` v1 — idempotent install with `--dry-run`, `--force`, `--uninstall`
- ✅ Telemetry hook — logs every routing decision to `decisions.log`
- ✅ 100% benchmark accuracy on the 200-prompt hand-labelled dataset
- ✅ 70% savings validated on a 200-prompt real-session replay

### v0.3.0 — Real-world validation (2026-04-06)

Moved from synthetic benchmarks to real production corpus.

- ✅ `replay.js` — replays `decisions.log` against the current classifier for regression testing
- ✅ Validation on **1,370 real prompts**: T0: 83.9% | T2: 12.4% | T3: 3.6% | low-conf: 2.0% | **savings: 90.2%**
- ✅ 3 fast-path detectors in `classify.js` v3 — commit→T0, architecture→T3, short→T0
- ✅ Ambiguous sub-categories — weighted scoring for multi-tier matches
- ✅ Low-confidence guardrail — `<0.60` escalates one tier, but only with risk evidence
- ✅ `decisions.log` format extended with `confidence`, `sub_category`, `ambiguous`

### v0.4.0 — Budget awareness + multi-provider (2026-04-07)

Made frugal aware of your wallet.

- ✅ Statusline with live OAuth budget — `statusline.sh` reads Anthropic OAuth usage every 2 hours
- ✅ Budget guardrail — dynamic tier cap: 0-50%→T3, 50-70%→T2, 70-85%→T1, >85%→T0
- ✅ MD Enrichment — `classify.js` reads `## Router Context` from the project's `CLAUDE.md`
- ✅ SHA-256 prompt cache — identical prompts skip regex (30 min TTL)
- ✅ Multi-provider docs: `CODEX_SETUP.md`, `GEMINI_SETUP.md`, `VSCODE_SETUP.md`
- ✅ Rename `cloude-router` → `frugal`
- ✅ Fixed: classify.js no longer misclassifies architecture prompts containing "commit" as T0

### v0.5.0 — Auto-learning loop (2026-04-07)

Made frugal tune itself.

- ✅ `backtest.js` — daily analyser (scheduled via Windows Task Scheduler `FrugalRouterBacktest` @ 02:00)
- ✅ `router-tuning.json` — structured output with `complexity_threshold`, `promote_to_t0_patterns`, `demote_from_t3_patterns`
- ✅ `update-router.js` — idempotent patcher that injects/replaces the `TUNED-BLOCK-START/END` block in `classify.js`, with `classify.js.bak` backup
- ✅ `classify.js` wire-up — three TUNED constants are now read at runtime:
  - `TUNED_DEMOTE_T3` — regex list forcing T2/T3 → T1 (if `high === 0`)
  - `TUNED_PROMOTE_T0` — regex list forcing any tier → T0 (if `high === 0`)
  - `TUNED_COMPLEXITY_THRESHOLD` — scales the ambiguous-branch cutoffs
- ✅ Dual-enforced doctrine guardrail — `HIGH_RISK_MARKERS` in `backtest.js` mirrors `HIGH_RISK` in `classify.js`, so HIGH_RISK previews are filtered upstream before they can ever enter candidate sets
- ✅ Slash command `/update-router` — documented in `~/.claude/CLAUDE.md`
- ✅ Human-readable statusline breakdown — `Ollama:62% Sonnet:18% Opus:20%` instead of `T0/T1/T2/T3`
- ✅ `savings-tracker.js` exposes `pct_by_model` directly (statusline prefers this, falls back to the tier heuristic)
- ✅ **11 unit tests** with `node:test` — `signature()`, `analyze()`, `buildTuning()`, `update-router` idempotency, `classify.js` integration (pre-push stays T3)

**Commits:** `b432a6d`, `6c1ce2f`, `a66d948` on `origin/main`.

### v0.9.0 — Statusline v3, GPU awareness, federated learning foundation (2026-04-09)

Seven-segment statusline with real GPU telemetry and the privacy-preserving
delta-export pipeline that sets up frugal's federated learning story.

- ✅ **Statusline v3** — git · 🐕 brand · last-turn (tier+model+category+latency+cascade) · distribution (qwen/hku/son/ops) · savings + budget track · GPU widget · all 6 provider dots
- ✅ **GPU probe** — `tools/router/gpu-probe.js` (NVIDIA/Apple Silicon/AMD Linux/CPU fallback), polled every 5s by the tracker
- ✅ **Rich `/last` endpoint** — cascade_path, category_short, arbiter_used, latency_vs_opus_ms for segment ③
- ✅ **`/gpu` endpoint** — name + utilization + warm/cold Ollama model states
- ✅ **`POST /decision`** — fire-and-forget endpoint called by `inject_context.js` per classified hook
- ✅ **Arbiter metrics in `/metrics.arbiter`** — calls_total, cache_hit_rate, high_risk_refused, cost_usd, avg_latency_ms
- ✅ **Decomposition pipeline** — arbiter system prompt v2 + router-hint YAML block + CLAUDE.md doctrine section
- ✅ **`update-router.js --dry-run`** — preview TUNED block without writing
- ✅ **`backtest.js --explain`** — per-candidate regex + saving estimate, anonymized
- ✅ **`backtest.js --export-delta`** — privacy-preserving fingerprint exporter
- ✅ **`tools/router/aggregate-deltas.js`** — manual aggregator for 2-10 users with schema validation + hardware-tier weighting
- ✅ **`docs/FEDERATED_LEARNING.md`** — protocol, privacy guarantees, `frugal-hub` Cloudflare Worker roadmap
- ✅ **replay.js fix** — hot-loader now captures the full classify.js body (not just `const MODELS` onwards)
- ✅ **59/59 tests passing** (3 new decomposition tests)
- ✅ **Replay: ~90% savings** on 1,437 prompts (corpus grew from 1,370)

**Commit:** `1e852f3` on `origin/main`.

### v0.9.2 — Community hub + 8 slash commands (2026-04-09)

frugal-hub deployed, full skill system, URL consolidation.

- ✅ **frugal-hub** — Cloudflare Worker deployed at `mooter-hub.frugal-hub.workers.dev` (D1 + R2)
- ✅ **Community intelligence loop** — `hub-push.js`, `hub-pull.js`, `hub-status.js` with privacy-preserving deltas
- ✅ **8 slash commands** — `/frugal-status`, `/frugal-savings`, `/frugal-route`, `/frugal-summary`, `/frugal-update`, `/frugal-beast`, `/frugal-zen`, `/frugal-auto`
- ✅ **install.sh v2** — idempotent install of all skills, router files, and doctor check
- ✅ **URL fix** — all hub references consolidated to `mooter-hub.frugal-hub.workers.dev`

**Commits:** `aecb9cd`, `ec474ee` on `origin/main`.

### v0.9.3 — Beast/Zen/Auto modes + pattern fixes (2026-04-10)

User-controlled mode overrides and classifier improvements from dogfood telemetry.

- ✅ **Mode system** — `frugal-mode.js` CLI for beast (force T3), zen (cap T1), auto (router decides)
- ✅ **`applyActiveMode()`** — in `inject_context.js`, reads `.frugal-mode.json`, overrides tier before hint emission
- ✅ **Zen safety bypass** — T3-gate tasks (push/deploy/merge) bypass zen cap
- ✅ **5 new patterns** — `redesenha/redesign`, `multi-tenant` (HIGH_RISK); `optimiza/optimize`, `cria/create endpoint` (MED_RISK)
- ✅ **Algorithm snapshot** — `.evolution/v0.9.2-snapshot.json` with SHA-256 hashes and metrics

**Commits:** `b28b307`, `09ff285`, `3181299` on `main`.

### v0.9.7 — Sprint 4: Dashboard MVP + Browser tasks (2026-04-11)

Dashboard shipped, Supabase RLS validated, community hub stats integrated.

- ✅ **Dashboard MVP** — 3 pages (Overview, Misroutes, Community) at `127.0.0.1:7820`
- ✅ **Supabase RLS** — `Allow anonymous inserts` policy validated on `waitlist` table
- ✅ **Community API** — `/api/community` route proxying hub `/aggregate-stats`
- ✅ **Sidebar navigation** — persistent nav replacing header-only layout
- ✅ **`/frugal-dashboard` skill** — start server + open browser
- ✅ **install.sh** — 11 skills (added frugal-dashboard)
- ✅ **ROADMAP.md** — v0.6.0 dashboard marked complete

---

## Planned

### v0.6.0 — Web dashboard ✅

Completed as part of Sprint 4 (2026-04-11).

- ✅ Next.js 15 dashboard bound to `127.0.0.1:7820`
- ✅ Overview page — KPI tiles, tier distribution bar, decisions table, cost trend SVG, tuning preview
- ✅ Filter by tier, category, escalation rule, confidence range, time window
- ✅ Cost trend chart with naive-vs-real overlay (cumulative SVG)
- ✅ "Retrain now" button with dry-run preview
- ✅ `router-tuning.json` preview with pattern explainer (promote/demote lists)
- ✅ Misroutes page — dedicated low-confidence decision debugger
- ✅ Community page — hub aggregate stats vs local tier distribution
- ✅ Sidebar navigation (Overview, Misroutes, Community)
- ✅ `/frugal-dashboard` slash command to start + open

**Success criteria:** Paulo can debug any misrouting in under 30 seconds without grep. ✅

### v0.7.0 — HIGH_RISK single source of truth ✅

Completed as part of the v0.9.x release cycle.

- ✅ `patterns.js` — single module exporting `HIGH_RISK`, `MED_RISK`, `LOW_RISK`, `TRIVIAL`, `TUNING_EXCLUDE`
- ✅ Both `classify.js` and `backtest.js` consume the same exports
- ✅ Adding a new marker in one place automatically propagates
- ✅ Invariant: `TUNING_EXCLUDE ⊇ HIGH_RISK` (documented in patterns.js)

### v0.8.0 — Team shared config

Enable small teams to share a single tuning profile via Git.

- 🟡 `frugal.config.json` at project root — optional, read by `classify.js`
- 🟡 Per-project overrides for `HIGH_RISK`, complexity threshold, budget cap
- 🟡 Per-contributor analytics in `decisions.log` (with opt-out)
- 🟡 Backtest runs per-contributor and per-project
- 🟡 Shared doctrine supplement (`CLAUDE.md` fragment) that layers on top of the personal one

**Open question:** privacy. Right now `decisions.log` stores prompt previews. Sharing those across a team needs either local-only anonymisation or team-level consent.

---

## Vision (v1.0 and beyond)

Not committed. Subject to change based on beta feedback.

- ~~🔵 **frugal-hub (v1.1)**~~ → ✅ **Shipped in v0.9.2** — live at `mooter-hub.frugal-hub.workers.dev` (Workers + D1 + R2)
- 🔵 **Public launch (v1.0)** — `install.sh --one-command` + published `REQUEST_ACCESS.md` replaced by open onboarding
- 🔵 **Cross-machine validation** — replay.js against 5+ contributor corpora, not just Paulo's
- 🔵 **Plugin marketplace** — third-party patterns, doctrine supplements, provider adapters
- 🔵 **MCP integration** — frugal exposed as an MCP server so other MCP clients can read routing decisions
- 🔵 **Native Windows installer** — `.msi` that handles the Task Scheduler entry, Electron tray icon for the dashboard
- 🔵 **Commercial support tier** — SLA, priority bug fixes, custom pattern consulting (see [NOTICE.md](NOTICE.md))
- 🔵 **OpenAI / Gemini parity** — same routing intelligence for Codex CLI and other agent clients

---

## Deferred (with rationale)

These were considered and explicitly postponed. If you think one of them should be reopened, please open an issue.

### ⏸ A small classifier LLM instead of regex

**Status:** rejected for v0.x. Reconsider at v1.0.

**Rationale:** would increase classification latency from <50 ms to ~200 ms, add a model download step, and introduce non-determinism. Regex misclassifications are fixable in minutes via a new pattern + test. A fine-tuned classifier misclassification requires retraining. The cost/benefit is not there until we have >10,000 real prompts in `decisions.log`.

### ⏸ Remote proxy mode

**Status:** rejected permanently.

**Rationale:** a proxy violates Principle #1 of the architecture (*no proxy*). If you need a proxy, use LiteLLM or OpenRouter — those are good tools, just different products.

### ⏸ Support for closed, non-Anthropic models as T3

**Status:** deferred to v0.8.

**Rationale:** adding GPT-4 or Gemini Ultra as a T3 destination is a two-line change in `MODELS` but a much larger change in the doctrine (*"when to pay for Opus vs GPT-4?"*). That's a decision table that needs real beta data to get right.

### ⏸ Automatic HIGH_RISK marker learning

**Status:** rejected.

**Rationale:** HIGH_RISK is a safety list. It must never grow or shrink without human review — the risk of the backtest "learning" that a prompt containing the word `secret` is safe to demote because it happened to be a trivial case once is catastrophic. HIGH_RISK stays hand-curated forever.

### ⏸ Full Linux/macOS native installer

**Status:** deferred to v1.0.

**Rationale:** frugal currently runs on Linux/macOS via the shell scripts, but the scheduled task uses Windows Task Scheduler. Porting the scheduler layer to `launchd` + `systemd timers` is straightforward but not critical for private beta (all current testers are on Windows/Mac and run the backtest manually when needed).

---

## How to suggest roadmap changes

1. Open an issue labelled `roadmap`
2. Say which version you're targeting (or propose a new version)
3. Explain the user problem being solved, not the implementation
4. If accepted, it gets added here with 🟡 status

*Roadmap decisions are made by Paulo during private beta. Post-v1.0 this will transition to a lightweight RFC process.*
