# MASTER PROMPT — Wave 1 Pastor End-to-End Benchmark

> **Como usar**: copia tudo abaixo de `=== START ===` para uma nova sessão Claude Code em `~/mooter/`. Self-contained, pre-registered, reproduzível.
>
> **Pré-condições**:
> - Wave 1 mergeada em `main` (commit `1d8a0da`) e tagged `v0.1.0-pastor-wave1` — done 2026-05-27
> - `ANTHROPIC_API_KEY` no ambiente (vais consumir ~$50, cap $80)
> - **Branch `wave1-benchmark` criada a partir do TAG (não de main)**:
>   ```bash
>   cd ~/mooter && git fetch --tags
>   git checkout v0.1.0-pastor-wave1
>   git checkout -b wave1-benchmark
>   ```
> - Leste `BENCHMARK_DESIGN.md` (incluindo §13-§17 sobre schema, hub, data lake, telemetry, versioning) e concordas com pré-registo

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code em `~/mooter/`, branch `wave1-benchmark`. A missão é executar a **bateria de benchmark end-to-end do Pastor Wave 1** conforme `docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md` (pre-registered).

**Não és executor cego.** Lês o design completo, executas com disciplina, registas anomalias, mas **não alteras a metodologia** durante a run. Anomalias → secção "Anomalies" do relatório, não mudança de design.

## 1. Leitura obrigatória (primeiros 10 min)

1. `~/frugal/docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md` — pre-registration completa (este é o contrato)
2. `~/frugal/docs/strategy/PASTOR.md` §5 (especificação dos 3 packs em produção) e §6 (formato pack-hint)
3. `~/mooter/packages/router/src/classify_complexity.ts`, `classify_domain.ts`, `pack_resolve.ts`, `hooks/inject_context.ts` — a stack do Pastor
4. `~/mooter/tools/router/pricing.js` — single source of truth para custos
5. `~/mooter/packages/router/scripts/validate-wave1.ts` — referência do harness Day 7 (vamos estender, não duplicar)

## 2. Princípios non-negotiable

- **P1** Pre-registration é contrato. Métricas, prompts e rubrics fixados em `BENCHMARK_DESIGN.md` não mudam durante a run.
- **P2** Blind judging obrigatório. Judge vê outputs sem labels de arm/modelo.
- **P3** PT-PT na conversa, EN no código.
- **P4** Não inventar URLs, packages, APIs. Se precisas de package real, valida em web ou marca UNVERIFIED.
- **P5** Não fazer `git add -A`. Commits selectivos.
- **P6** Não fazer push para `main`. PR para `dev` no fim (ou drop branch se preferires não merge).
- **P7** Pricing via `tools/router/pricing.js` — não inventes números.
- **P8** Anomalies → secção "Anomalies" do relatório, não modificação do design.

## 3. Estrutura de outputs

Cria `~/mooter/packages/router/scripts/wave1-benchmark/`:

```
wave1-benchmark/
├── prompts.jsonl                # 34 prompts pre-registered (criar Step 5)
├── run.ts                       # orchestrator (Step 6)
├── judge.ts                     # blind Sonnet judge (Step 7)
├── lib/
│   ├── arm-pastor.ts            # arm A invocation
│   ├── arm-baseline.ts          # arm B (Sonnet bare)
│   ├── arm-gold.ts              # arm C (Opus bare)
│   ├── deterministic-checks.ts  # compile/lint/yamllint para correctness
│   └── stats.ts                 # bootstrap CIs, Cohen's d
├── outputs/
│   ├── RAW_RESULTS.jsonl        # 102 rows (34 prompts × 3 arms)
│   ├── JUDGE_LOG.jsonl          # cada judge call para auditabilidade
│   ├── SUMMARY.json             # aggregated metrics
│   └── anomalies.md             # qualquer surpresa registada (vazio se nada)
└── README.md                    # como reproduzir
```

**Resultados finais entregues em commits selectivos**, NÃO mergear para `main`. PR para `dev` opcional.

## 4. Fases de execução

### Fase A — Setup + scaffold + version pinning (~40 min)

1. **Pinning crítico**: confirma que estás no tag, não em main:
   ```bash
   git describe --tags --exact-match  # deve mostrar v0.1.0-pastor-wave1
   git branch --show-current          # deve mostrar wave1-benchmark
   ```
   Se não estiver no tag → para e pergunta. Não correr benchmark contra main inseguro.

2. **Pricing snapshot** (reproducibility §17.2): cria `~/mooter/data/pricing-snapshot-2026-05-27.json` com:
   ```json
   {
     "snapshot_date": "2026-05-27",
     "anthropic_pricing_url": "https://docs.anthropic.com/en/docs/about-claude/pricing",
     "models": {
       "claude-opus-4.7": { "input_per_mtok": 15.00, "output_per_mtok": 75.00 },
       "claude-sonnet-4.6": { "input_per_mtok": 3.00, "output_per_mtok": 15.00 },
       "claude-haiku-4.5": { "input_per_mtok": 0.80, "output_per_mtok": 4.00 }
     },
     "ollama_local_cost_usd": 0.0,
     "pricing_js_sha256": "<compute via shasum tools/router/pricing.js>"
   }
   ```
   Se preços actuais em `tools/router/pricing.js` divergirem, **alinhar primeiro** ou marcar como anomaly.

3. Mkdir: `mkdir -p packages/router/scripts/wave1-benchmark/{lib,outputs,fixtures}`

4. Scaffold ficheiros TS:
   - `run.ts` (orchestrator)
   - `judge.ts` (blind Sonnet judge)
   - `lib/arm-pastor.ts`, `arm-baseline.ts`, `arm-gold.ts`
   - `lib/deterministic-checks.ts`
   - `lib/stats.ts` (bootstrap, Cohen's d)
   - `lib/lineage.ts` — **NOVO** — gera lineage block (§13.2) com env_hash, versions, run_id UUIDv7
   - `lib/event-emitter.ts` — **NOVO** — append a JSONL + Parquet + opcional hub POST
   - `lib/privacy.ts` — **NOVO** — PII normalizer (rip de tools/router se existe, senão skeleton)
   - `lib/parquet-write.ts` — **NOVO** — usa `@dsnp/parquetjs` ou similar para write Parquet

5. `cd packages/router && npm install` — instala se preciso:
   - `@anthropic-ai/sdk`
   - `@dsnp/parquetjs` ou `apache-arrow` para Parquet write
   - `uuid` (v7 support)

6. **Schema files**:
   - `schemas/event-schema-v1.0.0.json` — JSON Schema para validation
   - `schemas/lineage-schema-v1.0.0.json` — idem
   - Runtime validation via `ajv` (simples) ou similar

7. Commit `feat(bench): scaffold harness · schema v1.0.0 · lineage + Parquet + pricing snapshot`

### Fase B — Gerar os 34 prompts (~20 min)

⚠️ **Order critical**: gera prompts **ANTES** de teres visto qualquer resultado. Anti-selection bias.

Cria `packages/router/scripts/wave1-benchmark/prompts.jsonl` com **34 linhas**, distribuição §5.1 do BENCHMARK_DESIGN.md:

- 8 prompts animation-web (2 T1, 4 T2, 2 T3)
- 8 prompts code-audit (2 T1, 4 T2, 2 T3, com 2 incluindo CVE fixture)
- 8 prompts diagram-systems (2 T1, 4 T2, 2 T3)
- 6 prompts AMBIGUOUS (2 packs com signals iguais)
- 4 prompts GENERAL (sem signal de domínio)

**Critérios para cada prompt**:
- Realistas (linguagem natural, mix PT-PT/EN)
- Vagueza real (não over-specified)
- Self-contained (no shared state entre prompts)
- Para coding tasks: incluir `correctness_check` (comando deterministic)
- Para CVE prompts: usar fixture com vulnerabilidade conhecida (e.g. SQL injection padrão, XSS, hardcoded secret) — fica em `fixtures/cve-XX/`

Schema de cada linha (JSON):
```json
{
  "id": "P001",
  "block": "animation-web",
  "prompt": "...",
  "expected_pack": "animation-web",
  "expected_tier_floor": "T2",
  "correctness_check": "npx tsx check.ts" // ou null
}
```

Commit: `feat(bench): pre-registered 34 prompts (animation-web, code-audit, diagram-systems, AMBIGUOUS, GENERAL)`

### Fase C — Implementar as 3 arms (~45 min)

#### arm-pastor.ts (arm A)
- Importa `classify_complexity` + `classify_domain` + `pack_resolve` + scaffold loading
- Per prompt: classifica, escolhe tier, carrega `scaffold.md` do pack se aplicável, monta system prompt
- Invoca modelo correspondente ao tier:
  - T0 → Ollama qwen3:30b (via `tools/router/ollama_call.sh` ou wrapper TS)
  - T1 → Haiku 4.5 (Anthropic SDK)
  - T2 → Sonnet 4.6 (Anthropic SDK)
  - T3 → Opus 4.7 (Anthropic SDK)
- Captura latências (classifier, LLM, total), tokens, cost via `pricing.js`

#### arm-baseline.ts (arm B)
- Invoca Sonnet 4.6 sempre, system prompt vazio
- Captura métricas mesmo schema

#### arm-gold.ts (arm C)
- Invoca Opus 4.7 sempre, system prompt vazio
- Captura métricas mesmo schema

**Output schema por arm** (alinhado com §13 BENCHMARK_DESIGN — lineage obrigatório, microUSD para cost):
```json
{
  "event_id": "01HZ8W3X4Y5N6P7Q8R9S0T1V2W-P001-A",
  "schema_version": "1.0.0",
  "event_type": "bench",
  "lineage": {
    "run_id": "01HZ8W3X4Y5N6P7Q8R9S0T1V2W",
    "pastor_version": "v0.1.0-pastor-wave1",
    "commit_sha": "1d8a0da",
    "pricing_version": "pricing-snapshot-2026-05-27",
    "ollama_version": "0.5.x",
    "anthropic_sdk_version": "0.x.x",
    "node_version": "v20.20.x",
    "env_hash": "sha256:abc123...",
    "user_id": null,
    "session_id": "01HZ8W3X4Y5N6P7Q8R9S0T1V2X"
  },
  "prompt_id": "P001",
  "arm": "A",
  "model_used": "claude-haiku-4-5",
  "tier_routed": "T1",
  "pack_routed": "code-audit",
  "pack_confidence": 0.8723,
  "latency_classifier_ms": 4,
  "latency_llm_ms": 1832,
  "latency_total_ms": 1841,
  "tokens_input": 245,
  "tokens_output": 412,
  "cost_micros": 430,
  "response": "...",
  "timestamp": "2026-05-27T19:32:14.523Z"
}
```

⚠️ **Mudanças vs v1 do design**:
- `cost_usd` → `cost_micros` (integer)
- `event_id` adicionado (idempotency)
- `lineage` block obrigatório
- `schema_version` no top-level
- `event_type: "bench"` (distinguir de prod events)

Commit: `feat(bench): 3-arm invocation harness · schema v1.0.0 com lineage + cost_micros`

### Fase D — Implementar judge (~30 min)

#### judge.ts
- Invocado para cada prompt **uma única vez** com **3 outputs** (de A, B, C)
- **Order randomization**: posições 1/2/3 atribuídas por seed determinístico baseado em prompt_id
- **Sem labels** de arm/modelo nos outputs apresentados
- Judge é Sonnet 4.6 com rubrics literais do §4 do BENCHMARK_DESIGN.md
- Output: scores para outputs 1/2/3 (depois mapeados back para A/B/C)

**Anti-bias measures** (obrigatórios):
1. Length awareness logged (não corrigido, mas auditado)
2. 5 prompts repetidos com nova ordem para measure variance (judge reliability check)
3. Hallucination check inclui verificação determinística (URL HEAD request, npm package existence) onde feasible

#### deterministic-checks.ts
- Para correctness: corre `correctness_check` do prompt se aplicável
- Para coding: tenta compilar, lint
- Para diagrams: yamllint, mermaid syntax check
- Fallback para judge se determinístico não aplicável

Commit: `feat(bench): blind Sonnet judge with rubric + deterministic correctness checks`

### Fase E — Run completa (~45-60 min runtime)

1. **Pre-flight validation**:
   - JSON Schema validation no `prompts.jsonl` (34 rows, todos com campos obrigatórios)
   - `lineage.ts` computa lineage block uma vez (env_hash, versions) — guardado em `outputs/lineage-snapshot.json`
   - DRY-RUN: 1 prompt × 3 arms para validar pipeline (~$0.50). Se OK, segue para full.

2. `tsx run.ts --output outputs/ --schema-validate`

3. Sequence:
   - For each prompt P001-P034:
     - For arm in [A, B, C]:
       - Invoca arm
       - Construct event com lineage + idempotent event_id
       - Schema-validate antes de append
       - Append a `RAW_RESULTS.jsonl`
   - For each prompt:
     - Invoca judge (3 outputs blind), append a `JUDGE_LOG.jsonl` (cada judge call = 1 row separada com `judge_event_id`, lineage, seed_position)
     - Append judge scores ao row correspondente em `RAW_RESULTS.jsonl` (lookup by event_id)

4. **Parquet write** (§13.5 BENCHMARK_DESIGN):
   - `RAW_RESULTS.parquet` (columnar do JSONL completo)
   - `JUDGE_LOG.parquet`
   - `SUMMARY.parquet`

5. **Compute SUMMARY.json** via `stats.ts`:
   - Bootstrap 1000× para CIs (95%)
   - Cohen's d para cada par (A_vs_B, A_vs_C)
   - Per-pack drill-down
   - Mis-routing analysis
   - Judge reliability (5 prompts repetidos com nova seed)

6. **Data lake unification** (§15.5 BENCHMARK_DESIGN):
   - Append eventos a `~/.mooter/cache/events/2026-05-27.jsonl` (hot tier)
   - Compact em `~/.mooter/cache/parquet/2026-05-27.parquet` (warm tier)
   - Symlink `latest.parquet → 2026-05-27.parquet`

7. **Pre-canned DuckDB queries** em `outputs/queries.sql`:
   ```sql
   -- Q1: Cost savings por arm vs gold (C)
   SELECT arm, SUM(cost_micros)/1e6 AS total_usd FROM 'outputs/RAW_RESULTS.parquet' GROUP BY arm;

   -- Q2: Quality por pack
   SELECT pack_routed, AVG(quality_score) FROM 'outputs/RAW_RESULTS.parquet' WHERE arm='A' GROUP BY pack_routed;

   -- Q3: Mis-routing breakdown
   SELECT pack_routed, expected_pack, COUNT(*) FROM 'outputs/RAW_RESULTS.parquet' WHERE arm='A' GROUP BY pack_routed, expected_pack ORDER BY COUNT(*) DESC;

   -- Q4..Q8 — adiciona mais 4-6 queries úteis (latency dist, judge variance, tier vs quality, hallucination rate, completeness por block)
   ```

8. Anomalies (se algum): append a `outputs/anomalies.md`. Formato Markdown com timestamp + descrição + impact + decisão.

**Estado de progresso**: imprime cada 5 prompts (running cost incluído).

**Retry policy**: API error/timeout → retry 3× com exponential backoff (1s, 4s, 16s) → marca FAILED + log + continua.

**Cost monitor**: $30 alert · $80 hard cap (pause + perguntar).

**Hub-readiness (NÃO upload nesta run)** — apenas validar:
- Schema bate com `bench_event` table prevista (§14.3 BENCHMARK_DESIGN)
- Output incluí todos os campos que o hub vai aceitar
- Log mensagem: "Hub upload skipped — endpoint /api/bench not yet deployed (Wave 2 task)"

Commit: `chore(bench): execute wave1-benchmark · RAW_RESULTS + Parquet + JUDGE_LOG + SUMMARY + queries`

### Fase F — Análise mínima local + handoff (~20 min)

⚠️ **NÃO interpretar resultados profundamente**. Isto é trabalho do Cowork (Paulo).

Gera `outputs/README.md` com:
- Run-id, timestamp, total cost real
- Versions snapshot (pastor, pricing, sdk, ollama, env_hash)
- Counts (102 expected, X completed, Y failed)
- File listing (RAW_RESULTS.jsonl, .parquet, JUDGE_LOG.jsonl, .parquet, SUMMARY.json, .parquet, queries.sql, anomalies.md)
- Headline numbers (mean quality, cost, latency por arm) — apenas factos, sem interpretação
- Link para BENCHMARK_DESIGN.md para o leitor entender o que significam os números
- Lista de anomalies se houve
- **Instructions para reprodução**: como re-correr com mesmo design (checkout tag, npm install, tsx run.ts)
- **Instructions para análise**: como abrir Parquet em DuckDB / Python pandas / R

Commit: `docs(bench): run summary + handoff to Cowork analysis`

Final commit do dia: `docs(sync): Wave 1 benchmark complete · handoff to Cowork analysis · run_id=<uuid>`

## 5. Quando parar e perguntar

- Cost passa $80 → pausa, pergunta antes de continuar
- API rate limit persistente (>5 retries falham) → pausa, pergunta
- Judge variance > 0.3 em sanity check (5 repeats) → pausa, regista anomaly, pergunta se mantém ou aborta
- Algum prompt impossível de gerar (e.g. precisas de inventar lib) → reescreve para algo verificável (não inventes)
- Discrepância material entre BENCHMARK_DESIGN.md e realidade do ambiente → para e pergunta

## 6. Constraints (do BENCHMARK_DESIGN.md)

- ❌ Não fazer push para `main`
- ❌ Não modificar `BENCHMARK_DESIGN.md` durante a run
- ❌ Não inventar dados (URLs, packages, vulnerabilities)
- ❌ Não cherry-pick métricas — todas as 5 dimensões de quality sempre reported
- ❌ Não comprimir o relatório para "fazer Pastor parecer melhor"
- ⚠️ Cost cap $80 (1.6× estimate $50). Se atingir, pausa.

## 7. Definition of Done

### Outputs canónicos
- [ ] 34 prompts em `prompts.jsonl` (pre-registered) + JSON Schema validated
- [ ] 102 rows em `RAW_RESULTS.jsonl` (34 × 3 arms; ≤ 5% FAILED ok se documented)
- [ ] `RAW_RESULTS.parquet` gerado (columnar)
- [ ] `JUDGE_LOG.jsonl` + `JUDGE_LOG.parquet` (cada judge call auditável)
- [ ] `SUMMARY.json` + `SUMMARY.parquet` (per-arm, per-pack, mis-routing, judge reliability, bootstrap CIs, Cohen's d)
- [ ] `queries.sql` (≥8 DuckDB queries pre-canned)
- [ ] `anomalies.md` (vazio ou populado)
- [ ] `lineage-snapshot.json` (versions + env_hash do run)
- [ ] `outputs/README.md` (handoff factos-only com instructions de reprodução)

### Data lake unification
- [ ] `~/.mooter/cache/events/2026-05-27.jsonl` populado
- [ ] `~/.mooter/cache/parquet/2026-05-27.parquet` compactado
- [ ] `~/.mooter/cache/parquet/latest.parquet` symlink

### Schema + lineage
- [ ] Cada row tem `schema_version: "1.0.0"`
- [ ] Cada row tem `event_id` único (idempotent)
- [ ] Cada row tem `lineage` block completo (pastor_version, commit_sha, pricing_version, env_hash, ...)
- [ ] Schema JSON validation passa em 100% das rows

### Reproducibility (§17)
- [ ] Run executada contra tag `v0.1.0-pastor-wave1` (não main)
- [ ] `pricing-snapshot-2026-05-27.json` usado (não pricing.js live)
- [ ] `lineage-snapshot.json` incluí ollama_version, sdk_version, node_version, env_hash

### Hub-readiness (validação only, sem upload)
- [ ] Schema bate com tabelas previstas em §14.3 BENCHMARK_DESIGN
- [ ] Log mensagem confirmando "ready to upload when /api/bench endpoint exists"

### Commits + branch
- [ ] 7+ commits selectivos (scaffold, prompts, arms, judge, run, outputs, sync)
- [ ] Branch `wave1-benchmark` pushed para origin
- [ ] PR `wave1-benchmark → dev` aberto (NÃO merged) ou branch deixada localmente
- [ ] Paulo notificado para análise pelo Cowork

## 8. Starter command (cola na primeira sessão)

```
Olá. Sou Claude Code em ~/mooter/, branch wave1-benchmark @ tag v0.1.0-pastor-wave1.

Passos iniciais:
1. Leio ~/frugal/docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md ao fim (§1-§19, ATENÇÃO especial a §13-§17 sobre schema/hub/lineage/pinning).
2. Confirmo precondições:
   - git describe --tags --exact-match → v0.1.0-pastor-wave1
   - git branch --show-current → wave1-benchmark
   - ANTHROPIC_API_KEY no env
   - cd packages/router && npm install (+ parquet lib, uuid, ajv)
   - Ollama acessível (curl localhost:11434/api/tags)
   - data/pricing-snapshot-2026-05-27.json existe ou criar
3. Plano de execução em 6 fases:
   - Fase A: Setup + scaffold + version pinning + schema files (~40 min)
   - Fase B: 34 prompts pre-registered (~20 min)
   - Fase C: 3 arms (Pastor, baseline, gold) (~45 min)
   - Fase D: blind Sonnet judge + deterministic checks (~30 min)
   - Fase E: Run completa + Parquet + data lake unification (~50 min runtime)
   - Fase F: Handoff factos-only (~20 min)

Antes de gerar os 34 prompts (Fase B), pergunto ao Paulo se há domínio que ele quer reforçar ou se um sample mais realista (extraído de decisions.log) é preferível.

Total estimado: ~3.5h. Cost ~$50 (cap $80).

Princípios non-negotiable:
- Pre-registration é contrato (P1 do master prompt)
- Schema v1.0.0 + lineage obrigatórios em cada row (§13 design)
- Pinning: run contra tag, não main (§17 design)
- Schema hub-ready mas SEM upload nesta run (§14 design)

Ready. Começo agora pela leitura?
```

=== END ===

---

## Notas para o Paulo (não vão para Claude Code)

- **Quando o Claude Code terminar**, o que tu fazes:
  1. Confirmas que `outputs/RAW_RESULTS.jsonl`, `JUDGE_LOG.jsonl`, `SUMMARY.json` existem
  2. Commitas tudo em `wave1-benchmark` branch (Claude Code já o faz, mas confirma)
  3. **NÃO mergeas para main ainda** — quero ver os dados antes
  4. Volta ao Cowork e diz "benchmark terminou, link do branch é X"
  5. Eu pego nos ficheiros (via Read no `~/mooter/packages/router/scripts/wave1-benchmark/outputs/`) e faço análise
  6. Gero `REPORT.md` com sinais para Wave 2 + recomendações

- **Time-box do Claude Code**: ~3h total. Se chegar a 4h, pára e diz-me.
- **Cost-box**: ~$50 estimado, cap $80. Se chegar a $80, Claude Code pausa e pergunta.
- **Reproducibility**: tudo em commits + branch dedicada. Podes correr de novo no futuro com mesmo design.

---

## Próximo passo concreto

1. **Lê** `BENCHMARK_DESIGN.md` na íntegra (vai-te demorar ~15 min). Confirma que concordas com cada pre-registered decision.
2. **Pede** clarificações se algo não bater (ex.: pesos do composite quality_score, "Pastor wins" criteria).
3. **Quando OK**:
   - `cd ~/mooter && git checkout main && git pull && git checkout -b wave1-benchmark`
   - `claude --permission-mode auto`
   - Cola o bloco entre `=== START ===` e `=== END ===` deste documento

O Claude Code vai correr ~3h. Tu acompanhas com café + leituras. Quando acabar, voltas a mim.

— Cowork, 2026-05-27
