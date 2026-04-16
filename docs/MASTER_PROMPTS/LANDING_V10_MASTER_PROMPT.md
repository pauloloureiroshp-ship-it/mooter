# LANDING_V10_MASTER_PROMPT.md
# frugal — Landing Page v10 Redesign
# Missão: landing page de nível world-class para dev tools em 2026
# Data: 2026-04-10 · Sessão Cowork

> **Para o Claude Code executar autonomamente.**
> Lê este ficheiro completo antes de tocar em qualquer ficheiro.
> Cada secção tem contexto do porquê, não só o quê.

---

## CONTEXTO E FILOSOFIA

### Benchmarks que definem o estado da arte (estudar antes de começar)
- **vercel.com** — dark theme, live metrics no hero, one-liner install. Padrão ouro.
- **linear.app** — melhor copywriting de dev tools do mundo. Cada frase elimina uma objecção.
- **railway.app** — onboarding wizard que detecta o setup do utilizador.
- **warp.dev** — prova que CLI tools podem ter landing pages de produto consumer premium.
- **cursor.sh** — converteu vibe coders com demo interactivo central. frugal já tem algo assim.

### O que o frugal tem que nenhum benchmark tem
Dados reais da comunidade em tempo real (1,437+ prompts, 90.2% savings validados em produção).
Este activo é o mais diferenciador e tem de estar mais visível.

### Regras absolutas
- NÃO quebres o que já funciona: DemoSection (3 prompts), FlywheelSection, ComparisonSection
- NÃO uses Opus para editar ficheiros ou CSS (seria anti-frugal)
- Faz commit por feature. Não um commit gigante no final.
- TypeScript clean (tsc --noEmit) antes de cada commit
- Regista progresso em SYNC.md a cada milestone
- Aguarda aprovação do Paulo para: Supabase schema changes, deploy final, tornar repo público

---

## TAREFA 1 — IDENTIDADE VISUAL: Logo + Favicon + Mascote

### Contexto da decisão
O Shiba (🐕) representa afecto mas não eficiência. O mercado de dev tools (Vercel, Linear, Stripe)
usa logos tipográficos/geométricos minimalistas que transmitem precisão e velocidade.
O Shiba mantém-se como easter egg pessoal no footer ("Built in São Paulo 🐕")
mas a identidade principal precisa de transmitir: routing cirúrgico, eficiência, precisão.

### 1a. Novo logo SVG — "F" com detalhe de routing

Cria `/landing/public/frugal-logo.svg`:

```svg
<!-- frugal logo — F com bifurcação de routing -->
<!-- Conceito: a letra F com uma linha diagonal que sai do braço inferior,
     sugerindo um caminho que se divide (routing) para um destino mais eficiente.
     Cor principal: #4ec9b0 (T0 teal — a cor da eficiência) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
  <!-- F bold -->
  <rect x="8" y="8" width="4" height="24" fill="#4ec9b0"/>
  <rect x="8" y="8" width="16" height="4" fill="#4ec9b0"/>
  <rect x="8" y="18" width="12" height="4" fill="#4ec9b0"/>
  <!-- routing fork — linha que sai do bottom do F e bifurca -->
  <line x1="12" y1="32" x2="22" y2="32" stroke="#4ec9b0" stroke-width="2" opacity="0.5"/>
  <line x1="22" y1="32" x2="28" y2="26" stroke="#4ec9b0" stroke-width="2" opacity="0.8"/>
  <circle cx="28" cy="26" r="2" fill="#4ec9b0"/>
  <circle cx="22" cy="36" r="2" fill="#4ec9b0" opacity="0.4"/>
</svg>
```

NOTA: Podes iterar neste SVG para ficares satisfeito. O conceito é: F tipográfico + bifurcação que
representa o routing. A cor teal (#4ec9b0) é a da eficiência máxima (T0 = grátis).

### 1b. Favicon

Cria `/landing/public/favicon.svg` (substitui o actual):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#080808"/>
  <rect x="7" y="6" width="3" height="20" fill="#4ec9b0"/>
  <rect x="7" y="6" width="13" height="3" fill="#4ec9b0"/>
  <rect x="7" y="14" width="10" height="3" fill="#4ec9b0"/>
  <!-- routing dot -->
  <circle cx="24" cy="22" r="2.5" fill="#4ec9b0" opacity="0.7"/>
</svg>
```

Actualiza `/landing/app/layout.tsx` para usar o novo favicon SVG:
```tsx
icons: {
  icon: '/favicon.svg',
  shortcut: '/favicon.svg',
},
```

### 1c. Actualiza a nav e o footer

Em `page.tsx`:
- Nav brand: de `🐕 frugal` para logo SVG + wordmark "frugal" em teal
  ```tsx
  <img src="/frugal-logo.svg" alt="frugal" width={28} height={28} />
  <span className="nav-brand-name">frugal</span>
  ```
- Footer: mantém o 🐕 como easter egg — `Built in São Paulo 🐕 · MIT License · 2026`

#### Commit: `brand(identity): new F+routing SVG logo + favicon + nav update`

---

## TAREFA 2 — LOGOS OFICIAIS DAS EMPRESAS (Simple Icons)

### Contexto
Os logos actuais (Anthropic, OpenAI, Gemini, Mistral, Grok, Ollama) são SVGs desenhados à mão
que parecem aproximações. Logos oficiais transmitem profissionalismo e confiança imediata.

### 2a. Instala Simple Icons

Simple Icons (simpleicons.org) é uma biblioteca MIT com 3000+ logos SVG oficiais.
```bash
cd /path/to/frugal/landing
npm install simple-icons
```

NOTA sobre paths Windows: usa o path correcto para o teu OS. Em WSL: `/c/Users/Paulo\ Loureiro/frugal/landing`

### 2b. Cria um componente BrandIcon

Cria `/landing/app/components/BrandIcon.tsx`:

```tsx
'use client';
// BrandIcon — usa Simple Icons para logos oficiais das LLM providers
// Fallback para SVG inline se o icon não estiver disponível

interface BrandIconProps {
  brand: 'anthropic' | 'openai' | 'google' | 'meta' | 'mistral' | 'nvidia' | 'ollama';
  size?: number;
  className?: string;
}

// Simple Icons slugs: https://simpleicons.org/
const ICON_PATHS: Record<string, string> = {
  anthropic: 'M12 2L2 22h4l2-4h8l2 4h4L12 2zm0 6l3 6H9l3-6z', // placeholder — substitui com path real
  openai: '...', // path do Simple Icons para OpenAI
  google: '...', // path do Simple Icons para Google (Gemini usa Google brand)
  // etc.
};
```

NOTA IMPORTANTE: Em vez de reinventar, usa a abordagem mais simples:
Vai a https://simpleicons.org/ e copia os paths SVG para:
- `anthropic` (icon slug: anthropic) — cor hex: #CC9B7A
- `openai` (icon slug: openai) — cor hex: #000000
- `google` (icon slug: google) — cor hex: #4285F4
- `nvidia` (icon slug: nvidia) — cor hex: #76B900
- `ollama` (não está no Simple Icons — mantém o SVG actual)
- `mistral` (icon slug: mistralai) — cor hex: #FF7000
- `meta` (icon slug: meta) — cor hex: #0082FB

Se o Simple Icons não tiver um browser disponível para aceder ao site, usa esta abordagem alternativa:
```bash
node -e "const si = require('simple-icons'); console.log(Object.keys(si).slice(0,10))"
```
E depois acede ao path SVG de cada icon via `si.siAnthropic.path`, etc.

### 2c. Substitui os logos em page.tsx

Localiza as funções `AnthropicIcon`, `OpenAIIcon`, `GeminiIcon`, `MistralIcon`, `GrokIcon` em page.tsx.
Substitui cada uma por um SVG que usa o path oficial do Simple Icons com a cor da marca.

Exemplo de estrutura esperada:
```tsx
function AnthropicIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#CC9B7A">
      <path d="[PATH DO SIMPLE ICONS]" />
    </svg>
  );
}
```

### 2d. Usa logos também na ComparisonSection

Na tabela de comparação, a coluna dos concorrentes (OpenRouter, LiteLLM, PortKey, etc.) deve ter
pequenos logos ao lado do nome. Adiciona um mini logo 16x16 antes do nome de cada concorrente
onde o logo estiver disponível no Simple Icons.

#### Commit: `feat(branding): official brand SVGs via Simple Icons for all LLM providers`

---

## TAREFA 3 — ENXUGAR A LANDING — Nova Arquitectura de Secções

### Contexto
A página actual tem 10 secções e ~1.761 linhas. Para uma dev tool, o ideal é 6 secções máximo.
A ordem deve seguir o padrão comprovado: Hook → Prova → Demo → How → Install → Convert.

### Nova estrutura proposta (6 secções + nav + footer)

```
S1 — Nav (mantém)
S2 — Hero (enxugar: manter counters, simplificar copy secundário)
S3 — Demo interactivo (manter — é o melhor da página)
S4 — How it Works (colapsar S4 + S6-AfterInstall num único bloco tabbed)
S5 — Proof + Privacy (colapsar S7-Proof + S5b-Flywheel + S8-Community num único bloco)
S6 — Install Journey FOR DUMMIES (nova secção — ver Tarefa 4)
S7 — Compare (manter S9)
S8 — Pricing + Signup (manter S10, mas upgrade para wizard — ver Tarefa 5)
```

### 3a. Remove S3 "Sound Familiar?" (The Problem section)

A secção com os 3 cards de problema (💸 Your bill is Opus-sized, etc.) é redundante —
o Demo Section já demonstra o problema visualmente de forma muito mais eficaz.
Remove esta secção. O Hero já diz "Every prompt sent to Opus" implicitamente.

Se a remoção quebrar algo, mantém mas faz collapsed (não está na nav).

### 3b. Colapsa AfterInstall dentro de HowItWorks como tab

A secção AfterInstall (statusline, slash commands, timeline) é valiosa mas não merece secção própria.
Em S4 (How it Works), adiciona tabs ou um toggle no final:
```
[How it works]  [After install]
```
Assim o utilizador que quer ver mais detalhes encontra facilmente sem a página crescer.

### 3c. Colapsa Community Loop dentro do Flywheel

A S8 CommunitySection é essencialmente a mesma ideia que a FlywheelSection.
Mantém o FlywheelSection (que tem o privacy proof visual) e elimina o CommunitySection.
Move qualquer estatística única da CommunitySection para dentro do FlywheelSection.

### 3d. Nav actualizada

Actualiza os nav links para reflectir a nova estrutura:
```
[Como funciona] [Demo] [Prova] [Instalar] [Comparar] [Preços]
```
IDs correspondentes: `#how`, `#demo`, `#proof`, `#install`, `#compare`, `#access`

#### Commit: `refactor(landing): collapse 10 sections to 6, remove redundant content`

---

## TAREFA 4 — INSTALL JOURNEY "FOR DUMMIES" (secção nova crítica)

### Contexto
Este é o ponto mais ausente na landing actual. Existe um one-liner no hero e uma timeline vaga.
Não chega para quem não sabe o que é o Claude Code ou nunca instalou nada via terminal.
O benchmark é o onboarding do Homebrew + a clareza do Linear.

### 4a. Cria InstallJourneySection (nova secção, id="install")

Coloca entre ComparisonSection e PricingAccess.

A secção tem 5 passos visuais numerados com estado visual e tempo estimado:

```tsx
const INSTALL_STEPS = [
  {
    num: '01',
    title: 'Tens o Claude Code?',
    desc: 'frugal vive dentro do Claude Code. Se ainda não tens, instala primeiro.',
    check: 'claude --version',
    checkLabel: 'Verifica no terminal',
    notYet: 'Instala em claude.ai/download',
    notYetUrl: 'https://claude.ai/download',
    time: '5 min',
    prereq: true, // este passo é pré-requisito
  },
  {
    num: '02',
    title: 'Tens Node.js 20+?',
    desc: 'O router do frugal corre em Node.js. A maioria dos developers já tem.',
    check: 'node --version',
    checkLabel: 'Verifica no terminal',
    notYet: 'Instala em nodejs.org (escolhe LTS)',
    notYetUrl: 'https://nodejs.org',
    time: '3 min',
    prereq: true,
  },
  {
    num: '03',
    title: 'Instala o frugal',
    desc: 'Uma linha. Cola no terminal. O installer detecta o teu sistema automaticamente.',
    // Mac/Linux vs Windows tabs
    commands: {
      mac: 'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)',
      windows: 'irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex',
    },
    time: '30 seg',
    prereq: false,
  },
  {
    num: '04',
    title: 'Abre o Claude Code e faz um prompt qualquer',
    desc: 'Qualquer coisa. "rename this variable", "fix this bug", "write a test". O frugal já está a trabalhar em silêncio.',
    example: 'rename the handleConnect function to onConnect',
    time: '5 seg',
    prereq: false,
  },
  {
    num: '05',
    title: 'Corre /frugal-status',
    desc: 'Vê o que aconteceu. Qual modelo foi usado. Quanto poupaste. O teu primeiro momento WOW.',
    example: '/frugal-status',
    expectedOutput: `frugal status — tudo verde\n  Router: activo · último prompt · T0 (grátis)\n  Savings: $0.05 poupados já\n  Ollama: qwen2.5:3b online\n  Hub: conectado`,
    time: '2 seg',
    prereq: false,
  },
];
```

### 4b. Design da secção

- Fundo alternado (section-alt class — já existe)
- Cada passo tem: número grande em teal, título, descrição, comando copiável (se aplicável), badge de tempo
- Passos 01 e 02 têm um toggle "Já tenho ✓" / "Preciso instalar →" que mostra/esconde o link
- Passo 03 tem tabs [Mac/Linux] [Windows] para mostrar o comando correcto
- Passo 05 tem um terminal mockup com o output esperado do /frugal-status
- Linha vertical conecta os passos (como um timeline vertical com circles)
- No final: "Total: menos de 2 minutos. Sem configuração, sem proxies, sem riscos."

### 4c. Tooltip "O que é o Claude Code?"

No passo 01, adiciona um tooltip ou footnote expansível:
```
"O que é o Claude Code?" →
  Claude Code é a ferramenta de programação com IA da Anthropic.
  É usada via terminal (linha de comandos) e é o ambiente onde o frugal vive.
  Se és novo em vibe coding, começa por instalar o Claude Code e voltar aqui.
```

### 4d. Actualiza a nav

Adiciona "Instalar" nos nav links com scroll para `#install`.

#### Commit: `feat(landing): InstallJourneySection — step-by-step FOR DUMMIES install guide`

---

## TAREFA 5 — SIGNUP WIZARD COM ÁREA LOGADA (onboarding inteligente)

### Contexto
O form actual (email + hardware dropdown + subscription chips) é um bom início mas fica parado
depois do submit ("You're on the list"). Não há área logada, não há setup personalizado.
O benchmark é o onboarding do Linear e Railway: 3-4 passos após criar conta, cada um personaliza
a experiência. O utilizador sente que o produto foi feito para ele.

### NOTA IMPORTANTE ANTES DE COMEÇAR
Esta é a tarefa mais complexa (envolve Supabase Auth, páginas novas, RLS, etc.).
Antes de implementar qualquer coisa, mostra ao Paulo:
1. O plano completo de tabelas que vais criar/modificar
2. O fluxo de páginas que vais criar
3. Confirmação de que o Supabase anon key está configurado em .env.local

### 5a. Supabase Auth setup

O projecto já usa `/app/lib/supabase.ts` com REST API directa.
Para auth, precisas de adicionar:

```typescript
// Em supabase.ts, adiciona:
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Magic link auth (sem password — melhor UX para este público)
export async function signInWithEmail(email: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/onboarding` }
    }),
  });
  return res.ok;
}
```

Fluxo de auth: email → magic link (sem password) → redirect para /onboarding.
Não usa password. Não pede nome. Email + magic link é o suficiente para este público.

### 5b. Schema das novas tabelas Supabase

**MOSTRA AO PAULO ANTES DE CRIAR:**

```sql
-- Tabela de perfis (criada automaticamente após auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  hardware_tier TEXT, -- 'mac_m_series' | 'windows_nvidia' | 'windows_amd' | 'linux_nvidia' | 'linux_amd' | 'cloud' | 'other'
  subscriptions TEXT[], -- ['claude_max', 'claude_api', 'gpt_plus', 'gpt_api', 'gemini']
  prompts_per_day_estimate INTEGER, -- do slider de onboarding
  ollama_available BOOLEAN DEFAULT false,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Actualiza a tabela waitlist existente para ter o campo user_id (para ligar ao perfil)
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
```

### 5c. Páginas novas a criar

#### `/app/onboarding/page.tsx` — Wizard de onboarding (4 steps)

```
Step 1: "O teu setup" (hardware + subscriptions — já existem como form fields)
  □ Mac M-series    □ Windows + NVIDIA    □ Linux + NVIDIA
  □ Claude Max      □ Claude API          □ GPT API
  [Próximo →]

Step 2: "Quanto usas o Claude Code?"
  Slider: 10 — 50 — 100 — 200 — 500+ prompts/dia
  Estimate displayed: "A esse ritmo, pagarás ~$XX/mês sem frugal. Com frugal: ~$XX."
  [Próximo →]

Step 3: "Instala o frugal" (mostrar o comando correcto para o hardware do Step 1)
  [Copiar comando]
  "Já instalei →" (avança sem verificar — confiança no utilizador)
  [Próximo →]

Step 4: "Verifica que está a funcionar"
  "Corre este comando no Claude Code:"
  /frugal-status
  "O que deves ver:" [mockup do output esperado]
  [Estou a ver isto! Entrar no dashboard →]
```

#### `/app/dashboard/page.tsx` — Área logada

Dashboard simples com:
- Savings do utilizador (vai ser 0 inicialmente — ok, mostrar "a aguardar primeiros dados")
- O hardware/subscriptions configurados (editável)
- Link para o hub público (mooter-hub.frugal-hub.workers.dev/api/stats)
- Tabela das últimas 10 decisões de routing (se decisions.log for enviado — opcional)
- Botão "Instalar no outro computador" (gera um link de onboarding personalizado)

NOTA: O dashboard pode começar simples. Não precisa de dados em tempo real no v1.
Um perfil do utilizador + os seus settings + link para instalar chega para impressionar.

#### `/app/auth/callback/route.ts` — Callback do magic link

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  
  if (code) {
    // Exchange code for session via Supabase REST API
    // Redirect para /onboarding
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }
  
  return NextResponse.redirect(new URL('/', request.url));
}
```

### 5d. Actualiza o form de acesso na landing (PricingAccess section)

O form actual pede: email + hardware + subscriptions + submit.
Mantém este form MAS muda o flow após submit:
- Em vez de "You're on the list" estático, envia magic link e mostra:
  "Enviámos um link para [email]. Clica nele para criar o teu perfil e instalar o frugal."

Actualiza `/app/api/waitlist/route.ts`:
- Após salvar na tabela waitlist, chama `signInWithEmail(email)` para enviar o magic link
- O utilizador clica no email → vai para /onboarding com o hardware/subscriptions pré-preenchidos
  (passa via query params no emailRedirectTo: `/onboarding?hw=mac_m_series&subs=claude_max,claude_api`)

### 5e. Middleware de auth

Cria `/middleware.ts` para proteger /dashboard e /onboarding:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPaths = ['/dashboard', '/onboarding'];
  
  if (protectedPaths.some(p => pathname.startsWith(p))) {
    // Verifica se há cookie de sessão Supabase
    const session = request.cookies.get('sb-access-token');
    if (!session) {
      return NextResponse.redirect(new URL('/#access', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*'],
};
```

#### Commits:
- `feat(auth): Supabase magic link auth + profiles table + RLS`
- `feat(onboarding): 4-step wizard with hardware detection and install command`
- `feat(dashboard): user profile + savings + settings area`

---

## TAREFA 6 — BENCHMARK RESEARCH + QUICK WINS (opcional mas valioso)

### Contexto
O Paulo perguntou se há ferramentas/skills/conectores que possam ajudar a fazer algo
acima da média do mercado. Aqui estão as oportunidades concretas.

### 6a. Animação do tier routing no Hero (quick win visual)

Adiciona uma animação CSS pura (sem biblioteca) no hero que mostra em loop:
```
Prompt → [classify.js] → T0 (free) ✓
Prompt → [classify.js] → T2 (Sonnet) ✓
Prompt → [classify.js] → T3 (Opus) ✓
```
Cada linha aparece com um blink e desaparece. Dura ~6s em loop.
Fica abaixo do hero subtitle, antes dos counters.
Referência visual: o terminal animation do Warp.dev homepage.

### 6b. OG Image dinâmica (para partilha em redes sociais)

Cria `/app/api/og/route.tsx` usando `@vercel/og` (já disponível em Next.js):

```tsx
import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const savings = searchParams.get('savings') || '90.2%';
  
  return new ImageResponse(
    (
      <div style={{ background: '#080808', width: '1200px', height: '630px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ color: '#4ec9b0', fontSize: '80px', fontWeight: 800 }}>frugal</div>
        <div style={{ color: '#ededed', fontSize: '32px', marginTop: '20px' }}>
          {savings} less. Same results.
        </div>
        <div style={{ color: '#666', fontSize: '20px', marginTop: '16px' }}>
          The Claude Code router that knows when to save.
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
```

Actualiza `layout.tsx` metadata com OG image:
```tsx
openGraph: {
  images: [{ url: '/api/og?savings=90.2%25', width: 1200, height: 630 }],
},
```

### 6c. Analytics com Plausible (privacy-first — alinhado com os valores do frugal)

Adiciona Plausible (plausible.io) como script no layout. É privacy-first (sem cookies, GDPR-compliant)
e consistente com os valores do frugal. O Paulo pode ver quantas pessoas visitam e de onde.

```html
<!-- Em layout.tsx, no <head> -->
<script defer data-domain="frugal.dev" src="https://plausible.io/js/script.js"></script>
```

NOTA: Requer criar conta em plausible.io. Mostra esta instrução ao Paulo.
Alternativa gratuita: umami.is (self-hosted no Cloudflare Pages).

### 6d. Structured Data para SEO (JSON-LD)

Adiciona structured data em `layout.tsx` para aparecer melhor no Google:

```tsx
// Em layout.tsx, adiciona no <head>:
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "frugal",
      "description": "Claude Code router that saves 90% on LLM costs via automatic tier routing",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "macOS, Windows, Linux",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "1437"
      }
    })
  }}
/>
```

#### Commit: `feat(seo): OG image API + structured data + Plausible analytics setup`

---

## TAREFA 7 — DEPLOY FINAL

### 7a. TypeScript check

```bash
cd landing && npx tsc --noEmit
```

Zero erros antes de continuar.

### 7b. Deploy

```bash
cd landing && vercel --prod
```

### 7c. Smoke test manual

Após deploy, verifica manualmente:
1. Logo SVG aparece na nav e no favicon do browser
2. Nova InstallJourneySection aparece entre Compare e Pricing
3. Brand logos (Anthropic, OpenAI, etc.) aparecem correctamente
4. Form de signup envia magic link (testar com email real do Paulo)
5. Redirect para /onboarding funciona após click no magic link
6. /onboarding mostra os 4 steps
7. /dashboard está protegido (redirect para /#access se não autenticado)

### 7d. Actualiza SYNC.md

Na secção CLAUDE CODE → COWORK:
- Lista todos os commits desta sessão
- URL do deploy Vercel
- O que precisa de aprovação do Paulo (Supabase schema, analytics account)
- Qualquer item que ficou parcial ou bloqueado

#### Commit final: `chore(release): v10 deploy + SYNC update`

---

## RESUMO DE PRIORIDADES

| T | Tarefa | Impacto | Dificuldade | Bloqueia deploy? |
|---|--------|---------|-------------|-----------------|
| **T1** | Logo SVG + favicon | Alto (brand) | Baixa | Não |
| **T2** | Simple Icons logos oficiais | Alto (confiança) | Baixa-Média | Não |
| **T3** | Enxugar secções (colapsar S8, S3) | Médio (UX) | Média | Não |
| **T4** | InstallJourneySection FOR DUMMIES | **Crítico** | Média | Não |
| **T5** | Signup wizard + área logada | Alto (conversão) | Alta | Não (pode ir depois) |
| **T6** | OG image + SEO + analytics | Médio | Baixa | Não |
| **T7** | Deploy final | Crítico | Baixa | — |

### Ordem recomendada
1. T1 + T2 em paralelo (rápidos, alto impacto visual)
2. T4 (a mais crítica para novos utilizadores)
3. T3 (limpeza)
4. T6 (quick wins de SEO)
5. T5 (mais complexo — se houver tempo, senão fica para v11)
6. T7 (deploy)

### O que NÃO fazer nesta sessão
- Não reescreves o DemoSection (já é excelente)
- Não tocas no FlywheelSection (acabou de ser feito)
- Não tocas no ComparisonSection (dados reais verificados)
- Não fazes push sem tsc --noEmit clean

---

## MENSAGEM FINAL AO PAULO (escreve em SYNC.md no final)

```
## Landing v10 — o que precisa da tua aprovação

1. [ ] Gostas do novo logo SVG? (posso iterar se não gostar)
2. [ ] Aprovas criar as tabelas Supabase para auth (schema detalhado acima)?
3. [ ] Queres activar o Plausible analytics? (precisas criar conta em plausible.io)
4. [ ] O T5 (wizard + dashboard) ficou para v11 se não houver tempo — ok?
5. [ ] Posso fazer deploy da v10 para prod?
```

**Boa sessão. O objectivo é uma landing page que qualquer vibe coder entenda em 30 segundos
e confie o suficiente para correr uma linha de bash. Podes fazê-lo. 🐕**
