# Wave 11 — Warm-Intro Readiness Master Prompt

> **Goal**: ship Mooter **v1.6-warm-intro-ready** — every step from "Paulo tells a friend"
> to "friend sends `mooter feedback`" works end-to-end on a fresh machine, and Anthropic
> rubric scores ≥4/5 on every dimension.
>
> **Scope** (Paulo decision 2026-06-02): **Balanced** — audit + critical + important fixes.
> Polish/nice-to-have → Wave 12. Adapter Forge stays out (Wave 5 separate). Anthropic
> rubric target 4/5 minimum, 5/5 stretch.
>
> **VM/Docker testing**: CC bash sandbox (Linux node:20 fresh Docker) — covers ~70%.
> Paulo validates Windows native install in parallel; Mac stays as a validation-week
> finding.
>
> **Estimate**: 8-12h CC, ship in 3-4 days. Three Paulo gate approvals.
>
> **Honesty discipline (CLAUDE.md non-negotiables)**:
> - `classify.js` byte-identical (P11) — sha256 lockfile gate active
> - No invented features (Adapter Forge teaser stays a teaser; do not ship half-done)
> - No hyperbole in copy ("revolutionary", "game-changing", "10x", "Same results")
> - No PII in telemetry/feedback (anonymous HMAC user_id_hash)
> - No `--no-verify` · No `git add -A` · No direct merges to main without Paulo OK
> - Auto-merge ONLY for dev (never main)

---

## 0. Context (read first)

Active state (verified 2026-06-02):
- Prod `mooter.ai` at **v1.5.1-signin-fix** (PR #57 merge commit `f8883db`)
- Hub CF Worker rate-limits F-1 live (Wave 10 Phase C.1)
- Wave 10 Phase A (statusline Variant C + workflow) + B (telemetry pipeline + UX) + C.1 (rate-limits + CI gates) — all in prod
- Sign-in CTA fix v1.5.1 verified live (0 `/auth/sign-in` refs, 3 → `/dashboard`)
- `VALIDATION_OUTREACH_KIT.md` ready (10 sections, 3 personas)
- Migrations 006/007/008 applied

What is NOT in prod yet (out of scope for Wave 11):
- Adapter Forge (Wave 5 — stays teaser on `/under-the-hood`)
- Per-IP rate-limit via KV (F-1.2 backlog)
- C.1.2 strict-tsc cleanup (~28 findings)
- Wave 4 Phase D hub backend expansion

Companion docs to read before starting:
- `docs/strategy/STRATEGY.md` (V4 canonical)
- `docs/strategy/VALIDATION_OUTREACH_KIT.md` (downstream consumer of this wave)
- `docs/strategy/WAVE10_PHASE_B_BACKLOG.md` (parent context)
- `docs/strategy/WAVE10_PHASE_B2B_FINDINGS.md` (signed-in audit findings already shipped)
- `~/.claude/docs/ROUTING_POLICY.md` (router internals)

---

## 1. The 7 dimensions Wave 11 must cover

Each dimension has: **Recon → Test → Findings → Fix (PR gated) → Verify live**.

### Dimension 1 — Friend-to-site message landing

**The "5-second test"**: a vibe coder lands on `mooter.ai` after Paulo mentions it in a DM. Within 5 seconds they should answer "What does this do?" correctly.

**Hero baseline (verified 2026-06-02 by Cowork)**:
- H1: `GotMoo?` · Tagline: `The AI shepherd for your Claude Code`
- Sub: factual, 90% claim · 3 trust badges (`Hook, not a proxy` / `Runs locally` / `<50ms overhead`)
- Statusline mock: convincing
- CTAs: `Install mooter →` and `Sign in with GitHub`

**Findings to audit**:

| # | Finding | Severity |
|---|---|---|
| D1-1 | `Up to 90% less cost` + `Same results` — bold claims. Wave1 benchmark is N=34 prompts, $0.022/$0.028/$0.034. Verify there is a citation/disclaimer within 1 scroll of the claim. Lean toward "Up to 90% on T0-heavy sessions · comparable for routine tasks" if no disclaimer | 🟠 important |
| D1-2 | `GotMoo?` brand voice — confirm Paulo wants this for Anthropic showcase audience. Do NOT change without Paulo sign-off. Document the trade-off in the audit report | 🟡 polish (no-op default) |
| D1-3 | Above-the-fold load weight — measure with Chrome MCP `performance.timing` or Lighthouse-equivalent. Target LCP < 2.5s, CLS < 0.1 | 🟠 important |
| D1-4 | Cross-browser sanity: hero renders in Chrome + Firefox + Safari + Edge equivalents — CC tests in headless Chrome only, document the limit | 🟡 polish |
| D1-5 | Hero in narrow viewport (380px mobile) — confirm `@media ≤480px` fix from Wave 10 Phase B.2c still holds | 🟠 important |

**Recon command**:
```bash
# Verify current hero copy + cite check
grep -n "90%\|Same results\|GotMoo\|shepherd" landing/app/page.tsx landing/components/*.tsx
# Find disclaimer/citation
grep -rn "wave1-benchmark\|illustrative\|N=34\|N=" landing/app/ landing/components/
```

**Test (CC via Chrome MCP or jsdom)**:
- Render `mooter.ai` headless, check: visible H1, sub-tagline, 3 badges, 2 CTAs, statusline mock
- Mobile 380px viewport: verify `.hero-h1` clamp does not overflow, CTAs stack
- Measure `performance.now()` for first contentful paint approximate

**Fix policy**:
- D1-1 → ONLY if no disclaimer found within 200px of claim: change copy to "Up to 90% on T0-heavy sessions · comparable for routine tasks". OR add `*` link to `/methodology` near the claim.
- D1-2 → DO NOT change. Document.
- D1-3 → Fix if LCP > 3.5s (worse than 2.5s target by 40%). Else log + Wave 12.
- D1-5 → Fix if `.hero-h1` overflow at 380px viewport. Else log.

**Test add**: +1 source-level test asserting hero H1 + tagline + 3 badges + 2 CTAs render.

---

### Dimension 2 — Login flow (OAuth GitHub)

**Critical risk**: real fresh GitHub user lands on `/dashboard`, clicks "Continue with GitHub", reaches Mooter signed-in dashboard. **NEVER tested fresh E2E this wave.**

**What is wired (verified Cowork 2026-06-02)**:
- `/dashboard` shows LoginHero with "Continue with GitHub" CTA when anon
- Middleware comment: "brand-new visitors land on LoginHero"
- Supabase Auth + GitHub OAuth provider (per memory)

**Findings to audit**:

| # | Finding | Severity |
|---|---|---|
| D2-1 | `signInWithGitHub()` Supabase call — verify provider config in Supabase project (env `NEXT_PUBLIC_SUPABASE_URL` + GitHub OAuth app credentials in Supabase dashboard) | 🔴 blocker |
| D2-2 | Redirect URL whitelist in GitHub OAuth app — must include `https://mooter.ai/auth/callback` AND `https://preview.mooter.ai/auth/callback` | 🔴 blocker |
| D2-3 | `/auth/callback` route handler — verify exchange code → session → redirect to `/onboarding` (new user) or `/dashboard` (existing user) | 🔴 blocker |
| D2-4 | Error states: GitHub OAuth denial, network error, missing scopes — user gets meaningful copy, not a generic 500 | 🟠 important |
| D2-5 | First-time vs returning user routing logic — new user → `/onboarding`, returning → `/dashboard` (or `/dashboard/devices` if no setup yet) | 🟠 important |
| D2-6 | Magic-link fallback if mentioned anywhere — confirm it works or remove from copy if not implemented | 🟠 important |
| D2-7 | Session persistence across browser restart — Supabase auth cookies should be httpOnly + secure + sameSite=lax | 🟡 polish |

**Recon command**:
```bash
grep -rn "signInWithGitHub\|signInWithOAuth\|getSession\|exchangeCodeForSession" landing/app/ landing/components/ landing/lib/
ls -la landing/app/auth/ landing/app/api/auth/ 2>/dev/null
grep -rn "redirectTo\|callback\|onboarding" landing/app/auth/ landing/middleware.ts 2>/dev/null
```

**Test (CC bash sandbox)**:
- `curl https://mooter.ai/dashboard -I` → expect 200, no redirect (anon-friendly)
- `curl https://mooter.ai/auth/callback -I` → expect 200/302 with logical handling (not 404)
- `curl https://mooter.ai/api/auth/session -I` → expect 200 or 401

**Paulo test (required, blocking)**:
Paulo opens Chrome Incognito with a **throwaway GitHub account** (or his real one if no signed-in session conflict on the Mooter side), goes through:
1. mooter.ai → click hero "Sign in with GitHub"
2. lands `/dashboard` LoginHero
3. clicks "Continue with GitHub"
4. GitHub OAuth consent screen
5. lands back on mooter.ai (where?)
6. Report: URL, screenshot of where they ended up, any error

CC waits for Paulo's incognito test result before declaring D2 done.

**Fix policy**:
- D2-1/D2-2/D2-3 → blockers. If anything fails, Wave 11 stops here for fix. PR gated, final-reviewer.
- D2-4 → improve error copy if any state shows generic 500
- D2-5 → ensure routing matches spec
- D2-6 → if magic-link is referenced in `VALIDATION_OUTREACH_KIT.md` (it is — §4 onboarding follow-up: "Sign in (GitHub or magic link)") — either implement or REMOVE from kit (Cowork updates kit)
- D2-7 → log only

**Test add**: +1 integration test asserting `/auth/callback` handles code exchange (mockable Supabase client).

---

### Dimension 3 — Wizard mapping setup (`/onboarding`)

**Baseline (verified Cowork 2026-06-02)**:
- Step 1/3: hardware detect (RTX 4090 detected correctly, OS + CPU + GPU + RAM)
- 7 hardware options + "Pick manually" CTA
- Step 2: AI providers (Anthropic, OpenAI, Gemini, etc.)
- Step 3: subscription mapping

**Findings to audit**:

| # | Finding | Severity |
|---|---|---|
| D3-1 | Step 1 → Step 2 → Step 3 navigation works without bugs (back button preserves state, forward validates) | 🔴 blocker |
| D3-2 | Hardware detection accuracy: WebGL ANGLE parse + RAM estimation + CPU cores — verify on non-NVIDIA machines (Intel iGPU, AMD GPU, M-series unified) | 🟠 important |
| D3-3 | Provider toggles persist to `profiles.has_anthropic_key/has_openai_key/has_gemini_key` (Supabase) — verify all combinations save | 🔴 blocker |
| D3-4 | Persona selection (vibe-coder, professional, etc.) saves to `profiles.persona`. "Other" preserved literally (F-3 from B.2b — confirm still active) | 🟠 important |
| D3-5 | After Step 3, generates personalized install token URL `/i/<token>` — verify token created in `install_tokens` table (migration 006), single-use, 24h TTL | 🔴 blocker |
| D3-6 | Install URL preview shows `curl https://mooter.ai/i/<token> \| bash` AND offers "inspect first: `curl … \| less`" disclaimer | 🟠 important |
| D3-7 | If user signs in mid-flow (anon → authed) — wizard state preserved, not reset | 🟠 important |
| D3-8 | If user closes browser and returns — flow continues OR offers explicit "start over" | 🟡 polish |

**Recon command**:
```bash
grep -rn "OnboardingStep\|wizardStep\|onboarding/_lib\|install_tokens" landing/app/onboarding/ landing/lib/ landing/supabase/migrations/006*
ls landing/app/onboarding/_lib/
grep -rn "createInstallToken\|api/install-token\|rpc.*install_token" landing/
```

**Test (CC bash sandbox)**:
- Use Supabase CLI (if available locally) to query `install_tokens` schema + verify constraints
- Curl `mooter.ai/onboarding` → check 200
- Curl `mooter.ai/api/install-token` (if endpoint exists) with mock auth → verify token creation path

**Paulo test (required after D2)**:
Continuing the same incognito session from D2, complete wizard Step 1/2/3 and report: token URL output, any error, time taken.

**Fix policy**:
- D3-1/D3-3/D3-5 → blockers if any fails
- D3-2 → if non-RTX hardware mis-detects, add fallback "Pick manually" prominent
- D3-4 → verify F-3 fix from B.2b still active (memory says yes)
- D3-6 → must have inspect-first text within 100px of the curl command
- D3-7 → mid-flow auth flip should not blank the form
- D3-8 → log only, fix Wave 12 if not present

**Test add**: +3 integration tests covering full wizard happy path + 1 error path (no GPU detected) + 1 hardware persistence.

---

### Dimension 4 — Install one-liner (fresh VM/Docker)

**CRITICAL**: not E2E-tested for any Wave 8+ deployment. Single highest-risk dimension.

**What should happen**:
1. User runs `curl https://mooter.ai/i/<token> | bash`
2. Script downloads Mooter CLI (legacy `tools/cli` + v1 bundle `~/.mooter/cli-v1`)
3. Script writes `~/.claude/settings.json` for hook (or modifies existing)
4. Script writes/installs the 6 subagents into `~/.claude/agents/` (CRITICAL — see below)
5. Script verifies Claude Code installation (`which claude` → exists)
6. Script optionally pulls Ollama model if Ollama detected (`ollama list` → install qwen2.5-coder:7b if absent)
7. User runs `mooter init` → confirms hardware + paste API keys
8. User runs `claude` → statusline appears (sparkline + savings + local %)

**The subagents gap (D4-CRITICAL)**:

The 6 subagents (`model-architect`, `model-reasoner`, `cheap-triage`, `local-summarizer`, `local-transformer`, `final-reviewer`) live in `~/.claude/agents/` on Paulo's machine. **Verify**: do they get deployed by `install.sh`? Likely **no** (they were curated manually).

**Without subagents shipped, friend's experience**:
- statusline works ✓
- classify.js routes prompts ✓
- BUT the "dynamic workflow" magic (Cowork spawning model-reasoner for bug hunts, cheap-triage for commit msgs, local-summarizer for file reads) does NOT happen
- Friend never experiences "70% local · 90% saved" because they only get the routing tier, not the agent-level delegation

**This is the single largest "wow factor" gap.**

**Findings to audit**:

| # | Finding | Severity |
|---|---|---|
| D4-1 | `install.sh` recon: what does it actually do today? Read top-to-bottom + map every action | 🔴 blocker (knowledge gap) |
| D4-2 | install.sh in Docker `node:20` fresh — does it complete without errors? | 🔴 blocker |
| D4-3 | After install in Docker, does `mooter --version` work? `mooter init` work? `mooter feedback "test"` work? | 🔴 blocker |
| D4-4 | After install, are the 6 subagents in `~/.claude/agents/`? If no, this is the wow-factor gap. **Decision needed**: bundle subagents in install.sh (Option A) OR document setup in `mooter init` (Option B) OR ship without (Option C, lose wow) | 🔴 **Paulo gate decision** |
| D4-5 | Ollama detection + auto-pull a starter model — does install.sh do this? If no, friend without Ollama gets 0% local (no wow factor). **Decision needed**: opt-in pull (Option A) vs document and skip (Option B) | 🔴 **Paulo gate decision** |
| D4-6 | install.sh error states: no Claude Code found, no curl/bash, no write permission to `~/.claude/`, network failure — graceful exit with actionable message? | 🟠 important |
| D4-7 | install.sh idempotency — running twice should not break existing setup | 🟠 important |
| D4-8 | Uninstall path — `mooter uninstall` should remove cleanly. Verify it exists and works | 🟠 important |
| D4-9 | install.sh + `~/.claude/settings.json` merge logic — must preserve existing user hooks/agents, not overwrite blindly | 🔴 blocker if overwrite-only |

**Recon command**:
```bash
cat install.sh 2>/dev/null | head -200
find . -name "install.sh" -not -path "./node_modules/*" -not -path "./.git/*" 2>/dev/null
ls -la ~/.claude/agents/ 2>/dev/null
cat ~/.claude/agents/*.md 2>/dev/null | head -100
```

**Test (CC bash sandbox — KEY VALUE OF THIS WAVE)**:
```bash
# Fresh Docker test
docker run --rm -it node:20 bash -c '
  apt-get update && apt-get install -y curl
  # Simulate getting a token from Paulo's account or use a recon-mode endpoint
  curl -sSL https://mooter.ai/install.sh | bash -s -- --dry-run  # If dry-run exists
  # OR with a test token
  # curl -sSL https://mooter.ai/i/<test_token> | bash
  which mooter
  mooter --version
  ls ~/.claude/ ~/.mooter/
  mooter init --noninteractive --hardware=cloud 2>&1 || true
'
```

**Decisions Paulo needs to make BEFORE D4 fix**:
- D4-4 subagents in install.sh: A (bundle), B (document), C (skip). **Recommendation: A** if subagents are <500KB total and stable; else B.
- D4-5 Ollama auto-pull: A (opt-in prompt), B (skip + document). **Recommendation: A** with `Y/n` prompt.

**Fix policy**:
- D4-1/D4-2/D4-3 → must pass before any other Wave 11 work merges. If install.sh broken in Docker, Wave 11 stops.
- D4-4 → execute Paulo's decision. If A, bundle 6 subagents .md files into install.sh
- D4-5 → execute Paulo's decision. If A, opt-in prompt + handle `Y/n`/timeout default to skip
- D4-6 → improve any generic error to actionable
- D4-7 → idempotency guard
- D4-8 → verify uninstall, fix if broken
- D4-9 → use merge logic (jq-based or similar) not overwrite

**Test add**: +1 Docker-based smoke test script (`scripts/test-install-docker.sh`) committed to repo. Runs in CI ideally.

---

### Dimension 5 — Telemetry + `mooter feedback`

**Critical path for validation**: friend installs, uses for a week, runs `mooter feedback "the renames are too aggressive"`. Paulo sees it in `/admin/feedback`. If broken, validation Week 1 is dead.

**What is wired (per memory + Wave 10 Phase B.1a)**:
- Hub `/api/delta` accepts phone-home with rate-limit (profile_hash 30/60s)
- Hub `/api/device-heartbeat` accepts heartbeat (device_id 10/60s)
- Hub `/submit-events` accepts mooter_events
- `mooter feedback "<text>"` CLI command exists (per `packages/cli/`)
- `/api/feedback` landing endpoint
- `/admin/feedback` admin dashboard (RBAC via `ADMIN_EMAILS`)
- Anonymous user_id_hash (HMAC)

**Findings to audit**:

| # | Finding | Severity |
|---|---|---|
| D5-1 | `mooter feedback "test"` from a fresh Docker install — does it POST to `/api/feedback` successfully? What's the response? | 🔴 blocker |
| D5-2 | Does the feedback appear in `/admin/feedback` for Paulo? Verify `ADMIN_EMAILS` env var in Vercel project | 🔴 blocker |
| D5-3 | Privacy: confirm zero PII transmitted. Cleartext payload audit: prompt text NOT auto-sent (only what user types in feedback string). user_id_hash is HMAC, not reversible | 🔴 blocker |
| D5-4 | Phone-home `/api/delta` — does the CLI actually call this on regular use? When? How often? | 🟠 important |
| D5-5 | Heartbeat `/api/device-heartbeat` — same questions | 🟠 important |
| D5-6 | Rate-limit 429 response: does the CLI handle gracefully (retry-after, exponential backoff, silent fail)? | 🟠 important |
| D5-7 | Opt-out for users who don't want any telemetry — does it exist? Document or implement (env var `MOOTER_TELEMETRY=off` or similar) | 🟠 important |
| D5-8 | Feedback topic categorization (bug/feature/general) per kit §6 — does the CLI prompt for topic? | 🟡 polish |

**Recon command**:
```bash
grep -rn "feedback\|submitFeedback\|/api/feedback" packages/cli/ tools/cli/ landing/app/api/feedback/
grep -rn "ADMIN_EMAILS\|isAdminEmail" landing/app/admin/ landing/lib/
grep -rn "MOOTER_TELEMETRY\|telemetry_off\|opt[-_]out" packages/cli/ tools/cli/
grep -rn "/api/delta\|/api/device-heartbeat" packages/cli/ tools/cli/ landing/
```

**Test (CC bash sandbox)**:
```bash
# After install in Docker:
mooter feedback "Wave 11 test - delete me"
# Then Paulo queries /admin/feedback (or CC queries Supabase MCP directly)
```

**Test (CC Supabase MCP)**:
- Query `feedback` table (migration 008) → confirm test message arrived
- Verify columns: no email, only user_id_hash + content + topic + created_at

**Paulo gate**:
After D5 fix, Paulo confirms `ADMIN_EMAILS` includes his email in Vercel env vars (~30s task).

**Fix policy**:
- D5-1/D5-2/D5-3 → blockers
- D5-4/D5-5 → document if no opt-out → must implement opt-out before Paulo sends invites
- D5-6 → silent retry with backoff
- D5-7 → must exist. `MOOTER_TELEMETRY=off` env var read by CLI, all `/api/*` POSTs gated
- D5-8 → log only

**Test add**: +2 tests — `mooter feedback` → /api/feedback → DB row; telemetry opt-out gates all POSTs.

---

### Dimension 6 — "Vai ajudar muito" impression (30-min user test)

**This is the SUBJECTIVE dimension. CC cannot fully test this. Document scoring framework instead.**

**The implicit promise of the landing page**: install Mooter, use Claude Code normally for 30 min, walk away thinking "this saved me real money and I want to keep it".

**What "wow factor" looks like (target)**:
1. Statusline appears immediately after first prompt — user sees `mooter saved $0.00 (0%) · T2 sonnet 0.X · ▁▁▁▁▁▁▁▁▁▁ last 10` and immediately understands the tier-mix visual
2. Within 5 prompts, sparkline has at least 1 `▁` (T0 local) bar — wow moment if Ollama is set up
3. Within 30 min, `mooter trail` shows non-zero savings
4. Session digest at end (Stop hook) shows tier-mix + `Heavy lifting done locally:` list — the "auto-demo" moment
5. Dashboard `/dashboard` (after sign-in) shows real data with `Live · 1 device` badge

**What kills wow**:
- 0% local entire session (no Ollama) → statusline shows cloud-only
- Statusline absent (hook not wired) → user doesn't know Mooter is working
- No session digest at end → user doesn't see the "summary"
- Dashboard shows "Demo data" badge → reduces credibility

**Findings to audit**:

| # | Finding | Severity |
|---|---|---|
| D6-1 | First-prompt statusline appearance — verify hook fires + sparkline shows tier on prompt 1 (not after 10) | 🟠 important |
| D6-2 | Stop hook digest reliably renders at session end — test in Docker with mock Claude Code session | 🟠 important |
| D6-3 | `mooter trail` command output — verify shows cumulative savings, tier mix, sparkline history | 🟠 important |
| D6-4 | "Live · N devices" badge swap from Demo — verify hub `/aggregate-stats` returns ≥1 device count after install | 🟠 important |
| D6-5 | Onboarding-to-first-statusline TIME — measure from "curl install" → "first claude prompt with statusline" — target ≤10 min | 🟠 important |
| D6-6 | Wow-killer fallbacks: if no Ollama detected, what does first session feel like? Should be honest "100% cloud · setup Ollama for local savings" rather than ambiguous | 🟠 important |

**Recon command**:
```bash
grep -rn "Stop\b.*hook\|stop_hook\|sessionDigest" tools/router/ packages/cli/
grep -rn "fetchHubAggregates\|aggregate-stats" landing/lib/ hub/
```

**Test**:
- CC in Docker, after install + simulate 5 Claude Code prompts (using `mock_claude.sh` or similar)
- Verify statusline output appears
- Verify Stop hook digest renders

**Scoring framework (for Paulo's 5 testers — adds to kit §6)**:
Rate each of these 1-5 in the validation survey:
- Sparkline made sense within first 3 prompts
- I felt savings were real (not artificial)
- Session digest at end was useful
- Local % showed up meaningfully (≥30% by day 3)
- Dashboard told me something I didn't already know from statusline

**Fix policy**:
- D6-1/D6-2/D6-3 → important, fix if broken
- D6-4 → can only test post-install, deferred to first tester
- D6-5 → measure + log + optimize if >15 min
- D6-6 → must implement honest "0% local · no Ollama detected" copy

**Test add**: +1 integration test for Stop hook digest output structure.

**Kit update (Cowork)**: append the 5 new rating questions to `VALIDATION_OUTREACH_KIT.md` §7.

---

### Dimension 7 — Anthropic showcase rubric (5/5 target)

**Definition**: 5 objective criteria, scored 0-5 each, by an independent reviewer who has not built Mooter.

**The Rubric** (Wave 11 must score ≥4 on each, aim 5):

| Criterion | What 0 looks like | What 5 looks like | Where to check |
|---|---|---|---|
| **Privacy & data discipline** | Prompts shipped to vendor, no opt-out, vague policy | Anonymous hashes, opt-out env var, audit-ready policy linked from footer, NO prompt text transmitted by default | `/privacy`, telemetry code, hub schema |
| **Honesty in claims** | "10x faster", "Same results", unsupported %s | Every quant claim has citation/link, ranges with confidence (e.g. "up to 90% on T0-heavy sessions, ~30-50% mixed"), benchmark public + reproducible | hero copy, `/methodology`, `wave1-benchmark/README.md` |
| **Technical depth** | Marketing-speak, no architecture explanation | `/under-the-hood` explains Q4_K_M quantization, LoRA r=32, classify.js regex+arbiter, hook lifecycle, with diagrams | `/under-the-hood`, code comments |
| **Build-with-Claude credentials** | Claude/Anthropic logo missing or buried | Anthropic + Claude prominently credited, "Made with Claude Code" badge, Anthropic API docs cited where used | hero, footer, `/about` if exists |
| **Value prop clarity** | "Save money" vague | Specific persona ("vibe coder on Max plan"), specific savings range ("up to $30/mo on a $200 Opus burn"), specific tasks ("renames, commits, explain — local; debug, refactor — cloud") | hero, `/compare`, `/methodology` |

**Recon command**:
```bash
# Check privacy policy + data handling
ls landing/app/privacy/ 2>/dev/null
grep -rn "anonymous\|user_id_hash\|no.*prompt.*text" landing/app/privacy/
# Check honesty
grep -rn "90%\|10x\|Same results\|saved" landing/app/page.tsx landing/components/Hero* | head -10
# Check technical depth
ls landing/app/under-the-hood/
# Check Anthropic credentials
grep -rn "Anthropic\|Claude Code\|built with claude" landing/app/ landing/components/footer*
```

**Test (CC)**:
For each of 5 criteria, generate a 1-paragraph evaluation citing specific page+line evidence. Rate 0-5. Total target ≥20/25.

**Paulo gate**:
After CC scoring, Paulo reviews rubric scoring. Disputes any scores. Approve final.

**Fix policy**:
For each criterion scoring <4:
- Identify 1-3 specific fixes that would bump to 5
- Add to fix wave OR scope to Wave 12

**Output**: `docs/strategy/ANTHROPIC_SHOWCASE_RUBRIC_V1.md` committed to repo. Re-runnable for any future revision.

---

## 2. Sequence (3-4 days)

### Day 1 (Recon + Tests, no code changes)

1. **Phase 0** — Read context (1h): STRATEGY.md, VALIDATION_OUTREACH_KIT.md, this kickoff
2. **Phase 1.recon** — Dimension 1 recon + audit (1.5h)
3. **Phase 2.recon** — Dimension 2 recon (1h)
4. **Phase 3.recon** — Dimension 3 recon (1h)
5. **Phase 4.test** — Dimension 4 Docker install test (2h) — **THIS IS THE BIG ONE**

End-of-Day-1 deliverable: `WAVE11_DAY1_FINDINGS.md` with categorized findings + Paulo gate.

**Paulo Gate A**: review findings + approve fix priorities (especially D4-4 subagents bundle decision, D4-5 Ollama auto-pull decision).

### Day 2 (Fixes — critical + important from Day 1)

Each fix as a separate PR squash→dev:
- PR-A: Hero copy/citation fix (if D1-1 critical) — landing-only
- PR-B: OAuth callback hardening (if D2-3 issues) — landing-only
- PR-C: Install script Docker-tested fixes + subagent bundle (D4-2/D4-3/D4-4) — install.sh + agents/
- PR-D: Telemetry opt-out + admin email confirm (D5-7) — CLI + landing

End-of-Day-2 deliverable: 4 PRs squash→dev, all with tests + final-reviewer APPROVE. Tag `v1.6.0-rc1-warm-intro-dev`.

**Paulo Gate B**: review the 4 PRs (or sample 2 if many). Authorize promote dev→main.

### Day 3 (Promote + verify live + remaining dimensions)

- Cowork merges PR dev→main (`v1.6.0-warm-intro-ready`)
- Cowork verifies Vercel deploy + hub redeploy (if hub touched, which it shouldn't be)
- CC re-runs D4 Docker install test against prod `mooter.ai/install.sh` (not dev)
- CC finishes Dimension 5/6/7 fixes — separate small PRs if needed
- CC generates `ANTHROPIC_SHOWCASE_RUBRIC_V1.md` with scoring

End-of-Day-3 deliverable: prod is `v1.6.0`, rubric scored. **Paulo Gate C**: review rubric, sign off "warm intro ready" OR list remaining blockers.

### Day 4 (Final Paulo tests + closure)

- Paulo does incognito real test (5-10 min):
  1. Incognito Chrome → mooter.ai
  2. Click hero "Sign in with GitHub" → Continue with GitHub → throwaway GitHub OAuth
  3. Land back at Mooter (where?)
  4. Complete wizard Step 1/2/3
  5. Get install token URL
  6. Run `curl <token> | bash` in a sacrificial VM/Docker
  7. Run `mooter init`
  8. Open `claude` → see statusline on first prompt
  9. Run `mooter feedback "Wave 11 smoke test"`
  10. Check `/admin/feedback` shows it
- Paulo reports results. Cowork updates SYNC + memory + Notion.
- **Final sign-off**: v1.6 warm-intro ready OR list of remaining gaps.

---

## 3. Anti-patterns (do NOT do)

- **DO NOT** ship Adapter Forge or any pack-creation tooling. Tease stays a tease.
- **DO NOT** touch `classify.js` content (P11 byte-identical lockfile active).
- **DO NOT** change `GotMoo?` brand voice without Paulo approval.
- **DO NOT** invent benchmark numbers. Wave1 was N=34 prompts, $0.022/$0.028/$0.034. Anything else needs citation.
- **DO NOT** make claims like "Same results", "10x", "revolutionary", "game-changing" in copy. Use "comparable for routine tasks", "up to X%", concrete numbers.
- **DO NOT** add features. Wave 11 is hardening, not expansion.
- **DO NOT** auto-merge to main. Paulo Gate B required for promote.
- **DO NOT** ship if Docker install test fails. That blocks the entire wave.
- **DO NOT** `git add -A`. Selective commits only.
- **DO NOT** transmit prompt text in telemetry by default. Feedback string is opt-in user-typed text only.

---

## 4. Definition of done

Wave 11 is done when **all of these are true**:

1. ✅ Fresh Docker install completes without error
2. ✅ `mooter feedback "X"` from fresh install reaches `/admin/feedback` for Paulo
3. ✅ Paulo's own incognito OAuth + wizard + install + first prompt + feedback flow PASSES (Day 4 test)
4. ✅ Anthropic rubric ≥4/5 on each of 5 criteria, ≥20/25 total
5. ✅ No copy claim without citation/disclaimer
6. ✅ `MOOTER_TELEMETRY=off` opt-out works (verified)
7. ✅ Subagents either bundled in install OR documented explicitly (per Paulo's D4-4 decision)
8. ✅ Ollama auto-pull either opt-in implemented OR documented (per D4-5)
9. ✅ Statusline + Stop hook digest + `mooter trail` all functional in fresh install
10. ✅ Vercel landing prod at `v1.6.0-warm-intro-ready` tag, mooter.ai 200, no regressions

If any of 1-10 fails, Wave 11 stays open as `v1.6.0-rc-N` until fixed.

---

## 5. What ships in the failure case

If Wave 11 hits an unfixable blocker (e.g. install.sh broken in a way that needs Wave 12 rearchitecture):

- Document the blocker in `docs/strategy/WAVE11_BLOCKERS.md`
- Roll back to `v1.5.1-signin-fix` in prod (it works for visual showcase, just not E2E)
- Update `VALIDATION_OUTREACH_KIT.md` to add an "install assistance offer" — Paulo personally walks each tester through install via screen-share
- Validation can proceed with 5 testers + manual install hand-holding, just slower

This is the honest fallback. **No fake "ready" sign-off if Day 4 test fails.**

---

## 6. Tracking

Throughout Wave 11, maintain:
- `.planning/wave11/findings_dayN.md` — per-day findings log
- `docs/strategy/WAVE11_DAY1_FINDINGS.md` — Day 1 deliverable
- `docs/strategy/ANTHROPIC_SHOWCASE_RUBRIC_V1.md` — Day 3 deliverable
- `docs/strategy/WAVE11_CLOSURE.md` — Day 4 final report
- Update SYNC.md after each Paulo Gate (A/B/C)
- Update Notion HQ sub-page per gate

Cowork handles MCP/Vercel side + Chrome MCP smoke + Notion + memory. CC handles filesystem audit + tests + PRs + Docker install + tag/release.

---

## 7. Kickoff command (paste into CC to start)

```
Inicia Wave 11 Warm-Intro Readiness conforme docs/strategy/WAVE11_WARM_INTRO_READINESS_KICKOFF.md.

Scope: Balanced (audit + critical + important fixes, sem Adapter Forge).
VM test: tu corres em Docker node:20 bash sandbox.
Pre-flight: Cowork já fez smoke incognito-ish (2026-06-02) — hero CTA → /dashboard LoginHero ✓, 2 findings doc (90% claim + GotMoo brand voice — não toques sem aprovação).

Comeca por Phase 0 (read context) + Phase 1.recon (Dimension 1 audit). Quando acabares Dimension 1-3 recon, faz o test Docker install (Phase 4.test) — esse é o crítico. Reporta no fim do Day 1 com WAVE11_DAY1_FINDINGS.md categorizado por crítico/important/polish + pergunta ao Paulo sobre D4-4 (subagents bundle) e D4-5 (Ollama auto-pull) antes de avançar para fixes.

Paulo Gates: A (post-recon Day 1) · B (pre-promote Day 2) · C (post-rubric Day 3).

Definition of done: 10 criteria em §4. Falha = WAVE11_BLOCKERS.md + rollback honesto a v1.5.1.

Invariantes intactas: classify.js byte-identical (P11), no PII telemetry, no `--no-verify`, no auto-merge a main, no Adapter Forge expansion, no hyperbole copy.

Arranca.
```

---

**Composed by Cowork, 2026-06-02. Wave 11 supersedes outreach-week-1 readiness blockers. Validation 5 vibe coders waits for Day 4 sign-off (or blocker docs + fallback plan).**
