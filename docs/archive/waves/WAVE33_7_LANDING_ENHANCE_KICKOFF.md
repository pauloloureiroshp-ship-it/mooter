# WAVE 33.7 — Landing Enhance-in-Place (Anthropic-grade mooter.ai)

**Sequência:** Wave 33.6 SHIPPED v1.21.2-polish (`563b4c7`) → **Wave 33.7**
**Tag esperada:** `v1.21.3-landing-enhance`
**Estimate:** 6-8h CC autonomous (ultracode + dangerous)
**Owner:** Paulo (CC executor) · doutrina T0/T1/T2/T3 + scratchpad activo
**Date kickoff:** 2026-06-08 ou seguinte sessão
**classify.js sha:** `7b01eb8623a0b8fc…` INTACT obrigatório (17 waves consecutive)

---

## §1 Por que esta wave (HONEST baseado em DAY0_RECON.md)

Wave 33.6 polish SHIPPED com Day 0 honest recon refutando 2 premissas críticas. **Realidade descoberta:**

### mooter.ai prod = `landing/` directory existente (NÃO rebuild)
- **Stack actual:** Next.js 15.5.15 + React 19 + TypeScript strict + Sentry + zod
- **Route groups:** `app/(app)/` (protected: dashboard, settings, admin) + `app/(marketing)/`
- **Auth JÁ wired:** `middleware.ts`, `app/lib/supabase.ts`, `app/auth/callback/route.ts`, `app/auth/token/route.ts`
- **~30 API routes** incluindo `api/dashboard/aggregates` (REAL, community scope live, **per-user scope = declared deferred gap**)
- **Styling:** hand-rolled CSS tokens (`--color-*` em `app/globals.css`) — **NOT Tailwind** (mantém)
- **Vercel project `landing`** (projectId `prj_2aZMQ…`) — serve mooter.ai prod

### `landing-v12-deploy/` separado = Claude Design canvas → preview.mooter.ai (PRESERVE)

### Supabase + Hub provisionados
- `landing/.env.local` tem `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_EMAILS`
- Supabase project ref `eymtobwinevywmmlmxqa`, migrations 006/007/008 applied
- Mooter Hub: `wrangler.mooter.toml`, D1 `mooter-hub`, R2 `mooter-hub-storage`, last migration `017_transparency_events.sql`

**Doctrine:** enhance-in-place a `landing/`, NÃO rebuild. Carry visuals v12 canvas em CSS hand-rolled actual (mantém arquitectura).

---

## §2 Cabeçalho operacional

| Item | Valor |
|---|---|
| Branch base | `main @ 563b4c7` (Wave 33.6 polish) |
| Branch feature | `wave33_7-landing-enhance` |
| Tag pré-merge | ❌ NÃO criar |
| Tag pós-merge | `v1.21.3-landing-enhance` |
| Vercel project alvo | `landing` (projectId `prj_2aZMQ…`) — JÁ serve mooter.ai prod |
| `landing-v12-deploy/` | INTOCADO (preserve preview.mooter.ai) |
| Supabase project | `eymtobwinevywmmlmxqa` (existing) |
| Hub Worker | `mooter-hub` (existing) |
| classify.js sha | `7b01eb8623a0b8fc…` **INTACT obrigatório** (17 waves consecutive) |
| Wave 28-33.6 packages | **INTOCADOS** |
| Doutrina | Honest > forced. Day 0 recon obrigatório. final-reviewer Opus gate. |

---

## §3 Day 0 honest recon (~30 min, OBRIGATÓRIO)

7 pontos a verificar antes de qualquer commit:

1. **Re-validar classify.js sha INTACT** — `sha256sum tools/router/classify.js` = `7b01eb8623a0b8fc…`
2. **landing/ structure audit** — confirm Wave 33.6 DAY0_RECON findings (mature Next.js 15)
3. **Supabase auth providers status** — verificar dashboard se GitHub provider está enabled, sem precisar criar new project
4. **api/dashboard/aggregates code** — `cat landing/app/api/dashboard/aggregates/route.ts` para ver onde está o "per-user scope deferred gap"
5. **Hub Worker LIVE endpoint** — confirmar host real (`mooter-hub.frugal-hub.workers.dev` ou outro?) via `wrangler tail` ou test
6. **Vercel landing project env vars** — confirm `MOOTER_HUB_URL` env var live
7. **Hub D1 migration 017 + 018 schema** — ver `017_transparency_events.sql` para perceber padrão antes de criar 018

**Output Day 0:** `docs/strategy/WAVE33_7_DAY0_RECON.md` com findings de TODOS os 7 pontos.

---

## §4 6 Blocks ordenados

### Block A — GitHub OAuth wire na Supabase existing (~1h, T2 Sonnet)

**Pre-req:** Supabase project provisioned.

**O que:**
1. Verificar em Supabase Studio (dashboard.supabase.com → projeto → Authentication → Providers):
   - GitHub provider enabled? Se sim, skip para passo 3
   - Se não: enable GitHub provider
2. GitHub OAuth App (caso novo):
   - github.com/settings/developers → New OAuth App
   - Application name: `Mooter`
   - Homepage URL: `https://mooter.ai`
   - Authorization callback URL: `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback`
   - Client ID + Client Secret → cola em Supabase
   - Scopes: `read:user user:email` (mínimo, privacy first)
3. Test E2E flow:
   - `/auth/login` (ou existing path) → GitHub OAuth redirect → callback → session
   - `landing/middleware.ts` validates session → allows `/app/*`
4. Logged-out → /login automatic redirect
5. Logged-in NavBar shows user avatar + email + sign out button
6. PKCE flow confirmed (security)

**Honest UX:**
- Add login page copy: "Sign in only for federated wisdom + cross-device sync. Mooter works fully offline without an account."
- Privacy gate first time: "GitHub OAuth scopes: read:user user:email only. We never read your code."

**Tier:** T2 Sonnet (auth flow complexity).

### Block B — Dashboard per-user wire (~2h, T2 Sonnet)

**Pre-req:** Block A done. Day 0 #4 mostrou onde está "per-user scope deferred gap".

**O que:**
1. `landing/app/api/dashboard/aggregates/route.ts`:
   - Identificar o gap "declared deferred"
   - Remove comment "deferred", implement per-user scope
   - Get session JWT from Supabase
   - Forward para hub `/v1/user/dashboard` com `Authorization: Bearer <JWT>`
2. **Hub side — adicionar endpoint `/v1/user/dashboard`** em `hub/src/index.ts`:
   - Accept JWT, validate via Supabase JWKS
   - Extract user_id from JWT
   - Query D1 `events` table WHERE user_id = <user_id> (linked via Wave 33.7 migration 018)
   - Return aggregated JSON: `{ total_calls, saved_usd, saved_pct, tier_distribution, last_active_at, decisions_trained, sessions_active }`
   - RLS: user can only see own data
3. **Frontend dashboard** `app/(app)/dashboard/page.tsx`:
   - Server Component fetches via Supabase JWT
   - Empty state honest: "Run `mooter sync` em terminal to populate."
   - Loading state with personalidade: "Asking the cow about your numbers..."
4. **`mooter sync` CLI update** (em packages/cli):
   - Quando user é logged in via Supabase, sync inclui user_id link
   - Privacy: explicit consent first time

**Tier:** T2 Sonnet (data flow + security).

### Block C — Hub migration 018 user-link (~1h, T2 Sonnet)

**Pre-req:** Day 0 #7 leu 017 padrão.

**O que:**
1. Criar `hub/migrations/018_user_link.sql`:
   ```sql
   -- Wave 33.7: Link Supabase user_id ↔ device_id for per-user dashboard
   CREATE TABLE IF NOT EXISTS user_device_links (
     user_id TEXT NOT NULL,
     device_id TEXT NOT NULL,
     linked_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, device_id)
   );
   CREATE INDEX IF NOT EXISTS idx_udl_device ON user_device_links(device_id);
   CREATE INDEX IF NOT EXISTS idx_udl_user ON user_device_links(user_id);
   ```
2. Update `hub/src/index.ts`:
   - Endpoint `/v1/user/link` (POST): accept JWT + device_id, write to user_device_links
   - Endpoint `/v1/user/dashboard` (GET): query events WHERE device_id IN (SELECT device_id FROM user_device_links WHERE user_id = ?), aggregate, return
   - Endpoint `/v1/user/forget-me` (DELETE): user-initiated data deletion (GDPR)
3. Deploy migration: `npx wrangler d1 execute mooter-hub --remote -c wrangler.mooter.toml --file migrations/018_user_link.sql`
4. Redeploy Worker: `npx wrangler deploy -c wrangler.mooter.toml`
5. Smoke test: link a test device, fetch dashboard, verify aggregation works

**Privacy gates:**
- RLS test: user A não pode ver data de user B
- forget-me deletes link + cascades (não toca em events partilhados aggregate)

**Tier:** T2 Sonnet (data + security).

### Block D — SEO + Lighthouse 90+ pass (~1.5h, T1 Haiku + T2 Sonnet)

**O que:**
1. **next/font self-hosted** (em `app/layout.tsx`):
   - Geist Sans + Geist Mono (já no profile Paulo)
   - `display: swap` para evitar FOIT
   - Preload critical fonts
2. **JSON-LD structured data:**
   - `app/layout.tsx`: SoftwareApplication schema (Mooter)
   - `app/(marketing)/page.tsx`: WebSite schema + Person (Paulo Loureiro)
   - `app/(marketing)/compare/page.tsx`: Article schema
3. **Open Graph + Twitter Cards** via Next.js metadata API:
   - Per-page metadata
   - Default OG image: `public/og-default.png` (Got Moo? + cow + real numbers)
   - Auto-generated dynamic OG via `app/api/og` (existing route!)
4. **sitemap.xml** auto-generated via `app/sitemap.ts`
5. **robots.txt** allow crawling, link to sitemap
6. **Favicon + apple-touch-icon + manifest.json** com cow brand colors
7. **Performance budgets** (.github/workflows/lighthouse.yml):
   - LCP < 1.5s
   - CLS < 0.01
   - INP < 100ms
   - Total bundle JS < 200KB first page
8. **Image optimisation:**
   - All `<img>` → `next/image`
   - AVIF + WebP fallback
9. **Accessibility WCAG 2.1 AA:**
   - axe-core CI gate (existing? add if not)
   - Skip-to-content link
   - Focus indicators 2px solid
   - prefers-reduced-motion respected
10. **Reduce JS:** Server Components everywhere possible; "use client" only para interactive

**Tier:** T1/T2 (config + tooling).

### Block E — Visual carry Wave 33.6 design canvas (~1.5h, T2 Sonnet)

**Pre-req:** All previous blocks done.

**Approach:** Carry **visuals + copy** do `landing-v12-deploy/` Claude Design canvas para `landing/` HAND-ROLLED CSS (NÃO Tailwind, NÃO shadcn). Component-by-component update preservando arquitectura Next.js 15.

**Components a actualizar em landing/components/ (ou equivalent):**

1. **Hero.tsx:**
   - "Got Moo?" giant serif
   - Subtitle: "The router for Claude Code. Local-first. Learns forever. Spawns agents safely by default."
   - Microcopy: "Same results, a fraction of the spend. 47% saved vs all-Opus across the author's own 658 routed calls — real data, not a community average."
   - CTAs: "Install in 30s →" + "Sign in"
   - Status badges: "Open source · MIT · v1.21.2 · classify.js unchanged 17 waves"

2. **PulseStrip.tsx** (real numbers):
   - 658 CALLS ROUTED · across 7 moos
   - $25.95 SAVED VS OPUS · alltime
   - 47% AVG SAVINGS · vs all-Opus
   - 3 PACKS INSTALLED · data-spreadsheet · diagram-systems · voice
   - Caption: "From the author's machine — 1 dev (Paulo). Real numbers, not a community average. Opted-in herd telemetry goes live with v1.21.1."

3. **TerminalMockup.tsx:**
   - claude · live routing · T2 sonnet · 🔒 your code stays local
   - classify 14ms · intent=arch complexity=med
   - profile GPU=RTX 4090 sub=claude-max
   - pack diagram-systems (trust 98)
   - route → claude-sonnet (over opus, saves $0.31)
   - ✓ generating system map...
   - Smart routing intelligence — two axes: complexity + domain. (NÃO usa "Pastor")

4. **ComparisonTable.tsx** (existing /compare):
   - 11×8 honest derived (Mooter 11 · Cursor Bg 4 · Codex 4 · Agent Teams 3 · Termdock 2 · Composio 1 · Conductor 1 · Antigravity 1)
   - Footnote: "Scores derived honestly from per-row cells, not curated."
   - CVE-2025-59528 ⚠️ Antigravity sandbox footnote

5. **ConductorShowcase.tsx + WorkflowShowcase.tsx** (new pages):
   - Conductor: locks + heartbeats + handwritten Caveat annotation
   - Workflow: animated statusline chip `🔄 wf-abc 3/7 agents 💠💠💠○○○○ · 4.2k tk`
   - Wave 28 engine real

6. **NavBar.tsx:**
   - Nav items: How it works · Packs · Compare · Commands · Install
   - **NO "Shepherd" / "Pastor"** (already scrubbed Wave 32+ but verify)
   - CTAs: Sign in · Install in 30s →
   - Cmd+K hint bottom-right "Press ⌘K to search" (use `cmdk` lib, já mature)

7. **Footer.tsx:**
   - "Crafted by Paulo Loureiro in São Paulo / Lisbon."
   - NOT "© 2026 Mooter Inc." — single founder MIT licensed
   - Links: GitHub (github.com/pauloloureiroshp-ship-it/mooter) · Docs · Discord (se existir) · Changelog

8. **CSS tokens update** em `app/globals.css`:
   - Manter `--color-*` system existing
   - Adicionar tokens novos para tier colors (T0 green · T1 yellow · T2 orange · T3 red)
   - Mooter yellow accent: `#fbbf24` (already exists?)
   - Loading states com personalidade: "Asking the cow for advice..."

9. **Pages to update content:**
   - `/install` — system requirements section + first-5-minutes
   - `/compare` — full 11/11 table with honest note
   - `/conductor` — showcase (new page if not exists)
   - `/workflow` — showcase (new page if not exists)
   - `/commands` — CC-aligned /moo-* mapping table (existing?)
   - `/sessions` — Wave 33.5 honest stub or full hi-fi
   - `/security` — 4-layer sandbox primer
   - `/changelog` — v1.21.1, v1.21.2 entries

**IMPORTANT constraints:**
- ❌ NO Tailwind migration (separate wave depois se quiseres redesign)
- ❌ NO shadcn migration (mesma razão)
- ❌ NO architectural rebuild
- ✅ Visual + copy update only
- ✅ Preserve all existing API routes, auth, dashboard logic
- ✅ Preserve Sentry, zod, TypeScript strict
- ✅ Mantém Next.js 15.5.15 + React 19

**Tier:** T2 Sonnet (visual judgment + content carry).

### Block F — Final QA + Vercel deploy (~30 min, T1 Haiku)

**O que:**
1. Local smoke test: `cd landing && npm run dev` → http://localhost:3000
   - All routes carregam
   - Auth flow E2E (GitHub OAuth)
   - Dashboard mostra real Paulo data (com test login)
   - Cmd+K palette opens
   - Mobile responsive
2. **Lighthouse local:**
   - `npx lighthouse https://localhost:3000 --view`
   - Confirma desktop 90+ + mobile 90+
3. **Vercel production deploy:**
   - Push branch `wave33_7-landing-enhance` para origin
   - Vercel auto-deploys preview
   - Test preview URL completamente
   - Promote preview → production via Vercel UI
4. **Custom domain `mooter.ai`** já está configurado no Vercel `landing` project. SEM swap DNS necessário (já LIVE).
5. **`preview.mooter.ai`** mantém Claude Design canvas (`landing-v12-deploy` project, NÃO TOCAR)
6. Smoke prod:
   - `curl -I https://mooter.ai` → 200
   - GitHub OAuth flow real test (test user)
   - Dashboard real data via Hub
   - Lighthouse desktop + mobile pre 90+

**Tier:** T1 Haiku (deploy orchestration).

---

## §5 PHASE pré-merge (~30 min, T3 Opus final-reviewer)

- [ ] classify.js sha `7b01eb8623a0b8fc…` INTACT pré + post-merge (17 waves consecutive)
- [ ] Wave 28-33.6 packages INTOCADOS via `git diff --stat`
- [ ] `landing-v12-deploy/` directory INTOCADO (preserve preview.mooter.ai canvas)
- [ ] Supabase OAuth scopes minimums verified (`read:user user:email` só)
- [ ] RLS test passed (user A não vê data de user B)
- [ ] Lighthouse 90+ desktop + mobile
- [ ] axe-core: 0 violations
- [ ] Hub migration 018 deployed + tested
- [ ] `final-reviewer` Opus SHIP sem high severity
- [ ] Notion sub-page criada via `mooter_notion_write` MCP
- [ ] PR feature → main mergeado directo (pattern waves 28-33.6)
- [ ] **SÓ ENTÃO** `git tag v1.21.3-landing-enhance <main HEAD>` + push
- [ ] MEMORY.md + SYNC.md updated

---

## §6 Riscos tracked

| Risco | Sev | Mitigação |
|---|---|---|
| GitHub OAuth scope leak | HIGH | Audit scopes minimums + RLS test |
| Hub migration 018 corrupts existing events | CRITICAL | Day 0 backup D1 + test em dev branch primeiro |
| Visual carry breaks existing routes | MED | Snapshot tests + component-by-component |
| Lighthouse regression | LOW | Next.js 15 SSG já fast |
| Supabase free tier limits | LOW | Monitor + alert |
| classify.js sha mutated | CATASTROPHIC | Pre-commit hook + final-reviewer gate |
| Wave 28-33.6 packages touched | MED | `git diff --stat` gate |
| `landing-v12-deploy/` accidentally modified | MED | Document INTOCADO doctrine + verify |
| User confused com 2 sites (mooter.ai vs preview) | LOW | Footer note: "preview.mooter.ai = experimental design" |

---

## §7 What's NOT in this wave (anti scope creep)

- ❌ Tailwind v4 migration — separate wave de design depois (Wave 33.8/34 candidate)
- ❌ shadcn/ui migration — same
- ❌ Federated wisdom expansion — Wave 34
- ❌ MCP marketplace listing — Wave 35
- ❌ Plugin Claude Code official publish — Wave 35
- ❌ Wave 28-33.6 packages refactor — INTOCADO doctrine
- ❌ Adapter Forge UI — Wave 5 product, separate
- ❌ Friends-launch DMs — separate Task #218
- ❌ Vídeo pílulas production — separate Production Kit doc
- ❌ Architecture rebuild — DAY0_RECON refutou premissa

---

## §8 Definitions of Done

**Wave 33.7 is DONE when:**
1. ✅ Tag `v1.21.3-landing-enhance` em main
2. ✅ All 6 blocks shipped
3. ✅ classify.js sha INTACT (17 waves consecutive)
4. ✅ Wave 28-33.6 packages INTOCADOS verified
5. ✅ `landing-v12-deploy/` INTOCADO
6. ✅ `https://mooter.ai` LIVE com Wave 33.7 visual + auth + dashboard real
7. ✅ `https://preview.mooter.ai` mantém Claude Design canvas
8. ✅ GitHub OAuth E2E flow works
9. ✅ Dashboard mostra real Paulo data via Hub `/v1/user/dashboard`
10. ✅ Lighthouse 90+ desktop + mobile
11. ✅ Hub migration 018 deployed + tested
12. ✅ Notion sub-page LIVE
13. ✅ MEMORY.md + SYNC.md updated

---

## §9 Pós-Wave 33.7 next steps

- **Friends-launch DMs:** Paulo envia 3 DMs (Task #218 finally close) com URL `https://mooter.ai`
- **Pílulas marketing batch:** Sábado, usar `MOOTER_PILULAS_PRODUCTION_KIT_v1.md`
- **Wave 33.8 candidate:** Tailwind v4 + shadcn redesign (visual refresh, separate)
- **Wave 34 candidate:** Federated wisdom expansion (precisa ≥10 devices)
- **Wave 35 candidate:** MCP marketplace + Plugin Claude Code official publish

---

## §10 Sources

- `docs/strategy/WAVE33_6_DAY0_RECON.md` (composto 2026-06-08 by CC) — base honest deste brief
- [Supabase Auth Next.js Quickstart](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Login with GitHub Supabase](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Next.js 15 metadata API](https://nextjs.org/docs/app/building-your-application/optimizing/metadata)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
- [axe-core CI](https://github.com/dequelabs/axe-core)
- [next/font](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)

---

*Brief composto 2026-06-08 ~20h BRT pós Wave 33.6 SHIPPED v1.21.2-polish. Baseado em DAY0_RECON.md honest findings. Enhance-in-place philosophy: preserve mature landing/ app + carry v12 canvas visuals + real auth + real dashboard + Lighthouse 90+. **NÃO rebuild. Production-grade Anthropic-grade mooter.ai. Single founder. Real numbers. MIT licensed. Honest > inflated.** 🐮*
