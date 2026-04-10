# DATA_COLLECTION_MASTER_PROMPT.md
## frugal — Arquitectura de Telemetria e Feedback Loop
### O coração da solução. Lê antes de escrever qualquer linha.

---

## 1. ESTADO ACTUAL — O que JÁ EXISTE e funciona

Antes de propor o que falta, é crítico honrar o que já está construído e funcionando em produção.

### ✅ O que está implementado hoje (v0.9.0)

#### decisions.log — O ficheiro central de telemetria
Cada prompt classificado gera uma linha JSONL em `~/.claude/tools/router/decisions.log`:

```jsonl
{
  "event": "classified",
  "ts_ms": 1744225432100,
  "session_id": "abc123",
  "tier": "T0",
  "confidence": 0.92,
  "sub_category": "trivial_local",
  "prompt_len": 47,
  "prompt_preview": "write a commit message",
  "model": "qwen2.5:3b",
  "backend": "ollama",
  "quality_intent": false,
  "cache_hit": false,
  "ambiguous": false,
  "reasoning": "trivial_local — commit-message-pattern",
  "arbiter_used": false,
  "cascade_path": "L1→T0",
  "latency_ms": 31,
  "user_override": null
}
```

**O que captura bem:**
- ✅ Tier e modelo decidido
- ✅ Confiança da decisão (0–1)
- ✅ Comprimento do prompt
- ✅ Preview anonimizado (3 primeiras palavras)
- ✅ Se foi um cache hit
- ✅ Se o utilizador forçou override (`@opus`, `usa sonnet`)
- ✅ Cascade path (L1→T0, L1→L2→T3)
- ✅ Latência da classificação em ms
- ✅ Se foi ambíguo
- ✅ Se houve quality intent signal

#### savings-tracker.js — Servidor HTTP local (:7821)
Endpoints já implementados:
- `GET /metrics` — custo real, poupança, distribuição por tier, latência
- `GET /last` — última decisão (tier, modelo, categoria, cascade)
- `GET /gpu` — GPU probe (NVIDIA via `nvidia-smi`, Apple M-series, AMD Linux)
- `GET /real` — OAuth budget real da Anthropic (cache 2h)
- `POST /decision` — recebe a decisão do hook para statusline em tempo real

#### gpu-probe.js — Hardware detection
Já detecta:
- ✅ NVIDIA: nome, VRAM total, utilização actual via `nvidia-smi`
- ✅ Apple Silicon: nome via `system_profiler`
- ✅ AMD Linux: utilização via `/sys/class/drm/`
- ✅ Fallback CPU-only

#### backtest.js — Auto-learning loop
Já executa:
- ✅ Análise de misroutes (short prompts em T2/T3, low-confidence em T2/T3)
- ✅ Demote candidates (padrões que deviam ir a T0)
- ✅ Promote signals (padrões que precisam de mais poder)
- ✅ Guardrail dual-enforced (HIGH_RISK nunca é demovido)
- ✅ Export de delta anonimizado para federated learning

#### aggregate-deltas.js — Federated learning
Já implementado:
- ✅ Validação de schema estrito (rejeita campos inesperados = privacy safety net)
- ✅ Hardware-tier weighting (gpu-high: 1.2, gpu-mid: 1.0, cpu-only: 0.8)
- ✅ Aggregação cross-user de misroutes

---

## 2. O QUE FALTA — Gaps críticos identificados

### ❌ Gap 1: Subscription detection — não existe
O frugal não sabe se o utilizador tem Claude Max, Claude API free-tier, GPT Plus, Gemini Pro, etc. Actualmente lê o budget OAuth da Anthropic (5h quota) mas não entende o tipo de plano nem os outros providers.

**Impacto no routing:** Um utilizador com Claude Max ilimitado não devia ter budget cap aplicado. Um utilizador com GPT API deve ter GPT como fallback em vez de bloquear em T0.

### ❌ Gap 2: VRAM vs modelos instalados — incompleto
O `gpu-probe.js` detecta VRAM total mas não faz a ligação: "com 8GB VRAM podes correr qwen2.5-coder:14b mas não qwen3:30b". O `check-local-models.js` existe mas não está integrado na decisão de routing.

**Impacto:** Utilizadores com hardware modesto recebem T0 routes para modelos que não conseguem correr, resultando em erros silenciosos.

### ❌ Gap 3: Qualidade de resposta — não capturada
O backtest analisa comprimento do prompt e confiança de classificação, mas não captura se a resposta foi boa. Não há sinal de "o utilizador aceitou esta resposta" vs "o utilizador fez follow-up imediato pedindo mais".

**Impacto:** O auto-learning não tem o sinal de ground truth mais valioso: a satisfação do utilizador.

### ❌ Gap 4: Prompt features — subutilizadas
Além do comprimento e das 3 primeiras palavras, não capturam: presença de code blocks, número de ficheiros referenciados, idioma detectado, presença de URLs, se é um follow-up.

**Impacto:** O classifier é cego a features que seriam altamente preditivas do tier correcto.

### ❌ Gap 5: Turn outcome — parcial
`gsd-turn-end.js` captura o timestamp de fim de turno para medir latência, mas não captura: tokens de output gerados, modelo que Claude Code efectivamente escolheu usar, se foi spawned um subagent ou inline.

**Impacto:** Não sabemos se o hint foi honrado. Não sabemos o custo real (só o custo estimado).

### ❌ Gap 6: Subscription profiles — inexistente
Não há forma de o utilizador declarar: "tenho Claude Max + GPT API". Toda a lógica de budget assume Anthropic API pay-per-token.

---

## 3. ARQUITECTURA PROPOSTA — O sistema completo

### Princípios imutáveis (não negociáveis):

```
1. NUNCA armazenar o texto do prompt. Apenas features derivadas.
2. NUNCA enviar dados para fora da máquina sem consentimento explícito e opt-in deliberado.
3. NUNCA bloquear o hook. Toda a recolha é fire-and-forget ou assíncrona.
4. NUNCA recolher o que não tem uso directo para melhorar o router.
5. SEMPRE mostrar ao utilizador o que está a ser recolhido. Zero surpresas.
```

### 3.1 — O Event Schema v2 (decisions.log)

Cada entrada passa a ser um dos 3 event types:

**Event: `classified`** (já existe, expandir)
```jsonl
{
  "event": "classified",
  "ts_ms": 1744225432100,
  "session_id": "abc123def",
  "frugal_version": "0.9.1",

  // Routing decision
  "tier": "T2",
  "confidence": 0.78,
  "sub_category": "reasoning_intermediate",
  "cascade_path": "L1→L2→T2",
  "arbiter_used": true,
  "latency_classify_ms": 43,
  "user_override": null,

  // Prompt features (NUNCA o texto)
  "prompt_len": 124,
  "prompt_preview": "why is useEffect",       // primeiras 3 palavras apenas
  "has_code_block": true,                      // NOVO
  "has_file_refs": false,                      // NOVO
  "file_ref_count": 0,                         // NOVO
  "lang_detected": "en",                       // NOVO — via trigrams simples
  "is_followup": false,                        // NOVO — mesmo session_id < 30s atrás
  "quality_intent": false,
  "cache_hit": false,

  // Hardware snapshot (lido do cache do tracker, não probe a cada call)
  "hw_tier": "gpu-high",                       // NOVO — gpu-high/gpu-mid/gpu-low/cpu-only/apple
  "vram_mb": 24564,                            // NOVO — snapshot do gpu-probe

  // Subscription context (declarado pelo utilizador, nunca inferido)
  "sub_profile": "claude-max",                 // NOVO — ver §3.2
  "budget_pct_5h": 23                          // já existe no inject, falta no log
}
```

**Event: `turn_end`** (já existe via gsd-turn-end.js, expandir)
```jsonl
{
  "event": "turn_end",
  "ts_ms": 1744225434100,
  "session_id": "abc123def",
  "turn_duration_ms": 1843,

  // Outcome signals (NOVO)
  "output_tokens_est": 340,       // estimativa baseada em chars/4
  "subagent_spawned": true,       // NOVO — hook lê decisions.log last entry
  "subagent_name": "model-reasoner",  // NOVO
  "hint_honored": true,           // NOVO — tier do hint == tier do subagent spawned
  "followup_within_30s": false    // NOVO — próximo prompt chegou em <30s?
}
```

**Event: `feedback`** (NOVO — sinal de qualidade)
```jsonl
{
  "event": "feedback",
  "ts_ms": 1744225438200,
  "session_id": "abc123def",
  "signal": "accepted",     // accepted | followup_immediate | override_up | override_down
  "tier_was": "T2",
  "latency_ms": 1843
}
```

Como capturar `feedback` sem perguntar ao utilizador:
- `accepted` = próximo prompt chegou > 30s depois (utilizador foi fazer outra coisa)
- `followup_immediate` = próximo prompt chegou < 10s depois (provavelmente pediu mais/melhor)
- `override_up` = utilizador escreveu `@opus` ou `usa o opus` no follow-up
- `override_down` = utilizador escreveu `@haiku` ou `rápido` no follow-up

---

### 3.2 — Subscription Profile Detection

**Filosofia:** nunca inferir. Perguntar uma vez, guardar localmente, usar para sempre.

**Ficheiro:** `~/.claude/tools/router/subscription-profile.json`

```json
{
  "updated_at": "2026-04-09T10:00:00Z",
  "profiles": {
    "anthropic": "max",     // "max" | "api-paid" | "api-free" | "none"
    "openai": "api-paid",   // "plus" | "api-paid" | "none"
    "gemini": "none",       // "pro" | "api-paid" | "none"
    "grok": "none"
  },
  "budget_strategy": "auto",
  // "auto" = deixa o frugal decidir baseado nos perfis
  // "local-first" = maximize T0, usa API só quando necessário
  // "quality-first" = use best model available, minimize T0
  "primary_provider": "anthropic"
}
```

**Como recolher:** um comando de setup, executado uma vez:
```bash
node ~/.claude/tools/router/setup-profile.js
```

Output interactivo:
```
🐕 frugal — subscription profile setup

? Do you have Claude Max (unlimited)? (y/n): y
  → budget_cap disabled for anthropic
? Do you have an OpenAI API key? (y/n): y
  → openai: api-paid, GPT-4o available as T2 fallback
? Do you have Gemini API access? (y/n): n

Profile saved. frugal will now:
  - Never apply budget cap (you have Claude Max)
  - Use GPT-4o as T2 fallback when Sonnet is degraded
  - Prefer Ollama for T0 (your RTX 4090 handles it well)
```

**Como usar no routing:**
- `anthropic: "max"` → desactiva budget cap, nunca force T0 por budget
- `anthropic: "api-free"` → aplica budget cap agressivo, favorece T0/Ollama
- `openai: "api-paid"` → adiciona GPT-4o como T2 alternative quando Sonnet degraded

---

### 3.3 — Hardware-Aware Routing (expandido)

O `gpu-probe.js` já existe. Falta usar os dados para decidir os modelos T0 disponíveis.

**Novo ficheiro:** `~/.claude/tools/router/hw-capability.json` (gerado pelo probe, actualizado a cada sessão)

```json
{
  "probed_at": "2026-04-09T10:00:00Z",
  "vendor": "nvidia",
  "name": "RTX 4090",
  "name_short": "RTX 4090",
  "vram_mb": 24576,
  "hw_tier": "gpu-high",
  "t0_models_available": [
    { "model": "qwen2.5:3b",              "vram_req_mb": 2048,  "can_run": true  },
    { "model": "qwen2.5-coder:14b-q4",   "vram_req_mb": 9216,  "can_run": true  },
    { "model": "deepseek-r1-distill:14b", "vram_req_mb": 9216,  "can_run": true  },
    { "model": "qwen3:30b",              "vram_req_mb": 20480, "can_run": true  }
  ],
  "recommended_t0": "qwen2.5-coder:14b-q4",
  "ollama_running": true,
  "ollama_loaded_models": ["qwen2.5:3b"]
}
```

**VRAM requirements table (hard-coded no probe, baseado em benchmarks públicos):**
```javascript
const MODEL_VRAM_REQ = {
  'qwen2.5:3b':                    2048,   // ~2GB — corre em qualquer GPU
  'qwen2.5-coder:7b':              4096,   // ~4GB
  'qwen2.5-coder:14b-q4':         9216,   // ~9GB
  'deepseek-r1-distill-qwen:14b': 9216,   // ~9GB
  'qwen2.5:32b-q4':               20480,  // ~20GB
  'qwen3:30b':                    20480,  // ~20GB — RTX 4090 ou melhor
  'llama3.3:70b-q4':              40960,  // ~40GB — não realista para maioria
};
```

**Routing decision modificada:**
```
Antes: T0 → qwen2.5:3b (sempre)
Depois: T0 → hw-capability.json.recommended_t0
         → fallback: qwen2.5:3b se modelo recommended não instalado
         → fallback: skip T0 se Ollama não running (não bloqueia)
```

---

### 3.4 — Prompt Feature Extraction (sem ver o texto)

Adicionar ao `classify.js`, executado antes da decisão de tier:

```javascript
function extractPromptFeatures(promptText) {
  return {
    len: promptText.length,
    
    // Code signals — presença de backticks, palavras-chave de código
    has_code_block: /```[\s\S]{10,}```/.test(promptText) || 
                   /`[^`]{3,}`/.test(promptText),
    
    // File references — extensões comuns ou caminhos
    has_file_refs: /\b\w+\.(ts|js|py|go|rs|java|md|json|yaml|toml|env)\b/.test(promptText),
    file_ref_count: (promptText.match(/\b\w+\.(ts|js|py|go|rs|java|md|json|yaml)\b/g) || []).length,
    
    // Language detection — trigrams simples (PT vs EN)
    // PT-PT signals: "porquê", "preciso", "podes", "tenho", "está", "vou"
    // EN signals: "why", "how", "please", "can you", "make", "create"
    lang_detected: /\b(porquê|preciso|podes|tenho|está|vou|fazer|como|quando)\b/i.test(promptText) ? 'pt' : 'en',
    
    // URL presence
    has_url: /https?:\/\//.test(promptText),
    
    // Question type
    is_question: /[?？]\s*$/.test(promptText.trim()),
    
    // Error paste (stack traces, error messages)
    has_error_trace: /at \w+\s*\([\w/:.]+:\d+:\d+\)/.test(promptText) ||
                    /Error:|TypeError:|ReferenceError:|SyntaxError:/.test(promptText),
  };
}
```

**Nenhuma destas features armazena o texto do prompt.** São booleans e contagens derivadas.

---

### 3.5 — O Pipeline de Feedback Loop Completo

```
┌─────────────────────────────────────────────────────────────┐
│                    TEMPO REAL (< 50ms)                       │
│                                                             │
│  Prompt chega                                               │
│       │                                                     │
│       ▼                                                     │
│  extractPromptFeatures()    ← sem ver texto, só features    │
│  readHwCapability()         ← cache local, não probe        │
│  readSubscriptionProfile()  ← ficheiro local                │
│  readBudgetCache()          ← cache OAuth (2h TTL)          │
│       │                                                     │
│       ▼                                                     │
│  classify.js → tier + confidence + cascade                  │
│       │                                                     │
│       ▼                                                     │
│  logDecision() → decisions.log (JSONL, append)             │
│  postTracker() → /decision (statusline, fire-and-forget)   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              FIM DE TURNO (async, gsd-turn-end.js)          │
│                                                             │
│  Turn_end event chega                                       │
│       │                                                     │
│       ▼                                                     │
│  Pair com classified event (session_id match)              │
│  Calcula: duration_ms, hint_honored, followup_within_30s   │
│  logTurnEnd() → decisions.log                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              NOCTURNAMENTE (02:00, backtest.js)             │
│                                                             │
│  Lê decisions.log (todos os events do dia)                  │
│       │                                                     │
│       ├─ Calcula misroutes (feedback: followup_immediate    │
│       │   + tier era T2/T3 + prompt era curto)             │
│       │                                                     │
│       ├─ Analisa hint_honored rate por sub_category        │
│       │                                                     │
│       ├─ Detecta padrões em has_code_block + lang_detected │
│       │   → novos promote/demote patterns para tuning      │
│       │                                                     │
│       ├─ Gera router-tuning.json                           │
│       │                                                     │
│       └─ Se --export-delta: gera delta anonimizado         │
│             (keyword_signals, prompt_len_bucket, tier mis- │
│              match, hw_tier, lang_detected, session_hour)  │
│             SEM texto, SEM paths, SEM IDs reversíveis      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              OPT-IN (manual, utilizador decide)             │
│                                                             │
│  node backtest.js --export-delta → delta.json              │
│  (utilizador revê o ficheiro, vê exactamente o que sai)    │
│       │                                                     │
│       ▼                                                     │
│  Partilha com frugal-hub (quando existir)                  │
│  ou envia manualmente para o Paulo                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. O QUE RECOLHEMOS VS O QUE NÃO RECOLHEMOS

### Tabela de privacidade (mostrar no dashboard e na landing)

| Dado | Recolhemos? | Fica na máquina? | Sai com delta? |
|---|---|---|---|
| Texto do prompt | ❌ Nunca | — | — |
| Ficheiros do projeto | ❌ Nunca | — | — |
| Nomes de variáveis | ❌ Nunca | — | — |
| Tier decidido | ✅ Sim | ✅ Sim | ✅ Sim (ex: T0→T2) |
| Comprimento do prompt | ✅ Sim | ✅ Sim | ✅ bucket (50-100 chars) |
| Presença de code block | ✅ Sim | ✅ Sim | ✅ boolean |
| Presença de file refs | ✅ Sim | ✅ Sim | ✅ boolean |
| Idioma detectado | ✅ Sim | ✅ Sim | ✅ (en/pt/other) |
| Hardware tier | ✅ Sim | ✅ Sim | ✅ (gpu-high/mid/low/cpu) |
| Latência de classificação | ✅ Sim | ✅ Sim | ❌ (muito específico) |
| Session ID | ✅ Sim | ✅ Sim | ❌ (hash SHA-256 one-way) |
| Budget % Anthropic | ✅ Sim | ✅ Sim | ❌ (demasiado pessoal) |
| GPU nome completo | ✅ Sim (local) | ✅ Sim | ✅ categoria apenas |
| Keywords do prompt | ✅ Derivadas | ✅ Sim | ✅ allowlist estrita |
| IP / hostname | ❌ Nunca | — | — |
| Subscription plan | ✅ Declarado | ✅ Sim | ❌ |

---

## 5. MASTER PROMPT PARA CLAUDE CODE

Este é o prompt a usar para implementar os gaps identificados na §2. Executa numa sessão Claude Code com acesso a `~/frugal/tools/router/`.

---

```
MASTER PROMPT — frugal Telemetria v2

CONTEXTO:
Estás a trabalhar no projecto frugal, um LLM router para Claude Code.
O código base está em ~/frugal/tools/router/.
Lê ARCHITECTURE.md e DATA_COLLECTION_MASTER_PROMPT.md antes de começar.

OBJECTIVO:
Implementar 4 melhorias ao sistema de telemetria e feedback loop do frugal.
Cada melhoria é independente. Implementa-as na ordem indicada.
Após cada melhoria, executa os testes existentes: node backtest.test.js

PRINCÍPIOS NÃO NEGOCIÁVEIS:
1. Nunca armazenar o texto de nenhum prompt, nem substrings dele.
2. Nunca bloquear o hook inject_context.js por mais de 500ms no total.
3. Toda a nova lógica deve ter uma secção "graceful degradation":
   se falhar, o router continua a funcionar como antes.
4. Não modificar decisions.log schema de forma breaking (só additive).
5. Novos campos no log são opcionais — código antigo que os ignora continua válido.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MELHORIA 1: Prompt Feature Extraction
Ficheiro a modificar: classify.js

Adiciona, ANTES do bloco de decisão de tier, uma função extractPromptFeatures(text)
que retorna um objecto com APENAS:
  - has_code_block: boolean — /```[\s\S]{10,}```/.test(text) || /`[^`]{3,}`/.test(text)
  - has_file_refs: boolean — /\b\w+\.(ts|js|py|go|rs|java|md|json|yaml|toml|env)\b/.test(text)
  - file_ref_count: number — count das ocorrências acima (max 10)
  - lang_detected: "pt"|"en"|"other" — se encontrar ≥2 tokens PT-PT → "pt", senão "en"
  - has_error_trace: boolean — stack trace patterns
  - is_question: boolean — termina com "?" ou "？"
  - has_url: boolean

Tokens PT-PT a detectar (não exhaustivo, só os mais discriminativos):
  porquê, preciso, podes, tenho, está, estou, vou, fazer, como, quando,
  porque, consegues, tens, podes, deves, quero, precisas, mostra, ajuda

O objecto retornado por extractPromptFeatures() é adicionado ao JSON de output
do classify.js. Só isso — não altera a lógica de decisão de tier.

Valida: echo '{"prompt":"why is my useEffect firing twice?"}' | node classify.js
Espera: output inclui "has_code_block":false, "lang_detected":"en", "is_question":true

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MELHORIA 2: Subscription Profile
Ficheiro a criar: tools/router/setup-profile.js
Ficheiro a criar: tools/router/subscription-profile.json (template)
Ficheiro a modificar: classify.js (leitura do profile)
Ficheiro a modificar: inject_context.js (pass profile ao classify)

2A. Cria setup-profile.js — script interactivo que:
  - Pergunta, uma a uma, via readline (TTY):
      "Do you have Claude Max (unlimited)? [y/N]"
      "Do you have an Anthropic API key (pay-per-token)? [y/N]"
      "Do you have an OpenAI API key? [y/N]"
      "Do you have Gemini API access? [y/N]"
  - Escreve ~/.claude/tools/router/subscription-profile.json com:
    {
      "updated_at": "<ISO timestamp>",
      "profiles": {
        "anthropic": "<max|api-paid|api-free|none>",
        "openai": "<api-paid|none>",
        "gemini": "<api-paid|none>"
      },
      "budget_strategy": "auto"
    }
  - Exibe confirmação: "Profile saved. frugal is now aware of your subscriptions."

2B. Modifica applyBudgetCap() em inject_context.js:
  - Lê subscription-profile.json (cache em memória para a sessão)
  - Se profiles.anthropic === "max": retorna tier sem qualquer cap
  - Se profiles.anthropic === "none": aplica cap agressivo (50% → T1 max)
  - Se não existe o ficheiro: comportamento actual (não altera nada)

2C. Adiciona ao output do classify.js:
  - sub_profile: o valor de profiles.anthropic (ou "unknown" se sem ficheiro)

Valida: node setup-profile.js (responde y, n, y, n)
         → cria ~/.claude/tools/router/subscription-profile.json
         → conteúdo correcto

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MELHORIA 3: Hardware-Aware T0 Model Selection
Ficheiro a modificar: gpu-probe.js (exportar hw-capability)
Ficheiro a criar: tools/router/hw-capability.json (gerado pelo probe)
Ficheiro a modificar: inject_context.js (leitura do hw-capability)
Ficheiro a modificar: classify.js (usar recommended_t0 em vez de hardcoded)

3A. Adiciona a gpu-probe.js uma função buildHwCapability(probeResult):
  Table de VRAM requirements (hardcoded, baseado em benchmarks públicos Q1 2026):
    qwen2.5:3b                   → 2048 MB
    qwen2.5-coder:7b             → 4096 MB
    qwen2.5-coder:14b-q4         → 9216 MB
    deepseek-r1-distill-qwen:14b → 9216 MB
    qwen2.5:32b-q4               → 20480 MB
    qwen3:30b                    → 20480 MB

  hw_tier: 
    vramMB >= 20480 → "gpu-high"
    vramMB >= 8192  → "gpu-mid"
    vramMB >= 4096  → "gpu-low"
    vendor === "apple" → "apple-silicon" (VRAM shared — assume capaz de mid)
    else → "cpu-only"

  t0_models_available: lista dos modelos com can_run: vramMB >= req
  recommended_t0: o modelo de maior req que can_run é true, ou "qwen2.5:3b" como fallback

  Escreve este objecto em ~/.claude/tools/router/hw-capability.json
  Apenas quando o probe detecta GPU (não em cpu-only — evita writes desnecessários)

3B. No inject_context.js, no startup (antes do classify):
  - Lê hw-capability.json (cache de sessão — não relê a cada prompt)
  - Passa FRUGAL_HW_RECOMMENDED_T0=<model> como env var para o subprocess classify.js

3C. No classify.js, quando o tier é T0:
  - Lê process.env.FRUGAL_HW_RECOMMENDED_T0 (se presente)
  - Usa esse modelo em vez de "qwen2.5:3b" no campo "model" do output
  - Se a env var não está presente: comportamento actual (qwen2.5:3b)

Graceful degradation: se hw-capability.json não existe ou é inválido → ignora, usa fallback.

Valida: node -e "const p = require('./gpu-probe'); console.log(JSON.stringify(p.probeSync(), null, 2))"
         → se tens GPU: mostra hw_tier, recommended_t0
         → se não tens GPU: mostra "vendor":"cpu", sem crash

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MELHORIA 4: Implicit Feedback Signal
Ficheiro a modificar: gsd-turn-end.js
Ficheiro a modificar: inject_context.js (pass session context para turn_end)
Ficheiro a modificar: backtest.js (consumir feedback events)

4A. No gsd-turn-end.js, no turn_end event, adiciona:
  - followup_within_30s: boolean
    → True se no decisions.log existe um "classified" event com o mesmo session_id
      com ts_ms entre turn_end.ts_ms e turn_end.ts_ms + 30000
    → Implementado como look-ahead: o campo é preenchido pelo backtest.js (não em tempo real)
    → No turn_end event em si: gravar "followup_pending": true (placeholder)

4B. No backtest.js, após carregar todos os decisions:
  - Para cada turn_end com followup_pending: true:
    → Procura o classified event seguinte com mesmo session_id
    → Se ts_ms desse classified - ts_ms do turn_end < 30000:
        followup_within_30s = true
        feedback_signal = "followup_immediate"
    → Se ts_ms > 120000 (2min) ou não existe:
        followup_within_30s = false
        feedback_signal = "accepted"
  - Usa feedback_signal como peso no cálculo de misroute:
    → feedback "followup_immediate" + tier era T0 = possível under-routing (promover)
    → feedback "followup_immediate" + tier era T2/T3 = possível over-routing se prompt era curto
  - Adiciona estes pesos ao cálculo de demote/promote candidates

4C. Adiciona ao export delta (--export-delta):
  - "feedback_signals": { "accepted": N, "followup_immediate": N }
  - Não exporta session_id, não exporta prompts, não exporta timestamps absolutos

Valida: node backtest.js (deve correr sem erros)
         node backtest.js --explain (deve mostrar feedback_signal nos candidates)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

APÓS TODAS AS MELHORIAS:

1. Executa todos os testes: node backtest.test.js
   → Todos devem passar. Se algum falha, corrige ANTES de avançar.

2. Executa o replay para confirmar que o schema novo não quebra nada:
   node replay.js
   → Deve completar sem crash. Savings % não deve degradar mais de 2pp.

3. Cria/actualiza docs/TELEMETRY.md com:
   - Lista dos campos em decisions.log (todos, obrigatórios e opcionais)
   - Tabela de privacidade (o que fica local, o que sai no delta)
   - Como correr setup-profile.js
   - Como usar hw-capability.json manualmente

4. Commit selectivo:
   git add tools/router/classify.js
   git add tools/router/inject_context.js
   git add tools/router/gpu-probe.js
   git add tools/router/gsd-turn-end.js
   git add tools/router/backtest.js
   git add tools/router/setup-profile.js
   git add docs/TELEMETRY.md
   git commit -m "feat(telemetry): prompt features, subscription profiles, hw-aware T0, implicit feedback"

NÃO fazer git add -A. NÃO commitar hw-capability.json (é gerado localmente).
Adiciona hw-capability.json ao .gitignore.
```

---

## 6. PORQUE ESTE SISTEMA É DEFENSÁVEL

**Para o vibe coder:**
- A primeira sessão já funciona — sem setup obrigatório
- O `setup-profile.js` corre em 60 segundos e muda a experiência drasticamente
- Nunca perde tempo a ver o texto dos seus prompts

**Para o VC:**
- O dataset que cresce: cada utilizador gera misroute signals anónimos que melhoram o classifier para todos
- O hardware weighting: utilizadores com RTX 4090 têm mais influência no tuning (são o target demographic)
- O feedback signal: frugal aprende o que constitui uma "boa" resposta sem supervisão humana
- O subscription profile: base para monetização inteligente — um utilizador Claude Max e um pay-per-token têm routing completamente diferente

**O fosso competitivo:**
```
t=0:  frugal sabe classificar prompts genéricos
t=1mo: 100 utilizadores → 50k decisions → 500 deltas → tuning mais preciso
t=6mo: 1000 utilizadores → feedback signals → frugal aprende que "useEffect"
       às 22h de um utilizador com RTX 4090 e Claude Max provavelmente é
       T2, não T0, porque o utilizador fez followup_immediate 7 vezes em 8
t=12mo: o dataset de routing é o activo mais valioso. Nenhum concorrente tem.
```

**Nenhum proxy consegue construir este dataset.** Eles veem o tráfego. frugal vê o comportamento.

---

## 7. SEQUÊNCIA DE IMPLEMENTAÇÃO RECOMENDADA

Para Paulo executar agora com Claude Code:

```
Sessão 1 (30 min): Melhoria 1 — Prompt Features
  → Mais segura, sem riscos. Só adiciona campos ao output.
  → Testa com: echo '{"prompt":"test"}' | node classify.js

Sessão 2 (45 min): Melhoria 2 — Subscription Profile
  → Cria setup-profile.js. Testa manualmente.
  → Modifica applyBudgetCap() — cuidado, é path crítico.

Sessão 3 (45 min): Melhoria 3 — Hardware-Aware T0
  → Expande gpu-probe.js. Não quebra nada se GPU não detectada.
  → Confirma que T0 routing usa o modelo certo depois.

Sessão 4 (60 min): Melhoria 4 — Implicit Feedback
  → A mais complexa. Modifica backtest.js — corre todos os testes depois.
  → Confirma com backtest.js --explain.

Sessão 5 (20 min): Docs + Commit
  → TELEMETRY.md + commit selectivo.
```

---

## 8. O QUE MOSTRAR AOS UTILIZADORES (transparência total)

Após instalar, o utilizador deve poder correr:

```bash
node ~/.claude/tools/router/privacy-report.js
```

Output:
```
🐕 frugal — what we collect

📁 Local storage:
   ~/.claude/tools/router/decisions.log   (your routing history)
   ~/.claude/tools/router/hw-capability.json  (your hardware profile)
   ~/.claude/tools/router/subscription-profile.json  (your declared subscriptions)

📊 What's in decisions.log (sample):
   {"event":"classified","tier":"T0","prompt_len":47,"has_code_block":false,...}
   
   ✓ Never the prompt text
   ✓ Never file names or paths
   ✓ Never variable names or code

📤 What leaves your machine (only if you run --export-delta):
   keyword_signals:     ["commit", "message"]  (from allowlist, not free text)
   prompt_len_bucket:   "50-100"
   tier_mismatch:       "T2→T0"
   hw_tier:             "gpu-high"
   lang_detected:       "en"

   → You can inspect the delta.json before sharing it.
   → Nothing is sent automatically. Ever.

🗑  To delete everything:
   rm -rf ~/.claude/tools/router/decisions.log
   rm -rf ~/.claude/tools/router/hw-capability.json
```

---

*Este documento é o coração do sistema de aprendizagem do frugal.*
*Implementa as 4 melhorias por ordem. Testa após cada uma. Não saltes passos.*
*A telemetria é a fundação sobre a qual o melhor router de LLMs do mundo é construído.*
