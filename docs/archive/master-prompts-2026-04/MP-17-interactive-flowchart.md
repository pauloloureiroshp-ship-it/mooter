# MP-17 — Fluxograma Interactivo: "How frugal works"

**Objectivo:** Criar uma tab "How it works" no dashboard com um fluxograma animado e interactivo que mostra o caminho completo de cada prompt — desde o input até ao modelo certo — com dados reais do utilizador, tooltips explicativos, e a sensação de que algo mágico e sofisticado está a trabalhar em segundo plano.

**Localização:** Nova tab no dashboard `(app)/dashboard/page.tsx` — substituir/expandir a tab "Metrics" actual ou adicionar como 4ª tab "How it works".

**Princípio de design:** Visual-first, dados reais, zero dependências externas. Animações em CSS puro. SVG inline para os nós do fluxo. Tudo self-contained no ficheiro do dashboard.

---

## ARQUITECTURA DO FLUXO A MOSTRAR

O fluxograma representa o pipeline real do frugal, com 6 etapas:

```
[1. PROMPT ENTRA]
      ↓
[2. PRÉ-PROCESSAMENTO LOCAL]   ← ~1ms — no teu computador
      ↓
[3. CLASSIFY.JS < 50ms]        ← regex + heurísticas, zero LLM
      ↓
[4. SIGNAL EXTRACTION]         ← 7 features extraídas do prompt
      ↓
[5. TIER DECISION]             ← T0 / T1 / T2 / T3
      ↓
[6. MODELO CERTO]              ← Ollama / Haiku / Sonnet / Opus
```

---

## CONTEÚDO DE CADA NÓ (tooltips + descrição)

### NÓ 1 — "Your prompt"
- **Label:** `Your prompt`
- **Sublabel:** `The question you typed`
- **Tooltip:** "Every message you send in Claude Code passes through frugal before reaching any model. Nothing is sent to any LLM until frugal decides which one."
- **Ícone:** cursor / keyboard SVG

### NÓ 2 — "Pre-processing" (LOCAL)
- **Label:** `Pre-processing`
- **Badge:** `LOCAL · ~1ms`
- **Tooltip:** "frugal normalizes your prompt locally — strips noise, detects language (PT/EN), identifies code blocks, file references, error traces, and URLs. Zero data leaves your machine at this step."
- **Detalhes visíveis:**
  - `language detection` — PT / EN / other
  - `code block?` — yes / no
  - `file refs` — count
  - `error trace?` — yes / no
- **Ícone:** chip / processor SVG

### NÓ 3 — "classify.js" (CORE)
- **Label:** `classify.js`
- **Badge:** `< 50ms · zero LLM`
- **Cor:** destaque em `--accent` (#4ec9b0) — é o coração do sistema
- **Tooltip:** "The router. Pure regex heuristics, no AI involved. Reads 40+ patterns across HIGH_RISK, MED_RISK, LOW_RISK, and TRIVIAL signal buckets. Trained on 230 real decisions from your own usage. Complexity threshold: 0.25."
- **Detalhes visíveis:**
  - `230 samples trained`
  - `40+ patterns`
  - `SHA-256 cache (30min TTL)`
- **Ícone:** lightning bolt SVG

### NÓ 4 — "Signal Extraction" (REASONING STEP)
- **Label:** `Signal extraction`
- **Badge:** `7 features`
- **Tooltip:** "Before routing, frugal extracts boolean/numeric features from the prompt: has_code_block, has_file_refs, has_error_trace, is_question, has_url, lang_detected, file_ref_count. These feed the complexity score and future auto-learning."
- **Features mostradas como pills animados:**
  - `has_code_block`
  - `has_file_refs`
  - `has_error_trace`
  - `lang_detected`
  - `quality_intent`
  - `complexity_score`
  - `risk_level`
- **Ícone:** magnifying glass / scan SVG

### NÓ 5 — "Tier Decision" (BRANCHING)
- **Este nó é diferente — é um diamante de decisão com 4 saídas**
- **Label:** `Tier decision`
- **Tooltip:** "Based on signal weights, frugal assigns a tier. HIGH_RISK signals (prod, deploy, migrations, secrets) always force T3. TRIVIAL signals (rename, color change, single file) go T0. The complexity threshold (0.25) was tuned from your real history."
- **4 branches com percentagens reais do profile:**
  - `T0 → 59%` (cor: #4ec9b0)
  - `T1 → 12%` (cor: #569cd6)
  - `T2 → 0%` (cor: #dcdcaa)
  - `T3 → 29%` (cor: #f47373)

### NÓ 6 — Os 4 modelos (DESTINO FINAL)
Cada modelo é um card separado com cor própria:

#### T0 — Ollama (local)
- **Label:** `Ollama`
- **Badge:** `FREE · YOUR MACHINE`
- **Cor:** `#4ec9b0`
- **Detalhes:**
  - `qwen3:30b — reasoning`
  - `qwen2.5-coder:14b — code`
  - `deepseek-r1 — math`
- **Cost:** `$0.00 / prompt`
- **Tooltip:** "Runs entirely on your RTX 4090. No API calls. No data sent anywhere. frugal warms the model in RAM before you need it (ollama-warmup.js) so there's no cold-start penalty."

#### T1 — Haiku
- **Label:** `Claude Haiku`
- **Badge:** `API · FAST`
- **Cor:** `#569cd6`
- **Cost:** `~$0.001 / prompt`
- **Tooltip:** "Anthropic's fastest Claude. Used for light code tasks, commit messages, explanations, regex. 40× cheaper than Opus."

#### T2 — Sonnet
- **Label:** `Claude Sonnet`
- **Badge:** `API · BALANCED`
- **Cor:** `#dcdcaa`
- **Cost:** `~$0.01 / prompt`
- **Tooltip:** "Used for debugging, root cause analysis, comparing approaches. 5× cheaper than Opus with 90% of the capability for most tasks."

#### T3 — Opus
- **Label:** `Claude Opus`
- **Badge:** `API · MAXIMUM`
- **Cor:** `#f47373`
- **Cost:** `~$0.15 / prompt`
- **Tooltip:** "Reserved for architecture decisions, multi-file refactors, production-critical tasks. frugal only sends here when it has to — your 29% T3 rate means 71% of prompts were handled cheaper."

---

## SECÇÃO DE SAVINGS ABAIXO DO FLUXO

Após o fluxograma, mostrar um bloco "Your savings so far" com animação de contador:

```tsx
// Números reais do profile
const { decisionsCount, savingsUsd } = aggregateDevices(profile);
const t0Pct = 59; // de profile.frugal_config ou devices
const t3Pct = 29;
const naiveCost = decisionsCount * 0.045; // avg Opus turn ~$0.045
```

Layout:
```
┌─────────────────────────────────────────────────────────┐
│  $73.34 saved    416 decisions    68% routed away        │
│  ────────────────────────────────────────────────────    │
│  If every prompt went to Opus: ~$18.72                   │
│  frugal actually spent: ~$0.00 (Ollama local)            │
│  ────────────────────────────────────────────────────    │
│  📍 RTX 4090 · win32 · gpu-high · frugal v0.9.8          │
└─────────────────────────────────────────────────────────┘
```

---

## ANIMAÇÕES CSS

### Animação 1 — "Flow pulse" (setas animadas)
As setas entre nós têm uma animação de ponto a deslizar da esquerda para a direita em loop, dando a sensação de dados a fluir:

```css
@keyframes flow-pulse {
  0%   { stroke-dashoffset: 20; opacity: 0.3; }
  50%  { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0.3; }
}

.flow-arrow {
  stroke-dasharray: 4 4;
  animation: flow-pulse 1.5s linear infinite;
}
```

### Animação 2 — "Node enter" (nós aparecem em sequência)
Cada nó faz fade+slide-up ao entrar na viewport, com delay incremental:

```css
@keyframes node-enter {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.flow-node { animation: node-enter 0.4s ease-out forwards; }
.flow-node:nth-child(1) { animation-delay: 0.0s; }
.flow-node:nth-child(2) { animation-delay: 0.1s; }
.flow-node:nth-child(3) { animation-delay: 0.2s; }
/* etc */
```

### Animação 3 — "Tier bar" (percentagens crescem)
As barras de tier no nó 5 crescem de 0% até ao valor real com easing:

```css
@keyframes bar-grow {
  from { width: 0%; }
  to   { width: var(--target-width); }
}

.tier-bar {
  animation: bar-grow 1s cubic-bezier(0.4, 0, 0.2, 1) 0.5s both;
}
```

### Animação 4 — "Counter" (savings a incrementar)
O número de savings sobe de 0 até ao valor real com requestAnimationFrame:

```tsx
function AnimatedCounter({ value, prefix = '', suffix = '', duration = 1500 }: {
  value: number; prefix?: string; suffix?: string; duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(value * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <span>{prefix}{display.toFixed(2)}{suffix}</span>;
}
```

### Animação 5 — "Tooltip hover" (nós clicáveis)
Cada nó tem estado `hovered` com tooltip que aparece suavemente:

```css
.flow-tooltip {
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
}

.flow-node:hover .flow-tooltip {
  opacity: 1;
  transform: translateY(0);
}
```

---

## LAYOUT GERAL (orientação vertical, desktop-first)

```
┌────────────────────────────────────────────────────────┐
│  How frugal works                                      │
│  "Every prompt. Classified in <50ms. Routed perfectly."│
├────────────────────────────────────────────────────────┤
│                                                        │
│  [1] Your prompt          ──────────────────────────── │
│           │                                            │
│  [2] Pre-processing       LOCAL · ~1ms                 │
│      ┌──────────────┐                                  │
│      │ lang: EN     │                                  │
│      │ code: no     │                                  │
│      │ refs: 0      │                                  │
│      └──────────────┘                                  │
│           │                                            │
│  [3] classify.js ⚡        < 50ms · zero LLM           │
│      ┌──────────────────────────────┐                  │
│      │ 230 samples · 40+ patterns  │                   │
│      │ SHA-256 cache 30min TTL     │                   │
│      └──────────────────────────────┘                  │
│           │                                            │
│  [4] Signal extraction     7 features                  │
│      [has_code] [has_refs] [lang] [quality] [risk]...  │
│           │                                            │
│  [5] Tier decision ◆                                   │
│      ┌────┬────┬────┬────┐                             │
│      │ T0 │ T1 │ T2 │ T3 │                             │
│      │59% │12% │ 0% │29% │  ← barras animadas          │
│      └────┴────┴────┴────┘                             │
│       │    │    │    │                                  │
│  [6] MODELOS                                           │
│  ┌──────┐┌──────┐┌──────┐┌──────┐                     │
│  │Ollama││Haiku ││Sonnet││Opus  │                      │
│  │FREE  ││$0.001││$0.01 ││$0.15 │                      │
│  │LOCAL ││ API  ││ API  ││ API  │                      │
│  └──────┘└──────┘└──────┘└──────┘                     │
│                                                        │
├────────────────────────────────────────────────────────┤
│  $73.34 saved · 416 decisions · 68% away from Opus    │
└────────────────────────────────────────────────────────┘
```

---

## IMPLEMENTAÇÃO

### Ficheiro a modificar: `landing/app/(app)/dashboard/page.tsx`

Adicionar:
1. Componente `AnimatedCounter` (ver código acima)
2. Componente `FlowTooltip` — wrapper com estado hover
3. Componente `FlowNode` — nó genérico com ícone, label, badge, tooltip
4. Componente `TierBranch` — nó diamante com 4 saídas e barras animadas
5. Componente `ModelCard` — card de destino com cor, cost, badge
6. Componente `HowItWorksTab` — tab completa com fluxo + savings block
7. Adicionar CSS ao globals.css para as animações (flow-pulse, node-enter, bar-grow)

### Tab label
Adicionar à lista de tabs:
```tsx
{ id: 'howitworks', label: 'How it works' }
```

### Dados reais a usar
- `decisionsCount` — de `aggregateDevices(profile)`
- `savingsUsd` — de `aggregateDevices(profile)`
- `t0Pct`, `t3Pct` — de `profile.frugal_config` (campos `pct_by_tier` se existirem, senão usar 59/29 como fallback)
- `gpu_name` — de `profile.devices[0]?.gpu_name`
- `os_type` — de `profile.devices[0]?.os_type`
- `frugal_version` — de `profile.frugal_version`

### Ícones SVG inline necessários

```tsx
// Cursor/keyboard
function PromptIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="1" y="4" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5 8h8M5 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}

// Chip/processor
function ChipIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="4" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M7 1v3M11 1v3M7 14v3M11 14v3M1 7h3M1 11h3M14 7h3M14 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="6.5" y="6.5" width="5" height="5" rx="0.5" fill="currentColor" opacity="0.3"/>
  </svg>;
}

// Lightning
function LightningIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
    <path d="M10.5 1L3 10.5h6L7.5 17 15 7.5H9L10.5 1z"/>
  </svg>;
}

// Scan/magnify
function ScanIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M12 12l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M6 8h4M8 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}

// Diamond (decision)
function DiamondIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 1L17 9L9 17L1 9L9 1Z" stroke="currentColor" strokeWidth="1.5"/>
  </svg>;
}
```

---

## COPY FINAL DO HEADER DA TAB

```
How frugal works
"Every prompt you write is classified in under 50ms — before any model sees it.
frugal reads 40+ signals, extracts 7 features, and routes to the cheapest model
that can do the job. No guessing. No waste."
```

---

## RESTRIÇÕES

1. Zero dependências novas (sem react-flow, d3, ou bibliotecas de diagramas)
2. Animações em CSS puro + requestAnimationFrame para contadores
3. Todos os números visíveis devem vir de `profile` — zero hardcoded
4. Tooltips em hover, não em click (mais fluido)
5. Funciona em mobile: fluxo fica vertical em `max-width: 768px`
6. `npx tsc --noEmit` tem de passar limpo
7. Commit: `feat(ui): interactive "How it works" flowchart with real data (MP-17)`
