# SYNC.md — frugal

> Canal bidirecional entre Cowork (Claude Desktop) e Claude Code CLI.
> **Última actualização:** 2026-04-09 — Cowork (pós-sessão #2, instruções sessão #3)

---

## O que é o frugal

**Vibe Coder Intelligence Platform** — router inteligente de LLMs para Claude Code.

Classifica cada prompt em < 50 ms (regex puro, sem LLM) e emite um `<router-hint>` que direciona o modelo certo para o tier certo. Resultado: ~90% de poupança vs usar Opus em tudo.

**Repositório:** `C:\Users\Paulo Loureiro\frugal\` (alias CLI: `~/frugal/`)
**GitHub:** https://github.com/pauloloureiroshp-ship-it/frugal (privado, MIT)

---

## Estado actual do projecto

### Versão em produção: v0.9.0 (commits `1e852f3` + `5989b62`, tag `v0.9.0`, 2026-04-09)

| Componente | Estado |
|---|---|
| `classify.js` v3 | ✅ em prod — fast-paths, weighted scoring, tuned block, SHA-256 cache |
| `inject_context.js` | ✅ hook `UserPromptSubmit` activo |
| 6 subagents | ✅ `model-architect`, `model-reasoner`, `cheap-triage`, `local-summarizer`, `local-transformer`, `final-reviewer` |
| `backtest.js` + `update-router.js` | ✅ auto-learning loop activo — Task Scheduler @ 02:00 |
| `savings-tracker.js` + statusline v3 | ✅ 7 segmentos: git · brand · last-turn · distribution · savings/budget · GPU · provider dots |
| `gpu-probe.js` | ✅ NVIDIA/Apple Silicon/AMD/CPU fallback, poll 5 s |
| `POST /decision` + `/gpu` + `/last` | ✅ endpoints no savings-tracker (:7821) |
| `docs/FEDERATED_LEARNING.md` | ✅ protocolo delta-export + `aggregate-deltas.js` |
| 59/59 testes | ✅ `node:test` (baseline mantida após sessão #1) |
| Replay: ~90% savings | ✅ 89.7% em 1,437 prompts reais |
| `.vscode/` | ✅ settings, tasks (10), launch (6), extensions — commit `e97e8a4` |
| `SYNC.md` | ✅ canal bidirecional activo — commit `e97e8a4` |
| `dashboard/` scaffold | ✅ v0.6.0 Next.js 15, 14 ficheiros, ~1150 linhas — commit `fa2ee52` |

### HEAD do repo (após sessão #2)

```
76dcd94  fix(dashboard): deduplicate decisions from benchmark entries in log
fa2ee52  feat(v0.6.0): web dashboard scaffold — Next.js 15 at 127.0.0.1:7820
e97e8a4  chore: add VS Code workspace config and SYNC.md
5989b62  chore(v0.9.0): replay.js fix, README/ROADMAP updates, scheduled delta export
1e852f3  feat: v0.9.0 — statusline v3, GPU detection, federated learning foundation
tag v0.9.0 ← no origin
```

### Dashboard v0.6.0 — validado ✅

- `npm install` + `npm run dev` a funcionar em `http://127.0.0.1:7820`
- 6/6 secções OK (KPI tiles, tier distribution, decisions timeline, SVG cost trend, tuning preview, retrain button)
- Deduplicação fix aplicada: 100 entradas → 30 únicas reais. Cost trend: $4.50 → $1.35 naive.
- Final-reviewer: 10/10 GO (1 nit cosmético não-bloqueante: comment linha 88 desactualizado)
- Commit `76dcd94` pushed

### Backlog

| Milestone | Estado | Headline |
|---|---|---|
| v0.7.0 | 🟡 planned | `HIGH_RISK` single source of truth — extrair `patterns.js` |
| v0.8.0 | 🟡 planned | Team shared config via Git |
| v0.9.1 | 🟡 planned | Landing page pública — URL analyser + waitlist |
| v1.0.0 / v1.1 | 🔵 vision | `frugal-hub` Cloudflare Worker (federated learning + billing OSS) |

---

## Infraestrutura disponível (Cowork criou)

### Supabase — projecto `frugal`

| Campo | Valor |
|---|---|
| Project ID | `eymtobwinevywmmlmxqa` |
| URL | `https://eymtobwinevywmmlmxqa.supabase.co` |
| Anon key (legacy JWT) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5bXRvYndpbmV2eXdtbWxteHFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjEzMDMsImV4cCI6MjA5MTI5NzMwM30.N-GYLtcy2p9SByUaea_usAHdxaxAhHo9xQnbkFvWv2Q` |
| Publishable key | `sb_publishable_WwJhx1ZtxlZwmmp81J_a2Q_sA-xUZrq` |
| Region | `sa-east-1` |
| Status | `ACTIVE_HEALTHY` |

**Schema já aplicado** (4 tabelas com RLS + políticas INSERT público):
- `waitlist` — email + URL + savings estimate + timestamp
- `url_analyses` — cache de análises por URL (evita re-fetch)
- `router_deltas` — federated learning deltas
- `sessions` — analytics anónimos

### Vercel

| Campo | Valor |
|---|---|
| Team | `pauloloureiroshp-ship-its-projects` |
| Team ID | `team_q3kDk3fEFhlL6AcNryTzH3o2` |
| Conta | paulo.loureiro.shp@gmail.com |

---

## Notas de contexto

- **Não confundir** com *Cloude Home* (hub local Windows) nem com *Cloude Speaker* (webapp voz). São projectos separados.
- O `CLAUDE.md` nesta pasta é a **doutrina de roteamento do Paulo** — aplica-se a todas as sessões Claude Code no projecto frugal.
- O Task Scheduler Windows tem a tarefa `FrugalRouterBacktest` agendada às 02:00 diárias.
- Ollama corre localmente com `qwen3:30b` para os tiers T0/T1 baratos.
- `.bak` cleanup pendente: `rm ~/.claude/tools/router/*.bak* ~/.claude/hooks/*.bak` (quando v0.9 estiver estável).

---

## 📥 COWORK → CLAUDE CODE
### Instruções e decisões tomadas no Cowork para a próxima sessão
> Esta secção é escrita pelo Cowork. O Claude Code deve lê-la no início de cada sessão, antes de qualquer trabalho.
> Após lida e aplicada: escrever "✅ Lido em sessão #N — [data]" e limpar as instruções.

**Última actualização Cowork:** 2026-04-09
**Estado:** ✅ Lido em sessão #3 — 2026-04-09 (Prioridades 1+2 aplicadas; Prioridade 3 landing page deferida — não estava no prompt do user)

---

### Prioridade 1 — Fix cosmético (2 min)

Ficheiro: `dashboard/app/api/decisions/route.ts`, linha 88 (comment acima do `const seen`).

Actualmente está:
```
// Deduplicate: benchmark/replay entries repeat the same prompt_preview
```
Deve ficar:
```
// Deduplicate by (preview[:60] | tier | category) — benchmark entries
// repeat the same prompt with different timestamps, so a ts_ms-based key
// would fail to dedupe them.
```

> ⚠️ O ficheiro já foi editado pelo Cowork na sessão anterior — confirma o estado real antes de editar.

---

### Prioridade 2 — v0.7.0: `patterns.js` single source of truth

**Objectivo:** eliminar duplicação entre `HIGH_RISK` em `classify.js` e `HIGH_RISK_MARKERS` em `backtest.js`.

**Passos:**

1. Lê `tools/router/classify.js` (procura `HIGH_RISK`) e `tools/router/backtest.js` (procura `HIGH_RISK_MARKERS`) para ver os arrays actuais.

2. Cria `tools/router/patterns.js` com este formato:
```js
'use strict';
// Single source of truth for routing risk patterns.
// Used by classify.js, backtest.js, and tests.

const HIGH_RISK = [ /* conteúdo actual de classify.js */ ];
const MED_RISK  = [ /* conteúdo actual de classify.js se existir */ ];
const LOW_RISK  = [ /* conteúdo actual de classify.js se existir */ ];
const TRIVIAL   = [ /* conteúdo actual de classify.js se existir */ ];

module.exports = { HIGH_RISK, MED_RISK, LOW_RISK, TRIVIAL };
```

3. Em `classify.js`: substitui os arrays inline por `require('./patterns')` — mantém o resto intacto.

4. Em `backtest.js`: substitui `HIGH_RISK_MARKERS` (ou equivalente) por `require('./patterns').HIGH_RISK` — mantém o resto intacto.

5. Adiciona testes em `backtest.test.js` que garantem:
   - `patterns.js` exporta exactamente `['HIGH_RISK', 'MED_RISK', 'LOW_RISK', 'TRIVIAL']`
   - O array `HIGH_RISK` em `classify.js` e `backtest.js` é o mesmo objecto (vem de `require('./patterns')`)

6. Corre `node --test tools/router/backtest.test.js` — tudo deve passar (59 existentes + novos).

7. **Definition of done:**
```bash
node -e "const p = require('./tools/router/patterns'); console.log(Object.keys(p))"
# → [ 'HIGH_RISK', 'MED_RISK', 'LOW_RISK', 'TRIVIAL' ]
```

8. Commit selectivo + final-reviewer + push.

---

### Prioridade 3 — Landing page `landing/` (v0.9.1)

**Objectivo:** página pública que mostra o frugal a funcionar, com URL analyser e waitlist.

#### Stack

- Next.js 15 App Router (mesma stack do `dashboard/`)
- Plain CSS (sem Tailwind, sem chart libs — consistente com dashboard)
- Supabase JS client para waitlist + cache de análises
- Deploy: Vercel (projecto `frugal-landing`, team `pauloloureiroshp-ship-its-projects`)
- Porta local: `127.0.0.1:7819`

#### Estrutura de ficheiros a criar

```
landing/
  package.json          # next 15 + react 19 + @supabase/supabase-js, port 7819
  next.config.ts        # output: standalone (Vercel)
  .env.local.example    # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
  app/
    layout.tsx          # <html lang="en">, fonte Inter, meta SEO frugal
    page.tsx            # landing page completa (ver spec abaixo)
    globals.css         # variáveis CSS, reset, tipografia
    lib/
      supabase.ts       # createBrowserClient com env vars
    api/
      analyse/
        route.ts        # POST { url } → analisa URL, guarda em url_analyses, devolve resultado
      waitlist/
        route.ts        # POST { email, url, savings_estimate } → insere em waitlist
```

#### Design spec (paleta do frugal v0.9)

Cores:
- Background: `#0a0a0a`
- Surface: `#111111`
- Border: `#1e1e1e`
- Brand accent: `#7c3aed` (purple-600)
- Text primary: `#f4f4f5`
- Text muted: `#71717a`
- Success green: `#22c55e`
- Warning yellow: `#eab308`

Fonte: Inter (Google Fonts)

#### Secções da landing page (em ordem)

**1. Hero**
```
frugal                          ← brand name, grande
Route smarter. Spend less.      ← tagline
~90% cost savings on Claude Code prompts  ← sub-tagline
[Analyse my project →]          ← CTA que faz scroll para o analyser
```

**2. URL Analyser** (secção principal — mostrar o produto a funcionar)
```
Paste your project URL
[https://github.com/... ou vercel URL]  ← input
[Analyse →]                     ← botão POST /api/analyse

→ Loading state: "Detecting stack..."

→ Resultado (card):
  Platform: Vercel / Railway / Netlify / GitHub
  Framework: Next.js / React / Vue / Unknown
  LLM usage: Detected / Not detected
  
  Estimated savings with frugal:
  ████████████████ 89%
  
  "Based on 1,437 real prompts, frugal saves ~$X/month at your usage level."
  
  [Join waitlist to get early access]
```

**3. How it works** (3 passos simples)
```
1. Classify     → Every prompt classified in < 50ms (no LLM)
2. Route        → Cheap models for cheap tasks, Opus only when it matters
3. Save         → ~90% cost reduction, zero quality loss
```

**4. Waitlist form**
```
Email: [____________]
Project URL (optional): [____________]
[Get early access]

"Join 0 developers saving on Claude Code"  ← contador dinâmico de waitlist
```

**5. Footer**
```
frugal · MIT License · GitHub
```

#### API route `/api/analyse` — lógica de detecção

```typescript
// POST { url: string }
// 1. Valida URL (deve começar com https://)
// 2. Faz fetch com timeout 8s, lê headers + HTML (primeiros 50KB)
// 3. Detecção:
//    - Platform: via headers (x-vercel-id, x-railway-request-id, netlify, etc.) ou URL pattern
//    - Framework: via meta tags, generator, script srcs (/_next/, /__remix/, etc.)
//    - LLM usage: grep por 'anthropic', 'openai', 'claude', 'gpt', 'llm' no HTML
// 4. Savings estimate: fixo em 89% (real replay result) — não inventar
// 5. Guarda em Supabase url_analyses (upsert por url) — usar anon key
// 6. Devolve JSON { platform, framework, llm_detected, savings_pct: 89, cached: bool }
// Se fetch falhar: devolve { error: 'unreachable' } com 200 (não 500 — UX)
```

#### Variáveis de ambiente necessárias

```env
NEXT_PUBLIC_SUPABASE_URL=https://eymtobwinevywmmlmxqa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5bXRvYndpbmV2eXdtbWxteHFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjEzMDMsImV4cCI6MjA5MTI5NzMwM30.N-GYLtcy2p9SByUaea_usAHdxaxAhHo9xQnbkFvWv2Q
```

> ⚠️ Em prod (Vercel), estas vars têm de ser adicionadas manualmente pelo Paulo no dashboard Vercel.

#### Como validar localmente

```bash
cd C:\Users\Paulo Loureiro\frugal\landing
npm install
npm run dev   # → http://127.0.0.1:7819
```

Testa:
1. Analisa `https://vercel.com` → deve detectar Vercel como platform
2. Analisa `https://nextjs.org` → deve detectar Next.js como framework
3. Submete email no waitlist → deve aparecer em Supabase > Table Editor > waitlist

#### Deploy Vercel

```bash
cd C:\Users\Paulo Loureiro\frugal\landing
npx vercel --prod --team pauloloureiroshp-ship-its-projects
# Na primeira vez vai perguntar o nome do projecto: usa "frugal-landing"
# Adiciona as env vars no dashboard Vercel manualmente após deploy
```

#### Quando terminares a landing:
- Commit: `feat(v0.9.1): public landing page with URL analyser and waitlist`
- Push
- Copia o URL Vercel aqui no SYNC.md (secção 📤)

---

### Quando terminares TUDO (prioridades 1+2+3):

Actualiza SYNC.md:
- Secção `## Estado actual` → adiciona v0.7.0 e v0.9.1 como ✅
- HEAD do repo → actualiza com novos commits
- Esta secção 📥 → marca como `✅ Lido em sessão #3 — [data]`
- Secção 📤 → escreve relatório com: commits, testes, URL Vercel

---

## 📤 CLAUDE CODE → COWORK
### Relatório do que foi feito (para o Cowork ler)
> Esta secção é escrita pelo Claude Code. O Cowork lê-a no início de cada sessão de review.

**Última actualização:** 2026-04-09 (sessão #2)

### Sessão #2 — relatório ✅

Commit `76dcd94` pushed.

**Fix aplicado em `dashboard/app/api/decisions/route.ts`:**
- `break` → `continue` no filtro temporal (log pode ter entradas out-of-order)
- Adicionado `Set` de deduplicação por `(prompt_preview[:60] | tier | category)`
- Resultado: 100 entradas → 30 únicas. Cost trend: $4.50 → $1.35 naive.

**Validação:**
- `npm run dev` activo em `http://127.0.0.1:7820`
- 6/6 secções visuais OK
- 59/59 testes a passar
- Final-reviewer: 10/10 GO

**Nit cosmético não-bloqueante:**
- Comment na linha 88 de `decisions/route.ts` ligeiramente desactualizado (descrito em Prioridade 1 acima).

---

### Sessão #1 — relatório ✅

Commits `e97e8a4` + `fa2ee52` pushed.

- `.vscode/` criado (settings, tasks, launch, extensions)
- `frugal.code-workspace` actualizado
- `SYNC.md` criado como canal bidirecional
- `dashboard/` scaffold (Next.js 15, 14 ficheiros, ~1150 linhas)
