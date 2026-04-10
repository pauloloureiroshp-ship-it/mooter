# FRUGAL LANDING — MASTER PROMPT v1.0
# Para Claude Code · Sessão de reconstrução da landing page

---

## CONTEXTO DO PROJECTO

**frugal** é um router de LLM para Claude Code. Classifica cada prompt em <50ms com regex puro, roteia para o tier mínimo viável, e aprende do uso real todas as noites às 02:00 com um backtest automatizado. Números reais validados em produção:

- **89.7% de poupança de custos** em 1,437 prompts reais
- **83.9% roteia para T0** (Ollama local — completamente grátis)
- **3.6% vai para T3 Opus** — apenas quando HIGH_RISK patterns activam guardrails
- **94% de confiança** no backtest
- **<50ms de latência** de classificação
- **312 utilizadores** no federated learning
- **59/59 testes** a passar

**Stack da landing:** Next.js 15, React 19, TypeScript, CSS puro (sem Tailwind), Supabase REST (sem supabase-js), deploy no Vercel.

**URL de produção:** https://landing-five-azure-16.vercel.app

**Repo:** /frugal/landing/ (Next.js app router em /app/)

---

## PROBLEMA ACTUAL

A landing existe mas tem problemas críticos que impedem conversão:

1. **Crash client-side** em alguns browsers/scrolls (React 19 + cleanup de effects)
2. **Copy técnico demais** — "doctrine-based routing", "T0/T1/T2/T3", "zero-cost classification"
3. **Links para o repo GitHub** expostos (propriedade intelectual — algoritmo classify.js + patterns.js)
4. **ResultCard da análise de URL** tem jargão nos suggestions
5. **Nenhum ErrorBoundary** — qualquer excepção derruba a página inteira
6. **Mobile terminal demo** colapsa sem fallback digno
7. **Waitlist form** sem incentivo claro nem social proof dinâmico
8. **Headline fraco** — não comunica valor imediato

---

## OBJECTIVO DESTA SESSÃO

Reconstruir a landing page `landing/app/page.tsx` e `landing/app/globals.css` do zero com foco em:

1. **Conversão** — cada secção tem um CTA claro, copy orientado a resultado
2. **Robustez** — ErrorBoundary em tudo, cleanup de todos os effects, sem crashes
3. **Impressionar** — design de nível Vercel/Linear/Stripe, animações que encantam
4. **Honestidade técnica** — números reais, sem inventar
5. **Segurança** — zero links para o repo, zero exposição do algoritmo

---

## ARQUITECTURA DO ROUTER (para o copy ser preciso)

### Os 4 tiers

| Tier | Modelo | Custo | Quando |
|------|--------|-------|--------|
| **T0** | Ollama qwen3:30b (local) | **$0.00** | Tarefas triviais: triage, extract, brainstorm, format |
| **T1** | Claude Haiku 4.5 | ~$0.001/prompt | Commit messages, docstrings, regex, rename, explain error |
| **T2** | Claude Sonnet 4.6 | ~$0.010/prompt | Debug, root cause, plan, investigate, race condition |
| **T3** | Claude Opus 4.6 | ~$0.050/prompt | **Só HIGH_RISK**: deploy, migration, .env, rm -rf, architecture |

### O algoritmo (nunca expor o código, mas podes descrever o mecanismo)

- 46 padrões em 4 categorias: HIGH_RISK (16), MED_RISK (14), LOW_RISK (11), TRIVIAL (5)
- Cache SHA-256 com TTL 30min — prompts idênticos não reclassificam
- Score ponderado por categoria → tier mínimo viável
- HIGH_RISK é dual-enforced: no classifier E no backtest (não pode ser demovido por auto-tuning)
- Backtest diário às 02:00 detecta over-routing e patcha o classifier automaticamente

### HIGH_RISK patterns (sempre Opus, nunca desviar)

`deploy` `release` `migration` `drop table` `rm -rf` `git push --force` `reset --hard` `.env` `secret` `credential` `API_KEY` `architecture` `refactor crítico` `audit` `review final` `CI pipeline` `package.json crítico`

### Statusline 7 segmentos (após cada prompt Claude Code)

```
⬆ main·a1b2 │ 🐕 frugal v0.9 │ [T1] hku 0.3s │ qwn 84%·hku 10%·son 5%·ops 1% │ 💰 $1.21 (90%↑) ▓▓▓▓▓▓▓░░░ │ 💻 RTX 4090 ▓▓░ 61% │ ●●◐○○○
```

Segmentos: git branch · frugal brand · last turn tier · session distribution · savings+budget · GPU · provider dots

---

## ESPECIFICAÇÃO TÉCNICA DA LANDING

### Ficheiros a criar/modificar

```
landing/app/page.tsx          ← componente principal (reescrever do zero)
landing/app/globals.css       ← CSS (reescrever do zero)
landing/app/layout.tsx        ← apenas verificar/ajustar se necessário
landing/next.config.ts        ← reactStrictMode: false (já está)
```

### API routes existentes (NÃO TOCAR)

```
landing/app/api/analyse/route.ts    ← POST: analisa URL, devolve stack + savings
landing/app/api/waitlist/route.ts   ← GET: conta inscritos · POST: inscreve email
landing/app/lib/supabase.ts         ← wrapper REST para Supabase
```

### Tipos da API /analyse (para o TypeScript)

```typescript
type AnalyseResult = {
  url: string;
  platform: string;       // 'Vercel' | 'Railway' | 'Netlify' | ...
  framework: string;      // 'Next.js' | 'Remix' | 'Nuxt' | ...
  language: string;       // 'TypeScript' | 'JavaScript' | 'Python' | ...
  llm_detected: boolean;
  llm_signals: string[];  // ['anthropic', 'openai', ...]
  savings_pct: number;    // 89
  monthly_savings_usd: number; // ex: 44.50
  tier_breakdown: { t0_pct: number; t1_pct: number; t2_pct: number; t3_pct: number };
  suggestions: { type: string; name: string; reason: string; savings?: string }[];
  backtest_confidence: number; // 94
  backtest_prompts: number;    // 1437
  community_users: number;     // 312
  cached: boolean;
  error?: string;
};
```

---

## DESIGN SYSTEM

### Paleta de cores

```css
--bg:      #0a0a0f   /* fundo principal */
--bg2:     #10101a   /* secções alternadas */
--bg3:     #16162a   /* cards */
--border:  rgba(255,255,255,0.08)
--border2: rgba(255,255,255,0.14)
--text:    #e8e8f0
--text2:   #8888aa
--text3:   #55556a
--purple:  #7c3aed   /* accent principal */
--cyan:    #06b6d4   /* accent secundário */
--green:   #22c55e   /* sucesso / savings */
--yellow:  #eab308   /* aviso / T3 Opus */
--red:     #ef4444   /* HIGH_RISK / erro */
```

### Tipografia

- **Sans**: Inter (400/500/600/700/800/900) — body, headings
- **Mono**: JetBrains Mono → Fira Code → Menlo — terminal, code, statusline
- **Hero H1**: clamp(42px, 7vw, 80px), weight 900, letter-spacing -2.5px
- **Section H2**: clamp(28px, 4vw, 44px), weight 800, letter-spacing -1px

### Princípios de design

1. **Dark terminal aesthetic** — fundo escuro quase preto, acentos vibrantes
2. **Glassmorphism no nav** — `backdrop-filter: blur(20px)` com `background: rgba(10,10,15,0.85)`
3. **Gradiente de texto no hero** — `background: linear-gradient(135deg, #7c3aed, #06b6d4)` + `-webkit-background-clip: text`
4. **Cards com hover** — `border-color` muda para `rgba(124,58,237,0.3)` no hover
5. **Scroll suave** — `scroll-behavior: smooth` no html
6. **Animações trigger por IntersectionObserver** — nunca autoplay, sempre com cleanup

---

## ESTRUTURA DE SECÇÕES (obrigatória, nesta ordem)

### 1. NAV (sticky, glassmorphism)
- Logo: `frugal.` (monospace, ponto roxo)
- Links: Demo · Analyse · How · Pricing
- CTA: "Early access" (botão roxo preenchido)
- **Sem link para GitHub**

### 2. HERO
**Headline (copy exacto):**
> Stop burning Opus tokens on groceries.

**Sub (copy exacto):**
> frugal is the Claude Code router that sends trivial tasks to free local models — automatically, in <1ms, with zero proxies. **90.2% cost reduction** validated on 1,437 real prompts.

**Stats animados (4 métricas):**
- `90.2%` — cost saved
- `1,437` — prompts backtested
- `84%` — run free on Ollama
- `<50ms` — classify latency

**CTAs:**
- Primary: "Analyse my project →" (scroll para #analyse)
- Secondary: "How it works →" (scroll para #how)

**Quote (Ferrari):**
> "You wouldn't drive a Ferrari to buy groceries."

### 3. TERMINAL DEMO (side-by-side, animado por IntersectionObserver)

**Título da secção:** "Watch the router decide — live."
**Sub:** "Every prompt classified in <1ms by a pure regex engine. No LLM in the hot path. Trivial tasks route free. Opus is reserved for the 3.6% that genuinely need it."

**Terminal ESQUERDO — "WITHOUT frugal":**
```
tag: "Opus for everything"  cor: vermelho
```
Sequência de lines:
1. cmd: `git commit -m "fix: button color"`
2. out (warn): `⠸ Sending to Claude Opus 4…`
3. out (dim): `  model: claude-opus-4  tokens_in: 2,847`
4. cost (bad): `this prompt → $0.0043`
5. cost (bad): `120 prompts/day → $0.52/day`
6. cost (bad): `monthly estimate → $15.60/mo`
7. gap
8. cmd: `# rename a variable…`
9. out (warn): `⠸ Sending to Claude Opus 4…`
10. cost (bad): `rename variable → $0.0038`
11. gap
12. cmd: `# "explain this error"`
13. out (warn): `⠸ Sending to Claude Opus 4…`
14. cost (bad): `explain error → $0.0051`
15. gap
16. out (red): `■ 3 prompts · $0.0132 · Opus for everything`

Status bar: `● Opus only` · `● $0.52/day` · `● $15.60/mo` · `● 0% free`

**Terminal DIREITO — "WITH frugal":**
```
tag: "Routed automatically"  cor: verde
```
Sequência:
1. cmd: `git commit -m "fix: button color"`
2. out (purple): `⚡ frugal · TRIVIAL · conf 0.97 · <1ms`
3. out (ok): `  → T1: claude-haiku-4-5  [25× cheaper]`
4. out (dim): `  tokens_in: 2,847  out: 31`
5. cost (good): `this prompt → $0.00017`
6. cost (good): `saved vs Opus → −96%`
7. gap
8. cmd: `# rename a variable…`
9. out (purple): `⚡ frugal · T0-inline · conf 0.99 · <1ms`
10. out (ok): `  → T0: ollama qwen3:30b  [free local 🆓]`
11. cost (good): `rename variable → $0.000`
12. gap
13. cmd: `# "explain this error"`
14. out (purple): `⚡ frugal · T1 · conf 0.88 · <1ms`
15. out (ok): `  → T1: claude-haiku-4-5`
16. cost (good): `explain error → $0.00019`
17. gap
18. bar: `T0 free     ████████████████ 84%` (cor #7c3aed)
19. bar: `T1 Haiku    ██ 10%` (cor #06b6d4)
20. bar: `T2 Sonnet   █ 5%` (cor #22c55e)
21. bar: `T3 Opus     ░ 1%` (cor #eab308)
22. gap
23. out (ok): `■ 3 prompts · $0.00036 · 84% free · −97%`

Status bar: `● frugal active` · `● $0.054/day` · `● $1.62/mo` · `● 84% free local`

**Tabela de custos por tipo de tarefa** (abaixo dos terminais):
| Task | Without | → | With | Tier | Saving |
|------|---------|---|------|------|--------|
| git commit message | $0.0043 | → | $0.00017 | T1 Haiku | −96% |
| rename variable | $0.0038 | → | $0.000 | T0 Ollama | −100% |
| explain this error | $0.0051 | → | $0.00019 | T1 Haiku | −96% |
| debug race condition | $0.0062 | → | $0.0018 | T2 Sonnet | −71% |
| redesign auth system | $0.018 | → | $0.018 | T3 Opus ✓ | 0% (correctly Opus) |

### 4. URL ANALYSER (id="analyse")

**Título:** "See exactly what frugal saves *you*."
**Sub:** "Paste any public URL. We detect your platform, framework, LLM signals, and show how your prompts would be routed — with real dollar estimates from backtest data."

**Form:**
- Input com ícone 🔍, placeholder longo com exemplos
- Botão "Analyse →" (desactivado se vazio/analysing)
- Exemplos clicáveis: `vercel.com` · `nextjs.org` · `railway.app`

**Loading state:** Terminal animado com 7 steps:
1. Resolving hostname…
2. Fetching HTTP headers…
3. Detecting platform & CDN…
4. Scanning for framework signals…
5. Checking for LLM SDK traces…
6. Computing tier breakdown…
7. Generating savings projection…

**ResultCard** (aparece após análise, animação fadeUp):

*Row 1 (2 colunas):*
- **Stack card**: Platform · Framework · Language · LLM signals (com badges coloridos)
- **Savings card**: número grande em gradient (ex: "89%"), "≈ $44/mo saved", confidence bar, meta dots

*Row 2 (full width):*
- **Tier breakdown**: 4 barras horizontais coloridas com labels e percentagens
- Footnote: "T0 runs free on your local GPU via Ollama. T3 (Opus) is reserved for architecture decisions, final reviews, and multi-file refactors only."

*Row 3 (2 colunas):*
- **Suggestions**: lista de recomendações por tipo (connector/skill/cli/tool/llm)
- **CTA card**: domínio do URL analisado, "Save ~$X/mo starting today", 3 bullets de prova, botão "Get early access →"

### 5. HOW IT WORKS (id="how")

**Título:** "How frugal routes every prompt."
**4 cards horizontais:**

| # | Título | Descrição | Tag |
|---|--------|-----------|-----|
| 01 | Classify | Pure regex classifier in <1ms. No LLM in the hot path. SHA-256 cache avoids re-classifying identical prompts. Weighted scoring across 6 signal categories. | `classify.js · 165 lines` |
| 02 | Route | 4 tiers: T0 Ollama (free local), T1 Haiku (25× cheaper), T2 Sonnet (reasoning), T3 Opus (architecture only). HIGH_RISK patterns always escalate, no exceptions. | `patterns.js · dual-enforced` |
| 03 | Save | 84% of prompts route to free local Ollama. 90.2% cost reduction validated on 1,437 real production prompts across 3 projects, zero cherry-picking. | `1,437 prompts · 3 projects` |
| 04 | Learn | Every night at 02:00, a scheduled task replays decisions, finds over-routing, and patches the classifier idempotently. Gets smarter from your own usage. | `backtest.js · daily @ 02:00` |

**Safety Card** (abaixo dos 4 cards, fundo vermelho escuro):
```
🔒 The safety guarantee

HIGH_RISK patterns are dual-enforced in classify.js and backtest.js. 
No matter what the auto-tuner learns, these patterns always escalate to Opus:

[git push --force] [rm -rf] [drop table] [.env / secrets] [deploy / migration]
[reset --hard] [production] [architecture]

Zero-blast-radius: if frugal dies, Claude Code falls back to its default behaviour instantly.
```

**Statusline Preview Card** (abaixo do safety card):
```
Live statusline — after every Claude Code prompt

⬆ main·a1b2 │ 🐕 frugal v0.9 │ [T1] hku 0.3s │ qwn 84%·hku 10%·son 5%·ops 1% │ 💰 $1.21 (90%↑) ▓▓▓▓▓▓▓░░░ │ 💻 RTX 4090 ▓▓░ 61% │ ●●◐○○○

[git branch] [frugal brand] [last turn tier] [session distribution] [savings + budget bar] [GPU usage] [provider dots]
```

### 6. SOCIAL PROOF (fundo --bg2)

**Título:** "Validated. Not projected."
**6 cards com contadores animados:**

| Número | Cor | Label | Sub |
|--------|-----|-------|-----|
| 90.2% | #22c55e | Cost saved vs all-Opus | Real replay · $12.33 → $1.21 on 1,437 prompts |
| 84% | #7c3aed | Prompts run free on Ollama | 1,150 of 1,370 prompts needed zero API spend |
| 94% | #06b6d4 | Backtest confidence | 95% of decisions high-confidence (conf ≥ 0.6) |
| <1ms | #f97316 | Classify latency | Pure regex, no LLM, SHA-256 cache, zero blocking |
| 10min | #eab308 | To tune from your data | Run replay.js on your own Claude Code history |
| 59/59 | #22c55e | Tests passing | node:test · zero external frameworks |

### 7. WAITLIST (id="waitlist", fundo --bg3)

**Título:** "Get frugal before the public launch."
**Sub:** "Installer · VS Code extension · Community backtest data · Plugin marketplace (roadmap). Free and open source forever. MIT license."

**Form:**
- Email input (required)
- URL input (optional, "Your project URL — we'll pre-calculate your savings")
- Botão "Get early access →"
- Counter dinâmico: "X developers already on the list" (via GET /api/waitlist)

**Success state:**
- Check verde animado
- "You're on the list."
- "Developer #X · we'll be in touch."

**Features grid (2×2):**
| Icon | Título | Desc |
|------|--------|------|
| ⚡ | One-command install | bash install.sh — no ports, no daemons, no config |
| 🔒 | Zero proxy | frugal runs locally. Your prompts never leave your machine |
| 🔄 | Auto-tuning | Daily backtest tunes the router from your own usage |
| 🌐 | Federated learning | Community patterns improve everyone (roadmap) |

### 8. FOOTER

- "frugal · MIT License · Made by Paulo Loureiro"
- Links: `Analyse project` · `Early access` · `How it works`
- **SEM link para GitHub**

---

## REGRAS DE IMPLEMENTAÇÃO

### React/TypeScript

1. **`'use client'`** no topo — toda a page é client component
2. **ErrorBoundary class component** — envolve TerminalWindow x2, LoadingView, ResultCard
3. **Todo useEffect com cleanup** — `clearTimeout`, `cancelAnimationFrame`, `obs.disconnect()`, flag `cancelled = true`
4. **IntersectionObserver** para iniciar animações — nunca autoplay, sempre `{ threshold: 0.2 }`
5. **`useRef<HTMLDivElement>(null)`** — nunca `useRef<HTMLElement>` com cast
6. **`reactStrictMode: false`** no next.config.ts (já está)
7. **Sem links externos para repos privados** — zero `github.com/pauloloureiroshp`

### CSS

1. **Sem Tailwind** — CSS puro em globals.css com variáveis CSS
2. **Variáveis CSS** definidas em `:root` conforme design system acima
3. **Responsivo** — breakpoints: 600px (mobile nav), 640px (result grid), 768px (terminal grid), 900px (how grid)
4. **Transições suaves** — `transition: 0.15s` para hover states
5. **Scrollbar personalizada** — `::-webkit-scrollbar` com estilo dark

### Conteúdo/Copy

1. **Nunca inventar números** — usar apenas os da tabela de métricas acima
2. **Sem exposição do algoritmo** — descrever mecanismo mas nunca mostrar código real
3. **Copy orientado a resultado** — "Save 90%" não "90% cost reduction via tier-based routing"
4. **T0/T1/T2/T3 apenas na tabela de tiers** — resto do copy usa nomes dos modelos

### Segurança

1. **Zero links para GitHub** em toda a page.tsx e globals.css
2. **Zero menção a ficheiros internos** (classify.js, patterns.js, backtest.js) — só em tags de how-cards
3. **Zero exposição de env vars** no frontend

---

## EXEMPLO DE ANIMAÇÃO DO TERMINAL (implementação)

```typescript
// Cleanup obrigatório
useEffect(() => {
  if (!active) return;
  let i = 0;
  let tid: ReturnType<typeof setTimeout>;
  let cancelled = false;
  const run = () => {
    if (cancelled || i >= lines.length) return;
    setRendered(prev => [...prev, lines[i]]);
    i++;
    const delay = lines[i-1]?.type === 'gap' ? 300
                : lines[i-1]?.type === 'cmd'  ? 120 : 60;
    tid = setTimeout(run, delay);
  };
  run();
  return () => { cancelled = true; clearTimeout(tid); };
}, [active, lines]);
```

---

## CHECKLIST FINAL ANTES DE COMMIT

- [ ] `tsc --noEmit` passa sem erros
- [ ] Nenhum link para github.com/pauloloureiroshp
- [ ] Todos os useEffect têm cleanup function
- [ ] ErrorBoundary envolve TerminalWindow x2, LoadingView, ResultCard
- [ ] `reactStrictMode: false` em next.config.ts
- [ ] Números no copy batem com a tabela de métricas acima
- [ ] Mobile responsivo (testar em 375px)
- [ ] `next build` passa sem erros
- [ ] Deploy com `npx vercel --prod`

---

## ENTREGÁVEIS ESPERADOS

1. `landing/app/page.tsx` — reescrito do zero, ~800 linhas
2. `landing/app/globals.css` — reescrito do zero, ~600 linhas
3. Zero erros TypeScript
4. Zero crashes client-side
5. `npx vercel --prod` bem sucedido
