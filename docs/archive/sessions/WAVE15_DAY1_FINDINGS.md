# Wave 15 — Day 1 LoginHero Fix — Findings & Decisions

> Execução autónoma 2026-06-04. Branch `wave15-day1-loginhero-fix` → dev.
> Tag dev `v1.9.3-friends-launch-loginhero-dev`. **Não promovido a prod** (Wave 15 closure Day 2).

## ⚠️ Key finding — o brief volta a assumir Tailwind/serif (não existem)

Como no Wave 14 Day 3, o brief prescreve `className="bg-background"`, `font-headline`, `text-foreground`, `<TopNav />`, `tailwind.config.ts`. **Nada disto existe** — o repo é CSS custom properties + inline styles, Space Grotesk (sans, sem serif), e o nav reutilizável é `components/NavBar.tsx`. Aliniei ao idioma real (não inventei Tailwind nem serif).

Tudo verde: `tsc` 0 · ESLint 0 · **123/123 testes** (3 novos) · `next build` ✓ · `classify.js` byte-identical (`7b01eb86…87762`).

## Decisões (para validação do Paulo)

### F-A1 — LoginHero dark via scope + NavBar real (não Tailwind/serif)
- **Root cause:** o wrapper do `LoginHero` (`(app)/layout.tsx`) era `className="app-shell-root"` → tokens light parchment (a "cream" do audit). O CSS `.login-hero` está **scoped a `.app-shell-root`** (globals.css), por isso **mantive `app-shell-root`** (p/ o grid CSS) e **adicionei `app-shell-dark`** → tokens flip dark (padrão Wave 14 Day 4, `var(--bg)`/`var(--bg-2)` → dark). 1 mudança de className vira a página inteira dark.
- **NavBar:** adicionei `<NavBar />` (o nav real da landing, `@/components/NavBar`, sticky, `--color-*` theme-independent) no topo do LoginHero → brand parity + escape para a landing (How/Packs/Compare/Privacy/Install). Satisfaz o intent "TopNav reuse" do brief com o componente que de facto existe.
- **Serif:** não existe fonte serif. O headline "Route smarter." continua Space Grotesk bold (= hero da landing). Deliverable "serif" = N/A; paridade tipográfica já satisfeita.
- **Nota visual:** o LoginHero-left já tinha o seu próprio logo+wordmark; agora há também o logo do NavBar no topo (duplo logo, comum em sticky-nav+hero). Se ficar redundante no review visual, removo o brand in-hero (trivial).

### F-A2 — stats fabricadas removidas (Option A)
Removi o bloco "Live stats" + `useLoginStats` + `InlineStat` + import `HUB_URL`. **Nota:** as stats não eram 100% fabricadas — `useLoginStats` seedava `1437/89.9%/$6.29` E tentava fetch real a `${HUB_URL}/api/stats` (override se respondesse). Option A mata o seed E o fetch. Alinhado com a recomendação do brief (friends-launch = lançamento pessoal do Paulo, não community-driven). Se quiseres a Option B (community pulse real com empty-state), digo — mas Option A é o recomendado.

### F-A3 — onboarding escape nav (Next `<Link>`, não `<a>`)
Header do onboarding passou a `space-between`: logo→`/` + "← Skip for now"→`/`. **ESLint força `<Link>` de `next/link`** (não `<a href="/">`, regra `no-html-link-for-pages`) — usei Link. Onboarding já é dark (`onboarding-shell`).

## Ficheiros tocados

| Ficheiro | Mudança |
|---|---|
| `app/(app)/layout.tsx` | F-A1 (wrapper dark + NavBar) + F-A2 (remove stats/hook/InlineStat/HUB_URL) |
| `app/onboarding/page.tsx` | F-A3 skip link (Next Link) |
| `app/(app)/login-hero.test.ts` | **novo** — 3 testes (F-A1/F-A2/F-A3) |

## Non-negotiables respeitados
`classify.js` idêntica · zero schema/hub/CLI · **dashboard/settings/onboarding dark theme Wave 14 intactos** (só toquei no LoginHero + onboarding header) · `/admin` content intocado.

## Visual review — FEITO (harness Playwright, screenshots reais inspeccionados)
- **F-A1 LoginHero dark — PASS**: fundo dark (era cream), NavBar real no topo (logo · How/Packs/Compare/Methodology/Privacy · Sign in · Install mooter →), "Route smarter." + Continue with GitHub, statusline mockup dark à direita.
- **F-A2 stats — PASS**: linha de stats fabricadas desapareceu.
- **F-A3 onboarding skip — PASS**: header "mooter" + "← Skip for now", dark mantido.
- **Mobile 375px — PASS**: LoginHero single-column (NavBar → logo + Install; statusline-right hidden); onboarding stack OK.
- ⚠️ Gotcha de processo: um `next start` stale de turns anteriores ficou agarrado a :3100 → ChunkLoadError (error boundary cream). NÃO era bug do código (tsc/build/tests verdes); resolveu com kill do PID + server fresh. Lição: matar servers locais por PID entre runs.

## Pendente
- Day 2: Wave 15 closure + promote prod.
