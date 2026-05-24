# FRUGAL_OS_MASTER_PROMPT.md
# frugal — Sistema Operativo do Vibe Coder
# Master Prompt para Claude Code — Sessão v2.0
# Data: 2026-04-10 · Cowork → Claude Code

> **Lê VISION_V2.md e ARCHITECTURE_PRIVATE.md antes de começar.**
> Este prompt contém o roadmap de implementação para transformar o frugal
> de um router de LLMs num sistema operativo completo para vibe coders.
> Algumas tarefas são para esta sessão. Outras são para sessões futuras — marcadas com [FUTURO].
> Faz apenas as tarefas desta sessão. Documenta o resto em SYNC.md.

---

## CONTEXTO CRÍTICO — lê antes de qualquer coisa

### O que o frugal é (v2.0)
Não é só um router de LLMs. É o sistema operativo do vibe coder:
- Conhece o utilizador: hardware, subscrições, projectos, stack, nível
- Optimiza automaticamente: routing + config + sugestões personalizadas
- Aprende com a comunidade: cada decisão melhora o algoritmo para todos
- Liberta do ruído: o frugal actualiza-se, o utilizador não precisa

### O "segredo da Coca-Cola"
O código é MIT. O activo real é o dataset de decisões de routing.
Criar repo privado `frugal-core` é a tarefa mais estratégica desta sessão.
**Nunca commites o dataset ou modelo para o repo público.**

### Regras absolutas
- Faz commit por feature (nunca um commit gigante)
- TypeScript clean (tsc --noEmit) antes de cada commit na landing
- Aguarda aprovação do Paulo para: Supabase schema, deploy, repo público
- Regista progresso em SYNC.md a cada milestone
- Não uses Opus para tarefas de edição de ficheiros (seria anti-frugal)

---

## PRIORIDADE 1 — Repo Privado frugal-core (CRÍTICO — faz primeiro)

### Por quê agora
O dataset de decisões de routing é o activo mais valioso do frugal.
Actualmente está disperso em decisions.log em cada máquina.
Precisa de um home seguro antes de crescer a comunidade.

### 1a. Cria o repo frugal-core localmente

```bash
mkdir -p ~/.frugal-core
cd ~/.frugal-core
git init
```

Estrutura de directorias a criar:
```
~/.frugal-core/
  dataset/
    README.md              ← explica o formato, versionamento, como contribuir
    v1.0-2026-04-10.jsonl  ← corpus inicial (ver formato abaixo)
    CHANGELOG.md
  model/
    README.md              ← placeholder para quando o modelo existir
  decisions/
    README.md              ← snapshots do algoritmo de decisão
  research/
    README.md              ← análises internas, benchmarks
  ARCHITECTURE_PRIVATE.md  ← copia do ficheiro já criado
  .gitignore               ← tudo é privado por default
```

### 1b. Exporta o corpus inicial para dataset/v1.0

O corpus de 1,437 prompts que treinou o classify.js está em algum lado.
Procura em:
- `tools/router/backtest-data/`
- `tools/router/adversarial-gen/`
- Qualquer ficheiro .jsonl ou .json com prompts categorizados

Exporta no formato canónico (ver ARCHITECTURE_PRIVATE.md § Dataset):
```jsonl
{"id":"sha256-of-prompt","prompt_len":45,"prompt_len_bucket":"short","tier_assigned":"T0","tier_correct":true,"confidence":0.94,"matched_patterns":["TRIVIAL: rename"],"hw_tier":"gpu_mid","user_cohort":"intermediate","session_hash":"local","ts":"2026-04-10T00:00:00Z","frugal_version":"0.9.3"}
```

Se os prompts existirem em formato diferente, cria um script de conversão:
`~/.frugal-core/scripts/convert-to-canonical.js`

### 1c. README do dataset

Cria `~/.frugal-core/dataset/README.md`:
```markdown
# frugal Dataset — Routing Decisions

## Formato
Cada linha é uma decisão de routing. Ver ARCHITECTURE_PRIVATE.md para o schema completo.

## Versões
- v1.0 (2026-04-10): 1,437 prompts, corpus inicial curado manualmente
  Accuracy: 100% no classify.js v0.9.3

## Como adicionar dados
1. Recolher decisions.log de utilizadores (via hub, anonimizado)
2. Validar tier_correct via heurística (ver scripts/validate.js)
3. Correr scripts/convert-to-canonical.js
4. Adicionar ao ficheiro da versão corrente
5. Actualizar CHANGELOG.md

## O que NUNCA vai aqui
- Prompts raw (só hashes SHA-256)
- Identificadores de utilizador
- Paths de ficheiros ou nomes de projectos
```

### 1d. Cria o repo no GitHub como PRIVADO

**NOTA: Aguarda confirmação do Paulo antes de criar o repo no GitHub.**
Mostra este comando e pede confirmação:
```bash
gh repo create pauloloureiroshp-ship-it/frugal-core --private --description "frugal routing engine — dataset, model, private architecture"
cd ~/.frugal-core
git remote add origin git@github.com:pauloloureiroshp-ship-it/frugal-core.git
git add .
git commit -m "init: frugal-core private repo — dataset v1.0 + architecture"
git push -u origin main
```

#### Commit (no frugal-core): `init: frugal-core private repo — dataset v1.0`

---

## PRIORIDADE 2 — GitHub OAuth + Perfil de Utilizador (v1.5 foundation)

### Por quê agora
O onboarding actual pede hardware e subscrições manualmente.
O GitHub OAuth permite detectar automaticamente a stack do utilizador
e gerar uma config frugal personalizada sem o utilizador ter de preencher nada.

### 2a. Configura GitHub OAuth no Supabase

**MOSTRA AO PAULO ANTES DE FAZER:**

No dashboard Supabase do frugal:
1. Authentication → Providers → GitHub → Enable
2. Callback URL: `https://[your-vercel-domain]/auth/callback`
3. Cria GitHub OAuth App em github.com/settings/applications/new:
   - Application name: "frugal"
   - Homepage URL: `https://[your-vercel-domain]`
   - Authorization callback URL: `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback`
4. Copia Client ID e Client Secret para o Supabase

**Scopes necessários (MÍNIMO — não pedir mais):**
- `read:user` — nome e username
- `public_repo` — lista de repos públicos (metadata apenas, nunca código)

### 2b. Actualiza supabase.ts com GitHub OAuth

```typescript
// Em /landing/app/lib/supabase.ts, adiciona:

export async function signInWithGitHub() {
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`;
  window.location.href =
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/authorize` +
    `?provider=github` +
    `&redirect_to=${encodeURIComponent(redirectTo)}` +
    `&scopes=read:user,public_repo`;
}

export async function getGitHubProfile(accessToken: string) {
  // Chama GitHub API para obter metadata dos repos
  // NUNCA lê código — só metadata
  const repos = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then(r => r.json());

  // Extrai só o que interessa: linguagens, actividade, tamanho
  const languages: Record<string, number> = {};
  let totalCommitsLastMonth = 0;

  for (const repo of repos) {
    if (repo.language) {
      languages[repo.language] = (languages[repo.language] || 0) + 1;
    }
  }

  const primaryLanguage = Object.entries(languages)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';

  return {
    github_username: repos[0]?.owner?.login,
    primary_language: primaryLanguage,
    language_distribution: languages,
    public_repos_count: repos.length,
    // NÃO incluir: repo names, descriptions, file lists, commit messages
  };
}
```

### 2c. Schema das tabelas Supabase

**MOSTRA AO PAULO ANTES DE CRIAR — aguarda confirmação:**

```sql
-- Perfil expandido (substitui o schema anterior)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,

  -- Hardware (detectado pelo installer ou escolhido no onboarding)
  hardware_tier TEXT DEFAULT 'unknown',
  -- 'mac_m_series' | 'windows_nvidia' | 'windows_amd' | 'linux_nvidia' | 'linux_amd' | 'cloud' | 'other'
  os_type TEXT DEFAULT 'unknown',
  -- 'macos' | 'windows' | 'linux'

  -- Subscrições (escolhidas no onboarding)
  subscriptions TEXT[] DEFAULT '{}',
  -- ['claude_max', 'claude_api', 'gpt_plus', 'gpt_api', 'gemini', 'none']

  -- GitHub (via OAuth — metadata apenas, nunca código)
  github_username TEXT,
  github_primary_language TEXT,
  github_language_distribution JSONB DEFAULT '{}',
  github_public_repos_count INTEGER DEFAULT 0,
  github_connected_at TIMESTAMPTZ,

  -- Perfil calculado
  experience_level TEXT DEFAULT 'unknown',
  -- 'beginner' | 'intermediate' | 'advanced' — derivado dos dados, nunca perguntado
  prompts_per_day_estimate INTEGER DEFAULT 50,
  frugal_config JSONB DEFAULT '{}',
  -- Config personalizada gerada para este utilizador

  -- Frugal usage
  frugal_version TEXT,
  install_completed BOOLEAN DEFAULT false,
  onboarding_completed BOOLEAN DEFAULT false,
  first_prompt_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Tabela de sessões de uso (para o dashboard de savings)
CREATE TABLE IF NOT EXISTS usage_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  session_date DATE NOT NULL,
  prompts_total INTEGER DEFAULT 0,
  prompts_t0 INTEGER DEFAULT 0,
  prompts_t1 INTEGER DEFAULT 0,
  prompts_t2 INTEGER DEFAULT 0,
  prompts_t3 INTEGER DEFAULT 0,
  savings_usd DECIMAL(10,4) DEFAULT 0,
  frugal_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE usage_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sessions"
  ON usage_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sessions"
  ON usage_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Actualiza waitlist para ligar ao perfil
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS github_username TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS experience_level TEXT;

-- Índices
CREATE INDEX IF NOT EXISTS idx_usage_sessions_user_date
  ON usage_sessions(user_id, session_date DESC);
```

### 2d. Função de geração de config personalizada

Cria `/landing/app/lib/generate-frugal-config.ts`:

```typescript
interface UserProfile {
  hardware_tier: string;
  subscriptions: string[];
  github_primary_language?: string;
  experience_level?: string;
  prompts_per_day_estimate?: number;
}

interface FrugalConfig {
  default_mode: 'auto' | 'zen' | 'beast';
  t0_threshold: number;       // confidence mínima para ir a T0
  t1_enabled: boolean;        // activar T1 (Haiku)?
  ollama_enabled: boolean;
  ollama_model: string;
  hub_push_enabled: boolean;
  suggested_install_command: string;
  personalized_message: string;
}

export function generateFrugalConfig(profile: UserProfile): FrugalConfig {
  const hasClaude = profile.subscriptions.includes('claude_max') ||
                    profile.subscriptions.includes('claude_api');
  const hasGPT = profile.subscriptions.includes('gpt_plus') ||
                 profile.subscriptions.includes('gpt_api');
  const isMac = profile.hardware_tier === 'mac_m_series';
  const hasGPU = profile.hardware_tier.includes('nvidia') || isMac;

  // Config base
  const config: FrugalConfig = {
    default_mode: 'auto',
    t0_threshold: 0.85,
    t1_enabled: true,
    ollama_enabled: hasGPU,    // só activa Ollama se tem GPU
    ollama_model: isMac ? 'qwen2.5:3b' : 'qwen2.5:7b',  // modelo maior para NVIDIA
    hub_push_enabled: true,
    suggested_install_command: isMac
      ? 'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)'
      : 'irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex',
    personalized_message: '',
  };

  // Personalização por linguagem
  if (profile.github_primary_language === 'Python') {
    // Python devs tendem a ter prompts mais longos (data science, ML)
    config.t0_threshold = 0.80;  // mais conservador no T0
  }

  // Personalização por nível
  if (profile.experience_level === 'beginner') {
    config.default_mode = 'auto';  // não muda
    config.personalized_message = "Olá! Configurámos o frugal para o teu setup. Tudo vai funcionar automaticamente.";
  } else if (profile.experience_level === 'advanced') {
    config.t0_threshold = 0.90;  // mais agressivo no T0 para power users
    config.personalized_message = "Config optimizada para o teu perfil. /frugal-beast quando precisares de força total.";
  }

  return config;
}
```

#### Commits:
- `feat(auth): GitHub OAuth setup + getGitHubProfile metadata extraction`
- `feat(db): profiles + usage_sessions tables + RLS policies`
- `feat(config): generateFrugalConfig — personalized config per user profile`

---

## PRIORIDADE 3 — Onboarding Wizard Completo (4 steps)

### 3a. Actualiza /app/onboarding/page.tsx (se já existe) ou cria de raiz

O wizard tem 4 steps. Cada step guarda os dados e avança.
No final, chama `generateFrugalConfig(profile)` e mostra o resultado personalizado.

**Step 1 — O teu setup** (hardware + subscriptions)
```tsx
// Mostra os botões de hardware e subscrições que já existem no form da landing
// Pré-preenche com dados do GitHub se disponíveis
// (ex: se o GitHub mostra Python como linguagem principal,
//  sugere "provavelmente usas Linux ou Mac" como hardware)
```

**Step 2 — Liga o GitHub** (opcional mas recomendado)
```tsx
// Mostra o botão "Ligar GitHub" com explicação clara:
// "Vamos só ver as linguagens dos teus repos públicos.
//  Nunca lemos código. Nunca acedemos a repos privados."
//
// Se o utilizador clicar → signInWithGitHub()
// Se o utilizador saltar → avança sem GitHub
//
// VISUAL: mostrar exactamente os 2 scopes que serão pedidos
// e o que cada um permite (e o que não permite)
```

**Step 3 — Instala o frugal**
```tsx
// Mostra o comando de instalação PERSONALIZADO para o hardware do Step 1
// Tabs [Mac/Linux] [Windows] com o comando correcto
// Botão "Copiar" + timer de 30 segundos
// "Já instalei →" para avançar
```

**Step 4 — A tua config personalizada**
```tsx
// Chama generateFrugalConfig(profile) e mostra o resultado:
// "O teu frugal foi configurado especificamente para ti"
// Mostra: modo (Auto/Zen/Beast), Ollama activado (Sim/Não), modelo sugerido
// Estimativa de savings: "Com o teu perfil, estimamos X% de savings"
// CTA final: "Abrir Claude Code e escrever /frugal-status"
```

### 3b. Actualiza /app/dashboard/page.tsx

Dashboard após onboarding completo:

**Secção 1 — Savings** (placeholder se não há dados ainda)
```tsx
// Se install_completed = false:
//   "Ainda não detectámos o teu primeiro prompt. Instala e usa o frugal."
//   [Botão: Ver instruções de instalação]
//
// Se install_completed = true e há dados em usage_sessions:
//   Gráfico de barras: savings/dia nos últimos 30 dias
//   Total: $X.XX poupados desde a instalação
//   Distribuição: T0 X% · T1 X% · T2 X% · T3 X%
```

**Secção 2 — O teu perfil**
```tsx
// Hardware: [ícone do OS] Mac M-series
// Subscrições: Claude Max · GPT API
// GitHub: @username · Python · 47 repos
// Nível estimado: Intermediate
// [Editar]
```

**Secção 3 — A tua config frugal**
```tsx
// Modo: Auto
// T0 threshold: 0.85
// Ollama: qwen2.5:3b (activo)
// Hub push: ligado
// [Actualizar config]
```

**Secção 4 — Comunidade**
```tsx
// "Contribuíste com X decisões de routing para a comunidade"
// "O algoritmo melhorou X% desde que instalaste"
// Link para o hub público: mooter-hub.frugal-hub.workers.dev/api/stats
```

#### Commits:
- `feat(onboarding): 4-step wizard with GitHub integration + personalized config display`
- `feat(dashboard): savings chart + profile display + community contribution`

---

## PRIORIDADE 4 — Contador de Savings em Tempo Real na Landing

### Contexto
O ponto 10 do Paulo é crítico: a landing precisa de mostrar visualmente
quanto dinheiro a comunidade já poupou em tempo real.
Este é o social proof mais poderoso que o frugal pode ter.

### 4a. Actualiza o Hero com contador de savings em USD

Actualmente o hero tem:
- Prompt count (1,437+)
- Avg savings %
- Total savings USD (já existe!)

O que melhorar:
- Tornar o counter de USD mais proeminente e com animação de incremento
- Adicionar "este mês" vs "total" toggle
- Mostrar uma linha como: "A comunidade poupou $6.29 · 1,437 prompts"
  que cresce visivelmente quando chega novo dado do hub

```tsx
// Adiciona ao useCommunityStats():
// Fetch a cada 30 segundos (já faz, apenas tornar mais visível o incremento)
// Anima o número quando muda (CSS transition num span isolado)
// Formato: "$6.29" que passa para "$6.31" com animação suave
```

### 4b. Banner de savings global (nova linha no hero)

Adiciona uma linha abaixo do H1, antes do subtitle:

```tsx
<div className="hero-savings-banner">
  <span className="hsb-live">● LIVE</span>
  <span className="hsb-text">
    Community saved <strong>${totalSaved.toFixed(2)}</strong> across{' '}
    <strong>{promptCount.toLocaleString()}</strong> prompts
  </span>
</div>
```

CSS:
```css
.hero-savings-banner {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.85rem;
  border: 1px solid rgba(78,201,176,0.3);
  border-radius: 100px;
  font-size: 0.8rem;
  color: var(--fg-muted);
  margin-bottom: 1.5rem;
}
.hsb-live {
  color: var(--t0);
  font-size: 0.7rem;
  animation: pulse 2s ease-in-out infinite;
}
.hsb-text strong { color: var(--t0); }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
```

#### Commit: `feat(landing): live community savings counter in hero`

---

## PRIORIDADE 5 — hub-push.js: registo de sessões no Supabase

### Contexto
Actualmente o hub-push.js envia deltas para o Cloudflare D1 (anonimizado).
Para o dashboard do utilizador mostrar savings, precisa de registar sessões
na tabela `usage_sessions` no Supabase, ligadas ao user_id.

### 5a. Actualiza hub-push.js para suporte dual: D1 (anónimo) + Supabase (autenticado)

```javascript
// Em tools/router/hub-push.js

// Modo 1 (actual): push anónimo para D1 via Cloudflare Worker
// Modo 2 (novo): push autenticado para Supabase (se user_id disponível)

async function pushToSupabase(sessionData, userId, supabaseUrl, supabaseAnonKey) {
  if (!userId || !supabaseUrl || !supabaseAnonKey) return;

  const payload = {
    user_id: userId,
    session_date: new Date().toISOString().split('T')[0],
    prompts_total: sessionData.total,
    prompts_t0: sessionData.t0,
    prompts_t1: sessionData.t1,
    prompts_t2: sessionData.t2,
    prompts_t3: sessionData.t3,
    savings_usd: sessionData.savings_usd,
    frugal_version: sessionData.version,
  };

  // Upsert: se já existe sessão para este dia, actualiza
  await fetch(`${supabaseUrl}/rest/v1/usage_sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });
}
```

O `user_id` e as credenciais do Supabase são guardadas localmente em:
`~/.claude/tools/router/.frugal-auth.json` (criado no momento do login via onboarding)

**IMPORTANTE:** .frugal-auth.json deve estar no .gitignore. Verifica.

### 5b. Actualiza install.sh para criar .frugal-auth.json vazio

Após instalação, cria o ficheiro:
```bash
echo '{"user_id":null,"supabase_url":"","supabase_anon_key":""}' \
  > "$CLAUDE_DIR/tools/router/.frugal-auth.json"
```

O onboarding web preenche este ficheiro quando o utilizador faz login.
Mecanismo: após onboarding, a página web mostra um comando para o utilizador correr:
```
node ~/.claude/tools/router/frugal-link.js --token=[JWT]
```
Que salva o user_id e credenciais localmente.

#### Commit: `feat(hub): dual-push D1 (anonymous) + Supabase (authenticated) + frugal-link.js`

---

## PRIORIDADE 6 — Proteger o Algoritmo (repo frugal-core no GitHub)

### Acções desta sessão

1. **Cria o .gitignore** no repo público que exclui explicitamente:
```gitignore
# Adiciona ao .gitignore existente:

# frugal-core — nunca no repo público
.frugal-core/
frugal-core/

# Auth local
tools/router/.frugal-auth.json

# Dataset e modelo
*.jsonl
training-*.json
model-weights/
*.onnx
```

2. **Cria `frugal-core` como submodule** (se o Paulo aprovar):
Após criar o repo frugal-core privado no GitHub:
```bash
cd ~/frugal
git submodule add git@github.com:pauloloureiroshp-ship-it/frugal-core.git .frugal-core
echo ".frugal-core" >> .gitignore
git commit -m "chore: add frugal-core as private submodule"
```

**NOTA:** Mostra este plano ao Paulo antes de executar.
O submodule permite que o Claude Code local aceda ao frugal-core
mas o repo público nunca expõe o conteúdo.

---

## PRIORIDADE 7 — Deploy e Documentação Final

### 7a. TypeScript check
```bash
cd landing && npx tsc --noEmit
```
Zero erros antes de continuar.

### 7b. Deploy
```bash
cd landing && vercel --prod
```

### 7c. SYNC.md — escreve o relatório desta sessão

Na secção `CLAUDE CODE → COWORK`, documenta:
- Lista de todos os commits desta sessão
- Estado de cada prioridade (P1-P6): feito / parcial / bloqueado
- O que precisa de aprovação do Paulo:
  - [ ] Criar repo GitHub `frugal-core` privado
  - [ ] Schema Supabase (tabelas profiles + usage_sessions)
  - [ ] GitHub OAuth App no GitHub (Client ID + Secret para Supabase)
  - [ ] Deploy aprovado
- Qualquer bloqueio encontrado

---

## RESUMO DE PRIORIDADES — ESTA SESSÃO

| P | Tarefa | Impacto | Requer Paulo? |
|---|--------|---------|---------------|
| **P1** | Repo frugal-core + dataset v1.0 | **Crítico** (activo protegido) | Sim (criar no GitHub) |
| **P2** | GitHub OAuth + perfil expandido | Alto (personalização) | Sim (OAuth app + schema) |
| **P3** | Onboarding wizard completo | Alto (conversão) | Não (código) |
| **P4** | Contador savings tempo real | Médio (social proof) | Não |
| **P5** | hub-push dual (D1 + Supabase) | Médio (dados) | Não (código) |
| **P6** | .gitignore + submodule protect | **Crítico** (segurança) | Sim (submodule) |
| **P7** | Deploy + SYNC.md | Crítico | Sim (deploy) |

---

## O QUE NÃO FAZER NESTA SESSÃO

- Não implementas integrações com 1Password, Obsidian, Docker Hub
- Não tocas no DemoSection, FlywheelSection, ComparisonSection (já estão bons)
- Não publicas o repo frugal sem aprovação do Paulo
- Não usas Opus para tarefas de edição/bash (seria anti-frugal)
- Não crias tabelas no Supabase sem aprovação do Paulo

---

## MENSAGEM FINAL AO PAULO (escreve em SYNC.md no final)

```
## Sessão v2.0 — o que precisa da tua aprovação

1. [ ] Posso criar o repo privado `frugal-core` no teu GitHub?
       (guarda o dataset + arquitectura privada)

2. [ ] Aprovado o schema das tabelas Supabase?
       (profiles expandido + usage_sessions)
       Ver detalhes completos na Prioridade 2c acima.

3. [ ] Crias tu o GitHub OAuth App em github.com/settings/applications?
       (preciso do Client ID e Client Secret para configurar no Supabase)
       Callback URL: https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback

4. [ ] Deploy da landing v2.0 aprovado?
       (contador de savings, onboarding melhorado, dashboard)

Quando confirmares os itens 1-3, posso completar o restante automaticamente.
O item 4 pode ir antes dos outros se quiseres ver as melhorias visuais já.
```

---

**O objectivo desta sessão: o frugal passa de "router que poupa dinheiro" para
"o sistema operativo que conhece o vibe coder melhor do que ninguém".
A base técnica para isso — perfil, GitHub, dashboard, dataset protegido —
fica pronta nesta sessão. O Paulo trata das aprovações, o Claude Code trata do resto. 🐕**
