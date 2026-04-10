# INTELLIGENCE_LOOP_MASTER_PROMPT.md
# frugal — Community Intelligence Loop & frugal-hub v1.1
# Master Prompt para Claude Code

> **Contexto**: O frugal já tem telemetria local (decisions.log JSONL), backtest com export de deltas anonimizados, e gpu-probe com hw-capability. Agora precisamos de fechar o loop comunitário: os deltas de todos os utilizadores agregam num hub central, retroalimentam o classificador, notificam Paulo de anomalias e novos modelos, e garantem que cada novo utilizador chega com a melhor experiência possível.

---

## OBJETIVO DESTA SESSÃO

Implementar a **Community Intelligence Loop** — a pipeline que transforma feedback anonimizado de milhares de utilizadores no melhor router LLM do mundo. Isto inclui:

1. **frugal-hub v1.1** — Cloudflare Workers + D1 + R2 para agregar deltas
2. **Sistema de notificação a Paulo** — webhook quando algo relevante acontece
3. **Deteção automática de novos modelos** — community menciona modelo desconhecido → alerta
4. **Auto-update do classificador** — versão nova do router-tuning gerada automaticamente
5. **Onboarding inteligente** — novo utilizador recebe config otimizada para o seu hardware/plano
6. **Dashboard de saúde do sistema** — Paulo vê o estado do ecossistema em tempo real

---

## ARQUITECTURA DO SISTEMA

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UTILIZADORES                                 │
│                                                                      │
│  User A (RTX 4090)   User B (M3 Pro)   User C (CPU-only)           │
│  decisions.log       decisions.log      decisions.log               │
│       │                   │                   │                     │
│       ▼                   ▼                   ▼                     │
│  backtest.js          backtest.js        backtest.js                │
│  --export-delta       --export-delta     --export-delta             │
│       │                   │                   │                     │
│       └───────────────────┼───────────────────┘                    │
│                           │ delta JSONL (anonimizado)               │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    frugal-hub (Cloudflare)                           │
│                                                                      │
│  Workers (edge)                                                      │
│  ├── POST /api/delta    ← recebe delta de cada user                 │
│  ├── GET  /api/stats    ← estatísticas públicas                     │
│  ├── GET  /api/models   ← modelos conhecidos + scores               │
│  └── GET  /api/version  ← versão atual do router-tuning             │
│                                                                      │
│  D1 (SQLite at edge)                                                 │
│  ├── deltas            ← cada delta recebido (7 dias TTL)           │
│  ├── model_signals     ← modelos detectados pela comunidade         │
│  ├── aggregated_stats  ← stats por hw_tier + sub_profile            │
│  └── anomalies         ← desvios detectados no agregado             │
│                                                                      │
│  R2 (object storage)                                                 │
│  ├── router-tuning-vX.X.json  ← versões do classificador            │
│  ├── model-catalog-vX.X.json  ← catálogo de modelos                 │
│  └── anomaly-reports/         ← relatórios detalhados               │
│                                                                      │
│  Cron Triggers (scheduled)                                           │
│  ├── hourly  → aggregate_deltas()                                   │
│  ├── daily   → generate_router_tuning()                             │
│  └── weekly  → prune_old_deltas() + notify_paulo()                 │
└─────────────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────────┐
              │             │                 │
              ▼             ▼                 ▼
     Webhook → Paulo   R2 público      Auto-update
     (anomalias,       (model-         (frugal pull
      novos modelos,    catalog)        nova versão)
      accuracy drop)
```

---

## SCHEMA DE BASE DE DADOS (D1)

### Tabela: `deltas`
```sql
CREATE TABLE deltas (
  id          TEXT PRIMARY KEY,         -- uuid v4
  received_at TEXT NOT NULL,            -- ISO timestamp
  expires_at  TEXT NOT NULL,            -- +7 dias (TTL)
  hw_tier     TEXT NOT NULL,            -- 'gpu-high'|'gpu-mid'|'gpu-low'|'apple-silicon'|'cpu-only'
  sub_profile TEXT NOT NULL,            -- 'max'|'pro'|'api-free'|'multi-provider'|'unknown'
  lang        TEXT NOT NULL,            -- 'pt'|'en'|'other'
  session_count     INTEGER,
  prompt_count      INTEGER,
  tier_distribution TEXT,               -- JSON: {"t0":0.84,"t1":0.0,"t2":0.12,"t3":0.04}
  keyword_signals   TEXT,               -- JSON array de sinais agregados
  unknown_models    TEXT,               -- JSON array de nomes de modelos não reconhecidos
  feedback_signals  TEXT,               -- JSON: {"followup_rate":0.08,"accepted_rate":0.91}
  delta_version     TEXT,               -- versão do schema de delta (para migração)
  trust_score       REAL DEFAULT 0.5    -- calculado após receção
);
```

### Tabela: `model_signals`
```sql
CREATE TABLE model_signals (
  model_name    TEXT PRIMARY KEY,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  mention_count INTEGER DEFAULT 1,
  hw_tiers      TEXT,                   -- JSON: quais hw_tiers mencionaram este modelo
  status        TEXT DEFAULT 'pending', -- 'pending'|'reviewed'|'added'|'rejected'
  paulo_notified INTEGER DEFAULT 0,     -- 1 se Paulo já foi notificado
  notes         TEXT                    -- notas de revisão manual
);
```

### Tabela: `aggregated_stats`
```sql
CREATE TABLE aggregated_stats (
  period        TEXT NOT NULL,          -- 'hourly'|'daily'|'weekly'
  period_start  TEXT NOT NULL,
  hw_tier       TEXT NOT NULL,
  sub_profile   TEXT NOT NULL,
  sample_count  INTEGER,
  avg_t0_rate   REAL,
  avg_t2_rate   REAL,
  avg_t3_rate   REAL,
  avg_savings   REAL,
  avg_followup  REAL,                   -- taxa de followup imediato (proxy de erro)
  PRIMARY KEY (period, period_start, hw_tier, sub_profile)
);
```

### Tabela: `anomalies`
```sql
CREATE TABLE anomalies (
  id            TEXT PRIMARY KEY,
  detected_at   TEXT NOT NULL,
  type          TEXT NOT NULL,          -- 'accuracy_drop'|'new_model'|'hw_tier_spike'|'sub_change'
  severity      TEXT NOT NULL,          -- 'info'|'warning'|'critical'
  description   TEXT NOT NULL,
  payload       TEXT,                   -- JSON com dados específicos
  paulo_notified INTEGER DEFAULT 0,
  resolved      INTEGER DEFAULT 0
);
```

---

## FICHEIROS A CRIAR

### 1. `hub/worker.js` — Cloudflare Worker principal

```
hub/
├── worker.js           ← entry point do Worker
├── routes/
│   ├── delta.js        ← POST /api/delta
│   ├── stats.js        ← GET /api/stats
│   ├── models.js       ← GET /api/models
│   └── version.js      ← GET /api/version
├── jobs/
│   ├── aggregate.js    ← cron hourly
│   ├── generate.js     ← cron daily: gera router-tuning
│   └── notify.js       ← cron weekly + trigger on anomaly
├── lib/
│   ├── trust.js        ← calcula trust_score por delta
│   ├── anomaly.js      ← deteta anomalias no agregado
│   └── model-detect.js ← identifica modelos desconhecidos
└── wrangler.toml       ← config Cloudflare
```

### 2. `tools/router/hub-push.js` — cliente que envia delta ao hub

```javascript
// Invocado automaticamente por backtest.js --export-delta
// Também pode ser chamado manualmente: node hub-push.js
// Não bloqueia se hub estiver offline (fire-and-forget)
```

### 3. `tools/router/hub-pull.js` — cliente que recebe updates do hub

```javascript
// Chamado no arranque do frugal (via inject_context.js)
// Verifica se há nova versão de router-tuning ou model-catalog
// Faz download silencioso para ~/.claude/tools/router/
```

### 4. `tools/router/onboarding.js` — experiência de primeiro arranque

```javascript
// Chamado se hw-capability.json ou subscription-profile.json não existem
// 1. Corre gpu-probe → hw-capability.json
// 2. Corre setup-profile.js (interativo)
// 3. Chama hub-pull.js para obter config otimizada para este hw_tier
// 4. Mostra resumo: "Pronto! O frugal está otimizado para RTX 4090 + Claude Max"
```

### 5. `tools/router/model-catalog.json` — catálogo local de modelos conhecidos

```json
{
  "_version": "1.0.0",
  "_updated": "2026-04-10",
  "_source": "frugal-hub",
  "models": {
    "claude-opus-4": { "tier": "t3", "provider": "anthropic", "known_since": "2026-03" },
    "claude-sonnet-4": { "tier": "t2", "provider": "anthropic", "known_since": "2026-02" },
    "qwen3:30b": { "tier": "t0", "provider": "ollama", "vram_min_mb": 20480 }
  }
}
```

### 6. `tools/router/router-tuning.json` — pesos do classificador gerados pela comunidade

```json
{
  "_version": "1.0.0",
  "_generated": "2026-04-10",
  "_samples": 14371,
  "_hw_tiers": ["gpu-high", "gpu-mid", "apple-silicon", "cpu-only"],
  "keyword_weights": {
    "architecture": { "tier": "t3", "weight": 0.94 },
    "refactor": { "tier": "t2", "weight": 0.87 }
  },
  "threshold_adjustments": {
    "gpu-high": { "t0_boost": 0.05 },
    "cpu-only": { "t0_penalty": 0.10 }
  }
}
```

---

## SISTEMA DE NOTIFICAÇÃO A PAULO

### Webhook payload (POST para URL configurada em `hub/.env`)

```json
{
  "timestamp": "2026-04-10T14:32:00Z",
  "type": "new_model_detected",
  "severity": "info",
  "title": "Novo modelo detectado pela comunidade",
  "body": "O modelo 'gemma3:27b' foi mencionado em 47 deltas nas últimas 24h. hw_tiers: gpu-high (38), apple-silicon (9). Requer revisão para inclusão no KNOWLEDGE_BASE.md.",
  "action_url": "https://frugal-hub.workers.dev/admin/models/gemma3:27b",
  "data": {
    "model_name": "gemma3:27b",
    "mention_count": 47,
    "hw_tiers": {"gpu-high": 38, "apple-silicon": 9},
    "first_seen": "2026-04-09T08:11:00Z"
  }
}
```

### Triggers de notificação

| Evento | Threshold | Severidade |
|---|---|---|
| Novo modelo detectado | ≥ 10 menções em 24h | info |
| Accuracy drop (followup_rate subiu) | > 15% acima da baseline | warning |
| hw_tier_spike (novo hw_tier emergente) | ≥ 50 utilizadores com hw desconhecido | info |
| Savings rate caiu | < 80% em média diária | warning |
| Hub offline / sem deltas | 0 deltas em 48h | critical |
| Novo sub_profile desconhecido | ≥ 20 utilizadores com plano não mapeado | info |

### Destinos de notificação (configuráveis em `hub/.env`)
```
PAULO_WEBHOOK_URL=https://...       # Discord, Slack, ou endpoint custom
PAULO_EMAIL=paulo.loureiro.shp@gmail.com
NOTIFY_THRESHOLD_NEW_MODEL=10
NOTIFY_THRESHOLD_ACCURACY_DROP=0.15
```

---

## PIPELINE DE DETEÇÃO DE NOVOS MODELOS

```
1. delta recebido com unknown_models: ["gemma3:27b", "phi-4"]
        │
        ▼
2. model-detect.js: para cada modelo desconhecido
   - lookup em model_signals
   - se novo: INSERT com mention_count=1, status='pending'
   - se já existe: UPDATE mention_count++, last_seen
        │
        ▼
3. aggregate.js (hourly):
   - SELECT modelos com mention_count >= THRESHOLD e paulo_notified=0
   - Para cada um: INSERT anomaly (type='new_model')
                   UPDATE model_signals (paulo_notified=1)
        │
        ▼
4. notify.js:
   - SELECT anomalies onde paulo_notified=0
   - Envia webhook para Paulo
   - UPDATE anomalies (paulo_notified=1)
        │
        ▼
5. Paulo recebe webhook com:
   - Nome do modelo
   - Quantas menções e em que hw_tiers
   - Link para KNOWLEDGE_BASE.md no repo para adicionar
        │
        ▼
6. Paulo actualiza manualmente:
   - docs/KNOWLEDGE_BASE.md → adiciona novo modelo
   - tools/router/pricing.js → adiciona custo
   - tools/router/classify.js → ajusta lógica se necessário
   - git push → deploy automático
        │
        ▼
7. generate.js (daily):
   - Lê model_signals com status='added'
   - Inclui novo modelo no model-catalog.json
   - Publica nova versão em R2
        │
        ▼
8. hub-pull.js (cada utilizador no arranque):
   - Detecta nova versão do model-catalog
   - Faz download silencioso
   - Próxima sessão usa catálogo atualizado
```

---

## AUTO-GERAÇÃO DO ROUTER-TUNING

O `generate.js` corre diariamente e produz `router-tuning-vX.X.json`:

```javascript
// Pseudocódigo de generate.js

async function generateRouterTuning(db, r2) {
  // 1. Lê deltas dos últimos 7 dias com trust_score >= 0.4
  const deltas = await db.prepare(`
    SELECT * FROM deltas 
    WHERE received_at > datetime('now', '-7 days')
    AND trust_score >= 0.4
    ORDER BY trust_score DESC
  `).all();

  // 2. Agrega keyword_signals por tier
  const signals = aggregateSignals(deltas);
  
  // 3. Calcula threshold adjustments por hw_tier
  const adjustments = computeThresholdAdjustments(deltas);
  
  // 4. Constrói router-tuning.json
  const tuning = {
    _version: nextVersion(),
    _generated: new Date().toISOString(),
    _samples: deltas.length,
    keyword_weights: signals,
    threshold_adjustments: adjustments,
  };
  
  // 5. Publica em R2
  await r2.put(`router-tuning-v${tuning._version}.json`, JSON.stringify(tuning));
  await r2.put('router-tuning-latest.json', JSON.stringify(tuning));
  
  // 6. Verifica se há regressão (compara com versão anterior)
  const regression = await checkRegression(tuning, db);
  if (regression.detected) {
    await insertAnomaly(db, 'accuracy_drop', 'warning', regression);
  }
}
```

### Cálculo de trust_score (lib/trust.js)

```
trust_score = base_score × hw_weight × feedback_bonus × volume_factor

base_score:
  - delta_version correto: +0.3
  - campos obrigatórios presentes: +0.3
  - session_count >= 10: +0.2
  - prompt_count >= 50: +0.2

hw_weight:
  - gpu-high: 1.0 (mais capacidade T0, sinal mais rico)
  - gpu-mid: 0.9
  - apple-silicon: 0.9
  - gpu-low: 0.8
  - cpu-only: 0.7 (menos dados de T0)

feedback_bonus:
  - followup_rate < 0.08 (poucos erros): +0.1
  - accepted_rate > 0.90: +0.1

volume_factor:
  - prompt_count > 200: ×1.1
  - prompt_count < 20: ×0.8
```

---

## ONBOARDING INTELIGENTE (tools/router/onboarding.js)

Quando um utilizador instala o frugal pela primeira vez:

```
┌────────────────────────────────────────────────────┐
│           frugal — primeiro arranque               │
│                                                    │
│  1. Detecting hardware...                          │
│     ✓ RTX 4090 detected (24GB VRAM)               │
│     ✓ hw_tier: gpu-high                           │
│     ✓ Recommended local model: qwen3:30b          │
│                                                    │
│  2. Subscription profile...                        │
│     → What's your Claude plan? [Max/Pro/API-only] │
│     ✓ Claude Max — budget cap disabled            │
│                                                    │
│  3. Fetching community config for gpu-high...      │
│     ✓ router-tuning v1.3 loaded (14,371 samples)  │
│     ✓ model-catalog v1.2 loaded (23 models)       │
│                                                    │
│  4. Ready!                                         │
│     Expected savings: ~91% (community baseline    │
│     for gpu-high + Claude Max)                    │
│                                                    │
│  Run: ollama pull qwen3:30b  (21GB download)      │
└────────────────────────────────────────────────────┘
```

O onboarding lê do hub as estatísticas de savings para o perfil específico (hw_tier + sub_profile) e mostra ao utilizador a expectativa REAL baseada na comunidade — não uma estimativa genérica.

---

## INTEGRAÇÃO COM inject_context.js

Adicionar ao arranque de sessão:

```javascript
// Em inject_context.js, antes do classify:

async function checkForUpdates() {
  // Não bloqueia — fire and forget
  hubPull().catch(() => {});  // silencioso se offline
}

async function maybePushDelta() {
  // Empurra delta se há >= 50 prompts desde o último push
  // ou se já passaram >= 24h desde o último push
  const shouldPush = await checkPushThreshold();
  if (shouldPush) {
    backtestExportAndPush().catch(() => {}); // não bloqueia sessão
  }
}
```

### Variáveis de ambiente adicionadas ao contexto do classify.js:
```
FRUGAL_ROUTER_TUNING_VERSION=1.3
FRUGAL_COMMUNITY_T0_RATE=0.839
FRUGAL_COMMUNITY_SAVINGS=0.902
```

---

## WRANGLER.TOML

```toml
name = "frugal-hub"
main = "hub/worker.js"
compatibility_date = "2026-04-01"

[[d1_databases]]
binding = "DB"
database_name = "frugal-hub"
database_id = "TO_BE_FILLED"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "frugal-hub-storage"

[triggers]
crons = ["0 * * * *", "0 6 * * *", "0 6 * * 1"]
# hourly aggregate, daily generate, weekly notify+prune

[vars]
DELTA_TTL_DAYS = "7"
MIN_TRUST_SCORE = "0.4"
NEW_MODEL_THRESHOLD = "10"
ACCURACY_DROP_THRESHOLD = "0.15"
```

---

## PRIVACY — O QUE NUNCA ENVIAMOS

O delta que chega ao hub **nunca contém**:
- Texto de prompts (nem preview, nem hash)
- Nome do utilizador, email, ou qualquer PII
- Path de ficheiros ou nomes de projetos
- Chaves de API ou tokens
- IP de origem (Workers não loga IPs por default)

O delta **contém apenas**:
- Distribuição agregada de tiers (percentagens)
- Sinais de keywords do allowlist (não as keywords em si)
- hw_tier e sub_profile declarados
- Métricas agregadas de feedback (followup_rate, accepted_rate)
- Lista de modelos não reconhecidos (nomes curtos, sem contexto)

---

## TAREFAS DE IMPLEMENTAÇÃO

### Fase 1 — Hub base (prioridade máxima)

- [ ] Criar estrutura de diretórios `hub/`
- [ ] Criar `wrangler.toml` com D1 + R2 + crons
- [ ] Criar `hub/worker.js` com routing para routes/
- [ ] Criar `hub/routes/delta.js` — validação + insert + trust_score
- [ ] Criar `hub/routes/stats.js` — stats públicas agregadas
- [ ] Criar `hub/routes/models.js` — catálogo de modelos
- [ ] Criar `hub/routes/version.js` — versão atual do router-tuning
- [ ] Criar `hub/lib/trust.js` — cálculo de trust_score
- [ ] Criar `hub/lib/model-detect.js` — deteção de modelos novos
- [ ] Criar `hub/lib/anomaly.js` — deteção de anomalias

### Fase 2 — Jobs agendados

- [ ] Criar `hub/jobs/aggregate.js` — cron hourly
- [ ] Criar `hub/jobs/generate.js` — cron daily (router-tuning)
- [ ] Criar `hub/jobs/notify.js` — webhook para Paulo
- [ ] Testar crons localmente com `wrangler dev`

### Fase 3 — Cliente local

- [ ] Criar `tools/router/hub-push.js` — envia delta ao hub
- [ ] Criar `tools/router/hub-pull.js` — recebe updates do hub
- [ ] Modificar `tools/router/backtest.js` para chamar hub-push após --export-delta
- [ ] Modificar `tools/router/inject_context.js` para chamar hub-pull no arranque
- [ ] Criar `tools/router/model-catalog.json` (versão base)
- [ ] Criar `tools/router/router-tuning.json` (versão base)

### Fase 4 — Onboarding

- [ ] Criar `tools/router/onboarding.js` — flow completo de primeiro arranque
- [ ] Modificar `inject_context.js` para detectar primeiro arranque e chamar onboarding
- [ ] Integrar stats da comunidade no output do onboarding
- [ ] Testar flow completo num ambiente limpo

### Fase 5 — Dashboard e monitorização

- [ ] Criar `hub/routes/admin.js` — endpoint protegido para Paulo
- [ ] Criar `tools/router/hub-status.js` — CLI para ver estado do hub
- [ ] Adicionar `/hub` ao savings-tracker endpoint (proxy para hub stats)
- [ ] Adicionar métricas do hub ao statusline (ex: `🌐 hub v1.3 ↑14k`)

### Fase 6 — Deploy e validação

- [ ] Deploy do Worker para Cloudflare com `wrangler deploy`
- [ ] Executar migrations D1
- [ ] Criar bucket R2 e fazer upload de versões base dos JSONs
- [ ] Testar POST /api/delta com delta sintético
- [ ] Testar GET /api/stats
- [ ] Configurar PAULO_WEBHOOK_URL no ambiente do Worker
- [ ] Verificar que hub-push.js funciona end-to-end
- [ ] Verificar que hub-pull.js actualiza os ficheiros locais

---

## COMANDOS DE REFERÊNCIA

```bash
# Instalar Wrangler
npm install -g wrangler

# Autenticar na Cloudflare
wrangler auth login

# Criar D1 database
wrangler d1 create frugal-hub

# Criar R2 bucket
wrangler r2 bucket create frugal-hub-storage

# Executar migrations
wrangler d1 execute frugal-hub --file=hub/migrations/001_init.sql

# Desenvolver localmente
wrangler dev hub/worker.js

# Deploy
wrangler deploy

# Ver logs em tempo real
wrangler tail

# Testar endpoint local
curl -X POST http://localhost:8787/api/delta \
  -H "Content-Type: application/json" \
  -d @tools/router/test-delta.json
```

---

## FORMATO DE DELTA (v2) — referência completa

```jsonc
{
  // Meta
  "delta_version": "2",
  "generated_at": "2026-04-10T14:32:00Z",
  "frugal_version": "0.9.1",

  // Hardware (nunca identifica o user)
  "hw_tier": "gpu-high",
  "vram_mb": 24576,

  // Subscription (declarado pelo user)
  "sub_profile": "max",

  // Volume (sem textos)
  "session_count": 12,
  "prompt_count": 341,

  // Distribuição de tiers
  "tier_distribution": {
    "t0": 0.841,
    "t1": 0.000,
    "t2": 0.121,
    "t3": 0.038
  },

  // Sinais de keywords (só do allowlist, sem contexto)
  "keyword_signals": [
    { "signal": "has_code_block", "t3_rate": 0.12, "count": 89 },
    { "signal": "has_error_trace", "t3_rate": 0.34, "count": 23 },
    { "signal": "lang_pt", "t2_rate": 0.15, "count": 201 }
  ],

  // Modelos desconhecidos detectados (se algum)
  "unknown_models": [],

  // Feedback implícito
  "feedback_signals": {
    "followup_rate": 0.067,
    "accepted_rate": 0.912,
    "cascade_l1_to_l2_rate": 0.043
  },

  // Língua predominante
  "lang": "pt"
}
```

---

## NOTA FINAL — FILOSOFIA DO SISTEMA

O frugal não é apenas um router. É um sistema de inteligência colectiva onde:

- **Cada prompt que qualquer utilizador faz** contribui (anonimamente) para o modelo ficar mais esperto
- **Nenhum utilizador sabe quem são os outros** — só os padrões agregados
- **Paulo sabe o que importa** — não feeds de dados brutos, mas alertas de qualidade sobre o que mudou
- **O sistema aprende sem supervisão constante** — Paulo só é chamado quando há algo que requer julgamento humano (novo modelo, anomalia, decisão de arquitetura)
- **Cada novo utilizador chega com vantagem** — a config está já otimizada para o seu hw_tier graças aos utilizadores anteriores

Este é o flywheel: mais utilizadores → melhores dados → melhor router → mais utilizadores.
```
