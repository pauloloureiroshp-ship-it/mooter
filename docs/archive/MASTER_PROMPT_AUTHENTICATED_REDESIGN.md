# Master Prompt — Authenticated Area Redesign (mooter.ai)

> **Cola este prompt inteiro num terminal Claude Code novo e deixa correr.**
> Objectivo: redesenhar toda a área autenticada (onboarding → dashboard → settings → admin) para ter o mesmo look & feel da landing page pública de mooter.ai, e garantir que o OAuth flow funciona end-to-end.

---

## Contexto

O mooter.ai é um router de LLM para Claude Code. A **landing page pública** (https://mooter.ai) foi recentemente redesenhada com uma estética quente e profissional:
- Background: `#0B0A09` (warm dark)
- Surface: `#141311`, `#1C1A17`
- Text: `#F2EDE6` (warm white)
- Accent: `#E8888A` (muted rose/pink)
- Tier colors: T0 `#4CAF6A`, T1 `#5A9BD4`, T2 `#A88BD4`, T3 `#D46A5A`
- Fonts: Space Grotesk (headings) + JetBrains Mono (code/data)
- Logo: emoji 🐮 (cow)
- Overall vibe: warm, premium, developer-focused, NOT generic SaaS

A **área autenticada** (dashboard, onboarding, settings, admin) usa um design system antigo com cores frias e layout genérico que NÃO combina com a landing. Após clicar "Sign in with GitHub", o user entra num mundo visual completamente diferente. Isto é inaceitável.

## O que tens de fazer

### FASE 1 — Verificar e corrigir o OAuth flow

1. Ler `landing/app/page.tsx` — encontrar a função `loginWithGitHub()` e confirmar que usa `process.env.NEXT_PUBLIC_SUPABASE_URL`
2. Ler `landing/app/auth/callback/route.ts` — confirmar que após auth bem-sucedida redireciona para `/onboarding`
3. Ler `landing/app/(app)/layout.tsx` — confirmar que quando não há user, mostra login screen com botão GitHub
4. Testar: `curl -sI "https://mooter.ai/auth/callback?code=test"` — deve retornar redirect (307 ou 302)
5. Se houver qualquer problema no flow, corrigir ANTES de avançar para o design

**CRÍTICO**: O botão "Sign in" na landing page chama `loginWithGitHub()` que faz:
```
window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=github&redirect_to=${origin}/auth/callback`
```
Se `supabaseUrl` for undefined (env var em falta no build), o botão não faz nada. Verificar que o deploy em Vercel tem `NEXT_PUBLIC_SUPABASE_URL` configurada.

### FASE 2 — Redesenhar o App Shell (layout.tsx)

Ficheiro: `landing/app/(app)/layout.tsx`

O layout actual tem sidebar fixa esquerda + main content. Redesenhar para:

**Login screen (quando user não está autenticado):**
- Background usa as mesmas cores da landing (`--bg`, `--surface`)
- Logo 🐮 grande centrado
- Texto "mooter" em Space Grotesk
- Subtítulo elegante: "Your AI routing dashboard"
- Botão "Continue with GitHub" com estilo premium — background `var(--surface-2)`, border `var(--border-light)`, hover com glow subtil
- Layout centrado, generoso em whitespace

**App shell (autenticado):**
- Sidebar: fundo `var(--surface)` com border sutil, logo 🐮 + "mooter" no topo
- Nav links com hover/active states que usam `var(--accent)` (#E8888A)
- User footer com avatar circle usando `var(--accent)`
- Main area com padding generoso, fundo `var(--bg)`
- Top bar com título da página + versão em mono
- **Mobile**: sidebar colapsa num hamburger menu (breakpoint 768px)

### FASE 3 — Redesenhar o Onboarding

Ficheiro: `landing/app/onboarding/page.tsx`

O onboarding actual é funcional mas feio. Redesenhar para:
- Step indicator elegante (3 dots com animação de progresso)
- Step 1 (Hardware): cards seleccionáveis com hover glow, ícone do OS, fundo `var(--surface-2)`
- Step 2 (Install): terminal mock com fundo `#0D0D0D`, border verde, command copiável com botão copy
- Step 3 (Config): JSON preview estilizado, token field com reveal/copy
- Transições suaves entre steps (CSS transitions)
- Branding consistente: 🐮 mooter no header, cores quentes
- Botões "Next" e "Back" com estilo premium (accent color, hover states)

### FASE 4 — Redesenhar o Dashboard

Ficheiro: `landing/app/(app)/dashboard/page.tsx`

O dashboard é a página mais importante — onde o user vê as suas savings. Redesenhar para:

**Overview tab:**
- Hero card com savings total em destaque (número grande, cor `--tier-0` green)
- Grid de stat cards: decisions, savings, devices, tier distribution
- Cada card com fundo `var(--surface-2)`, border `var(--border)`, radius `var(--r-md)`
- Tier distribution bar (horizontal, colored segments T0-T3)
- Device list com ícones de OS (🍎 macOS, 🪟 Windows, 🐧 Linux)

**Metrics tab:**
- Tabela de comparação de fontes de dados estilizada
- Glossário com terms em `var(--accent)` e defs em `var(--muted)`
- Callout boxes com border colorida (verde para positive insights)

**How it Works tab:**
- Flowchart visual com nós conectados por setas
- Cada nó com ícone, label, badge de tier/performance
- Gradient connections entre nós
- Model cards no final com tier color coding

**Calculator tab:**
- Sliders estilizados com track em `var(--border)` e thumb em `var(--accent)`
- Output cards com comparison visual (sem mooter vs com mooter)
- Monthly saving em destaque grande

### FASE 5 — Redesenhar Settings e Admin

Ficheiro: `landing/app/(app)/settings/page.tsx`
- Profile card com avatar, email, subscriptions as pills
- Device list estilizada
- Formulário de edição com inputs dark-themed

Ficheiro: `landing/app/(app)/admin/page.tsx`
- Stats overview cards no topo
- User table com sorting, estilizada com as cores do sistema
- Alert system com severity colors
- Export button estilizado

### FASE 6 — CSS do App Shell

Ficheiro: `landing/app/globals.css`

As classes `.app-sidebar`, `.app-main`, `.app-nav-link`, `.app-tab`, `.dashboard-card`, `.dashboard-muted`, `.onboarding-*`, `.status-pill` etc. precisam de ser reescritas para usar as CSS variables da landing page. Actualmente algumas usam hardcoded colors.

**Garantir:**
- Todas as cores vêm de CSS variables (nunca hardcoded)
- Hover states com transições suaves (0.15-0.2s)
- Focus states acessíveis
- Border radius consistente (`var(--r-sm)` a `var(--r-lg)`)
- Responsive: mobile-first, sidebar → hamburger, cards → stack vertical
- Dark theme consistente — NUNCA branco ou cinza claro
- Scrollbar estilizada (dark theme)

### FASE 7 — Testes e Deploy

1. `cd landing && npx next build` — confirmar zero erros
2. Verificar que cada página renderiza: `/dashboard`, `/onboarding`, `/settings`, `/setup`, `/methodology`
3. Fazer commit e push:
```bash
git add landing/
git commit -m "feat: complete authenticated area redesign — matching mooter.ai landing design system"
git push origin main
```
4. Esperar deploy Vercel (auto-deploy on push)
5. Verificar com `curl` que as páginas respondem

## Regras de design

1. **NUNCA** usar branco (`#fff`) ou cinzas claros — tudo dark theme
2. **NUNCA** usar cores hardcoded — sempre CSS variables
3. **NUNCA** usar Inter, Arial, Roboto — usar Space Grotesk + JetBrains Mono
4. **NUNCA** ter secções com fundo diferente do sistema (sem blue, purple gradients)
5. **SEMPRE** manter a paleta: rose accent (#E8888A), warm whites, tier colors
6. **SEMPRE** usar o logo 🐮 (emoji) — não SVG custom
7. **SEMPRE** responsive (testar mentalmente a 375px, 768px, 1024px)
8. **SEMPRE** manter funcionalidade existente — isto é um REDESIGN visual, não rewrite funcional
9. **NÃO** adicionar dependências novas (no Tailwind, no UI libs)
10. **NÃO** mudar nomes de colunas DB (frugal_config, frugal_version ficam como estão)

## Ficheiros de referência

- **Design system**: `landing/app/globals.css` (primeiras 60 linhas = CSS variables)
- **Landing page**: `landing/app/page.tsx` (referência visual)
- **App shell**: `landing/app/(app)/layout.tsx`
- **Dashboard**: `landing/app/(app)/dashboard/page.tsx`
- **Onboarding**: `landing/app/onboarding/page.tsx`
- **Settings**: `landing/app/(app)/settings/page.tsx`
- **Admin**: `landing/app/(app)/admin/page.tsx`
- **Setup**: `landing/app/setup/page.tsx`
- **Auth callback**: `landing/app/auth/callback/route.ts`
- **Supabase lib**: `landing/app/lib/supabase.ts`
- **Middleware**: `landing/middleware.ts`

## Critério de sucesso

Quando terminares, o user deve poder:
1. Ir a https://mooter.ai
2. Clicar "Sign in" → redirect para GitHub OAuth
3. Autorizar → redirect para /onboarding com design bonito e coerente
4. Completar onboarding → entrar no /dashboard
5. Ver dashboard com savings, devices, flowchart, calculator — tudo com as mesmas cores e estética da landing
6. Navegar para /settings, /admin — tudo coerente
7. Em mobile (375px): sidebar colapsa, tudo legível e usável

**A experiência deve ser seamless** — o user não deve notar transição entre a landing e a área logada. Deve parecer o mesmo produto, o mesmo designer, a mesma qualidade.

Boa sorte. O Paulo vai dormir e quer acordar impressionado. 🐮
