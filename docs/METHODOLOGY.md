# Mooter / Frugal Router — Metodologia

> **Documento-mãe.** Este ficheiro é a única fonte de verdade sobre **o que é, como decide, como se avalia, e como evolui** o router. Qualquer discrepância entre este documento e o código é um bug — a reconciliar a favor do documento, não do código.
>
> **Versão:** 1.0.0
> **Última revisão:** 2026-04-16
> **Owner:** Paulo Loureiro
> **Idioma:** PT-PT (conceitos), inglês (identificadores)

---

## 0. Missão

Dado um prompt escrito pelo utilizador a um agente Claude Code, decidir **qual o modelo mais barato que entrega resposta equivalente ao modelo de referência** (hoje Opus 4.6), registar essa decisão e os seus outcomes, e aprender continuamente para melhorar a decisão seguinte.

O router não é um classificador genérico. É um **optimizador contextual per-user** cuja função-objectivo é:

```
max  Σ ( saving_usd × quality_retention_ratio )
sujeito a:  quality_retention_ratio ≥ 0.95
            latency_delta_s ≤ user.max_latency_tolerance
            monthly_spend ≤ user.budget
```

Ou em linguagem humana: **poupa o máximo possível sem nunca sacrificar qualidade abaixo do limiar definido pelo user**. Se cair abaixo, não é saving — é regressão disfarçada.

---

## 1. Não-objectivos

- **Não é** um roteador "one-size-fits-all". Cada utilizador tem hardware, subscriptions, orçamento e tolerância a latência distintos. O algoritmo **tem de** adaptar-se.
- **Não** optimiza por latência absoluta. Optimiza custo dado qualidade equivalente. Latência extra é aceitável e é **explicitamente registada** para o user decidir.
- **Não** copia nem exfiltra código de projectos do user. Prompts são armazenados em preview truncado (200 chars) e feature vectors numéricos; nunca o conteúdo raw dos ficheiros.
- **Não** amarra a arquitectura a Anthropic / Opus. O catálogo é input, não constante. Quando Claude 5, GPT-5, Gemini 3 saírem, só refresh de `model-catalog.json` + `pricing.js`.
- **Não** corre training online per-request. Training é batch (semanal), lookup é O(1) em hot path.

---

## 2. Definição de saving (o núcleo)

### 2.1 Baseline

O **baseline** é o modelo mais caro do catálogo actual com capacidade garantida para qualquer tarefa. Hoje: `claude-opus-4-6`. Declarado em `model-catalog.json` como `reference_model`. Evolui quando o catálogo muda.

```json
{
  "reference_model": "claude-opus-4-6",
  "reference_as_of": "2026-04-16"
}
```

### 2.2 Fórmula por decisão

Para cada prompt:

```
baseline_cost_usd    = tokens_in × price[ref].input/1e6 + tokens_out × price[ref].output/1e6
baseline_latency_ms  = price[ref].latency_ms_p50      // medido ou estimado

actual_cost_usd      = tokens_in × price[used].input/1e6 + tokens_out × price[used].output/1e6
actual_latency_ms    = wall_clock_turn_duration       // medido no stop hook

saving_usd           = max(0, baseline_cost_usd − actual_cost_usd)
saving_pct           = baseline_cost_usd > 0 ? saving_usd / baseline_cost_usd : 0
latency_delta_ms     = actual_latency_ms − baseline_latency_ms
```

**Propriedades invariantes**:

- `saving_usd` nunca é negativo (se o router escolheu Opus, saving = 0, não −∞).
- `saving_pct` está em `[0, 1]`.
- `latency_delta_ms` **pode ser positivo, zero, ou negativo**. Positivo = poupámos dinheiro mas demorou mais. Negativo = poupámos dinheiro e foi mais rápido (raro mas possível para T0 local com model pequeno).
- T0 (Ollama local) → saving_pct = 1.0 (custo monetário zero; custa energia + specs, fora da fórmula financeira).

### 2.3 Quality retention gate

Um saving **só é "banked"** quando há evidência de equivalência de qualidade.

```
quality_ratio ∈ [0, 1] é o estimador de equivalência a Opus.

fontes (ordem de precedência, primeira disponível ganha):
  1. ground_truth_oracle   → 1.0 se teste passa, 0.0 se falha
  2. shadow_judge_verdict  → 1.0 'tie'|'shadow_better', 0.7 'primary_better' (shadow underperformed)
  3. explicit_rating       → 1.0 good, 0.0 bad
  4. implicit_signal       → heurística (ver §7.3)
  5. default_prior         → 0.95  (optimista até prova em contrário)

is_real_saving := saving_usd > 0 AND quality_ratio ≥ user.quality_threshold (default 0.95)
```

Savings sem quality_ratio confirmado ficam em estado `pending`. Statusline mostra `$X confirmed / $Y pending`. Nunca reclamamos poupança não verificada como se fosse real.

### 2.4 Regra de ouro (o user escreveu; é o contrato)

> "Tudo que não for o LLM mais caro e a solução rotear para um mais barato, precisa ser considerado como saving real. O único ponto é que precisamos sempre mostrar que esse saving muito provavelmente demorou mais para ter uma resposta — e que desde que seja uma resposta equivalente ao melhor modelo, está valendo. Só precisamos registrar quanto tempo a mais demorou."
>
> — Paulo Loureiro, 2026-04-16

A tripla **(saving_usd, latency_delta_ms, quality_ratio)** é o contrato mínimo de reporting. Qualquer output do router que declare poupança sem as três métricas é inválido.

---

## 3. Contrato de equivalência de qualidade

Qualidade equivalente **não** é "resposta idêntica". É **resposta que resolve o problema do user com o mesmo grau de sucesso**. Tolerâncias:

| Dimensão | Equivalência aceitável |
|---|---|
| Correctness (tarefa executa, teste passa) | 100% — sem tolerância |
| Completeness (cobre os pontos pedidos) | ≥ 95% |
| Code quality (estilo, idiomaticidade) | subjective — shadow judge decide |
| Latency | +10s é tolerado por default; +60s exige opt-in explícito |
| Formato (estrutura de resposta) | divergência permitida se intent preservado |

Quando a equivalência não se verifica, o caso torna-se **exemplo de treino** — é marcado em `decisions.log` com `event: quality_regression` e alimenta o backtest para ajustar thresholds.

---

## 4. Perfil de utilizador

### 4.1 Por que é anti-one-size

Dois users com o mesmo prompt podem justificadamente ter routing diferente:

- User A tem RTX 4090 e Claude Pro → T3 Opus é ~free marginalmente → prefere qualidade.
- User B tem MacBook Air M1 sem subscription → paga cada token → prefere T0/T1 ao limite.
- User C é hobbyist com budget $5/mês → T2/T3 só se absolutamente necessário.

A metodologia **tem de** reflectir isto. Profile é load-bearing.

### 4.2 Schema

`~/.claude/tools/router/user-profile.json`:

```json
{
  "version": 1,
  "updated_at": "2026-04-16T00:00:00Z",
  "hardware": {
    "source": "hw-capability.json",
    "gpu_vendor": "nvidia",
    "gpu_name": "RTX 4090",
    "vram_mb": 24564,
    "hw_tier": "gpu-high",
    "t0_capable": true,
    "t0_max_model_size": "30b"
  },
  "subscriptions": {
    "source": "subscription-profile.json",
    "anthropic_pro": false,
    "copilot": false,
    "gemini_advanced": false,
    "openai_plus": false,
    "other": []
  },
  "budget": {
    "monthly_usd_cap": null,
    "monthly_spent_usd": 0.0,
    "reset_day": 1,
    "alert_at_pct": [50, 80, 95],
    "hard_cap_behavior": "downgrade_one_tier"
  },
  "preferences": {
    "max_latency_tolerance_s": 30,
    "quality_threshold": 0.95,
    "prefer_local_t0": true,
    "allow_shadow_mode": true,
    "allow_hub_aggregation": false
  },
  "usage_pattern": {
    "dominant_languages": ["typescript", "javascript", "python"],
    "dominant_categories": { "cross_file_change": 0.31, "trivial_local": 0.42, "...": "..." },
    "tier_distribution_last_30d": { "T0": 0.45, "T1": 0.10, "T2": 0.20, "T3": 0.25 },
    "avg_session_length_prompts": 12,
    "peak_hours_utc": [9, 10, 11, 14, 15]
  },
  "learned": {
    "preferred_model_per_category": {
      "trivial_local": "qwen3:30b",
      "commit_msg": "claude-haiku-4-5-20251001"
    },
    "rejection_patterns": [
      "T1_for_architecture",
      "T0_when_file_refs_count_gt_3"
    ]
  }
}
```

### 4.3 Cadência de actualização

| Campo | Cadência | Fonte |
|---|---|---|
| `hardware` | on-change (probe ao boot) | `gpu-probe.js` |
| `subscriptions` | manual via `/mooter-profile --set-sub` | user input |
| `budget.monthly_spent_usd` | real-time | stop hook |
| `budget.monthly_usd_cap` | manual | `/mooter-budget <valor>` |
| `preferences` | manual | `/mooter-profile` |
| `usage_pattern` | weekly batch | `weekly-evolution.js` |
| `learned` | weekly batch | `backtest.js` delta |

O hot path nunca recomputa perfil. Lê `user-profile.json` em ~1ms.

---

## 5. Vector de features do prompt

### 5.1 Camada rápida (hot path, <5ms)

Features extraídas por `classify.js` via regex + heurísticas:

| Feature | Tipo | Fonte |
|---|---|---|
| `prompt_len` | int | len(prompt) |
| `has_code_block` | bool | regex ``` |
| `has_file_refs` | bool | regex `\S+\.(ts|js|py|…)` |
| `file_ref_count` | int | count |
| `has_error_trace` | bool | regex `Error:\|at .*:\d+` |
| `is_question` | bool | termina `?` ou interrogativa |
| `has_url` | bool | regex `https?://` |
| `lang_detected` | enum | pt/en/other |
| `quality_intent` | bool | frases "think hard", "pensa bem" |
| `risk_level` | enum | low/medium/high (guardrails) |
| `task_category` | enum | 12 categorias |
| `prompt_signature_hash` | sha256[:16] | normalized(prompt) |

Persistidas em `decisions.log` evento `classified`.

### 5.2 Camada semântica (async, pós-decisão)

Embedding via `nomic-embed-text` (Ollama, 768d, free, local). **Não** bloqueia o hot path — é computado fire-and-forget após a resposta e persistido em `embedding-cache.jsonl`:

```
{"hash": "<prompt_signature>", "vec": [0.012, -0.431, ...], "ts": "..."}
```

Usado só para **lookup retro**: "dado este prompt, quais os K prompts anteriores mais parecidos e como correram?" via cosine similarity sobre ≤ 50k vectors em memória (~10MB, sub-ms lookup).

---

## 6. Pipeline de decisão de routing

```
   prompt
     │
     ▼
  [1] classify.js → features + initial tier (regex, <5ms)
     │
     ├─── HIGH_RISK ──────────▶ force T3 (guardrail)
     │
     ▼
  [2] consult user-profile
      • budget remaining → cap tier
      • quality_threshold → accepta downgrade?
      • subscriptions → adjust effective cost
     │
     ▼
  [3] consult similarity cache (opcional, feature-flagged)
      • K-NN top-5 on embedding
      • if ≥3/5 same tier had quality_ratio=1 → bias to that tier
      • if ≥2/5 same tier had quality_ratio=0 → escalate one tier
     │
     ▼
  [4] arbiter (Haiku, só se confidence <0.6 ou ambiguous_*)
     │
     ▼
  [5] pick provider for tier
      • subscription-aware: Claude Pro available → prefer Anthropic
      • budget-aware: month spent > 80% cap → prefer cheaper tier-mate
      • hardware-aware: T0 requires VRAM; fallback T1 if insufficient
     │
     ▼
  [6] emit <router-hint> + log classified event with all versions stamped
     │
     ▼
  [7] (Opus/Claude Code executes) → response
     │
     ▼
  [8] stop hook → turn_end event with tokens, cost, wall-clock
     │
     ▼
  [9] async: ground-truth check (if deterministic oracle applicable)
     │
     ▼
 [10] async: shadow-mode spawn (5% sample, non-HIGH_RISK, T2/T3 only)
     │
     ▼
 [11] nightly: shadow-judge + implicit signal scoring
     │
     ▼
 [12] daily: backtest delta
     │
     ▼
 [13] weekly: profile rebuild + classifier retune
```

Cada passo é opcional e feature-flagged em `.mooter-mode.json`. Default: [1][2][6][7][8][12] activos. [3][9][10][11][13] progressivamente ligados.

---

## 7. Captura da resposta & avaliação

### 7.1 Sinais disponíveis (ordenados por confiança)

| Sinal | Confiança | Custo | Latência | Estado |
|---|---|---|---|---|
| **Ground-truth determinístico** (testes passam, regex valida, JSON parses) | 1.0 | 0 | real-time | ❌ a construir |
| **Explicit rating** (`/mooter-good`, `/mooter-bad`) | 0.95 | 0 | humano (dias) | ✅ existe |
| **Shadow judge** (LLM compara primary vs shadow) | 0.75 | ~$0.5/mês Ollama | nightly | ⏳ Sprint B.1 |
| **Implicit signal** (followup <3min, session abort, retry) | 0.5 | 0 | real-time | ❌ a construir |
| **Default prior** (ausência de sinal) | 0.95 (optimista) | 0 | imediato | ✅ implícito |

### 7.2 Ground-truth oracle (quando aplicável)

Para cada `task_category`, existe ou não um oráculo determinístico:

| Categoria | Oracle | Exemplo |
|---|---|---|
| `regex_task` | compilar + testar contra inputs | `build a regex for emails` |
| `json_transform` | parse resultante é válido | `convert this to JSON` |
| `commit_msg` | nenhum (subjective) | — |
| `code_fix` | se testes existem, correr | `fix bug in foo.ts` |
| `explain_error` | nenhum (subjective) | — |
| `trivial_local` | heurística de completude | — |

Quando oracle existe e é barato, é **sempre corrido** após a resposta. Veredicto vai para `decisions.log` evento `ground_truth`.

### 7.3 Implicit signals

Heurísticas que não precisam de input humano:

| Padrão | Inferência |
|---|---|
| Prompt `N+1` contém "actually" / "na verdade" / "não, …" dentro de 3min | negative (prompt `N` falhou) |
| Prompt `N+1` retry da mesma pergunta | negative |
| Session abort (user closes sem follow-up) + prompt era T2/T3 | weak negative |
| Prompt `N+1` agradece ("obrigado", "thanks", "perfect") | positive |
| Prompt `N+1` é sobre tópico novo (cos similarity <0.3) + ≥5min gap | positive (moved on) |
| Gap ≥30min + new session | positive (assumed acceptable) |

Ponderação combinada em `signals.js` → `implicit_quality_ratio ∈ [0,1]`. Confiança 0.5, usado só como tie-breaker quando não há sinal melhor.

---

## 8. Loop de retroalimentação (cadências)

```
┌─ real-time ─────────────────────────────────────────────────────┐
│ UserPromptSubmit → classify.js → <router-hint> → decisions.log │
│ Stop hook → turn_end event → savings-tracker                    │
│ Slash cmd /mooter-good|bad → quality_feedback event             │
└──────────────────────────────────────────────────────────────────┘

┌─ minutos ──────────────────────────────────────────────────────┐
│ implicit signals scorer (followup ≤3min, retry patterns)       │
└────────────────────────────────────────────────────────────────┘

┌─ nightly (03:00) ──────────────────────────────────────────────┐
│ shadow-judge.js         → consolida verdicts                   │
│ ground-truth runner     → re-executa oracles em lotes          │
│ adversarial-gen --auto  → stress test + mismatch detection     │
└────────────────────────────────────────────────────────────────┘

┌─ diário (02:00) ───────────────────────────────────────────────┐
│ backtest.js             → consome todos os sinais              │
│                         → produz router-tuning.json delta      │
│ update-router.js        → aplica delta a classify.js (com .bak)│
└────────────────────────────────────────────────────────────────┘

┌─ semanal (Dom 04:00) ──────────────────────────────────────────┐
│ weekly-evolution.js     → rebuild user-profile.json            │
│                         → analisa drift, gera recomendações    │
│                         → actualiza learned.preferred_model_*  │
└────────────────────────────────────────────────────────────────┘

┌─ mensal (dia 1, 05:00) ────────────────────────────────────────┐
│ model-catalog-refresh   → fetch pricing, latency, novos modelos│
│ budget reset            → monthly_spent_usd = 0                │
└────────────────────────────────────────────────────────────────┘
```

Cada cadência é um cronjob Windows (`schtasks.exe`) documentado em `~/.claude/tools/router/schedules/`.

---

## 9. Framework de benchmark

### 9.1 Três dimensões não reduzíveis

```
benchmark(decision) = {
  correctness: [0, 1],     // via ground-truth OR judge OR rating
  latency_delta_s: ℝ,      // actual − baseline (usually positive)
  cost_delta_usd: ℝ        // actual − baseline (usually negative, good)
}
```

### 9.2 Score composto per-user

```
score = w_q × correctness  −  w_c × norm(cost_delta)  −  w_l × norm(latency_delta)
```

Pesos **per-user** vêm do profile:

| Perfil | w_q | w_c | w_l | Racional |
|---|---|---|---|---|
| Hobbyist sem budget | 0.4 | 0.5 | 0.1 | Custo domina; latência irrelevante |
| Senior engineer com Pro | 0.7 | 0.1 | 0.2 | Qualidade domina; Pro já paga custo |
| Consultor deadlines | 0.5 | 0.2 | 0.3 | Equilíbrio com peso a latência |
| Experimenter / research | 0.6 | 0.3 | 0.1 | Qualidade e custo; latência ok |

Default weights: `0.5 / 0.3 / 0.2`. User pode override em `/mooter-profile`.

### 9.3 Modelo de referência evolutivo

Hoje `reference_model = claude-opus-4-6`. Quando um modelo novo entra no catálogo e demonstra capacidade superior ao baseline (via benchmark externo + amostra local), `reference_model` é actualizado. **Backtest histórico é re-executado** contra o novo baseline — antigas poupanças podem aumentar ou diminuir retroactivamente. Isto é deliberado: o user vê sempre "quanto poupei contra o melhor disponível hoje".

---

## 10. Contrato de privacidade

### 10.1 Invariantes

- **Prompt raw nunca sai do device**. Persistido em `decisions.log` só como `prompt_preview` truncado a 200 chars **após normalização de paths e identifiers**.
- **Código do projecto nunca é armazenado**. Embeddings são vectorizações numéricas, não reversíveis para o texto original.
- **Hub aggregation é opt-in explícito**. Default `allow_hub_aggregation = false`. Quando on, só payload anonimizado:
  ```json
  {
    "classifier_version": "0.9.4",
    "features": { "prompt_len_bucket": "100-300", "has_code_block": true },
    "tier": "T2",
    "quality_ratio": 0.95,
    "saving_usd_bucket": "0.01-0.05"
  }
  ```
- **Purge**: `/mooter-purge --all` apaga `decisions.log`, `embedding-cache.jsonl`, `user-profile.json.history`. Irreversível, confirmado duas vezes.

### 10.2 Normalização de prompt_preview

Regex pass antes do truncate:

```
/[A-Z]:\\[^\s]+/            → "<winpath>"
/\/[a-zA-Z0-9_\-\/.]+\.\w+/ → "<unixpath>"
/sk-[a-zA-Z0-9]{20,}/       → "<api_key>"
/ghp_[a-zA-Z0-9]{36}/       → "<github_token>"
/[0-9]{13,19}/              → "<long_number>"
```

Implementado em `tools/router/privacy.js` (a criar, Sprint B.2).

---

## 11. Versionamento & reprodutibilidade

Cada decisão regista:

```json
{
  "classifier_version": "0.9.4",
  "profile_version": 12,
  "catalog_version": "1.0.0",
  "arbiter_version": "0.8.2",
  "ruleset_hash": "abc1234"
}
```

Dado o mesmo prompt + mesmas versions, a decisão é **determinística** (excepto sampling stochástico do shadow mode, seeded por `decision_id`).

`~/.claude/tools/router/version.json` é SSOT:

```json
{
  "version": "0.9.4",
  "classifier": "0.9.4",
  "arbiter": "0.8.2",
  "catalog": "1.0.0",
  "schema_decisions_log": 3
}
```

Backtest pode **replay** qualquer período histórico com o classifier daquela altura (require `classify.js.bak` rotation por version — já existe).

---

## 12. Adaptação per-user (o que torna isto diferente)

### 12.1 Três mecanismos de adaptação

**(a) Profile-driven routing** (hot path): tier cap por budget, subscription preference, latency tolerance. Aplicado em cada prompt.

**(b) Signature-based override** (hot path, flag): se o prompt normalizado já foi visto ≥3x pelo mesmo user e todas as vezes foi rated good no tier X, forçar tier X mesmo que classifier sugira outro. "Aprendeu" para este user.

**(c) Pattern learning** (batch semanal): `backtest.js` analisa `decisions.log` do user, detecta:
- Categorias onde T1 underperforma consistentemente → remove T1 como candidato para essa categoria neste user
- Modelos locais que o user rateia mal → baixa prioridade
- Horas do dia onde user escolhe Opus explicitamente → sugere Opus nesse horário

Output: `learned.preferred_model_per_category` em `user-profile.json`.

### 12.2 Isolamento entre users

Dados de um user **nunca** influenciam routing de outro localmente. Hub aggregation (opt-in) produz só estatísticas macro que voltam como **sugestões** ao user (ex.: "89% dos users com hardware semelhante escolhem T0 para prompts como este").

### 12.3 Cold start

User novo → `user-profile.json` gerado com defaults. `learned` vazio. Após 50 prompts rated ou 200 prompts com implicit signals, `learned` começa a ter signal.

---

## 13. Evolução do catálogo (além de Opus 4.6)

`model-catalog.json` é versionado. Cada entry tem:

```json
{
  "id": "claude-opus-4-6",
  "tier": "T3",
  "provider": "anthropic",
  "known_since": "2026-03",
  "deprecated": false,
  "reference_eligible": true,
  "latency_ms_p50": 8500,
  "latency_ms_p95": 18000
}
```

**Flow de refresh** (mensal, auto):

1. Fetch pricing de anthropic.com, openai.com, ai.google.dev, etc.
2. Fetch catálogo Ollama local (`ollama list`).
3. Comparar com `model-catalog.json`. Diff → novos modelos, price changes, deprecations.
4. Para novos modelos com potencial `reference_eligible`: correr benchmark mínimo (10 prompts gold-labels).
5. Gerar `catalog-delta.json`. User aprova via `/mooter-update`.
6. Aplicar. Bump `catalog_version`. Backtest re-corre últimos 30 dias com novo baseline.

---

## 14. Schema de eventos (`decisions.log`)

Stream JSONL append-only. Eventos:

| event | Quem escreve | Quando |
|---|---|---|
| `classified` | `classify.js` | UserPromptSubmit hook |
| `turn_end` | `gsd-turn-end.js` | Stop hook |
| `arbiter_called` | `arbiter.js` | confidence <0.6 |
| `quality_feedback` | `feedback-collector.js` | `/mooter-good\|bad` |
| `shadow_pair` | `shadow-mode.js` | 5% sample post-response |
| `shadow_judgment` | `shadow-judge.js` | nightly |
| `ground_truth` | `ground-truth.js` | pos-response determinístico |
| `implicit_signal` | `signals.js` | detector dispara |
| `quality_regression` | `backtest.js` | análise detecta regressão |
| `profile_updated` | `user-profile.js` | weekly batch |
| `catalog_updated` | `model-catalog-refresh.js` | monthly |

Schema v3 (actual): cada evento tem `ts`, `ts_ms`, `event`, `session_id`, mais campos específicos. Documentado em `docs/SCHEMA_DECISIONS_LOG.md` (a criar, Sprint B.2).

---

## 15. Mapa de ficheiros

### 15.1 Estado actual (2026-04-16)

```
~/.claude/tools/router/
├── classify.js              ✅ classifier regex + arbiter hook
├── arbiter.js               ✅ Haiku fallback para ambíguos
├── inject_context.js        ✅ UserPromptSubmit hook
├── backtest.js              ✅ daily tuning (consome ratings)
├── replay.js                ⚠️  histórico; FALTA --gold-labels
├── feedback-collector.js    ✅ explicit ratings
├── savings-tracker.js       ✅ mede tokens, custo, latency real
├── pricing.js               ✅ SSOT preços
├── model-catalog.json       ⚠️  sem latency_ms_baseline
├── subscription-profile.json ✅ shape existe, pouco preenchido
├── hw-capability.json       ✅ probed
├── adversarial-gen.js       ✅ stress test
├── weekly-evolution.js      ✅ semanal
├── version.json             ✅ SSOT versões
├── decisions.log            ✅ 856 entries hoje
└── statusline.sh            ✅ mostra savings% + cost
```

### 15.2 A criar no Sprint B.0 (este sprint)

```
docs/METHODOLOGY.md                        ▶ ESTE DOCUMENTO
tools/router/validation-set.json           ▶ gold labels estruturado
tools/router/validation-set.test.js        ▶ schema test
tools/router/replay.js  (extender)         ▶ --gold-labels mode
tools/router/user-profile.json             ▶ consolidado
tools/router/user-profile.js               ▶ consolidador + CLI
tools/router/model-catalog.json (extender) ▶ adicionar latency_ms_p50/p95
```

### 15.3 A criar em Sprints seguintes

```
Sprint B.1 (Shadow Mode):
  tools/router/shadow-mode.js
  tools/router/shadow-mode.test.js
  tools/router/shadow-judge.js
  hub/migrations/003_shadow_events.sql

Sprint B.2 (Closed Loop):
  tools/router/signals.js
  tools/router/ground-truth.js
  tools/router/similarity.js
  tools/router/embedding.js
  tools/router/privacy.js
  docs/SCHEMA_DECISIONS_LOG.md

Sprint B.3 (Budget & Evolution):
  tools/router/budget-engine.js (extender)
  tools/router/model-catalog-refresh.js
  skills: /mooter-budget, /mooter-profile, /mooter-similar, /mooter-methodology
```

---

## 16. Critérios de aceitação por sprint

### Sprint B.0 (foundation) — este sprint

- [ ] `docs/METHODOLOGY.md` existe e é este ficheiro
- [ ] `validation-set.json` tem ≥ 75 entries (10 canonical + 25 adversarial + 40 historical)
- [ ] `replay.js --gold-labels` corre e reporta accuracy por secção
- [ ] Canonical accuracy = 100% (sem excepções; se < 100%, classifier tem bug)
- [ ] Overall accuracy ≥ 85% no validation-set
- [ ] `user-profile.json` é gerado consolidando hw + subs + hw-capability
- [ ] `/mooter-status` mostra o perfil resumido
- [ ] Gate dos "30 ratings" está revogado em `frugal-status` e `SPRINT_B_SHADOW_MODE_MASTER_PROMPT.md`
- [ ] `model-catalog.json` tem `latency_ms_p50` para cada modelo
- [ ] Statusline mostra `$saved / +Ys latency / qNN%` em simultâneo

### Sprint B.1 (shadow mode)

- [ ] 100 pares shadow em 24h de uso normal
- [ ] Identifica ≥ 5 casos onde `shadow_better` (evidência de over-routing)
- [ ] Zero regressão em gold-labels canonical (100%)
- [ ] Zero user-facing impact
- [ ] Budget Ollama ≤ 15min GPU/dia

### Sprint B.2 (closed loop)

- [ ] `signals.js` classifica ≥ 70% dos prompts com algum implicit signal
- [ ] `ground-truth.js` corre oracle em ≥ 30% das decisões onde aplicável
- [ ] `similarity.js` retorna top-5 em <10ms para cache de 10k vectors
- [ ] `privacy.js` normaliza ≥ 95% dos PII em corpus de teste

### Sprint B.3 (budget & evolution)

- [ ] `/mooter-budget 50` seta cap + comportamento definido
- [ ] Alerts em 50/80/95% disparam
- [ ] `model-catalog-refresh.js` corre mensal sem intervenção
- [ ] User vê `$saved_year_to_date` actualizado

---

## 17. Gaps conhecidos & roadmap

### 17.1 Gaps técnicos

| Gap | Impacto | Sprint |
|---|---|---|
| Nenhum gold-labels set | Não sabemos se classifier regride | B.0 |
| Latência baseline não está no catálogo | Fórmula de saving usa estimate | B.0 |
| User profile não existe consolidado | Per-user adaptation é fraca | B.0 |
| Shadow mode não existe | Feedback loop depende de humano | B.1 |
| Sem oracle determinístico | Qualidade sempre subjective | B.2 |
| Sem implicit signals | Perdemos 80% do sinal possível | B.2 |
| Sem similarity retro | "Já vi este prompt antes" é cego | B.2 |
| Budget engine incompleto | Sem cap, sem alerts | B.3 |
| Catalog refresh manual | Novos modelos tardam a entrar | B.3 |

### 17.2 Decisões em aberto

- **Namespace**: `/frugal-*` vs `/mooter-*`. Recomendação: `mooter` canónico, `frugal` alias deprecado com aviso.
- **Hub aggregation**: opt-in default, mas UX flow ainda não definido.
- **Training online vs batch**: hoje batch (semanal). Quando user pattern for rico (>1000 prompts), avaliar incremental.
- **Ensemble de juízes**: 99% llama3.2:3b + 1% Opus. Confirmar custo real após Sprint B.1.

### 17.3 Futuro distante (não prioridade)

- Contextual bandit (TensorZero-style) substituindo classifier regex
- Multi-agent ensemble por prompt (2 modelos respondem, juiz decide)
- Federated learning entre users no hub (privacy-preserving)
- Client-side model fine-tuning local do classifier (LoRA sobre distilbert)

---

## 18. Glossário

- **Tier**: T0 (local/Ollama) < T1 (Haiku) < T2 (Sonnet) < T3 (Opus).
- **Baseline**: modelo de referência contra o qual se mede saving. Hoje Opus 4.6.
- **Saving banked**: poupança confirmada com quality_ratio ≥ threshold.
- **Saving pending**: poupança sem evidência de quality retention ainda.
- **Real saving**: `saving_usd > 0 AND quality_ratio ≥ threshold`.
- **Guardrail**: regra que força T3 independentemente do classifier (HIGH_RISK, .env, migrations, etc).
- **Arbiter**: Haiku que resolve casos onde regex classifier tem baixa confiança.
- **Shadow mode**: correr tier-inferior em paralelo ao primary, nightly judge compara.
- **Ground-truth oracle**: verificador determinístico (testes, parsers, regex validators).
- **Implicit signal**: sinal de qualidade inferido sem input humano (followup time, retry, etc).

---

## 19. Contrato com o utilizador

Ao usar o router, o user **recebe**:

1. Routing decisions explicáveis (hint visível, rationale no log).
2. Tripla de métricas transparente em cada sessão: `$saved / +latency / quality%`.
3. Distinção clara entre `confirmed` e `pending` savings.
4. Controle explícito sobre budget, tolerância a latência, e opt-in de features.
5. Purge total dos seus dados a qualquer momento.

O router **nunca**:

1. Reclama poupança sem evidência de quality retention.
2. Envia dados do user para fora do device sem opt-in explícito.
3. Copia código do projecto para logs ou embeddings.
4. Downgrada tier em prompts HIGH_RISK (push, deploy, migrations, secrets).
5. Oculta custo real incorrido.

---

**Este documento evolui.** Cada Sprint subsequente actualiza as secções relevantes (§15 mapa, §16 critérios, §17 gaps). Versão bump em `version.json` campo `methodology_version`.

Fim do documento.
