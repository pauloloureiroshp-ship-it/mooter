# E2E_MVP_MASTER_PROMPT.md
# frugal — End-to-End MVP Validation + Fix
# Missão: percorrer a experiência completa do Paulo no MacBook Pro e garantir que funciona
# Gerado: 2026-04-10

> **Esta é a tarefa mais importante antes de mostrar a amigos e família.**
> Não é só testes — é simular ser o Paulo pela primeira vez, encontrar o que parte, e consertar.
> Lê tudo antes de tocar em qualquer ficheiro. Age como QA engineer + developer ao mesmo tempo.

---

## CONTEXTO COMPLETO DO PROJECTO

### O que é o frugal
Router de modelos para Claude Code. Classifica cada prompt em <50ms (regex puro) e emite um
`<router-hint>` que direciona T0 (Ollama, grátis) → T1 (Haiku) → T2 (Sonnet) → T3 (Opus).
Resultado validado: 89.9% de savings em 1,437 prompts reais.

### Stack completo
- **Runtime**: `~/.claude/tools/router/` — classify.js, inject_context.js, savings-tracker.js
- **Landing**: Next.js 15, `landing/` — deployed em https://landing-five-azure-16.vercel.app
- **Backend**: Cloudflare Worker `frugal-hub` — https://mooter-hub.frugal-hub.workers.dev
- **Auth + DB**: Supabase — project `eymtobwinevywmmlmxqa` (sa-east-1)
- **Repo**: `C:\Users\Paulo Loureiro\frugal\` (Windows dev machine) + GitHub privado

### Estado actual (auditado 2026-04-10)
| Componente | Estado |
|---|---|
| classify.js (102 patterns) | ✅ prod, fix commit message T1 aplicado |
| install.sh (Mac) | ✅ testado, idempotente |
| install-windows.ps1 | ✅ testado |
| frugal-hub (Cloudflare) | ✅ live, /health ok |
| Landing v9/v10 | ✅ deployed — logo SVG, OG image, /onboarding, /dashboard, middleware |
| Supabase waitlist RLS | ⚠️ INSERT anon — verificar |
| GitHub OAuth | ⚠️ pendente setup no GitHub dashboard |
| PAULO_WEBHOOK_URL | ⚠️ placeholder no Cloudflare |
| Scheduled task backtest | ⚠️ pendente registo |

### Ficheiros de referência
- `INFRA.md` — todos os endpoints, IDs, credenciais, comandos
- `AUDIT_REPORT.md` — auditoria completa com scores por área
- `SYNC.md` — estado actual, missão próxima sessão

---

## A JORNADA QUE VAIS SIMULAR (perspectiva do Paulo no MacBook Pro)

```
1. Paulo abre a landing page no browser
2. Paulo lê a proposta de valor e vê os números reais
3. Paulo faz scroll, vê a demo, entende o conceito
4. Paulo vai até ao form e submete o email
5. Paulo recebe (ou não) um magic link
6. Paulo clica no link → chega ao /onboarding
7. Paulo selecciona o seu setup (Mac M-series + Claude API)
8. Paulo vê o comando de instalação personalizado
9. Paulo copia o comando e corre no terminal do MacBook
10. Paulo abre o Claude Code e faz um prompt
11. Paulo corre /frugal-status e vê o momento WOW
12. Paulo vai ao /dashboard e vê o seu perfil
```

Cada passo deste fluxo tem de funcionar. O teu trabalho é:
1. Testar cada passo
2. Documentar o que falha
3. Consertar o que conseguires consertar autonomamente
4. Reportar o que requer intervenção manual do Paulo

---

## BLOCO 1 — LANDING PAGE (experiência de descoberta)

### 1.1 Verificação local

```bash
cd landing

# Instala dependências se necessário
npm install 2>/dev/null | tail -3

# TypeScript check
npx tsc --noEmit 2>&1
```

Se houver erros TypeScript → **corrige-os antes de continuar**. Não há desculpa para TS errors
em código que vai ser mostrado a amigos.

### 1.2 Audit de conteúdo (o Paulo vai ler isto)

Lê `landing/app/page.tsx` e verifica:

**Hero section:**
- [ ] Headline clara e directa (não mais de 8 palavras)
- [ ] Número de savings visível (89.9% ou 90.2%)
- [ ] Counters ao vivo a funcionar (puxa de frugal-hub /api/stats)
- [ ] Install command copiável e correcto
  - Mac: `bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)`
  - Windows: `irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex`

**Instalar como o Paulo (Mac M-series):**

```bash
# Verifica se o install command do hero está correcto:
grep -n "curl.*install.sh\|githubusercontent.*install" landing/app/page.tsx | head -5
```

**InstallJourneySection:**
- [ ] Existe no page.tsx (grep: `InstallJourneySection`)
- [ ] Está renderizada (grep: `<InstallJourneySection`)
- [ ] Tem tab Mac/Linux vs Windows
- [ ] Tem o passo "O que é o Claude Code?" com tooltip

Se `<InstallJourneySection` não aparecer no render → adiciona imediatamente:
```bash
grep -n "ComparisonSection\|PricingAccess\|<Comparison\|<Pricing" landing/app/page.tsx | tail -5
```
Coloca `<InstallJourneySection />` entre `<ComparisonSection />` e o bloco de Pricing/Access.

**Form de waitlist (AccessSection):**
- [ ] Campo de email presente
- [ ] Submit button presente
- [ ] Após submit: mostra mensagem de confirmação (não fica em branco)

### 1.3 Teste do form de waitlist (simulação)

```bash
# Testa o endpoint de waitlist directamente:
curl -s -X POST https://landing-five-azure-16.vercel.app/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"test-e2e@frugal.dev","hardware":"mac_m_series","subscriptions":["claude_api"]}' \
  | python3 -m json.tool 2>/dev/null || echo "JSON inválido ou endpoint offline"
```

Se retornar `503` com mensagem sobre RLS → documenta. É o problema conhecido da RLS policy.
Se retornar `200` ou `201` → ✅
Se retornar `404` → a landing não está deployed ou o endpoint não existe

### 1.4 Audit visual rápido

```bash
# Verifica que as secções críticas existem:
for section in "HeroSection\|hero" "DemoSection\|demo" "FlywheelSection\|flywheel" "InstallJourneySection\|install" "ComparisonSection\|comparison" "PricingAccess\|access"; do
  count=$(grep -c "$section" landing/app/page.tsx 2>/dev/null || echo 0)
  echo "$section: $count ocorrências"
done
```

---

## BLOCO 2 — FLUXO DE AUTH E ONBOARDING

### 2.1 Verifica estrutura de ficheiros

```bash
echo "=== Auth e Onboarding ===" && \
ls landing/app/auth/callback/ 2>/dev/null && echo "callback: OK" || echo "callback: FALTA" && \
ls landing/app/onboarding/page.tsx 2>/dev/null && echo "onboarding: OK" || echo "onboarding: FALTA" && \
ls landing/app/dashboard/page.tsx 2>/dev/null && echo "dashboard: OK" || echo "dashboard: FALTA" && \
ls landing/middleware.ts 2>/dev/null && echo "middleware: OK" || echo "middleware: FALTA"
```

### 2.2 Verifica o fluxo de magic link

```bash
# Verifica que supabase.ts tem signInWithEmail ou equivalente:
grep -n "signIn\|otp\|magic\|auth/v1" landing/app/lib/supabase.ts | head -10
```

Se não existir função de auth → adiciona em `landing/app/lib/supabase.ts`:
```typescript
export async function signInWithEmail(email: string): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://landing-five-azure-16.vercel.app';
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/onboarding` }
    }),
  });
  return res.ok;
}
```

### 2.3 Verifica o onboarding (o coração da personalização)

```bash
# Lê o onboarding completo:
wc -l landing/app/onboarding/page.tsx
grep -n "Step\|step\|hardware\|INSTALL_CMD\|generateFrugalConfig\|frugalConfig" landing/app/onboarding/page.tsx | head -30
```

O onboarding deve ter:
- [ ] Step 1: selecção de hardware (Mac M-series, Windows NVIDIA, etc.)
- [ ] Step 2: selecção de subscriptions (Claude API, Claude Max, etc.)
- [ ] Step 3: estimativa de prompts/dia com cálculo de savings
- [ ] Step 4: comando de instalação correcto para o hardware escolhido (Mac → install.sh, Windows → .ps1)
- [ ] Step 5 (ou final): instrução para correr `/frugal-status` com mockup do output esperado

**Verifica que o generateFrugalConfig está a ser usado:**
```bash
cat landing/app/lib/generate-frugal-config.ts 2>/dev/null | head -40
```

Se `generate-frugal-config.ts` não existir ou estiver incompleto → cria/completa:
```typescript
// landing/app/lib/generate-frugal-config.ts
export interface UserProfile {
  hardware: string;
  subscriptions: string[];
  promptsPerDay?: number;
  githubLanguage?: string;
}

export function generateFrugalConfig(profile: UserProfile): Record<string, unknown> {
  const hasOllama = ['mac_m_series', 'windows_nvidia', 'linux_nvidia', 'windows_amd', 'linux_amd'].includes(profile.hardware);
  const hasClaudeAPI = profile.subscriptions.some(s => s.toLowerCase().includes('api'));
  const hasClaudeMax = profile.subscriptions.some(s => s.toLowerCase().includes('max'));

  return {
    routing: {
      t0: hasOllama ? 'ollama' : 'skip',
      t1: hasClaudeAPI || hasClaudeMax ? 'haiku' : 'skip',
      t2: 'sonnet',
      t3: 'opus',
    },
    ollama: {
      enabled: hasOllama,
      model: profile.hardware === 'mac_m_series' ? 'qwen2.5:3b' : 'qwen2.5:7b',
    },
    estimated_savings_pct: hasOllama ? 89.9 : 45.0,
    hardware: profile.hardware,
    subscriptions: profile.subscriptions,
    generated_at: new Date().toISOString(),
    version: '0.9.4',
  };
}
```

### 2.4 Verifica o dashboard

```bash
grep -n "profile\|savings\|install_completed\|frugal_config" landing/app/dashboard/page.tsx | head -20
```

O dashboard deve mostrar:
- [ ] Email do utilizador
- [ ] Hardware seleccionado
- [ ] Config gerada pelo frugal
- [ ] Estado de instalação (install_completed: true/false)
- [ ] Link para instalar noutro computador

---

## BLOCO 3 — SIMULAÇÃO DE INSTALAÇÃO NO MAC

### 3.1 Verifica o install.sh para Mac M-series

```bash
# Verifica que o install.sh existe e tem o conteúdo certo:
grep -n "M-series\|mac\|darwin\|RECOMMENDED_OLLAMA\|qwen" install.sh | head -20

# Verifica que o smoke test existe:
ls tools/router/smoke-test.js && echo "smoke-test: OK" || echo "smoke-test: FALTA"

# Verifica que os paths estão correctos para Mac (sem espaços problemáticos):
grep -n "CLAUDE_DIR\|HOME\|path" install.sh | head -15
```

### 3.2 Dry-run do installer (sem instalar de verdade)

```bash
# Simula o installer em modo dry-run (não instala nada):
bash install.sh --dry-run 2>&1 | head -50
```

Analisa o output:
- [ ] Detecta correctamente o OS (macOS)
- [ ] Mostra os paths correctos (sem espaços problemáticos)
- [ ] Lista os ficheiros que vai copiar
- [ ] Mostra os comandos ollama pull que vai correr
- [ ] Mostra o comando de registo do hook

Se houver erros no dry-run → corrige-os.

### 3.3 Verifica o hook de Claude Code

```bash
# Verifica que o settings.json template está correcto:
grep -n "UserPromptSubmit\|inject_context\|hooks" tools/router/inject_context.js | head -10
cat ~/.claude/settings.json 2>/dev/null | python3 -m json.tool | grep -A5 "hooks\|UserPrompt" || echo "settings.json não encontrado (normal se não instalado)"
```

### 3.4 Smoke test do classifier

```bash
# Os 5 casos de uso do Paulo no Mac:
node tools/router/classify.js "rename the handleConnect function to onConnect" && echo "---"
node tools/router/classify.js "generate commit message for this diff" && echo "---"
node tools/router/classify.js "why does this React component re-render too often" && echo "---"
node tools/router/classify.js "redesign the auth system to support multiple providers" && echo "---"
node tools/router/classify.js "add a dark mode toggle to the settings page" && echo "---"
```

Resultados esperados:
| Prompt | Esperado |
|---|---|
| rename handleConnect | T0 (Ollama, grátis) |
| generate commit message | T1 (Haiku) |
| why React re-render | T2 (Sonnet) |
| redesign auth system | T3 (Opus) |
| dark mode toggle | T0 (Ollama, grátis) |

Se algum estiver errado → documenta mas não corrige agora (requer análise de impacto separada).

### 3.5 Verifica o frugal-hub (dados reais chegam ao Paulo)

```bash
# Hub health:
curl -s https://mooter-hub.frugal-hub.workers.dev/health | python3 -m json.tool

# Stats actuais (o que a landing mostra):
curl -s https://mooter-hub.frugal-hub.workers.dev/api/stats | python3 -m json.tool

# Simula um delta do Paulo a chegar ao hub:
curl -s -X POST https://mooter-hub.frugal-hub.workers.dev/api/delta \
  -H "Content-Type: application/json" \
  -d '{"hw_tier":"high","sub_profile":"api_only","prompt_count":5,"tier_distribution":{"T0":4,"T1":1},"delta_version":"0.9.4"}' \
  | python3 -m json.tool
```

---

## BLOCO 4 — EXPERIÊNCIA PÓS-INSTALAÇÃO (o momento WOW)

### 4.1 Verifica o skill /frugal-status

```bash
cat skills/frugal-status/SKILL.md | head -40
```

O output do /frugal-status deve mostrar:
- [ ] Estado do router (activo/inactivo)
- [ ] Último prompt e tier usado
- [ ] Savings acumulados
- [ ] Estado do Ollama
- [ ] Estado do hub

Se o SKILL.md estiver desactualizado ou incompleto → actualiza com o estado real v0.9.4.

### 4.2 Verifica o skill /frugal-hello (primeiro uso)

```bash
cat skills/frugal-hello/SKILL.md | head -30
```

O /frugal-hello é o primeiro contacto do amigo com o frugal após instalar.
Deve ser: encorajador, claro, mostrar que já está a funcionar.

### 4.3 Verifica o onboarding automático (inject_context.js)

```bash
grep -n "onboarding\|ONBOARDING\|first.use\|firstUse" tools/router/inject_context.js | head -15
```

O inject_context.js deve chamar onboarding automaticamente no primeiro uso.
Se não encontrar → verifica se existe `tools/router/onboarding.js`:
```bash
ls tools/router/onboarding.js && head -20 tools/router/onboarding.js || echo "onboarding.js não encontrado"
```

---

## BLOCO 5 — PROBLEMAS CONHECIDOS E FIXES AUTOMÁTICOS

### 5.1 Supabase RLS (problema crítico — form pode estar quebrado)

```bash
# Testa o form com um email real:
curl -s -X POST https://landing-five-azure-16.vercel.app/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"paulo.loureiro.shp+test@gmail.com","hardware":"mac_m_series","subscriptions":["claude_api"]}' \
  | python3 -m json.tool
```

Se retornar 503 → o form está quebrado para novos utilizadores.
Isto requer intervenção manual no Supabase dashboard. Documenta claramente:
```
⛔ ACÇÃO MANUAL NECESSÁRIA:
Ir a: https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/sql/new
Correr:
  CREATE POLICY "Allow anon insert" ON waitlist
  FOR INSERT TO anon
  WITH CHECK (true);
```

### 5.2 Verifica env vars da landing (podem falhar em prod)

```bash
# Verifica se o .env.local existe (para desenvolvimento local):
ls landing/.env.local 2>/dev/null && echo ".env.local: OK" || echo ".env.local: FALTA (normal em prod)"

# Verifica que as env vars estão referenciadas correctamente no código:
grep -rn "NEXT_PUBLIC_SUPABASE_URL\|NEXT_PUBLIC_SUPABASE_ANON_KEY\|NEXT_PUBLIC_SITE_URL" landing/app/ | grep -v ".next" | head -10
```

Se `.env.local` não existir E o desenvolvimento local for necessário → cria:
```bash
cat > landing/.env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://eymtobwinevywmmlmxqa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[VER SUPABASE → Settings → API → anon key]
NEXT_PUBLIC_SITE_URL=https://landing-five-azure-16.vercel.app
EOF
echo "⚠️ Substituir NEXT_PUBLIC_SUPABASE_ANON_KEY com o valor real do Supabase dashboard"
```

### 5.3 Verifica se o repo é público (install one-liner vai falhar se privado)

```bash
# Testa se o raw content do install.sh está acessível publicamente:
curl -s -o /dev/null -w "%{http_code}" \
  "https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh"
```

Se retornar `404` → o repo ainda está privado. O one-liner de instalação **NÃO VAI FUNCIONAR** para amigos.

Documenta claramente:
```
⛔ ACÇÃO MANUAL NECESSÁRIA (BLOQUEIA INSTALAÇÃO DE AMIGOS):
O repo está privado. O comando:
  bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)
retorna 404 para qualquer pessoa que não seja o Paulo.

Opções:
A) Tornar o repo público (preferido para Friends Beta)
B) Criar um GitHub Gist público com o install.sh
C) Hospedar o install.sh na landing (ex: landing-five-azure-16.vercel.app/install.sh)

RECOMENDAÇÃO: Opção C é a mais segura — o Paulo controla o conteúdo sem expor o repo.
```

**Se o Paulo aprovar a Opção C** → implementa:
```bash
# Cria landing/app/api/install/route.ts que serve o install.sh:
# (requer aprovação do Paulo antes)
```

**Se o Paulo aprovar a Opção A (tornar público):**
```bash
# O audit de segurança confirmou que não há secrets no repo
# Mas verificar novamente antes:
git log --all -- "*.env*" --oneline | head -5
grep -r "API_KEY\|SECRET\|PASSWORD\|TOKEN" --include="*.js" --include="*.ts" . \
  --exclude-dir=node_modules --exclude-dir=.next | grep -v "example\|placeholder\|process.env" | head -10
```

---

## BLOCO 6 — FIX DO QUE ESTÁ PARTIDO (por ordem de impacto)

Após os 5 blocos de verificação, tens uma lista de problemas.
Executa os fixes nesta ordem:

### P1 — TypeScript errors (se houver)
Corrige todos. Zero tolerância.

### P2 — InstallJourneySection não está no render
Se `<InstallJourneySection />` não aparece no JSX do Page component:
```bash
grep -n "return\|<main\|<section\|</main" landing/app/page.tsx | tail -20
```
Adiciona `<InstallJourneySection />` na posição correcta.

### P3 — Install one-liner não funciona (repo privado)
Implementa a Opção C (route API que serve o install.sh) se o Paulo aprovar.
Cria `landing/app/api/install/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  // Serve o install.sh directamente da landing
  // Assim o repo pode ficar privado mas o installer é público
  const script = `#!/bin/bash
# frugal installer — https://landing-five-azure-16.vercel.app
# Versão: v0.9.4
# Para instalar: bash <(curl -fsSL https://landing-five-azure-16.vercel.app/api/install)

set -e
REPO="https://github.com/pauloloureiroshp-ship-it/frugal"
echo "  frugal v0.9.4"
echo "  installer — a começar..."
echo ""
echo "  Para instalar o frugal precisas de:"
echo "  1. Claude Code (claude.ai/download)"
echo "  2. Node.js 20+ (nodejs.org)"
echo "  3. Git (git-scm.com)"
echo ""

# Se o repo for público, usar git clone
# Se privado, o Paulo tem de fornecer outro método
echo "  ⚠️  Repositório ainda privado."
echo "  Pede acesso ao Paulo: paulo.loureiro.shp@gmail.com"
exit 1
`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
    },
  });
}
```

**NOTA**: Isto é um placeholder inteligente — funciona como página de espera até o repo ficar público.

### P4 — Supabase RLS (form quebrado)
Documenta o SQL exacto. Não podes corrigir sem browser. Inclui no relatório final.

### P5 — .env.local em falta para desenvolvimento local
Cria com os valores correctos (ver Bloco 5.2).

---

## BLOCO 7 — RELATÓRIO FINAL (escreve em SYNC.md e Notion)

### 7.1 Gera o relatório E2E

Após todos os blocos, cria o ficheiro `E2E_REPORT.md` na raiz com:

```markdown
# E2E_REPORT.md — frugal MVP Validation
Data: [DATA]

## Veredicto
PRONTO PARA MAC: [SIM / NÃO / COM CONDIÇÕES]

## Jornada completa — resultado por passo
| Passo | Estado | Notas |
|---|---|---|
| 1. Landing page carrega | [✅/⚠️/❌] | |
| 2. Counters ao vivo | [✅/⚠️/❌] | |
| 3. Demo section funciona | [✅/⚠️/❌] | |
| 4. Form de waitlist | [✅/⚠️/❌] | RLS policy? |
| 5. Magic link recebido | [✅/⚠️/❌] | |
| 6. /onboarding carrega | [✅/⚠️/❌] | |
| 7. Hardware selection funciona | [✅/⚠️/❌] | |
| 8. Install command correcto (Mac) | [✅/⚠️/❌] | |
| 9. Install one-liner funciona | [✅/⚠️/❌] | Repo público? |
| 10. Classifier T0/T1/T2/T3 correcto | [✅/⚠️/❌] | |
| 11. /frugal-status funciona | [✅/⚠️/❌] | |
| 12. /dashboard mostra perfil | [✅/⚠️/❌] | |

## Acções manuais necessárias (só o Paulo pode fazer)
1. [lista]

## O que foi corrigido nesta sessão
- [lista de commits]

## Próximos passos para mostrar a amigos
1. [lista ordenada]
```

### 7.2 Actualiza SYNC.md

Na secção `📤 CLAUDE CODE → COWORK`, reporta:
- O veredicto E2E (pronto / com condições / não pronto)
- Lista dos problemas encontrados e estado (corrigido / pendente manual)
- O que o Paulo precisa de fazer antes de mostrar ao primeiro amigo

### 7.3 Commit e push

```bash
git add E2E_REPORT.md SYNC.md
git add landing/app/ landing/middleware.ts 2>/dev/null  # se houve mudanças
git commit -m "test(e2e): MVP validation report + fixes from full journey simulation"
git push origin main
```

### 7.4 Cria página Notion

No Notion HQ (`33d6f6e4-2bc4-816b-977a-fe84bbe912c9`), cria:
Título: `🧪 E2E MVP Validation — [DATA] — [VEREDICTO]`
Conteúdo: copia o E2E_REPORT.md para a página.
Actualiza SYNC.md com o ID da página.

---

## MENSAGEM FINAL AO PAULO

Após correr tudo, responde directamente ao Paulo com:

```
## E2E MVP — Resultado

PRONTO PARA MACBOOK PRO: [veredicto]

✅ O que funciona:
- [lista]

⚠️ O que precisa de 5 minutos teus:
- [lista com instrução exacta para cada item]

❌ O que está partido (se houver):
- [lista com impacto e opções]

Para instalar no teu MacBook Pro agora:
[comando exacto ou instrução clara]
```

---

## NOTAS PARA O CLAUDE CODE

- O Paulo tem MacBook Pro — usa Mac M-series como hardware padrão para todos os testes
- O repo pode estar privado — testa isto PRIMEIRO (Bloco 5.3) pois bloqueia tudo o resto
- Não "melhores" código que não está partido — o objectivo é validar e corrigir, não refactorizar
- Se encontrares um bug crítico que não consegues corrigir, documenta com o máximo de detalhe possível
- Usa `final-reviewer` antes de qualquer push (já está no CLAUDE.md como regra obrigatória)
- Cada fix deve ter o seu próprio commit — não um commit gigante no final
