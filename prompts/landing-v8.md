# LANDING_MASTER_PROMPT_V8.md
# frugal — Landing Page v8 — Full Rewrite
# Master Prompt para Claude Code

> **Contexto**: A landing actual (landing/app/page.tsx, 846 linhas) tem boa estrutura técnica — ErrorBoundary, Reveal, SVG logos, supabase waitlist funcional. O problema é de conteúdo e UX: o CTA principal é waitlist (queremos Install Now), não há live counters da comunidade, não há secção de slash commands/UX pós-instalação, e a hierarquia de valor não está clara o suficiente para um vibe coder que chegou via HN ou Reddit. Esta versão resolve tudo isso.

---

## OBJETIVO DESTA SESSÃO

Reescrever `landing/app/page.tsx` (mantendo a infra técnica existente) para:

1. **CTA principal**: Install Now (bash command copiável) — não waitlist
2. **Live counters**: dados reais do frugal-hub API (`/api/stats`) com fallback para valores validados
3. **Secção pós-instalação**: mostrar os slash commands e a vida real após instalar
4. **Hierarquia clara**: 3 segundos para perceber o valor, 10 para querer instalar
5. **Mobile-first**: funciona em iPhone sem scroll horizontal
6. **Sem quebrar**: manter ErrorBoundary, Reveal, SVG logos, supabase waitlist, next.config.ts com `reactStrictMode: false`

---

## ESTRUTURA — 10 SECÇÕES (ordem obrigatória)

```
S1  NAV           — minimal sticky dark
S2  HERO          — headline + live counters + Install Now CTA
S3  THE PROBLEM   — sound familiar? 3 beats
S4  THE SOLUTION  — o que o frugal faz (4 pilares)
S5  DE-PARA DEMO  — without vs with frugal (3 prompts animados)
S6  AFTER INSTALL — a vida real pós-instalação: statusline + slash commands
S7  THE PROOF     — números validados + replay.js
S8  COMMUNITY     — privacy-first flywheel
S9  PRICING       — free + pro ($9) + team + guarantee
S10 FOOTER        — minimal + version
```

---

## S1 — NAV

**Idêntico ao actual.** Manter o código existente. Sticky, dark, `🐕 frugal` à esquerda, links à direita.

Adicionar apenas: link `After install` apontando para a nova secção S6.

```
🐕 frugal    How it works  After install  Proof  Pricing
```

---

## S2 — HERO (REESCREVER COMPLETAMENTE)

**Layout:** Full viewport, centrado, background #0d1117 (dark).

### H1 — dois tamanhos, bold, clamp(2.8rem, 5vw, 5.5rem):

```
The right model.
For every prompt. Automatically.
```

### Sub (max-width 520px, centrado, cor #8b949e):

```
frugal is a Claude Code router. It classifies every prompt in <50ms
and sends it to Ollama (free), Haiku, Sonnet, or Opus — only when each is needed.
No proxy. No interception. Zero blast radius.
```

### Live Counters Bar (NOVO — debaixo do sub, antes dos CTAs):

```
┌──────────────────────────────────────────────────────────────┐
│  [animated number] prompts routed  ·  [animated number]% saved  ·  $[animated] saved total  │
└──────────────────────────────────────────────────────────────┘
```

**Implementação dos live counters:**

```typescript
// Hook para buscar stats do hub
function useCommunityStats() {
  const [stats, setStats] = useState({
    prompt_count: 1437,   // fallback: número real validado
    savings_pct: 90.2,    // fallback
    savings_usd: 6.29,    // fallback: número real da máquina de Paulo
    user_count: 1,        // fallback
  });
  const [live, setLive] = useState(false);

  useEffect(() => {
    fetch('https://frugal-hub.workers.dev/api/stats', {
      signal: AbortSignal.timeout(3000),
    })
      .then(r => r.json())
      .then(data => {
        if (data?.prompt_count) {
          setStats({
            prompt_count: data.prompt_count,
            savings_pct: data.avg_savings_pct ?? 90.2,
            savings_usd: data.total_savings_usd ?? 6.29,
            user_count: data.user_count ?? 1,
          });
          setLive(true);
        }
      })
      .catch(() => {}); // silencioso — usa fallback
  }, []);

  return { stats, live };
}

// Componente de número animado (count-up de 0 ao valor)
function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = value;
    const duration = 1200;
    const step = (end / duration) * 16;
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplay(end); clearInterval(timer); return; }
      setDisplay(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{prefix}{decimals > 0 ? display.toFixed(decimals) : Math.floor(display).toLocaleString()}{suffix}</span>;
}
```

**Visual dos counters:**

```
┌─────────────────────────────────────────────────────────────────┐
│  🔢 1,437        📊 90.2%        💰 $6.29            🌐 live   │
│  prompts routed  avg savings     saved by community   (ou ●)   │
└─────────────────────────────────────────────────────────────────┘
```

- Background: rgba(255,255,255,0.04), border: 1px solid rgba(255,255,255,0.08)
- Se `live=true`: mostrar indicator verde `● live` à direita
- Se `live=false`: mostrar nada (usa os fallbacks silenciosamente, sem "offline" visible)
- Cada número faz count-up ao aparecer (IntersectionObserver já existe no Reveal)

### CTAs (NOVO — Install Now como primário):

```
[📋 Copy install command]    [⭐ Star on GitHub]
```

**Botão primário — Copy install command:**
- Ao clicar: copia `bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)` para clipboard
- Texto do botão muda para `✓ Copied!` por 2s e volta
- Abaixo do botão: mostra o comando em mono, cor #3fb950 (verde), fundo #0d1117, border #30363d

```tsx
const INSTALL_CMD = 'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)';

function CopyButton() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="install-block">
      <button className="btn btn-primary" onClick={copy}>
        {copied ? '✓ Copied!' : '📋 Copy install command'}
      </button>
      <div className="install-cmd mono">{INSTALL_CMD}</div>
      <div className="install-note">Requires: Node.js ≥18 · Claude Code · Ollama (optional)</div>
    </div>
  );
}
```

### Provider logos row (manter do actual):

Manter a row de logos SVG inline: Anthropic, Ollama, OpenAI, Google, Mistral, Grok, Codex.

---

## S3 — THE PROBLEM (manter estrutura, actualizar copy)

**Título:** `Sound familiar?`

Três cards horizontais (mobile: stacked):

**Card 1 — 💸 "Your bill is Opus-sized"**
```
You pay for the most powerful model on every single prompt.
The git commit message. The variable rename. The copy-paste check.
All of it, billed at the highest tier.
```

**Card 2 — 🎰 "You don't control the model"**
```
Claude Code picks the model. You cross your fingers.
Some prompts get Opus when they needed Haiku.
Some get Haiku when they needed Opus. You never know which.
```

**Card 3 — 🔒 "You're locked into one provider"**
```
Your RTX 4090 sits idle. Your Claude Max limits hit at 3pm.
You have alternatives — Ollama, Gemini, GPT — but nothing orchestrates them.
```

---

## S4 — THE SOLUTION (REESCREVER — 4 pilares em grid 2×2)

**Título:** `What frugal actually does`

**Sub:** `One install. Every prompt classified in <50ms. Nothing intercepted. Nothing proxied.`

Grid 2×2, cards com ícone + título + 2 linhas:

```
┌────────────────────────┬────────────────────────┐
│ 🧠 Classifies every   │ 💻 Detects your        │
│ prompt in <50ms        │ hardware automatically  │
│                        │                         │
│ 11-pass regex engine.  │ RTX 4090? M3 Pro?       │
│ Zero LLM, zero cost.   │ Ollama gets the best    │
│ ~90% accuracy.         │ model for your VRAM.    │
├────────────────────────┼────────────────────────┤
│ 📋 Knows your          │ 🔄 Gets smarter with   │
│ subscription plan      │ every user              │
│                        │                         │
│ Claude Max? No cap.    │ Community deltas improve│
│ API-only? Conservative.│ the classifier for all. │
│ Time-aware routing.    │ Your prompts: never shared.│
└────────────────────────┴────────────────────────┘
```

Abaixo do grid, a linha de arquitectura em mini (manter do actual):

```
prompt → inject_context.js → classify.js (<50ms) → [arbiter se dúvida] → <router-hint> → CLAUDE.md
```

---

## S5 — DE-PARA DEMO (manter estrutura, ajustar copy)

**Manter o código actual do DemoSection.** É bom. Apenas:
- Verificar que o 3º prompt (arquitectura) vai para Opus nos dois lados — mantém a honestidade
- Adicionar legenda: `"The last prompt still went to Opus — because it needed Opus."`

---

## S6 — AFTER INSTALL (NOVA SECÇÃO — inserir entre S5 e S7)

**Título:** `After install, this is your life`

**Sub:** `Everything works. Nothing changes. Except your bill.`

Esta secção tem **3 sub-blocos**:

### Sub-bloco A — Statusline (manter do actual StatuslineSection)

Mostrar a statusline real tal como está. Manter o código existente.

### Sub-bloco B — Slash Commands (NOVO)

```
⚡ Six commands. Everything you need to know about your router.
```

Grid de 6 cards (3×2, mobile 2×3 ou 1×6):

```
/frugal-status      /frugal-savings     /frugal-route
See if everything   Full economic        Classify any task
is running          report               before you run it

/frugal-summary     /frugal-update      /router
What the router     Pull latest from     Quick routing
decided this        GitHub + sync        recommendation
session             classifier
```

**Cada card:**
- Background: rgba(255,255,255,0.03)
- Border: 1px solid rgba(255,255,255,0.08)
- Top: `<span class="cmd-tag">/frugal-status</span>` em verde mono
- Bottom: 1 linha de descrição em muted

**Implementação:**
```tsx
const COMMANDS = [
  { cmd: '/frugal-status',  desc: 'Health check: hook, Ollama, hub, last decisions' },
  { cmd: '/frugal-savings', desc: 'Economic report: saved so far + annual projection' },
  { cmd: '/frugal-route',   desc: 'Classify any task before you run it' },
  { cmd: '/frugal-summary', desc: 'What the router decided this session, and why' },
  { cmd: '/frugal-update',  desc: 'Pull latest from GitHub + sync classifier' },
  { cmd: '/router',         desc: 'Quick on-demand routing recommendation' },
];
```

### Sub-bloco C — "What happens on day 1, week 1, month 1" (timeline)

Timeline horizontal (mobile: vertical), 3 pontos:

```
Day 1                    Week 1                  Month 1+
─────                    ──────                  ───────
Install runs.            Backtest runs            Community tuning
Hardware detected.       at 2am. Classifier       arrives via hub-pull.
Profile set.             patches itself.          Your savings grow.
First prompt             You've already           You're contributing
classified.              saved $X.                to the shared model.
```

---

## S7 — THE PROOF (manter, actualizar números)

Manter a estrutura e o código actual. Actualizar:
- `90%` → `90.2%`
- `83%` → `83.9%`
- `4%` → `3.6%`
- Adicionar: `<50ms hook latency (p50: 113ms)`

---

## S8 — COMMUNITY LOOP (manter, adicionar live counter)

Manter o código existente do CommunitySection. Adicionar antes do privacy-card:

```tsx
<Reveal>
  <div className="community-stats">
    <div className="cs-stat">
      <AnimatedNumber value={stats.prompt_count} />
      <span>prompts contributed to shared classifier</span>
    </div>
    <div className="cs-stat">
      <AnimatedNumber value={stats.user_count} />
      <span>machines improving the model</span>
    </div>
  </div>
</Reveal>
```

---

## S9 — PRICING + ACCESS (REESCREVER CTA — Install Now em vez de só waitlist)

### Manter os 3 cards de pricing (Community free / Pro $9 / Team $29).

### Substituir o form de waitlist por um flow dual:

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│          Install now — it's free                         │
│                                                          │
│  [📋 Copy install command]                              │
│  bash <(curl -fsSL .../install.sh)                      │
│                                                          │
│  Requires: Node.js ≥18 · Claude Code · Ollama (opt.)   │
│                                                          │
│  ──────── or ────────                                    │
│                                                          │
│  Join the beta waitlist (for Pro / Team early access)   │
│  [email input] [hardware dropdown] [ai subs chips]      │
│  [Request early access]                                 │
└──────────────────────────────────────────────────────────┘
```

**O form de waitlist existente fica intacto** — apenas como secundário, debaixo do install block. Manter toda a lógica de submit, estados idle/loading/done/error.

**Título da secção:** `Free to use. You pay only when we save you money.`

**Guarantee box** (manter): `Pro costs $9. The average Pro user saves $23. If you don't save at least $9, you don't pay.`

---

## S10 — FOOTER (actualizar versão)

```
🐕 frugal · built by Paulo Loureiro · v0.9.2
GitHub · Security · NOTICE · /frugal-status after install
```

---

## ESTILOS NOVOS A ADICIONAR

Adicionar ao bloco `<style>` do layout.tsx ou no CSS global:

```css
/* Live counters */
.hero-counters {
  display: flex;
  gap: 32px;
  justify-content: center;
  align-items: center;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 16px 32px;
  margin: 32px auto;
  max-width: 600px;
  flex-wrap: wrap;
}
.counter-item {
  text-align: center;
}
.counter-num {
  font-size: 28px;
  font-weight: 700;
  color: #3fb950;
  display: block;
  font-variant-numeric: tabular-nums;
}
.counter-label {
  font-size: 11px;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.live-dot {
  width: 6px; height: 6px;
  background: #3fb950;
  border-radius: 50%;
  display: inline-block;
  margin-right: 4px;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Install block */
.install-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 32px;
}
.install-cmd {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px 20px;
  color: #3fb950;
  font-size: 13px;
  max-width: 100%;
  overflow-x: auto;
  white-space: nowrap;
  cursor: pointer;
  user-select: all;
}
.install-note {
  font-size: 11px;
  color: #8b949e;
}

/* Slash commands grid */
.slash-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 32px;
}
@media (max-width: 640px) {
  .slash-grid { grid-template-columns: 1fr 1fr; }
}
.slash-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.2s;
}
.slash-card:hover { border-color: rgba(63,185,80,0.4); }
.slash-cmd {
  font-family: 'SF Mono', monospace;
  font-size: 12px;
  color: #3fb950;
  font-weight: 600;
  margin-bottom: 6px;
  display: block;
}
.slash-desc {
  font-size: 12px;
  color: #8b949e;
  line-height: 1.4;
}

/* After-install timeline */
.timeline {
  display: flex;
  gap: 0;
  margin-top: 40px;
  position: relative;
}
.timeline::before {
  content: '';
  position: absolute;
  top: 20px; left: 80px; right: 80px;
  height: 1px;
  background: linear-gradient(to right, #30363d, #3fb950, #30363d);
}
@media (max-width: 640px) {
  .timeline { flex-direction: column; }
  .timeline::before { top: 0; left: 20px; right: auto; bottom: 0; width: 1px; height: auto; }
}
.tl-item {
  flex: 1;
  text-align: center;
  padding: 0 16px;
  padding-top: 48px;
  position: relative;
}
.tl-dot {
  width: 12px; height: 12px;
  background: #3fb950;
  border-radius: 50%;
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
}
.tl-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #3fb950;
  margin-bottom: 8px;
}
.tl-content {
  font-size: 12px;
  color: #8b949e;
  line-height: 1.5;
}

/* Community stats */
.community-stats {
  display: flex;
  gap: 32px;
  justify-content: center;
  margin: 32px 0;
  flex-wrap: wrap;
}
.cs-stat {
  text-align: center;
}
.cs-stat strong {
  display: block;
  font-size: 32px;
  font-weight: 700;
  color: #3fb950;
}
.cs-stat span {
  font-size: 12px;
  color: #8b949e;
}
```

---

## COMPONENTES A MANTER SEM ALTERAÇÃO

- `ErrorBoundary` class component
- `useInView` hook
- `Reveal` component
- `scrollTo` helper
- Todos os SVG logos (AnthropicIcon, OllamaIcon, etc.)
- `DemoSection` completo (S5)
- `StatuslineSection` completo (sub-bloco A de S6)
- `ProofSection` completo (S7, apenas actualizar números)
- `CommunitySection` completo (S8, apenas adicionar community-stats)
- Form de waitlist em `PricingAccess` (manter toda a lógica — apenas adicionar Install block acima)
- `Footer` (apenas actualizar versão para v0.9.2)

---

## NOVOS COMPONENTES A CRIAR

```typescript
// Novo
function useCommunityStats() { ... }     // hook para /api/stats
function AnimatedNumber() { ... }        // count-up animado
function CopyButton() { ... }            // copia install command + feedback
function InstallBlock() { ... }          // CTA install completo
function SlashCommandsGrid() { ... }     // grid de 6 slash commands
function AfterInstallTimeline() { ... }  // day1 / week1 / month1
function AfterInstallSection() { ... }   // S6 completa (wraps StatuslineSection + SlashCommandsGrid + Timeline)
```

---

## ORDEM DE IMPLEMENTAÇÃO (para o Claude Code)

1. Adicionar `useCommunityStats()` e `AnimatedNumber()` no topo do ficheiro (depois dos imports)
2. Reescrever `Hero()` — live counters + CopyButton + InstallBlock
3. Actualizar `Nav()` — adicionar link "After install"
4. Criar `AfterInstallSection()` — Statusline + SlashCommandsGrid + Timeline
5. Actualizar `PricingAccess()` — adicionar InstallBlock antes do form de waitlist
6. Actualizar `ProofSection()` — corrigir números (90.2%, 83.9%, 3.6%)
7. Actualizar `CommunitySection()` — adicionar community-stats antes do privacy-card
8. Actualizar `Footer()` — versão para v0.9.2
9. Adicionar os novos estilos ao CSS (layout.tsx ou globals.css)
10. Inserir `<ErrorBoundary><AfterInstallSection /></ErrorBoundary>` entre DemoSection e ProofSection no Page()
11. Testar: `npm run dev` → verificar mobile + desktop + fallback dos counters

---

## VERIFICAÇÕES ANTES DE COMMITAR

```bash
# TypeScript sem erros
npx tsc --noEmit

# Build limpo
npm run build

# Mobile (simular viewport 375px)
# → counters não quebram linha estranha
# → install-cmd não causa scroll horizontal
# → slash-grid fica 2 colunas

# Hub offline (testar fallback)
# → desligar internet
# → counters mostram 1,437 / 90.2% / $6.29 (sem erro, sem "offline" visible)
# → live dot não aparece (correcto)

# Copy button
# → clicar → texto muda para "✓ Copied!" por 2s
# → comando correcto no clipboard
```

---

## COMMIT

```bash
git add landing/app/page.tsx landing/app/layout.tsx
git commit -m "feat(landing v8): Install Now CTA + live counters + slash commands + after-install UX"
```

---

## NOTA SOBRE O HUB API (enquanto L1 não está deployed)

O `useCommunityStats()` usa `fetch('https://frugal-hub.workers.dev/api/stats')` com timeout 3s. Enquanto o hub não está deployed:
- O fetch vai falhar silenciosamente
- Os counters mostram os valores de fallback (1,437 prompts, 90.2%, $6.29)
- O `live` indicator não aparece — os números aparecem sem o ponto verde
- **Comportamento correcto e honesto** — os valores de fallback são reais e validados

Quando L1 estiver deployed, os counters passam a mostrar dados reais da comunidade automaticamente — sem nenhuma mudança de código.

---

## RESULTADO ESPERADO

Um vibe coder que chega à landing:
- **3 segundos**: percebe o que é o frugal e vê números reais (1,437 prompts, 90.2%)
- **10 segundos**: vê a demo before/after e entende o impacto
- **20 segundos**: copia o install command e está a instalar
- **Após instalar**: sabe exactamente o que espera (`/frugal-status`, statusline, timeline)
- **Passado 1 mês**: está a contribuir para o classificador comunitário — sem saber que o faz
