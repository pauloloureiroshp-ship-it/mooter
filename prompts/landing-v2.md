# FRUGAL LANDING — MASTER PROMPT V2
# Para Claude Code · Reconstrução completa com narrativa vibe coder + pricing
# Data: 2026-04-09

---

## MISSÃO DESTA SESSÃO

Reconstruir `landing/app/page.tsx` e `landing/app/globals.css` do zero.

O objectivo não é apenas mostrar o produto — é **educar e converter** uma audiência específica: o *vibe coder*. Alguém que descobriu que consegue construir com IA, está entusiasmado, mas ainda não percebeu que os tokens têm um custo real que vai crescer exponencialmente à medida que os projectos escalam.

A landing tem de fazer três coisas em sequência:
1. **Identificar a dor** — fazer o utilizador pensar "é exactamente isso que me acontece"
2. **Ensinar o porquê** — explicar o algoritmo e a arquitectura de forma que eduque genuinamente
3. **Converter com confiança** — pricing como success fee, não como custo

---

## STACK TÉCNICA (não alterar)

- Next.js 15, React 19, TypeScript, CSS puro (zero Tailwind)
- `'use client'` no topo de page.tsx
- Supabase REST (sem supabase-js) via `/app/lib/supabase.ts`
- Deploy: Vercel — `npx vercel --prod`
- `reactStrictMode: false` em next.config.ts

### API routes (NÃO TOCAR)

```
POST /api/analyse  → { url } → AnalyseResult
GET  /api/waitlist → { total }
POST /api/waitlist → { email, url?, savings_estimate? } → { ok, total, position }
```

### Tipos TypeScript (usar exactamente estes)

```typescript
type TierBreakdown = { t0_pct: number; t1_pct: number; t2_pct: number; t3_pct: number };
type Suggestion    = { type: string; name: string; reason: string; savings?: string };
type AnalyseResult = {
  url: string; platform: string; framework: string; language: string;
  llm_detected: boolean; llm_signals: string[];
  savings_pct: number; monthly_savings_usd: number;
  tier_breakdown: TierBreakdown; suggestions: Suggestion[];
  backtest_confidence: number; backtest_prompts: number; community_users: number;
  cached: boolean; error?: string;
};
```

### Regras de React obrigatórias

```typescript
// Todo useEffect com animação PRECISA de cleanup
useEffect(() => {
  let tid: ReturnType<typeof setTimeout>;
  let cancelled = false;
  // ... lógica ...
  return () => { cancelled = true; clearTimeout(tid); };
}, [deps]);

// IntersectionObserver sempre com cleanup
useEffect(() => {
  const obs = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { setActive(true); obs.disconnect(); }
  }, { threshold: 0.2 });
  if (ref.current) obs.observe(ref.current);
  return () => obs.disconnect();
}, []);

// ErrorBoundary class component obrigatório
class ErrorBoundary extends Component<{children: ReactNode; fallback?: ReactNode}, {error: Error|null}> {
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) return this.props.fallback ?? <div>Something went wrong</div>;
    return this.props.children;
  }
}
```

---

## DESIGN SYSTEM

```css
:root {
  --bg:      #0a0a0f;  --bg2: #0f0f1a;  --bg3: #14142a;  --bg4: #1a1a35;
  --border:  rgba(255,255,255,0.07);
  --border2: rgba(255,255,255,0.12);
  --text:    #eaeaf4;  --text2: #8888aa;  --text3: #55556a;
  --purple:  #7c3aed;  --cyan: #06b6d4;  --green: #22c55e;
  --yellow:  #eab308;  --red: #ef4444;   --orange: #f97316;
  --mono: 'JetBrains Mono', 'Fira Code', Menlo, monospace;
  --sans: 'Inter', system-ui, sans-serif;
  --radius: 12px;
}
```

**Princípios visuais:**
- Dark terminal aesthetic — nível Vercel/Linear/Stripe
- Gradiente hero: `linear-gradient(135deg, #7c3aed, #06b6d4)` em texto
- Cards com `border: 1px solid var(--border)` e hover `rgba(124,58,237,0.25)`
- Nav sticky com `backdrop-filter: blur(20px)`
- Animações trigger por IntersectionObserver (nunca autoplay)
- Todos os effects com cleanup function

---

## NARRATIVA CENTRAL (o coração desta landing)

### O personagem: o Vibe Coder

Não é um developer sénior de 20 anos de experiência. É alguém que nos últimos 12-18 meses descobriu que consegue construir coisas reais com IA — aplicações, automações, protótipos. Está entusiasmado. Lança um projecto novo toda a semana. Usa Claude Code todos os dias.

E tem uma crença implícita que ainda não questionou: **"se eu precisar, posso sempre pedir mais ao modelo."**

O problema é que "pedir mais" tem um custo que cresce de forma não-linear. E ninguém lhe explicou isso.

### O momento de realização

Há um momento específico que todo o vibe coder vai ter. Pode ser amanhã, pode ser em 6 meses. É quando olha para a factura do mês e percebe:

- Passou 3 horas a usar Claude Code para renomear variáveis e fazer commits
- Cada um desses prompts usou Opus (o modelo mais caro)
- Pagou $0.05 por cada uma dessas tarefas triviais
- E as tarefas realmente difíceis — a arquitectura, o debug complexo, o refactor crítico — também custaram $0.05
- Ou seja: pagou o mesmo por "rename this variable" e por "redesign the entire auth system"

Isto é o problema. **Token blindness.** A incapacidade de distinguir o custo real de cada tarefa quando tudo passa pelo mesmo modelo.

### A solução não é "usar menos IA"

Esta é a armadilha em que muitos caem. A resposta não é limitar o uso — é **usar o modelo certo para cada tarefa**. É exactamente o que um developer experiente faz instintivamente, mas que o vibe coder ainda não aprendeu porque ninguém lhe ensinou.

frugal é esse professor. Automático, em <1ms, sem te perguntar nada.

---

## ESTRUTURA DE SECÇÕES (obrigatória, nesta ordem)

---

### SECÇÃO 1 — NAV (sticky, glassmorphism)

```
frugal.   [Demo] [How it works] [Pricing]   [Get early access →]
```

- Logo: `frugal.` em monospace, ponto roxo
- Links scrollam para secções: `#demo`, `#how`, `#pricing`
- CTA "Get early access →" → scroll para `#waitlist`
- **Zero link para GitHub ou repos externos**
- Glassmorphism: `background: rgba(10,10,15,0.85)` + `backdrop-filter: blur(20px)`

---

### SECÇÃO 2 — HERO (o hook emocional)

**Badge:**
```
● Validated on 1,437 real prompts · Open source · MIT · Zero proxy
```

**Headline (grande, bold, gradient no meio):**
```
You can build anything with AI.
Until the bill arrives.
```

**Sub-headline (honesto, directo):**
```
Every prompt you send to Claude Code costs money. The problem?
Renaming a variable costs the same as redesigning your entire architecture.
frugal fixes that — automatically, in <1ms, with zero changes to your workflow.
```

**4 métricas animadas (contador de 0 até ao valor ao entrar no viewport):**
```
90.2%     1,437      84%        <1ms
cost      prompts    run        classify
saved     validated  free       latency
```

**CTAs:**
```
[Analyse my project →]    [See how it works]
```

**Quote (em monospace, borda esquerda roxa):**
```
"You wouldn't drive a Ferrari to buy groceries."
```

---

### SECÇÃO 3 — O PROBLEMA (educar antes de vender)

**Título da secção:**
```
The vibe coder's invisible problem.
```

**Sub:**
```
You didn't realise it yet. But you will.
```

**Layout: 3 cards horizontais (a jornada em 3 actos)**

**Card 1 — "The rush"** (cor verde)
```
Icon: ⚡
Título: You discovered the superpower.

Desc: A year ago, you couldn't build a full-stack app alone.
Today you ship every week. Claude Code is your co-pilot.
You write prompts, it writes code. It feels unlimited.
```

**Card 2 — "The blind spot"** (cor amarelo/laranja)
```
Icon: 👁
Título: But every prompt costs money. Even the trivial ones.

Desc: "rename this variable" → Opus → $0.0043
"fix this typo" → Opus → $0.0038
"write a commit message" → Opus → $0.0051

These 3 prompts cost $0.013.
You'll send 120 prompts today.
That's $0.52 today. $15.60 this month.
Just for tasks that didn't need Opus.
```

**Card 3 — "The ceiling"** (cor vermelho suave)
```
Icon: 🧱
Título: And when you scale, the wall hits hard.

Desc: 10 projects × 5 developers × 200 prompts/day
= 10,000 prompts/day
= $500/day on Opus
= $15,000/month

The superpower has a price ceiling.
Most vibe coders hit it and stop building.
```

**Frase de transição (centrada, grande):**
```
The problem isn't AI. It's routing.
```

---

### SECÇÃO 4 — A SOLUÇÃO (o algoritmo explicado com honestidade)

**Título:**
```
One rule that changes everything:
use the cheapest model that gets the job done.
```

**Sub:**
```
This is what senior engineers do instinctively.
frugal does it automatically, for every single prompt, in under 1ms.
```

**Tabela de tiers (o coração da secção — design de tabela premium):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Tier    Model              Cost/prompt   When frugal uses it               │
├─────────────────────────────────────────────────────────────────────────────┤
│  T0  🟣  Ollama (local)     $0.000        Trivial: rename, format, commit   │
│  T1  🔵  Claude Haiku       ~$0.001       Simple: explain, regex, docstring  │
│  T2  🟢  Claude Sonnet      ~$0.010       Reasoning: debug, root cause, plan │
│  T3  🟡  Claude Opus        ~$0.050       Critical: deploy, .env, architecture│
└─────────────────────────────────────────────────────────────────────────────┘

84% of prompts → T0 (free)
12% of prompts → T1/T2 (cheap)
3.6% of prompts → T3 (only when genuinely needed)
```

**Como funciona o algoritmo (nunca expor código, descrever o mecanismo):**

**4 cards com o pipeline (Classify → Route → Save → Learn):**

```
01 · CLASSIFY
<1ms · Pure regex · No LLM in the hot path

frugal intercepts every prompt before Claude Code sees it.
A pure regex classifier — 165 lines, no AI, no network call —
scores the prompt across signal categories and assigns a tier
in under 1 millisecond. A SHA-256 cache means identical prompts
are never re-classified.

Tag: [classify.js · 165 lines · <1ms]

───────────────────────────────────

02 · ROUTE
Doctrine-based · Dual-enforced guardrails · Zero proxy

The routing decision is baked into Claude Code's doctrine.
frugal never sits between you and the model — it teaches
Claude Code which tier to use. HIGH_RISK patterns (deploy,
.env, rm -rf, architecture) are dual-enforced: they always
escalate to Opus, no matter what the auto-tuner learns.

Tag: [patterns.js · 46 patterns · dual-enforced]

───────────────────────────────────

03 · SAVE
90.2% reduction · Validated · Zero cherry-picking

Validated on 1,437 real production prompts across 3 projects.
$12.33 → $1.21. 84% of prompts routed to free local Ollama.
Not a simulation. Not a projection. A real replay of real usage.

Tag: [1,437 prompts · 3 projects · replay validated]

───────────────────────────────────

04 · LEARN
Daily at 02:00 · Idempotent patches · Gets smarter from you

Every night, frugal replays your decisions, finds over-routing,
and patches its own classifier. If 20 "summarise" prompts went
to Sonnet this week, tomorrow they route to Haiku.
The algorithm gets smarter from your real usage — and from
every other frugal user in the community.

Tag: [backtest.js · daily @ 02:00 · self-improving]
```

**Safety guarantee card (fundo vermelho escuro, honesto):**
```
🔒 The one rule frugal never breaks.

HIGH_RISK patterns always escalate to Opus.
No matter what the auto-tuner learns, these never get demoted:

[git push --force] [rm -rf] [drop table] [.env · secrets]
[deploy · release] [migration] [reset --hard] [architecture]

Dual-enforced: in the classifier AND in the learning loop.
If frugal dies, Claude Code falls back to its default behaviour instantly.
Zero blast radius.
```

---

### SECÇÃO 5 — DEMO TERMINAL (side-by-side, animado)

**Título:**
```
Watch the router decide — live.
```

**Sub:**
```
Same 3 prompts. Two realities.
```

**Terminal ESQUERDO — "Without frugal"** (borda vermelha)
Tag: `Opus for everything`
```
❯ git commit -m "fix: button color"

  ⠸ Sending to Claude Opus 4…
    model: claude-opus-4  tokens_in: 2,847

  this prompt         → $0.0043
  120 prompts/day     → $0.52/day
  monthly estimate    → $15.60/mo

❯ # rename a variable…
  ⠸ Sending to Claude Opus 4…
  rename variable     → $0.0038

❯ # "explain this error"
  ⠸ Sending to Claude Opus 4…
  explain error       → $0.0051

■ 3 prompts · $0.0132 · Opus for everything
```
Status: `● Opus only` `● $0.52/day` `● $15.60/mo` `● 0% free`

**Terminal DIREITO — "With frugal"** (borda verde)
Tag: `Routed automatically`
```
❯ git commit -m "fix: button color"

  ⚡ frugal · TRIVIAL · conf 0.97 · <1ms
    → T1: claude-haiku-4-5  [25× cheaper]

  this prompt         → $0.00017
  saved vs Opus       → −96%

❯ # rename a variable…
  ⚡ frugal · T0-inline · conf 0.99 · <1ms
    → T0: ollama qwen3:30b  [free local 🆓]
  rename variable     → $0.000

❯ # "explain this error"
  ⚡ frugal · T1 · conf 0.88 · <1ms
    → T1: claude-haiku-4-5
  explain error       → $0.00019

  T0 free   ████████████████ 84%
  T1 Haiku  ██               10%
  T2 Sonnet █                5%
  T3 Opus   ░                1%

■ 3 prompts · $0.00036 · 84% free · −97%
```
Status: `● frugal active` `● $0.054/day` `● $1.62/mo` `● 84% free`

**Tabela de custos** (abaixo dos terminais):
```
Task                    Without    →    With         Tier         Saving
──────────────────────────────────────────────────────────────────────────
git commit message      $0.0043    →   $0.00017     T1 Haiku     −96%
rename variable         $0.0038    →   $0.000       T0 Ollama    −100%
explain this error      $0.0051    →   $0.00019     T1 Haiku     −96%
debug race condition    $0.0062    →   $0.0018      T2 Sonnet    −71%
redesign auth system    $0.018     →   $0.018       T3 Opus ✓    0%  ← correctly Opus
```

---

### SECÇÃO 6 — URL ANALYSER (id="analyse")

**Título:**
```
See your numbers.
```

**Sub:**
```
Paste your project URL. frugal detects your stack, estimates your tier distribution,
and shows exactly how much you'd save — based on real backtest data, not guesses.
```

**Form:**
- Input longo com ícone 🔍
- Placeholder: `https://yourapp.vercel.app  ·  https://github.com/you/project  ·  https://yourdomain.com`
- Botão: "Analyse →" (purple, desactivado se vazio)
- Exemplos clicáveis: `vercel.com` · `nextjs.org` · `railway.app`

**Loading:** terminal animado com 7 steps progressivos

**ResultCard** (fadeUp após análise):

Row 1 — 2 colunas:
- **Stack card**: Platform / Framework / Language / LLM signals detectados
- **Savings card**: número grande em gradient (savings_pct%), "≈ $X/mo saved", confidence bar, meta info

Row 2 — full width:
- **Tier breakdown**: 4 barras coloridas + percentagens + footnote sobre T0/T3

Row 3 — 2 colunas:
- **Suggestions**: lista de recomendações específicas para o stack detectado
- **CTA card**: domínio analisado + "Save ~$X/mo starting today" + 3 proof bullets + botão "Get early access →"

---

### SECÇÃO 7 — COMUNIDADE E APRENDIZAGEM COLECTIVA

**Título:**
```
The more you use it, the smarter it gets.
For everyone.
```

**Sub:**
```
frugal's algorithm improves from every prompt decision — anonymously, privately,
and collectively. You're not just saving money. You're teaching the router.
```

**3 cards horizontais:**

**Card 1 — "Your usage trains the router"**
```
Icon: 🧠
Every night at 02:00, frugal replays your decisions.
Finds over-routing patterns. Patches its own classifier.
Gets better at your specific workflow, your team's language,
your project's prompt patterns.
```

**Card 2 — "Privacy-first federated learning"**
```
Icon: 🔒
Only anonymised signals are shared — never your actual prompts.
Keyword allowlist. Prompt length bucketed. Hardware tier only.
Instance ID hashed with SHA-256. Your code never leaves your machine.
```

**Card 3 — "312 developers already contributing"**
```
Icon: 🌐
Every frugal installation sends anonymous routing deltas
to a shared pool. The community's collective routing intelligence
makes everyone's classifier more accurate — including yours.
The more people join, the smarter frugal gets for everyone.
```

**Statusline preview card** (monospace, overflow horizontal):
```
Live statusline — after every Claude Code prompt

⬆ main·a1b2 │ 🐕 frugal v0.9 │ [T1] hku 0.3s │ qwn 84%·hku 10%·son 5%·ops 1% │ 💰 $1.21 (90%↑) ▓▓▓▓▓▓▓░░░ │ 💻 RTX 4090 ▓▓░ 61% │ ●●◐○○○

[git branch] [frugal brand] [last turn tier] [session distribution] [savings + budget bar] [GPU usage] [provider dots]
```

---

### SECÇÃO 8 — PROVA SOCIAL (números reais)

**Título:**
```
Real numbers. Real prompts. No projections.
```

**6 cards com contadores animados:**

```
90.2%              84%              94%
Cost saved         Prompts free     Backtest accuracy
────────────       ────────────     ──────────────────
Real replay        1,150 of 1,437   95% of decisions
$12.33 → $1.21     needed zero      high-confidence
on 1,437 prompts   API spend        (conf ≥ 0.6)

<1ms               10 min           59/59
Classify latency   To tune          Tests passing
────────────       ────────────     ──────────────────
Pure regex         Run replay.js    node:test
No LLM             on your own      Zero external
SHA-256 cache      Claude history   frameworks
```

---

### SECÇÃO 9 — PRICING (id="pricing", o momento da conversão)

**Este é o momento mais importante. A sensação tem de ser: "Estou a pagar muito menos do que poupo."**

**Título:**
```
Pay less than you save.
That's the only pricing model that makes sense.
```

**Sub:**
```
frugal is free to install and run. The community tier is always free.
Pro is a success fee — you only pay when you're already saving.
```

**Layout: 3 planos lado a lado**

```
┌──────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│   COMMUNITY      │  │      PRO             │  │      TEAM            │
│   Free forever   │  │   $9/mo              │  │   $29/mo per seat    │
│                  │  │                      │  │                      │
│ ✓ Full router    │  │ Everything in Free + │  │ Everything in Pro +  │
│ ✓ T0-T3 tiers   │  │ ✓ Dashboard          │  │ ✓ Shared router      │
│ ✓ Auto-tuning   │  │ ✓ Cost tracking      │  │ ✓ Team analytics     │
│ ✓ MIT license   │  │ ✓ Budget alerts      │  │ ✓ Org-wide tuning    │
│ ✓ Community      │  │ ✓ Priority support   │  │ ✓ SLA 99.9%          │
│   learning       │  │ ✓ Export decisions   │  │ ✓ Private hub        │
│                  │  │                      │  │                      │
│ [Get started →]  │  │ [Start free trial →] │  │ [Talk to us →]       │
└──────────────────┘  └──────────────────────┘  └──────────────────────┘
           ↑ highlighted border no plano PRO
```

**Abaixo dos planos — o frame mental do pricing:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  The math is simple.                                                │
│                                                                     │
│  Average frugal user saves $44/month on Claude Code.               │
│  Pro costs $9/month.                                                │
│                                                                     │
│  You keep $35 every month.                                          │
│  frugal takes $9.                                                   │
│                                                                     │
│  That's not a subscription. That's a success fee.                  │
│  We only make sense if you're already saving.                       │
└─────────────────────────────────────────────────────────────────────┘
```

**FAQ de pricing (3 perguntas, toggle expand):**

```
Q: Is frugal open source?
A: Yes. The full router, classifier, and backtest loop are MIT-licensed.
   You can self-host everything for free, forever. Pro adds the dashboard,
   budget tracking, and managed tuning — not the core algorithm.

Q: What if I don't save money?
A: You won't be charged. We offer a 30-day full refund, no questions.
   If frugal isn't saving you money, it's not doing its job.

Q: How is $9/mo calculated?
A: Average user saves ~$44/mo. We take roughly 20% as a success fee.
   As we learn more about your usage and routing improves, you save more.
   The better frugal gets, the more you save — and the more we earn.
   Aligned incentives, by design.
```

---

### SECÇÃO 10 — WAITLIST (id="waitlist")

**Título:**
```
Join the waitlist.
Be part of building the smartest LLM router on the planet.
```

**Sub:**
```
Early access: full router + installer + VS Code extension.
Free and open source. MIT license. Your prompts never leave your machine.
```

**Form:**
- Email input (required)
- URL input (optional) com label "Your project URL — we'll pre-calculate your exact savings"
- Botão: "Get early access →" (gradient, full width)
- Counter dinâmico: "Join X developers already on the waitlist"

**Success state:**
```
✓ (check animado verde)
You're on the list.
Developer #X · we'll be in touch.
```

**4 features grid (2×2):**
```
⚡ One-command install        🔒 Zero proxy
bash install.sh               Your prompts never
No ports, no daemons          leave your machine

🔄 Self-improving             🌐 Community-powered
Tunes itself every night      312 devs contributing
from your real usage          to the shared router
```

---

### SECÇÃO 11 — FOOTER

```
frugal · MIT License · Made with obsession by Paulo Loureiro

[How it works] [Analyse project] [Pricing] [Early access]

"The best infrastructure is the kind you never have to think about."
```

**Zero links para GitHub ou repos externos.**

---

## COPY RULES (obrigatórias)

### Tom de voz

- **Honesto** — números reais, nunca inventados. Usa exactamente: 90.2%, 1,437 prompts, 84%, <1ms, 94%, 312 users, 59/59, $12.33→$1.21
- **Educativo** — trata o leitor como inteligente mas não técnico. Explica o porquê antes do como
- **Directo** — frases curtas. Paragrafos de max 3 linhas. Sem jargão desnecessário
- **Empático** — o leitor não é burro por não saber isto. Ninguém lhe ensinou
- **Confiante** — não pede desculpas, não sobre-promete. Os números falam por si

### Frases proibidas (não usar)
- "Doctrine-based routing" (diz "automatic tier selection")
- "Zero-cost classification" (diz "free, in <1ms")
- "Mediator doctrine" (diz "routing rules")
- "Blast radius" (reservado para safety card, não usar em copy geral)
- "T0/T1/T2/T3" em copy corrido (usar só nas tabelas de tier)

### Números reais (usar exactamente estes)
| Métrica | Valor |
|---------|-------|
| Cost saved | 90.2% |
| Prompts validated | 1,437 |
| T0 routing | 84% |
| T3 routing | 3.6% |
| Backtest confidence | 94% |
| Community users | 312 |
| Tests passing | 59/59 |
| Cost before frugal | $12.33 |
| Cost after frugal | $1.21 |
| Classify latency | <1ms (ou <50ms em contexto técnico) |
| Daily tuning | 02:00 daily |
| Pro pricing | $9/mo |
| Team pricing | $29/mo per seat |
| Average savings | $44/mo |

### Segurança
- **Zero links para GitHub** — zero `github.com/pauloloureiroshp`
- **Zero menção a ficheiros internos** (classify.js, patterns.js podem aparecer como tags em cards técnicos, mas nunca linkados)
- **Zero exposição de env vars, Supabase keys, ou infraestrutura interna**

---

## IMPLEMENTAÇÃO TÉCNICA

### Estrutura de componentes sugerida

```typescript
// Utilities
class ErrorBoundary extends Component { ... }
function useInView(threshold = 0.2): [RefObject<HTMLDivElement>, boolean] { ... }
function useCountUp(target: number, active: boolean): number { ... }

// UI atoms
function Stat({ n, suf, pre, label, sub, color }: ...) { ... }
function Chip({ children, variant }: ...) { ... }

// Terminal
function TerminalWindow({ title, tag, tagColor, lines, statusItems }: ...) { ... }

// Sections (cada uma com ErrorBoundary)
function Nav() { ... }
function Hero() { ... }
function TheProblem() { ... }       // NOVO — vibe coder journey
function TheSolution() { ... }      // Tiers + algorithm
function TerminalDemo() { ... }     // Side-by-side
function UrlAnalyser() { ... }      // Form + result card
function CommunityLearning() { ... } // NOVO — federated learning
function SocialProof() { ... }      // 6 métricas
function Pricing() { ... }          // NOVO — success fee
function Waitlist() { ... }
function Footer() { ... }

// Main
export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <ErrorBoundary><Hero /></ErrorBoundary>
        <ErrorBoundary><TheProblem /></ErrorBoundary>
        <ErrorBoundary><TheSolution /></ErrorBoundary>
        <ErrorBoundary><TerminalDemo /></ErrorBoundary>
        <ErrorBoundary><UrlAnalyser /></ErrorBoundary>
        <ErrorBoundary><CommunityLearning /></ErrorBoundary>
        <ErrorBoundary><SocialProof /></ErrorBoundary>
        <ErrorBoundary><Pricing /></ErrorBoundary>
        <ErrorBoundary><Waitlist /></ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
```

### Animações obrigatórias

1. **Contadores** — `useCountUp` com `useInView`, arrancar de 0 ao entrar no viewport
2. **Terminal** — linha a linha com delays: cmd=120ms, out=60ms, gap=300ms — com cleanup
3. **Pill pulsante** no hero — `animation: pulse 2s ease-in-out infinite`
4. **ResultCard** — `animation: fadeUp 0.4s ease` ao aparecer
5. **Pricing cards** — hover com `transform: translateY(-4px)` no Pro
6. **Success state waitlist** — `animation: pop 0.4s ease` no check

### Responsivo (breakpoints)

```css
@media (max-width: 900px) { /* terminal side-by-side → tabs toggle */ }
@media (max-width: 720px) { /* hero stats 2 cols */ }
@media (max-width: 640px) { /* tudo mobile, nav links ocultos excepto CTA */ }
```

---

## CHECKLIST FINAL ANTES DE COMMIT

- [ ] `tsc --noEmit` passa sem erros
- [ ] Zero links para `github.com/pauloloureiroshp`
- [ ] Todos os useEffect têm cleanup function
- [ ] ErrorBoundary envolve todas as secções
- [ ] Pricing section existe com 3 planos + success fee frame
- [ ] TheProblem section existe com a jornada vibe coder
- [ ] CommunityLearning section existe com federated learning
- [ ] Números no copy batem com a tabela de métricas acima
- [ ] `reactStrictMode: false` em next.config.ts
- [ ] Mobile responsivo (testar em 375px)
- [ ] `next build` passa sem warnings críticos
- [ ] Deploy: `npx vercel --prod`

---

## ENTREGÁVEIS

1. `landing/app/page.tsx` — reescrito do zero (~900 linhas)
2. `landing/app/globals.css` — reescrito do zero (~650 linhas)
3. Zero erros TypeScript
4. Zero crashes client-side
5. 11 secções implementadas na ordem especificada
6. `npx vercel --prod` bem sucedido
