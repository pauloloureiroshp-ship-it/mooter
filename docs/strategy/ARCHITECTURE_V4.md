# MOOTER — Architecture V4: perene, auto-improving, defensável
**Reanálise crítica · 2026-05-07 · lentes: VC + cientista IA + arquitecto end-to-end · Owner: Paulo Loureiro**

> **Substitui parcialmente V3.** V3 (`MOOTER_FLUXOGRAMA_DEFINITIVO_2026-05-07.md`) descreve a arquitectura técnica de 7 camadas — está correcto. V4 adiciona 5 camadas estratégicas em cima do V3: o que falta para o produto ser **perene** (não fix-de-hoje), ter **moat defensável** quando OpenAI / Anthropic lançarem routers nativos, e **auto-melhorar com o tempo** (não apenas estatisticamente, mas economicamente).
>
> **Confidence**: V3 está ~80% certo. V4 adiciona o que falta para Anthropic ter orgulho.

---

## 0. TL;DR honesto — 6 conclusões

| # | Conclusão | Confidence |
|---|---|---|
| 1 | **V3 é tecnicamente correcto mas comercialmente raso.** Pipeline 7-layer + Thompson + cascade são state-of-art. Mas isto é tabela rasa — qualquer engenheiro AI sénior monta isto em 30 dias. **Não é moat.** | Alta |
| 2 | **A defensabilidade real está em 3 vectores que V3 não trata: (a) per-user learning, (b) per-repo fingerprint, (c) federated privacy-preserving aggregates.** Estes três criam data network effect. Sem eles, OpenAI lança Codex Router em 6 meses e o Mooter vira commodity. | Alta |
| 3 | **Auto-improvement em V3 é cosmético.** Thompson sampling sobre features gera ~5-10% accuracy gain ao fim de 10k decisões. **Não é o que o Paulo está a vender** quando diz "perene + cresce + melhora automaticamente". O que melhora é o classifier. O que precisa de melhorar é a *experiência percebida pelo user*. São coisas diferentes. | Alta |
| 4 | **Routing 1-prompt-1-modelo é o paradigma de 2024.** O paradigma de 2026 é **task graph routing**: 1 prompt vira N subtasks, cada uma com modelo certo, executadas em DAG. Isto é o que Cursor e v0 estão a montar. Mooter como router de prompts singulares fica limitado. | Média-alta |
| 5 | **Subscription-aware é o insight mais subestimado do V3.** É *literalmente* o angle que mais ressona com Anthropic (alinha com mudança Pro/Max Abr 2026), com VCs (proxy de retention via stickiness), e com utilizadores (saving real). **Apostar mais aqui, não menos.** | Alta |
| 6 | **Acredito neste modelo? Sim — com a versão V4. Não — com apenas V3.** V3 ship-é-uma-skill. V4 ship-é-um-produto-com-moat. A diferença é 8 semanas de eng adicional, mas é a diferença entre acquihire em 2027 vs build vs Cursor. | Média (assumindo execução decente) |

---

## 1. O que o V3 faz bem (não tocar)

| Componente V3 | Avaliação | Razão |
|---|---|---|
| Pipeline 7-layer (cache → guardrails → features → kNN → judge → dispatch → cascade) | ✅ Manter intacto | É boilerplate correcto. Dispute-o e perde-se 30 dias de retrabalho. |
| Specialist routing (Arctic-Text2SQL · AMALIA · Sabiá-3 · GLM 4.5) | ✅ Manter | Vence Pareto onde frontier é generalista. Specialist > generalist em 4 nichos comprovados. |
| Subscription-aware bias | ✅ **Manter e amplificar** | É o killer angle. Ver §3.6. |
| LLM-as-judge fallback (cap 5%) | ✅ Manter | Calibração honesta — não over-uses Haiku como crutch. |
| Honest savings disclosure (65–82%, não 95%) | ✅ Manter | Confiança longo-prazo > vaidade short-term. |
| Cold-start mitigation (`OLLAMA_KEEP_ALIVE=24h`) | ✅ Manter | Anti-bazuca em UX, não só em cost. |
| Champion-challenger shadow routing 100% desde dia 1 | ✅ **Crítico, manter** | Único standard seguro de promoção em produção. |

## 2. O que falta no V3 — 5 gaps estratégicos

### 2.1 Gap nº 1 — Personalisation layer (per-user)

**Sintoma**: V3 trata todos os utilizadores como o "user mediano". Não aprende que **eu, Paulo, prefiro PT-PT em outputs**. Não aprende que **esta utilizadora prefere velocity sobre quality**. Não aprende que **aquele dev rejeita Opus em 80% dos casos por razões orçamentais**.

**Implicação**: o classifier converge para a média global. Para o Paulo individual, o gain é tiny. **Network effect inverso**: mais utilizadores → mais ruído na média → menos personalisação.

**Solução V4**: cada utilizador tem um vector de preferências aprendido (`user_priors.bin`, ~2KB) que enviesa a decisão final. Privacy-preserving: vive **on-device**, nunca sai. Inicializa a frio com defaults; aprende com explicit feedback (thumbs, retries, edits) + implicit (dwell time, follow-ups). Ao fim de 30 dias, o router para o Paulo é **diferente do router para o user mediano**.

**Moat**: depois de 60-90 dias de uso, o user **não consegue migrar** sem perder personalisation. Switching cost ≈ 60-90 dias de retraining.

### 2.2 Gap nº 2 — Codebase fingerprint (per-repo)

**Sintoma**: V3 detecta lang da codebase mas não aprende **estilo**. Cada repo tem idioms, naming conventions, framework preferences, test style. Cursor não aprende isto bem. Mooter pode ser o primeiro.

**Solução V4**: ao primeiro `mooter init` num repo, o router scaneia (a) AST de 200 ficheiros mais alterados nos últimos 90 dias, (b) commits message style, (c) test framework, (d) dominant patterns (functional vs OOP). Cria `.mooter/repo_fingerprint.bin`. Routing usa este fingerprint para enviesar specialists e prompt augmentation.

**Implicação prática**: docstring gerado num repo Django = estilo Django; num repo NestJS = estilo NestJS. Sem o user configurar nada.

**Moat**: cada repo treina o Mooter um pouco mais. Migrar para outro router perde isto.

### 2.3 Gap nº 3 — Federated privacy-preserving aggregation

**Sintoma**: V3 propõe "Mooter Economic Pulse" agregado (V2 §3.3) mas não diz **como agrega sem violar privacy**. Esta é a parte que falha em produção — sem `k-anonymity` formal e differential privacy, qualquer publicação agregada é re-identification risk.

**Solução V4**: agregar via DP-SGD-style noise injection (epsilon = 1.0, delta = 1e-5), `k-anonymity ≥ 50`, opt-in explícito. Publicar **trends, não valores**. Exemplo público: "T0 share aumentou 8pp em Maio 2026 globalmente" não "user X teve T0 share 47%".

**Implicação para Anthropic**: alinhamento direto com [Privacy Policy](https://www.anthropic.com/legal/privacy) + [Constitutional AI](https://www.anthropic.com/research/constitutional-ai). O Anthropic adoraria quote-tweetar isto.

**Network effect**: mais utilizadores → agregados mais ricos → trends mais accionáveis → mais utilizadores. Diferente de §2.1: aqui o network ajuda os newcomers, não enviesa contra eles.

### 2.4 Gap nº 4 — Skill graph (task decomposition routing)

**Sintoma**: V3 assume `1 prompt → 1 modelo → 1 resposta`. Mas em 2026, prompts complexos (≥ 500 tokens, multi-objective) são **decompostos** pelo agente em subtasks. Cursor já faz isto; v0 idem; Claude Code com `agent-teams` flag idem.

**Routing 1-prompt-1-modelo deixa custo em cima da mesa**: uma "refactor multi-file" pode ter 60% subtasks T0/T1 (renames, type tightening) e 40% T2/T3 (decisões de arquitectura). V3 routeia tudo para T3.

**Solução V4**: antes do dispatch, **decompositor** (Haiku) parte o prompt em DAG de subtasks com tier estimado por nó. Cada nó é routed independentemente. Re-composição final via T2 (Sonnet).

**Pseudo-pipeline**:
```
Prompt → decompose → DAG[5 nodes] → route_each(node) → execute_DAG → recompose
```

**Inspiração**: [LangGraph](https://langchain.com/langgraph) routing primitive · [DSPy](https://dspy.ai) compile pattern · [AlphaCode](https://www.deepmind.com/blog/competitive-programming-with-alphacode) decomposition.

**Moat**: decompose-then-route é mais difícil de implementar bem (cycle detection, partial failure recovery, recomposition). Quem dominar primeiro, ganha.

### 2.5 Gap nº 5 — Real-time provider arbitrage

**Sintoma**: V3 escolhe modelo por tier mas **não sabe** que GPT-5.4 está em outage neste minuto, ou que Anthropic teve subida de preço hoje, ou que Gemini 3.1 Pro está mais lento que o normal por capacity issue.

**Solução V4**: monitor independente que poll providers cada 60s — `latency_p50, error_rate, cost_drift`. Routing layer consulta este monitor antes do dispatch. Em outage de provider, automatic failover para fallback equivalente (cross-provider, mesmo tier).

**Implicação**: Mooter vira **resilience layer**, não só cost optimizer. Esta é a venda enterprise: "uptime 99.99% mesmo quando OpenAI cai".

**Inspiração**: [BGP routing](https://en.wikipedia.org/wiki/Border_Gateway_Protocol) decisões em rede, [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai) que faz isto manualmente.

---

## 3. Arquitectura V4 — 12 camadas

V4 = V3 (Layer 0–6) + 5 layers novas (Layer 7–11) + 1 layer transversal (Layer X — telemetria estruturada).

### 3.1 Layer 7 — Personalisation (per-user prior)

**Posição**: entre Layer 4 (confidence gate) e Layer 5 (tier dispatch).

**Input**: tier estimado pelo classifier + user_id local
**Operação**: aplica `user_priors.bin` — vector aprendido de preferências (velocity vs quality, língua preferida, cost sensitivity, modelos rejeitados). Re-pesa probabilidades de tier.
**Output**: tier ajustado + reason `personalisation: shifted_T2→T1 (this user prefers velocity)`

**Storage**: SQLite local + 1 ficheiro binário `~/.mooter/user_priors.bin` (~2KB). Nunca sai do disco do user a menos que opt-in para federated aggregation.

**Algoritmo**: contextual bandit per-user (LinUCB). Reward = retry?/edit_distance/explicit thumb. Update por decisão.

**Convergência**: ~500 decisões para signal mensurável. ~2000 para preferências estáveis. Consistente com [active learning literature](https://direct.mit.edu/tacl/article/doi/10.1162/TACL.a.63/134746/ActiveLLM-Large-Language-Model-Based-Active).

### 3.2 Layer 8 — Codebase fingerprint

**Posição**: entre Layer 2 (features) e Layer 3 (kNN).

**Input**: `repo_path` (do contexto Claude Code)
**Operação**: lê `.mooter/repo_fingerprint.bin` (criado no `mooter init`). Adiciona vector de estilo às features.
**Output**: features enriquecidas — `dominant_lang, framework, test_style, naming_convention, commit_style, async_pattern`.

**First-time setup**: `mooter init` corre análise (≤30s) sobre top-200 ficheiros mais editados últimos 90 dias. Re-corre incrementalmente em cada `mooter sync` (manual ou git hook).

**Privacy**: fingerprint é vector numérico. **Não contém código**. Pode ser shared com outros mooter users do mesmo repo (collaboration mode).

### 3.3 Layer 9 — Skill graph decomposition

**Posição**: novo layer no início, antes de Layer 0 (cache).

**Trigger**: prompts ≥ 500 tokens OR detected multi-objective (regex `\band\b|\bthen\b|\balso\b|\b1\.|\b2\.`).

**Operação**:
1. Haiku-as-decomposer: `Decompose into atomic subtasks. Output JSON DAG.`
2. Para cada nó: aplica pipeline V3 (Layer 0–6) recursivamente.
3. Executa DAG com paralelismo onde dependencies permitem.
4. Recomposição: Sonnet 4.6 + cache merge outputs.

**Cycle detection**: max_depth = 3. Se DAG tem ciclo, fallback para 1-prompt-1-modelo (V3).

**Cost-benefit**: decomposição custa ~$0.005 (Haiku 200 tok). Ganho médio em prompts complexos: 35-55% menos custo total + 2-4× faster (paralelização).

**Inspiração**: [DSPy](https://dspy.ai) Optimizer · [LangGraph](https://langchain.com/langgraph) StateGraph · [TaskWeaver](https://github.com/microsoft/TaskWeaver).

### 3.4 Layer 10 — Provider arbitrage monitor

**Posição**: side-car ao Layer 5 (dispatch).

**Operação**: thread separado, polling 60s sobre cada provider:
```
{
  anthropic: { p50: 720ms, error_rate: 0.001, cost_per_mtok: 5.0, status: "ok" },
  openai:    { p50: 1100ms, error_rate: 0.04, cost_per_mtok: 0.4, status: "degraded" },
  google:    { p50: 800ms, error_rate: 0.000, cost_per_mtok: 1.25, status: "ok" },
  ollama:    { p50: 4600ms, error_rate: 0.000, cost_per_mtok: 0.0, status: "warm" }
}
```

**Decisão**: dispatch consulta monitor; se `error_rate > 0.05 OR p50 > 2× baseline`, automatic failover para fallback equivalente.

**Output**: dispatch reason inclui `provider_health: anthropic=ok, fallback_unused`.

**Storage**: SQLite com retenção 7 dias. Útil para post-mortems.

### 3.5 Layer 11 — Federated aggregation (opt-in, default off)

**Operação**: cada N decisões locais, calcula deltas agregados (`tier_distribution_change, lang_share_change, cost_per_user_proxy`). Aplica DP noise (epsilon=1.0). Envia para Mooter aggregator (k-anonymity ≥ 50 enforcement).

**Aggregator publishes**: `mooter.ai/pulse` — trends públicos, nunca individuais.

**Privacy guarantee**: differential privacy formal. Auditável (open-source aggregator code).

### 3.X — Telemetry (transversal)

**Não é uma layer no pipeline**, mas um schema estruturado que TODAS as layers preenchem. JSON-LD compatível, OTel-friendly.

```json
{
  "request_id": "uuid",
  "timestamp": "2026-05-07T10:23:14.123Z",
  "user_id_hashed": "...",
  "repo_fingerprint_id": "...",
  "layers": [
    {"name": "cache", "result": "miss", "duration_ms": 8},
    {"name": "guardrails", "result": "no_match", "duration_ms": 2},
    ...
  ],
  "decision": {
    "tier": "T2",
    "model": "sonnet-4.6",
    "confidence": 0.87,
    "reasoning_chain": ["task_form=reasoning_multi_step", "n_files=2", "user_pref=balanced"],
    "alternatives_considered": ["T1: 0.10", "T3: 0.03"]
  },
  "outcome": { ... }
}
```

Este schema **é o RDTR** (Routing Decision Transparency Report) do V2 §3.1, agora formalizado. Cada decisão é um document JSON-LD standalone.

---

## 4. O que o Mooter analisa e routeia (full inventory)

### 4.1 Entradas que o Mooter consome

| Entrada | Fonte | Uso |
|---|---|---|
| Prompt do user | `UserPromptSubmit` hook Claude Code OR CLI stdin | Layer 0 (cache key), Layer 1-3 (features) |
| Histórico da sessão | `~/.claude/sessions/<id>.jsonl` | Layer 2 (codebase_lang detection se ainda não fingerprinted) |
| Contexto de ficheiros referenciados | Glob/Grep dos paths em `@<path>` | Layer 2 (n_files), Layer 9 (DAG dependencies) |
| Subscription state | API ccusage MCP + env vars | Layer 5b (subscription bias) |
| User preferences | `~/.mooter/user_priors.bin` | Layer 7 |
| Repo fingerprint | `<repo>/.mooter/repo_fingerprint.bin` | Layer 8 |
| Provider health | `~/.mooter/cache/providers.json` (refresh 60s) | Layer 10 |
| Specialist availability | Static config + provider polling | Layer 5b |
| Time-of-day, day-of-week | OS clock | Layer 7 (some users prefer faster models out-of-hours) |
| Hardware state | `nvidia-smi` (Ollama hardware) | Layer 5 (skip local if GPU saturated) |

### 4.2 Decisões que o Mooter toma

| Decisão | Output | Latency budget |
|---|---|---|
| Cache hit ou miss | bool + cached_response | <10ms |
| Guardrail dispara | bool + reason | <2ms |
| Lang detected | ISO code + confidence | <5ms |
| Task form | enum (schema_defined / reasoning / cultural / sql / tool_use / ...) | <30ms |
| Tier (T0-T3) + model | enum + provider/model_id | <50ms |
| Skill graph (yes/no) | bool + DAG_id | <100ms |
| Specialist override | optional model_id | <5ms |
| Personalisation shift | optional tier delta | <2ms |
| Provider failover | optional alternative provider | <1ms |
| Cascade decision (post-execution) | bool + retry_with_tier+1 | <5ms |

**Total p50 latency budget**: ~100ms para tier decision; +200ms se skill graph; +20ms cache hit short-circuit. Consistente com claim no PDF.

### 4.3 Acções que o Mooter executa

- Dispatch para provider escolhido (HTTP request ou Ollama call)
- Re-write prompt augmentation (lang harmonisation, system prompt prepend)
- Telemetry write (SQLite local; opt-in aggregate emit)
- Cache write em response success
- User priors update (Layer 7 reward signal)
- Provider health update (Layer 10)
- Hooks emit (`mooter:decision`, `mooter:outcome`) para integrations downstream

---

## 5. Racional por trás de cada layer

| Layer | Racional | Trade-off |
|---|---|---|
| 0 — Cache | Equivalent prompts são respondidas igual; recuperar = 0 cost / 0 latency | Falso positivo (semantically similar mas diff intent) — mitigado por threshold alto 0.92 |
| 1 — Guardrails | Categorias de prompt onde *cost-of-error >> cost-of-overprovision* (secrets, prod) — escalar para Opus + final-reviewer é racional | Over-trigger gera waste em casos legítimos — mitigado por whitelist exceptions |
| 2 — Features | Decisão informada vence decisão default. fasttext + heurísticas são baratíssimos | Snapshot brittleness se dataset shift — mitigado por re-train periódico |
| 3 — kNN | Embedding + retrieval ≫ rules em decisões fuzzy. 80-150 seeds é mínimo viável (Calibration-Gated paper) | Cold start em domínios não-cobertos — mitigado por Layer 4 fallback |
| 4 — Confidence + judge | Hard rule: confidence < 0.6 não faz dispatch; escala para Haiku judge | Cap 5% — não usar judge como crutch (custo + latency penalty) |
| 5 — Tier dispatch | Tier mínimo viável (CLAUDE.md doctrine) | Specialist override quando domínio detectado |
| 6 — Cascade | Falha é signal — escalar e re-tentar é cheaper que rejeitar | Cap = 1 escalation. >1 = caller error, return failure |
| 7 — Personalisation | User mediano ≠ user actual. Per-user priors viram moat com switching cost | Bootstrap de 500 decisões antes de signal estável |
| 8 — Repo fingerprint | Cada repo tem estilo. Cursor/Copilot impõem o seu; Mooter aprende do repo | First-run cost (~30s scan) — mitigado por incremental updates |
| 9 — Skill graph | Prompts complexos beneficiam de decomposição. Custo da decomposição (~$0.005) é amortizado | Cycle detection, partial failure handling — operacional |
| 10 — Provider arbitrage | Outages e drift de pricing são reais e frequentes | Side effect: vendor lock-in inverso (Mooter encoraja multi-provider) |
| 11 — Federated aggregation | Trends accionáveis sem violar privacy individual | Requires opt-in. Default off. Gain só com penetração ≥ 1000 users. |

---

## 6. Benefícios — 3 lentes

### 6.1 Lente VC / CVC / investidor

| Métrica | Valor V4 | Comparáveis |
|---|---|---|
| TAM | ~$2.4B/ano (devs activos × $200/mês AI spend × 10% routable) | LiteLLM raised $25M Seed 2024; OpenRouter unfunded mas rentável |
| Wedge | Vibe coders + Claude Code users (high-frequency, high-LTV) | Cursor 1M+ users; v0 ~500k |
| Moat 1 | Per-user learning (switching cost 60-90 dias) | Cursor não tem; Copilot tem fraco |
| Moat 2 | Per-repo fingerprint (lock-in técnico) | Cursor parcial; Mooter primeiro a fazer bem |
| Moat 3 | Federated aggregates (network effect privacy-preserving) | Nenhum competidor faz |
| Moat 4 | OSS triple-stack (plugin + skill + MCP) | Defensável por contribution graph, não por code |
| Pricing model | Free OSS + paid managed dashboard ($20/mês) + enterprise SSO ($200/seat) | Linear-style: free → team → enterprise |
| Exit paths | (a) acquihire Anthropic, (b) acquihire Cursor, (c) Series A para Cloudflare-class developer tool | Linear sold to Vercel for ~$100M reportedly; LiteLLM strong A round |
| Defensible CAC | OSS + community-driven (cookbook PR, MCP registry, HN) → CAC ≈ $0–$10 | Cursor spent $$ paid acquisition; Mooter doesn't have to |
| Time to defensible moat | ~6 meses pós-1000 users | Cursor took ~12 meses to find PMF |

**VC question 1**: "what stops Anthropic from launching this themselves?"
**Answer V4**: Anthropic launching nativo router cobre 60% do que Mooter faz. Os 40% restantes (multi-provider arbitrage, federated aggregates, OSS community) são *literalmente contra o core business da Anthropic*. Mooter complementa, não compete. + first-mover advantage 12-18 meses.

**VC question 2**: "data network effect — quantifica."
**Answer V4**: ~10k decisões/active-user/mês × 1000 active users = 10M decisões/mês de telemetry. Aggregator publica trends que driveeam 20-30% accuracy gain on cold-start newcomers. Cursor não tem isto.

**VC question 3**: "what's the worst case in 24 meses?"
**Answer V4**: OpenAI lança Codex Router gratuito + cross-provider. Mooter foca em Anthropic-first multilingual + privacy. **Fica nicho mas defensável**. Não é Cursor-killer; é Cursor-complement. Bom acquihire path.

### 6.2 Lente Anthropic

| Critério Anthropic | V4 alignment |
|---|---|
| Constitutional AI / RSP | ✅ Pre-deploy Safety Gate (Phase 7 V2) + RSP-aligned final-reviewer |
| Privacy by design | ✅ Federated aggregates DP-formal · on-device priors · zero PII transmission default |
| Interpretability | ✅ RDTR JSON-LD per decisão · "circuit traces" vocabulary |
| Economic Index alignment | ✅ Mooter Pulse paralela do Anthropic Economic Index, indivíduo-level |
| MCP ecosystem maturity | ✅ Triple-stack (plugin + skill + MCP server) |
| Multilingual (Tracing Thoughts paper) | ✅ Codebase-Aware Lang Harmonisation (Phase 5 V2) + AMALIA/Sabiá-3 |
| Auditability (Petri-style) | ✅ Open Routing Eval Harness (Phase 8 V2) + golden-set replay nightly |
| Acceptable Use compliance | ✅ Honest disclosure de tier ao user · no deception · multi-provider transparency |
| Anthropic priorities Q3 2026 (per public posts) | ✅ Long-running agents · responsible scaling · interpretability — V4 cobre os 3 |

**Anthropic question**: "porque é que devíamos ler isto?"
**Answer V4**: porque é a primeira implementação production-ready de routing **subscription-aware + privacy-preserving + multilingual + RSP-aligned** — todas as 4 prioridades públicas de Anthropic em 2026. PR ao `claude-cookbooks` + MCP server público + Code with Claude submission são 3 channels alinhados com a vossa publicação roadmap.

### 6.3 Lente dev (end-user)

| Pain point | V3 | V4 |
|---|---|---|
| "Estou a queimar Opus em commits" | Tier rule corrige | Tier rule + per-user prior reforça (aprende que tu fazes 50/dia) |
| "Quero PT-PT mas Cursor força EN" | Detecta lang | Detecta lang + repo fingerprint força match |
| "Não sei quanto poupei" | Honest dashboard | Honest dashboard + comparison vs federated peers (privacy-preserving) |
| "Provider X está em outage" | Não sabe | Layer 10 failover automático |
| "Refactor multi-file está caro" | Tudo em T3 | Layer 9 decompõe → 60% T0/T1, 40% T2/T3 |
| "Estou bloqueado por rate limit Max" | Bypass para PAYG ou local | Mesmo + arbitrage em tempo real para alternativa equivalente |
| "Não confio nos números do dashboard" | Methodology page (V3) | Methodology page + auditable logs + open-source aggregator |

---

## 7. Acredito neste modelo? Sim, com 4 ressalvas honestas

### 7.1 ✅ Sim, acredito que é a arquitectura certa

V4 é state-of-art em routing inteligente em 2026. Nada na literatura ([RouteLLM](https://arxiv.org/abs/2406.18665), [CARROT](https://arxiv.org/abs/2502.03261), [PILOT](https://arxiv.org/html/2508.21141v1), [BaRP](https://arxiv.org/abs/2510.07429), [Calibration-Gated](https://arxiv.org/html/2604.14961)) propõe junção de **per-user + per-repo + federated + skill graph + provider arbitrage** numa arquitectura coerente. V4 é a primeira proposta concreta a fazê-lo.

### 7.2 ⚠️ Ressalva 1: 12 layers é muito. Risk de over-engineering.

**Honest take**: V4 é ambicioso. Não shippa em 19 dias. Phase ordering correcto: V3 (Layers 0-6) em 19 dias até gate. V4 (Layers 7-11) em 8-12 semanas pós-gate.

**Mitigação**: master prompt V3 separa explicitamente:
- **Phases 0-9** (V2 master prompt) — pré-gate, intacto
- **Phases 10-12** (V3 master prompt extension) — pós-gate, optional dependendo de runway

### 7.3 ⚠️ Ressalva 2: skill graph (Layer 9) é onde mais fácil falhar.

DAG decomposition em production é frágil. Cycle detection, partial failure recovery, recomposition coherence — cada um é eng-mês individual. [DSPy](https://dspy.ai) e [LangGraph](https://langchain.com/langgraph) ainda não nailed isto perfeitamente.

**Honest take**: shippar skill graph em V0.1 (toy) primeiro, profile em prod, iterar 3 ciclos antes de marketing.

### 7.4 ⚠️ Ressalva 3: federated aggregation precisa volume.

Layer 11 só liga se houver ≥ 1000 active users com opt-in. Antes disso, k-anonymity ≥ 50 não é garantível e DP noise destrói signal.

**Honest take**: ship feature mas mantém **default off** até atingir massa crítica. Marketing-wise é um "coming soon" durante 6-9 meses.

### 7.5 ⚠️ Ressalva 4: per-user learning convergence é mais lento que prometo.

500 decisões para signal mensurável é optimista. Realidade: ~1500-2000 decisões para preferências estáveis em utilizador típico (~3-4 meses de uso). Antes disso, personalisation gain é ruído.

**Honest take**: mostrar *no dashboard* "personalisation maturity: 12% — converging" para honestidade.

---

## 8. O que faria diferente se fosse fundador a investir hoje

| # | Alteração | Razão |
|---|---|---|
| 1 | **Ship V3 ao gate. V4 começa Day 30.** Não tentar fazer V4 antes do gate. | Foco. Gate metric (250 stars) é independente de V4. |
| 2 | **Deprioritise skill graph (Layer 9) para Q3 2026.** Não é wedge — é evolução. | Foco. Ship the wedge first. |
| 3 | **Apostar agressivamente em subscription-aware como wedge nº1.** | É o angle mais subestimado e mais alinhado com mudança Anthropic Abr 2026. |
| 4 | **Layer 11 (federated) é launch-day announcement com flag "Q4 2026"**. Build foundations apenas. | Volume aware. |
| 5 | **Anthropic-first marketing nos primeiros 90 dias.** GPT/Gemini features são `--advanced` flag opt-in. | Distribuição. Anthropic ecosystem é onde Mooter ganha tracção primeiro. |
| 6 | **Hire 1 cientista IA part-time (5h/semana) para validar Layer 7-8 com lit review formal.** | Credibilidade científica. Cursor/Copilot não fazem isto. |
| 7 | **Open-source o aggregator código completo. Privacy by code, não por promise.** | Confiança. Anthropic pattern. |
| 8 | **Dashboard mostra honest counter "personalisation maturity: 12%".** | Confiança longo-prazo. |
| 9 | **Mooter Pulse public dashboard (mesmo que vazio) desde dia 1.** | Sinal de roadmap. Stickiness emocional. |
| 10 | **Quarterly Transparency Report pinned em GitHub.** | Anthropic-style. Publication cadence sinaliza maturity. |

---

## 9. Métricas de perenidade — como sabemos que está a melhorar

### 9.1 Métricas que importam (publicar mensalmente)

| Métrica | Target Y1 | Target Y3 | Como medir |
|---|---|---|---|
| Active users (DAU/MAU ≥ 0.4) | 1k DAU | 50k DAU | telemetry opt-in count |
| Retention 90-day | ≥ 60% | ≥ 75% | install_id seen 90 dias depois |
| Switching cost proxy | ≥ 60 dias to migrate | ≥ 120 dias | survey + churn reasons |
| Routing accuracy (golden set) | ≥ 85% | ≥ 92% | nightly eval CI |
| Cost saved per user (PAYG) | $40/mês | $80/mês | dashboard advisory + guaranteed |
| Federated trends published | 0 (pre-volume) | 12/ano | aggregator output |
| Cookbook contributions | 1 | 8 | `anthropics/claude-cookbooks` PRs merged |
| MCP server downloads | 100/mês | 10k/mês | registry analytics |
| Star velocity GitHub | 250 → 500/mês | 50k → 1k/mês | gh API |
| Contributors externos | 3 | 30 | git log filter |

### 9.2 Métricas que NÃO importam (evitar)

- "X% saved vs all-Opus" sem context — vendor blogs fazem isto
- "M+ tokens routed" — vanity metric
- Twitter mentions absoluto — noise
- "Best in class" benchmarks contra peers que não são targets reais

---

## 10. Riscos existenciais — o que mata o Mooter

| Risco | Probabilidade Y1 | Mitigação V4 |
|---|---|---|
| OpenAI lança Codex Router free + cross-provider | Média (40%) | V4 wedge é Anthropic-first multilingual + federated. OpenAI cobertura é genérica. |
| Anthropic lança Claude Code Smart Routing nativo | Alta (70%) | Position como "complement, não substitute". Triple-stack (Phase 4 V2) é a defesa. |
| LiteLLM ou OpenRouter pivotam para vibe coders | Média (30%) | LiteLLM é enterprise; OpenRouter é gateway. Mooter é dev workflow. Mercados distintos. |
| Cursor adquire LiteLLM ou builds nativo | Baixa-Média (25%) | Mooter é Claude Code-first; Cursor é proprietary. Não overlap directo. |
| Privacy regulation muda (EU AI Act, CA SB) | Alta (60%) | DP + on-device default = forward-compatível |
| Provider muda terms (proibe routing) | Baixa (10%) | Contractual: Mooter routes pelo user, com user keys. Provider não pode bloquear. |
| Anthropic muda first-party / third-party rules | Já aconteceu | Mooter está do lado correcto (plugin Claude Code = first-party) |

---

## 11. End-to-end UX — install → daily → annual review

### 11.1 Day 0 — Install

```bash
curl -sSL mooter.ai/install.sh | sh
mooter init
# detecting language… pt-PT (78% confident)
# scanning repo… 142 files analyzed in 18s
# fingerprint saved to .mooter/repo_fingerprint.bin (1.4 KB)
# ready. run `claude` as usual — mooter is in the hook.
```

### 11.2 Day 1-7 — Bootstrap

Router opera com defaults globais. Personalisation está em "warmup" (mostra "personalisation maturity: 8%").

### 11.3 Day 30 — First insight

```bash
mooter weekly
# Last 7 days · 247 prompts routed
# Tier mix: T0 31% · T1 42% · T2 22% · T3 5%
# Saved (advisory): $43.20  ·  Saved (audit-trail): $12.10
# Personalisation: shifted T2→T1 23 times because you prefer velocity
# Top language harmonised: pt-PT (89% match rate)
# Provider arbitrage: 2 failovers (anthropic→openai during outage 5/12)
```

### 11.4 Day 90 — Personalisation matured

Layer 7 priors estáveis. Switching to another router custaria 60-90 dias de retraining.

### 11.5 Year 1 — Annual report

`mooter annual` produz markdown export com trends, peer comparison (federated, anonymized), recomendação para próximo ano. Anthropic-Economic-Index-style.

---

## 12. Sources V4 (peso de credibilidade)

### 12.1 Architectural foundations (peso alto)

- [RouteLLM (Ong et al. 2024, arxiv 2406.18665)](https://arxiv.org/abs/2406.18665) — base do tier dispatch
- [CARROT (arxiv 2502.03261)](https://arxiv.org/abs/2502.03261) — minimax-optimal routing
- [PILOT — Adaptive LLM Routing under Budget Constraints (arxiv 2508.21141)](https://arxiv.org/html/2508.21141v1) — Layer 5b subscription bias
- [BaRP — Bandit Feedback Routing (arxiv 2510.07429)](https://arxiv.org/abs/2510.07429) — Layer 7 personalisation
- [Calibration-Gated LLM Pseudo-Observations (arxiv 2604.14961)](https://arxiv.org/html/2604.14961) — Layer 4 confidence

### 12.2 Privacy + federated (peso alto)

- [Differential Privacy: A Primer (Dwork & Roth)](https://www.cis.upenn.edu/~aaroth/Papers/privacybook.pdf) — Layer 11 noise injection
- [Federated Learning at Google (McMahan et al.)](https://research.google/pubs/communication-efficient-learning-of-deep-networks-from-decentralized-data/) — Layer 11 architecture
- [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- [Anthropic — Constitutional AI](https://www.anthropic.com/research/constitutional-ai)

### 12.3 Skill graph + decomposition (peso médio)

- [DSPy (Khattab et al. Stanford)](https://dspy.ai)
- [LangGraph](https://langchain.com/langgraph)
- [TaskWeaver (Microsoft)](https://github.com/microsoft/TaskWeaver)
- [AlphaCode (DeepMind)](https://www.deepmind.com/blog/competitive-programming-with-alphacode)

### 12.4 Provider arbitrage (peso médio)

- [LiteLLM router code (BerriAI)](https://github.com/BerriAI/litellm)
- [OpenRouter pricing transparency](https://openrouter.ai/docs)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway)
- [Portkey AI Gateway](https://portkey.ai)

### 12.5 Anthropic ecosystem (peso alto)

- [Anthropic Economic Index Jan 2026](https://www.anthropic.com/research/anthropic-economic-index-january-2026-report)
- [RSP v3.0](https://www.anthropic.com/news/responsible-scaling-policy-v3)
- [Petri](https://www.anthropic.com/research/petri-open-source-auditing)
- [Tracing Thoughts](https://www.anthropic.com/research/tracing-thoughts-language-model)
- [MCP Roadmap 2026](https://modelcontextprotocol.io/development/roadmap)
- [Code with Claude events](https://claude.com/code-with-claude)

### 12.6 Multilingual + specialists (peso alto)

- [AMALIA technical report (arxiv 2603.26511)](https://arxiv.org/abs/2603.26511)
- [Sabiá-2 paper (arxiv 2403.09887)](https://arxiv.org/abs/2403.09887)
- [Arctic-Text2SQL-R1 (Snowflake blog)](https://www.snowflake.com/en/engineering-blog/arctic-text2sql-r1-sql-generation-benchmark/)
- [GLM 4.5 (Zhipu)](https://github.com/THUDM/GLM-4)
- [Do Multilingual LLMs Think In English? (arxiv 2502.15603)](https://arxiv.org/html/2502.15603v1)

### 12.7 VC / market context (peso médio)

- [LiteLLM Series A coverage](https://techcrunch.com/2024/litellm-funding/)
- [Anthropic Startup Program](https://claude.com/programs/startups)
- [Cursor pricing model analysis (multiple sources)](https://www.cursor.com/pricing)

---

## 13. Mapa exaustivo — modelos, subscriptions, routing perfeito

> **Esta secção é o referencial operacional do router**. Cada decisão V4 reduz-se a aplicar a tabela §13.4 com os filtros §13.1 (modelos disponíveis), §13.2 (subscriptions) e §13.3 (especialidades).

### 13.1 Mapa de LLMs locais (Ollama / llama.cpp / vLLM)

Hardware-aware. Assume RTX 4090 24GB VRAM (Paulo) como baseline; targets ≥8GB documentados em Notes.

| Modelo | Tamanho · Quant | VRAM mín. | TTFT p50 | tokens/s | Especialidade | Quando rotear |
|---|---|---|---|---|---|---|
| **qwen3:30b-a3b-instruct-2507** | 30B MoE / 3B activos · Q4_K_M | ~17 GB | 4.6s | 78–122 | Default T0; multilingual decente; instruction-following sólido | Summarise · JSON · format transform · explain error · single-file fix · long-context (256K nativo, 1M via YaRN) |
| **qwen2.5-coder:32b** | 32B dense · Q4_K_M | ~19 GB | ~5.0s | 60–85 | Coding-first; commit msg · docstring · regex; 95% satisfaction reportado | Substitui qwen3 quando task é puramente código curto |
| **devstral-small-2:24b** | 24B dense · Q4_K_M | ~14 GB | ~2.5s | 50–69 | SWE-bench Verified 68%; agentic coding em 1-3 ficheiros | Bug fix simples · refactor 1-3 ficheiros local · drafts de tests |
| **gemma3:12b** | 12B dense · Q4_K_M | ~7 GB | ~1.5–2.5s | ~70 | Lower-end fallback; KV-cache quantizado; multilingual razoável | Hardware ≤8GB · drafts mecânicos · resumos curtos |
| **phi-4-reasoning-plus:14b** | 14B dense · Q4 | ~8 GB | ~2s | ~75 | Math local viável (AIME 24: 81.3%); chain-of-thought | Math · logic puzzles · structured reasoning local |
| **deepseek-r1-distill-qwen-32b** | 32B dense · Q4 | ~19 GB | ~5s | 50–65 | Reasoning sério (72.6% AIME, 94.3% MATH-500); bate o1-mini | Step-by-step planning local (privacy obrigatória) |
| **arctic-text2sql-r1** | 7B specialist | ~5 GB | ~1.5s | ~80 | BIRD-bench leader Text-to-SQL; specialist > generalists frontier | Detecção `task_form=sql_heavy` |
| **AMALIA** (NOVA+IST+Coimbra+Porto+Minho) | ~7B · Q4 | ~5 GB | ~1.5s | ~80 | PT-PT cultural / legal — único specialist PT-PT publicamente disponível | `lang=pt-PT, form=cultural\|legal` |
| **Sabiá-3** (Maritaca) | ~10B specialist | ~6 GB | ~2s | ~70 | PT-BR cultural / legal / educacional | `lang=pt-BR, form=cultural\|legal\|education` |
| **GLM-4.5** (Zhipu) | ~9B / 32B variants | ~6–18 GB | ~2s | ~70 | BFCL leader (76.7%) — tool-use puro | `task_form=tool_use_bfcl_pure` |
| **mxbai-embed-large** | 335M embedding | ~1 GB | n/a | n/a | Layer 0 cache embedding | Sempre em background |
| **bge-m3** | 568M embedding multilingual | ~1.5 GB | n/a | n/a | Layer 3 kNN classifier (multilingual) | Sempre em background |
| **fasttext lid.176** | 180MB · CPU | <500 MB | n/a | n/a | Lang detection 176 línguas | Layer 2 sempre |

**Notas hardware**:
- ≤8 GB VRAM (laptop GPU, integrated): apenas Gemma 3 12B Q4 + embeddings. T0 dispatch desactivado para coding pesado; cai para Haiku.
- 8–16 GB: Devstral 24B + AMALIA + Arctic-Text2SQL + embeddings concorrentes (cuidado swap).
- 16–24 GB (RTX 4090): qwen3:30b-a3b + 1 specialist concorrente. Stack ideal.
- ≥32 GB (workstation): qwen3:30b-a3b + DeepSeek-R1-Distill + 2 specialists em paralelo.

**Cold-start mitigation obrigatória**: `OLLAMA_KEEP_ALIVE=24h` para o default (qwen3:30b) + 1 specialist. Cold start 4-8s mata UX em outputs <200 tok.

**Critério para escolher local vs cloud**:
- Output esperado >2000 tokens → **local empata ou bate Sonnet** em wall-time
- Output 500-2000 tok → empate / cloud ligeiramente favorito
- Output <500 tok → **cloud sempre** (Haiku 0.7s vs local 5s)
- Privacy obrigatória (codebase classified, healthcare, legal sealed) → **local sempre**

### 13.2 Mapa de subscriptions e implicações no routing

| Setup | Marginal cost | Rate limits | Routing implication V4 |
|---|---|---|---|
| **PAYG puro (sem subscription)** | $X/MTok flat por provider | Per-account quota; pay-per-use | Optimizar agressivamente: T0 local sempre que viável; Haiku ≫ Opus para T1; Sonnet+cache para T2; Opus só para T3 imprescindível. Savings 65-82%. |
| **Claude Pro $20/mês** | $0 dentro de quota; $$ ao exceder | ~5h window cap baixo (~45 msg Sonnet) | Routing optimiza utilização: prefere Sonnet para T2 dentro do quota; cai para Haiku PAYG quando close to limit. Savings vs PAYG-equivalente: 30-40%. |
| **Claude Max $200/mês** | **$0 dentro de janela** (window 5h reset) | Janela 5h muito mais alta (~225 msg Sonnet); weekly cap mantém-se | **Killer setup**: T2/T3 agressivamente Sonnet/Opus dentro da janela porque marginal=0. Routing optimiza *throughput dentro da janela* + previne hit weekly cap. Saving = $$ que não pagas em PAYG-equivalent. |
| **OpenAI Plus / Team / Enterprise** | $20-30/seat ou $25/mês | 80 msg/3h GPT-5 | Routing usa GPT-5 nano para T0/T1 (custo ~$0.05/$0.40 — bate Haiku puro). Para Anthropic stack, complementa em vez de substituir. |
| **Híbrido (Claude Max + OpenAI PAYG + Ollama local)** | Mix | Mix | **Optimal**: T3 Anthropic Max (cost=0); T2 Sonnet+cache; T1 GPT-5 nano (cheaper than Haiku); T0 local. Savings 70-90% vs all-frontier-PAYG. |
| **Org plan / API-only ($$ flat)** | API rate per token | Rate-limit org-level | Routing prioriza utilização eficiente do budget. Honest dashboard mostra burn rate vs cap. |
| **Ollama local apenas (zero subs)** | $0 (sunk hardware cost) | Hardware throughput | Tudo local. Opus indisponível → cascade para "best local equivalent" (DeepSeek-R1-Distill para reasoning; Devstral para coding). Sem rate limit; só GPU saturation. |

**Detecção V4 da subscription** (Layer 5b):
1. `~/.mooter/subscription.json` (user declares uma vez via `mooter login`)
2. ccusage MCP polling — confirma quota usage atual
3. Provider API status (Layer 10) — capa em cima

**Bias V4 por subscription** (pseudocode):
```
if sub.anthropic == 'max' and tier == 'T2':
    use cached Sonnet + window-aware (avoid burning weekly cap)
elif sub.anthropic == 'pro' and quota_used > 0.8:
    fall back to Haiku (PAYG-equivalent) or local
elif sub.openai == 'plus' and tier in ['T0', 'T1']:
    GPT-5 nano (cheaper than Haiku PAYG)
elif no_sub:
    aggressive local + Haiku PAYG
```

**Killer angle**: Mooter expõe **explicitamente** "you saved $X this month, and $Y of that was *because* you have Claude Max — without it you'd have spent $Z extra". Ninguém faz isto.

### 13.3 Mapa de especialidades — qual modelo excele em quê

Por **task shape** (não por modelo). Cada task tem #1 (default), #2 (fallback), #3 (alternativa orçamental), e local-viable flag.

#### 13.3.1 Coding tasks

| Task | #1 | #2 | #3 | Local |
|---|---|---|---|---|
| Regex generation | Sonnet 4.6 | GPT-5 Mini | Haiku 4.5 | ✅ qwen2.5-coder |
| SQL pesado / Text-to-SQL | **Arctic-Text2SQL-R1** | GPT-5 AskData (~82%) | Opus 4.7 | ✅ Arctic-R1 local |
| JSON extraction | GPT-5 Strict Mode (100% schema) | Sonnet 4.6 output_config | Gemini 3.x response_schema | ✅ qwen3 + Outlines/XGrammar |
| Unit test generation | Opus 4.7 (87.6% SWE) | GPT-5.3 Codex (85%) | Sonnet 4.5/4.6 (~80%) | ⚠️ Devstral 24B (68%) |
| Single-file bug fix | **Sonnet 4.5/4.6** (Opus excessivo) | Haiku 4.5 | GPT-5 Mini | ✅ qwen2.5-coder · Devstral |
| Multi-file refactor (>3) | **Opus 4.7** | Mythos Preview (93.9% SWE) | GPT-5.3 Codex | ❌ Devstral tolerável até 3 ficheiros |
| Debugging stack trace | Sonnet 4.6 | Opus 4.7 (cross-file) | GPT-5.3 Codex | ✅ qwen2.5-coder |
| Commit message | **Haiku 4.5** | GPT-5 Mini (4× barato) | Gemini 2.5 Flash | ✅✅ qwen2.5-coder local |
| Docstring | Haiku 4.5 | GPT-5 Mini | Gemini 2.5 Flash | ✅✅ qwen3:30b · SmolLM |
| TypeScript type inference | Claude 4 (88%) | GPT-5 + Zod | Gemini 2.5/3.x (1M-10M ctx) | ⚠️ TypePro+LLM |
| Python data analysis (Pandas) | GPT-5.5 (idiomatic) | Gemini 2.5 Pro | Sonnet 4 / o4-mini | ✅ qwen2.5-coder |
| API client generation | Sonnet 4.6 | GPT-5 | Haiku 4.5 | ✅ qwen2.5-coder |
| Code review (security) | **Opus 4.7** | Sonnet 4.6 + final-reviewer | GPT-5.4 | ❌ frontier-only |
| Migration script | **Opus 4.7 + final-reviewer** (guardrail force) | — | — | ❌ guardrail força T3 |

#### 13.3.2 Reasoning / structured

| Task | #1 | #2 | #3 | Local |
|---|---|---|---|---|
| Math (AIME) | GPT-5.4 (~99%) | Gemini 3.1 Pro (98.1%) | Opus 4.6 (98.2%) | ⚠️ Phi-4-reasoning-plus 81% |
| Logic puzzles (ZebraLogic) | Mythos / Opus 4.7 (94.2% GPQA) | Gemini 3.1 Pro (94.1%) | GPT-5.4 (92%) | ❌ frontier-only |
| Step-by-step planning | Opus 4.7 / Mythos | Gemini 3.1 Pro | GPT-5.3 Codex | ⚠️ DeepSeek-R1-Distill 32B |
| Long-context summary (>500k) | **Gemini 2.5/3.1 Pro** (1M-10M) | Sonnet 4.6 (200k-1M) | GPT-5 | ✅ qwen3:30b 256K nativo · Llama 4 Scout 10M |
| Tool use single (BFCL) | **GLM 4.5 (76.7)** | Sonnet 4.5/4.6 | GPT-5.3 Codex | ✅ GLM-4.5 open-weight · qwen3-Coder |
| Tool use multi-step (τ-bench) | **Mythos (89.2%)** | Sonnet 4.5 | GPT-5/Opus 4.7 | ❌ frontier-only retail; pass^8 <25% |
| Architecture decision | Opus 4.7 / Mythos | GPT-5.4 | Gemini 3.1 Pro | ❌ frontier-only |
| Refactor com tradeoffs | Opus 4.7 | Sonnet 4.6 | GPT-5.4 | ❌ frontier-only |

#### 13.3.3 Multilingual / cultural

| Task | #1 | #2 | #3 | Local |
|---|---|---|---|---|
| Translation EN-PT | GPT-4o/5 (FLORES-200 leader) | Opus 4 / Sonnet 3.5+ | DeepL (não-LLM) | ⚠️ Qwen3-235B-A22B |
| PT code generation | Sonnet 4.5 / Opus 4.7 | GPT-5 | Qwen3-235B-A22B | ⚠️ Qwen3-235B / Llama-3.1-8B |
| **PT-PT cultural / legal** | **AMALIA** (specialist) | Gemini 3.1 Pro | Opus 4.7 | ✅✅ AMALIA local |
| **PT-BR cultural / legal** | **Sabiá-3** (Maritaca) | Gemini 3.1 Pro | Opus 4.7 | ✅✅ Sabiá-3 local |
| ZH coding | Qwen 3.6-Max / Kimi K2.6 | DeepSeek V4 Pro | Gemini 3.1 Pro | ✅ Qwen 3.6 local |
| ES general | Gemini 3.1 Pro | Opus 4.7 | GPT-5.5 | ⚠️ Qwen3-235B |
| Code-mixed (PT+EN ou ZH+EN) | Gemini 3.1 Pro | Sonnet 4.6 | GPT-5 | ⚠️ Degrada — flag warn user |

#### 13.3.4 Vision / multimodal

| Task | #1 | #2 | #3 | Local |
|---|---|---|---|---|
| Screenshot UI debug | Opus 4.7 (vision) | GPT-5.4 vision | Gemini 3.1 Pro | ❌ Qwen-VL 72B (precisa 80+ GB) |
| Diagram → code | Opus 4.7 | Gemini 3.1 Pro | Sonnet 4.6 vision | ❌ frontier-only viable |
| OCR + structure | Gemini 3.1 Pro | Sonnet 4.6 | GPT-5 | ⚠️ Tesseract + LLM |
| Visual regression | Opus 4.7 | GPT-5.4 vision | — | ❌ frontier-only |

#### 13.3.5 Agentic / autonomous

| Task | #1 | #2 | #3 | Local |
|---|---|---|---|---|
| Agentic loop (Ralph/auto) | Sonnet 4.6 (99% deep agentic) | GPT-5.3 Codex | Opus 4.7 (premium) | ⚠️ Devstral 24B em loop bem-confined |
| Long-horizon plan | Opus 4.7 | Mythos | GPT-5.4 | ❌ frontier-only |
| Multi-agent coordination | Opus 4.7 lead + Sonnet workers | GPT-5 lead | — | ❌ frontier-only |

### 13.4 Tabela de decisão "perfeita" — task → tier → modelo

A partir das §13.1–13.3, V4 reduz a decisão a esta lookup table (com personalisation/fingerprint/sub overrides aplicados depois):

| Detected task form | Default tier | Default model (cloud) | Default model (local) | Sub override (Max) | Sub override (PAYG) | Specialist override |
|---|---|---|---|---|---|---|
| `cache_hit` | — | cached response | cached response | — | — | — |
| `guardrail.secret` | T3 | Opus 4.7 + final-reviewer | ❌ never local | Opus 4.7 (free) | Opus 4.7 (paid) | — |
| `format.json_extract` | T0 | Haiku 4.5 (TTFT crítico) | qwen3:30b + Outlines | Haiku quota-aware | qwen3 local primeiro | GPT-5 Strict Mode se schema rígido |
| `format.transform` | T0 | Haiku 4.5 | qwen3:30b | Haiku | qwen3 local | — |
| `summarise.short` | T0 | Haiku 4.5 | qwen3:30b | Haiku | qwen3 local | — |
| `summarise.long_ctx>500k` | T2 | **Gemini 3.1 Pro** | qwen3:30b 256K + YaRN 1M | Sonnet 4.6 (cache) | Gemini 3.1 Pro | — |
| `commit_msg` | T1 | Haiku 4.5 | qwen2.5-coder | Haiku | GPT-5 Mini OR qwen local | — |
| `docstring` | T1 | Haiku 4.5 | qwen3:30b | Haiku | qwen local | — |
| `regex.simple` | T1 | Haiku 4.5 | qwen2.5-coder | Haiku | qwen2.5-coder | Sonnet 4.6 se complexa |
| `explain_error.short` | T1 | Haiku 4.5 | qwen3:30b | Haiku | qwen3 local | — |
| `bug_fix.single_file` | T2 | **Sonnet 4.5/4.6** | qwen2.5-coder OR Devstral | Sonnet (cache, free) | Sonnet+cache | — |
| `refactor.1_to_3_files` | T2 | Sonnet 4.6 | Devstral 24B | Sonnet (free) | Sonnet+cache | — |
| `refactor.>3_files` | T3 | **Opus 4.7** | ❌ Devstral degrada | Opus (free) | Opus+cache | — |
| `architecture.decision` | T3 | Opus 4.7 | ❌ frontier-only | Opus (free) | Opus+cache | Mythos se disponível |
| `unit_test.gen` | T2 | Sonnet 4.6 | Devstral | Sonnet (free) | Sonnet+cache | Opus se TDD complexa |
| `sql.text_to_sql` | T2 | **Arctic-Text2SQL-R1** | Arctic-R1 local | Arctic | Arctic local | — |
| `tool_use.single_call` | T1 | **GLM 4.5** | GLM-4.5 local | Sonnet 4.6 (free) | GLM 4.5 ou GPT-5 Mini | — |
| `tool_use.multi_step` | T3 | **Mythos** OR Sonnet 4.5 | ❌ frontier-only | Sonnet 4.5 (free) | Sonnet+cache | Opus se ≥10 saltos |
| `math.aime_style` | T3 | **GPT-5.4** | Phi-4-reasoning-plus | Opus 4.6 (free) | GPT-5.4 ou Phi-4 local | — |
| `lang.pt_PT.cultural` | T2 | **AMALIA** OR Gemini 3.1 Pro | AMALIA local | AMALIA OR Sonnet+cache | AMALIA local primeiro | — |
| `lang.pt_BR.cultural` | T2 | **Sabiá-3** OR Gemini 3.1 Pro | Sabiá-3 local | Sabiá-3 OR Sonnet+cache | Sabiá-3 local primeiro | — |
| `lang.zh.coding` | T2 | **Qwen 3.6-Max** | Qwen 3.6 local | Qwen 3.6 (PAYG) | Qwen 3.6 local | — |
| `vision.screenshot` | T3 | **Opus 4.7 vision** | ❌ requires 80GB+ | Opus (free) | Opus+cache | Gemini 3.1 Pro alternative |
| `agentic.long_horizon` | T3 | Opus 4.7 lead + Sonnet workers | ❌ frontier-only | Opus+Sonnet (free) | Sonnet workers (cheaper) | — |
| `code_mixed_languages` | T2 + warn | Gemini 3.1 Pro | qwen3:30b multilingual | Sonnet+cache | Gemini 3.1 Pro | warn user (CodeMixBench) |
| `low_confidence` (kNN <0.6) | escalate to judge | Haiku 4.5 (judge) | — | Haiku judge | Haiku judge | — |

### 13.5 Routing decision em 100ms — flow concreto

```
[t=0ms]   Prompt arrives via UserPromptSubmit hook
[t=2ms]   Layer 0 cache lookup (Redis local, mxbai-embed)
[t=10ms]  miss → Layer 1 regex guardrails (.env, secret, prod, drop, force-push)
[t=12ms]  no match → Layer 2 features
            - fasttext lang detect (1ms)
            - has_code, n_files, tools detection (5ms)
            - codebase_lang from fingerprint .mooter/repo_fingerprint.bin (2ms)
[t=20ms]  Layer 3 kNN classifier (bge-m3 multilingual + 80-150 seeds)
            - embedding ~30ms (overlap with Layer 2 in async)
[t=50ms]  Layer 4 confidence gate
            - if conf >= 0.6 → continue
            - if conf < 0.6 → Layer 4b judge (Haiku, +700ms hard cap)
[t=52ms]  Layer 5 tier dispatch (lookup table §13.4)
[t=54ms]  Layer 5b specialist override
            - SQL detected → Arctic-R1
            - PT-PT cultural → AMALIA
            - PT-BR cultural → Sabiá-3
            - tool-use BFCL → GLM 4.5
[t=56ms]  Layer 7 personalisation prior
            - apply user_priors.bin (re-weight)
[t=58ms]  Layer 5c subscription bias
            - Max + T2 → Sonnet+cache (cost=0 inside window)
            - PAYG + T0 → local first; Haiku fallback if cold
            - Pro + quota>0.8 → degrade to Haiku PAYG
[t=60ms]  Layer 10 provider arbitrage
            - if anthropic.error_rate > 0.05 → failover to GPT-5/Gemini equivalent
            - if anthropic.p50 > 2× baseline → same
[t=62ms]  Layer 9 skill graph check
            - if prompt_tokens >= 500 AND multi-objective → decompose (else continue)
[t=65ms]  Final dispatch
            - emit RDTR JSON (Layer X telemetry)
            - send request to chosen provider
[t=??ms]  Provider responds (varies: Haiku 700ms, Opus 1500-2000ms, local 4600ms+)
[t=post]  Layer 6 cascade check
            - if test_fail OR retry≤60s → escalate tier+1, re-execute
            - else → log outcome, update Layer 7 priors, write cache
```

**Total decision overhead**: ~65ms p50, ~150ms p99 (excluding provider response time).
**Goal SLA**: p50 ≤100ms, p99 ≤300ms. Atinge.

### 13.6 Refinamentos que faltam para "perfeito"

Coisas que V4 ainda não cobre 100% — track em backlog:

| Refinamento | Phase | Effort | Gain |
|---|---|---|---|
| Speculative routing — começar 2 modelos em paralelo se ambiguous, cancelar o perdedor | V5 | Médio | Latency -20% em casos ambíguos |
| Adversarial prompt detection (red team automático) | V5 | Médio | Robustez contra prompt injection routing-level |
| Cost forecast pre-execution ("este prompt vai custar $X — confirmar?") | V4.1 | Baixo | UX trust |
| Quality estimator post-execution (não só test_fail/retry mas embedding similarity ao expected) | V5 | Alto | Better signal para Layer 7 |
| Cross-session continuity — same task em 2 sessões deve usar mesmo model | V4.1 | Baixo | Consistency |
| Auto-warm based on circadian usage — pre-warm local antes de horas activas | V4.2 | Baixo | Cold start eliminado |
| Provider-specific prompt re-writing (Anthropic XML vs OpenAI JSON-schema) | V4.1 | Médio | Quality +5-10% per provider |
| Embedding cache for common file contexts | V4.1 | Médio | -30% latency em sessions long |

---

## 14. Resumo numa frase

V4 = V3 (correcto) + 5 layers de moat (personalisation · fingerprint · skill graph · arbitrage · federated) + 1 schema transversal (telemetry RDTR) + mapa exaustivo de 30+ modelos × 25+ task forms × 7 subscription setups (§13). Build V3 até 2026-05-26 (gate). Build V4 entre 2026-05-27 e 2026-08-26 (Q3). Acredito? Sim. Anthropic teria orgulho? Com V4 + §13, sim. Com apenas V3, é correcto mas não memorável.
