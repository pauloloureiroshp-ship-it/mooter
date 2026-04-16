# INTELLIGENCE_V3_MASTER_PROMPT.md
# Frugal — Specialist Router + Empirical Quality Matrix + Feedback Loop
# Versão: 1.0 | Data: 2026-04-13
# Para o Claude Code executar APÓS concluir MODEL_ROUTING_V2_MASTER_PROMPT.md

> **LEIA ANTES DE COMEÇAR:**
>
> Este master prompt transforma o frugal de **cost router** (poupa tokens) em **specialist router** (escolhe o melhor modelo para cada tipo de prompt, dentro do budget).
>
> **Pré-requisito:** MODEL_ROUTING_V2 deve estar concluído. Se não estiver, executa esse primeiro.
>
> **Regra crítica de ordem:** Phase 2 (feedback loop) vem ANTES de Phase 3 (inteligência). Sem feedback, estamos a adivinhar.
>
> **Tempo estimado total:** 4-6 sessões de Claude Code. Não tentes fazer tudo num turn.

---

## FILOSOFIA

O frugal actual decide por **tier**:
```
prompt → regex classifier → T0/T1/T2/T3 → modelo fixo
```

O frugal v3 decide por **especialidade**:
```
prompt → vector (categoria + complexidade + contexto + linguagem + latência)
       × budget cap
       × hardware disponível
       × subscriptions do utilizador
       → melhor especialista disponível
       → executa
       → colhe feedback silencioso
       → envia delta para hub
       → hub agrega
       → periodicamente, gera novo model-profile.json
       → release
```

**Insight chave:** o preço **não é proxy de qualidade**. Deepseek-v3:7b local pode bater Opus em matemática. Gemma3:12b pode bater Sonnet em tradução multilingue. O router tem de saber isto — com dados, não intuição.

---

## PHASE 1 — QUALITY MATRIX EMPÍRICO (2-3h)

**Objectivo:** substituir as estimativas curadas em `model-profile.json` por scores derivados de benchmarks públicos. Não inventamos números — citamos fontes.

### P1-A: Research por modelo

Para cada modelo no catálogo, faz WebSearch + WebFetch em fontes canónicas:

**Fontes de referência (por ordem de prioridade):**
1. **LMSYS Chatbot Arena** — https://lmarena.ai/ — rating ELO global + por categoria
2. **Hugging Face Open LLM Leaderboard** — benchmarks padronizados (MMLU, GSM8K, HumanEval, TruthfulQA, etc.)
3. **Artificial Analysis** — https://artificialanalysis.ai/ — latência + custo + qualidade por provider
4. **Papers do provider** — model card oficial (Anthropic, Google, Meta, DeepSeek, etc.)
5. **Reddit r/LocalLLaMA** — feedback qualitativo de utilizadores reais (útil para Ollama)

**Modelos a pesquisar (em paralelo, um WebSearch por modelo):**
- claude-opus-4-6
- claude-sonnet-4-6
- claude-haiku-4-5
- qwen3:30b
- qwen2.5:3b
- gemma3:12b
- deepseek-v3:7b
- (se instalados) outros modelos Ollama detectados via `ollama list`
- gpt-4o-mini (referência, se T4 for activado depois)
- gemini-2.0-flash (referência)

### P1-B: Dimensões de qualidade a preencher

Actualiza `quality` no `model-profile.json` para todos os modelos, com estas 10 dimensões (0-10, baseadas em benchmarks):

```json
"quality": {
  "code_generation":    0-10,   // HumanEval, MBPP
  "code_debugging":     0-10,   // derived from SWE-bench, BigCodeBench
  "math_reasoning":     0-10,   // GSM8K, MATH, AIME
  "factual_knowledge":  0-10,   // MMLU, TruthfulQA
  "long_context":       0-10,   // NIAH, RULER (capacidade de context window útil)
  "creative_writing":   0-10,   // Arena Writing category
  "instruction_follow": 0-10,   // IFEval, MT-Bench
  "summarization":      0-10,   // DSumm, XSum
  "translation":        0-10,   // Flores (multilingue), WMT
  "tool_use":           0-10    // Berkeley Function Calling Leaderboard (BFCL)
}
```

Adiciona também:
```json
"benchmark_sources": [
  { "name": "MMLU", "score": 88.5, "source_url": "..." },
  { "name": "HumanEval", "score": 84.1, "source_url": "..." }
]
```

### P1-C: Especialidades declaradas

Adiciona a cada modelo um campo `"specialist_in"` com 1-3 áreas onde ele bate o preço acima dele:

```json
"deepseek-v3:7b": {
  "specialist_in": ["code_generation", "math_reasoning"],
  "notes": "Bate Haiku em HumanEval (82 vs 76) e GSM8K (91 vs 84) — preferir para coding local."
}
```

### Gate P1 ✅

```bash
# Quality matrix preenchido para TODOS os modelos
node -e "const p=require('./tools/router/model-profile.json'); Object.entries(p.models).forEach(([k,v])=>console.log(k, Object.keys(v.quality).length, 'dims', v.specialist_in?.length||0, 'specs'))"

# Esperado: 10 dims por modelo, 1-3 especialidades
```

---

## PHASE 2 — FEEDBACK LOOP (2-3h) — PRIORIDADE MÁXIMA

**Objectivo:** capturar sinais de qualidade de cada resposta do frugal, silenciosamente, sem atrito para o utilizador.

### P2-A: Sinais implícitos (zero atrito)

Adiciona ao `feedback-collector.js` (já existe em v0.9.9 mas está vazio) a captura destes sinais por turn:

**Sinais positivos (output foi bom):**
- User não re-perguntou a mesma coisa nos próximos 3 turns
- User não mudou de modelo manualmente (via `/frugal-beast` ou similar)
- User aceitou uma Edit/Write sem reverter
- Tempo entre a resposta e o próximo prompt > 30s (leu/aplicou)

**Sinais negativos (output foi mau):**
- User re-perguntou nos próximos 2 turns (retry rate)
- User escalou de tier (pediu Opus explicitamente após T1)
- User reverteu uma Edit
- User escreveu "não era isso", "errado", "tenta outra vez", etc.

**Estrutura do registo (`~/.claude/tools/router/feedback.log`):**
```json
{
  "ts": "2026-04-14T10:30:00Z",
  "session_id": "abc123",
  "turn_id": "t42",
  "prompt_hash": "sha256:...",
  "category": "code_debugging",          // da vectorização (P3)
  "complexity": "moderate",
  "tier": "T2",
  "model_used": "claude-sonnet-4-6",
  "implicit_score": 0.85,                 // 0-1, calculado dos sinais
  "explicit_score": null,                 // 1-5 se user der feedback
  "retry": false,
  "escalated": false,
  "reverted": false,
  "latency_ms": 2340
}
```

### P2-B: Sinais explícitos (opt-in, uma tecla)

Adiciona um hook `PostToolUse` ou similar que detecta após cada resposta grande se o utilizador premir `F9` (ou outro atalho) para dar feedback rápido:

```
[frugal] Foi boa a resposta? [y/n/skip]
```

Guarda em `feedback.log` com `explicit_score`. Desligado por default — utilizador activa com `/frugal-feedback on`.

### P2-C: Pipeline hub-push para feedback

Estende `hub-push.js` (já existe) para enviar batch de feedback a cada N turns (N=20) para o Cloudflare Worker:

**Novo endpoint no Worker (`hub/src/index.ts`):**
```
POST /api/feedback
Body: { deltas: [{...feedback entries sem PII...}] }
```

**Privacidade — nunca enviar:**
- `prompt_hash` (já é hash, OK)
- conteúdo do prompt
- conteúdo da resposta
- paths de ficheiros
- nomes de utilizador

**Enviar (anónimo):**
- category, complexity, tier, model_used
- implicit_score, explicit_score (se houver)
- retry, escalated, reverted
- latency_ms
- hw_tier (GPU category, não nome exacto)

### P2-D: Schema D1 para feedback agregado

No Worker, adiciona tabela:
```sql
CREATE TABLE IF NOT EXISTS feedback_aggregated (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name TEXT NOT NULL,
  category TEXT NOT NULL,
  complexity TEXT NOT NULL,
  week_of TEXT NOT NULL,               -- YYYY-WW
  count INTEGER DEFAULT 0,
  avg_implicit_score REAL,
  avg_explicit_score REAL,
  retry_rate REAL,
  escalation_rate REAL,
  revert_rate REAL,
  avg_latency_ms REAL,
  UNIQUE(model_name, category, complexity, week_of)
);
```

Agregação via cron semanal (já existem crons no Worker).

### Gate P2 ✅

```bash
# 1. Gera turns de teste e confirma que feedback.log é escrito
# 2. Verifica hub-push envia feedback a cada 20 turns
# 3. Query ao Worker confirma que feedback_aggregated tem linhas
npx wrangler d1 execute frugal-hub --command "SELECT COUNT(*) FROM feedback_aggregated"
```

---

## PHASE 3 — PROMPT VECTORIZATION (3-4h)

**Objectivo:** transformar cada prompt num vector estruturado antes de escolher o modelo. Híbrido (regex + LLM local) para manter latência baixa.

### P3-A: Schema do vector

Cada prompt gera este objecto:
```json
{
  "category":    "code_generation",      // uma de 10 categorias
  "complexity":  "moderate",              // trivial | moderate | complex
  "context_need": "small",                // small (<4k) | medium (4-32k) | large (>32k)
  "language":    "pt",                    // pt | en | multilingual | code_only
  "latency_sensitive": false,             // true se prompt sugere urgência
  "tool_use_likely": true,                // true se prompt implica Read/Edit/Grep
  "creative":    false                    // true se é criativo, não factual
}
```

**Categorias (10, alinhadas com quality dimensions):**
- `code_generation` — escrever código novo
- `code_debugging` — encontrar/corrigir bugs
- `math_reasoning` — matemática, lógica, cálculos
- `factual_knowledge` — perguntas factuais (QA)
- `long_context` — tarefas que requerem ler muito
- `creative_writing` — texto criativo, marketing, ficção
- `instruction_follow` — seguir instruções estruturadas
- `summarization` — resumir, extrair
- `translation` — traduzir
- `tool_use` — chamar ferramentas (Read/Edit/Bash)

### P3-B: Vectorizer híbrido

**Step 1 — regex-first (50ms, 80% dos casos):**

Estende `classify.js` / `patterns.js` para extrair categoria + complexidade sempre que possível por regex. Casos óbvios:
- "fix the bug in X.ts" → `code_debugging`, `moderate`
- "muda a cor do botão" → `code_generation`, `trivial`
- "qual é a capital de França?" → `factual_knowledge`, `trivial`
- "write a poem about X" → `creative_writing`, `moderate`

**Step 2 — LLM fallback (300ms, 20% dos casos):**

Quando o regex não tem confiança (< 0.7), chama `qwen2.5:3b` local com prompt estruturado:

```js
// tools/router/vectorize-prompt.js
const VECTORIZE_PROMPT = `
Classify this prompt into a JSON object. Output ONLY the JSON, no other text.

Prompt: "${userPrompt}"

Schema:
{
  "category": "code_generation|code_debugging|math_reasoning|factual_knowledge|long_context|creative_writing|instruction_follow|summarization|translation|tool_use",
  "complexity": "trivial|moderate|complex",
  "context_need": "small|medium|large",
  "language": "pt|en|multilingual|code_only",
  "latency_sensitive": true|false,
  "tool_use_likely": true|false,
  "creative": true|false
}
`;
```

Cache resultado em `.vectorize-cache.json` (SHA256 do prompt → vector, TTL 7 dias).

### P3-C: Emitir vector no router-hint

Actualiza `inject_context.js` para incluir o vector no hint:

```
<router-hint>
tier: T2
model: claude-sonnet-4-6
agent: model-reasoner
confidence: 0.89
vector:
  category: code_debugging
  complexity: moderate
  context_need: medium
  language: en
  tool_use_likely: true
reason: code_debugging × moderate × budget_ok → sonnet specialist in debugging
</router-hint>
```

### Gate P3 ✅

```bash
# Teste de vectorização
node ~/.claude/tools/router/vectorize-prompt.js "fix the regex in classify.js that fails on multiline prompts"
# Esperado: {"category":"code_debugging","complexity":"moderate",...}

# Latência
time node ~/.claude/tools/router/vectorize-prompt.js "simple test"
# Esperado: < 500ms (regex hit) ou < 1500ms (LLM fallback)
```

---

## PHASE 4 — SPECIALIST SELECTOR (2-3h)

**Objectivo:** substituir o `TIER_MODEL_MAP` fixo por selecção inteligente com base no vector + budget + hw + subscriptions.

### P4-A: Algoritmo de selecção

Novo ficheiro: `tools/router/specialist-selector.js`

```js
/**
 * Dado um prompt vector, retorna o melhor modelo disponível.
 *
 * Pipeline:
 * 1. Filtrar modelos disponíveis (hw + subscriptions + budget)
 * 2. Para cada modelo, calcular score = quality[vector.category] ajustado por:
 *    - complexity: boost para modelos fortes se complex, penalizar se trivial
 *    - context_need: eliminar modelos com context window insuficiente
 *    - latency_sensitive: boost para modelos rápidos
 *    - language: boost para modelos multilingue se vector.language != 'en'
 * 3. Aplicar budget cap (se restante < X%, forçar T0/T1)
 * 4. Retornar o top-1 com fallback chain
 */
function selectSpecialist(vector, options) {
  const { modelProfile, hwCapability, subscriptions, budget } = options;
  const available = filterAvailable(modelProfile.models, hwCapability, subscriptions);

  // Score each available model
  const ranked = Object.entries(available).map(([name, model]) => {
    const baseScore = model.quality[vector.category] || 0;
    const complexityBoost = adjustForComplexity(baseScore, vector.complexity, model);
    const contextOk = model.context_window >= contextRequired(vector.context_need);
    const langBoost = vector.language !== 'en' && model.multilingual ? 1 : 0;
    const latencyPenalty = vector.latency_sensitive ? -(model.latency_p50_ms / 1000) : 0;

    return {
      name,
      model,
      score: contextOk ? complexityBoost + langBoost + latencyPenalty : -Infinity,
      cost: costPerPrompt(model, vector),
    };
  }).sort((a, b) => b.score - a.score);

  // Apply budget cap
  const capped = applyBudgetCap(ranked, budget);

  return {
    primary: capped[0],
    fallback: capped.slice(1, 3),
    reason: explainChoice(capped[0], vector),
  };
}
```

### P4-B: Integrar no inject_context.js

Substitui `applyBudgetCap(tier, budget)` por:
```js
const vector = vectorize(prompt);
const selection = selectSpecialist(vector, { modelProfile, hwCapability, subscriptions, budget });
const routerHint = buildHint(selection, vector);
```

### P4-C: Respeitar subscriptions explicitamente

`subscription-profile.json` deve ter:
```json
{
  "profiles": {
    "anthropic": "max",           // max | pro | api-pay | api-free
    "openai": "api-pay",           // api-pay | none
    "gemini": "api-free"           // api-free | api-pay | none
  },
  "monthly_budget_usd": 50,
  "preferences": {
    "prefer_local_for": ["summarization", "translation"],
    "never_use": ["gpt-4"]         // blacklist explícita
  }
}
```

O selector respeita estas preferências como hard constraints.

### Gate P4 ✅

```bash
# Teste de selecção
node -e "
  const s = require('./tools/router/specialist-selector.js');
  const result = s.selectSpecialist(
    { category: 'math_reasoning', complexity: 'complex', context_need: 'small', language: 'en', latency_sensitive: false },
    { modelProfile: require('./tools/router/model-profile.json'), hwCapability: require(require('os').homedir()+'/.claude/tools/router/hw-capability.json'), subscriptions: {}, budget: { five_hour: 20 } }
  );
  console.log(result);
"
# Esperado: modelo forte em math (deepseek ou opus), com fallback chain
```

---

## PHASE 5 — HUB AGGREGATION + RETRAIN (2h)

**Objectivo:** transformar feedback individual em melhorias de `model-profile.json` release após release.

### P5-A: Agregação semanal no Worker

Cron semanal (`0 6 * * 1` já existe):
```js
// hub/src/crons/aggregate-feedback.ts
async function aggregateFeedback(env) {
  const weekOf = currentISOWeek();
  // Agrega feedback.log deltas da semana em feedback_aggregated
  await env.DB.prepare(`
    INSERT INTO feedback_aggregated (model_name, category, complexity, week_of, count, avg_implicit_score, ...)
    SELECT model_used, category, complexity, ?, COUNT(*), AVG(implicit_score), ...
    FROM feedback_raw
    WHERE week_of = ?
    GROUP BY model_used, category, complexity
    ON CONFLICT DO UPDATE SET count = count + EXCLUDED.count, ...
  `).bind(weekOf, weekOf).run();
}
```

### P5-B: Endpoint para export do quality matrix actualizado

```
GET /api/model-profile-suggestion
→ Retorna um model-profile.json proposto com base no feedback_aggregated das últimas 4 semanas
```

Algoritmo: quality[category] = 0.7 × score_actual + 0.3 × signal_do_feedback (implicit_score mediano × 10).

### P5-C: Comando `/frugal-retrain` (local, opt-in)

```bash
node ~/.claude/tools/router/retrain.js --dry-run
# Faz GET ao hub, compara com model-profile.json local, mostra diff
# Se --apply: escreve novo model-profile.json, versiona com git tag
```

### P5-D: Release automation

Quando a diferença entre o model-profile.json do hub e o local for > threshold (ex: 0.5 pontos em qualquer dimensão), o frugal-doctor avisa:
```
💡 Nova calibração de modelos disponível.
   Dados de 247 sessões anónimas sugerem ajustes para gemma3:12b e deepseek-v3:7b.
   Corre `/frugal-retrain --apply` para actualizar.
```

### Gate P5 ✅

```bash
# Query D1
npx wrangler d1 execute frugal-hub --command "SELECT model_name, category, count FROM feedback_aggregated ORDER BY count DESC LIMIT 10"

# Teste retrain dry-run
node ~/.claude/tools/router/retrain.js --dry-run
```

---

## EXECUTION STRATEGY

**NÃO executes tudo numa sessão.** Este é um sprint multi-turn. Sugestão:

| Sessão | Fase | Duração | Output |
|---|---|---|---|
| 1 | P1 (research) | 2-3h | model-profile.json v2.0 com scores empíricos |
| 2 | P2-A/B (feedback local) | 2h | feedback-collector funcional, feedback.log a gerar dados |
| 3 | P2-C/D (hub) | 2h | Worker com endpoint + D1 schema + hub-push estendido |
| 4 | P3 (vectorization) | 3h | vectorize-prompt.js + cache + integration no inject_context |
| 5 | P4 (selector) | 2h | specialist-selector.js + subscription-profile enriquecido |
| 6 | P5 (retrain) | 2h | cron de agregação + /frugal-retrain + doctor integration |

**No final de cada sessão:** commit + update SYNC.md + página Notion.

---

## SAFETY GATES (resumo)

| Gate | Critério mínimo para avançar |
|---|---|
| P1 | 10 dimensões preenchidas para todos os modelos, cada uma com source citation |
| P2 | feedback.log a receber entries reais; hub recebe e agrega; zero PII no payload |
| P3 | vectorizer < 500ms p50 no regex path, < 1500ms p95 no LLM fallback |
| P4 | selector retorna modelo consistente com vector em 170 prompts de teste |
| P5 | retrain --dry-run mostra diff legível; apply cria git tag |

---

## O QUE NÃO FAZER

- **Não** saltar P2. Sem feedback, P3/P4/P5 são ficção científica.
- **Não** enviar PII ao hub. Qualquer campo que tenha conteúdo de prompt ou resposta → nunca sair da máquina.
- **Não** usar embeddings caros. O vectorizer é regex + LLM local, ponto.
- **Não** remover o fallback por tier do frugal actual — o v3 corre ao lado, com fallback para v2 em caso de erro.
- **Não** tocar em `landing/` ou `dashboard/` — scope é `tools/router/` + `hub/` + `agents/`.
- **Não** fazer `git add -A`. Commits selectivos por fase.

---

## SUCCESS METRICS (como saberemos se funcionou)

Após 4 semanas de v3 em Friends Beta com ≥ 3 utilizadores:

| Métrica | Baseline (v2) | Target (v3) |
|---|---|---|
| Accuracy routing (vs gold labels) | 100% (170 prompts) | ≥ 95% (500 prompts diversos) |
| Implicit satisfaction score | N/A | ≥ 0.75 médio |
| Retry rate | N/A | ≤ 10% |
| Escalation rate (user força tier up) | N/A | ≤ 5% |
| Savings % | 89.9% | ≥ 85% (pode baixar um pouco se selector decide subir qualidade) |
| Latência p50 hook | < 50ms (regex) | < 100ms (regex) / < 700ms (LLM vectorize) |

Se retry rate > 15% ou satisfaction < 0.6 em qualquer categoria → rollback para v2 nessa categoria, investigar.

---

## REFERÊNCIA — FLUXO COMPLETO v3

```
1. Utilizador submete prompt
2. UserPromptSubmit hook dispara
3. inject_context.js:
   a. Cache check (vectorize + classify)
   b. Se miss: vectorize-prompt.js
      - Regex first (50ms)
      - Fallback qwen2.5:3b (300-500ms)
      - Escreve cache
   c. selectSpecialist(vector, budget, hw, subs)
   d. Emite <router-hint> com vector + modelo + fallback chain
4. Claude Code lê hint, executa
5. Após resposta:
   a. PostToolUse hook captura sinais implícitos
   b. Escreve feedback.log local
   c. A cada 20 turns: hub-push envia batch anónimo
6. Worker:
   a. Recebe deltas em feedback_raw
   b. Cron semanal agrega em feedback_aggregated
7. Utilizador corre /frugal-retrain periodicamente
   → GET /api/model-profile-suggestion
   → Diff com local, apply se aceitar
8. git tag → nova versão calibrada → release
```

---

**Fim do master prompt. Total estimado: 6 sessões × 2-3h = 12-18h de trabalho. Entregável final: frugal v1.0 — specialist router com feedback loop e federated retrain.**
