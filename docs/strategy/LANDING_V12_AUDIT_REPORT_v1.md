# Landing v12 Audit Report — Mooter Design System zip (2026-06-08)

> **TL;DR:** Zip do Claude Design auditado, 4 fixes críticos aplicados, deploy-ready pasta em `~/frugal/landing-v12-deploy/`. Pronto para Vercel preview em ~2 min. Production-grade migration (Next.js 16 + Supabase Auth + Hub wiring) fica para Wave 33.6 com brief composto abaixo.

---

## §1 Findings summary

### ✅ VALIDADO (12 itens)

| Item | Estado | Evidência |
|---|---|---|
| Real numbers | ✅ | $25.95/658/47% consistentes em 4+ ficheiros (mooter-v1-app, mooter-v1-iter1, mooter-v1-demo) |
| Hero subtitle | ✅ | "The router for Claude Code. Local-first. Learns forever. Spawns agents safely by default." |
| Pulse strip caption | ✅ | "From the author's machine — 1 dev (Paulo). Real numbers, not a community average." |
| Install command | ✅ | `bash <(curl -fsSL https://mooter.ai/install.sh)` (process substitution, cleaner que pipe) |
| Crook scrubbed | ✅ | User-facing pages limpas (só canvas-only sheet retém) |
| Pastor scrubbed | ✅ | Substituído por "Smart routing intelligence" |
| Cmd+K palette | ✅ | mooter-v1-cmdk.jsx mounted em todas pages |
| 16 public pages | ✅ | index, install, auth, packs, under-the-hood, compare, conductor, workflow, commands, sessions, security, changelog, methodology, privacy, onboarding |
| 3 logged-in pages | ✅ | dashboard, packs, settings (com AppShell sidebar collapsible) |
| Vercel-ready | ✅ | vercel.json + index.html root redirect |
| Brand voice | ✅ | Founder-pragmatic, "1 dev", no hyperbole |
| Comparison table | ✅ | 11/11 honest derived scores (Mooter 11 · Cursor Bg 4 · Codex 4 · Agent Teams 3 · Termdock 2 · Composio 1 · Conductor 1 · Antigravity 1) |

### ⚠️ FIXES APLICADOS (4 críticos)

| Fix | Antes | Depois |
|---|---|---|
| **1. GitHub link placeholder** | `github.com/…/mooter` | `github.com/pauloloureiroshp-ship-it/mooter` |
| **2. Route forge.html (missing)** | Referenciado em ROUTE_TABLE | Removido |
| **3. Route app/digest.html (missing)** | Referenciado em ROUTE_TABLE | Removido |
| **4. Route app/community.html (missing)** | Referenciado em ROUTE_TABLE | Removido |

Cleanup adicional aplicado em `app/dashboard.html`, `app/packs.html`, `app/settings.html` para remover refs broken nos MOOTER_SET_ROUTES override blocks.

### 🚧 PRODUCTION GAPS (Wave 33.6 — não bloqueiam preview)

| Gap | Severidade | Wave 33.6 Block |
|---|---|---|
| **Auth é MOCKUP** (sem GitHub OAuth real) | HIGH | A — Supabase Auth + GitHub provider |
| **Dashboard logged-in com static mock data** | MED | B — Wire mooter-hub `/v1/events` + `/v1/transparency` |
| **Sem wiring mooter-hub CF Workers** | HIGH | B — Hub events read + write |
| **Babel browser parsing** (~500ms parse → LCP ≥ 2.5s) | HIGH | C — Migration Next.js 16 SSG |
| **Sem SSR/SEO optimization** | MED | C — Next.js metadata + sitemap + Open Graph |
| **Não usa stack canónico Paulo** (Next.js 16 + Tailwind v4 + shadcn) | MED | C — Migration stack |
| **Sem JSON-LD structured data** | LOW | C — SEO polish |
| **Sem Lighthouse 90+ target** | MED | C — Performance pass |

---

## §2 Stack architectural decisão (research-validated)

### 2.1 Atual (Claude Design output)

```
HTML estático + JSX em <script type="text/babel">
+ Babel Standalone 7.29.0 (browser-side parsing)
+ React 18.3.1 via unpkg.com CDN
+ Custom colors_and_type.css (~5KB)
+ vercel.json (redirect)

✅ Zero build · ✅ Deploy instantâneo · ❌ Slow LCP · ❌ No SSR · ❌ Auth mockup
```

### 2.2 Wave 33.6 target (production-grade 2026)

```
Next.js 16 (App Router · React 19 · TypeScript strict)
+ Tailwind CSS v4 (Lightning CSS, 60-80% faster build)
+ shadcn/ui (component foundation 2026)
+ Framer Motion (animations)
+ next/font (self-hosted, no layout shift)
+ Supabase Auth (GitHub OAuth + GitHub provider PKCE)
+ Mooter Hub CF Workers (existing, just wire client)
+ @opennextjs/cloudflare (optional, for CF Workers deploy)
+ JSON-LD + Open Graph + sitemap.xml + robots.txt

Target LCP < 1.5s · CLS < 0.01 · Lighthouse 90+ · SSR/SSG · Real auth
```

### 2.3 Sources research (2026-06-08)

- [Tailwind CSS v4 Migration 2026](https://www.digitalapplied.com/blog/tailwind-css-v4-migration-new-features-guide)
- [Next.js Landing Page Templates 2026](https://adminlte.io/blog/nextjs-landing-page-templates/)
- [Supabase Auth Next.js](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Login with GitHub Supabase](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Supabase Cookie Auth Proxy CF Workers](https://github.com/alaister/supabase-cookie-auth-proxy)
- [Better Auth vs Clerk vs NextAuth vs Supabase Auth 2026](https://makerkit.dev/blog/tutorials/better-auth-vs-clerk)
- [Deploy Full-Stack Next.js on Cloudflare Workers](https://www.freecodecamp.org/news/how-to-deploy-a-full-stack-next-js-app-on-cloudflare-workers-with-github-actions-ci-cd/)

---

## §3 Deploy NOW (~5 min) — preview.mooter.ai

### Step 1 — Confirma fixed deploy folder

A pasta deploy-ready foi copiada para o teu workspace:

```bash
ls ~/frugal/landing-v12-deploy/
# Vai mostrar: assets/ colors_and_type.css index.html mooter-v1-*.jsx site/ vercel.json
```

Tarball backup: `~/frugal/landing-v12-deploy.tar.gz` (60KB).

### Step 2 — Vercel deploy preview

```bash
cd ~/frugal/landing-v12-deploy

# (Se ainda não logado em vercel)
vercel login
# Use GitHub OAuth flow

# Deploy preview
vercel
# Prompts:
# - Set up and deploy? Y
# - Which scope? pauloloureiroshp-ship-it's projects
# - Link to existing project? N
# - Project name? mooter-landing-v12 (or whatever you prefer)
# - Directory? . (current)
# - Override settings? N

# Vercel devolve URL: https://mooter-landing-v12-xyz.vercel.app
```

### Step 3 — Validate live preview

Abre o URL devolvido em browser e confirma:

| Check | Esperado |
|---|---|
| Hero "Got Moo?" carrega | ✅ |
| Subtitle correct | ✅ "The router for Claude Code..." |
| Pulse strip 658/$25.95/47%/3 packs | ✅ |
| Install cmd em /install | ✅ `bash <(curl -fsSL ...)` |
| /compare table 11/11 | ✅ |
| /conductor e /workflow showcases | ✅ |
| /commands CC-aligned mapping | ✅ |
| Cmd+K palette opens | ✅ Press Ctrl K |
| /auth signin button | ⚠️ Mockup (HIGH severity — Wave 33.6) |
| /app/dashboard carrega | ⚠️ Mock data (MED — Wave 33.6) |
| Sidebar collapsible | ✅ |
| Mobile responsive | ✅ test em phone |
| Lighthouse | ⚠️ LCP provavelmente 3-4s (Babel parse) |

### Step 4 — Decide: prod replace OU preview subdomain

**Opção A — preview.mooter.ai (recommended)**
- Adiciona preview.mooter.ai como custom domain no Vercel project
- Não toca em mooter.ai prod (estável)
- Permite iteração + Wave 33.6 migration paralela
- Friends podem ver preview enquanto prod fica seguro

**Opção B — Replace prod mooter.ai**
- Promote este preview para mooter.ai domain
- ⚠️ Risk: LCP regression vs current prod
- ⚠️ Auth mockup confunde users que carregam Sign in
- Recommend NOT

**Minha rec:** **Opção A** — preview.mooter.ai esta semana, Wave 33.6 production migration próxima semana → promote prod com Next.js + auth real.

---

## §4 Wave 33.6 Production Migration Brief (composto inline)

**Sequência:** Wave 33.5 prod v1.21.1 SHIPPED → **Wave 33.6 Production Landing + Auth + Hub**
**Tag esperada:** `v1.21.2-landing-prod`
**Estimate:** ~6-8h CC autonomous (ultracode + dangerous)

### 4.1 Cabeçalho

| Item | Valor |
|---|---|
| Branch base | `main` |
| Branch feature | `wave33_6-landing-prod` |
| Tag pós-merge | `v1.21.2-landing-prod` |
| Worker canónico | `wrangler.mooter.toml` (Worker `mooter-hub`) |
| classify.js sha | `7b01eb86…87762` INTACT (15 waves consecutive) |
| Doutrina | Honest > forced. Day 0 recon. final-reviewer Opus gate. |

### 4.2 5 Blocks ordenados

#### Block A — Next.js 16 scaffold + migrate static pages (~2h, T2 Sonnet)

- Setup `landing/` directory com Next.js 16 + App Router
- Tailwind v4 + shadcn/ui registry init
- Migrate 16 public + 3 app pages JSX → React Server Components
- Preserve all hero copy, real numbers, comparison table (já validados)
- Migrate Cmd+K via `cmdk` package (shadcn wrapper)
- Migrate AppShell sidebar collapsible
- Mobile-first responsive
- Dark mode default + light mode toggle

#### Block B — Supabase Auth GitHub OAuth (~1.5h, T2 Sonnet)

- Supabase project (já tens — usar existing)
- Enable GitHub provider em Supabase dashboard
- GitHub OAuth app: `mooter.ai` + callback `https://your-supabase.supabase.co/auth/v1/callback`
- Scopes: `read:user user:email` only (privacy first)
- Next.js Auth route handler + middleware
- Session cookie (HTTP-only, secure, SameSite=Lax)
- PKCE flow
- /login redirect to `/app/dashboard` on success
- /app/* protected via middleware

#### Block C — Wire mooter-hub para dashboard real (~2h, T2 Sonnet)

- Existing endpoints: `/v1/wave-status`, `/v1/transparency`, `/v1/pastor-v2`, `/v1/pastor-adapters`, `/v1/federated`, `/v1/forget-me`, `/v1/workflows`, `/v1/pricing`
- New endpoint needed: `/v1/user/dashboard?device_id=<id>` — return user's aggregated savings/calls
- Dashboard page fetches real data via Supabase JWT → CF Worker validates → returns aggregated
- Empty state if no data: "Run `mooter sync` to see your numbers here"
- Privacy guard: never expose other users' data (RLS in hub D1)

#### Block D — Production SEO + Performance (~1h, T1 Haiku)

- next/font self-hosted (no Google Fonts request)
- JSON-LD: SoftwareApplication + WebSite schemas
- Open Graph + Twitter Cards per page
- sitemap.xml auto-generated
- robots.txt
- Favicon + apple-touch-icon + manifest.json
- Performance budgets: LCP < 1.5s, CLS < 0.01, FID < 100ms
- Lighthouse CI in build pipeline

#### Block E — Vercel deploy prod + custom domain + Cloudflare DNS (~1h, T1 Haiku)

- Vercel project for landing-prod
- Custom domain mooter.ai (replace static current)
- Cloudflare DNS update (proxy enabled for CDN)
- preview.mooter.ai mantém Claude Design canvas (preserve creative space)
- Smoke test E2E após deploy

### 4.3 Gates pré-merge

- [ ] classify.js sha `7b01eb86…87762` INTACT pré + post-merge (15 waves)
- [ ] Wave 28-33 packages INTOCADOS via `git diff --stat`
- [ ] Real numbers consistent (sweep $25.95/658/47%/293)
- [ ] Lighthouse 90+ em desktop e mobile
- [ ] Supabase GitHub OAuth flow E2E test
- [ ] Dashboard mostra real user data (no mockup)
- [ ] /app/* protected (logged-out redirect to /login)
- [ ] mobile responsive validated em iPhone + Android
- [ ] final-reviewer Opus SHIP
- [ ] Notion sub-page Wave 33.6

### 4.4 Riscos tracked

| Risco | Sev | Mitigação |
|---|---|---|
| Migration quebra hero copy delicado | HIGH | Snapshot tests para hero + subtitle + numbers |
| Supabase Auth quebra existing users | MED | Wave 33.6 é primeiro user lifecycle production — sem existing users a quebrar |
| Hub privacy leak | CRITICAL | RLS em D1 + JWT validation + audit pre-deploy |
| Lighthouse regression vs static | LOW | Next.js SSG é mais rápido que Babel browser |
| Domain swap downtime | MED | Vercel zero-downtime + Cloudflare instant flip |
| Tailwind v4 breaking changes | MED | npx @tailwindcss/upgrade handles ~90% |

---

## §5 Best-in-class skills + repos para Wave 33.6

### 5.1 Skills (existem no teu stack)

- `design:design-handoff` — para spec final implementation
- `design:design-system-management` — para Tailwind v4 + shadcn tokens
- `design:accessibility-review` — para WCAG 2.1 AA gate
- `mcp-builder` — para extender Mooter Hub MCP tools se preciso

### 5.2 Repos to grab (state-of-art 2026)

| Repo | Uso | License |
|---|---|---|
| [shadcn/ui](https://ui.shadcn.com/) | Component foundation | MIT |
| [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) | Next.js → CF Workers compile | Apache 2.0 |
| [supabase/cookie-auth-proxy](https://github.com/alaister/supabase-cookie-auth-proxy) | CF Workers + Supabase Auth proxy | MIT |
| [cmdk](https://github.com/pacocoursey/cmdk) | Command palette (Linear-grade) | MIT |
| [vercel/next-themes](https://github.com/pacocoursey/next-themes) | Dark/light mode | MIT |
| [framer/motion](https://www.framer.com/motion/) | Animations | MIT |

### 5.3 Soluções terceiras consideradas

| Tool | Decisão | Razão |
|---|---|---|
| **Clerk** | ❌ | $25/mês overkill, lock-in vendor |
| **Better Auth** | ❌ | Promising mas Supabase wins (Paulo já usa) |
| **NextAuth.js** | ❌ | Supabase Auth tem RLS integration nativo |
| **Auth0** | ❌ | Enterprise pricing, overkill solo dev |
| **Cloudflare Pages** | 🟡 | Vercel mais simples; CF Pages alternativa boa |
| **GitHub Pages** | ❌ | Sem SSR, sem API routes |
| **Netlify** | ❌ | Vercel ecosystem mais rico para Next.js |

**Decisão final stack:** Next.js 16 + Vercel + Supabase Auth + Mooter Hub CF Workers (existing).

---

## §6 Anthropic showcase angle (orgulho do que vão ver)

Quando Anthropic vê mooter.ai prod (Wave 33.6 done):

1. **Honest numbers** — "From the author's machine — 1 dev (Paulo). Real, not aggregate."
2. **classify.js sha INTACT 15 waves** — engineering discipline rare
3. **4-layer sandbox vs CVE-2025-59528** — security thoughtfulness
4. **11/11 comparison honest** — derived scores, não curated
5. **CC-aligned slash commands** — respeita Claude Code conventions
6. **Footer "Crafted by Paulo Loureiro"** — single founder, MIT, transparent
7. **Privacy first**: opt-in everywhere, k-anon ≥50, GDPR data rights
8. **Open source MIT** — community can self-host
9. **Wave 33.6 Supabase Auth + Hub** — production-grade architecture
10. **No fake testimonials** — real or none

Anthropic doesn't promote ad-loaded products. They might highlight Mooter as **example of how to build with Claude Code thoughtfully**.

---

## §7 Acceptance criteria

### Phase 1 — Preview deploy (TODAY, ~5 min)

- [ ] `vercel deploy` returns preview URL
- [ ] Hero loads with real numbers
- [ ] Comparison table 11/11 renders
- [ ] Cmd+K palette opens (Ctrl+K)
- [ ] Mobile responsive tested
- [ ] preview.mooter.ai custom domain added

### Phase 2 — Wave 33.6 production (~6-8h CC)

- [ ] Next.js 16 + Tailwind v4 + shadcn migration done
- [ ] Supabase GitHub OAuth working E2E
- [ ] Real dashboard data from Mooter Hub
- [ ] Lighthouse 90+ both desktop/mobile
- [ ] mooter.ai prod LIVE com nova landing
- [ ] preview.mooter.ai mantém Claude Design canvas

---

## §8 Sequência recomendada (3 passos)

1. **AGORA (~5 min):** deploy preview Vercel + share preview.mooter.ai com friends como sneak peek
2. **Esta semana:** compor + ship Wave 33.6 CC autonomous
3. **Próxima semana:** promote Next.js production → mooter.ai prod, friends-launch DMs v10

---

*Audit composto 2026-06-08 ~18h BRT após audit completo do Mooter Design System zip do Claude Design. 4 fixes críticos aplicados, deploy folder ready em `~/frugal/landing-v12-deploy/`. Wave 33.6 brief composto inline. Anthropic-grade production target: Next.js 16 + Supabase Auth + Mooter Hub wiring + Lighthouse 90+ + JSON-LD. **Vibe coders e Anthropic vão ver código honest, single founder, real numbers, MIT licensed. Mooter é o que prometeu ser.** 🐮*
