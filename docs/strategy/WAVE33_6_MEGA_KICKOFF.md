# WAVE 33.6 — MEGA: Polish + Production Landing + Auth + Hub Wiring

**Sequência:** Wave 33.5 SHIPPED v1.21.1-historic-spawn-orchestrator (`4c9bc54`) → **Wave 33.6 Mega**
**Tag esperada:** `v1.21.2-landing-prod-polish`
**Estimate:** 10-14h CC autonomous (ultracode + dangerous)
**Owner:** Paulo (CC executor) · doutrina T0/T1/T2/T3 + scratchpad activo
**Date kickoff:** 2026-06-08
**classify.js sha:** `7b01eb86…87762` INTACT obrigatório (15 waves consecutive)

---

## §1 Por que esta mega-wave

Wave 33.5 SHIPPED v1.21.1 com 4-layer sandbox HISTORIC + statusline chips Wave 33.5 LIVE em Paulo's terminal. Landing v12 (Claude Design canvas) deploy preview live em `https://landing-v12-deploy.vercel.app` com fixes aplicados (GitHub link real + 3 missing routes removed).

**Mas há gaps reais antes de prod-grade mooter.ai:**

**Polish gaps (#265):**
1. **install.sh VERSION constant ainda v1.6.0** — bump para v1.21.1 (e auto-bump future)
2. **v1 CLI bundle build falha** com `Could not resolve "p-limit"` em `../workflow/src/pool.ts` — adicionar dep ou marcar external
3. **Conductor chip statusline ausente** — `conductor-autolock.js` hook existe mas `conductor-status.js` chip nunca shipou
4. **Shim ainda routes `doctor` + `uninstall` para legacy CLI** apesar Wave 33.5 ter richer versions em v1 bundle
5. **`MOOTER_TERMINAL_NAME` env var não suportada** em `terminal-name-status.js` (só lê preferences.json terminal_label + TMUX/Zellij/WezTerm specific)

**Production landing gaps (#269):**
1. **Auth é MOCKUP** — sem GitHub OAuth real
2. **Dashboard logged-in com static mock data** — não conecta a Mooter Hub
3. **Sem wiring mooter-hub CF Workers** (que JÁ existe)
4. **Babel browser parse** → LCP ≥ 2.5s
5. **Sem SSR/SEO optimization**
6. **Não usa stack canónico Paulo** (Next.js 16 + Tailwind v4 + shadcn)
7. **Sem JSON-LD structured data**
8. **Sem Lighthouse 90+ target**

**Doctrine:** ship o production-grade landing + close polish gaps numa única wave. Mooter mooter.ai deve ser **Anthropic-grade** quando friends abrem.

---

## §2 Cabeçalho operacional

| Item | Valor |
|---|---|
| Branch base | `main @ <Wave 33.5 ship commit>` |
| Branch feature | `wave33_6-mega` |
| Tag pré-merge | ❌ NÃO criar (lição Waves 21-33.5) |
| Tag pós-merge | `v1.21.2-landing-prod-polish` |
| Worker canónico | `wrangler.mooter.toml` (Worker `mooter-hub`) |
| classify.js sha | `7b01eb86…87762` **INTACT obrigatório** — re-verificar pré + post-merge (15 waves) |
| Wave 28-33.5 packages | **INTOCADOS** — apenas estender via novos sub-packages |
| Doutrina | Honest > forced. Day 0 recon obrigatório. final-reviewer Opus gate antes merge. Tag DEPOIS de merge. |

---

## §3 Day 0 honest recon (~1h, OBRIGATÓRIO)

10 pontos a verificar antes de qualquer commit:

1. **Re-validar classify.js sha INTACT** — `git log --all --diff-filter=M -- tools/router/classify.js` deve estar vazio desde Wave 11
2. **Wave 28-33.5 packages auditoria** — `ls packages/` deve mostrar TODOS os packages das waves anteriores. NÃO tocar.
3. **install.sh actual** — `cat install.sh | head -30` para ver VERSION constant + qualquer hardcoded
4. **p-limit error trace** — reproduce com `cd packages/cli && npm run build` para captar exact error
5. **terminal-name-status.js read MOOTER_TERMINAL_NAME?** — verificar resolveLabel function
6. **Shim doctor/uninstall routing** — `cat bin/mooter | grep -E "doctor|uninstall"` para ver routing
7. **conductor-status.js existe?** — `find tools/ -name "*conductor*status*"` (provavelmente vazio)
8. **landing-v12-deploy/ structure** — `tree ~/frugal/landing-v12-deploy/ -L 2`
9. **Supabase project existing** — check `.env` para SUPABASE_URL + SUPABASE_ANON_KEY
10. **Mooter Hub endpoints LIVE** — smoke `curl https://mooter-hub.frugal-hub.workers.dev/v1/wave-status`

**Output Day 0:** `docs/strategy/WAVE33_6_DAY0_RECON.md` com findings de TODOS os 10 pontos.

---

## §4 PHASE 1 — Polish blocks (~3-4h, paralelizável)

### Block P1 — install.sh VERSION bump auto (~30 min, T1 Haiku)

**Problema:** VERSION constant em install.sh ainda v1.6.0; deveria refletir tag actual.

**Fix:**
1. Bump install.sh VERSION → "1.21.1" (current Wave 33.5 tag)
2. Adicionar GitHub Actions step (em `.github/workflows/release.yml`) que auto-bump VERSION quando new tag pushed
3. Comentário inline: "Auto-bumped by release workflow; do not edit manually"

**Tier:** T1 Haiku (file I/O + regex).

### Block P2 — p-limit dep fix v1 bundle build (~30 min, T2 Sonnet)

**Problema:**
```
✘ [ERROR] Could not resolve "p-limit"
    ../workflow/src/pool.ts:8:19
[!!] v1.0 bundle build failed — legacy CLI only (feedback/forge unavailable).
```

**Fix:**
1. Verificar `packages/workflow/package.json` se tem `p-limit` deps
2. Adicionar `p-limit` (latest stable) às deps
3. Run `npm install` em packages/workflow
4. Re-test build em packages/cli → deve passar
5. Smoke `mooter conductor status` via shim (não direct cli-v1)

**Tier:** T2 Sonnet (dep resolution + verify).

### Block P3 — Conductor chip statusline (~1h, T2 Sonnet)

**Problema:** `conductor-autolock.js` hook LIVE em `~/.claude/hooks/` mas `conductor-status.js` chip NUNCA shipou em `tools/router/`.

**Fix:**
1. Criar `tools/router/conductor-status.js` que:
   - Lê `~/.mooter/orchestration/locks/*.lock` count + active terminal name
   - Renderiza chip: `🔒 conductor: N locks` (quando N>0) ou silent (quando N=0)
   - Failure-safe: any error → return empty string (statusline never broken)
2. Adicionar à lista em `tools/router/statusline-multi.js` linha ~1070 (after Wave 33.5 chips block)
3. Add to `tools/router/statusline-modes.js` se necessário
4. Add hide via `mooter quiet --hide-conductor`
5. Test: `node tools/router/conductor-status.js` standalone returns string

**Tier:** T2 Sonnet (consistency com Wave 33.5 chip patterns).

### Block P4 — Shim doctor + uninstall reconcile to v1 (~30 min, T1 Haiku)

**Problema:** Shim em `bin/mooter` ainda routes `doctor` + `uninstall` para legacy CLI mesmo após Wave 33.5 shipped richer versions em v1.

**Fix:**
1. Editar `bin/mooter` (ou script de shim equivalente) para route `doctor` → `node ~/.mooter/cli-v1/mooter.js doctor`
2. Same para `uninstall` → `node ~/.mooter/cli-v1/mooter.js uninstall`
3. Fallback graceful se v1 bundle missing → use legacy + warn user
4. Smoke: `mooter doctor` deve dispatch via v1, mostra Wave 33.5 features

**Tier:** T1 Haiku (file edit + conditional logic).

### Block P5 — MOOTER_TERMINAL_NAME env var support (~30 min, T1 Haiku)

**Problema:** `terminal-name-status.js` lê `preferences.json terminal_label` + TMUX/Zellij/WezTerm vars mas NÃO `$MOOTER_TERMINAL_NAME`.

**Fix:**
1. Editar `tools/router/terminal-name-status.js` resolveLabel function
2. Adicionar nova prioridade no chain:
   - **1. $MOOTER_TERMINAL_NAME (env var) — primeiro** ← NOVO
   - 2. preferences.json terminal_label
   - 3. $TMUX_PANE_TITLE
   - 4. $ZELLIJ_SESSION_NAME
   - 5. $WEZTERM_PANE
   - 6. git branch
   - 7. cwd basename
3. Add unit test confirming env var precedence
4. Update doc inline

**Tier:** T1 Haiku (file edit + test).

### Block P6 — Update statusline-multi.js para incluir conductor-status.js (~15 min, T1 Haiku)

**Pre-req:** Block P3 done.

**Fix:**
1. Após Wave 33.5 Block A chips comment line (~1070), adicionar:
   ```js
   // Wave 33.6 (P6) — conductor lock count chip
   './conductor-status.js',
   ```
2. Update test em `tools/router/wave33_5-statusline-chips.test.js` → renomear para `wave33_5_6-statusline-chips.test.js` + adicionar test para conductor chip
3. Smoke: enable mode `full` + ter ≥1 lock active → vê `🔒 conductor: 1 locks` em line 3

**Tier:** T1 Haiku.

### Phase 1 acceptance gates

- [ ] install.sh VERSION bumped + auto-bump workflow
- [ ] v1 CLI bundle builds clean (p-limit resolved)
- [ ] conductor-status.js chip ships + tests pass
- [ ] Shim routes doctor + uninstall para v1
- [ ] terminal-name-status.js respects MOOTER_TERMINAL_NAME env var
- [ ] statusline-multi.js includes conductor chip + tests updated
- [ ] classify.js sha INTACT (verify mid-phase)
- [ ] Wave 28-33.5 packages INTOCADOS (`git diff --stat`)

---

## §5 PHASE 2 — Production Landing migration (~6-8h, sequential)

### Block L1 — Next.js 16 scaffold + structure (~1.5h, T2 Sonnet)

**O que:**
1. Criar `landing-prod/` directory em `~/frugal/`
2. `npx create-next-app@latest landing-prod --typescript --tailwind --app --use-npm --no-src-dir`
3. Configurar:
   - Next.js 16 + React 19 + TypeScript strict
   - Tailwind CSS v4 (Lightning CSS, no PostCSS)
   - shadcn/ui registry init: `npx shadcn@latest init`
   - `next/font` self-hosted (Geist Sans + Geist Mono)
   - Framer Motion for animations
   - cmdk (Linear-grade Cmd+K palette)
   - next-themes (dark/light toggle, default dark)

**Migrate pages from landing-v12-deploy/:**
- `/site/index.html` → `app/page.tsx` (Hero + 2-terminal demo + pulse strip)
- `/site/install.html` → `app/install/page.tsx` (real install.sh data)
- `/site/compare.html` → `app/compare/page.tsx` (11×8 comparison table)
- `/site/conductor.html` → `app/conductor/page.tsx`
- `/site/workflow.html` → `app/workflow/page.tsx`
- `/site/commands.html` → `app/commands/page.tsx`
- `/site/under-the-hood.html` → `app/under-the-hood/page.tsx`
- `/site/methodology.html` → `app/methodology/page.tsx`
- `/site/privacy.html` → `app/privacy/page.tsx`
- `/site/packs.html` → `app/packs/page.tsx`
- `/site/security.html` → `app/security/page.tsx` (stub)
- `/site/sessions.html` → `app/sessions/page.tsx` (stub)
- `/site/changelog.html` → `app/changelog/page.tsx` (stub)
- `/site/auth.html` → `app/login/page.tsx` (vai ser real auth no Block L2)
- `/site/onboarding.html` → `app/onboarding/page.tsx`
- `/site/app/dashboard.html` → `app/(app)/dashboard/page.tsx` (protected)
- `/site/app/packs.html` → `app/(app)/packs/page.tsx` (protected)
- `/site/app/settings.html` → `app/(app)/settings/page.tsx` (protected)

**Components extraídos para `components/`:**
- `Hero.tsx` (Got Moo? + subtitle + CTAs)
- `PulseStrip.tsx` (real numbers)
- `TerminalMockup.tsx` (live routing example)
- `TwoTerminalDemo.tsx` (vanilla vs routed)
- `ComparisonTable.tsx` (11×8 with derived scores)
- `ConductorShowcase.tsx` (locks + heartbeats animation)
- `WorkflowShowcase.tsx` (progress chip)
- `NavBar.tsx` (sticky with Cmd+K hint)
- `Footer.tsx` ("Crafted by Paulo Loureiro in São Paulo / Lisbon")
- `CmdKPalette.tsx` (global cmdk wrapper)
- `Sidebar.tsx` (collapsible, AppShell)

**Preserve REAL data:**
- Numbers: 658 calls · $25.95 saved · 47% · 3 packs (real Paulo data)
- Version: v1.21.1 (Wave 33.5 LIVE)
- classify.js sha: 7b01eb86 (intact 15 waves quando Wave 33.6 ships)

**Tier:** T2 Sonnet (architecture + migration).

### Block L2 — Supabase Auth GitHub OAuth (~1.5h, T2 Sonnet)

**Pre-req:** Supabase project existing (check `.env` Day 0 recon).

**O que:**
1. Habilitar GitHub provider em Supabase dashboard:
   - Authentication → Providers → GitHub → Enable
   - GitHub OAuth App: `mooter.ai` + callback `https://<project>.supabase.co/auth/v1/callback`
   - Scopes: `read:user user:email` (privacy first, mínimo necessário)
2. `npm install @supabase/supabase-js @supabase/ssr`
3. Server Component pattern (Next.js 16 App Router):
   - `lib/supabase/server.ts` (createServerClient with cookies())
   - `lib/supabase/client.ts` (createBrowserClient)
   - `lib/supabase/middleware.ts` (session refresh)
4. PKCE flow para security
5. Routes:
   - `/login` → GitHub OAuth redirect button
   - `/auth/callback` → exchange code for session, redirect to `/dashboard`
   - `/api/auth/signout` → server action
6. Middleware (`middleware.ts`) protects `/app/*` routes:
   - Logged out → redirect to `/login?redirect=<requested-path>`
   - Logged in → allow
7. Cookie-based session (HTTP-only, Secure, SameSite=Lax)
8. Show user avatar + name in NavBar (logged-in state)
9. Show "Sign out" in user menu

**Honest UX:**
- `/login` page: "Sign in only for federated wisdom + cross-device sync. Mooter works fully offline without an account."
- Privacy gate first time: "We never read your code. GitHub OAuth scopes: read:user user:email only."

**Tier:** T2 Sonnet (Auth flow complexity).

### Block L3 — Wire Mooter Hub para dashboard real (~2h, T2 Sonnet)

**Pre-req:** Block L2 done (auth working).

**O que:**
1. **Hub endpoint novo necessário:** `/v1/user/dashboard?device_id=<id>`
   - Adicionar em `hub/src/index.ts` route handler
   - Validate JWT (Supabase user_id)
   - Query D1 `events` table → aggregate por user (via Supabase ↔ D1 cross-reference)
   - Return JSON: `{ total_calls, saved_usd, saved_pct, tier_distribution, last_active_at, decisions_trained, ... }`
   - RLS: user pode só ver own data
   - Migration D1 SQL nova para link Supabase user_id → device_id (em `hub/migrations/018_user_link.sql`)
2. **Frontend dashboard page** (`app/(app)/dashboard/page.tsx`):
   - Server Component fetches via Supabase JWT
   - `fetch('https://mooter-hub.frugal-hub.workers.dev/v1/user/dashboard', { headers: { Authorization: Bearer <JWT> }})`
   - Empty state se no data: "Run `mooter sync` no terminal para ver dados aqui."
   - Real data display: real numbers, real chart, real tier breakdown
3. **`mooter sync` cmd update:** quando user é logged in via Supabase, sync inclui user_id link
4. **Privacy guard:**
   - User pode `mooter sync forget-me` → delete user-linked data
   - Frontend Settings → "Delete all my data" button → calls `/v1/forget-me`

**Tier:** T2 Sonnet (data flow + security RLS).

### Block L4 — SEO + Performance (~1h, T1 Haiku)

**O que:**
1. **next/font:** Geist Sans + Geist Mono self-hosted (no Google Fonts request)
2. **JSON-LD structured data:**
   - `app/layout.tsx`: SoftwareApplication schema (Mooter)
   - `app/page.tsx`: WebSite schema + Person (Paulo Loureiro)
   - `app/compare/page.tsx`: Article schema (comparison)
3. **Open Graph + Twitter Cards:**
   - Per-page via Next.js metadata API
   - Default OG image: `public/og-default.png` (Got Moo? + cow + real numbers)
   - `og:image:width 1200, og:image:height 630`
4. **sitemap.xml:** auto-generated via `app/sitemap.ts`
5. **robots.txt:** allow crawling, link to sitemap
6. **Favicon + apple-touch-icon + manifest.json:** cow emoji + brand colors
7. **Performance budgets** (Lighthouse CI in `.github/workflows/lighthouse.yml`):
   - LCP < 1.5s
   - CLS < 0.01
   - FID/INP < 100ms
   - Total bundle JS < 200KB first page
   - Images: AVIF + WebP fallback
8. **Reduce JS:**
   - Server Components everywhere possible
   - "use client" only for interactive (Cmd+K palette, sidebar toggle, theme switch)
9. **Accessibility:**
   - axe-core CI gate
   - WCAG 2.1 AA target
   - Skip-to-content link
   - Focus indicators 2px solid
   - All animations respect `prefers-reduced-motion`

**Tier:** T1 Haiku (configuration + presets).

### Block L5 — Vercel deploy prod + DNS swap (~1h, T1 Haiku)

**O que:**
1. **Create new Vercel project** `mooter-landing-prod` linked to `landing-prod/` directory
2. **Vercel project settings:**
   - Framework: Next.js
   - Build: `npm run build`
   - Node: 22.x
   - Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MOOTER_HUB_URL`
3. **Initial deploy:** `vercel --prod` → returns `mooter-landing-prod-xxx.vercel.app`
4. **Smoke test:**
   - All routes carregam
   - Lighthouse 90+
   - Supabase OAuth flow E2E (test user)
   - Dashboard mostra real data (test account)
5. **Custom domain `mooter.ai`:**
   - Vercel project → Settings → Domains → Add `mooter.ai`
   - Vercel devolve DNS records (CNAME para `cname.vercel-dns.com`)
   - Cloudflare: update existing DNS records → CNAME `@` → `cname.vercel-dns.com` (Proxy ENABLED para CDN)
6. **Custom domain `preview.mooter.ai`:**
   - Manter apontando para `landing-v12-deploy.vercel.app` (Claude Design canvas) — preserve creative space
7. **SSL:** aguarda Vercel emit Let's Encrypt (~2 min)
8. **Test prod:** `https://mooter.ai` LIVE com Next.js
9. **Rollback plan:** Cloudflare DNS records backup antes do swap. Revertível em <2 min se algo correr mal.

**Tier:** T1 Haiku (deploy orchestration + DNS).

### Phase 2 acceptance gates

- [ ] Next.js 16 + Tailwind v4 + shadcn migration done, 19 pages live
- [ ] Hero, pulse strip, comparison table, showcases all preserve REAL data
- [ ] Supabase GitHub OAuth flow E2E works
- [ ] `/app/*` middleware-protected (logged-out → /login)
- [ ] Dashboard fetches real data from Mooter Hub via JWT
- [ ] `mooter sync forget-me` deletes user data (privacy proof)
- [ ] Lighthouse 90+ desktop + mobile
- [ ] JSON-LD + Open Graph + sitemap auto-generated
- [ ] axe-core a11y: 0 violations
- [ ] `https://mooter.ai` LIVE com Next.js production landing
- [ ] `preview.mooter.ai` mantém Claude Design canvas

---

## §6 PHASE 3 — Pre-merge gates universais (~30 min, T3 Opus final-reviewer)

- [ ] classify.js sha `7b01eb86…87762` INTACT verified pré + post-merge
- [ ] Wave 28-33.5 packages INTOCADOS via `git diff --stat`
- [ ] Statusline budget ≤10ms preservado
- [ ] Bundle esbuild + Next.js clean
- [ ] `final-reviewer` (Opus) corrido sem high severity
- [ ] Notion sub-page criada via `mooter_notion_write` MCP
- [ ] PR feature → main mergeado
- [ ] **SÓ ENTÃO** `git tag v1.21.2-landing-prod-polish <main HEAD>` + push
- [ ] Hub deploy migration 018 + redeploy CF Worker

---

## §7 Order of execution recomendada

```
Day 0 (~1h)           Honest recon 10 pontos → WAVE33_6_DAY0_RECON.md

PHASE 1 PARALLEL (~3-4h)
Block P1 install.sh VERSION bump
Block P2 p-limit dep fix
Block P3 conductor chip statusline
Block P4 shim doctor/uninstall reconcile
Block P5 MOOTER_TERMINAL_NAME env var
Block P6 statusline-multi.js update

PHASE 2 SEQUENTIAL (~6-8h)
Block L1 Next.js 16 scaffold + migration (~1.5h)
Block L2 Supabase GitHub OAuth (~1.5h)
Block L3 Mooter Hub wiring + dashboard real (~2h)
Block L4 SEO + Performance (~1h)
Block L5 Vercel deploy prod + DNS swap (~1h)

PHASE 3 (~30 min)
Pre-merge final-reviewer Opus gate
Merge wave33_6-mega → main directo
Tag v1.21.2-landing-prod-polish
Notion sub-page Wave 33.6 Mega
SYNC.md + MEMORY.md update
Hub deploy migration 018
```

---

## §8 Riscos tracked

| Risco | Sev | Mitigação |
|---|---|---|
| p-limit dep upgrade quebra workflow engine | MED | Pin exact version + smoke Wave 28 workflow tests |
| Supabase OAuth scopes leak | HIGH | RLS test + audit OAuth scopes minimums |
| Mooter Hub user-link migration corrupts existing events | CRITICAL | Day 0 backup D1 + test on dev branch first |
| DNS swap mooter.ai downtime | MED | Cloudflare instant rollback + records backup |
| Next.js 16 breaking changes vs Claude Design canvas | MED | Snapshot tests para hero/pulse strip/comparison |
| Lighthouse regression vs preview | LOW | Next.js SSG faster than Babel browser |
| classify.js sha mutated | CATASTROPHIC | Pre-commit hook + final-reviewer gate |
| Wave 28-33.5 packages touched accidentally | MED | `git diff --stat` gate em final-reviewer |
| Supabase free tier limits | LOW | Monitoring + alerts; upgrade if needed |

---

## §9 What's NOT in this wave (anti scope creep)

- ❌ Federated wisdom expansion — Wave 34 candidate (precisa ≥10 devices)
- ❌ Cross-device routing learning sync — Wave 34
- ❌ MCP marketplace listing — Wave 35
- ❌ Plugin Claude Code official publish — Wave 35
- ❌ Wave 28-33.5 packages refactor — INTOCADO doctrine
- ❌ Adapter Forge UI (Wave 5 product) — não bloqueia Wave 33.6
- ❌ Friends-launch DMs — separate task #218
- ❌ Vídeo pílulas production — separate Production Kit doc

---

## §10 Definitions of Done

**Wave 33.6 MEGA is DONE when:**
1. ✅ Tag `v1.21.2-landing-prod-polish` em main
2. ✅ All 5 polish blocks + 5 landing blocks shipped
3. ✅ classify.js sha INTACT (15 waves)
4. ✅ Wave 28-33.5 packages INTOCADOS verified
5. ✅ `https://mooter.ai` LIVE com Next.js production
6. ✅ `https://preview.mooter.ai` mantém Claude Design canvas
7. ✅ Supabase GitHub OAuth E2E test passes
8. ✅ Dashboard mostra real Paulo data via JWT
9. ✅ Lighthouse 90+ desktop + mobile
10. ✅ `mooter doctor` 11/11 PASS + Wave 33.6 chips visíveis (conductor + terminal-name env var)
11. ✅ Notion sub-page LIVE
12. ✅ MEMORY.md + SYNC.md updated

---

## §11 Sources research (web 2026-06-08)

- [Tailwind CSS v4 Migration 2026 — Digital Applied](https://www.digitalapplied.com/blog/tailwind-css-v4-migration-new-features-guide)
- [Supabase Auth Next.js Quickstart](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Login with GitHub Supabase](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Supabase Cookie Auth Proxy CF Workers](https://github.com/alaister/supabase-cookie-auth-proxy)
- [Better Auth vs Clerk vs NextAuth vs Supabase 2026](https://makerkit.dev/blog/tutorials/better-auth-vs-clerk)
- [Next.js Landing Page Templates 2026 — AdminLTE](https://adminlte.io/blog/nextjs-landing-page-templates/)
- [Deploy Next.js on Cloudflare Workers](https://www.freecodecamp.org/news/how-to-deploy-a-full-stack-next-js-app-on-cloudflare-workers-with-github-actions-ci-cd/)

---

## §12 Pós-Wave 33.6 next steps

- **Friends-launch DMs:** Paulo envia 3 DMs (Task #218 finally fechar) com pitch `FRIENDS_LAUNCH_DMS_v10.md` + URL `mooter.ai`
- **Pílulas production batch:** Sábado seguinte, gravar 4 pílulas usando `MOOTER_PILULAS_PRODUCTION_KIT_v1.md`
- **Wave 34 candidate:** Federated wisdom + LLMLingua hardening
- **Wave 35 candidate:** MCP marketplace + Plugin Claude Code official publish

---

*Brief composto 2026-06-08 ~19h BRT pós Wave 33.5 SHIPPED + landing v12 preview deploy LIVE + 4 fixes críticos. Mega-wave combinando polish #265 + production landing #269. Day 0 honest recon obrigatório. CC ultracode + dangerous execution autonomous. **Production-grade Anthropic-grade mooter.ai. Single founder. Real numbers. MIT licensed. Show it.** 🐮*
