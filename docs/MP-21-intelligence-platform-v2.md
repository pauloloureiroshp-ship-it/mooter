# MP-21 — frugal Intelligence Platform v2
## Perfil exclusivo por utilizador · Rich terminal feedback · FAQ commands · Algoritmo de qualidade · Segurança do modelo · Arquitectura viva

**Sessão de referência:** #22 (2026-04-12) — contexto completo em SYNC.md  
**Estado actual do codebase:** v0.9.8, 663 decisões, hub deployed, auto-sync pipeline live  
**Princípio desta sessão:** Cada peça melhora uma dimensão real do produto. Sem cosmética. Sem refactor desnecessário.

---

## DIAGNÓSTICO — O que está incompleto hoje

| Dimensão | Estado actual | Lacuna |
|---|---|---|
| Perfil por utilizador | hw_tier + subscription_profile | Sem mapa routing exclusivo por setup |
| Custo T0 (Ollama) | `$0` fixo | Não conta electricidade/GPU |
| Modelos: latência + qualidade | Só custo em pricing.js | Sem score por categoria de tarefa |
| Terminal por turn | `frugal recommends →` antes do turn | Sem feedback DURANTE e DEPOIS de cada tool call |
| Feedback de qualidade | `followup_pending` existe no log | Não é usado pelo backtest.js para ajustar |
| FAQ slash commands | 11 commands, sem documentação no dashboard | Utilizador não sabe o que cada um faz |
| Segurança do algoritmo | `decisions.log` tem `prompt_preview` em plain text | Exposição de conteúdo sensível |
| Arquitectura viva | ARCHITECTURE.md desactualizado (pré-MP-12) | Não reflecte multi-device, auto-sync, app shell |

---

## PEÇA 1 — model-profile.json: o coração do routing multi-dimensional

### O problema
Hoje o `classify.js` usa só custo para decidir tiers. Um prompt de debug às 23h com latência crítica devia preferir Haiku (T1, rápido) ao Ollama (T0, lento a arrancar). Hoje não há como expressar isso.

### Criar `tools/router/model-profile.json`

Este ficheiro é a fonte de verdade sobre cada modelo. O `classify.js` lê-o na inicialização.

```json
{
  "_version": "1.0.0",
  "_updated": "2026-04-12",
  "_note": "Latência: p50 medido localmente. Qualidade: 0-10 por categoria (estimativa curada). Actualizar após cada major Anthropic release.",

  "models": {
    "claude-opus-4-6": {
      "tier": "T3",
      "provider": "anthropic",
      "cost_input_per_mtok": 15.0,
      "cost_output_per_mtok": 75.0,
      "latency_p50_ms": 4500,
      "latency_p95_ms": 12000,
      "context_window": 200000,
      "quality": {
        "trivial_edit": 9,
        "debug": 10,
        "architecture": 10,
        "summarize": 8,
        "transform": 7,
        "explain": 9,
        "test_gen": 9,
        "math": 10
      },
      "strengths": ["reasoning", "architecture", "long-context", "code"],
      "weaknesses": ["cost", "latency"],
      "notes": "Baseline para savings. Nunca usar para trivial-edit."
    },

    "claude-sonnet-4-6": {
      "tier": "T2",
      "provider": "anthropic",
      "cost_input_per_mtok": 3.0,
      "cost_output_per_mtok": 15.0,
      "latency_p50_ms": 2200,
      "latency_p95_ms": 6000,
      "context_window": 200000,
      "quality": {
        "trivial_edit": 8,
        "debug": 9,
        "architecture": 8,
        "summarize": 9,
        "transform": 9,
        "explain": 9,
        "test_gen": 8,
        "math": 8
      },
      "strengths": ["balance", "speed", "code", "summarize"],
      "weaknesses": [],
      "notes": "Sweet spot para debug e investigação. 5× mais barato que Opus."
    },

    "claude-haiku-4-5": {
      "tier": "T1",
      "provider": "anthropic",
      "cost_input_per_mtok": 0.80,
      "cost_output_per_mtok": 4.0,
      "latency_p50_ms": 800,
      "latency_p95_ms": 2000,
      "context_window": 200000,
      "quality": {
        "trivial_edit": 7,
        "debug": 6,
        "architecture": 4,
        "summarize": 8,
        "transform": 9,
        "explain": 7,
        "test_gen": 6,
        "math": 5
      },
      "strengths": ["speed", "cost", "transform", "summarize"],
      "weaknesses": ["reasoning", "architecture"],
      "notes": "Ideal para transformações e explicações simples. Mais rápido que Ollama frio."
    },

    "qwen3:30b": {
      "tier": "T0",
      "provider": "ollama",
      "cost_input_per_mtok": 0,
      "cost_output_per_mtok": 0,
      "cost_electricity_per_hour_usd": null,
      "latency_p50_ms": 3500,
      "latency_p95_ms": 8000,
      "latency_cold_start_ms": 12000,
      "context_window": 32000,
      "quality": {
        "trivial_edit": 8,
        "debug": 7,
        "architecture": 6,
        "summarize": 8,
        "transform": 8,
        "explain": 7,
        "test_gen": 6,
        "math": 7
      },
      "strengths": ["free", "privacy", "code", "transform"],
      "weaknesses": ["cold_start", "context_window", "architecture"],
      "notes": "Gratuito em API mas consume GPU. cost_electricity_per_hour_usd configurável pelo utilizador."
    },

    "qwen2.5:3b": {
      "tier": "T0",
      "provider": "ollama",
      "cost_input_per_mtok": 0,
      "cost_output_per_mtok": 0,
      "cost_electricity_per_hour_usd": null,
      "latency_p50_ms": 800,
      "latency_p95_ms": 2000,
      "latency_cold_start_ms": 3000,
      "context_window": 8000,
      "quality": {
        "trivial_edit": 7,
        "debug": 5,
        "architecture": 3,
        "summarize": 7,
        "transform": 8,
        "explain": 6,
        "test_gen": 5,
        "math": 4
      },
      "strengths": ["speed", "free", "simple_transform"],
      "weaknesses": ["reasoning", "long_context", "debug"],
      "notes": "Uso apenas para trivial-edit e transform simples. Rápido como Haiku mas gratuito."
    }
  }
}
```

### Integrar em `classify.js`

No topo do `classify.js` (após os requires), adicionar:

```js
// model-profile.json — fonte de verdade multi-dimensional
let MODEL_PROFILES = {};
try {
  MODEL_PROFILES = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'model-profile.json'), 'utf8')
  ).models;
} catch { /* falha silenciosa — usa só custo */ }

// Helper: score do modelo para uma categoria
function modelQuality(modelKey, category) {
  return MODEL_PROFILES[modelKey]?.quality?.[category] ?? 5;
}

// Helper: latência p50 do modelo
function modelLatency(modelKey) {
  return MODEL_PROFILES[modelKey]?.latency_p50_ms ?? 999999;
}
```

### Custo real do T0 (electricidade)

Em `pricing.js`, adicionar suporte a custo de electricidade configurável:

```js
// T0 electricity cost — optional, user-configurable
// Set FRUGAL_T0_ELECTRICITY_COST_USD_PER_HOUR in env or frugal.config.json
// Default: null (treats T0 as truly free)
// Example: RTX 4090 at 300W, €0.15/kWh = 300W × €0.15/1000 = €0.045/h = ~$0.049/h
const T0_ELECTRICITY_COST_PER_HOUR = parseFloat(
  process.env.FRUGAL_T0_ELECTRICITY_COST_USD_PER_HOUR || '0'
);

// For T0 cost estimation:
// avg_t0_duration_hours = latency_p50_ms / 3600000
// t0_electricity_cost = T0_ELECTRICITY_COST_PER_HOUR × avg_t0_duration_hours
```

---

## PEÇA 2 — user-routing-strategy.json: o perfil exclusivo por utilizador

### O que é

Um ficheiro gerado automaticamente pelo `onboarding.js` (e actualizável pelo `setup-profile.js`) que descreve a estratégia de routing óptima para ESTE utilizador com ESTE setup. É o "frugal exclusivo" que mencionaste.

### Criar `tools/router/user-routing-strategy.json` (gerado por `onboarding.js`)

```json
{
  "_version": "1.0.0",
  "_generated_at": "2026-04-12T21:00:00Z",
  "_profile_hash": "a3f8c2...",

  "identity": {
    "hw_tier": "gpu-high",
    "gpu_name": "RTX 4090",
    "gpu_vram_mb": 24576,
    "subscription": "max",
    "has_ollama": true,
    "ollama_best_model": "qwen3:30b",
    "os": "win32",
    "frugal_version": "0.9.8"
  },

  "strategy": {
    "tier_preference_order": ["T0", "T3", "T2", "T1"],
    "rationale": "GPU-high + Max subscription: T0 local é gratuito e de alta qualidade. T3 sem limite de tokens por dia. T1/T2 só se Ollama offline.",

    "t0_eligible_categories": ["trivial_edit", "transform", "summarize", "explain_simple"],
    "t1_eligible_categories": ["explain", "test_gen_simple"],
    "t2_eligible_categories": ["debug", "investigate", "test_gen_complex"],
    "t3_required_categories": ["architecture", "security_audit", "migration", "prod_review"],

    "electricity_cost_usd_per_hour": null,
    "prefer_speed_over_cost": false,
    "max_t0_latency_acceptable_ms": 15000
  },

  "savings_model": {
    "baseline_model": "claude-opus-4-6",
    "t0_real_cost_note": "T0 treats as $0 (GPU paid off). Set electricity cost in env for true cost.",
    "advisory_reliability": "high",
    "option_a_quality_threshold": 0.85
  },

  "routing_overrides": [],

  "last_backtest": {
    "date": "2026-04-12",
    "sample_size": 663,
    "accuracy": 0.952,
    "t0_pct": 0.59,
    "t3_pct": 0.29
  }
}
```

### Lógica de geração em `onboarding.js`

Adicionar função `generateRoutingStrategy(hwCap, subProfile)` que:

1. Determina `tier_preference_order` com base em:
   - `gpu-high + max` → T0 primeiro, T3 disponível
   - `cpu-only + api-paid` → T1 primeiro, T2 para debug, T3 só gate
   - `gpu-mid + api-free` → T0 primeiro, T2/T3 com moderação
   - `apple-silicon + max` → T0 (MLX models) primeiro, T3 disponível

2. Define `t0_eligible_categories` com base na qualidade do melhor modelo T0 disponível (lendo `model-profile.json`)

3. Calcula `advisory_reliability`:
   - `high` se `option_a_hit_rate > 20%` nos últimos 100 decisions
   - `medium` se entre 5-20%
   - `low` se < 5% (Ollama não está a ser usado efectivamente)

### Integrar em `classify.js`

```js
let USER_STRATEGY = null;
try {
  USER_STRATEGY = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'user-routing-strategy.json'), 'utf8')
  );
} catch { /* usa lógica base */ }

// Ao decidir tier, consultar strategy:
function applyUserStrategy(rawTier, category) {
  if (!USER_STRATEGY) return rawTier;
  const { t0_eligible_categories, t3_required_categories } = USER_STRATEGY.strategy;

  if (t3_required_categories?.includes(category) && rawTier !== 'T3') return 'T3';
  if (t0_eligible_categories?.includes(category) && rawTier !== 'T0') {
    // Só promove para T0 se qualidade do modelo T0 for >= threshold para esta categoria
    const t0Model = USER_STRATEGY.identity.ollama_best_model;
    if (modelQuality(t0Model, category) >= 7) return 'T0';
  }
  return rawTier;
}
```

---

## PEÇA 3 — Rich terminal feedback por cada tool call

### O problema
Hoje o utilizador vê:
```
frugal recommends → 🌱 T0 · 🦙 qwen2.5:3b · conf 92%
```
...antes do turn. Depois, nada — até ao Stop hook que mostra o resumo da sessão. Cada Bash call, cada Agent spawn, cada Read — tudo invisível.

### O que construir: `frugal-tool-tracker.js`

Um PostToolUse hook que emite uma linha compacta por cada tool call, mostrando o que aconteceu e o custo estimado incremental.

**Localização:** `~/.claude/hooks/frugal-tool-tracker.js`  
**Registar em:** `~/.claude/settings.json` → `PostToolUse`

```js
#!/usr/bin/env node
/**
 * frugal-tool-tracker.js — PostToolUse hook v1.0
 *
 * Emite uma linha compacta por cada tool call com:
 * - Tool type + emoji
 * - Modelo real (do last-subagent.json se for Agent/Task)
 * - Tokens estimados
 * - Custo incremental
 * - Status (success/error/timeout)
 *
 * Formato: [emoji] [tool] [model-emoji] [tokens] [$cost] [status]
 * Exemplo: 🔧 Bash 🔴 Opus ~1.2k tok +$0.018 ✓
 *          🤖 Agent:reasoner 🟡 Sonnet ~3.4k tok +$0.010 ✓
 *          📖 Read — ~0.3k tok +$0.004 ✓
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const HOOKS_DIR = path.join(os.homedir(), '.claude', 'hooks');

// Silently exit on any error
process.on('uncaughtException', () => process.exit(0));

function safeJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function modelEmoji(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus'))   return '🔴';
  if (m.includes('sonnet')) return '🟡';
  if (m.includes('haiku'))  return '⚡';
  if (m.includes('qwen') || m.includes('ollama')) return '🦙';
  if (m.includes('gemini')) return '💎';
  if (m.includes('gpt'))    return '🟩';
  return '🤖';
}

function toolEmoji(toolName) {
  const t = String(toolName || '').toLowerCase();
  if (t === 'bash')           return '🔧';
  if (t === 'read')           return '📖';
  if (t === 'write')          return '✏️';
  if (t === 'edit')           return '✂️';
  if (t === 'glob')           return '🔍';
  if (t === 'grep')           return '🔎';
  if (t === 'agent' || t === 'task') return '🤖';
  if (t === 'webfetch' || t === 'websearch') return '🌐';
  if (t.startsWith('mcp__')) return '🔌';
  return '⚙️';
}

function estimateTokens(input) {
  // Rough estimate: 1 token ≈ 3.5 chars
  const chars = JSON.stringify(input || '').length;
  return Math.round(chars / 3.5);
}

function fmtTokens(n) {
  if (n >= 1000) return `~${(n/1000).toFixed(1)}k tok`;
  return `~${n} tok`;
}

function fmtCost(usd) {
  if (usd < 0.0001) return '';
  if (usd < 0.01) return `+$${usd.toFixed(4)}`;
  return `+$${usd.toFixed(3)}`;
}

function estimateCost(model, inputTokens) {
  // Prices per MTok
  const PRICES = {
    'opus':   { input: 15.0,  output: 75.0 },
    'sonnet': { input: 3.0,   output: 15.0 },
    'haiku':  { input: 0.80,  output: 4.0  },
    'ollama': { input: 0,     output: 0    },
  };
  const m = String(model || '').toLowerCase();
  const key = m.includes('opus') ? 'opus' :
              m.includes('sonnet') ? 'sonnet' :
              m.includes('haiku') ? 'haiku' : 'ollama';
  const p = PRICES[key];
  // Tool use: mostly input tokens (reading), minimal output
  return (inputTokens / 1_000_000) * p.input + (inputTokens * 0.1 / 1_000_000) * p.output;
}

async function main() {
  // Read hook input from stdin
  let input = '';
  try {
    for await (const chunk of process.stdin) input += chunk;
  } catch { process.exit(0); }

  const event = safeJson(input) || JSON.parse(input || '{}');

  const toolName = event.tool_name || event.toolName || 'unknown';
  const toolInput = event.tool_input || event.toolInput || {};
  const toolResult = event.tool_response || event.toolResponse || '';
  const isError = event.is_error || false;

  // Determine model used
  // For Agent/Task calls, check last-subagent.json (TTL 30s)
  let model = 'claude-opus-4-6'; // default: main session is Opus
  const lastSubagent = safeJson(path.join(HOOKS_DIR, 'last-subagent.json'));
  if (lastSubagent && (Date.now() - (lastSubagent.ts || 0)) < 30000) {
    model = lastSubagent.model || model;
  }
  if (toolName.toLowerCase() === 'bash' || toolName.toLowerCase() === 'read') {
    // These run in main session context
    model = 'claude-opus-4-6';
  }

  // Estimate tokens
  const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
  const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
  const inputTok = estimateTokens(inputStr);
  const outputTok = estimateTokens(resultStr);
  const totalTok = inputTok + outputTok;
  const cost = estimateCost(model, totalTok);

  // Build compact line
  const emoji = toolEmoji(toolName);
  const mEmoji = modelEmoji(model);
  const modelShort = model.includes('opus') ? 'Opus' :
                     model.includes('sonnet') ? 'Sonnet' :
                     model.includes('haiku') ? 'Haiku' : 'Local';
  const status = isError ? '✗' : '✓';
  const costStr = fmtCost(cost);
  const tokStr = fmtTokens(totalTok);

  // Format: emoji tool mEmoji model tokens cost status
  const line = [
    emoji,
    toolName.length > 20 ? toolName.slice(0, 20) + '…' : toolName,
    mEmoji,
    modelShort,
    tokStr,
    costStr,
    status,
  ].filter(Boolean).join(' ');

  // Write to stdout as system message (Claude Code displays it)
  process.stdout.write(line + '\n');

  // Also append to execution.log for session summary
  try {
    const logEntry = JSON.stringify({
      ts: Date.now(),
      event: 'tool_use',
      tool: toolName,
      model,
      input_tokens: inputTok,
      output_tokens: outputTok,
      cost_usd: cost,
      is_error: isError,
    }) + '\n';
    fs.appendFileSync(path.join(HOOKS_DIR, 'execution.log'), logEntry);
  } catch { /* non-fatal */ }
}

main().catch(() => process.exit(0));
```

### Registar em settings.json

Em `~/.claude/settings.json`, no bloco `hooks`, adicionar:

```json
"PostToolUse": [
  {
    "type": "command",
    "command": "node ~/.claude/hooks/frugal-tool-tracker.js",
    "matcher": ".*"
  }
]
```

**Nota:** Se já existe um `PostToolUse` com outro matcher (para `last-subagent.json`), adicionar este como segundo item no array, não substituir.

### Stop hook: actualizar `gsd-turn-end.js` com resumo por sessão

No `gsd-turn-end.js`, após o log do `turn_end` event, adicionar um resumo da sessão lendo o `execution.log`:

```js
// Resumo de tool calls desta sessão
try {
  const execLog = tailLines(EXEC_LOG_PATH, 131072);
  const sessionTools = execLog
    .map(safeJson)
    .filter(e => e && e.event === 'tool_use' && e.ts > sessionStart)
    .reduce((acc, e) => {
      const m = e.model?.includes('opus') ? '🔴' :
                e.model?.includes('sonnet') ? '🟡' :
                e.model?.includes('haiku') ? '⚡' : '🦙';
      acc.models[m] = (acc.models[m] || 0) + 1;
      acc.total_cost += (e.cost_usd || 0);
      acc.total_tokens += (e.input_tokens || 0) + (e.output_tokens || 0);
      return acc;
    }, { models: {}, total_cost: 0, total_tokens: 0 });

  const modelBreakdown = Object.entries(sessionTools.models)
    .map(([emoji, count]) => `${emoji}×${count}`)
    .join(' · ');

  const summaryLine = [
    `frugal turn end →`,
    modelBreakdown,
    `· actual ~$${sessionTools.total_cost.toFixed(2)}`,
    `· saved $${(naiveCost - sessionTools.total_cost).toFixed(2)} vs all-Opus`,
  ].filter(Boolean).join(' ');

  process.stdout.write(summaryLine + '\n');
} catch { /* non-fatal */ }
```

---

## PEÇA 4 — Feedback de qualidade no backtest.js

### O que existe mas não é usado

O `decisions.log` já tem `followup_pending: true` nos `turn_end` events quando o utilizador fez follow-up imediato. O `backtest.js` tem `resolveFeedback()` que lê estes sinais — mas nunca os usa para ajustar thresholds.

### Integrar qualidade no `backtest.js`

Localizar a função `resolveFeedback()` (linha ~73) e o bloco onde se calculam os thresholds. Adicionar:

```js
// Sinais de qualidade por tier
const qualityByTier = { T0: [], T1: [], T2: [], T3: [] };

for (const decision of decisions) {
  if (!decision.feedback_signal) continue;
  const tier = decision.tier;
  if (!qualityByTier[tier]) continue;

  // 1 = satisfeito (accepted), 0 = insatisfeito (followup_immediate)
  const quality = decision.feedback_signal === 'accepted' ? 1 : 0;
  qualityByTier[tier].push(quality);
}

// Taxa de satisfação por tier
const satisfactionByTier = {};
for (const [tier, scores] of Object.entries(qualityByTier)) {
  if (scores.length < 5) continue; // mínimo 5 samples
  satisfactionByTier[tier] = scores.reduce((a, b) => a + b, 0) / scores.length;
}

// Ajuste: se T0 satisfaction < 70%, aumentar threshold para promover menos para T0
if (satisfactionByTier.T0 !== undefined && satisfactionByTier.T0 < 0.70) {
  tuning.complexity_threshold = Math.min(
    (tuning.complexity_threshold || 0.25) + 0.05,
    0.50
  );
  tuning._quality_adjustment = `T0 satisfaction ${(satisfactionByTier.T0 * 100).toFixed(0)}% < 70% — raised threshold`;
}

// Ajuste: se T2 satisfaction < 80% e T3 satisfaction > 90%, considerar promover T2 → T3
if (satisfactionByTier.T2 !== undefined && satisfactionByTier.T2 < 0.80 &&
    satisfactionByTier.T3 !== undefined && satisfactionByTier.T3 > 0.90) {
  tuning._quality_note = 'T2 underperforming vs T3 — consider raising debug threshold';
}
```

### Adicionar ao `router-tuning.json`

```json
{
  "complexity_threshold": 0.27,
  "quality_adjustment": "T0 satisfaction 74% — threshold raised 0.02",
  "satisfaction_by_tier": { "T0": 0.74, "T1": 0.89, "T2": 0.91, "T3": 0.97 },
  "sample_size": 663,
  "generated_at": "2026-04-12T..."
}
```

---

## PEÇA 5 — FAQ / Commands no dashboard

### Criar tab "Commands" no dashboard

Em `landing/app/(app)/dashboard/page.tsx`, adicionar `'Commands'` ao array de tabs e implementar `CommandsTab`:

```tsx
const SLASH_COMMANDS = [
  {
    command: '/frugal-status',
    emoji: '🏥',
    description: 'Health check completo — hook, Ollama, hub, últimas 3 decisões',
    when: 'Quando algo parece errado ou queres confirmar que tudo está activo',
    example: '/frugal-status',
    output: 'Tabela com 8 checks: hook ✓, Ollama ✓, hub ✓, ...',
  },
  {
    command: '/frugal-savings',
    emoji: '💰',
    description: 'Report económico: savings por tier + projecção anual',
    when: 'Para ver quanto poupaste e quanto vais poupar no ano',
    example: '/frugal-savings',
    output: 'T0: 59% · T3: 29% · ~$73.85 saved · proj. $890/ano',
  },
  {
    command: '/frugal-route',
    emoji: '🧭',
    description: 'Classifica uma tarefa antes de a executar',
    when: 'Quando queres saber o tier antes de enviar o prompt',
    example: '/frugal-route redesign the auth system for multi-tenant',
    output: '🏛️ T3 Opus · conf 94% · architectural decision',
  },
  {
    command: '/frugal-summary',
    emoji: '📊',
    description: 'Resumo executivo da sessão: tiers, custo, confidence médio',
    when: 'No fim de uma sessão longa para perceber como correu o routing',
    example: '/frugal-summary',
    output: '23 decisions · 60% T0 · $0.42 spent · 71% saved',
  },
  {
    command: '/frugal-update',
    emoji: '🔄',
    description: 'Corre backtest + update-router para afinar o algoritmo com os teus dados',
    when: 'Após 50+ novas decisões, para melhorar o classifier com dados reais',
    example: '/frugal-update',
    output: 'Treinou 663 samples · accuracy 95.2% · TUNED-BLOCK actualizado',
  },
  {
    command: '/frugal-beast',
    emoji: '🦁',
    description: 'Beast Mode: força T3 (Opus) em tudo — máxima qualidade, custo ignorado',
    when: 'Para sessões críticas onde só importa a melhor resposta possível',
    example: '/frugal-beast',
    output: 'Beast Mode activado — todos os prompts → Opus até /frugal-auto',
  },
  {
    command: '/frugal-zen',
    emoji: '🧘',
    description: 'Zen Mode: cap em T1 (Haiku) — máxima poupança, tarefas simples',
    when: 'Para sessões de edição e transformação onde Opus é desperdício',
    example: '/frugal-zen',
    output: 'Zen Mode activado — cap T1 até /frugal-auto',
  },
  {
    command: '/frugal-auto',
    emoji: '⚡',
    description: 'Volta ao routing inteligente automático (cancela Beast/Zen)',
    when: 'Para sair do Beast ou Zen Mode e deixar o router decidir',
    example: '/frugal-auto',
    output: 'Auto Mode — router inteligente activo',
  },
  {
    command: '/frugal-doctor',
    emoji: '🩺',
    description: 'Diagnóstico completo 10 secções: ficheiros, hooks, classifier, providers, pipeline',
    when: 'Troubleshooting completo — equivalente a frugal-doctor.js no terminal',
    example: '/frugal-doctor',
    output: '10 secções · 24/25 checks ✓ · 2 warnings',
  },
  {
    command: '/frugal-dashboard',
    emoji: '🖥️',
    description: 'Abre o dashboard local em localhost:7820 no browser',
    when: 'Para aceder ao dashboard sem abrir o browser manualmente',
    example: '/frugal-dashboard',
    output: 'Server started on :7820 · Browser opening...',
  },
  {
    command: '/frugal-hello',
    emoji: '👋',
    description: 'Onboarding guiado — configura o frugal pela primeira vez',
    when: 'Na primeira instalação ou para re-configurar o perfil',
    example: '/frugal-hello',
    output: 'Wizard interactivo: hardware → subscription → Ollama → smoke test',
  },
];

function CommandsTab() {
  const [search, setSearch] = useState('');
  const filtered = SLASH_COMMANDS.filter(c =>
    !search || c.command.includes(search) || c.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>Slash Commands</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>
          {SLASH_COMMANDS.length} commands disponíveis. Usa directamente no terminal do Claude Code.
        </p>
        <input
          placeholder="Search commands..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 6,
            color: 'inherit', fontSize: '0.85rem', outline: 'none',
          }}
        />
      </div>

      {/* How routing personalises for you */}
      <div style={{
        background: 'color-mix(in srgb, var(--t0) 8%, var(--surface))',
        border: '1px solid color-mix(in srgb, var(--t0) 30%, var(--border))',
        borderRadius: 8, padding: '1rem', marginBottom: '1.5rem',
      }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 6 }}>
          ⚡ Como o frugal personaliza o teu routing
        </h3>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
          O frugal lê o teu hardware (<code>hw-capability.json</code>), subscrições
          (<code>subscription-profile.json</code>), e histórico de decisões (<code>decisions.log</code>)
          para gerar uma estratégia de routing exclusiva. Uma RTX 4090 com Claude Max usa T0 local
          como default e T3 sem restrições. Uma máquina CPU-only com API free usa T1 como default
          e raramente chega a T3. Usa <code>/frugal-update</code> após 50+ sessões para afinar o
          algoritmo com os teus padrões reais.
        </p>
      </div>

      {/* Commands grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(cmd => (
          <div key={cmd.command} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: '1.1rem' }}>{cmd.emoji}</span>
              <code style={{
                fontSize: '0.85rem', fontWeight: 700,
                color: 'var(--t0, #4ec9b0)', background: 'var(--surface-2)',
                padding: '1px 8px', borderRadius: 4,
              }}>{cmd.command}</code>
            </div>
            <p style={{ fontSize: '0.82rem', margin: '0 0 6px', lineHeight: 1.5 }}>
              {cmd.description}
            </p>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>📌 <em>Quando usar:</em> {cmd.when}</span>
              <span>💬 <em>Exemplo:</em> <code>{cmd.example}</code></span>
              <span>📤 <em>Output:</em> {cmd.output}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## PEÇA 6 — Segurança: sanitização do decisions.log

### O problema
`decisions.log` contém `prompt_preview` — os primeiros ~100 chars de cada prompt. Em produção, estes previews podem conter: nomes de ficheiros, fragmentos de código proprietário, contexto de projectos confidenciais. Numa auditoria success-fee, qualquer acesso externo ao `decisions.log` expõe este conteúdo.

### Criar `tools/router/sanitize-log.js`

```js
#!/usr/bin/env node
/**
 * sanitize-log.js — redige prompt_preview em decisions.log após N dias
 *
 * Substitui prompt_preview por SHA256(prompt_preview).slice(0,16)
 * para manter deduplicação sem expor conteúdo.
 *
 * Corre: node sanitize-log.js [--days=30] [--dry-run]
 *
 * Ideal para cron semanal:
 *   (crontab -l; echo "0 3 * * 0 node ~/.claude/tools/router/sanitize-log.js --days=30") | crontab -
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const DAYS = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '30', 10);
const DRY_RUN = process.argv.includes('--dry-run');

const cutoff = Date.now() - DAYS * 86400000;

const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
let redacted = 0;

const out = lines.map(line => {
  try {
    const entry = JSON.parse(line);
    if (entry.ts_ms && entry.ts_ms < cutoff && entry.prompt_preview) {
      entry.prompt_preview = '[redacted:' +
        crypto.createHash('sha256').update(entry.prompt_preview).digest('hex').slice(0, 16) +
        ']';
      redacted++;
      return JSON.stringify(entry);
    }
  } catch { /* keep raw */ }
  return line;
});

if (!DRY_RUN) {
  // Backup antes de escrever
  fs.copyFileSync(LOG_PATH, LOG_PATH + '.bak');
  fs.writeFileSync(LOG_PATH, out.join('\n') + '\n');
}

console.log(`sanitize-log: ${redacted} entries redacted (older than ${DAYS} days)${DRY_RUN ? ' [dry-run]' : ''}`);
```

### Adicionar ao `frugal-doctor.js` — check de sanitização

Na secção 6 (Data Pipeline), adicionar:

```js
// Check sanitization age
const logLines = tailLines(decisionsLog, 65536);
const oldUnsanitized = logLines
  .map(safeJson)
  .filter(e => e?.prompt_preview && !e.prompt_preview.startsWith('[redacted:') && e.ts_ms < Date.now() - 30 * 86400000)
  .length;

row(oldUnsanitized === 0 ? TICK : WARN,
  'Log sanitization',
  oldUnsanitized === 0 ? 'clean' : `${oldUnsanitized} entries with raw prompts > 30 days`,
  oldUnsanitized > 0 ? 'Run: node ~/.claude/tools/router/sanitize-log.js --days=30' : null);
```

---

## PEÇA 7 — Arquitectura viva: actualizar ARCHITECTURE.md + diagrama

### O problema
O `ARCHITECTURE.md` e `architecture-diagram.html` foram criados na sessão #16 (pre-MP-12). Não reflectem: multi-device, app shell com sidebar, auto-sync pipeline, decisions_log, hub D1 com savings_usd, model-profile.json, user-routing-strategy.json.

### O que fazer

**7a. Actualizar `ARCHITECTURE.md` — secções afectadas**

Localizar as secções que descrevem o fluxo de dados e adicionar/actualizar:

```
## Fluxo de dados actualizado (v0.9.8+)

Turn Claude Code
  → inject_context.js (classifica + injeta router-hint)
  → frugal-turn-header.js (emite turn header no terminal)
  → [tool calls]
  → frugal-tool-tracker.js (PostToolUse — linha por tool call)
  → gsd-turn-end.js (Stop — resumo sessão + spawn auto-sync)
    → auto-sync.js (fire-and-forget → POST /api/install-complete)
      → profiles (upsert)
      → devices (upsert)
      → decisions_log (INSERT snapshot)
  → [02:00 daily] backtest.js
    → user-routing-strategy.json (actualiza strategy)
    → router-tuning.json (TUNED-BLOCK)
    → hub-push.js → POST /api/delta (frugal-hub D1)
      → GET /api/stats → landing page counters

## Ficheiros por camada

Local (nunca sobem ao GitHub):
  decisions.log, hw-capability.json, router-tuning.json,
  user-routing-strategy.json, subscription-profile.json,
  model-profile.json (read-only, committed)

Supabase (por utilizador, RLS):
  profiles, devices, decisions_log

frugal-hub D1 (agregado anónimo):
  deltas (savings_usd, profile_hash, tier_distribution)

Landing Vercel:
  dashboard (área logada), /methodology (pública)
```

**7b. Actualizar `architecture-diagram.html`**

O diagrama tem 10 tabs. Actualizar as tabs afectadas:
- Tab "Data Flow": adicionar `auto-sync.js`, `decisions_log`, `model-profile.json`
- Tab "Per-User Profile": nova tab com o diagrama do perfil exclusivo
- Tab "Security": adicionar `sanitize-log.js` e política de redacção

---

## PEÇA 8 — frugal-doctor: check de versões e integridade do modelo

Adicionar uma nova secção 11 ao `frugal-doctor.js`:

```
11. Model Intelligence
──────────────────────────────────────────────────
✓  model-profile.json       5 models mapped (T0×2, T1×1, T2×1, T3×1)
✓  user-routing-strategy    generated 2026-04-12, hw:gpu-high, sub:max
✓  Strategy: T0→T3→T2→T1   RTX 4090 + Max — T0 first, T3 unlimited
⚠  T0 satisfaction rate     74% (target: 80%) — consider /frugal-update
✓  Sanitization             log clean (oldest < 30 days)
○  Electricity cost T0      not configured (treating as $0)
   → Set FRUGAL_T0_ELECTRICITY_COST_USD_PER_HOUR for true T0 cost
```

---

## ORDEM DE EXECUÇÃO

```
PEÇA 1  — model-profile.json + pricing.js electricity cost
  ↓
PEÇA 2  — user-routing-strategy.json + onboarding.js generate + classify.js integrate
  ↓
PEÇA 4  — backtest.js quality signals (followup_pending)
  ↓
PEÇA 3  — frugal-tool-tracker.js + gsd-turn-end.js session summary
  ↓
PEÇA 5  — Commands tab no dashboard
  ↓
PEÇA 6  — sanitize-log.js + frugal-doctor check
  ↓
PEÇA 7  — ARCHITECTURE.md update + architecture-diagram.html
  ↓
PEÇA 8  — frugal-doctor secção 11
```

---

## TESTES A CORRER NO FINAL

```bash
# 1. Verificar model-profile.json e user-routing-strategy.json gerados
node tools/router/onboarding.js --force
cat ~/.claude/tools/router/user-routing-strategy.json | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.strategy.tier_preference_order, d.identity.hw_tier)"

# 2. Verificar routing com nova strategy
node tools/router/classify.js "debug this stack trace" --debug
# Esperado: T2 (não T0)

# 3. Testar tool tracker
# Abrir sessão Claude Code, fazer 3 tool calls, verificar linhas no terminal

# 4. Backtest com quality signals
node tools/router/backtest.js
cat ~/.claude/tools/router/router-tuning.json | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log(d.satisfaction_by_tier)"

# 5. Sanitize dry-run
node tools/router/sanitize-log.js --days=30 --dry-run
# Esperado: N entries redacted (dry-run)

# 6. TypeScript check
cd landing && npx tsc --noEmit

# 7. Full doctor check
node tools/router/frugal-doctor.js
# Esperado: secção 11 ✓, log sanitization ✓

# 8. Sync
node tools/router/frugal-doctor.js --sync
```

---

## COMMIT SUGERIDO

```
feat(intelligence): model profiles + user strategy + rich terminal + quality feedback + commands FAQ + log sanitization (MP-21)
```

---

## RESTRIÇÕES ABSOLUTAS

1. **model-profile.json é read-only no repo** — committed, mas `user-routing-strategy.json` é gitignored (contém dados do utilizador)
2. **frugal-tool-tracker.js é SEMPRE fire-and-forget** — stdout write é o mecanismo; nunca bloquear
3. **sanitize-log.js faz backup antes de escrever** — `decisions.log.bak` — nunca overwrite sem backup
4. **quality signals no backtest só activam com ≥5 samples por tier** — sem ajustes com dados insuficientes
5. **applyUserStrategy() nunca desce um tier abaixo do mínimo de segurança** — T3-gate prompts nunca são demovidos, mesmo com user strategy
6. **electricity cost é $0 por default** — opt-in, não opt-out
7. **Não publicar VSCode no marketplace nesta sessão** — L7 mantém-se pendente
8. **architecture-diagram.html: actualizar tabs existentes, não reescrever do zero** — é 66KB de trabalho valioso
