# Wave 10 Phase C — Architecture Audit (READ-ONLY)

**Date:** 2026-06-01 · **Branch:** `dev` · **Version under audit:** v1.4.0 (Phase B complete) · **Mode:** audit-only, no code changed.

---

## Key findings (TL;DR — most critical first)

1. **Two public hub endpoints (`/api/delta`, `/api/device-heartbeat`) accept anonymous POSTs with NO bearer auth** — only `/submit-events` checks `FRUGAL_SUBMIT_TOKEN`. Anyone can poison community aggregates / inflate device counts that feed the showcase numbers. (🔴 F-1)
2. **No CI guard enforces the P11 byte-identical `classify.js` invariant, and the landing `vitest` suite never runs in CI** — the doctrine's most-protected file and the entire showcase surface (landing/dashboard/admin) ship untested by the pipeline. (🟠 F-2, F-3)
3. **Architecture is otherwise showcase-ready.** Privacy model (anon-key + SECURITY DEFINER + server-side hashing + email masking) is sound; honesty layer (null→Demo, 100% clamp) is consistently applied; safety_boost / adapter_selection correctly never touch classify.js. Findings are mostly hardening, not redesign.

---

## Severity summary

| Severity | Count | IDs |
|---|---|---|
| 🔴 Critical | 1 | F-1 |
| 🟠 Important | 4 | F-2, F-3, F-4, F-5 |
| 🟡 Nice-to-have | 5 | F-6, F-7, F-8, F-9, F-10 |

Net: **1 critical**, all in the hub auth surface. No architectural redesign required.

---

## Findings

### 🔴 F-1 · Unauthenticated hub ingestion on `/api/delta` and `/api/device-heartbeat`

- **Evidence:** `hub/worker.js:68-72` routes both POSTs; `hub/routes/delta.js` has no `Authorization` check (grep shows only `computeTrustScore`, no bearer); `hub/routes/heartbeat.js` likewise. Contrast `hub/routes/events.js:57-60` which *does* enforce `auth.slice(7) !== env.FRUGAL_SUBMIT_TOKEN`.
- **Risk:** Public-internet write path. An attacker can flood `deltas` / `device_heartbeats`, which feed the hourly `runAggregate` cron and ultimately `/aggregate-stats` → `landing/lib/hub.ts` → homepage CommunityPulse + dashboard. During an Anthropic showcase, fabricated "community" numbers or a cost spike (D1 row writes) is a real blast radius. Rate-limiting exists only on `/submit-events` (`RATE_LIMIT_PER_HOUR=500`), not on delta/heartbeat.
- **Recommended fix (proposal):** Add the same bearer check used in `events.js` to `delta.js` and `heartbeat.js`, OR a lightweight shared-secret + per-instance rate limit via `countRecentEventsByInstance`-style query. Effort: ~1-2h. Blast radius: **touches deployed `hub/` (invariant) + requires CF redeploy + the CLI client that POSTs must send the token** — coordinate with `tools/router/hub-push.js` / heartbeat sender. Do NOT silently change without verifying the client sends matching auth, or you break real installs.
- **Invariant touched:** YES — `hub/` is "never touch casually." This is the justified exception; treat as a coordinated hub change, not a hotfix.
- `claim: delta/heartbeat routes lack bearer auth; only events.js checks FRUGAL_SUBMIT_TOKEN` · `source: hub/routes/delta.js, hub/routes/heartbeat.js (no Authorization), hub/routes/events.js:57` · `confidence: high` · `observed_at: 2026-06-01`

---

### 🟠 F-2 · P11 byte-identical `classify.js` constraint has no automated guard

- **Evidence:** `.github/workflows/test.yml` syntax-checks `classify.js:65` and verifies `update-router` idempotency (lines 150-155), but there is **no checksum/diff gate** that fails CI if `classify.js` content changes outside the sanctioned `update-router` TUNED block. The P11 invariant lives only in prose (`safety_boost.js:7`, `adapter_selection.js:9`, `claude-review.yml:86` comment).
- **Risk:** The single most-protected file in the doctrine is protected by convention, not by the pipeline. A well-meaning refactor (or an agent) can silently alter classification behavior; the only backstop is the gold-labels replay (`replay.js --gold-labels`) which catches *behavioral* drift but not the byte-identity guarantee the invariant actually claims.
- **Recommended fix (proposal):** Add a CI step that compares a committed `classify.js.sha256` against the runtime file, allowing change only when accompanied by an explicit `update-router` provenance marker. Effort: ~1h. Blast radius: CI-only, additive. Invariant touched: protects P11 (does not break it).
- `claim: no CI step enforces byte-identical classify.js` · `source: .github/workflows/test.yml (full read)` · `confidence: high` · `observed_at: 2026-06-01`

---

### 🟠 F-3 · Landing/dashboard/admin (`vitest`) suite never runs in CI

- **Evidence:** `test.yml` triggers only on `paths: tools/router/**`. `deploy-hub.yml` only on `hub/**`. `install-reliability.yml` only diffs `install.sh` vs `landing/public/install.sh`. The landing `vitest run` script (`landing/package.json:12`) and its **13 app-level test files** (e.g. `admin/_lib/privacy.test.ts`, `lib/hub.test.ts`, dashboard `parity.test.ts`) are **never invoked by any workflow**.
- **Risk:** The entire showcase-facing surface — including the email-masking privacy guard and the honesty/Demo-fallback logic — ships with no CI gate. Vercel deploys from `main` on push; a broken admin RBAC check or unmasked-email regression would reach production undetected. Compounded by the noted "webhook missed twice" Vercel promote fragility.
- **Recommended fix (proposal):** Add a `landing-test.yml` running `npm ci && npm run test` in `landing/` on PRs touching `landing/**`. Effort: ~30min. Blast radius: CI-only. Invariant touched: none.
- `claim: no workflow runs landing vitest; landing has 13 app-level test files` · `source: .github/workflows/*.yml, landing/package.json:12, find landing/app -name *.test.ts*` · `confidence: high` · `observed_at: 2026-06-01`

---

### 🟠 F-4 · Raw email crosses the API→browser boundary in admin payload

- **Evidence:** `landing/app/api/admin/stats/route.ts:218,237` returns `email: p.email` (raw) for every user, plus `user_email: p.email` in the activity feed (`:181,188`). Masking happens **client-side only** (`admin/page.tsx:118,368,541,...` calls `maskEmail`).
- **Risk:** The privacy guarantee is presentational, not structural. Raw PII for all users is shipped to the admin browser over the wire; anyone with the admin session (or a DevTools network tab, or a future client bug that logs the payload) sees unmasked emails. The masking module's own comment (`privacy.ts:5`) says the panel "rendered + exported RAW email" — the API still does.
- **Recommended fix (proposal):** Mask server-side in the route before `NextResponse.json`, keeping the raw value only where an action genuinely needs it (none currently do — search/sort use `email.toLowerCase()` at `page.tsx:398`, which could move to a masked+hashed field). Effort: ~2h (touches client search logic). Blast radius: admin route + admin page. Invariant touched: strengthens the email-masking invariant.
- `claim: admin/stats returns raw email; masking is client-side only` · `source: landing/app/api/admin/stats/route.ts:218,237,181; admin/page.tsx:118` · `confidence: high` · `observed_at: 2026-06-01`

---

### 🟠 F-5 · `userIdHash` is an unsalted SHA-256 of the Supabase UUID, duplicated across files

- **Evidence:** Identical `createHash('sha256').update(userId).digest('hex').slice(0,16)` in `landing/app/api/cli-token/route.ts:10` and `landing/app/api/feedback/route.ts:13` (and the hub stores `user_id_hash` from the same scheme). No salt; truncated to 16 hex (64-bit).
- **Risk:** (a) **Maintainability** — two copies that must stay in lockstep with the hub's column semantics; a divergence silently breaks identity linking. (b) **Privacy** — unsalted hash of a known-format UUID is reversible only with the UUID in hand (low practical risk since UUIDs aren't enumerable), but it is not a true pseudonym; if a UUID list ever leaks, the hash linkage is trivial. 64-bit truncation also invites collisions at scale (birthday bound ~4B, far beyond current users — low priority).
- **Recommended fix (proposal):** Extract to one shared `lib/identity.ts` and add a server-only `HASH_SALT` env. Effort: ~1h. Blast radius: **changes hash output → existing `user_id_hash` rows in D1/Supabase orphan**; needs a migration plan or dual-read window. Invariant touched: migrations 006/007/008 already applied — a salt change is a *new* migration concern. Defer unless privacy posture is challenged at the showcase.
- `claim: unsalted truncated SHA-256 userId hash duplicated in 2 routes` · `source: cli-token/route.ts:10, feedback/route.ts:13` · `confidence: high` · `observed_at: 2026-06-01`

---

### 🟡 F-6 · `classify.js` is a 1318-line / 404-regex monolith — P11 freezes the complexity

- **Evidence:** `wc -l classify.js` = 1318; ~404 regex literals; single `module.exports` (`:1295`). The P11 byte-identical constraint means this complexity can only grow via the `update-router` TUNED block, never be refactored.
- **Risk:** Long-term maintainability tax (expected and accepted by design). Not a showcase blocker. The safety layer correctly sits *outside* (`safety_boost.js`, `adapter_selection.js`) rather than editing this file — good separation.
- **Recommended fix:** None for the showcase. Document the "freeze cost" explicitly so future contributors don't attempt a refactor that violates P11. Invariant touched: P11 (informational).
- `claim: classify.js is 1318 lines, ~404 regexes, frozen by P11` · `source: wc -l + grep classify.js` · `confidence: high` · `observed_at: 2026-06-01`

---

### 🟡 F-7 · `sanitizeText` strips `data:` URLs and all HTML — duplicated mirror across hub/router

- **Evidence:** `hub/lib/sanitize.js:16` strips `javascript|vbscript|data|file:` and is an explicit **manual mirror** of `tools/router/sanitize.js` (`:5-8` comment "Keep the two in sync").
- **Risk:** (a) Two copies that can silently drift (CF Workers can't `require` host files — the duplication is justified but unguarded). (b) Over-aggressive `data:` stripping could corrupt a legitimate field, but telemetry fields are counts/buckets, so low impact.
- **Recommended fix (proposal):** Add a CI assertion that the two sanitize regex sources are character-identical (cheap diff gate). Effort: ~30min. Blast radius: CI-only. Invariant touched: none.
- `claim: hub and router sanitize are manually-synced duplicates` · `source: hub/lib/sanitize.js:5-8` · `confidence: high` · `observed_at: 2026-06-01`

---

### 🟡 F-8 · Savings baseline constant `0.015` hardcoded across ≥3 surfaces

- **Evidence:** `landing/app/api/admin/stats/route.ts:131` (`dc * 0.015`), `landing/app/(app)/dashboard/page.tsx:1082` (`decisionsCount * 0.015`), and `:429` (`opusPricePerToken = 0.000015`). The router's true source of truth is `tools/router/savings-tracker.js` (`OPUS_BASELINE_MS_PER_TIER`, requires `pricing.js`).
- **Risk:** Honesty-layer drift. The admin and dashboard both reimplement an all-Opus baseline with a magic number instead of deriving from `pricing.js`. The Wave-9 743% bug (now clamped at `route.ts:136` and `page.tsx:1083`) is the symptom; the clamp masks the root inconsistency rather than unifying the math.
- **Recommended fix (proposal):** Export a single `OPUS_PER_DECISION_USD` from a shared module consumed by both surfaces (or surface it via the hub aggregate). Effort: ~2h. Blast radius: 2 landing files. Invariant touched: none (the clamp stays as a guard).
- `claim: 0.015 all-Opus baseline hardcoded in admin + dashboard, not derived from pricing.js` · `source: admin/stats/route.ts:131, dashboard/page.tsx:1082,429` · `confidence: high` · `observed_at: 2026-06-01`

---

### 🟡 F-9 · Rate limit keys on attacker-controlled `instance_id` (fail-open)

- **Evidence:** `hub/routes/events.js:80` rate-limits by `events[0].instance_id`; `checkRateLimit` (`:41-49`) **fails open** on any D1 error. `instance_id` is client-supplied.
- **Risk:** Even with the bearer token (which F-1 shows delta/heartbeat lack entirely), an authorized-but-malicious client rotates `instance_id` to bypass the per-instance cap; a D1 hiccup disables the limit globally. Acceptable for a trusted-CLI threat model, but worth noting given the showcase exposure.
- **Recommended fix:** Document the fail-open as intentional; consider a global ceiling as a backstop. Effort: ~1h. Blast radius: hub. Invariant: hub (coordinate).
- `claim: rate limit keyed on client instance_id, fail-open` · `source: hub/routes/events.js:41-49,80` · `confidence: high` · `observed_at: 2026-06-01`

---

### 🟡 F-10 · CI tolerates 3 known-failing tests + a 60s open-handle hang

- **Evidence:** `test.yml` skip-pattern `(TUNED block is idempotent|deepseek-r1 specialist|gemma4:e4b)` (line ~114) and the documented `classify-retry.test.js` 60s hang from a require-time `execSync` in `classify.js`.
- **Risk:** Accumulating green-by-exclusion debt; the idempotency skip is concerning because `update-router` mutates `classify.js` (directly adjacent to P11). Low immediate risk — these are tracked Wave-2 debt — but the skipped idempotency test is exactly the kind of guard F-2 needs.
- **Recommended fix:** Resolve the require-time `execSync` open handle so `--test-force-exit` isn't masking it; un-skip the idempotency test. Effort: ~3h. Blast radius: tests + classify load path. Invariant: P11-adjacent (careful).
- `claim: CI skips 3 tests incl. update-router idempotency; classify.js require-time execSync hangs` · `source: .github/workflows/test.yml:114, :35` · `confidence: high` · `observed_at: 2026-06-01`

---

## What's already solid (don't fix)

- **Privacy architecture is genuinely well-designed.** No service-role key anywhere — all writes use the user's bearer through `SECURITY DEFINER` RPCs (`supabase.ts:137`, `install-token/route.ts:36`, `feedback/route.ts:36`). Install tokens store anonymous-only config (`install-token/route.ts:10-23`). Feedback refuses PII via email regex (`feedback/route.ts:31`) and caps length. The CLI never sees raw `user_id` — it's hashed server-side before redirect (`cli-token/route.ts:23`).
- **Honesty layer is consistent.** `hub.ts:35` returns `null` on empty/unreachable hub; `dashboard/aggregates/route.ts:12` and `CommunityPulse.tsx:59` render an explicit "Demo data" `DataSourceBadge` instead of fabricating numbers. The 100% savings clamp is applied at both surfaces (`admin/stats:136`, `dashboard:1083`).
- **Invariant discipline holds.** `safety_boost.js` and `adapter_selection.js` both explicitly run *after* and *outside* classify.js, only ever upgrade tier, and document P11 (`safety_boost.js:7`, `adapter_selection.js:9`). Adapter selection verifies HMAC and fails closed to baseline on tamper (`adapter_selection.js:53`).
- **Hub service layer is clean.** All writes go through parameterized prepared statements in `hub/lib/db.js` (no string-concat SQL); `sanitizeJson` strips prototype-pollution keys (`sanitize.js:78`) before D1.
- **Admin RBAC is correctly gated server-side** (`admin/stats/route.ts:47` checks `isAdminEmail` before any data fetch; audit is best-effort non-blocking at `:52`).
- **The two-CLI design + install-reliability diff gate** (`install-reliability.yml:54`) catches the most common ship break (install.sh divergence).

---

## Recommended Phase C.1 fix sequencing

If a fix wave is greenlit, order by risk-reduction-per-effort:

1. **F-1 (🔴 hub auth)** — first and standalone. Coordinated hub change: add auth to delta/heartbeat *and* update the CLI sender in the same PR, verify against a real install, then redeploy. This is the only finding that can embarrass the showcase.
2. **F-3 (landing CI) + F-2 (P11 checksum gate)** — cheap, additive, CI-only. Do them together; they protect everything else you ship next.
3. **F-4 (server-side email masking)** — closes the real PII-over-wire gap; client search logic needs a small adjustment.
4. **F-8 (unify savings constant)** — removes honesty-drift root cause that the clamp currently papers over.
5. **F-7, F-5, F-9, F-10, F-6** — hardening / debt; schedule post-showcase. F-5 (hash salt) needs a migration plan, so do NOT rush it.

**Rollback story:** Landing rolls back via Vercel deployment revert (deploys from `main`); hub rolls back via re-running `deploy-hub.yml` on a reverted `hub/**` commit. The fragile link is the dev→main promote (Vercel webhook missed twice per the brief) — recommend a manual deploy-verify checklist step before the showcase rather than trusting the webhook.

---

*Audit performed read-only. No source files were modified. This report is the only artifact written.*
