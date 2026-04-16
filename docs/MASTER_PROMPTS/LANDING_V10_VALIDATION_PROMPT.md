# LANDING_V10_VALIDATION_PROMPT.md
# frugal — Landing v10: Valida o que foi feito e executa só o que falta
# Gerado: 2026-04-10

> Antes de tocar em qualquer ficheiro, faz a fase de AUDITORIA abaixo.
> Só executas o que o audit confirmar como NÃO FEITO.
> Não refazes o que já está bem. Não "melhoras" o que não pediste.

---

## FASE 1 — AUDITORIA (lê antes de tocar em qualquer coisa)

Corre estes checks em sequência e anota o resultado de cada um:

### A. Logo e favicon
```bash
ls landing/public/frugal-logo.svg 2>/dev/null && echo "LOGO OK" || echo "LOGO FALTA"
ls landing/public/favicon.svg 2>/dev/null && echo "FAVICON OK" || echo "FAVICON FALTA"
grep -q "frugal-logo.svg" landing/app/page.tsx 2>/dev/null && echo "NAV LOGO OK" || echo "NAV LOGO FALTA"
```

### B. Simple Icons
```bash
grep -q "simple-icons" landing/package.json 2>/dev/null && echo "SIMPLE_ICONS INSTALADO" || echo "SIMPLE_ICONS FALTA"
grep -q "BrandIcon\|simpleicons\|si\." landing/app/page.tsx 2>/dev/null && echo "BRAND_ICONS OK" || echo "BRAND_ICONS FALTA"
```

### C. Estrutura de secções
```bash
grep -q "InstallJourneySection\|id=\"install\"" landing/app/page.tsx 2>/dev/null && echo "INSTALL_JOURNEY OK" || echo "INSTALL_JOURNEY FALTA"
grep -q "SoundFamiliar\|sound-familiar\|The Problem" landing/app/page.tsx 2>/dev/null && echo "S3_PROBLEMA AINDA EXISTE" || echo "S3_REMOVIDA OK"
grep -q "AfterInstall" landing/app/page.tsx 2>/dev/null && echo "AFTERINSTALL AINDA SEPARADA" || echo "AFTERINSTALL COLAPSADA OK"
grep -q "CommunitySection" landing/app/page.tsx 2>/dev/null && echo "COMMUNITY AINDA EXISTE" || echo "COMMUNITY REMOVIDA OK"
```

### D. Auth e onboarding
```bash
ls landing/app/onboarding/page.tsx 2>/dev/null && echo "ONBOARDING OK" || echo "ONBOARDING FALTA"
ls landing/app/dashboard/page.tsx 2>/dev/null && echo "DASHBOARD OK" || echo "DASHBOARD FALTA"
ls landing/app/auth/callback/route.ts 2>/dev/null && echo "AUTH_CALLBACK OK" || echo "AUTH_CALLBACK FALTA"
ls landing/middleware.ts 2>/dev/null && echo "MIDDLEWARE OK" || echo "MIDDLEWARE FALTA"
```

### E. SEO e OG
```bash
ls landing/app/api/og/route.tsx 2>/dev/null && echo "OG_IMAGE OK" || echo "OG_IMAGE FALTA"
grep -q "ld+json\|SoftwareApplication" landing/app/layout.tsx 2>/dev/null && echo "STRUCTURED_DATA OK" || echo "STRUCTURED_DATA FALTA"
grep -q "plausible" landing/app/layout.tsx 2>/dev/null && echo "PLAUSIBLE OK" || echo "PLAUSIBLE FALTA (opcional)"
```

### F. TypeScript
```bash
cd landing && npx tsc --noEmit 2>&1 | tail -5
```

**Apresenta o resultado completo da auditoria antes de continuar.**
Formato esperado: lista com OK / FALTA para cada item.

---

## FASE 2 — EXECUÇÃO (só o que faltou)

Com base nos resultados da auditoria, executa apenas as tarefas com estado FALTA.
As tarefas com OK são ignoradas completamente.

A ordem de execução é sempre:
**T1 Logo → T2 Simple Icons → T4 Install Journey → T3 Colapsar secções → T6 SEO → T5 Auth → T7 Deploy**

---

### T1 — Logo SVG + Favicon (se LOGO FALTA ou FAVICON FALTA)

Cria `/landing/public/frugal-logo.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
  <rect x="8" y="8" width="4" height="24" fill="#4ec9b0"/>
  <rect x="8" y="8" width="16" height="4" fill="#4ec9b0"/>
  <rect x="8" y="18" width="12" height="4" fill="#4ec9b0"/>
  <line x1="12" y1="32" x2="22" y2="32" stroke="#4ec9b0" stroke-width="2" opacity="0.5"/>
  <line x1="22" y1="32" x2="28" y2="26" stroke="#4ec9b0" stroke-width="2" opacity="0.8"/>
  <circle cx="28" cy="26" r="2" fill="#4ec9b0"/>
  <circle cx="22" cy="36" r="2" fill="#4ec9b0" opacity="0.4"/>
</svg>
```

Cria `/landing/public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#080808"/>
  <rect x="7" y="6" width="3" height="20" fill="#4ec9b0"/>
  <rect x="7" y="6" width="13" height="3" fill="#4ec9b0"/>
  <rect x="7" y="14" width="10" height="3" fill="#4ec9b0"/>
  <circle cx="24" cy="22" r="2.5" fill="#4ec9b0" opacity="0.7"/>
</svg>
```

Em `landing/app/layout.tsx`, actualiza os icons:
```tsx
icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
```

Em `landing/app/page.tsx`, na nav, substitui `🐕 frugal` por:
```tsx
<img src="/frugal-logo.svg" alt="frugal" width={28} height={28} style={{display:'inline',verticalAlign:'middle',marginRight:6}} />
<span className="nav-brand-name">frugal</span>
```
No footer, mantém o 🐕: `Built in São Paulo 🐕 · MIT License · 2026`

```bash
# Commit após T1:
git add landing/public/frugal-logo.svg landing/public/favicon.svg landing/app/layout.tsx landing/app/page.tsx
git commit -m "brand(identity): F+routing SVG logo + favicon + nav update"
```

---

### T2 — Simple Icons logos oficiais (se SIMPLE_ICONS FALTA)

```bash
cd landing && npm install simple-icons
```

Depois, em `landing/app/page.tsx`, substitui as funções `AnthropicIcon`, `OpenAIIcon`, `GeminiIcon`, `MistralIcon` por versões que usam os paths do Simple Icons:

```bash
# Extrai os paths do Simple Icons sem browser:
node -e "
const si = require('simple-icons');
const icons = ['siAnthropic','siOpenai','siGoogle','siMeta','siMistralai','siNvidia'];
icons.forEach(k => {
  if (si[k]) console.log(k + ':', si[k].hex, '\npath:', si[k].path.slice(0,80)+'...');
  else console.log(k + ': NOT FOUND');
});
" 2>/dev/null || echo "Correr dentro de landing/ com node_modules disponível"
```

Para cada icon encontrado, actualiza a função correspondente em `page.tsx`:
```tsx
function AnthropicIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#CC9B7A">
      <path d="[PATH DO si.siAnthropic.path]" />
    </svg>
  );
}
```

Se `siOllama` não existir no Simple Icons, mantém o SVG actual para Ollama.

```bash
git add landing/package.json landing/package-lock.json landing/app/page.tsx
git commit -m "feat(branding): official brand SVGs via Simple Icons for LLM providers"
```

---

### T4 — InstallJourneySection (se INSTALL_JOURNEY FALTA) — CRÍTICA

Adiciona em `landing/app/page.tsx` o componente `InstallJourneySection` com 5 passos numerados.
Posição: entre `<ComparisonSection />` e `<PricingAccess />` (ou equivalente).

**Dados dos passos** (constante `INSTALL_STEPS` no topo do ficheiro):
```tsx
const INSTALL_STEPS = [
  {
    num: '01', title: 'Tens o Claude Code?',
    desc: 'frugal vive dentro do Claude Code. Se ainda não tens, instala primeiro.',
    check: 'claude --version', time: '5 min', prereq: true,
    notYet: 'Instala em claude.ai/download', notYetUrl: 'https://claude.ai/download',
    tooltip: 'Claude Code é a ferramenta de programação com IA da Anthropic. É usada via terminal e é onde o frugal vive.',
  },
  {
    num: '02', title: 'Tens Node.js 20+?',
    desc: 'O router do frugal corre em Node.js. A maioria dos developers já tem.',
    check: 'node --version', time: '3 min', prereq: true,
    notYet: 'Instala em nodejs.org (escolhe LTS)', notYetUrl: 'https://nodejs.org',
  },
  {
    num: '03', title: 'Instala o frugal',
    desc: 'Uma linha. Cola no terminal. O installer detecta o teu sistema automaticamente.',
    commands: {
      mac: 'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)',
      windows: 'irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex',
    },
    time: '30 seg', prereq: false,
  },
  {
    num: '04', title: 'Faz um prompt qualquer no Claude Code',
    desc: 'Qualquer coisa. O frugal já está a trabalhar em silêncio.',
    example: 'rename the handleConnect function to onConnect',
    time: '5 seg', prereq: false,
  },
  {
    num: '05', title: 'Corre /frugal-status',
    desc: 'Vê o que aconteceu: modelo usado, quanto poupaste. O teu primeiro momento WOW.',
    example: '/frugal-status',
    expectedOutput: 'frugal ⚡ tudo verde\n  Router: activo · T0 (grátis)\n  Savings: $0.05 poupados\n  Ollama: online\n  Hub: conectado',
    time: '2 seg', prereq: false,
  },
];
```

**Estrutura visual do componente:**
- Fundo com classe `section-alt` (já existe no globals.css)
- Timeline vertical: linha teal conecta os 5 círculos numerados
- Passos 01/02: toggle "Já tenho ✓" que esconde/mostra o link de instalação (useState)
- Passo 03: tabs `[Mac/Linux]` `[Windows]` com comando copiável (useState para tab activa + copy)
- Passo 05: terminal mockup com o `expectedOutput` em fonte mono, fundo #111
- Footer da secção: `"Total: menos de 2 minutos. Sem configuração, sem proxies, sem riscos."`
- CSS adicional necessário: `.install-journey`, `.ij-step`, `.ij-line`, `.ij-num`, `.ij-body`, `.ij-check`, `.ij-tabs`, `.ij-terminal` — adiciona a `globals.css`

```bash
git add landing/app/page.tsx landing/app/globals.css
git commit -m "feat(landing): InstallJourneySection — step-by-step FOR DUMMIES install guide"
```

---

### T3 — Colapsar secções (se S3_PROBLEMA AINDA EXISTE ou AFTERINSTALL AINDA SEPARADA ou COMMUNITY AINDA EXISTE)

**3a. Remove SoundFamiliarSection / ProblemSection (S3)**
Localiza o componente e remove-o do render em `page.tsx`. Se tiver código inline, apaga o bloco.

**3b. Colapsa AfterInstall dentro de HowItWorks**
Em `HowItWorksSection`, adiciona um toggle/tab no final:
```tsx
// Dentro de HowItWorksSection, no final:
const [showAfterInstall, setShowAfterInstall] = useState(false);
// ...
<button onClick={() => setShowAfterInstall(!showAfterInstall)}>
  {showAfterInstall ? 'Ocultar' : 'Ver: After Install (statusline, comandos)'}
</button>
{showAfterInstall && <AfterInstallContent />}
```
Move o conteúdo do `AfterInstallSection` para um sub-componente `AfterInstallContent` dentro do mesmo ficheiro.

**3c. Remove CommunitySection**
Localiza e remove do render. Qualquer estatística única move para o `FlywheelSection` existente.

```bash
git add landing/app/page.tsx
git commit -m "refactor(landing): collapse 10 sections to 6 — remove redundant content"
```

---

### T6 — SEO + OG Image (se OG_IMAGE FALTA ou STRUCTURED_DATA FALTA)

**OG Image** — cria `landing/app/api/og/route.tsx`:
```tsx
import { ImageResponse } from 'next/og';
export const runtime = 'edge';
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const savings = searchParams.get('savings') || '89.9%';
  return new ImageResponse(
    <div style={{ background: '#080808', width: '1200px', height: '630px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: 'monospace' }}>
      <div style={{ color: '#4ec9b0', fontSize: '80px', fontWeight: 800 }}>frugal</div>
      <div style={{ color: '#ededed', fontSize: '32px', marginTop: '20px' }}>{savings} less. Same results.</div>
      <div style={{ color: '#666', fontSize: '20px', marginTop: '16px' }}>The Claude Code router that knows when to save.</div>
    </div>,
    { width: 1200, height: 630 }
  );
}
```

**Structured Data + OG meta** — em `landing/app/layout.tsx`, adiciona dentro do `metadata`:
```tsx
openGraph: {
  title: 'frugal — 90% less LLM cost for Claude Code',
  description: 'Automatic model routing. 89.9% savings validated on 1,437 real prompts.',
  images: [{ url: '/api/og?savings=89.9%25', width: 1200, height: 630 }],
},
```
E adiciona o JSON-LD como script no `<head>` via `generateMetadata` ou directamente no layout.

```bash
git add landing/app/api/og/route.tsx landing/app/layout.tsx
git commit -m "feat(seo): OG image API + structured data for social sharing"
```

---

### T5 — Auth + Onboarding + Dashboard (se ONBOARDING FALTA)

> ⚠️ **MOSTRA AO PAULO O PLANO ANTES DE EXECUTAR:**
> "Vou criar /onboarding e /dashboard com Supabase magic link auth.
> Tabelas necessárias: profiles (já expandida), sem schema novo necessário.
> Posso avançar?"

Se aprovado:

**Auth callback** — cria `landing/app/auth/callback/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) return NextResponse.redirect(new URL('/onboarding', request.url));
  return NextResponse.redirect(new URL('/', request.url));
}
```

**Middleware** — cria `landing/middleware.ts`:
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (['/dashboard', '/onboarding'].some(p => pathname.startsWith(p))) {
    const session = request.cookies.get('sb-access-token') || request.cookies.get('sb-auth-token');
    if (!session) return NextResponse.redirect(new URL('/#access', request.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ['/dashboard/:path*', '/onboarding/:path*'] };
```

**Onboarding wizard** — cria `landing/app/onboarding/page.tsx` com 4 steps:
- Step 1: hardware (Mac M-series / Windows NVIDIA / Linux NVIDIA / Outro) + subscriptions (checkboxes)
- Step 2: slider de prompts/dia com cálculo de savings estimados em tempo real
- Step 3: comando de install correcto para o hardware escolhido no Step 1 (com copy button)
- Step 4: instrução para correr `/frugal-status` + terminal mockup do output esperado + botão "Entrar no dashboard"

Ao completar cada step, faz POST para `/api/waitlist` com os dados (ou actualiza o perfil se já autenticado).

**Dashboard** — cria `landing/app/dashboard/page.tsx`:
- Header: "Olá, [email] · frugal v0.9.4"
- Card: hardware + subscriptions configurados (editável via modal)
- Card: savings acumulados (puxa de `/api/stats` do hub — se 0, mostra "a aguardar primeiros dados")
- Card: "Instalar noutro computador" — link para `/onboarding`
- Footer: link para PRIVACY.md + logout

```bash
git add landing/app/auth/ landing/app/onboarding/ landing/app/dashboard/ landing/middleware.ts
git commit -m "feat(auth): magic link auth + 4-step onboarding wizard + user dashboard"
```

---

### T7 — TypeScript check + Deploy (sempre no final)

```bash
cd landing && npx tsc --noEmit
```

Se houver erros, corrige-os antes de continuar.
Se limpo:

```bash
# Deploy — correr no terminal do Paulo (não funciona no sandbox Linux):
cd landing && vercel --prod
```

Após deploy, anota a URL e actualiza `INFRA.md` se a URL mudou.

---

## PROTOCOLO FINAL

Após completar tudo:

1. Actualizar `SYNC.md` — secção CLAUDE CODE → COWORK com lista de commits e URL de deploy
2. Criar página Notion no HQ (`33d6f6e4-2bc4-816b-977a-fe84bbe912c9`):
   Título: `🎨 Sessão YYYY-MM-DD — Landing v10: logo, install journey, auth`
3. Actualizar `INFRA.md` se URL da landing mudou
4. Perguntar ao Paulo:
   - Gostas do novo logo SVG? (posso iterar)
   - Approvas o T5 (wizard + dashboard)? (já implementado ou aguarda)
   - Posso fazer deploy para prod?
