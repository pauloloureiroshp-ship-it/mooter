# Mooter Self-Audit — AUDIT_REPORT.md

> Wave 23 "Mooter audits Mooter". T0 (local qwen2.5-coder) summarized the codebase,
> T1 (Haiku) validated each summary vs the real file, T2 (Sonnet) ranked the issues below.
> Every issue traces to a real file in the corpus — no synthetic findings.

> **⚠ Read this first — findings are SECOND-ORDER.** Issues are derived from the
> *validated summaries*, not from a direct code read. So a finding worded like "X
> summary fabricates Y" or "summary catastrophically wrong" is primarily evidence that
> the **local T0 model drifted on that file** (the quantization / Discovery-2 signal) —
> NOT a confirmed code defect. Treat those as *summary-drift artifacts* and code-verify
> before acting. The genuinely actionable code-level findings are the ones that name a
> concrete code fact (e.g. `frugal-` branding paths, dual admin-token naming, files with
> no test). The high overall drift (avg 5.2/10) is itself the headline finding: it is why
> a fine-tuned adapter is worth training (Phase 4 LoRA export).

## Executive summary

- **Files audited:** 372 (corpus.jsonl)
- **Drift:** none 9 · minor 189 · major 174 (avg accuracy 5.2/10)
- **Issues ranked:** 50 — 13 high · 24 medium · 13 low

## Top 10 critical issues

| # | Severity | Category | Issue | Evidence | Fix (min) | Wave |
|---|---|---|---|---|---|---|
| 1 | high | Dead code | classify.js local summary catastrophically wrong (score=1) — core routing logic undocumented | `tools/router/classify.js` | 90 | Wave 24 cleanup |
| 2 | high | Dead code | _debug_subagentstop_v167.js is empty/vestigial debug artifact checked into router | `tools/router/_debug_subagentstop_v167.js` | 5 | Wave 24 cleanup |
| 3 | high | Architecture violation | subagentstop_hook.js missing token-aggregation job 22.B and dominant-model extraction from transcript | `tools/router/subagentstop_hook.js` | 120 | Wave 24 honesty |
| 4 | high | Stale docs | hub/routes/stats.js fabricates require(invariant) and require(./env) — wrong import model in corpus | `hub/routes/stats.js` | 30 | Wave 24 cleanup |
| 5 | high | Security gap | FRUGAL_ADMIN_TOKEN and MOOTER_ADMIN_TOKEN dual-token auth in hub — inconsistent secret naming | `docs/strategy/WAVE13_X_DAY1_FINDINGS.md` | 60 | Wave 24 security |
| 6 | high | Architecture violation | hub/routes/feedback.js imports sanitizeJson from anomaly.js but real import is from sanitize.js | `hub/routes/feedback.js` | 15 | Wave 24 cleanup |
| 7 | high | Branding leftover | frugal-login.js stores auth token at ~/.frugal/auth.token — old branding path, should be ~/.mooter/ | `tools/router/frugal-login.js` | 60 | Wave 24 brand cleanup |
| 8 | high | Architecture violation | token_tracker.js missing aggregateTranscript() and file-backed cache for subagent tokens — Wave 22.B gap | `tools/router/token_tracker.js` | 120 | Wave 24 honesty |
| 9 | high | Stale docs | landing/app/(app)/dashboard/page.tsx summary fabricates non-existent export { default } from ./_phase_c | `landing/app/(app)/dashboard/page.tsx` | 20 | Wave 24 cleanup |
| 10 | high | Architecture violation | hub/routes/delta.js missing Zod per-field validation and rate-limit fail-open design from corpus | `hub/routes/delta.js` | 90 | Wave 24 security |

## All issues by category

### Stale docs (20)

- **[high]** hub/routes/stats.js fabricates require(invariant) and require(./env) — wrong import model in corpus — `hub/routes/stats.js` · ~30min · Wave 24 cleanup
- **[high]** landing/app/(app)/dashboard/page.tsx summary fabricates non-existent export { default } from ./_phase_c — `landing/app/(app)/dashboard/page.tsx` · ~20min · Wave 24 cleanup
- **[medium]** patterns.js summary lists only 2 exports — 100+ HIGH_RISK regex patterns (XSS, CSRF, SQL injection, JWT) invisible — `tools/router/patterns.js` · ~45min · Wave 24 cleanup
- **[medium]** pricing.js summary fabricates TypeScript import — full model price map (Anthropic/Google/OpenAI/DeepSeek/Ollama) undocumented — `tools/router/pricing.js` · ~30min · Wave 24 cleanup
- **[medium]** 123 strategy docs average score 4.6 with 72 major drift — wave kickoff docs used as reference but systematically stale — `docs/strategy/` · ~240min · Wave 24 cleanup
- **[medium]** ANTHROPIC_SHOWCASE_RUBRIC_V2.md score=2: C1-C5 scoring table (23→25/25) absent from corpus — rubric drift — `docs/strategy/ANTHROPIC_SHOWCASE_RUBRIC_V2.md` · ~30min · Wave 24 cleanup
- **[medium]** PHASE_C_ARCHITECTURE_AUDIT.md F-1 to F-10 security findings missing from summary — critical audit invisible to corpus — `docs/strategy/PHASE_C_ARCHITECTURE_AUDIT.md` · ~20min · Wave 24 cleanup
- **[medium]** SYNC.md wave 22 state (22.A-22.F details, SubagentStop hook discovery) not reflected in corpus summary — `SYNC.md` · ~30min · Wave 24 cleanup
- **[medium]** ARCHITECTURE.md fabricates regex_patterns as standalone module and anthropic_key as dependency — core architecture doc misleads — `ARCHITECTURE.md` · ~60min · Wave 24 cleanup
- **[medium]** prompt-optimizer.js missing S2-S5 strategies, OptimizerDecision typedef, and <5ms budget constraint from corpus — `tools/router/prompt-optimizer.js` · ~30min · Wave 24 cleanup
- **[medium]** backtest.js summary omits over/under-routing analysis output and router-tuning.json generation — tuning loop invisible — `tools/router/backtest.js` · ~20min · Wave 24 cleanup
- **[medium]** detect-subscriptions.js missing 5-probe detection logic (Anthropic, Codex, OpenAI, Gemini, Ollama) and --ping flag from corpus — `tools/router/detect-subscriptions.js` · ~20min · Wave 24 cleanup
- **[low]** frugal-turn-header.js UserPromptSubmit hook context and systemMessage channel missing from corpus summary — `tools/router/frugal-turn-header.js` · ~15min · Wave 24 cleanup
- **[low]** FLOWCHART.md summary fabricates mermaid/fastText/k-NN imports — strategic analysis doc misidentified as executable code — `docs/strategy/FLOWCHART.md` · ~10min · Wave 24 cleanup
- **[low]** WAVE15_FRIENDS_LAUNCH_AUDIT_FINDINGS.md GO/NO-GO verdict (NO-GO, 3 critical findings) missing from corpus summary — `docs/strategy/WAVE15_FRIENDS_LAUNCH_AUDIT_FINDINGS.md` · ~10min · Wave 24 cleanup
- **[low]** NOTICE.md summary fabricates API public exports — legal license doc misidentified as technical module — `NOTICE.md` · ~10min · Wave 24 cleanup
- **[low]** landing/app/(marketing)/methodology/page.tsx use client directive and HARDWARE constant missing from summary — `landing/app/(marketing)/methodology/page.tsx` · ~10min · Wave 24 cleanup
- **[low]** landing/app/(marketing)/install/InstallCommand.tsx clipboard copy state and 1600ms reset logic missing from summary — `landing/app/(marketing)/install/InstallCommand.tsx` · ~10min · Wave 24 cleanup
- **[low]** tools/audit/audit_corpus_builder.js CLI interface (scan/run/stats commands) missing from corpus summary — `tools/audit/audit_corpus_builder.js` · ~15min · Wave 24 cleanup
- **[low]** landing/app/onboarding/page.tsx fabricates React import — recommendOllamaModel logic missing from summary — `landing/app/onboarding/page.tsx` · ~10min · Wave 24 cleanup

### Missing tests (10)

- **[medium]** classify-branches.test.js summary misses 95% of test content: HIGH_RISK, arch, bug, LOW_RISK branches untested per summary — `tools/router/classify-branches.test.js` · ~60min · Wave 24 test coverage
- **[medium]** badge-savings.test.js summary fabricates missing exports and claims no tests — 5 real tests invisible to corpus — `tools/router/badge-savings.test.js` · ~30min · Wave 24 test coverage
- **[medium]** stop-hook.test.js summary fabricates non-existent exports (buildHerdSection, buildMooCard) — 5 real tests missing from coverage map — `tools/router/stop-hook.test.js` · ~30min · Wave 24 test coverage
- **[medium]** glyphs.test.js summary fabricates non-existent exports — 5 glyph tests invisible to coverage tracking — `tools/router/glyphs.test.js` · ~20min · Wave 24 test coverage
- **[medium]** landing/app/(app)/admin/page.tsx missing use client directive and csvExport/maskEmail coverage in corpus — `landing/app/(app)/admin/page.tsx` · ~20min · Wave 24 cleanup
- **[medium]** validate-set.js summary fabricates validate-set.test.js — per-section drift detection (canonical 100%, overall >=85%) undocumented — `tools/router/validate-set.js` · ~45min · Wave 24 test coverage
- **[medium]** env.test.js summary fabricates module-level exports — schema rejection tests (invalid URLs, out-of-range ports) invisible to coverage map — `tools/router/env.test.js` · ~30min · Wave 24 test coverage
- **[medium]** savings-tracker-me.test.js missing aggregateExecution, resetExecutionsAggregate, buildExecutionsBlock test coverage in summary — `tools/router/savings-tracker-me.test.js` · ~30min · Wave 24 test coverage
- **[low]** detect-subscriptions.test.js missing GEMINI_API_KEY / GOOGLE_API_KEY test cases in coverage map — `tools/router/detect-subscriptions.test.js` · ~20min · Wave 24 test coverage
- **[low]** vram-detect.test.js missing formatVramChip null and M-series edge case tests from coverage map — `tools/router/vram-detect.test.js` · ~20min · Wave 24 test coverage

### Architecture violation (6)

- **[high]** subagentstop_hook.js missing token-aggregation job 22.B and dominant-model extraction from transcript — `tools/router/subagentstop_hook.js` · ~120min · Wave 24 honesty
- **[high]** hub/routes/feedback.js imports sanitizeJson from anomaly.js but real import is from sanitize.js — `hub/routes/feedback.js` · ~15min · Wave 24 cleanup
- **[high]** token_tracker.js missing aggregateTranscript() and file-backed cache for subagent tokens — Wave 22.B gap — `tools/router/token_tracker.js` · ~120min · Wave 24 honesty
- **[high]** hub/routes/delta.js missing Zod per-field validation and rate-limit fail-open design from corpus — `hub/routes/delta.js` · ~90min · Wave 24 security
- **[medium]** post_tool_badge.js summary fabricates automatic invocation — herdAnnotationEnabled and MOOTER_HERD_VISIBILITY undocumented — `tools/router/post_tool_badge.js` · ~30min · Wave 24 cleanup
- **[low]** hub/lib/model-detect.js unknown_models dual-type handling (string JSON or array) missing from corpus — edge case invisible — `hub/lib/model-detect.js` · ~20min · Wave 24 cleanup

### Dead code (3)

- **[high]** classify.js local summary catastrophically wrong (score=1) — core routing logic undocumented — `tools/router/classify.js` · ~90min · Wave 24 cleanup
- **[high]** _debug_subagentstop_v167.js is empty/vestigial debug artifact checked into router — `tools/router/_debug_subagentstop_v167.js` · ~5min · Wave 24 cleanup
- **[medium]** hub/.wrangler/dry-run/worker.js summary fabricates @opentelemetry/core dependency — webpack bundle artifact misidentified — `hub/.wrangler/dry-run/worker.js` · ~10min · Wave 24 cleanup

### Security gap (3)

- **[high]** FRUGAL_ADMIN_TOKEN and MOOTER_ADMIN_TOKEN dual-token auth in hub — inconsistent secret naming — `docs/strategy/WAVE13_X_DAY1_FINDINGS.md` · ~60min · Wave 24 security
- **[high]** preflight-audit.js isTokenExpired() JWT logic and B1-B5 block structure undocumented — audit gaps invisible — `tools/audit/preflight-audit.js` · ~45min · Wave 24 cleanup
- **[low]** hub/routes/feedback.js F-1-style rate limiting (10/60s per ip_hash) absent from corpus — security control invisible — `hub/routes/feedback.js` · ~20min · Wave 24 security

### Branding leftover (3)

- **[high]** frugal-login.js stores auth token at ~/.frugal/auth.token — old branding path, should be ~/.mooter/ — `tools/router/frugal-login.js` · ~60min · Wave 24 brand cleanup
- **[high]** hub-events-scheduler.js reads token from ~/.frugal/auth.token — stale path after rebrand to mooter — `tools/router/hub-events-scheduler.js` · ~30min · Wave 24 brand cleanup
- **[medium]** hub/lib/db.js still inserts to frugal_events table — DB schema naming leftover post-rebrand to mooter — `hub/lib/db.js` · ~30min · Wave 24 brand cleanup

### Naming inconsistency (3)

- **[high]** Four router files retain frugal- prefix (frugal-doctor.js, frugal-login.js, frugal-mode.js, frugal-turn-header.js) — mass rename needed — `tools/router/frugal-doctor.js` · ~60min · Wave 24 brand cleanup
- **[medium]** wave22-honesty.test.js references subagentstop_hook.js with wrong module name (subagent_stop_hook.js) — `tools/router/wave22-honesty.test.js` · ~10min · Wave 24 cleanup
- **[medium]** env.js pick() function has undocumented MOOTER > FRUGAL precedence — migration path for FRUGAL_ variables invisible — `tools/router/env.js` · ~30min · Wave 24 brand cleanup

### Duplicate functionality (1)

- **[medium]** confidence-calibrator.js summary claims it adjusts thresholds — code only measures (diagnostic tool misclassified as runtime) — `tools/router/confidence-calibrator.js` · ~20min · Wave 24 cleanup

### Inline TODO/FIXME (1)

- **[low]** stress-test.js summary claims no tests — 47 tier-organised test prompts (T0-T3) invisible to corpus — `tools/router/stress-test.js` · ~10min · Wave 24 cleanup

## Recommended Wave 24+ scope

Highest-leverage first:
- classify.js local summary catastrophically wrong (score=1) — core routing logic undocumented (Dead code) — Wave 24 cleanup
- _debug_subagentstop_v167.js is empty/vestigial debug artifact checked into router (Dead code) — Wave 24 cleanup
- subagentstop_hook.js missing token-aggregation job 22.B and dominant-model extraction from transcript (Architecture violation) — Wave 24 honesty
- hub/routes/stats.js fabricates require(invariant) and require(./env) — wrong import model in corpus (Stale docs) — Wave 24 cleanup
- FRUGAL_ADMIN_TOKEN and MOOTER_ADMIN_TOKEN dual-token auth in hub — inconsistent secret naming (Security gap) — Wave 24 security
- hub/routes/feedback.js imports sanitizeJson from anomaly.js but real import is from sanitize.js (Architecture violation) — Wave 24 cleanup
- frugal-login.js stores auth token at ~/.frugal/auth.token — old branding path, should be ~/.mooter/ (Branding leftover) — Wave 24 brand cleanup
- token_tracker.js missing aggregateTranscript() and file-backed cache for subagent tokens — Wave 22.B gap (Architecture violation) — Wave 24 honesty
