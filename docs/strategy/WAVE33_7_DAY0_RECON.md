# WAVE 33.7 — Day 0 Honest Recon

**Date:** 2026-06-08 · **Executor:** CC (Opus, ultracode autonomous) · **Branch:** `wave33_7-landing-enhance` (0 commits, clean off `main @ 563b4c7`)

> Same doctrine as Wave 33.5/33.6: **Day 0 recon may refute kickoff premises.** This one refutes/reshapes **2 of the 7 blocks** (B & C). Read before executing.

---

## TL;DR (3 lines)
1. **classify.js sha INTACT** ✅ `7b01eb8623a0b8fc…` — gate holds (17 waves).
2. **OAuth + auth are already fully wired** (`signInWithGitHub`, callback, token exchange, middleware) — Block A is a *scope tightening + UX copy* job, NOT greenfield wiring. Existing scopes (`read:user,public_repo`) are **wider than the kickoff privacy-minimum** (`read:user user:email`).
3. **Migration 008 already built the per-user infra** via anonymous `user_id_hash` columns. Kickoff's Block C (create `018_user_link.sql` with raw `user_id` `user_device_links` table) is **architecturally wrong** — it would re-introduce raw PII the existing design deliberately avoids. Block C is re-scoped to *expose* the existing hash infra via a new read endpoint, no raw-user_id table.

---

## 7-point findings

### 1. classify.js sha INTACT ✅
```
7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762  tools/router/classify.js
```
Exact match to the sagrada sha. Gate holds.

### 2. landing/ structure audit ✅ (confirms Wave 33.6 recon)
- **Stack:** Next.js `^15.0.0` + React `^19.0.0` + TypeScript strict + `@sentry/nextjs` + `zod` + `simple-icons`. Vitest for tests.
- **No `@supabase/supabase-js` dependency** — `app/lib/supabase.ts` is a **hand-rolled thin REST wrapper** over GoTrue + PostgREST (`fetch` + headers). Deliberate: saves ~300KB, avoids version drift. Block A/B must use this wrapper, NOT add the SDK.
- **Route groups:** `app/(app)/` {admin, dashboard, settings} (protected) + `app/(marketing)/` {changelog, compare, install, methodology, packs, privacy, security, sessions, spawn, under-the-hood}.
- **~30 API routes** under `app/api/`, incl. `dashboard/aggregates`, `og` (dynamic OG already exists), `cli-token`, `me`, `community`, `decisions-log`, `feedback`, `install*`.
- **Styling:** hand-rolled CSS tokens (`--color-*` in `app/globals.css`). **NOT Tailwind.** Mantém.
- **`landing-v12-deploy/` EXISTS** → preserve (preview.mooter.ai canvas). INTOCADO doctrine confirmed.

### 3. Supabase GitHub provider status ⚠️ (partially verifiable)
- **Cannot confirm provider-enabled flag via MCP/CLI** — Supabase auth-provider config is dashboard-only, not exposed to the tools available. **Gated on Paulo** (Studio → Authentication → Providers → GitHub).
- **Strong indirect evidence it is already enabled:** `signInWithGitHub()` + `/auth/callback` + `exchangeCodeForSession()` are fully implemented and were shipped in earlier waves (Wave 6+). The sign-in CTA fix (v1.5.1) re-smoked the auth flow live. If GitHub provider were disabled, that flow would 400 — and prod is 200.
- **ACTION (Paulo, 2 min):** confirm GitHub provider enabled + callback URL is `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback`. If a fresh OAuth App is needed, set scopes `read:user user:email` (see Block A re-scope).

### 4. Per-user "deferred gap" — FOUND (exact) ✅
`landing/app/api/dashboard/aggregates/route.ts` returns **community scope only**. The gap is documented in its own header comment:
> *"The per-user ('My usage') scope is Phase B.1b — it needs a `user_id_hash` filter in the hub, which requires a hub redeploy (deferred, pending approval)."*
The route calls `fetchHubAggregates()` → hub `/aggregate-stats` (community). No per-user path exists yet. **This is the gap Block B closes.**

### 5. Hub LIVE endpoint ✅
- Host: **`https://mooter-hub.frugal-hub.workers.dev`** (hardcoded fallback in `app/lib/hub.ts`; overridable via `MOOTER_HUB_URL` / `NEXT_PUBLIC_*`).
- `GET /aggregate-stats` → **200** · `GET /health` → **200**. Live.
- Architecture: `hub/worker.js` (single `switch(path)` router) → `hub/routes/*.js` handlers (delta, events, stats, models, version, sync_events, workflows, pastor-v2, pastor-adapters, federated, wave-status, transparency, heartbeat, feedback, pricing). **No `hub/src/index.ts`** — kickoff's path reference is wrong; the file is `hub/worker.js`.
- `https://mooter.ai` → **200** · `https://preview.mooter.ai` → **200**. Both live.

### 6. Vercel landing env vars ⚠️
- `landing/.env.local` has only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_EMAILS`.
- **`MOOTER_HUB_URL` is NOT in local env** — but `app/lib/hub.ts` falls back to the live worker URL, so dashboard aggregates work without it. Vercel prod env unknown from here (gated on Paulo / Vercel UI), but the fallback means it is non-blocking.

### 7. Hub D1 migration 017 + 018 schema — REFUTES Block C premise ⚠️🔴
- Migrations `001`…`017` present. **`008_link_user_device.sql` ALREADY links users↔devices** — but via an **anonymous `user_id_hash`** model, deliberately NOT raw `user_id`:
  - Adds `user_id_hash TEXT` (SHA256(supabase_user_id)[:16]) to `device_heartbeats` AND `frugal_events`.
  - Cohort indexes already exist: `idx_events_user_id_hash`, `idx_events_user_date`, `idx_heartbeats_user_id_hash`.
  - Header is explicit: *"The hub remains anonymous-by-default — no PII column is ever populated… cannot be reversed into email."*
- `017_transparency_events.sql` = additive opt-in telemetry + GDPR forget-me queue. Pattern: `CREATE TABLE IF NOT EXISTS`, additive, never touches 001-016.
- **Kickoff's proposed `018_user_link.sql` (`user_device_links(user_id TEXT, device_id TEXT)`) duplicates 008's purpose AND stores raw `user_id` — a privacy regression** the existing design explicitly avoids.

---

## Reshaped plan (honest)

| Block | Kickoff premise | Reality | Re-scope |
|---|---|---|---|
| **A** OAuth wire | greenfield wiring | already wired; scopes too wide | **Tighten scopes → `read:user user:email`, drop repo-reading, add login UX copy.** Provider-enable = Paulo (likely already on). |
| **B** Per-user dashboard | needs hub redeploy | gap is real; infra (`user_id_hash`) exists | **Add hub read endpoint over existing `user_id_hash`; wire `aggregates/route.ts` per-user branch using session JWT → SHA256 hash.** |
| **C** Migration 018 raw user_id link | create `user_device_links` | **008 already did this anonymously** | **DO NOT create raw-user_id table.** Migration 018, if any, is purely an additive covering index for the per-user dashboard query (or skipped — 008's indexes already cover it). Hub endpoint queries `frugal_events WHERE user_id_hash = ?`. |
| **D** SEO/Lighthouse | as-is | fully doable in-repo | proceed (sitemap.ts, robots, JSON-LD, metadata, fonts, manifest, a11y). |
| **E** Visual carry | as-is | hand-rolled CSS confirmed | proceed component-by-component; read `landing-v12-deploy/` canvas for copy/visuals. |
| **F** Deploy | as-is | mooter.ai already on `landing` Vercel project | push branch → preview; **prod promote + remote D1 apply = Paulo-gated externals**. |

## External gates (CANNOT be done autonomously — Paulo)
1. **Supabase Studio:** confirm/enable GitHub provider + minimum scopes (2 min).
2. **GitHub OAuth App** (only if none exists): create with `read:user user:email`.
3. **Remote D1 migration apply** (if 018 index added): `wrangler d1 execute mooter-hub --remote …` (needs Cloudflare auth in Paulo's shell).
4. **Hub Worker redeploy:** `wrangler deploy -c wrangler.mooter.toml`.
5. **Vercel:** confirm `MOOTER_HUB_URL` prod env (non-blocking; fallback works) + promote preview → production.

Everything else (all code) proceeds autonomously this session.
