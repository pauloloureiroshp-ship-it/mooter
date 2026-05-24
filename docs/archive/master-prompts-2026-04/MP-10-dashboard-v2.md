# MP-10 — Dashboard v2: UX/UI Profissional + Admin + Auto-sync

> Spec completa para o próximo sprint. Lê este ficheiro antes de começar qualquer implementação.

---

## Contexto e motivação

O dashboard actual (MP-7/8/9) funciona mas tem problemas críticos de UX/UI:
- Dados incorrectos (campos legacy `ollama_enabled` vs `has_ollama`)
- Sem logos oficiais dos LLMs
- Sem formulário para inserir API keys / credenciais
- Sem calculadora de savings (tokens, dinheiro, tempo)
- Aspecto pouco profissional
- Sem página de admin para o Paulo ver todos os utilizadores

O objectivo deste sprint é transformar o dashboard num produto que qualquer amigo abre e diz "uau".

---

## PEÇA 1 — Fix imediato: campos legacy

**Ficheiro**: `landing/app/dashboard/page.tsx`

Em `SetupHealthCard`, `calcRecommendedMode`, `getRecommendations` — qualquer lugar que leia `frugal_config`, aceitar ambos os campos:

```typescript
const hasOllama = cfg.has_ollama === true || cfg.ollama_enabled === true
const hasAnthropicKey = cfg.has_anthropic_key === true || cfg.anthropic_key_set === true
const decisionsCount = Number(cfg.decisions_count || cfg.decision_count || 0)
const savingsUsd = Number(cfg.savings_usd || cfg.total_savings || 0)
const installCompleted = profile.install_completed === true || decisionsCount > 0
```

---

## PEÇA 2 — Dashboard v2: redesign completo

### 2.1 — Header com identidade

```
┌─────────────────────────────────────────┐
│  F. frugal          paulo@gmail.com  [↗] │
│  v0.9.8 · Windows · RTX 4090 · 607 decisions │
└─────────────────────────────────────────┘
```

### 2.2 — Savings Hero Card (topo, destaque máximo)

```
┌─────────────────────────────────────────┐
│  💰 Your savings                        │
│                                         │
│   $71.55        607        70%          │
│   SAVED         PROMPTS    AVG SAVINGS  │
│                                         │
│  [████████████████░░░░] 70% efficiency  │
│                                         │
│  vs all-Opus: would have spent ~$238    │
│  Time saved: ~4.2h of waiting           │
└─────────────────────────────────────────┘
```

Dados: `decisions_count`, `savings_usd`, savings %, comparação com all-Opus (decisions × $0.015 médio).

### 2.3 — AI Stack Card (logos oficiais)

Mostrar cada LLM com logo SVG oficial, status, e tier:

```
┌─────────────────────────────────────────┐
│  🤖 Your AI stack                       │
│                                         │
│  [Anthropic logo] Claude Max    T2/T3 ✓ │
│  [Anthropic logo] Claude API    T1    ✓ │
│  [OpenAI logo]    GPT Plus      —     ✓ │
│  [OpenAI logo]    GPT API       T2    ✗ key missing │
│  [Gemini logo]    Gemini        —     ✓ │
│  [Ollama logo]    Ollama        T0    ✗ [Install] │
│                                         │
│  [+ Add API key]                        │
└─────────────────────────────────────────┘
```

SVGs a usar (inline, sem dependências externas):
- Anthropic: `<svg>` com o logo A simplificado (cor #D97757)
- OpenAI: círculo com espiral (cor #10A37F)  
- Google/Gemini: G colorido (cor #4285F4)
- Ollama: chama (cor #FF6B35)

### 2.4 — API Keys / Credentials Form

Modal ou inline expandível por LLM:

```
┌─────────────────────────────────────────┐
│  🔑 Add API key — Anthropic             │
│                                         │
│  ANTHROPIC_API_KEY                      │
│  [sk-ant-...              ] [Save]      │
│                                         │
│  ⚠ Stored encrypted in your profile.   │
│  Never shared with anyone.              │
└─────────────────────────────────────────┘
```

**Atenção**: guardar apenas o hash/boolean no Supabase, nunca a key em plaintext.
A key fica em `~/.frugal/.env` local via POST para `/api/save-key` que:
1. Valida o formato da key
2. Guarda `has_X_key: true` no Supabase
3. Devolve instrução para o utilizador guardar localmente

### 2.5 — Setup Health (redesign)

Substituir os ✗/✓ simples por um stepper visual:

```
┌─────────────────────────────────────────┐
│  Setup progress  ●●●○○  3/5             │
│                                         │
│  ✓ Logged in          paulo@gmail.com   │
│  ✓ Hardware detected  RTX 4090          │
│  ✓ Ollama installed   qwen3:30b ready   │
│  ○ API key missing    [Add key →]       │
│  ○ First sync         [Run doctor →]    │
└─────────────────────────────────────────┘
```

### 2.6 — Savings Calculator

Widget interactivo:

```
┌─────────────────────────────────────────┐
│  🧮 Savings calculator                  │
│                                         │
│  Prompts/day: [────●──────] 50          │
│  Avg tokens:  [──●────────] 2000        │
│  Model mix:   Auto (recommended)        │
│                                         │
│  Without frugal:  ~$18.75/day           │
│  With frugal:     ~$2.25/day            │
│  Monthly saving:  ~$495/month 🎉        │
└─────────────────────────────────────────┘
```

Fórmula: `without = prompts × tokens × $0.000015` (Opus pricing), `with = without × (1 - savings_pct)`

### 2.7 — Recommended Mode (melhorado)

Manter o card actual mas adicionar:
- Botão [Apply] que copia o comando E abre instrução clara
- Comparação visual dos 3 modos (beast/auto/zen) numa tabela simples

---

## PEÇA 3 — Admin Page (`/admin`)

**Ficheiro**: `landing/app/admin/page.tsx`

Proteção: só acessível se `profile.email === 'paulo.loureiro.shp@gmail.com'` (hardcoded por agora).

Layout:

```
┌─────────────────────────────────────────┐
│  Admin — frugal platform                │
│                                         │
│  Total users: 1    Active (7d): 1       │
│  Total decisions: 607   Avg savings: 70%│
│                                         │
│  Hardware distribution:                 │
│  RTX 4090: 1 (100%)                     │
│                                         │
│  Subscriptions:                         │
│  Claude Max: 1, GPT Plus: 1             │
│                                         │
│  Users table:                           │
│  Email | Hardware | Version | Decisions | Last sync │
│  paulo@... | RTX 4090 | 0.9.8 | 607 | hoje │
└─────────────────────────────────────────┘
```

Endpoint necessário: `GET /api/admin/stats` — só responde se o token pertence ao Paulo.

---

## PEÇA 4 — Auto-sync silencioso

**Ficheiro**: `tools/router/gsd-turn-end.js` (hook PostToolUse já existente)

Adicionar no fim do hook, a cada 25 chamadas:

```javascript
const SYNC_INTERVAL = 25
if (callCount % SYNC_INTERVAL === 0 && fs.existsSync(authTokenPath)) {
  // spawn frugal-doctor --sync em background, silencioso
  spawn('node', [doctorPath, '--sync', '--silent'], { detached: true, stdio: 'ignore' })
}
```

---

## PEÇA 5 — install.sh: guardar token automaticamente

**Ficheiro**: `install.sh` e `install-windows.ps1`

Após o login OAuth na landing, o `/auth/token` já devolve `{ ok: true, token: access_token }`.

No `install.sh`, após o passo de login:

```bash
echo ""
echo "Opening browser for login..."
echo "After login, paste the token shown in the browser here:"
read -r TOKEN
mkdir -p ~/.frugal
echo -n "$TOKEN" > ~/.frugal/auth.token
echo "✓ Token saved"
```

Versão Windows (`install-windows.ps1`):

```powershell
Write-Host "Opening browser for login..."
Start-Process "https://landing-five-azure-16.vercel.app?cli=1"
$token = Read-Host "After login, paste the token shown in the browser"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.frugal" | Out-Null
$token | Out-File -FilePath "$env:USERPROFILE\.frugal\auth.token" -Encoding utf8 -NoNewline
Write-Host "✓ Token saved"
```

A landing já devolve o token no response do `/auth/token` — basta mostrar ao utilizador para copiar.

---

## PEÇA 6 — Token display na landing após OAuth

**Ficheiro**: `landing/app/onboarding/page.tsx`

Após login bem sucedido, mostrar uma vez:

```
┌─────────────────────────────────────────┐
│  ✓ Logged in                            │
│                                         │
│  If you installed via CLI, paste        │
│  this token when prompted:              │
│                                         │
│  [eyJhbGci...truncado...    ] [Copy]    │
│                                         │
│  This token connects your CLI to        │
│  your dashboard.                        │
└─────────────────────────────────────────┘
```

---

## Ordem de execução

1. **PEÇA 1** — Fix campos legacy (5 min, unblocks tudo)
2. **PEÇA 2** — Dashboard v2 redesign (maior, fazer por sub-peças)
   - 2.1 Header
   - 2.2 Savings Hero
   - 2.3 AI Stack com logos
   - 2.4 API Keys form
   - 2.5 Setup stepper
   - 2.6 Calculator
3. **PEÇA 3** — Admin page
4. **PEÇA 4** — Auto-sync hook
5. **PEÇA 5+6** — install.sh token + onboarding display

---

## Commit por peça

```
fix(dashboard): aceita campos legacy has_ollama/ollama_enabled (PEÇA 1)
feat(dashboard): savings hero, AI stack logos, setup stepper (PEÇA 2a)
feat(dashboard): API keys form + savings calculator (PEÇA 2b)
feat(admin): página admin com métricas agregadas (PEÇA 3)
feat(cli): auto-sync silencioso a cada 25 sessões (PEÇA 4)
feat(install): token display no onboarding + save no install.sh (PEÇA 5+6)
```

---

## Notas de design

- Paleta: manter dark theme actual (#0a0a0a background, #4ec9b0 accent)
- Logos LLM: SVG inline, sem dependências externas, max 24×24px
- Fontes: manter as actuais do dashboard
- Mobile: não é prioridade agora, mas não quebrar
- Animações: mínimas — só o progress bar e o copy ✓

---

## Referências

- Supabase project: eymtobwinevywmmlmxqa
- Landing: landing-five-azure-16.vercel.app
- Admin email: paulo.loureiro.shp@gmail.com
- user_id Paulo: 9d3d3557-ce6d-41a6-92af-41199d204d8e
