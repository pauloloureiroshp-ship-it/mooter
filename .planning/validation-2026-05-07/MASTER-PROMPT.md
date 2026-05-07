# Master Prompt — Mooter.ai E2E Production Validation

**Created:** 2026-05-07 · post Wave-1.5 + Wave-2 P1 + Migration-009 deploy
**Owner:** Paulo Loureiro
**Target executor:** fresh Claude Code session (paste this entire file as the first user message)
**Deliverable location:** `.planning/validation-2026-05-07/`

---

## 0 · Briefing — what just happened

You are entering this session AFTER a major production push. **Do not reproduce the work; validate it.**

In the previous 24h three streams of work landed in `origin/main`:

| Stream | Commits | Headline |
|---|---|---|
| Wave 1 (subscription + statusline + landing + migration 008) | 4 | Cursor/Copilot/ChatGPT-Plus/Claude-Code-tier detection · LazyMoo statusline detector · landing dynamic version · migration 008 user_id_hash schema |
| Wave 2 P1 (routing rigor) | 5 | drift detector + statusline integration · chronological holdout split in backtest · confidence calibration via ground-truth oracles · 2 tsc-fixes |
| Wave 1.5 (per-user telemetry bootstrap) | 8 | auto-detect subs · profile-refresh wrapper · /me /me/feedback /me/settings tracker endpoints · hub-events-scheduler · focus.json v3.1 · adversarial corpus · Sentry opt-in CLI · VERDICT.md |
| Migration 009 (schema convergence) | 1 | DROP empty mooter_events TABLE → CREATE frugal_events 34-col canonical → recreate mooter_events as VIEW · adds shadow_pairs/algorithm_versions/user_profiles + 3 analytical views · ALTER device_heartbeats user_id_hash |

Migration 009 was applied to **prod D1** at 2026-05-07 ~15:14 UTC. Hub Worker was redeployed (version `c95a583f-c2e8-4e3f-bae8-ba42b73d4d80`) at 2026-05-07 ~15:16 UTC. A live smoke test confirmed POST /api/device-heartbeat with `user_id_hash` lands in `device_heartbeats` ✓.

**Read first (mandatory bootstrap, max 4 minutes):**

```
.planning/wave-1.5/WAVE-1.5-VERDICT.md     # 8/8 gates from prior verdict
.planning/wave-1.5/adversarial-corpus.jsonl # head -10 only — pattern of misroutings
SYNC.md                                     # last session state
hub/migrations/009_converge_schema.sql     # what shipped to D1
hub/lib/db.js                               # confirms INSERT INTO frugal_events
hub/routes/{events.js,heartbeat.js}        # confirms /submit-events + /device-heartbeat
tools/router/classify.js                   # skim only — main entry classify()
tools/router/user-profile.js               # extractSubscriptions shape
tools/router/drift-detector.js             # pure helpers
tools/router/confidence-calibrator.js      # Brier scoring
tools/router/statusline-multi.js           # pickState ordering
tools/router/event-builder.js              # ALLOWED_FIELDS allow-list
landing/app/api/cli-token/route.ts          # user_id_hash derivation
```

If any of those paths is missing or empty, **STOP and report the gap** before continuing — the deploy may be incomplete.

---

## 1 · Mission statement

Validate that mooter.ai is **100% operationally correct in production today** AND **structurally positioned to scale** for the AI/LLM model landscape of the next 12 months. Both criteria must hold; one without the other is failure.

You are NOT building features. You are NOT pushing code. You are NOT touching prod state.

You ARE producing a falsifiable, evidence-backed verdict that Paulo can show an investor / Anthropic engineer / future contributor and have them say *"yes, this is robust."*

---

## 2 · The 8 dimensions to validate

For each dimension, decide PASS / PASS-WITH-NOTES / FAIL with concrete evidence (file:line, command output, D1 query result). Do not declare PASS without evidence. Do not declare FAIL without proposing a fix.

### Dimension 1 — Setup detection (hardware + software + subscriptions)

**What good looks like:**
- `node tools/router/gpu-probe.js` returns vendor/name/vram_mb truthfully against `nvidia-smi`/`system_profiler`/`/sys/class/drm/`
- `node tools/router/check-local-models.js` enumerates what `ollama list` shows
- `node tools/router/detect-subscriptions.js` (new in Wave-1.5) writes `~/.claude/tools/router/subscription-profile.json` with non-empty `detected.{anthropic,openai_codex_cli,gemini}` blocks when env keys / Codex CLI / .credentials.json are present
- `node tools/router/user-profile.js --json | jq .subscriptions` shows the consolidated shape with all 8 fields (anthropic_pro, claude_code, copilot, cursor_pro, gemini_advanced, openai_plus, openai_codex_cli, source)
- `mooter init` rerun does NOT clobber an existing populated profile

**Tests:**
```bash
node tools/router/gpu-probe.js
node tools/router/check-local-models.js
node tools/router/detect-subscriptions.js
node tools/router/user-profile.js --json
node tools/router/user-profile.js  # human-readable
```

**Save evidence to:** `.planning/validation-2026-05-07/evidence/dim1-setup.json`

**Acceptance:** at minimum 3 of 4 subscriptions detected match Paulo's actual setup (he can confirm in chat). Hardware tier matches actual GPU. T0 models include the ones from `ollama list`.

---

### Dimension 2 — Routing economy + maximum value extraction

**What good looks like:**
- For 20 representative prompts (golden set), `node tools/router/classify.js "<prompt>"` returns the cheapest viable tier per `~/.claude/docs/ROUTING_POLICY.md`
- HIGH_RISK prompts (push/deploy/migration/secret) ALWAYS land T3 — never demoted
- TRIVIAL prompts (rename, format, "ok", "obrigado") ALWAYS land T0 (or T1 if Ollama absent)
- USER_OVERRIDE (`@haiku`, `@opus`, "usa o sonnet") is honored; HIGH_RISK + downgrade override = REFUSED
- QUALITY_INTENT ("pensa bem", "ultrathink") promotes one tier
- `complexity_threshold` from `router-tuning.json` is being honored

**Golden set to use** (20 prompts mixing PT-PT and EN, varied length):

```
1.  "obrigado"                                              → T0
2.  "rename variable userId to accountId in auth.ts"         → T0
3.  "format this JSON file with 2-space indentation"         → T0
4.  "what's 2+2?"                                            → T0
5.  "summarize hub/lib/db.js"                                → T0
6.  "explica este erro: TypeError: x is not a function"      → T1
7.  "gera uma commit message para estas mudanças"            → T1
8.  "write a regex for matching email addresses"             → T1
9.  "explica como funciona o arbiter.js em duas frases"      → T1
10. "porque é que o websocket reconnect falha às vezes"      → T2
11. "compara abordagens: Redux vs Zustand para state global" → T2
12. "debug this stack trace step by step"                    → T2
13. "decompose this feature into 5 tasks"                    → T2
14. "redesenha o vault para multi-user com RLS"              → T3
15. "vou fazer push agora"                                   → T3 (HIGH_RISK)
16. "deploy este worker para produção"                       → T3 (HIGH_RISK)
17. "drop table users"                                       → T3 (HIGH_RISK)
18. "@haiku resume este ficheiro"                            → T1 (USER_OVERRIDE)
19. "pensa bem antes — qual a melhor arquitectura?"          → T3 (QUALITY_INTENT)
20. "ultrathink: deep dive analysis on the routing policy"   → T3 (QUALITY_INTENT)
```

**Save evidence to:** `.planning/validation-2026-05-07/evidence/dim2-golden-set.json`
(For each prompt: prompt, expected_tier, actual_tier, confidence, escalation_rule, latency_ms.)

**Acceptance:** ≥ 18/20 hits. Any HIGH_RISK miss = **automatic FAIL** for the dimension. Spend extra rigor on prompts 14–17.

---

### Dimension 3 — Landing page UX/UI fidelity

**What good looks like:**
- `mooter.ai` returns 200 OK
- Footer shows current `NEXT_PUBLIC_APP_VERSION` (or `0.10.1` fallback) — not literal "v0.10.1"
- Hero stats either show live numbers from `/api/stats` OR fall back gracefully with a clear "baseline · seed" label
- The 4 modes section (Moo / CrazyMoo / LazyMoo + auto trio) renders with statusline mockups whose mode badges are valid
- Onboarding `/onboarding` step 1 detects local hardware via WebGL + deviceMemory and recommends matching Ollama models
- `/api/cli-token` redirects to localhost:7822/callback with both `token=` AND `user_hash=` query params (when authenticated)

**Tests:**
```bash
curl -s -m 10 https://mooter.ai/ | grep -oE 'v0\.[0-9]+\.[0-9]+' | head -5
curl -s -m 10 https://mooter.ai/api/stats | head -200
curl -s -m 10 https://mooter.ai/onboarding | grep -E 'qwen|deepseek|gemma' | head -5
# /api/cli-token requires session — note in report whether it 302s or 401s
```

**Save evidence to:** `.planning/validation-2026-05-07/evidence/dim3-landing.html` (head -500 of homepage) + `dim3-stats.json`

**Acceptance:** version dynamic, stats endpoint reachable (even if data is sparse), no broken JS console errors that break critical sections (use `curl -I` to verify response, do not run a real browser unless Playwright is trivially available).

---

### Dimension 4 — Telemetry capture + silent validation

**What good looks like:**
- `decisions.log` events have ZERO PRIVACY violations (`prompt_text`, `prompt_raw`, `file_path`, `stack_trace` keys absent)
- `event-builder.js --self-test` returns 7/7 PASS
- Latest events on disk include `user_id_hash` if `~/.frugal/user.hash` exists
- `hub-events-scheduler.js --dry-run` reports a sane delta count (0 ≤ N ≤ 5000) and a clear threshold decision
- Sending a synthetic event via `wrangler d1 execute --remote --command="INSERT INTO frugal_events (...)"` round-trips correctly via the `mooter_events` VIEW

**Tests:**
```bash
node tools/router/event-builder.js --self-test
node tools/router/hub-events-scheduler.js --dry-run
# Privacy scan
tail -n 200 ~/.claude/tools/router/decisions.log | jq -r 'keys[]' | sort -u
# Should NEVER include: prompt_text, prompt_raw, file_path, stack_trace
```

**Save evidence to:** `.planning/validation-2026-05-07/evidence/dim4-telemetry.json` + `dim4-privacy-scan.txt`

**Acceptance:** zero privacy violations. Event-builder self-test 7/7. Scheduler dry-run sane.

---

### Dimension 5 — Statusline fidelity

**What good looks like:**
- `node tools/router/statusline-multi.js --demo green` renders a 🟢 line with savings + tier mix
- `--demo yellow` renders 🟡 with a clear reason (beast-overkill / zen-underkill / drift / low-savings)
- `--demo red` renders 🔴 with Anthropic-low or confidence-collapse copy
- `--demo empty` renders ⚪ "no data yet"
- Live render against current `decisions.log` produces a coherent line in < 100ms (`time` it)
- 33+ tests in `statusline-multi.test.js` all pass

**Tests:**
```bash
node tools/router/statusline-multi.js --demo green
node tools/router/statusline-multi.js --demo yellow
node tools/router/statusline-multi.js --demo red
node tools/router/statusline-multi.js --demo empty
time node tools/router/statusline-multi.js
node --test tools/router/statusline-multi.test.js | tail -10
```

**Save evidence to:** `.planning/validation-2026-05-07/evidence/dim5-statusline.txt` (capture the 4 demos + live render)

**Acceptance:** all 4 demos render with valid glyph + headline + proof. Live render < 100ms. Tests pass.

---

### Dimension 6 — GitHub onboarding + per-user tracking

**What good looks like:**
- `mooter.ai/onboarding` flow (3 steps) renders without errors and shows hardware probe + Ollama recommendations
- After fake login: `frugal-login.js` would persist `~/.frugal/auth.token` AND `~/.frugal/user.hash` (verify the code path, do not actually log in)
- Hub `/api/aggregate-stats` returns aggregate counts (instance count, tier distribution) over the new `frugal_events` table
- D1 query: `SELECT COUNT(DISTINCT instance_id) FROM frugal_events WHERE user_id_hash IS NOT NULL` returns ≥ 0 (probably 0 today; the schema must just accept the query without error)

**Tests:**
```bash
curl -s -m 10 https://mooter-hub.frugal-hub.workers.dev/api/aggregate-stats | head -50
# Inspect frugal-login.js for user_hash persistence path:
grep -n "user.hash\|USER_HASH" tools/router/frugal-login.js
# D1 user_id_hash readiness:
cd hub && wrangler d1 execute mooter-hub --remote \
  --command="SELECT COUNT(*) AS total, COUNT(user_id_hash) AS authenticated FROM frugal_events;"
```

**Save evidence to:** `.planning/validation-2026-05-07/evidence/dim6-onboarding.json`

**Acceptance:** OAuth flow code path complete (token + hash both saved), aggregate-stats endpoint reachable, D1 query for `user_id_hash` runs (column exists).

---

### Dimension 7 — Routing strategy soundness (Anthropic-grade)

**What good looks like:**
- Hybrid classifier (regex fast path + Haiku arbiter slow path) is documented and operational. Confirm `tools/router/classify.js` calls `arbiter.js` only when confidence < 0.75
- Cache hit rate on arbiter > 0% (sample from `decisions.log` recent 100 events: count `cached: true`)
- `confidence-calibrator.js` produces a sensible curve (Brier ≤ 0.25 if any oracle samples exist; "n/a" honestly if not)
- `drift-detector.js --check` returns `drift: false` OR drift verdict with severity
- `holdout-validator.js` (via `node backtest.js --holdout 0.2`) runs end-to-end and produces an accuracy figure (or honest "n/a" for sparse data)
- `gold-labels.json` exists and contains ≥ 100 entries
- `validation-set.test.js` (or equivalent in `tools/router/`) shows ≥ 85% accuracy

**Future-proofness probe sub-tests:**
- Add a new fake T0 model `qwen3:50b` to `gpu-probe.js` `T0_MODELS_KNOWN` (in-memory, do not commit). Run gpu-probe; verify it ranks correctly by VRAM
- Add a hypothetical model `claude-opus-5` to `pricing.js` `MODEL_PRICING` (in-memory). Verify `priceTurn('T3', ...)` falls back gracefully if model unknown
- Inspect `model-catalog.json`: does it list per-tier candidates so adding a new T0 local model is a one-line change?
- Search the codebase for hardcoded `'claude-opus-4-7'` / `'claude-sonnet-4-6'` / `'qwen2.5'` strings outside `model-catalog.json` and `pricing.js` — flag any that would break on model retirement

**Tests:**
```bash
node tools/router/confidence-calibrator.js --json | jq .brier_score
node tools/router/drift-detector.js --check
node tools/router/backtest.js --holdout 0.2 | tail -25
grep -rn "'claude-opus-4-7'\|\"claude-opus-4-7\"\|'qwen2\\.5'" tools/router/ \
  | grep -v "model-catalog.json\|pricing.js\|.test.js\|README\|CHANGELOG"
```

**Save evidence to:** `.planning/validation-2026-05-07/evidence/dim7-routing-strategy.json` + `dim7-future-proof.txt`

**Acceptance:** routing strategy implements at least 4 of: confidence calibration, drift detection, holdout validation, A/B framework readiness, oracle ground-truth, adversarial corpus, weighted-feedback boost. Future-proof check finds < 5 hardcoded model literals outside the registry files.

---

### Dimension 8 — Overall polish + impressiveness

**What good looks like:**
- `npm test` in `tools/router/` reports the known 26 failures (SYNC.md #39 — `update-router.test.js` pollution) and **zero new** failures
- `npx tsc --noEmit -p tools/router/` exits 0
- `git log --oneline origin/main` shows clean linear history with no merge commits
- README + CHANGELOG mention v0.10.x and Wave-1.5 / Wave-2 / Migration-009
- INFRA.md / SYNC.md reflect current state (mooter-hub Worker URL, D1 schema convergence)
- No leftover scratch / TODO / WIP markers in the 13 commits' diffs
- Privacy contract is reaffirmed in code (event-builder ALLOWED_FIELDS allow-list, hub schemas.refine privacy field rejection)

**Tests:**
```bash
cd tools/router && npx tsc --noEmit -p . ; echo "tsc exit=$?"
cd tools/router && npm test 2>&1 | grep -E "^# (tests|pass|fail|skipped)|ℹ tests|ℹ pass|ℹ fail" | tail -10
cd ../.. && git log --oneline origin/main | head -20
grep -E "TODO|FIXME|XXX|HACK" hub/migrations/009_converge_schema.sql tools/router/drift-detector.js tools/router/holdout-validator.js tools/router/confidence-calibrator.js
```

**Save evidence to:** `.planning/validation-2026-05-07/evidence/dim8-polish.txt`

**Acceptance:** tsc clean. Tests at baseline (26 fail, no new). No TODO markers in new files. Linear history.

---

## 3 · Future-proofness deep dive (mandatory)

This is the part that distinguishes "works today" from "ready for the next year". Spend ≥ 30% of your time here.

Answer in `.planning/validation-2026-05-07/findings/future-proofness.md`:

1. **New model arrival:** if Anthropic releases `claude-opus-5` next week, what files need touching? Count them. The number should be ≤ 3 (model-catalog.json, pricing.js, optionally classify.js for any name-specific guard). If > 5, the architecture has hardcode rot.
2. **New provider:** if a "Mistral Pro" subscription emerges, what's the path to integrate? Walk the surface: subscription detect → user-profile schema → router decision → statusline display. Identify the friction points.
3. **New local LLM:** if `qwen3:120b` (hypothetical) becomes the best T0 option, can `gpu-probe.js` rank and select it? Or is the T0 pool a closed list?
4. **Pricing changes:** Anthropic dropped Opus from $15/$75 to $5/$25 in 2026-04. Are tier-cost calculations in `pricing.js` driven by config or by hardcoded constants? How quickly can a future drop be reflected?
5. **Hub schema evolution:** can a future migration 010 add columns without another schema-drift incident? Document the migration apply procedure that should now be standard (`wrangler d1 migrations apply`, not raw `--file`).
6. **Privacy contract under new event types:** if Wave-3 adds a "long-running task" event type, does the ALLOWED_FIELDS allow-list need updating? Is the update path documented?
7. **Cost-quality Pareto:** the audit Wave-2 P1 added Brier scoring. Document where the dial is for the operator: "if you want lower cost accept lower confidence, here's how".
8. **Multi-user scale:** the migration adds `user_id_hash`. If 1000 users come on, will the per-user views (`user_profiles`) need GROUP BY rebuild? Or do they update via triggers? Identify the cron / batch step that's missing.

---

## 4 · Output contract

You must produce, at minimum:

```
.planning/validation-2026-05-07/
├── VALIDATION-REPORT.md          # main verdict, top of folder
├── findings/
│   ├── dim1-setup.md
│   ├── dim2-routing.md
│   ├── dim3-landing.md
│   ├── dim4-telemetry.md
│   ├── dim5-statusline.md
│   ├── dim6-onboarding.md
│   ├── dim7-routing-strategy.md
│   ├── dim8-polish.md
│   └── future-proofness.md       # the deep dive from §3
└── evidence/
    ├── dim*-*.{json,txt,html}    # raw outputs from your test commands
```

`VALIDATION-REPORT.md` structure:

```markdown
# Validation Report — 2026-05-07

**Verdict:** PASS | PASS-WITH-NOTES | FAIL
**Confidence:** high | medium | low
**Duration:** Xh Ym

## Verdict per dimension
| # | Dimension | Verdict | Critical findings |
|---|---|---|---|
| 1 | Setup detection | … | … |
| 2 | Routing economy | … | … |
| ... | ... | ... | ... |

## Top 3 strengths

## Top 3 risks (ranked by blast radius)
1. …
2. …
3. …

## Future-proofness assessment
- New Anthropic model: __ files to touch
- New provider: __ steps
- New local LLM: yes / no / partial
- Pricing change: __ minutes to apply
- (etc.)

## Recommendation
Ship to investor / hold for fix / etc.

## Hand-off to Paulo
- What to read first: VALIDATION-REPORT.md → findings/future-proofness.md → findings/dimX.md (lowest verdict)
- What to act on: ranked list of P0/P1/P2 follow-ups
```

---

## 5 · Constraints (READ TWICE)

**You may:**
- Read any file in the repo
- Run `node tools/router/*.js`, `npx tsc --noEmit`, `npm test`
- `curl` the live mooter.ai and mooter-hub Worker
- Run `wrangler d1 execute --remote --command="SELECT ..."` (read-only queries only)
- Spawn `Explore`, `model-reasoner`, `final-reviewer` subagents for deep dives
- Modify your own state in `.planning/validation-2026-05-07/`
- Refresh local drift baseline if needed (`drift-detector.js --refresh`)
- Run `node tools/router/event-builder.js --self-test`

**You must NOT:**
- Push to origin
- Deploy the worker (`wrangler deploy`)
- Run any migration (`--file=` against `--remote`)
- Modify any production state in D1 (no INSERT/UPDATE/DELETE/ALTER/DROP)
- Modify code in `tools/router/`, `hub/`, `landing/` (you are validating, not fixing)
- Touch `~/.claude/settings.json` or other global state
- Create a new git branch or rewrite history
- Delete the smoke test row (already cleaned up)
- Replace `~/.frugal/user.hash` (the user's real authenticated identity)

If you find a P0 issue, **stop and report**. Do not fix.

---

## 6 · Tooling cheat sheet

```bash
# Router state
node tools/router/user-profile.js --json | head -50
node tools/router/gpu-probe.js
node tools/router/check-local-models.js
cat ~/.claude/tools/router/subscription-profile.json | head -30
cat ~/.claude/tools/router/hw-capability.json | head -20

# Routing decision
node tools/router/classify.js "<prompt>"

# Health
node tools/router/event-builder.js --self-test
node tools/router/drift-detector.js --check
node tools/router/confidence-calibrator.js --json
node tools/router/backtest.js --holdout 0.2

# Statusline
node tools/router/statusline-multi.js --demo green
node tools/router/statusline-multi.js --demo yellow
node tools/router/statusline-multi.js --demo red
node tools/router/statusline-multi.js --demo empty
time node tools/router/statusline-multi.js

# Tests + types
cd tools/router && npx tsc --noEmit -p . ; echo "tsc exit=$?"
cd tools/router && npm test 2>&1 | tail -15

# Live hub
curl -s https://mooter-hub.frugal-hub.workers.dev/api/version
curl -s https://mooter-hub.frugal-hub.workers.dev/api/aggregate-stats | head -50
curl -s https://mooter-hub.frugal-hub.workers.dev/api/stats | head -50

# D1 (READ-ONLY)
cd hub
wrangler d1 execute mooter-hub --remote --command="SELECT type,name FROM sqlite_master WHERE type IN ('table','view');"
wrangler d1 execute mooter-hub --remote --command="SELECT COUNT(*) FROM pragma_table_info('frugal_events');"
wrangler d1 execute mooter-hub --remote --command="SELECT COUNT(*) AS total, COUNT(user_id_hash) AS authenticated FROM device_heartbeats;"

# Live landing
curl -sI https://mooter.ai/
curl -s https://mooter.ai/ | grep -oE 'v0\\.[0-9]+\\.[0-9]+'
curl -s https://mooter.ai/api/stats
```

---

## 7 · Doctrines applicable

These project rules govern your behaviour even though you are validating, not building:

- `~/.claude/CLAUDE.md` (personal doctrine — routing tiers, cost discipline)
- `frugal/CLAUDE.md` (project doctrine — same body + Notion protocol)
- `frugal/.claude/rules/router-logic.md` (classify.js conventions, mode schema)
- `frugal/.claude/rules/migration-safety.md` (you don't run migrations, but understand the contract)
- `frugal/.claude/rules/api-conventions.md` (routes you might inspect)
- `frugal/.claude/rules/test-conventions.md` (test gates you'll run)

---

## 8 · End-of-validation ritual (mandatory)

When the report is written:

1. **Commit** your `.planning/validation-2026-05-07/` artifacts (NOT push):
   ```bash
   git add .planning/validation-2026-05-07/
   git commit -m "validate(2026-05-07): E2E production validation post Wave-1.5 + 009

   Verdict: <PASS|PASS-WITH-NOTES|FAIL>
   Per-dimension: 1=__ 2=__ 3=__ 4=__ 5=__ 6=__ 7=__ 8=__
   Future-proofness: <high|medium|low>
   <one-line headline finding>"
   ```
2. **Update SYNC.md** under `📥 COWORK → CLAUDE CODE` with: verdict + headline + path to VALIDATION-REPORT.md
3. **Notion**: post a sub-page under HQ `33d6f6e4-2bc4-816b-977a-fe84bbe912c9` titled `🔍 Validation 2026-05-07 — <verdict headline>`. Include the verdict table + top-3 risks + recommendation. If the Notion MCP is unavailable, write a TODO at the bottom of VALIDATION-REPORT.md.
4. **Hand back to Paulo** with: a 5-line summary in chat, the path to VALIDATION-REPORT.md, and a single concrete next-action recommendation.

---

## 9 · Time budget

- Bootstrap reading: 4 minutes
- Dimensions 1–6 (parallelizable): 25 minutes
- Dimension 7 (routing strategy): 15 minutes
- Dimension 8 (polish + tests): 10 minutes
- Future-proofness deep dive: 25 minutes
- Synthesis + report writing: 15 minutes
- End-of-validation ritual: 5 minutes

**Total target:** ~100 minutes. If you exceed 3 hours, stop and report your partial findings.

---

## 10 · The single most important thing

Mooter.ai's value proposition is *"the most efficient prompt routing in the world, automatically, without the user thinking about it."* Your job is to validate that this claim survives contact with reality:

- The router picks the cheapest viable tier
- The user gets the best of what they already paid for (subscriptions)
- The statusline tells the truth about what just happened
- Savings are measurable and honest
- The system gracefully welcomes new models / providers / pricing
- Privacy is non-negotiable

If any of those is fiction in production today, you must say so. With evidence.

---

**End of master prompt. Start by reading `.planning/wave-1.5/WAVE-1.5-VERDICT.md` then `SYNC.md`.**
