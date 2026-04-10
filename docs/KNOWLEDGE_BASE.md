# frugal — KNOWLEDGE BASE
## O repositório central de tudo o que o router precisa de saber

> **Este ficheiro é a fonte de verdade para**: modelos LLM disponíveis, hardware suportado,
> limites de planos de subscrição, plugins compatíveis, e skills recomendadas.
>
> **Actualizado por:** Paulo (manualmente) + PRs da comunidade + script `node tools/router/update-kb.js`
>
> **Consumido por:** `classify.js`, `setup-profile.js`, `pricing.js`, `check-local-models.js`,
> e pelo dashboard local (v0.6.0).
>
> **Última revisão:** 2026-04-10

---

## 1. MODELOS LLM — Catálogo completo

### 1A. Anthropic (Claude)

| Modelo | ID exacto | Tier frugal | Input $/MTok | Output $/MTok | Contexto | Pontos fortes | Estado |
|---|---|---|---|---|---|---|---|
| Claude Opus 4.6 | `claude-opus-4-6` | T3 💎 | $15.00 | $75.00 | 200k | arquitectura, refactor crítico, long-context | ✅ Activo |
| Claude Opus 4.6 (1M) | `claude-opus-4-6[1m]` | T3 💎 | $30.00 | $150.00 | 1M | contextos muito longos | ✅ Activo |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | T2 🎵 | $3.00 | $15.00 | 200k | código, debugging, raciocínio | ✅ Activo |
| Claude Sonnet 4.6 (1M) | `claude-sonnet-4-6[1m]` | T2 🎵 | $6.00 | $22.50 | 1M | long-context raciocínio | ✅ Activo |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | T1 🌸 | $0.80 | $4.00 | 200k | commit msg, docstring, regex, explicações | ✅ Activo |

**Regras de uso (Claude Max — importantes para o router):**

| Janela | Limite típico | Comportamento do frugal |
|---|---|---|
| 5 horas (pico) | ~100 mensagens Opus | Monitoriza via `/api/oauth/usage`. Acima de 70% → escala T3→T2 |
| Fim-de-semana | Limites reduzidos (reportado pela comunidade) | `session_hour` + `day_of_week` detectado pelo backtest |
| Madrugada (00:00–06:00 UTC) | Tipicamente mais liberal | `frugal` pode promover threshold de T0→T1 neste período |
| Promoções temporárias | Janelas ad-hoc da Anthropic | Detectado via spike no `/api/oauth/usage` ratio — router logs automaticamente |

**Como o frugal gere os limites:**
```
Budget cache TTL: 2 horas (refresh-budget.js)
Budget cap logic: 0-50% usado → T3 livre
                  50-70% → max T2
                  70-85% → max T1
                  >85%   → forçar T0
Claude Max override: subscription-profile.json { "anthropic": "max" } → disable cap
```

---

### 1B. Ollama (Local — T0 🏠)

**Filosofia T0:** sempre o modelo mais capaz que cabe na VRAM disponível.

| Modelo | Pull command | VRAM mínima | Subtier | Pontos fortes | Recomendado para |
|---|---|---|---|---|---|
| qwen2.5:3b | `ollama pull qwen2.5:3b` | 2 GB | general | rápido, leve, multilingual | qualquer GPU, CPU lento |
| qwen2.5-coder:7b | `ollama pull qwen2.5-coder:7b` | 4 GB | code | código, regex, lint | GPUs 4-8 GB |
| qwen2.5-coder:14b-q4 | `ollama pull qwen2.5-coder:14b-q4` | 9 GB | code | código complexo, refactor | GPUs 10-16 GB |
| deepseek-r1-distill-qwen:14b | `ollama pull deepseek-r1-distill-qwen:14b` | 9 GB | math | raciocínio step-by-step, matemática | GPUs 10-16 GB |
| qwen2.5:32b-q4 | `ollama pull qwen2.5:32b-q4` | 20 GB | general+ | tasks complexas locais | RTX 3090/4090, A6000 |
| qwen3:30b | `ollama pull qwen3:30b` | 20 GB | reason | raciocínio avançado local | RTX 4090, A100 |

**Ordem de preferência T0 (do melhor para fallback):**
```
qwen3:30b → qwen2.5:32b-q4 → deepseek-r1-distill-qwen:14b →
qwen2.5-coder:14b-q4 → qwen2.5-coder:7b → qwen2.5:3b
```

**Configuração recomendada para performance:**
```bash
# Manter modelo em VRAM indefinidamente (evita cold start de 8-10s)
export OLLAMA_KEEP_ALIVE=-1

# Verificar modelos instalados
node ~/.claude/tools/router/check-local-models.js
```

---

### 1C. OpenAI / Codex

| Modelo | ID | Tier frugal | Input $/MTok | Output $/MTok | Pontos fortes | Estado |
|---|---|---|---|---|---|---|
| GPT-4o | `gpt-4o` | T2 🎵 | $2.50 | $10.00 | código, raciocínio multi-modal | ✅ Suportado (fallback) |
| GPT-4o mini | `gpt-4o-mini` | T1 🌸 | $0.15 | $0.60 | tasks leves, barato | ✅ Suportado (fallback) |
| o3 | `o3` | T3 💎 | ~$10.00 | ~$40.00 | raciocínio profundo | 🟡 Planeado v1.0 |
| o4-mini | `o4-mini` | T2 🎵 | ~$1.00 | ~$4.00 | raciocínio rápido | 🟡 Planeado v1.0 |

**Activar como fallback:**
```bash
node ~/.claude/tools/router/setup-profile.js
# → responde "y" a OpenAI API
# → define OPENAI_API_KEY no ambiente
```

---

### 1D. Google (Gemini)

| Modelo | ID | Tier frugal | Input $/MTok | Output $/MTok | Pontos fortes | Estado |
|---|---|---|---|---|---|---|
| Gemini 2.5 Flash | `gemini-2.5-flash` | T1 🌸 | $0.075 | $0.30 | rápido, barato, multilingual | 🟡 Planeado v1.0 |
| Gemini 2.5 Pro | `gemini-2.5-pro` | T2 🎵 | $1.25 | $5.00 | código, raciocínio | 🟡 Planeado v1.0 |

---

### 1E. Outros providers (roadmap)

| Provider | Modelo | Tier provável | Estado | Notes |
|---|---|---|---|---|
| xAI | Grok 3 | T2/T3 | 🔵 Vision | Contexto muito longo |
| Mistral | Mistral Large | T2 | 🔵 Vision | Forte em PT/ES/FR |
| Mistral | Mistral Small | T1 | 🔵 Vision | Mais barato que Haiku |
| Cohere | Command R+ | T2 | 🔵 Vision | RAG nativo |
| Meta | Llama 3.3 70B (Ollama) | T0 | 🔵 Vision | Requer 40GB+ VRAM |
| DeepSeek | DeepSeek V3 (Ollama) | T0 | 🟡 Planeado | Excelente custo/benefício |

**Como sugerir um novo modelo:**
```
Abre issue no GitHub com:
  - Nome e ID do modelo
  - Pricing actual (link à página oficial)
  - Tier sugerido e razão
  - Benchmarks relevantes (se existirem)
```

---

## 2. HARDWARE — Guia de compatibilidade

### 2A. GPUs NVIDIA

| GPU | VRAM | hw_tier frugal | Modelos T0 recomendados | Notes |
|---|---|---|---|---|
| RTX 4090 | 24 GB | gpu-high | qwen3:30b, qwen2.5:32b-q4 | Ideal. Corre todos os modelos T0. |
| RTX 4080 Super | 16 GB | gpu-mid | qwen2.5-coder:14b-q4, deepseek-r1:14b | Boa experiência |
| RTX 4070 Ti | 12 GB | gpu-mid | qwen2.5-coder:14b-q4 | OK para code |
| RTX 4070 | 12 GB | gpu-mid | qwen2.5-coder:14b-q4 | OK para code |
| RTX 4060 Ti 16GB | 16 GB | gpu-mid | qwen2.5-coder:14b-q4 | Boa relação preço |
| RTX 4060 | 8 GB | gpu-low | qwen2.5-coder:7b | Mínimo viável para code |
| RTX 3090 | 24 GB | gpu-high | qwen3:30b | Excelente, ligeiramente mais lento |
| RTX 3080 | 10 GB | gpu-mid | qwen2.5-coder:14b-q4 | Bom para uso geral |
| RTX 3070 | 8 GB | gpu-low | qwen2.5-coder:7b | Funciona, mais lento |
| GTX 1080 Ti | 11 GB | gpu-low | qwen2.5-coder:7b | Mínimo viável |
| Qualquer com <4GB | <4 GB | cpu-only | qwen2.5:3b (CPU) | Usar CPU fallback |

### 2B. Apple Silicon

| Chip | RAM unificada | hw_tier frugal | Modelos T0 recomendados | Notes |
|---|---|---|---|---|
| M4 Max | 48-128 GB | apple-silicon | qwen3:30b | Excelente. RAM unificada é vantagem. |
| M4 Pro | 24-64 GB | apple-silicon | qwen3:30b / qwen2.5:32b-q4 | Muito bom |
| M4 | 16-32 GB | apple-silicon | qwen2.5-coder:14b-q4 | Bom |
| M3 Max | 36-128 GB | apple-silicon | qwen3:30b | Excelente |
| M3 Pro | 18-36 GB | apple-silicon | qwen2.5-coder:14b-q4 | Bom |
| M3 | 8-24 GB | apple-silicon | qwen2.5-coder:7b (8GB) / 14b-q4 (16GB+) | OK |
| M2 Ultra | 64-192 GB | apple-silicon | qwen3:30b | Excepcional |
| M2 Max | 32-96 GB | apple-silicon | qwen3:30b | Excelente |
| M2 Pro | 16-32 GB | apple-silicon | qwen2.5-coder:14b-q4 | Bom |
| M2 | 8-24 GB | apple-silicon | qwen2.5-coder:7b (8GB) | OK |
| M1 | 8-16 GB | apple-silicon | qwen2.5:3b (8GB) / coder:7b (16GB) | Funciona |

> **Nota Apple Silicon:** RAM unificada partilhada entre CPU/GPU. `ollama` usa Metal para aceleração. O gpu-probe.js reporta nome mas não VRAM (requer `powermetrics` com sudo). O frugal assume que Apple Silicon pode correr modelos até 14B q4 por default.

### 2C. AMD (Linux)

| GPU | VRAM | hw_tier frugal | Notes |
|---|---|---|---|
| RX 7900 XTX | 24 GB | gpu-high | ROCm required. Suporte via `/sys/class/drm/` |
| RX 7800 XT | 16 GB | gpu-mid | ROCm required |
| RX 6800 XT | 16 GB | gpu-mid | ROCm required |
| RX 6700 XT | 12 GB | gpu-mid | ROCm required |

> **Nota AMD:** `gpu-probe.js` detecta utilização via `/sys/class/drm/card0/device/gpu_busy_percent` mas não VRAM. Definir `FRUGAL_VRAM_MB=<valor>` no ambiente para forçar detecção correcta.

### 2D. CPU-only / Cloud

| Cenário | hw_tier frugal | Recomendação |
|---|---|---|
| Sem GPU | cpu-only | qwen2.5:3b (CPU, lento ~15-30s/resposta) |
| WSL2 sem GPU passthrough | cpu-only | Mesma que acima |
| GitHub Codespaces | cpu-only | Desactivar T0 local, usar T1 Haiku |
| Cursor/VS Code Remote | variável | Depende do hardware do host |

---

## 3. PLANOS DE SUBSCRIÇÃO — Comportamento do router

### 3A. Anthropic

| Plano | ID em subscription-profile.json | Budget cap | Comportamento especial |
|---|---|---|---|
| Claude Max | `"anthropic": "max"` | **Desactivado** | Usa o melhor modelo disponível sem cap. Monitoriza peaks mas não força downgrade. |
| Claude API (pay-per-token) | `"anthropic": "api-paid"` | Standard (50/70/85%) | Cap activado. Alerta quando custo mensal > $20. |
| Claude API (free tier) | `"anthropic": "api-free"` | Agressivo (30/50%) | Favorece T0 ao máximo. Alerta precoce. |
| Sem Anthropic | `"anthropic": "none"` | N/A | T3 desactivado. T2 via OpenAI/Gemini se configurado. |

**Sobre os limites semanais e horários do Claude Max:**
O frugal monitoriza o padrão de uso via `/api/oauth/usage`:
- `five_hour_pct` — percentagem de uso na janela de 5 horas activa
- O backtest detecta, via `session_hour`, se certas horas têm mais misroutes
- **Fim-de-semana:** o `day_of_week` é adicionado ao delta anonimizado → a comunidade aprende que às 22h de sábado o threshold de T3 devia ser mais conservador
- **Madrugada:** o router pode ser configurado para ser mais generoso com T0→T1 quando `session_hour` ∈ [0, 6]

```json
// frugal.config.json (por projecto, opcional)
{
  "time_based_routing": {
    "weekend_mode": "conservative",
    "late_night_hours": [0, 1, 2, 3, 4, 5],
    "late_night_bonus": "promote_t0_to_t1"
  }
}
```

### 3B. OpenAI

| Plano | ID | Comportamento |
|---|---|---|
| GPT Plus | `"openai": "plus"` | GPT-4o disponível como fallback T2 quando Sonnet degraded |
| OpenAI API | `"openai": "api-paid"` | GPT-4o mini como T1 fallback, GPT-4o como T2 fallback |
| Sem OpenAI | `"openai": "none"` | Provider ignorado |

### 3C. Google / Gemini

| Plano | ID | Comportamento |
|---|---|---|
| Gemini API | `"gemini": "api-paid"` | Flash como T1 fallback, Pro como T2 fallback |
| Sem Gemini | `"gemini": "none"` | Provider ignorado |

---

## 4. PLUGINS E SKILLS RECOMENDADAS

### 4A. Claude Code plugins (MCP compatíveis com frugal)

| Plugin | Fonte | O que faz | Compatibilidade frugal | Como instalar |
|---|---|---|---|---|
| **frugal** (este) | `~/.claude/` | Router + statusline + backtest | N/A — é o core | `bash install.sh` |
| **Cloudflare Workers MCP** | Cloudflare | D1, KV, R2 — para frugal-hub v1.1 | ✅ Necessário para hub | MCP registry |
| **Supabase MCP** | Supabase | PostgreSQL — alternativa ao D1 para hub | ✅ Suportado | MCP registry |
| **GitHub MCP** | GitHub | PRs, issues, delta submissions | ✅ Para community workflow | MCP registry |
| **Notion MCP** | Notion | Documentação, roadmap | ✅ Para gestão do projecto | MCP registry |
| **Linear MCP** | Linear | Issues, sprints | ✅ Para gestão do projecto | MCP registry |

### 4B. Skills compatíveis com frugal (para vibe coders)

| Skill | Quando usar | Tier sugerido | Notes |
|---|---|---|---|
| `sync-project` | Sincronizar contexto Cowork↔Claude Code | T1 (Haiku) | Estado do projecto, não código |
| `pptx` | Criar slides de roadmap/pitch | T1-T2 | Geração de documentos |
| `docx` | Documentação técnica | T1-T2 | PRDs, specs |
| `xlsx` | Análise de custos, métricas | T1 | Fórmulas simples → T1 |
| `pdf` | Whitepaper, relatórios | T1-T2 | Depende da complexidade |
| `product-management:feature-spec` | Escrever PRDs das features do frugal | T2 | Raciocínio estruturado |
| `product-management:roadmap-update` | Actualizar ROADMAP.md | T1-T2 | Planeamento |
| `product-management:competitive-analysis` | Análise de concorrentes (LiteLLM, RouteLLM) | T2 | Research |

### 4C. Conectores externos (para o intelligence loop)

| Conector | Propósito no frugal | Stack | Estado |
|---|---|---|---|
| **Cloudflare Workers + D1** | `frugal-hub` — repositório central de deltas | Workers + D1 + R2 | 🟡 v1.1 |
| **Supabase** | Landing waitlist, URL analyser cache | PostgreSQL + REST | ✅ Em produção |
| **Vercel** | Landing page deploy | Next.js 15 | ✅ Em produção |
| **Windows Task Scheduler** | Backtest nocturo (02:00) | Task XML | ✅ Em produção |
| **Webhook → Paulo** | Alertas de anomalias (novos modelos, spikes) | A definir | 🔵 Vision |

---

## 5. CONFIGURAÇÕES RECOMENDADAS POR PERFIL DE UTILIZADOR

### Perfil A: Vibe coder solo, RTX 4090, Claude Max

```json
// ~/.claude/tools/router/subscription-profile.json
{
  "profiles": {
    "anthropic": "max",
    "openai": "none",
    "gemini": "none"
  },
  "budget_strategy": "local-first"
}
```

```bash
# Modelos Ollama a instalar
ollama pull qwen3:30b                    # T0 general (recomendado)
ollama pull qwen2.5-coder:14b-q4         # T0 code specialist
ollama pull deepseek-r1-distill-qwen:14b # T0 reasoning specialist
```

**Resultado esperado:** 85%+ prompts gratuitos localmente. T3 só para arquitectura real.

### Perfil B: Developer solo, Mac M3 Pro 36GB, Claude API pay-per-token

```json
{
  "profiles": { "anthropic": "api-paid", "openai": "none", "gemini": "none" },
  "budget_strategy": "auto"
}
```

```bash
ollama pull qwen2.5-coder:14b-q4
ollama pull deepseek-r1-distill-qwen:14b
```

**Resultado esperado:** budget cap activo. ~70% local, ~25% Sonnet, ~5% Opus.

### Perfil C: Team lead, multiple providers, MacBook + servidor Linux

```json
{
  "profiles": {
    "anthropic": "api-paid",
    "openai": "api-paid",
    "gemini": "api-paid"
  },
  "budget_strategy": "auto",
  "primary_provider": "anthropic",
  "fallback_chain": ["openai", "gemini"]
}
```

**Resultado esperado:** fallback automático quando Sonnet/Anthropic degraded.

### Perfil D: Estudante / CPU only, sem GPU

```json
{
  "profiles": { "anthropic": "api-free", "openai": "none", "gemini": "none" },
  "budget_strategy": "local-first"
}
```

```bash
ollama pull qwen2.5:3b  # único modelo que corre bem em CPU
```

**Resultado esperado:** 60%+ local (mais lento), cap agressivo nos modelos cloud.

---

## 6. COMO MANTER ESTE FICHEIRO ACTUALIZADO

### Responsabilidades

| Fonte | O que actualiza | Frequência |
|---|---|---|
| Paulo (manual) | Novos modelos, pricing, hardware tables | Quando Anthropic/OpenAI lançam algo |
| Community PRs | Hardware configs, feedback de profiles | Contínuo |
| `update-kb.js` (futuro) | Pricing automático via web scraping | Semanal |
| backtest community | Sugestões de novos modelos via delta | Mensal |

### Script de validação

```bash
# Verifica se pricing.js está em sync com KNOWLEDGE_BASE.md
node tools/router/validate-kb.js

# Output esperado:
# ✅ All models in KNOWLEDGE_BASE.md exist in pricing.js
# ✅ All Ollama models have VRAM requirements in gpu-probe.js
# ⚠️  New model detected in community delta: "mistral-small-3.1"
#     → Run: node tools/router/suggest-model.js "mistral-small-3.1"
```

### Como o frugal sugere novos modelos

Quando o backtest recebe deltas da comunidade e detecta `unknown_model` nos campos de provider, gera automaticamente uma sugestão:

```bash
# No stdout do backtest diário
⚠️  Community delta mentions unknown model: "claude-opus-5"
    Suggested action: Update KNOWLEDGE_BASE.md and pricing.js
    Community reports:  12 instances, hw_tier: gpu-high, lang: en
    Estimated tier: T3 (based on naming pattern)
```

Essa sugestão chega ao Paulo via o `privacy-report.js` ou, quando o hub existir, via webhook.

---

*KNOWLEDGE_BASE.md — frugal v0.9.1 — actualizado 2026-04-10*
*Para sugerir alterações: abrir issue ou PR no repositório.*
