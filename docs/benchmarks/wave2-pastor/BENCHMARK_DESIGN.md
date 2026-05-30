# Wave 1 Pastor — End-to-End Quality + Cost Benchmark

> **Pre-registration document.** Esta especificação fixa **métricas, prompts, rubrics e thresholds ANTES** da execução. Sem pre-registration, qualquer benchmark vira "data-mining post-hoc": cherry-pick métricas que confirmam a tese. Esta é a primeira garantia de defensibilidade.
>
> **Criado**: 2026-05-27 · **Owner**: Paulo Loureiro · **Estado**: 🟡 design (pré-execução)
> **Master prompt para Claude Code**: `MASTER_PROMPT.md` (companion)

---

## 1. Tese e perguntas a responder

O Wave 1 Day 7 validou *classification accuracy* (recall 100%, p99 3.74ms). **Não validou** qualidade da resposta final nem economia real. Este benchmark responde a quatro perguntas concretas:

1. **Q1 (efeito)**: Pastor (eixos 1+2) produz respostas de qualidade comparável (ou melhor) a baseline (Sonnet always) e gold (Opus always)?
2. **Q2 (custo)**: Quanto $ poupa Pastor vs baseline e vs gold? Por classe de prompt?
3. **Q3 (latência)**: Pastor end-to-end é mais rápido, igual, ou mais lento que baseline?
4. **Q4 (mis-routing)**: Onde Pastor mete a rota errada (pack errado ou tier errado) e como afecta qualidade?

**Critério de "Pastor wins"** (pre-registered):
- Pastor quality_score ≥ 0.9 × baseline quality_score (não cai mais de 10%)
- Pastor cost ≤ 0.5 × baseline cost (poupa ao menos 50%)
- Pastor latency end-to-end ≤ 1.2 × baseline latency (não mais de 20% mais lento)

Se os três satisfeitos → "Pastor wins". Senão, vamos olhar para *onde* falha e signalar para Wave 2.

---

## 2. Os 3 arms experimentais

| Arm | Stack | Pergunta que responde |
|---|---|---|
| **A. Pastor** | `classify_complexity` + `classify_domain` + tier mínimo viável + skills/MCPs do pack + scaffold do pack injectado como system prompt | "É a nossa stack actual fim-a-fim" |
| **B. Baseline naive** | Sonnet 4.6 sempre · zero hints · zero packs · zero skills · system prompt vazio | "Vale o Pastor vs Sonnet bare?" |
| **C. Gold puro** | Opus 4.7 sempre · zero hints · zero packs · zero skills · system prompt vazio | "Quanto perdemos vs gold standard?" |

**Nota crítica**: arm A usa `tier mínimo viável` — significa que Pastor escolhe entre T0 (Ollama local), T1 (Haiku), T2 (Sonnet), T3 (Opus) **conforme classify.js decide**. **Não é Sonnet sempre.** É exactamente o comportamento real do Pastor em produção.

---

## 3. Indicadores medidos (pre-registered)

### 3.1 Eficiência (objectiva, zero ambiguidade)

| Indicador | Como medir | Unidade |
|---|---|---|
| `latency_classifier_ms` | tempo do `classify_complexity + classify_domain` (Pastor only — arms B/C marcam 0) | ms |
| `latency_llm_ms` | tempo da chamada ao modelo (start-to-end stream complete) | ms |
| `latency_total_ms` | wall-clock desde send do prompt até resposta completa | ms |
| `tokens_input` | usage.input_tokens da API response | int |
| `tokens_output` | usage.output_tokens da API response | int |
| `tokens_total` | sum | int |
| `cost_usd` | `tokens_input × price_in + tokens_output × price_out` via `pricing.js` (single source of truth) | float |
| `model_used` | string (claude-opus-4.7, claude-sonnet-4.6, claude-haiku-4.5, qwen3:30b, etc.) | string |
| `tier_routed` | T0/T1/T2/T3 (Pastor only) | string |
| `pack_routed` | pack_id ou "AMBIGUOUS" ou "GENERAL" (Pastor only) | string |
| `pack_confidence` | float 0-1 (Pastor only) | float |

### 3.2 Qualidade (5 dimensões, judge LLM + deterministic onde possível)

Cada dimensão tem **rubric explícita pré-escrita** (secção 4). Judge model: **Claude Sonnet 4.6** (decisão pre-registered).

| Dimensão | Tipo | Como pontuar |
|---|---|---|
| `correctness` | Determinístico onde possível + judge fallback | Para coding/diagrams: testes passam, sintaxe válida, compila. Para outras: judge 0-1 (correcto factualmente vs claim verificável) |
| `completeness` | Judge | 1-5 (1=ignorou metade, 5=cobriu tudo) |
| `relevance` | Judge | 1-5 (1=off-topic, 5=on-topic + adequado ao pack) |
| `actionability` | Judge | 1-5 (1=resposta vaga sem next step, 5=accionável, testes/exemplos concretos) |
| `hallucination` | Judge | 0-1 boolean (1=inventou URLs/APIs/factos não pedidos) |

**Composite quality score**:
```
quality_score = (correctness × 0.30) + (completeness × 0.20) + (relevance × 0.20) + (actionability × 0.20) + (1 - hallucination) × 0.10
```
Pesos pre-registered. Total range: 0-5 (normalizado para 0-1 dividindo por 5).

### 3.3 Mis-routing (Pastor diagnostic)

| Indicador | Como medir |
|---|---|
| `pack_correct` | Boolean: o pack escolhido bate com o pack esperado (definido no test set)? Para ambíguos/GENERAL marcado N/A |
| `tier_appropriate` | Subjective post-hoc: o tier escolhido era adequado para a complexidade real? Judge avalia em separado |
| `would_higher_tier_help` | Boolean: olhando para o output, um tier acima teria produzido resposta materialmente melhor? |

---

## 4. Rubrics (anti-bias do judge)

Cada dimensão tem rubric **dada ao judge** literalmente no prompt. Não inventa critérios.

### 4.1 Correctness rubric

```
Avalia se a resposta é factualmente/tecnicamente correcta.

Para coding tasks:
- 1.0 = código compila + linta clean + (se aplicável) testes passam
- 0.5 = código compila mas tem bugs óbvios ou warnings
- 0.0 = código não compila, syntax error, lib inexistente

Para diagram/yaml tasks:
- 1.0 = sintaxe válida do formato declarado, renderiza
- 0.5 = sintaxe válida mas com inconsistências semânticas
- 0.0 = sintaxe inválida ou impossível de processar

Para audit/review tasks:
- 1.0 = identifica CVE real / vulnerabilidade conhecida no fixture
- 0.5 = identifica problema mas mal classificado
- 0.0 = não identifica problema ou inventa problema inexistente

Para texto/PRD/strategy:
- 1.0 = factos verificáveis correctos, links reais
- 0.5 = mistura de correcto + inferência razoável
- 0.0 = factos errados, URLs inventadas, libs inexistentes

Output: float em {0.0, 0.5, 1.0}
```

### 4.2 Completeness rubric

```
A resposta endereçou TODOS os requisitos do prompt?

5 = todos endereçados explicitamente com profundidade
4 = todos endereçados com alguns superficiais
3 = maioria endereçados, alguns ignorados
2 = ~metade endereçada
1 = só o requisito mais óbvio endereçado, resto ignorado

Output: int 1-5
```

### 4.3 Relevance rubric

```
A resposta é apropriada ao domínio/pack escolhido?

5 = on-topic, usa idioms/libs/patterns do domínio correcto
4 = on-topic mas com algumas referências cross-domain (não erradas)
3 = on-topic mas genérico (poderia ser de qualquer domínio)
2 = parcialmente off-topic, mistura domínios
1 = off-topic ou domínio errado

Output: int 1-5
```

### 4.4 Actionability rubric

```
A resposta dá ao user algo accionável de imediato?

5 = code/yaml/diagram pronto a colar + exemplos + edge cases + caveats
4 = code/exemplos pronto a usar com 1-2 ajustes triviais
3 = explicação correcta mas user precisa de pesquisar para implementar
2 = vago, alto-nível, sem next step concreto
1 = "depende", "vê a docs", sem material útil

Output: int 1-5
```

### 4.5 Hallucination rubric

```
A resposta inventou factos não pedidos nem verificáveis?

Verifica em particular:
- URLs (são reais? respondem? domínios existem?)
- API methods/endpoints (existem na lib referenciada?)
- Names de packages/libs (existem em npm/pypi/cargo?)
- Estatísticas, percentagens, números

0 = nenhuma invenção detectada
1 = pelo menos uma invenção factual material

Output: int 0 ou 1
```

### 4.6 Blind protocol (ANTI-BIAS CRÍTICO)

Para evitar que o judge favoreça arms longos/curtos/familiar style:

1. Os 3 outputs (A/B/C) são apresentados ao judge **sem labels** (output 1, output 2, output 3).
2. **Ordem aleatorizada por prompt** (seed por prompt para reprodutibilidade).
3. Judge não vê tier/modelo/pack — só o prompt original e os 3 outputs anónimos.
4. Judge devolve scores para outputs 1/2/3; o harness mapeia de volta para A/B/C.
5. **Sanity check**: 5 prompts são repetidos com ordens diferentes; variance > 0.3 dispara alerta de judge unreliability.

---

## 5. Os 34 prompts (pre-registered fixture set)

Localizados em `packages/router/scripts/wave1-benchmark/prompts.jsonl` (criados pelo master prompt). Cada um tem:
- `id` (P001 a P034)
- `prompt` (texto literal, PT-PT/EN mistura realista)
- `expected_pack` (animation-web / code-audit / diagram-systems / AMBIGUOUS / GENERAL)
- `expected_tier_floor` (T0/T1/T2/T3 — mínimo aceitável)
- `correctness_check` (opcional: comando determinístico, e.g. "code compiles", "yamllint pass")

### 5.1 Distribuição (balanced)

| Bloco | Pack alvo | N | Notas |
|---|---|---|---|
| 1 | animation-web | 8 | T1 (trivial CSS) → T3 (timeline complex) |
| 2 | code-audit | 8 | T1 (lint) → T3 (architecture audit). Inclui 2 com CVE conhecida em fixture |
| 3 | diagram-systems | 8 | T1 (simple flow) → T3 (C4 system) |
| 4 | AMBIGUOUS | 6 | 2 packs com signals iguais (e.g. "audita esta animação scroll-trigger") |
| 5 | GENERAL | 4 | Tasks sem signal de domínio (e.g. "configura Vercel edge functions") |

### 5.2 Origem dos prompts

Para serem **incontestáveis**, os 34 prompts devem ser:

1. **Realistas**: linguagem natural, mix PT-PT/EN, vagueza real (não "implementa um for loop")
2. **Diversos por tier**: dentro de cada bloco, 25% T1, 50% T2, 25% T3 (proxy para distribuição real)
3. **Independentes**: cada prompt é self-contained (no shared state)
4. **Verificáveis quando possível**: coding tasks têm correctness deterministic check
5. **Pre-registered**: lista fixa, não mudada depois de iniciar o run

**Recomendo redacção pelo Claude Code no início do run** (master prompt instrui), com restrição: nenhum prompt pode ser de domínio que ele *sabe que classifies bem* (anti-selection bias). Master prompt incluí guards.

---

## 6. Statistical considerations (honest)

### 6.1 Sample size

N=34 é **pequeno**. Vamos detectar effect sizes médios-grandes (Cohen's d ≥ 0.5) com poder ~80%. Diferenças subtis (d < 0.3) ficam dentro de "noise". Isto é registado e aceite.

### 6.2 Statistical reporting

Para cada par (Pastor vs Baseline, Pastor vs Gold), report:
- **Effect size** (Cohen's d) → primary
- **Bootstrap 95% CI** (1000 resamples) → primary
- **p-value paired t-test** → secondary (mencionado mas não primary)
- **Distribution plot** (histogram + boxplot) → primary

Pre-commitment: **effect size > p-value para interpretação**. Pequenos p-values com effect sizes triviais não contam como wins.

### 6.3 Multiple comparison

5 dimensões de quality × 3 pares de arms = 15 comparações. Sem correcção, taxa de falso positivo ~50%. Aplicar **Bonferroni**: αadj = 0.05 / 15 = 0.0033 para p-values secundários. Effect sizes não precisam de correcção.

### 6.4 Subjective dimension warning

Completeness/Relevance/Actionability dependem de rubric subjective do judge. Confidence intervals **largos** esperados. Tratar como **directional signal**, não fact.

---

## 7. Anti-bias guards (consolidado)

| Risco de bias | Guard |
|---|---|
| Judge favorece outputs longos | Length log noted; spot-check 3 prompts com penalty for >2× length |
| Judge familiar com Sonnet output style | Blind: outputs apresentados sem identificação do modelo |
| Cherry-pick métricas favoráveis | Pre-registration: este doc fixa as métricas ANTES |
| Selection bias nos prompts | Master prompt instrui Claude Code a gerar prompts antes de saber quais serão os ratings (separation of concerns) |
| Judge variability run-to-run | 5 prompts repetidos para measure judge inter-run agreement; variance > 0.3 alert |
| Cherry-pick conclusões post-hoc | Pre-commit: "Pastor wins" requires 3-of-3 critérios (quality, cost, latency) — definidos no §1 |
| Author = judge bias | Sonnet judge é independente do Pastor; mas Sonnet pode ter ENVIES próprias (ex: favorecer outputs Claude-style). Wave 2 considerar Opus-judge sample como calibration |

---

## 8. Output formats

### 8.1 RAW_RESULTS.jsonl (per-row)

Cada linha = um (prompt, arm) pair. 34 prompts × 3 arms = 102 rows.

```json
{
  "run_id": "wave1-bench-2026-05-27-001",
  "prompt_id": "P003",
  "arm": "A",
  "model_used": "claude-haiku-4.5",
  "tier_routed": "T1",
  "pack_routed": "code-audit",
  "pack_confidence": 0.87,
  "latency_classifier_ms": 4.2,
  "latency_llm_ms": 1832,
  "latency_total_ms": 1841,
  "tokens_input": 245,
  "tokens_output": 412,
  "tokens_total": 657,
  "cost_usd": 0.00043,
  "response": "...full text...",
  "judge_scores": {
    "correctness": 1.0,
    "completeness": 5,
    "relevance": 5,
    "actionability": 4,
    "hallucination": 0
  },
  "quality_score": 0.94,
  "judge_run_id": "judge-run-001",
  "judge_seed_position": 2,
  "pack_correct": true,
  "tier_appropriate": true,
  "would_higher_tier_help": false,
  "timestamp": "2026-05-27T19:32:14Z"
}
```

### 8.2 SUMMARY.json (aggregated)

```json
{
  "run_id": "wave1-bench-2026-05-27-001",
  "n_prompts": 34,
  "n_arms": 3,
  "n_rows": 102,
  "per_arm": {
    "A": { "mean_quality": 0.81, "ci_quality_95": [0.74, 0.87], "mean_cost_usd": 0.0034, "mean_latency_ms": 2104, "model_distribution": {"haiku": 18, "sonnet": 11, "opus": 5} },
    "B": { "mean_quality": 0.85, "ci_quality_95": [0.79, 0.91], "mean_cost_usd": 0.0089, "mean_latency_ms": 2456 },
    "C": { "mean_quality": 0.88, "ci_quality_95": [0.82, 0.93], "mean_cost_usd": 0.0421, "mean_latency_ms": 5102 }
  },
  "pairs": {
    "A_vs_B": { "quality_cohens_d": -0.18, "quality_ci_diff": [-0.10, 0.02], "cost_savings_pct": 0.62, "latency_diff_pct": -0.14, "pastor_wins": "PARTIAL — cost yes, quality close, latency yes" },
    "A_vs_C": { "quality_cohens_d": -0.34, "cost_savings_pct": 0.92, "latency_diff_pct": -0.59, "pastor_wins": "STRONG — cost massive, latency big, quality acceptable gap" }
  },
  "by_pack": {
    "animation-web": { ... per-pack metrics ... },
    "code-audit": { ... },
    "diagram-systems": { ... },
    "AMBIGUOUS": { ... },
    "GENERAL": { ... }
  },
  "mis_routing": {
    "pack_correct_rate": 0.92,
    "tier_appropriate_rate": 0.88,
    "would_higher_tier_help_rate": 0.06,
    "instances_to_review": ["P012", "P023"]
  },
  "judge_reliability": {
    "repeat_variance_mean": 0.15,
    "alert_triggered": false
  },
  "verdict": "Pastor wins on cost (62% vs Sonnet baseline, 92% vs Opus gold), latency wins both, quality gap small (-0.04 vs Sonnet, acceptable). 3-of-3 criteria met for A_vs_C, 2-of-3 for A_vs_B (quality is 0.81 < 0.9 × 0.85 = 0.77 ✓ pass)."
}
```

---

## 9. Honest limitations (que o relatório vai estampar no header)

1. **N=34 é small** — effect sizes pequenos (d < 0.3) ficam em ruído estatístico.
2. **Apenas 3 packs em produção** (animation-web, code-audit, diagram-systems). Outros 4 packs (data-spreadsheet, prd-strategy, voice-tts, knowledge-third-brain) **só existem na PASTOR.md §5 — não foram criados ainda** (Wave 2). Generalização para os 7 não é provável.
3. **Sonnet judge** tem ENVIES próprios (treinado num corpus Anthropic). Calibration com Opus-judge em sample de 5 prompts no Wave 2 recomendada.
4. **Prompts redigidos** (não amostrados de tráfico real) — pode reflectir bias do redactor. Wave 2: extrair sample de `decisions.log` real.
5. **Quality é multi-dimensional** — composite score com pesos é simplificação. Per-dimension report mantido para honestidade.
6. **Cost depende de pricing snapshot** (`pricing.js`). Anthropic ajusta preços; números são point-in-time 2026-05-27.
7. **AMBIGUOUS handling** — quando Pastor escolhe AMBIGUOUS, arm A não invoca nenhum pack scaffold (degrada para tier do classify_complexity sem domain context). Esta é a baseline para "Pastor sem pack útil" — não falha do Pastor.
8. **GENERAL handling** idem — Pastor degrada para tier + system prompt vazio (igual ao arm B nesta classe). É correcto.

---

## 10. O que o relatório final NÃO vai poder afirmar

| Pergunta | Por que não podemos responder com N=34 |
|---|---|
| "Pastor poupa $X/dev/ano" | Sample é point-in-time; precisa de tráfico real de 30+ dias |
| "Pastor é melhor que Cursor/Cline" | Não estamos a benchmarkar contra esses; só os 3 arms |
| "Quality wins por pack X" | N=8 por pack → effect sizes médios são speculative |
| "Os 7 packs vão all-pass" | Só 3 packs em produção; generalização não suportada |

O relatório vai ser **transparente** sobre estas limitações no header. Sem isso, qualquer claim vira "honesty problem" futuro.

---

## 11. Plano da minha análise pós-execução

Quando o Claude Code terminar e me passares o `RAW_RESULTS.jsonl` + `SUMMARY.json`, eu:

1. **Sanity check**: verifico integridade dos dados (102 rows, 5 dimensões por row, sem nulls onde não esperados)
2. **Re-compute** quality_score do meu lado para validar pesos
3. **Bootstrap CIs** (1000 resamples) para per-arm e per-pack
4. **Visualization**: histograms, boxplots, scatter (cost vs quality, latency vs quality)
5. **By-pack drill-down**: onde Pastor vence/perde por categoria
6. **Mis-routing analysis**: review dos instances onde `pack_correct=false` ou `would_higher_tier_help=true`
7. **Sinais para Wave 2**: lista priorizada de melhorias com effect size esperado
8. **Final REPORT.md** em `docs/benchmarks/wave1-pastor/REPORT.md` com:
   - TL;DR (3 frases, "Pastor wins on X, loses on Y, signals Z")
   - Per-arm tables
   - Per-pack drill-down
   - Honest limitations restated
   - Wave 2 priorities

Time-box: ~1-2h de análise minha. Output: documento que **podes mostrar a um VC sem fear of being challenged**.

---

## 12. Pre-registration commitment (assinatura)

Esta especificação é **fixa** a partir do momento em que arrancas o master prompt. Se durante a execução houver bug/discrepância:
- **Bugs técnicos** (parse error, API timeout): documenta + re-run mantendo design
- **Discordâncias com judge** (judge muito ruidoso): regista em "anomalies", não muda metodologia
- **Insights metodológicos** (ex.: "deviamos ter incluído X"): vão para "Wave 2 benchmark roadmap", não retroactive

Esta disciplina é o que torna o resultado **defensável**.

---

## 13. Schema versioning + Lineage (data-engineering best practice)

### 13.1 Schema version

Todos os ficheiros JSONL/JSON têm header `schema_version: "1.0.0"`. Quaisquer mudanças futuras = nova versão + migration script. Sem versão = quebra-tudo silenciosa.

### 13.2 Lineage block (mandatory em cada row)

Cada row em `RAW_RESULTS.jsonl` inclui um objecto `lineage`:

```json
{
  "lineage": {
    "run_id": "01HZ8W3X4Y5N6P7Q8R9S0T1V2W",   // UUIDv7 sortable (timestamp embedded)
    "event_id": "01HZ8W3X4Y5N6P7Q8R9S0T1V2W-P003-A",  // idempotency key
    "schema_version": "1.0.0",
    "pastor_version": "v0.1.0-pastor-wave1",   // git tag pinned
    "commit_sha": "1d8a0da",                   // exact commit benched
    "pricing_version": "pricing-snapshot-2026-05-27", // pricing.js snapshot
    "ollama_version": "0.5.x",
    "anthropic_sdk_version": "0.x.x",
    "node_version": "v20.20.x",
    "env_hash": "sha256_of_normalized_env",    // hardware + os
    "user_id": "anonymous-hash-or-null",       // ver §16
    "session_id": "anonymous-hash-or-null"
  }
}
```

Razão: cada data-point é **trace-able** ao código exacto, preço exacto, env exacto. Reproduzibilidade a 12 meses garantida.

### 13.3 Numeric precision

- `cost_usd` → store em `cost_micros` (integer microUSD: $0.00043 = 430 micros). Floating point em USD perde precisão em aggregations.
- `latency` em milliseconds (integer, não float)
- `pack_confidence` em 4 casas decimais (0.0000-1.0000)

### 13.4 Idempotency

`event_id` = `{run_id}-{prompt_id}-{arm}` ⇒ unique constraint. Re-running mesmo prompt no mesmo arm na mesma run **substitui** a row anterior (idempotent). Anti-bug "row duplicado" que polui aggregations.

### 13.5 Output formats (additional)

Além de JSONL + JSON, gerar também:
- `RAW_RESULTS.parquet` (columnar, analytics-friendly via DuckDB)
- `SUMMARY.parquet` (idem)
- `queries.sql` — 8-10 queries pre-canned DuckDB para análise rápida (por arm, por pack, por tier, mis-routing focus, etc.)

DuckDB workflow:
```sql
duckdb -c "SELECT pack_routed, AVG(quality_score), SUM(cost_micros)/1e6 FROM 'outputs/RAW_RESULTS.parquet' WHERE arm='A' GROUP BY pack_routed;"
```

---

## 14. Cloudflare Hub integration (hub-ready desde já)

### 14.1 Estado actual

- `frugal-hub.workers.dev` está live (Cloudflare Workers + D1 + R2 + trust_score)
- Tem endpoints: `POST /api/delta` (router-tuning), `GET /api/stats`, `GET /api/models`
- **Não tem** `/api/bench` ainda

### 14.2 Decisão para esta run

Schema do `RAW_RESULTS` desenhado **hub-compatible** desde Já. Mas **NÃO faz upload nesta run** (skip para Wave 2 quando hub ganha `/api/bench`).

A escolha:
1. Esta primeira run: 100% local (sem dependência externa, full control para validation)
2. Schema hub-ready: nas próximas runs, flag `--upload-to-hub` activa upload
3. Wave 2 task: adicionar `POST /api/bench/event` + D1 schema `bench_run`, `bench_event`, `bench_judge_score` ao hub (~1-2h de work)

### 14.3 D1 schema previsto (para Wave 2)

```sql
CREATE TABLE bench_run (
  run_id TEXT PRIMARY KEY,
  pastor_version TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  pricing_version TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  n_prompts INTEGER NOT NULL,
  n_arms INTEGER NOT NULL,
  total_cost_micros BIGINT NOT NULL,
  judge_model TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'in_progress', 'completed', 'aborted'
  uploaded_by_user_id TEXT,
  trust_score REAL DEFAULT 0.5
);

CREATE TABLE bench_event (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES bench_run(run_id),
  prompt_id TEXT NOT NULL,
  arm TEXT NOT NULL,
  model_used TEXT NOT NULL,
  tier_routed TEXT,
  pack_routed TEXT,
  pack_confidence REAL,
  latency_classifier_ms INTEGER,
  latency_llm_ms INTEGER,
  latency_total_ms INTEGER,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_micros BIGINT,
  quality_score REAL,
  pack_correct BOOLEAN,
  tier_appropriate BOOLEAN,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE bench_judge_score (
  judge_event_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES bench_event(event_id),
  dimension TEXT NOT NULL,  -- correctness, completeness, etc.
  score REAL NOT NULL,
  judge_run_id TEXT,
  judge_seed_position INTEGER  -- blind order
);

CREATE INDEX idx_bench_event_run_arm ON bench_event(run_id, arm);
CREATE INDEX idx_bench_event_pack ON bench_event(pack_routed);
```

### 14.4 R2 archive

`RAW_RESULTS.parquet` por `run_id` em R2 path `s3://frugal-hub-storage/benchmarks/{run_id}/RAW_RESULTS.parquet`. Mantém forever (cold archive). Permite re-análise + cross-run comparison.

### 14.5 Trust score recipe

Mesmo padrão que router-tuning:
- +0.1 por upload com schema válido
- +0.2 se métricas se confirmam em production decisions.log (within 14d)
- −0.3 se anomalies > 20% das rows
- TTL 180d → trust × 0.5

---

## 15. Data lake unification (produção + backtest)

### 15.1 Estado actual fragmentado

| Source | Storage | Schema |
|---|---|---|
| Produção real | `decisions.log` JSONL local (HTTP :7821) | Per-decision: prompt_hash, tier, model, latency, tokens, cost — sem quality |
| Backtest | `RAW_RESULTS.jsonl` local (este harness) | Tudo o de cima + quality dimensions + lineage + arm |

Schemas divergem. Sem query layer comum. Sem retention.

### 15.2 Schema unificado proposto: `mooter_event`

Common columns (sempre presentes):
```typescript
type MooterEvent = {
  event_type: 'prod' | 'bench';
  event_id: string;          // unique idempotent
  run_id: string | null;     // null para prod
  timestamp: string;          // ISO8601 UTC
  prompt_hash: string;        // SHA-256 do prompt
  tier_routed: 'T0' | 'T1' | 'T2' | 'T3';
  pack_routed: string | null;
  pack_confidence: number | null;
  model_used: string;
  latency_classifier_ms: number;
  latency_llm_ms: number;
  latency_total_ms: number;
  tokens_input: number;
  tokens_output: number;
  cost_micros: number;
  lineage: LineageBlock;
};

// Bench-only extras (null em prod)
type BenchEvent = MooterEvent & {
  event_type: 'bench';
  prompt_id: string;
  arm: 'A' | 'B' | 'C';
  expected_pack: string;
  expected_tier_floor: string;
  quality_scores: QualityDimensions;
  quality_score: number;
  pack_correct: boolean | null;
};
```

### 15.3 Storage tier strategy

| Tier | Onde | Quando | Retention |
|---|---|---|---|
| Hot | Local JSONL + DuckDB | Activo, queries diárias | 90 dias |
| Warm | Daily Parquet local (`~/.mooter/cache/parquet/YYYY-MM-DD.parquet`) | Compactado nightly cron | 365 dias |
| Cold | R2 partitioned (`s3://frugal-hub-storage/events/year=2026/month=05/day=27/`) | Upload semanal opt-in | Indefinite (k-anon) |

### 15.4 Query layer

DuckDB faz query directa em Parquet:

```sql
-- Cost por dia, por tier
SELECT date_trunc('day', timestamp) AS day, tier_routed, SUM(cost_micros)/1e6 AS cost_usd
FROM read_parquet('~/.mooter/cache/parquet/*.parquet')
WHERE event_type='prod'
GROUP BY day, tier_routed
ORDER BY day DESC;

-- Mis-routing rate por pack (bench only)
SELECT pack_routed, AVG(CASE WHEN pack_correct THEN 1.0 ELSE 0.0 END) AS accuracy
FROM read_parquet('~/.mooter/cache/parquet/*.parquet')
WHERE event_type='bench' AND arm='A'
GROUP BY pack_routed;
```

Zero infra — DuckDB é single-binary, ~10MB, runs anywhere.

### 15.5 ETL no harness deste benchmark

Após bench run, o orchestrator faz:
1. Append events a `~/.mooter/cache/events/2026-05-27.jsonl`
2. Compact em `~/.mooter/cache/parquet/2026-05-27.parquet` (overwrite)
3. Symlink `~/.mooter/cache/parquet/latest.parquet → 2026-05-27.parquet`

Wave 2 task: cron daily para fazer isto automaticamente em produção.

---

## 16. Per-user telemetry roadmap

### 16.1 Hoje

- Single-user (Paulo). Não há multi-user.
- `decisions.log` é local, sem `user_id`.
- PII normalizer existe (`tools/router/privacy.js` ou similar — mencionado em Sprint B 2026-04-16) mas não está activo no decisions.log actual.

### 16.2 No benchmark (este run)

- `lineage.user_id` = `null` (single-user benchmark local)
- `lineage.session_id` = UUIDv7 da run, único
- PII normalizer **activado** no harness — mesmo que prompts sejam fixed, prática consistente

### 16.3 Quando houver multi-user (Wave 4 launch público)

`lineage.user_id` populado com:
```
user_id = sha256(hardware_fingerprint + local_salt)
```
- `hardware_fingerprint` = CPU model + RAM size + OS (rough — para clusterizar perfis sem identificar)
- `local_salt` = random gerado one-time no first-run, guardado em `~/.mooter/local-salt`
- Hash final é **anonymous** (não-reversível), mas **stable** (mesmo user → mesmo id)
- User pode rotacionar: `mooter telemetry rotate-id` regenera salt → novo user_id (fingerprint perdido)

### 16.4 Federated privacy (Layer 11 do V4)

Quando o hub agregar:
- k-anonymity ≥ 50 enforced (rejeitar batches < 50 contributors)
- Differential Privacy noise (Laplace, ε=1.0) nos aggregates
- Open-source aggregator code (auditable)
- Cada user pode `mooter telemetry export` + `mooter telemetry delete-mine` (GDPR-ish self-service)

### 16.5 Schema para o data lake futuro

```typescript
type DataLakeRow = MooterEvent & {
  user_id: string;           // anonymous hash
  session_id: string;        // anonymous UUID
  contributed_at: string;    // when uploaded to hub
  consent_version: string;   // privacy consent version aceite
};
```

Wave 4 task: implementar `POST /api/events` no hub com k-anon enforcement + opt-in flow.

---

## 17. Reproducibility — version pinning

### 17.1 Pin do código

Antes da run:
```bash
cd ~/mooter
git fetch --tags
git checkout v0.1.0-pastor-wave1   # tag canónica
# OU: git checkout 1d8a0da          # commit canónico
```

A run benchmarks **exactamente este código**, não `main` corrente. Garante reproducibility 12+ meses.

### 17.2 Pricing snapshot

Cria `~/mooter/data/pricing-snapshot-2026-05-27.json`:
```json
{
  "snapshot_date": "2026-05-27",
  "anthropic_pricing_url": "https://docs.anthropic.com/...",
  "models": {
    "claude-opus-4.7": { "input_per_mtok": 15.00, "output_per_mtok": 75.00 },
    "claude-sonnet-4.6": { "input_per_mtok": 3.00, "output_per_mtok": 15.00 },
    "claude-haiku-4.5": { "input_per_mtok": 0.80, "output_per_mtok": 4.00 }
  },
  "ollama_local_cost": 0.0,
  "pricing_js_sha256": "..."
}
```

Backtest usa **este snapshot**, não `pricing.js` live. Garantia: re-run em 12 meses produz mesmos números $.

### 17.3 Env hash

```bash
ENV_HASH=$(uname -srm)$(node --version)$(npm --version)
ENV_HASH=$(echo "$ENV_HASH" | sha256sum | head -c 16)
```

Incluido em cada row. Diferenças entre runs → debugging futuro.

### 17.4 SDK versions pinned

`packages/router/package.json` lockfile pinned. Não fazer `npm update` antes da run.

### 17.5 Ollama version

```bash
OLLAMA_VERSION=$(curl -s http://localhost:11434/api/version | jq -r .version)
```

Incluido em lineage. Mudanças no qwen3:30b inference → debugging futuro.

---

## 19. Checklist pré-execução actualizada (v2 — com refinamentos §13-§17)

- [ ] Lês este documento até ao fim (§1-§17)
- [ ] Concordas com pesos do composite quality_score (§3.2)
- [ ] Concordas com "Pastor wins" criteria (§1)
- [ ] Confirmas que vais ter ~$50 budget para a run (3 arms × 34 prompts + judge)
- [ ] Confirmas que tens ~1-2h para acompanhar (não bloqueia para outra coisa)
- [ ] Tag `v0.1.0-pastor-wave1` existe (git fetch --tags && git tag --list | grep wave1)
- [ ] Pricing snapshot criado em `data/pricing-snapshot-2026-05-27.json` (master prompt vai criar se não existe)
- [ ] Branch git nova `wave1-benchmark` criada a partir do tag (NÃO de main): `git checkout v0.1.0-pastor-wave1 && git checkout -b wave1-benchmark`
- [ ] DuckDB CLI instalado opcional para queries post-hoc (`brew install duckdb` / `apt install duckdb` / standalone binary). Master prompt corre Parquet write sem DuckDB CLI.

Quando ✓ todos os 9: avança para `MASTER_PROMPT.md` ao lado.

---

*Pre-registration assinada 2026-05-27. Esta versão é canónica para a run wave1-bench-2026-05-27-001. Qualquer alteração subsequente requer novo run-id e nota de "exploratory" no relatório.*
