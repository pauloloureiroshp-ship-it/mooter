# FRUGAL — ROADMAP MASTER v2.1
> **Documento executável por Claude Code.** Lê do início ao fim antes de agir.  
> Cada tier tem um safety gate obrigatório. Não avances sem passar o gate.  
> Data de criação: 2026-04-13 (v2.0) · Actualizado: 2026-04-13 (v2.1 — Budget Engine + North Star)  
> Estado base: v0.9.8 · 663 decisions · Hub live · Dashboard live

---

## ⭐ NORTH STAR — a visão honesta que muda tudo

> *"A maioria dos meus amigos que estão a aprender vibe coding não sabe o que tem: não conhece o hardware, não inventaria as subscrições que já paga, e não sabe quanto está disposto a gastar por mês. A minha ideia sempre foi descobrir o balanceamento perfeito entre modelos, skills, hardware e subscriptions — e por último quanto estou disposto a gastar. Dessa forma eu consigo setar o meu orçamento e mapear tudo, e o frugal encontra a melhor forma de fazer tudo isso de forma mais rápida e precisa, retroalimentando o frugal para ser melhor ainda."*  
> — Paulo, 2026-04-13

Este parágrafo é a bússola de todo o produto. Tudo o que se constrói deve poder ser avaliado com a pergunta: **"isto ajuda um vibe coder a descobrir e manter o seu equilíbrio perfeito?"**

---

### O que o utilizador típico NÃO sabe (e o Frugal precisa de descobrir por ele)

```
DIMENSÃO 1 — Hardware
  "Tenho uma GPU? Quantos GB de VRAM? Consigo correr modelos locais?"
  → O utilizador médio não sabe. Muitos acham que GPU = jogos, não IA.
  → Frugal: detecta automaticamente. Apresenta em linguagem simples.
  → "Tens uma RTX 4090 com 24GB — consegues correr modelos de 30B gratuitamente."

DIMENSÃO 2 — Subscrições existentes
  "Já pago pelo Claude Pro? GitHub Copilot? Isso conta?"
  → A maioria paga por múltiplas ferramentas sem as usar no seu potencial.
  → Frugal: inventaria o que já existe e usa-o inteligentemente.
  → "Já pagas €22/mês de Copilot — vamos usar isso para code completions."

DIMENSÃO 3 — Orçamento disponível
  "Quanto estou disposto a gastar em tokens por mês, além do que já pago?"
  → Ninguém responde a esta pergunta espontaneamente. É preciso perguntar.
  → Frugal: pergunta directamente. Sem orçamento definido = sem controlo real.
  → "Define o teu tecto: €10 / €25 / €50 / €100 / sem limite"

DIMENSÃO 4 — O que já tem instalado
  "Tenho o Claude Code? O Ollama? Já configurei uma API key?"
  → O vibe coder intermediário tem metade das ferramentas, mal configuradas.
  → Frugal: diagnostica automaticamente (frugal-doctor já faz isto).
```

### O "equilíbrio perfeito" — como o Frugal calcula

Dado o que sabe sobre o utilizador, o Frugal calcula a configuração óptima:

```
INPUT:
  budget_monthly = $30
  subscriptions = { anthropic: "api-paid", copilot: true, claude_pro: false }
  hardware = { gpu: "RTX 4090", vram_gb: 24, can_run_30b: true }

CÁLCULO:
  effective_T0 = Ollama qwen3:30b       → $0/mês  (GPU disponível)
  effective_T1 = Haiku API             → ~$2/mês  (estimativa)
  effective_T2 = Sonnet API            → ~$8/mês  (estimativa)
  effective_T3 = Opus API              → reservar para gates únicamente

  projected_monthly = $10.50  (dentro do orçamento de $30)
  buffer_remaining  = $19.50  → pode usar T2 mais generosamente

OUTPUT (routing config óptima para este utilizador):
  T0 → qwen3:30b local (83% dos prompts, $0)
  T1 → Haiku (6%, ~$2)
  T2 → Sonnet (9%, ~$8) [mais permissivo porque há buffer]
  T3 → Opus só em T3-gates (2%, ~$0.50)
  
  → Nota: "Estás a $10.50 do teu orçamento de $30 — tens $19.50 de margem."
```

### Como o circuito retroalimenta o Frugal

```
Utilizador usa frugal por 2 semanas
         ↓
decisions.log: 200 decisões com tier, latência, quality rating
         ↓
backtest.js nocturno: "T2 tem 85% de good ratings neste utilizador"
         ↓
update-router.js: ajusta thresholds → Sonnet mais acessível para este perfil
         ↓
hub-push: envia delta anonimizado para o hub
         ↓
hub agrega: "utilizadores com RTX 4090 + $30 budget → config óptima X"
         ↓
hub-pull: outros utilizadores com perfil similar recebem a config validada
         ↓
Frugal está melhor para todos — sem ninguém ter feito nada manualmente
```

### Por que razão EU usaria o Frugal (avaliação honesta)

Se eu fosse um vibe coder iniciante ou intermédio em Abril 2026, **usaria o Frugal** se:
- O onboarding me fizesse 3 perguntas e gerasse automaticamente a minha config
- Na primeira sessão visse visualmente "$0.04 poupado nesta mensagem"
- Não precisasse de saber o que é Ollama — ele instalava-se e configurava-se

**Não usaria** se:
- Precisasse de correr comandos bash antes de ver qualquer valor
- A primeira pergunta fosse técnica ("tens uma Anthropic API key?")
- O dashboard estivesse vazio nas primeiras 2 sessões

**O delta entre "usaria" e "não usaria" é exactamente o que o Tier 0 e Tier 1 resolvem.**  
O Tier 0 fecha os bugs. O Tier 1 fecha a coerência de dados. O Tier 2 (Budget Engine) fecha o gap da experiência.

---

## PROTOCOLO DE EXECUÇÃO — lê isto primeiro

```
ANTES de cada tarefa:
  1. Lê o ficheiro relevante (nunca assumas estado)
  2. Confirma que o prerequisite do tier anterior passou
  3. Corre o SAFETY GATE do tier anterior se ainda não correu

DURANTE cada tarefa:
  4. Faz o mínimo necessário — sem improvements extra
  5. Valida localmente antes de commitar
  6. Um commit por grupo lógico, não um commit gigante

DEPOIS de cada tarefa:
  7. Corre o validation snippet indicado
  8. Se falhar: corrige antes de avançar (não marques como done)
  9. Actualiza decisions.log / hub / sync conforme indicado
```

**Regra de ouro:** Se um passo falhar a validação, PARA. Não passes ao seguinte.  
**Regra anti-bazuca:** Não spawnas um architect para mudar 3 linhas. Lê o ficheiro, edita, valida.

---

## INVENTÁRIO DE SOLUÇÕES PÚBLICAS — usa antes de construir

> "Se já existe, usa. Código zero é o melhor código."

| Área | Ferramenta pública | URL | Estado no frugal |
|---|---|---|---|
| Gestão de modelos Ollama | `ollama list`, `ollama pull`, `ollama show --modelfile` | ollama.ai | ✅ já usa ollama CLI — expandir |
| Model benchmarks | Open LLM Leaderboard (HuggingFace) API | huggingface.co/spaces/HuggingFaceH4/open_llm_leaderboard | ❌ não integrado |
| Routing/proxy alternativo | LiteLLM (referência de padrões, não usar como proxy) | github.com/BerriAI/litellm | ❌ consultar só para inspiração |
| Validação de schema | Zod | zod.dev | 🟡 usar no hub-submit-events |
| Desktop app framework | Tauri v2 (Rust + WebView, 15MB vs Electron 200MB) | tauri.app | ❌ para fase desktop app |
| E2E testing landing | Playwright | playwright.dev | ❌ adicionar para CI |
| VSCode extension testing | @vscode/test-electron | github.com/microsoft/vscode-test | ❌ para extension CI |
| GPU info (Windows) | `nvidia-smi --query-gpu=name,memory.total --format=csv` | já no gpu-probe.js | ✅ |
| GPU info (Mac) | `system_profiler SPDisplaysDataType` | já no gpu-probe.js | ✅ |
| Latência de inferência | `ollama run --verbose` (reporta tokens/s) | ollama.ai | ❌ integrar no model-manager |
| Rate limiting (hub) | `hono/middleware/rate-limit` ou Cloudflare Rate Limiting | hono.dev | 🟡 já tem rate limiting básico |
| Telemetria local privada | PostHog (self-hosted) ou Plausible | posthog.com | ❌ opção futura para analytics |
| CI/CD | GitHub Actions (já existe .github/workflows/) | ✅ expandir |
| Task scheduling Mac | launchd + plist | já no install.sh v2 | ✅ |
| Task scheduling Windows | Windows Task Scheduler via PowerShell | já no install-windows.ps1 | ⚠️ bugs com paths com espaços |

---

## TIER 0 — ESTABILIDADE (fazer primeiro, esta semana)
> **Objectivo:** Nada quebrado, ninguém bloqueado, dados a fluir para o hub.  
> **Duração estimada:** 2-3 sessões Claude Code  
> **Por que é T0:** Sem isto, a Friends Beta falha silenciosamente e não tens dados para melhorar o algoritmo.

---

### T0-A · Classifier debug misroutes (MP-19 Grupo 1)

**Problema:** `"debug this stack trace"` → T0 (errado). Deve ser T2.  
**Ficheiros:** `tools/router/classify.js`, `tools/router/gold-labels.json`

**Tarefa:**

```
1. Ler classify.js — secção de regras de categoria (procura por DEBUG ou similar)
2. Adicionar DEBUG_RE pattern ANTES do threshold check:

const DEBUG_RE = /\b(debug|stack\s+trace|traceback|root\s+cause|memory\s+leak|crash(es|ing)?|runtime\s+error|why\s+(is|does|did|are)\s+(this|it|the)\s+(fail|error|crash|break)|what.{0,20}caus(e|ing)|fix\s+this\s+(error|bug|crash))\b/i;

if (DEBUG_RE.test(normalizedPrompt)) {
  const isDeepDebug = /memory.leak|production|prod\b|data.loss|security/i.test(normalizedPrompt);
  tier = isDeepDebug ? 'T3' : 'T2';
  category = 'debug';
  confidence = 0.85;
  reasoning = 'debug_re_match';
}

3. Adicionar ao gold-labels.json entradas gl-063 a gl-072 (ver MP-19 Grupo 1, secção 1b)
4. Não tocar no TUNED-BLOCK
```

**Validação T0-A:**
```bash
node tools/router/classify.js "debug this stack trace" --debug
# Esperado: tier: T2

node tools/router/classify.js "trace the root cause of this memory leak" --debug
# Esperado: tier: T3

node tools/router/replay.js --gold-labels
# Esperado: accuracy ≥ 96%

node --test tools/router/classify.test.js
# Esperado: todos os testes passam
```

**Alimenta o algoritmo:** gold-labels.json expandido é usado pelo backtest nocturno para afinar TUNED_COMPLEXITY_THRESHOLD automaticamente.

---

### T0-B · Hub connectivity timeout fix (MP-19 Grupo 2)

**Problema:** frugal-doctor reporta hub "unreachable" por cold start do Worker (3s timeout muito agressivo).  
**Ficheiro:** `tools/router/frugal-doctor.js`

**Tarefa:**

```
Substituir na secção 6 (hub check):
  timeout 3000ms → 6000ms
  Adicionar 1 retry com 1s de espera entre tentativas
  Melhorar mensagem de erro: mostrar "unreachable after 2 attempts (timeout 6s)"
  Adicionar sugestão: "Test manually: curl https://mooter-hub.frugal-hub.workers.dev/health"
```

**Validação T0-B:**
```bash
node tools/router/frugal-doctor.js
# Esperado: frugal-hub connectivity ✅ reachable
```

---

### T0-C · frugal-hello skill (MP-19 Grupo 3)

**Problema:** doctor reporta `/frugal-hello missing`.  
**Ficheiro a criar:** `~/.claude/commands/frugal-hello.md`

**Tarefa:**

```
1. Verificar se existe: ls ~/.claude/commands/frugal-hello.md
2. Se não existir, criar com conteúdo:

# frugal-hello
Bem-vindo ao frugal! Confirma que o router está instalado e activo.

```bash
node ~/.claude/tools/router/frugal-doctor.js
```

3. Adicionar criação deste ficheiro ao install.sh e install-windows.ps1 (se não existir)
```

**Validação T0-C:**
```bash
node tools/router/frugal-doctor.js
# Esperado: /frugal-hello ✅ present
```

---

### T0-D · gpu-probe.js e ollama_call_node.js para o repositório (MP-23 pendente)

**Problema:** Os fixes da sessão #23 (qwen3 think mode + option_a_model) estão em `~/.claude/` mas não no repo. Novos utilizadores na instalação não recebem o fix.

**Ficheiros:** `tools/router/gpu-probe.js`, `tools/router/ollama_call_node.js`

**Tarefa:**

```
1. Ler ~/.claude/tools/router/gpu-probe.js → confirmar que tem option_a_model: 'qwen2.5:3b'
2. Ler ~/.claude/tools/router/ollama_call_node.js → confirmar que tem think: false
3. Copiar ambos para tools/router/ no repo (sobreescrevendo se existirem versões antigas)
4. Verificar que install.sh e install-windows.ps1 copiam estes ficheiros durante setup
5. Adicionar smoke test: verificar que option_a_model está definido após install
```

**Validação T0-D:**
```bash
node -e "const h = require('./tools/router/gpu-probe.js'); console.log(typeof h.buildHwCapability)"
# Esperado: function

grep "option_a_model" tools/router/gpu-probe.js
# Esperado: 'qwen2.5:3b' presente

grep "think.*false" tools/router/ollama_call_node.js
# Esperado: think: false presente
```

---

### T0-E · Friends Beta — completar auth + onboarding budget-first + admin + hub connect

**Contexto:** Os MP-1 a MP-6 do FRIENDS_BETA_ROADMAP.md foram especificados mas não todos executados. Verificar estado actual antes de agir.

**Tarefa 1 — Verificar o que já está feito:**
```bash
cd landing && npx tsc --noEmit 2>&1 | head -30
grep -n "signInWithGitHub\|exchangeCodeForSession\|getUser\|upsertProfile\|getProfile" landing/app/lib/supabase.ts
grep -rn "Sign in\|loginWithGitHub" landing/app/page.tsx | head -5
ls landing/app/admin/ 2>/dev/null
grep -n "install_completed" landing/app/api/ -r | head -5
```

**Tarefa 2 — Para cada item em falta, aplicar o MP correspondente:**

| Item | Ficheiro | MP de referência | Verificação |
|---|---|---|---|
| supabase.ts 5 funções | landing/app/lib/supabase.ts | FRIENDS_BETA_ROADMAP.md MP-1 | grep signInWithGitHub |
| Botão login na landing | landing/app/page.tsx | MP-2 | grep "Sign in" page.tsx |
| Onboarding budget-first (ver abaixo) | landing/app/onboarding/page.tsx | MP-3 + extensão abaixo | npx tsc |
| /admin page | landing/app/admin/page.tsx | MP-4 | ls admin/ |
| Security fix API | landing/app/api/me/route.ts | MP-5 | grep "accessToken" api/me |
| Hub connect inject | tools/router/inject_context.js | MP-6 | grep "hub-submit" inject_context.js |

**⭐ EXTENSÃO ao MP-3 — Onboarding deve ser budget-first:**

O onboarding actual pergunta hardware e subscriptions mas NÃO pergunta orçamento. Isto é o gap mais crítico do produto. Adicionar ao Step 1 do onboarding:

```tsx
// NOVA pergunta no Step 1 (antes de hardware):
// "Quanto estás disposto a gastar por mês em tokens AI,
//  além das subscriptions que já pagas?"

const BUDGET_OPTIONS = [
  { id: 'free',     label: 'Só gratuito por agora',   monthly_usd: 0   },
  { id: 'light',    label: '~$10/mês',                monthly_usd: 10  },
  { id: 'moderate', label: '~$30/mês',                monthly_usd: 30  },
  { id: 'serious',  label: '~$100/mês',               monthly_usd: 100 },
  { id: 'unlimited',label: 'Sem limite definido',     monthly_usd: 999 },
];

// Este valor vai para subscription-profile.json como:
// { "monthly_budget_usd": 30, "budget_tier": "moderate" }

// E para o Supabase profiles como:
// { "frugal_config": { "monthly_budget_usd": 30, ... } }
```

**Lógica de budget em setup-profile.js (já existe localmente):**

```js
// Adicionar ao final do setup-profile.js:
const MONTHLY_BUDGET = await ask(rl,
  '\nHow much are you willing to spend per month on AI tokens\n' +
  '(beyond subscriptions you already pay)?\n' +
  '[0] Free only  [10] ~$10  [30] ~$30  [100] ~$100  [999] No limit\n' +
  'Enter amount (or press Enter for $30): '
);
const budget = parseInt(MONTHLY_BUDGET) || 30;

profile.monthly_budget_usd = budget;
profile.budget_tier = budget === 0 ? 'free' :
                      budget <= 10  ? 'light' :
                      budget <= 50  ? 'moderate' :
                      budget <= 150 ? 'serious' : 'unlimited';

console.log(`  → Budget set: $${budget}/month (${profile.budget_tier})`);
console.log(`  → T3 (Opus) cap: ${budget === 0 ? 'disabled' : `$${(budget * 0.3).toFixed(2)}/month`}`);
```

**Como budget_tier afecta o routing em applyBudgetCap():**

```
budget_tier: "free"      → cap T1 (só Ollama + Haiku se tiver key)
budget_tier: "light"     → cap T2, permitir T3 só em gates
budget_tier: "moderate"  → cap T2 quando a 70%+ do orçamento, T3 em gates
budget_tier: "serious"   → routing normal, alertar quando a 80% do orçamento
budget_tier: "unlimited" → routing normal, sem cap
```

**Para cada item em falta:** ler o MP correspondente no FRIENDS_BETA_ROADMAP.md e executar.

**Validação T0-E:**
```bash
cd landing && npx tsc --noEmit
# Esperado: 0 erros TypeScript

cd landing && npx next build 2>&1 | tail -20
# Esperado: build passes

grep "signInWithGitHub" landing/app/lib/supabase.ts
grep -c "admin" landing/app/admin/page.tsx
node tools/router/hub-submit-events.js --dry-run
```

**⚠️ ACÇÕES QUE PRECISAM DE BROWSER (Paulo faz manualmente):**
```
B1: Criar GitHub OAuth App em https://github.com/settings/applications/new
    - Name: frugal
    - Homepage: https://landing-five-azure-16.vercel.app  
    - Callback: https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback

B2: Activar GitHub provider em Supabase:
    https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/auth/providers

B3: Deploy: git push → Vercel auto-deploys
```

---

### 🔒 SAFETY GATE T0

Antes de avançar para T1, confirmar TODOS:

```bash
# Gate 1: Classifier correcto
node tools/router/classify.js "debug this stack trace" --debug | grep -i "T2"
echo "Gate 1: $([ $? -eq 0 ] && echo PASS || echo FAIL)"

# Gate 2: Gold labels accuracy ≥ 96%
node tools/router/replay.js --gold-labels 2>&1 | grep -i "accuracy"
# Verificar manualmente que é ≥ 96%

# Gate 3: Hub acessível
node tools/router/frugal-doctor.js 2>&1 | grep -i "hub" | grep -i "reachable"
echo "Gate 3: $([ $? -eq 0 ] && echo PASS || echo FAIL)"

# Gate 4: Testes unitários
node --test tools/router/classify.test.js 2>&1 | tail -5
# Esperado: 0 failures

# Gate 5: Landing build
cd landing && npx tsc --noEmit && echo "Gate 5: PASS" || echo "Gate 5: FAIL"
```

**Commit após T0:**
```
fix(core): debug misroutes + hub timeout + frugal-hello + gpu-probe repo + friends-beta auth (T0)
```

---

## TIER 1 — COERÊNCIA E DADOS (semana 2)
> **Objectivo:** 5 superfícies de métricas em sincronismo, flywheel comunitário a girar, modelo de perfil multi-dimensional.  
> **Prerequisite:** Safety Gate T0 passou.  
> **Por que é T1:** Sem dados coerentes, o algoritmo não aprende. Sem o flywheel, o hub fica vazio.

---

### T1-A · Metrics Coherence (MP-18 — 5 superfícies sincronizadas)

**Problema:** Terminal mostra X%, dashboard mostra Y%, landing mostra Z% — todos diferentes.  
**Referência:** `docs/MP-18-metrics-coherence.md`

**Antes de implementar:** Ler MP-18 completo. É um pipeline de 6 peças com dependências específicas.

**Ordem de implementação (do mais simples ao mais complexo):**

```
Peça 1: auto-sync.js — pipeline silencioso PostToolUse
  → Escreve um JSON canónico metrics-latest.json a cada N turns
  → Alimentado por decisions.log (fonte de verdade única)

Peça 2: INSERT decisions_log Supabase em install-complete
  → Quando frugal-doctor --sync corre, envia decisões em batch para decisions_log table

Peça 3+4: hub-push automático com dados reais
  → hub-submit-events.js chamado pelo PostToolUse hook (batch de 10 em 10 decisions)
  → hub recebe e agrega em D1

Peça 5: landing counters → campos reais
  → GET /api/stats no hub devolve campos correctos
  → landing/app/page.tsx lê e mostra números reais

Peça 6: statusline session% + total%
  → frugal-turn-header.js: session% calculado desde session_start
  → Mostrar: "session: 23% · total: 71% · 419 decisions"
```

**Validação T1-A:**
```bash
# Sync manual
node tools/router/frugal-doctor.js --sync
# Esperado: Dashboard sync ✅ profile updated

# Verificar que hub recebeu dados
curl https://mooter-hub.frugal-hub.workers.dev/api/stats
# Esperado: JSON com decisions_count > 0, savings_usd > 0

# Verificar statusline
node tools/router/gsd-statusline.js
# Esperado: session% e total% diferentes (session é menor)
```

---

### T1-B · model-profile.json (MP-21 Peça 1)

**Problema:** O classifier usa só custo para decidir tiers. Latência, qualidade por categoria, e capacidades locais não são considerados.  
**Ficheiro a criar:** `tools/router/model-profile.json`  
**Referência:** `docs/MP-21-intelligence-platform-v2.md` Peça 1 — usa exactamente o JSON especificado.

**Novos modelos a incluir (não estão no MP-21 original):**

```json
"gemma-3-12b": {
  "tier": "T0",
  "provider": "ollama",
  "cost_input_per_mtok": 0,
  "cost_output_per_mtok": 0,
  "latency_p50_ms": 900,
  "latency_p95_ms": 2800,
  "context_window": 128000,
  "quality": {
    "trivial_edit": 8, "debug": 7, "architecture": 6,
    "summarize": 8, "transform": 8, "explain": 8,
    "test_gen": 7, "math": 7
  },
  "strengths": ["multimodal", "speed", "code-generation"],
  "weaknesses": ["complex-reasoning"],
  "ollama_id": "gemma3:12b",
  "notes": "Google Gemma 4 12B — excelente para T0/T1. Melhor que qwen2.5:3b em qualidade, similar em velocidade."
},

"deepseek-v3": {
  "tier": "T1",
  "provider": "ollama",
  "cost_input_per_mtok": 0,
  "cost_output_per_mtok": 0,
  "latency_p50_ms": 1200,
  "latency_p95_ms": 4000,
  "context_window": 128000,
  "quality": {
    "trivial_edit": 9, "debug": 9, "architecture": 8,
    "summarize": 8, "transform": 9, "explain": 9,
    "test_gen": 9, "math": 9
  },
  "strengths": ["coding", "reasoning", "math", "multilingual"],
  "weaknesses": ["latency-on-small-gpu"],
  "ollama_id": "deepseek-v3:7b",
  "notes": "DeepSeek V3 — performance rival GPT-4 para coding. Usar como T1 alternativo ao Haiku quando offline."
},

"qwen3-30b": {
  "tier": "T0",
  "provider": "ollama",
  "cost_input_per_mtok": 0,
  "cost_output_per_mtok": 0,
  "latency_p50_ms": 1800,
  "latency_p95_ms": 5000,
  "context_window": 32000,
  "quality": {
    "trivial_edit": 8, "debug": 8, "architecture": 7,
    "summarize": 9, "transform": 9, "explain": 9,
    "test_gen": 8, "math": 8
  },
  "strengths": ["multilingual", "instruction-following", "long-context"],
  "weaknesses": ["think-mode-latency", "vram-hungry"],
  "ollama_id": "qwen3:30b",
  "notes": "Usar com think:false obrigatório. Para delegation, não para Option A."
}
```

**Validação T1-B:**
```bash
node -e "
const mp = require('./tools/router/model-profile.json');
const models = Object.keys(mp.models);
console.log('Models defined:', models.length);
models.forEach(m => {
  const mo = mp.models[m];
  console.log(m, '→ tier:', mo.tier, '| quality keys:', Object.keys(mo.quality || {}).length);
});
"
# Esperado: ≥ 8 modelos, cada um com quality object
```

---

### T1-C · applyActiveMode() live (MP-19 Grupo 5a)

**Problema:** O mode system (beast/zen/auto) existe em `frugal-mode.js` mas a função `applyActiveMode()` pode não estar em `inject_context.js`.

**Tarefa:**
```bash
# Verificar primeiro:
grep -n "applyActiveMode\|frugal-mode\|\.frugal-mode\.json" ~/.claude/tools/router/inject_context.js

# Se não existir — ler MODES_MASTER_PROMPT.md e aplicar o patch exacto descrito.
# O patch deve ser aplicado APÓS applyBudgetCap() e ANTES da emissão do <router-hint>.
```

**Validação T1-C:**
```bash
node ~/.claude/tools/router/frugal-mode.js beast
node ~/.claude/tools/router/classify.js "muda cor do botão" --debug
# Esperado: tier T3 (forçado por Beast mode)

node ~/.claude/tools/router/frugal-mode.js auto
node ~/.claude/tools/router/classify.js "muda cor do botão" --debug  
# Esperado: tier T0 (routing normal)
```

---

### T1-D · gold-labels.json expansão com misroutes reais (MP-19 Grupo 4)

**Problema:** 62 gold labels são bons mas insuficientes para cobrir todos os edge cases.

**Tarefa:**
```bash
# Extrair misroutes reais de decisions.log
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
const log = fs.readFileSync(
  path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log'), 'utf8'
);
const entries = log.split('\n').filter(Boolean)
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(e => e && e.event === 'classified');

const shortT3 = entries.filter(e => e.tier === 'T3' && e.prompt && e.prompt.length < 40);
const debugT0 = entries.filter(e => e.tier === 'T0' && e.prompt && /debug|error|crash|stack/i.test(e.prompt));
const longT0 = entries.filter(e => e.tier === 'T0' && e.prompt && e.prompt.length > 200);

console.log('Short→T3 (over-escalation):', shortT3.slice(0,5).map(e=>e.prompt));
console.log('Debug→T0 (misroute):', debugT0.slice(0,5).map(e=>e.prompt));
console.log('Long→T0 (suspicious):', longT0.slice(0,3).map(e=>e.prompt?.slice(0,60)));
"

# Com base nos resultados, adicionar 15-25 entradas ao gold-labels.json
# IDs sequenciais a partir de gl-073 (após as 10 adicionadas no T0-A)
# Mínimo: 5 debug, 5 architecture, 5 trivial confirmados, 5 edge-cases
```

**Validação T1-D:**
```bash
node tools/router/replay.js --gold-labels 2>&1 | grep -i "accuracy\|total\|pass"
# Target: ≥ 97% após T0-A + T1-D combinados
```

---

### T1-E · Savings Transparency (MP-20 — superfícies visíveis)

**Problema:** O `~` (tilde) nos savings não é explicado. Utilizadores não sabem a diferença entre advisory_saved e guaranteed_saved.  
**Referência:** `docs/MP-20-savings-transparency.md`

**Implementar por ordem:**

```
1. frugal-turn-header.js: adicionar linha de contexto quando session% < 10%
   "Session 100% Opus porque este prompt foi classificado T3 (architectural decision)"

2. Terminal statusline: mostrar advisory vs guaranteed separados
   "⚡ ~$4.21 advisory · $0.83 guaranteed · 419 decisions"

3. Dashboard (se acessível): adicionar tooltip em cada savings widget explicando ~

4. landing/app/page.tsx: substituir contador fallback por dados reais do hub
   Usar GET https://mooter-hub.frugal-hub.workers.dev/api/stats
```

**Validação T1-E:**
```bash
node tools/router/frugal-turn-header.js
# Verificar que output inclui advisory e guaranteed como valores separados

# Verificar landing (se build passar):
cd landing && npx next build && echo "Build OK"
```

---

### T1-F · Budget Engine — o coração do equilíbrio perfeito

**Problema:** O Frugal poupa dinheiro, mas o utilizador não sabe quanto vai gastar este mês. Não há contrato entre "quero gastar $30" e "o router respeita isso".

**Criar:** `tools/router/budget-engine.js`

Este módulo é o cérebro que liga as 4 dimensões (hardware + subscriptions + orçamento + histórico) numa configuração óptima calculada automaticamente.

```js
/**
 * budget-engine.js
 * 
 * Dado: subscription-profile.json + hw-capability.json + decisions.log (últimos 30 dias)
 * Calcula: configuração óptima de routing para este utilizador específico
 * Output: budget-config.json — lido pelo inject_context.js para applyBudgetCap()
 */

function calculateOptimalConfig(profile, hwCapability, recentDecisions) {
  const budget = profile.monthly_budget_usd || 30;
  const subscriptions = profile.subscriptions || {};
  const gpu = hwCapability;

  // 1. Custo efectivo por tier (0 = free para este utilizador)
  const effectiveCost = {
    T0: gpu.can_run_local ? 0 : (subscriptions.anthropic === 'max' ? 0 : 0.80 / 1000),
    T1: subscriptions.anthropic === 'max' ? 0 : 0.80 / 1000,   // Haiku
    T2: subscriptions.anthropic === 'max' ? 0 : 3.0 / 1000,    // Sonnet
    T3: 15.0 / 1000,  // Opus — nunca gratuito mesmo com Max
  };

  // 2. Projecção mensal baseada na distribuição histórica
  const dist = analyzeDistribution(recentDecisions);
  const projected = (
    dist.T0 * effectiveCost.T0 * 100 +  // 100 prompts/mês estimado
    dist.T1 * effectiveCost.T1 * 100 +
    dist.T2 * effectiveCost.T2 * 100 +
    dist.T3 * effectiveCost.T3 * 100
  );

  // 3. Calcular headroom e ajustar caps
  const headroom = budget - projected;
  const headroomPct = headroom / budget;

  return {
    monthly_budget_usd: budget,
    projected_monthly_usd: projected.toFixed(2),
    headroom_usd: headroom.toFixed(2),
    headroom_pct: (headroomPct * 100).toFixed(0),
    
    // Routing caps ajustados ao orçamento
    tier_caps: {
      // Se há headroom > 40% → ser mais generoso com T2
      // Se projecção ultrapassa 80% do budget → forçar Zen mode automático
      auto_zen_threshold: budget * 0.80,
      t2_permissive: headroomPct > 0.40,
      t3_gates_only: budget < 20,
    },
    
    // Mensagem human-readable para o statusline
    statusline_hint: headroom > 0
      ? `budget: $${projected.toFixed(0)}/$${budget} used · $${headroom.toFixed(0)} remaining`
      : `⚠️ budget: over by $${Math.abs(headroom).toFixed(0)} — Zen mode auto-enabled`,
    
    // Recomendação de config
    recommendation: generateRecommendation(profile, hwCapability, headroomPct),
  };
}

function generateRecommendation(profile, hw, headroomPct) {
  if (!hw.can_run_local && !profile.subscriptions?.anthropic) {
    return 'Sem GPU e sem subscrição: instala Ollama (gratuito) para T0 e poupa 80%+';
  }
  if (hw.can_run_local && headroomPct > 0.70) {
    return 'Tens GPU e orçamento disponível: routing actual é óptimo para o teu perfil';
  }
  if (!hw.can_run_local && headroomPct < 0.20) {
    return 'Orçamento a esgotar: activa Zen mode ou considera GPU para T0 local gratuito';
  }
  return 'Routing equilibrado — continua assim';
}
```

**Output: `~/.frugal/budget-config.json`** — lido pelo inject_context.js na sessão seguinte

**Integração com o statusline:** O statusline deve mostrar progresso do orçamento mensal em vez de só % savings:

```
Antes: ⚡ frugal  session: 23% · total: 71% · 419 decisions
Depois: ⚡ frugal  T0 qwen · session: 23% · $8.20/$30 mês · 419 decisions
```

**Integração com o onboarding (landing/app/onboarding/page.tsx):**

Após o utilizador completar o Step 1 (hardware + subscriptions + budget), mostrar imediatamente:

```
✅ O teu equilíbrio perfeito calculado:

  T0 (grátis)  →  qwen3:30b local — 83% dos prompts
  T1 (~$2/mês) →  Haiku API — 6% dos prompts  
  T2 (~$8/mês) →  Sonnet API — 9% dos prompts
  T3 (reserva) →  Opus só para decisões críticas

  Projecção: ~$10/mês  (dentro do teu orçamento de $30)
  Margem: $20 disponível — serás mais generoso com T2 quando preciso
```

Isto é o "aha moment" do produto. O utilizador vê imediatamente o valor antes de instalar.

**Validação T1-F:**
```bash
node tools/router/budget-engine.js --dry-run
# Esperado: config calculada com projected_monthly_usd e recommendation

node tools/router/budget-engine.js --profile
# Esperado: mostra perfil actual + config óptima em linguagem simples

# Verificar integração com statusline
node tools/router/gsd-statusline.js
# Esperado: mostra "$X.XX/$Y budget" em vez de só percentagem
```

---

### 🔒 SAFETY GATE T1

```bash
# Gate 1: Métricas coerentes (hub tem dados)
curl -s https://mooter-hub.frugal-hub.workers.dev/api/stats | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
const ok = d.decisions_count > 0 && d.savings_usd > 0;
console.log('Gate 1 (hub data):', ok ? 'PASS' : 'FAIL', JSON.stringify(d));
"

# Gate 2: Budget Engine funcional
node tools/router/budget-engine.js --dry-run 2>&1 | grep -i "projected\|recommend" | head -3
echo "Gate 2: $([ $? -eq 0 ] && echo PASS || echo FAIL)"

# Gate 2b: model-profile.json válido
node -e "const m = require('./tools/router/model-profile.json'); console.log('Gate 2b:', Object.keys(m.models).length >= 8 ? 'PASS' : 'FAIL')"

# Gate 3: Mode system funcional
node ~/.claude/tools/router/frugal-mode.js beast && node ~/.claude/tools/router/classify.js "rename variable" --debug | grep -i "T3" && echo "Gate 3: PASS"
node ~/.claude/tools/router/frugal-mode.js auto

# Gate 4: Gold labels accuracy
node tools/router/replay.js --gold-labels 2>&1 | grep -E "[0-9]+\.?[0-9]*%" | head -3
# Verificar ≥ 97%

# Gate 5: Dashboard sync funcional
node tools/router/frugal-doctor.js --sync 2>&1 | grep -i "✓\|ok\|success" | head -5
```

**Commit após T1:**
```
feat(intelligence): metrics coherence + model-profile + mode system live + gold-labels v2 (T1)
```

---

## TIER 2 — INTELIGÊNCIA E EXPERIÊNCIA (semanas 3-4)
> **Objectivo:** O frugal aprende com cada sessão, sugere models actualizados, detecta contexto do projecto, e é usável por um iniciante no primeiro try.  
> **Prerequisite:** Safety Gate T1 passou.  
> **Por que é T2:** São as features que transformam "economizador de custos" em "plataforma de inteligência".

---

### T2-A · Model Manager — auto-detect e recomendação automática

**Problema:** O utilizador não sabe que existe um modelo melhor para o seu hardware. O catálogo do hub tem informação mas ninguém age sobre ela.

**Criar:** `tools/router/model-manager.js`

**Usa ferramentas públicas existentes:**
```bash
# Lista modelos instalados (já existe no ecossistema Ollama)
ollama list  # → output: NAME, ID, SIZE, MODIFIED

# Mostra detalhes de um modelo
ollama show qwen3:30b --modelfile  # → parameters, context size

# Velocidade de inferência  
ollama run --verbose <model> "test" 2>&1 | grep "eval rate"
# → "eval rate: 12.45 tokens/s"
```

**Lógica do model-manager.js:**
```js
// 1. Ler hw-capability.json → obter GPU VRAM disponível
// 2. Ler model-profile.json → filtrar modelos por VRAM requirement
// 3. ollama list → obter modelos instalados
// 4. GET https://mooter-hub.frugal-hub.workers.dev/api/models → catálogo actualizado
// 5. Comparar: hub tem modelos mais novos/melhores que não estão instalados?
// 6. Para os instalados: correr mini-benchmark (5 tokens de teste → medir tokens/s)
// 7. Output:
//    - Currently optimal: qwen3:30b (12.3 tok/s, quality score 8.2)
//    - Recommended upgrade: gemma3:12b (est. 18 tok/s, quality score 8.5)
//      → Run: ollama pull gemma3:12b  (4.2 GB)
//    - Available but not installed: deepseek-v3:7b, phi4:14b
```

**Slash command:** `/frugal-models` — mostra recomendações e pergunta se quer instalar

**Integração com inject_context.js:**
```js
// Ao iniciar sessão (uma vez por dia), verificar se há modelo recomendado
// Se houver, adicionar ao <router-hint>:
// <model-suggestion>Consider upgrading: gemma3:12b is 40% faster than current T0 model</model-suggestion>
```

**Validação T2-A:**
```bash
node tools/router/model-manager.js
# Esperado: lista modelos instalados, speeds, recomendação

node tools/router/model-manager.js --check-updates
# Esperado: comparação com catálogo do hub
```

---

### T2-B · Project Context Awareness

**Problema:** O router não sabe se está num projecto React, Python, Rust, ou Go. Isso afecta o tier adequado para certas tarefas.

**Criar:** `tools/router/project-context.js`

**Lógica:**
```js
// Detectar tipo de projecto a partir do working directory:
// - package.json com react/next/vue → frontend-react/vue
// - package.json com express/fastify → backend-node
// - pyproject.toml / requirements.txt → python
// - Cargo.toml → rust
// - go.mod → go
// - *.ipynb → data-science
// - Presença de .claude/CLAUDE.md com "Router Context" section → lê essa secção

// Output: { type: "frontend-react", stack: ["next", "tailwind", "typescript"], maturity: "intermediate" }
// "maturity" → inferido de: test coverage, CI files, PR templates

// Injectar no <router-hint> como contexto:
// <project-context>frontend-react · next+tailwind · intermediate</project-context>
```

**Ajuste de routing baseado em contexto:**
```
- Frontend React: trivial CSS/class changes → sempre T0 (nunca T2)
- Python data science: mesmo "fix this" pode ser T2 (numpy/pandas edge cases)
- Rust: "borrow checker" prompts → T3 mínimo
- Go: concurrency → T2 mínimo
```

**Validação T2-B:**
```bash
cd ~/frugal && node ~/.claude/tools/router/project-context.js
# Esperado: { type: "frontend-react", stack: [...], maturity: "..." }

cd ~/frugal/dashboard && node ~/.claude/tools/router/project-context.js  
# Esperado: mesmo tipo mas com dashboard-específico
```

---

### T2-C · Activity Classifier — skill suggestions proactivas

**Problema:** Utilizadores não sabem que skills existem. A descoberta é zero.

**Criar:** `tools/router/activity-classifier.js`

**Lógica:**
```js
// Analisa as últimas N decisões em decisions.log (rolling window de 10 turns)
// Detecta padrões repetitivos:

const ACTIVITY_PATTERNS = {
  'repetitive-transforms': {
    signal: (recent) => recent.filter(d => d.category === 'transform').length >= 3,
    suggestion: 'Para transformações repetitivas, /local-transformer automatiza este processo',
    skill: 'local-transformer'
  },
  'multiple-file-reads': {
    signal: (recent) => recent.filter(d => d.category === 'summarize').length >= 3,
    suggestion: 'Estás a ler muitos ficheiros — /local-summarizer pode processar vários em paralelo',
    skill: 'local-summarizer'
  },
  'debug-session': {
    signal: (recent) => recent.filter(d => d.category === 'debug').length >= 2,
    suggestion: 'Sessão de debug em curso — considera /frugal-beast para investigação completa',
    skill: 'frugal-beast'
  },
  'pre-commit': {
    signal: (recent) => recent.some(d => /commit|push|merge/i.test(d.prompt || '')),
    suggestion: 'Antes de commitar, /final-reviewer faz code review automático',
    skill: 'final-reviewer'  
  }
};

// Output: sugestão passiva no <router-hint> (não interruptiva):
// <skill-suggestion>💡 Para debug em série: /frugal-beast acelera a investigação</skill-suggestion>
// Só aparece na 3ª ocorrência do padrão (não na primeira)
```

**Validação T2-C:**
```bash
node tools/router/activity-classifier.js --simulate debug,debug,debug
# Esperado: skill-suggestion para frugal-beast

node tools/router/activity-classifier.js --simulate transform,transform,transform
# Esperado: skill-suggestion para local-transformer
```

---

### T2-D · VSCode Extension — publicar no marketplace

**Problema:** VSCode extension v0.4.0 está built mas não publicada. 30M+ utilizadores potenciais bloqueados.

**Estado:** `vscode-extension/` existe. Verificar estado actual antes de agir.

**Usa ferramentas públicas existentes:**
```bash
# vsce é o publisher oficial da Microsoft
npm install -g @vscode/vsce

# Publicar (requer Personal Access Token do Azure DevOps)
vsce publish --pat <TOKEN>

# Ou gerar .vsix para distribuição manual
vsce package
# → frugal-0.4.0.vsix
```

**Tarefa:**
```
1. Ler vscode-extension/package.json → verificar version, publisher, categories
2. Verificar vscode-extension/README.md → tem screenshots e instalação documentada?
3. npm run build na extension → confirmar que builda sem erros
4. Se o publisher "frugalai" não existe no marketplace, criar em marketplace.visualstudio.com/manage
5. Gerar PAT (Personal Access Token) com scope "Marketplace (publish)"
6. vsce package → gerar .vsix
7. vsce publish (se PAT disponível) OU guardar .vsix para Paulo publicar manualmente
```

**⚠️ Requer browser (Paulo):**
```
- Criar publisher em marketplace.visualstudio.com/manage (se não existe)
- Gerar PAT em dev.azure.com → User Settings → Personal Access Tokens
```

**Validação T2-D:**
```bash
cd vscode-extension && npm run build 2>&1 | tail -10
# Esperado: build sem erros

npx @vscode/vsce package 2>&1 | tail -5
# Esperado: .vsix gerado
```

---

### T2-E · OS Optimization (frugal-doctor --optimize)

**Problema:** Performance do Ollama varia muito com configuração do SO. O frugal-doctor sabe o hardware mas não optimiza o ambiente.

**Expandir:** `tools/router/frugal-doctor.js` com flag `--optimize`

**Usa comandos do SO já disponíveis:**

```bash
# Windows: verificar power plan
powercfg /getactivescheme
# Se não for High Performance:
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  # High Performance GUID

# Windows: Ollama como serviço (para não precisar de arrancar manualmente)
sc query OllamaService 2>nul || sc create OllamaService binPath="ollama serve" start=auto

# Windows: Defender exclusion para modelos Ollama (reduz latência de load 30-40%)
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\Ollama\models"

# NVIDIA: verificar versão CUDA
nvidia-smi
# Verificar que está na versão ≥ 12.x para performance óptima com Ollama

# Mac: verificar sleep settings
pmset -g | grep "sleep"
# Se sleep ≠ 0: sugerir "sudo pmset -a sleep 0" durante sessões longas
```

**Lógica `frugal-doctor --optimize`:**
```
1. Detectar OS (já existe)
2. Verificar power plan → sugerir/aplicar High Performance
3. Verificar Ollama GPU layers → recomendar OLLAMA_NUM_GPU=999 se VRAM > 8GB
4. Verificar CUDA version (Windows NVIDIA) → avisar se < 12.x
5. Sugerir exclusão do Defender para pasta de modelos
6. Mostrar checklist: ✅ optimizado / ⚠️ recomendado / ❌ não aplicado
```

**Validação T2-E:**
```bash
node tools/router/frugal-doctor.js --optimize --dry-run
# Esperado: lista de optimizações disponíveis, sem aplicar
```

---

### T2-F · Feedback loop de qualidade (outcome quality, não só routing efficiency)

**Problema:** O frugal mede "fui económico?" mas não "o modelo escolhido foi bom para a tarefa?".

**Expandir:** `tools/router/feedback-collector.js` com trigger automático

**Lógica:**
```js
// Após cada T2/T3 decision (não T0 — seria spam), depois de 1 resposta do modelo:
// Adicionar ao final do <router-hint> um footer passivo:
//
// ---
// ⚡ frugal routed → T2 Sonnet for debug. Rate this decision: /frugal-rate good|bad
//

// /frugal-rate good → grava followup_quality: 1 no decisions.log
// /frugal-rate bad  → grava followup_quality: 0 + pede contexto opcional

// backtest.js: usar followup_quality para ajustar TUNED thresholds
// Se T2 tem ≥ 80% bad ratings numa categoria → promover para T3
// Se T3 tem ≥ 80% good ratings numa categoria → pode ser T2
```

**Skill a criar:** `/frugal-rate`

**Validação T2-F:**
```bash
# Simular rating
node tools/router/feedback-collector.js --rate good --decision-id last
# Esperado: grava no decisions.log

node -e "
const log = require('fs').readFileSync(
  require('path').join(require('os').homedir(), '.claude/tools/router/decisions.log'), 'utf8'
);
const entries = log.split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(Boolean);
const rated = entries.filter(e => e.followup_quality !== undefined);
console.log('Rated decisions:', rated.length);
"
```

---

### 🔒 SAFETY GATE T2

```bash
# Gate 1: model-manager funcional
node tools/router/model-manager.js 2>&1 | grep -i "optimal\|recommend" | head -3
echo "Gate 1: $([ $? -eq 0 ] && echo PASS || echo FAIL)"

# Gate 2: project-context detecta tipo
cd ~/frugal && node ~/.claude/tools/router/project-context.js 2>&1 | grep -i "type\|stack"
echo "Gate 2: $([ $? -eq 0 ] && echo PASS || echo FAIL)"

# Gate 3: activity-classifier produz sugestões
node tools/router/activity-classifier.js --simulate debug,debug,debug 2>&1 | grep -i "suggest\|skill"
echo "Gate 3: $([ $? -eq 0 ] && echo PASS || echo FAIL)"

# Gate 4: frugal-doctor --optimize --dry-run
node tools/router/frugal-doctor.js --optimize --dry-run 2>&1 | grep -i "optimiz\|high.performance\|cuda" | head -5

# Gate 5: gold labels
node tools/router/replay.js --gold-labels 2>&1 | grep -E "[0-9]+\.?[0-9]*%"
# Verificar ≥ 97%
```

**Commit após T2:**
```
feat(intelligence): model-manager + project-context + activity-classifier + os-optimizer (T2)
```

---

## TIER 3 — PLATAFORMA E ESCALA (próximo mês)
> **Objectivo:** Frugal funciona fora do Claude Code, a comunidade contribui, e o algoritmo aprende com todos os utilizadores.  
> **Prerequisite:** Safety Gate T2 passou. ≥ 3 Friends Beta activos com dados reais.  
> **Por que é T3:** Estas features requerem utilizadores reais para validar. Não construir em vazio.

---

### T3-A · Desktop App MVP (Tauri v2)

**Por que Tauri e não Electron:** 15MB vs 200MB, Rust backend é mais performante, acesso nativo ao SO sem overhead.

**Usa framework público existente:**
```bash
# Instalar Tauri CLI
npm install -g @tauri-apps/cli

# Iniciar projecto wrapping o dashboard existente
npx tauri init --name frugal --window-title "frugal" --distDir ../dashboard/out
```

**MVP da app (apenas o essencial):**
```
1. Wrapper sobre o dashboard Next.js existente (exportado como static)
2. Tray icon com menu: "Dashboard", "Start Ollama", "Frugal Status"
3. LaunchAgent / startup service automático (já existe em install.sh)
4. Notificação nativa: "frugal: saved $X this session"
5. Auto-updater (Tauri updater plugin)
```

**O que NÃO fazer no MVP:** redesign, nova UI, nada que não seja wrapping do que já existe.

**Validação T3-A:**
```bash
cd frugal-desktop && npm run tauri build
# Esperado: .dmg (Mac) ou .msi (Windows) gerado

# Verificar que abre o dashboard em localhost:7820
```

---

### T3-B · MCP Server para o Frugal

**Contexto:** O Model Context Protocol (MCP) permite que outros tools leiam o frugal como fonte de dados.  
**Valor:** Cursor, Windsurf, qualquer MCP client pode usar o routing intelligence do frugal.

**Usa o MCP SDK existente:**
```bash
npm install @modelcontextprotocol/sdk
```

**Expor como MCP server:** `tools/frugal-mcp-server.js`

```js
// Recursos expostos via MCP:
// Resource: frugal://decisions/last  → última decisão de routing
// Resource: frugal://metrics/summary → savings summary
// Resource: frugal://models/recommended → modelo recomendado para o projecto actual
// Tool: classify_prompt({ prompt }) → retorna tier + reasoning
// Tool: get_savings_report() → relatório de poupança
```

**Validação T3-B:**
```bash
node tools/frugal-mcp-server.js --test
# Esperado: MCP server inicia em porta 8765, responde a requests básicos
```

---

### T3-C · Federated Learning v2 — aprender com todos os utilizadores

**Referência:** `docs/FEDERATED_LEARNING.md` (já escrita, não implementada)

**O que falta para o flywheel girar com múltiplos utilizadores:**

```
1. Cada utilizador com frugal instalado → envia deltas anonimizados para hub (já existe hub-push)
2. Hub agrega deltas com trust_score ponderado (já existe aggregate-deltas.js)
3. Hub gera router-tuning-latest.json diariamente (implementar no cron job)
4. Cada utilizador com frugal → pull do hub uma vez por dia (já existe hub-pull)
5. update-router.js aplica o TUNED-BLOCK automaticamente após o pull
6. Loop fechado: melhorias de um utilizador melhoram todos
```

**Peças em falta:**
```
- hub/src/worker.js: cron job "daily generate" → agregar eventos D1 → gerar router-tuning-latest.json → guardar em R2
- hub-pull.js: após pull, auto-trigger update-router.js --dry-run e mostrar preview
- inject_context.js: após sessão, verificar se há novo tuning disponível e sugerir update
```

**Validação T3-C:**
```bash
# Simular pipeline
node tools/router/hub-push.js --dry-run
node tools/router/hub-pull.js --dry-run
# Verificar que hub tem router-tuning-latest.json em R2
curl https://mooter-hub.frugal-hub.workers.dev/api/models
```

---

### T3-D · Obsidian / Second Brain Context Provider

**Não é um skill — é um context provider.** A distinção é importante: não executa, apenas lê e enriquece o perfil de routing.

**Criar:** `tools/router/context-providers/obsidian-provider.js`

**Usa Obsidian API (não oficial mas estável):**
```js
// Obsidian guarda notas em Markdown puro — não precisa de API
// Basta ler os ficheiros da vault

// Estratégia de leitura (sem scanner completo que seria lento):
// 1. Ler .obsidian/config.json → obter path da vault (se configurado pelo user)
// 2. Ler apenas os últimos 30 ficheiros modificados (os mais relevantes)
// 3. Extrair tags YAML frontmatter e links [[wikilinks]]
// 4. Calcular distribuição de tópicos: { react: 45, python: 12, rust: 3, ... }
// 5. Guardar em ~/.frugal/user-context.json (actualizar semanalmente)

// Integração com classify.js:
// Se user-context.json existe e tem { react: >30 }, prompts curtos sobre React → T0 (user é expert)
// Se user-context.json tem { rust: <5 }, prompts sobre Rust → T2 mínimo (user está a aprender)
```

**Validação T3-D:**
```bash
node tools/router/context-providers/obsidian-provider.js --detect
# Esperado: detecta vault path ou indica "not found"

node tools/router/context-providers/obsidian-provider.js --scan
# Esperado: { topics: { ... }, expertise_areas: [...] }
```

---

### T3-E · Universal Router — suporte para Cursor/Windsurf/Aider

**Estratégia:** O frugal expõe um endpoint HTTP local que qualquer tool pode consultar antes de enviar uma request a um LLM.

**Criar:** `tools/router/frugal-proxy.js`

```js
// HTTP server em localhost:8766
// POST /route { prompt: "...", tool: "cursor" }
// Resposta: { tier: "T0", model: "qwen3:30b", reasoning: "...", hint: "..." }

// Configuração em Cursor: Settings → AI → Custom Router → http://localhost:8766/route
// Configuração em Aider: --router-url http://localhost:8766/route
```

**Validação T3-E:**
```bash
node tools/router/frugal-proxy.js --port 8766 &
curl -X POST http://localhost:8766/route \
  -H "Content-Type: application/json" \
  -d '{"prompt": "fix this bug", "tool": "cursor"}'
# Esperado: JSON com tier, model, reasoning
```

---

### 🔒 SAFETY GATE T3

```bash
# Gate 1: Pelo menos 3 utilizadores com dados no hub
curl -s https://mooter-hub.frugal-hub.workers.dev/api/stats | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log('Gate 1 (users):', d.unique_users >= 3 ? 'PASS' : 'WAIT - need 3 users first');
"

# Gate 2: MCP server inicia sem erro
node tools/frugal-mcp-server.js --test 2>&1 | grep -i "ready\|listening" | head -3

# Gate 3: Federated pull funcional
node tools/router/hub-pull.js 2>&1 | grep -i "ok\|success\|updated" | head -3

# Gate 4: Desktop app builda
ls frugal-desktop/src-tauri/target/release/*.dmg 2>/dev/null || \
ls frugal-desktop/src-tauri/target/release/*.msi 2>/dev/null || \
echo "Gate 4: Desktop build pendente"
```

**Commit após T3:**
```
feat(platform): desktop-app + mcp-server + federated-learning-v2 + universal-router (T3)
```

---

## TIER 4 — VISÃO (2026 Q3+)
> **Não começar sem ≥ 50 utilizadores activos e dados reais de 30+ dias.**  
> **Cada item aqui é uma decisão de produto, não de engenharia.**

---

### T4-A · Frugal v1.0 — Public Launch

```
Prerequisite: ≥ 50 utilizadores activos, 95%+ install success rate, domínio custom
Tarefa: install.sh --one-command (curl | bash), open onboarding, public GitHub
Usar: GitHub Actions para CI/CD do installer, Homebrew tap para Mac
```

### T4-B · Plugin Marketplace

```
Prerequisite: MCP server (T3-B) live, ≥ 3 community skills criadas
Tarefa: frugal-hub com endpoint /marketplace, CLI frugal install <skill>
Usar: padrão de structure similar ao Homebrew formulae (YAML manifests)
```

### T4-C · Frugal Teams (v0.8.0 do ROADMAP original)

```
Prerequisite: v1.0 public, federated learning v2 estável
Tarefa: frugal.config.json partilhado via Git, per-contributor analytics
Usar: Supabase RLS para isolamento de dados por team
```

### T4-D · Commercial Support Tier

```
Prerequisite: 200+ utilizadores, documentação de savings auditável
Tarefa: Success-fee model documentado, SLA, custom pattern consulting
Usar: Stripe para billing (já tem infra na landing)
```

---

## ATLAS DE DECISÕES ADIADAS

> Estas foram consideradas e explicitamente adiadas. Não reabrir sem nova evidência.

| Decisão | Razão do adiamento | Reavaliar quando |
|---|---|---|
| Classifier LLM (substituir regex) | Latência 200ms vs 50ms, non-determinismo | > 10k decisions no log |
| Remote proxy mode | Viola Princípio #1 (no proxy) | Nunca — produto diferente |
| Automatic HIGH_RISK learning | Lista de segurança não pode aprender sozinha | Nunca — manual forever |
| GPT-4/Gemini como T3 | Decisão de produto que precisa de dados beta | Após 30 dias de Friends Beta |
| Suporte Linux nativo scheduler | launchd+systemd port é trivial mas não urgente | Primeiro utilizador Linux |
| Self-hosted Docker | Requer multi-user isolation, RLS, infra | v1.0 public launch |

---

## REGISTO DE SOLUÇÕES PÚBLICAS — não construir do zero

| Feature | Não construir | Usar isto | Porquê |
|---|---|---|---|
| Gestão de modelos Ollama | model-downloader próprio | `ollama pull`, `ollama list` | Já existe, estável, CLI padrão |
| Model benchmarks | benchmark engine próprio | HuggingFace Open LLM Leaderboard API + dados locais com `ollama run --verbose` | Benchmarks curados pela comunidade |
| Desktop app | Electron wrapper | Tauri v2 | 15MB vs 200MB, mais performance, auto-update nativo |
| MCP server boilerplate | protocolo MCP do zero | `@modelcontextprotocol/sdk` | SDK oficial, suportado pela Anthropic |
| VSCode extension publish | publisher próprio | `@vscode/vsce` + Azure DevOps PAT | Fluxo oficial Microsoft |
| Schema validation (hub) | validator próprio | Zod | Já usado no ecossistema Node, TypeScript-first |
| E2E testing landing | framework de testes manual | Playwright | Mais estável que Cypress para Next.js, CI fácil |
| Obsidian vault parsing | parser de Markdown/frontmatter | `gray-matter` npm package | Parse YAML frontmatter em 1 linha |
| Rate limiting (hub) | middleware próprio | Cloudflare Rate Limiting rules nativo | Zero código, configurado no dashboard |
| Privacy-preserving analytics | telemetria manual | Hash-only fingerprints (já implementado em hub-push) | Não usar GA/Mixpanel — mina os dados dos utilizadores |

---

## ALIMENTAÇÃO DO ALGORITMO — como cada tier melhora o router

Este documento existe também para garantir que cada feature nova alimenta o loop de aprendizagem. Mapa explícito:

| Feature | O que produz | Onde vai | Como melhora o router |
|---|---|---|---|
| T0-A debug fix + gold-labels | Mais labels curados | gold-labels.json | backtest nocturno afina TUNED thresholds com mais precision |
| T1-A metrics coherence | Dados reais no hub D1 | frugal-hub D1 | aggregate-deltas.js tem mais samples para calcular trust_score |
| T1-B model-profile.json | Scores de qualidade por categoria | classify.js em runtime | Routing considera latência + qualidade, não só custo |
| T1-D gold-labels expansão | Labels extraídos de produção real | gold-labels.json | Accuracy aumenta porque os labels reflectem o uso real, não sintético |
| T1-F Budget Engine | Config óptima por perfil (hardware+subs+budget) | budget-config.json → inject_context.js | Hub agrega configs por perfil: "utilizadores com RTX 4090 + $30 budget → esta config poupa 89%" |
| T2-A model-manager | Benchmarks locais de velocidade | model-profile.json + hw-capability.json | T0 model recomendado é o mais rápido para AQUELE hardware |
| T2-B project-context | Tipo e maturidade do projecto | inject_context.js (contexto adicional) | Routing ajustado por domínio — prompts React → thresholds diferentes de Rust |
| T2-C activity-classifier | Padrões de actividade da sessão | inject_context.js (suggestions) | Não melhora o router directamente, mas aumenta utilização correta de skills |
| T2-F feedback de qualidade | followup_quality: 0/1 por decisão | decisions.log → backtest.js | backtest.js usa signal de qualidade para ajustar promoções/demotes de tier |
| T3-C federated learning v2 | Deltas anonimizados de múltiplos users | hub D1 → router-tuning-latest.json R2 | Padrões aprendidos por 1 utilizador melhoram routing de todos |
| T3-D obsidian context | Distribuição de expertise do utilizador | user-context.json → classify.js | Routing personalizado por nível de conhecimento do utilizador |

---

## QUICK REFERENCE — estado por sessão

Ao iniciar uma nova sessão Claude Code com este documento, verifica:

```bash
# 1. Qual o tier mais alto já concluído?
grep -r "Gate.*PASS\|Gate.*FAIL" ~/.claude/tools/router/frugal-gate-log.json 2>/dev/null || echo "Usar gates manuais acima"

# 2. Estado do hub
curl -s https://mooter-hub.frugal-hub.workers.dev/health

# 3. Versão actual
cat ~/frugal/tools/router/version.json

# 4. Accuracy do classifier
node ~/frugal/tools/router/replay.js --gold-labels 2>&1 | grep -E "accuracy|%"

# 5. Pendente mais urgente (SYNC.md)
head -60 ~/frugal/SYNC.md | grep -A 10 "Pendentes"
```

---

## NOTAS PARA O CLAUDE CODE QUE VAI EXECUTAR ISTO

1. **Lê SYNC.md antes de qualquer tarefa.** O estado actual pode ser diferente do que está aqui.

2. **Verifica antes de criar.** Muitas coisas "a criar" podem já existir numa versão parcial. Grep primeiro.

3. **Não toques no TUNED-BLOCK** em `classify.js`. Esse bloco é gerado pelo `update-router.js`. Edita só as regras manuais acima dele.

4. **Os safety gates são obrigatórios.** Não marques um tier como completo sem passar o gate. O gate é a validação do utilizador final.

5. **Feeds the hub.** Qualquer feature nova que gere dados → garantir que esses dados chegam ao hub D1 via hub-submit-events.js. O flywheel só funciona se os dados fluem.

6. **Soluções públicas primeiro.** Antes de escrever um novo módulo, verifica o ATLAS DE SOLUÇÕES PÚBLICAS acima. Se existe um npm package estável, usa-o.

7. **Um commit por grupo lógico.** Não um commit gigante com tudo. Cada grupo (T0-A, T0-B, etc.) = 1 commit com mensagem descritiva.

8. **Windows paths com espaços.** O utilizador principal tem `C:/Users/Paulo Loureiro/` (espaço no nome). Qualquer path hardcoded deve usar `path.join()` ou aspas. Nunca interpolação sem escape.

9. **Não quebrares o que funciona.** O router está em produção com 663 decisions. Qualquer mudança ao `classify.js`, `inject_context.js`, ou `patterns.js` requer `node --test tools/router/classify.test.js` antes de commitar.

10. **Actualizar SYNC.md no fim de cada sessão.** Escrever o que foi feito, o que ficou pendente, e qual o próximo passo. É o contrato com a próxima sessão.

---

*Documento gerado em sessão Cowork #strategic-review — 2026-04-13*  
*Próxima revisão: após Safety Gate T1 passar*
