# LANDING_MASTER_PROMPT_V4.md
## frugal — Landing Page for Claude Code (VC-ready, one clean narrative)

> **ESTE É O ÚNICO DOCUMENTO QUE PRECISAS DE LER.**
> Supersede V1, V2, V3 em tudo. Lê-o completo antes de escrever uma linha.

---

## CONTEXTO — O que é frugal, para quem, e porque importa

frugal é um **router de LLM que vive dentro do Claude Code** — na tua máquina, sem proxy, sem servidor, sem configuração. Interceta cada prompt antes de chegar ao Claude, classifica-o em <50ms, e envia-o para o modelo mais barato que consegue fazer o trabalho.

**O utilizador-alvo primário:** o *vibe coder* — developer que usa Claude Code todos os dias para construir o seu projeto, mas fica frustrado quando o budget acaba a meio da semana porque cada commit message foi processada por Opus a $0.05.

**O segundo utilizador:** o VC que está a ler esta página. Quer ver: problema real, validação real, defensabilidade, e um roadmap de comunidade que cria fosso competitivo.

**O que frugal NÃO é:** um proxy, um gateway, um SaaS de routing, um clone do LiteLLM. É uma camada de hint que vive em `~/.claude/` — se falhar, o Claude Code continua a funcionar normalmente. Zero blast radius.

---

## PRINCÍPIO DE DESIGN DA LANDING — Menos é mais

**O problema do V3:** tentou ser completo. Ficou poluído. Uma landing page não é documentação.

**Regra única desta landing:** cada secção responde a UMA pergunta. Se uma secção responde a duas perguntas, parte-se em duas ou elimina-se uma.

**O que um VC quer ver nesta ordem:**
1. Qual é o problema (em 10 palavras)?
2. Qual é a solução (em 1 frase)?
3. Funciona mesmo? (prova, não promessa)
4. Como funciona? (arquitectura em diagrama)
5. Quem usa? (comunidade, feedback loop)
6. Como entra? (acesso)

**O que um vibe coder quer ver:**
1. "Isso é o meu problema" (identificação imediata)
2. "Ah, assim funciona" (demo visual)
3. "Instala-se como?" (zero friction)
4. "Confio nisto?" (prove it)

A landing serve os dois ao mesmo tempo — mas nunca sacrifica clareza por completude.

---

## SECÇÕES — 8 apenas. Nada mais.

### S1: NAV (mínima, sticky)
- Logo: `🐕 frugal` — shiba emoji + wordmark, branco sobre preto
- Links: `How it works` · `Proof` · `Pricing` · `Early access`
- Sem mais nada. Sem "Docs". Sem "GitHub". Sem "CHANGELOG".

---

### S2: HERO — O problema em 3 linhas

**Layout:** centrado, fundo preto, texto enorme. Nada mais.

**H1 (muito grande, bold):**
```
Your AI bill is Opus-sized.
Your prompts aren't.
```

**Sub (1 linha, muted):**
```
frugal routes Claude Code prompts to the cheapest model that can handle them.
83% go free. You only pay Opus when you actually need Opus.
```

**CTA única:** `Get early access →` (abre email form inline ou scroll para waitlist)

**Abaixo do CTA, 3 métricas em linha — sem labels longas:**
```
90%  savings          <50ms  routing          100%  local
```
(hover tooltip em cada: "validated on real developer prompts" / "pure regex, no LLM call to classify" / "no proxy, no cloud, no port")

**Sem animações de counter aqui.** O hero tem de carregar instantaneamente e ser legível em 2 segundos.

---

### S3: THE PROBLEM — Narrativa do vibe coder

**Título:** `Sound familiar?`

**Formato:** sequência de 3 cards em linha (mobile: stack vertical), estilo "momento" — como um story board. Cada card tem um ícone simples, uma linha de título, e 2 linhas de corpo.

```
Card 1: 🔥  "You're building something real"
        You use Claude Code 8 hours a day. It's your pair programmer.

Card 2: 💸  "Then the bill lands"
        $47 this week. Most of it: commit messages, file reads, rename operations.

Card 3: 😤  "You have an RTX 4090 sitting idle"
        A GPU that could run a 30B model free. But every prompt still goes to Opus.
```

**Abaixo dos cards, uma linha de copy:**
```
frugal fixes this. It's not a subscription to another AI. It's a router that stops wasting the one you already have.
```

---

### S4: HOW IT WORKS — Diagrama de arquitectura + Demo

Esta é a secção mais importante. Divide-se em **2 subsecções visuais**.

#### 4A: O diagrama (arquitectura — o "segredo" sem revelar o segredo)

**Título:** `How frugal decides`

Layout: diagrama horizontal animado (ou estático se muito complexo). Mostra o fluxo de um prompt:

```
[ Prompt ]
    │
    ▼
[ 🐕 frugal classifier ]   ← <50ms, runs locally, pure regex
    │
    ├─ trivial? ──────────────→ [ 🏠 Ollama ]   FREE
    │                              qwen2.5 · deepseek
    │
    ├─ simple? ───────────────→ [ 🌸 Haiku ]    ~$0.001
    │                              Claude Haiku
    │
    ├─ reasoning? ────────────→ [ 🎵 Sonnet ]   ~$0.010
    │                              Claude Sonnet
    │
    └─ architecture / risky? ─→ [ 💎 Opus ]     ~$0.050
                                   Claude Opus
```

**Abaixo do diagrama, uma linha:**
```
The classifier never calls an LLM to decide. It reads the prompt. That's it.
```

**Logos dos modelos:** mostrar os logos reais em cada branch do diagrama:
- Ollama: logo do Ollama (svg/png inline)
- Haiku / Sonnet / Opus: logo do Claude / Anthropic
- Gemini (como provider alternativo futuro): logo Google
- GPT / Codex: logo OpenAI
- Grok: logo xAI
- Mistral: logo Mistral

**Onde obter logos (instrução para Claude Code):**
Usa SVG inline ou PNG de CDN público para:
- Anthropic/Claude: `https://www.anthropic.com/favicon.ico` ou SVG inline
- Ollama: `https://ollama.com/public/ollama.png`
- OpenAI: SVG inline (círculo preto com O)
- Google/Gemini: SVG inline (G colorido)
- Mistral: SVG inline (laranja M)
- xAI/Grok: SVG inline (X branco)

Se os logos de terceiros causarem problemas de CORS ou policy, usa **ícones geométricos simples** com a cor da marca (Anthropic=#CC785C, Ollama=#fff, OpenAI=#000, Google=#4285F4, Mistral=#FF7000, xAI=#000) — nunca texto puro.

#### 4B: A demo (Watch the router decide)

**Título:** `Watch the router decide`

Três exemplos lado-a-lado (ou carrossel em mobile), cada um com:
- O prompt (em caixa de texto estilo terminal, com cursor)
- A decisão do router (tier + modelo + razão em 1 linha)
- O custo ($0.000 vs $0.050)
- O tempo de resposta

**Exemplo 1 — T0:**
```
Prompt:  "write a commit message for this change"
→  🏠 Ollama · qwen2.5 · 0.3s · $0.000
   trivial_local — commit messages never need Opus
```

**Exemplo 2 — T2:**
```
Prompt:  "why is my useEffect firing twice in dev mode?"
→  🎵 Sonnet · 1.8s · $0.010
   reasoning_intermediate — debugging needs context
```

**Exemplo 3 — T3:**
```
Prompt:  "redesign the auth system for multi-tenant"
→  💎 Opus · 4.2s · $0.050
   architecture_critical — irreversible decisions need the best
```

**Abaixo dos 3 exemplos, o resultado acumulado:**
```
3 prompts · total cost $0.060 · without frugal: $0.150 · saved: 60%
```

**Nota de design:** este bloco deve ser limpo, terminal aesthetic, sem excessos. Fundo `#0d1117`, texto monospaçado, sem gradients.

---

### S5: THE STATUSLINE — O que vês depois de instalar

**Título:** `What your terminal looks like after install`

Mostrar a statusline real, estática, num bloco de terminal. Com anotações (setas + labels) explicando cada segmento:

```
⬆ main·a1b2  │  🐕 frugal v0.9  │  [T0] qwen commit 0.3s L1→T0  │  qwen 84% · son 12% · ops 4%  │  💰 ~$12.80 (90%)  │  💻 RTX 4090 ▓▓▓▓░░ 61%  │  ●●○○○○
     ①               ②                      ③                           ④                              ⑤                      ⑥              ⑦
```

Com labels abaixo:
```
① Git branch + commit
② 🐕 frugal brand + version
③ Last turn: tier · model · category · latency · how it decided (cascade)
④ Model distribution (your routing mix, live)
⑤ Money saved today (running total)
⑥ Your GPU utilization (if Ollama is running)
⑦ Provider status: Claude · Ollama · Gemini · GPT · Grok · Mistral
```

**Provider dots legend (pequeno, inline):**
`●` live · `◐` degraded · `○` not configured

**Nota:** esta secção substitui o "terminal demo animado" complexo. É mais honesta e mais fácil de perceber.

---

### S6: PROOF — Validação sem expor o algoritmo

**Título:** `The numbers are real. Here's how to verify.`

**Filosofia:** não mostrar o número exato de prompts do backtest (não revelar escala interna), mas mostrar o mecanismo de validação — que qualquer pessoa pode reproduzir nos seus próprios dados.

**Layout:** 2 colunas. Esquerda: o que foi feito. Direita: como podes fazer tu.

**Esquerda — O que validámos:**
```
We replayed months of real Claude Code usage
through the classifier. Not hand-picked prompts.
Not benchmarks. Every prompt, in order.

Result:
  83%  routed free to local Ollama
  12%  routed to Sonnet
   4%  routed to Opus
  ─────────────────────────────
  90%  projected cost reduction
```

**Direita — Como validar tu mesmo:**
```bash
# After installing frugal, run this:
node ~/.claude/tools/router/replay.js

# Shows your routing distribution
# and projected savings on your own history.
# Takes < 30 seconds.
```

**Abaixo, 1 linha de copy:**
```
We don't ask you to trust our numbers. We give you the tool to validate yours.
```

**3 métricas de confiança (cards pequenos):**
```
<50ms      Zero proxy      Reversible
classify   no port, no     uninstall in
latency    server, no API  30 seconds
```

---

### S7: COMMUNITY — O fosso competitivo

**Título:** `The classifier gets smarter. Your prompts never leave your machine.`

**Subtítulo:** `This is how frugal builds a moat without a data center.`

**Diagrama simples (horizontal, 3 passos):**

```
[ Your machine ]                [ frugal-hub ]              [ Everyone ]
  backtest runs nightly    →     anonymous delta         →   shared classifier
  finds misroutes               (no prompts, ever)           gets smarter
  exports fingerprint
```

**Copy abaixo:**
```
When the classifier makes a mistake, backtest.js finds it.
You export a delta — just anonymous signals: keyword presence,
prompt length, tier mismatch. No text. No code. No paths.

That delta feeds a shared classifier that benefits everyone.
The more people contribute, the more accurate frugal gets
across languages, frameworks, and coding styles.
```

**Privacy callout (card destacado):**
```
🔒  What a delta contains:
    ✓ keyword signals (e.g. ["commit", "message"])
    ✓ prompt length bucket (e.g. "50-100 chars")
    ✓ tier mismatch (decided T2, should have been T0)
    ✗ never the prompt text
    ✗ never file paths or variable names
    ✗ never anything reversible to your code
```

**Rodapé da secção:**
```
Currently in private beta. Building toward frugal-hub v1.1 —
a Cloudflare Worker that automates the loop for the entire community.
```

---

### S8: ACCESS — Waitlist simples

**Título:** `Join the private beta.`

**Sub:**
```
frugal is free. Always will be at the core.
We're onboarding developers one at a time to validate
the classifier across more codebases, languages, and hardware.
```

**Form:** email input + "Request access" button. Submete para Supabase `waitlist`.

**Após submit:**
```
You're in the queue. We'll reach out within 48h.
```

**Sem pricing aqui.** Pricing pode vir depois. A prioridade agora é: "quero entrar" — não "qual tier escolho".

**Footer mínimo:**
```
🐕 frugal · built by Paulo Loureiro · v0.9.0
Docs · Security · NOTICE
```
Sem link para GitHub. Sem pricing tables no footer.

---

## LOGOS — Instrução detalhada para Claude Code

**Prioridade:** mostrar logos reais dos LLMs no diagrama de arquitectura (S4A) e na demo (S4B). Isto dá credibilidade visual instantânea.

### Como implementar logos sem violar copyright:

**Opção A (preferida): SVG inline simples baseado em forma + cor da marca**

```jsx
// Anthropic / Claude
const ClaudeLogo = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <circle cx="12" cy="12" r="10" fill="#CC785C"/>
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">A</text>
  </svg>
)

// Ollama
const OllamaLogo = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <rect width="24" height="24" rx="6" fill="#1a1a1a" stroke="#444"/>
    <circle cx="9" cy="10" r="2.5" fill="white"/>
    <circle cx="15" cy="10" r="2.5" fill="white"/>
    <path d="M8 16 Q12 19 16 16" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
  </svg>
)

// OpenAI / GPT
const OpenAILogo = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <circle cx="12" cy="12" r="10" fill="#000"/>
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">⬡</text>
  </svg>
)

// Google / Gemini
const GeminiLogo = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <circle cx="12" cy="12" r="10" fill="#4285F4"/>
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">G</text>
  </svg>
)

// Mistral
const MistralLogo = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <rect width="24" height="24" rx="6" fill="#FF7000"/>
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">M</text>
  </svg>
)

// xAI / Grok
const GrokLogo = () => (
  <svg viewBox="0 0 24 24" width="20" height="20">
    <rect width="24" height="24" rx="6" fill="#000"/>
    <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">𝕏</text>
  </svg>
)
```

**Opção B (fallback): img tag com CDN público**
```jsx
// Só se a Opção A parecer demasiado simples visualmente
<img src="https://www.anthropic.com/favicon.ico" width="20" height="20" alt="Claude" style={{borderRadius: '4px'}}/>
```

**Nunca:** mostrar apenas texto "Anthropic" ou "OpenAI" sem nenhum tratamento visual.

---

## DESIGN SYSTEM — Restrições duras

### Paleta (não alterar):
```css
--bg:           #0a0a0a   /* fundo da página */
--surface:      #111111   /* cards */
--surface-2:    #1a1a1a   /* nested cards, code blocks */
--border:       #222222   /* bordas */
--border-hover: #333333   /* hover state */
--text:         #e8e8e8   /* texto primário */
--muted:        #666666   /* texto secundário */

/* Tier colors — usar APENAS para tier labels */
--t0:  #4ec9b0   /* teal  — Ollama/free */
--t1:  #569cd6   /* blue  — Haiku */
--t2:  #dcdcaa   /* yellow — Sonnet */
--t3:  #f44747   /* red   — Opus */

/* Brand accent */
--accent: #4ec9b0   /* mesmo que --t0 */
```

### Typography:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
font-family-mono: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;

/* Scale */
--h1: clamp(2.5rem, 6vw, 5rem);  font-weight: 800; letter-spacing: -0.03em;
--h2: clamp(1.5rem, 3vw, 2.5rem); font-weight: 700;
--body: 1rem; line-height: 1.75;
--small: 0.875rem;
```

### Spacing:
```css
/* Sections */
section { padding: 8rem 0; }
section:first-child { padding-top: 6rem; }

/* Content max-width */
.container { max-width: 1100px; margin: 0 auto; padding: 0 2rem; }

/* Narrow content (hero, S8) */
.narrow { max-width: 680px; margin: 0 auto; }
```

### Animações — APENAS estas:
```css
/* Fade-in on scroll */
.fade-in { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
.fade-in.visible { opacity: 1; transform: none; }

/* Terminal cursor blink */
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.cursor { animation: blink 1s step-end infinite; }
```

**Sem contadores animados no hero.** Sem parallax. Sem partículas. Sem gradients animados.

### Regras de UI:
- Cards: `background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 8px`, `padding: 1.5rem`
- Code blocks: `background: #0d1117`, `border: 1px solid #30363d`, `border-radius: 6px`, `padding: 1.25rem`
- Buttons: primário = `background: white; color: black; border-radius: 6px; padding: 0.75rem 1.5rem; font-weight: 600`
- Buttons: secundário = `background: transparent; border: 1px solid var(--border-hover); color: var(--text)`

---

## STACK TÉCNICA — Não alterar

```
Next.js 15, App Router, React 19, TypeScript, plain CSS (globals.css), no Tailwind
reactStrictMode: false  ← OBRIGATÓRIO em next.config.ts
```

### Componentes obrigatórios (crash prevention):
```tsx
// ErrorBoundary em TODAS as secções com animações
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? null : this.props.children; }
}

// useInView hook (IntersectionObserver, para fade-in)
function useInView(ref: React.RefObject<HTMLDivElement>, threshold = 0.1) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}
```

### Estrutura de ficheiros (não mudar nomes):
```
landing/app/page.tsx          ← 'use client', componente único
landing/app/globals.css       ← todo o CSS
landing/app/layout.tsx        ← shell mínimo
landing/app/api/analyse/route.ts  ← já existe, não tocar
landing/next.config.ts        ← reactStrictMode: false
```

---

## COPY GUIDELINES — Voz e tom

**Para o vibe coder:**
- Fala como developer para developer
- Usa "you" e "your"
- Nomes de ficheiros, comandos bash reais
- Sem buzzwords ("AI-powered", "supercharge", "10x")

**Para o VC:**
- Problema quantificado ($ savings)
- Mecanismo de defensabilidade (federated learning → moat)
- Tração (comunidade em beta, auto-improvement loop)
- Não over-promise — deixa os números falarem

**Frases que FUNCIONAM:**
```
"83% of your prompts can go free. The classifier decides in <50ms."
"No proxy. No port. No daemon. If it fails, Claude Code works as before."
"We don't ask you to trust our numbers. We give you the tool to validate yours."
"The classifier gets smarter with every misroute — without ever seeing your prompts."
"You have an RTX 4090 sitting idle while Claude charges you $0.05 for a commit message."
```

**Frases que NÃO FUNCIONAM:**
```
"Revolutionary AI routing..."
"10× your productivity"
"State-of-the-art classification"
"Enterprise-grade security"
"Validate your numbers" (demasiado vago — usa "replay.js" pelo nome)
```

---

## O QUE NÃO FAZER (lista definitiva)

| ❌ Erro | ✅ Correcto |
|---|---|
| Mostrar pricing tables | Só waitlist. Pricing vem depois. |
| Expor o número exato de prompts do backtest | "months of real developer usage" |
| Link para GitHub | Sem link. "Docs" → página que não existe ainda. |
| Animação de counter no hero | Texto estático. Carrega em <1s. |
| Mais de 8 secções | Máximo 8. Corta, não adiciona. |
| `reactStrictMode: true` | Sempre `false` |
| Tailwind | CSS puro apenas |
| Mostrar código do algoritmo | Mostrar o mecanismo, não o código |
| Mostrar qualidade degradada da IA | frugal só roteia — nunca afeta qualidade |
| Misturar narrativa VC com narrativa dev | Cada secção tem um público. As métricas servem os dois. |
| Logos como texto | Sempre SVG/ícone com cor da marca |

---

## DEFINITION OF DONE — Checklist para Claude Code

Antes de fazer commit, verifica cada item:

```
VISUAL
[ ] Página carrega em <2s (lighthouse mobile > 85)
[ ] Zero erros na consola JavaScript
[ ] Funciona em mobile (375px) sem scroll horizontal
[ ] Nenhuma secção com mais de 3 parágrafos de texto
[ ] Logos dos LLMs aparecem no diagrama S4A e demo S4B
[ ] 🐕 shiba visível no Nav E na statusline (S5)

CONTEÚDO
[ ] H1 do hero é < 10 palavras
[ ] Exactamente 8 secções (S1 nav + S2-S8 content)
[ ] Sem link para GitHub privado
[ ] Sem pricing tables (só waitlist em S8)
[ ] Copy da prova (S6) não expõe número exacto de prompts do backtest

TÉCNICO
[ ] reactStrictMode: false em next.config.ts
[ ] ErrorBoundary wrapping todas as secções animadas
[ ] useEffect com cleanup (cancelled flag + clearTimeout)
[ ] Waitlist form submete para Supabase sem erro
[ ] /api/analyse não foi tocado
```

---

## COMO USAR ESTE PROMPT NO CLAUDE CODE

```
1. Abre uma sessão Claude Code na pasta /frugal/landing/
2. Diz: "Rebuild page.tsx and globals.css from scratch using LANDING_MASTER_PROMPT_V4.md.
   Read the spec completely before writing code.
   Follow the Definition of Done at the end of the spec."
3. Deixa correr — vai criar page.tsx e globals.css do zero
4. Faz commit e push para Vercel
5. Abre no browser, verifica o checklist
```

**Se Claude Code pedir clarificação:** aponta para a secção específica deste documento. Todo o detalhe necessário está aqui.

---

*V4 — escrito contra frugal v0.9.0. Big picture: landing para duas audiências (vibe coder + VC), 8 secções, zero poluição, logos reais dos LLMs, arquitectura visual clara, narrativa de comunidade como fosso competitivo, prova sem expor detalhes internos.*
