# Token Economy — SOTA Gap Analysis (2026-06)

> **Data:** 2026-06-14 · **Método:** deep research, fan-out de 5 ângulos, ~50 fontes, medido-vs-marketing separado.
> **Pergunta:** estamos a optimizar dentro da nossa caixa, ou há técnicas SOTA inteiras que o Mooter nem toca?
> **Estado do mundo:** v1.39.0 / Wave 59A.

---

## TL;DR — a resposta honesta

**Sim, falta-nos uma coisa grande, e tem nome: o eixo do _output / reasoning budget_.**

O Mooter é um router de **um eixo** (que modelo / que tier) num problema que tem **quatro**:

| Eixo | O que controla | Mooter hoje | Alavancagem medida |
|---|---|---|---|
| **1. Tier/modelo** | que LLM atende | ✅ é o nosso core | 65–82% vs all-Opus |
| **2. Reasoning/output** | quanto o modelo "pensa" | ❌ **não controla** | **5–25× dentro do mesmo tier**; routing por reasoning need = 30–55% tokens medido |
| **3. Contexto/input** | quanto e o quê se envia | 🟡 começa na Wave 61 (Graphify) | 6–15× (repo médio); até 375× com *melhor* qualidade |
| **4. Cache/continuidade** | preservar prefixo entre turnos | ❌ **ignorado na função de custo** | cache read = 0.10× input; trocar de tier mid-sessão **quebra** o cache |

Tornar o Mooter "o melhor do mundo" = deixar de ser router de 1 eixo e passar a **router multi-eixo** — tier × reasoning-effort × context-budget × cache-affinity — **tudo a partir do mesmo classificador determinístico zero-LLM**. Não precisamos de violar a doutrina para nenhum deles.

A boa notícia: os eixos 2 e 4 são adições puramente host-side ao `router-hint` (mesmo mecanismo do tier). O eixo 3 já tem brief (Wave 61). Nenhum exige proxy.

---

## Os gaps ranqueados (alavancagem × encaixe na doutrina)

> Critério de inclusão: só conta se respeita **NO-PROXY + zero-LLM-na-decisão + local-first**.

### 🔥 GAP 1 — Reasoning-effort como 2º output do classificador · **maior ROI**
- **O quê:** emitir `reasoning_effort: none|low|medium|high` (etiqueta semântica, estável entre Anthropic/OpenAI/Gemini) no `router-hint`, por categoria de tarefa — exactamente como já emitimos o tier. Triviais → `none/low`; deploy/secrets/migrations (já T3) → `high`.
- **Porquê:** reasoning/thinking tokens são faturados a preço de output e **dominam** o custo. Variação de **5.8×** (Gemini 2.5 Flash: $3.50→$0.60) a **~20–25×** (GPT-5: 82M→3.5M tokens) **dentro do mesmo modelo**. Reasoners "overthink": 18× mais tokens, por vezes com *pior* accuracy. [MEDIDO]
- **Fit:** arquitecturalmente idêntico ao classify.js como segundo output. A literatura (Route-to-Reason, Ares, SynapseRoute, CAR) é "Mooter num segundo eixo" — 30–55% de poupança medida sem perda significativa.
- **⚠️ Cuidado:** o knob é `reasoning_effort`, **nunca** apertar `max_tokens` em modelos de reasoning (truncas a resposta e pagas o thinking na mesma).
- **Fontes:** [VentureBeat thinking budgets 2025-04](https://venturebeat.com/ai/googles-gemini-2-5-flash-introduces-thinking-budgets-that-cut-ai-costs-by-600-when-turned-down) · [Artificial Analysis GPT-5 2025-08](https://artificialanalysis.ai/articles/gpt-5-benchmarks-and-analysis) · [Route-to-Reason arXiv 2505.19435](https://arxiv.org/abs/2505.19435) · [Stop Overthinking arXiv 2503.16419](https://arxiv.org/pdf/2503.16419)

### 🔥 GAP 2 — Cache-aware cost function + session affinity · **mais defensável, muito "Mooter"**
- **O quê:** internalizar que **trocar de tier/provider a meio de uma sessão quebra o prefixo cacheado**. O custo real de re-routar inclui perder o cache read (0.10× input) e pagar o cache write (1.25×) no novo tier. Adicionar afinidade de sessão: preferir o moo que já tem o prefixo quente, salvo razão forte.
- **Porquê:** Claude Code já cacheia automaticamente (system, tool defs, histórico). Coding agents são o caso onde o cache mais importa (prefixo repete-se a cada turno; Mooncake = 3.8× em prefill recomputado). Se o `decide-agent` ignora isto hoje, **está a sobrestimar a poupança de saltar de tier mid-sessão**. [MEDIDO: pricing oficial; MARKETING: os "90% savings"]
- **Fit:** 100% host-side, determinístico, zero leitura de KV-cache do engine. A tensão genuína "routar agressivamente vs preservar cache" é decisão de produto — e expô-la é diferenciador.
- **❌ Não adoptar:** os *mecanismos* de cache (RadixAttention, vLLM APC, prefix-aware routers) são todos proxy/engine-side. Adoptamos a *ideia de custo*, não o mecanismo.
- **Fontes:** [Claude prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) · [vLLM Router 2025-12-13](https://vllm.ai/blog/2025-12-13-vllm-router-release) · [vLLM×Mooncake 2026-05-06](https://vllm.ai/blog/2026-05-06-mooncake-store)

### 🔥 GAP 3 — Symbol-graph repomap (concretizar a Wave 61) · **eixo Contexto**
- **O quê:** o eixo Tokens/contexto da Wave 61 deve incluir o padrão **aider repomap**: tree-sitter → defs/refs → PageRank personalizado → binary-search para encher um budget de tokens. Determinístico, host-side, zero-LLM, 60+ linguagens.
- **Porquê:** "context rot" — 18 modelos top degradam de forma não-uniforme com input longo; no LongMemEval, **~300 tokens focados batem 113k tokens completos** (≈375× menos contexto, *com melhor* accuracy). Code knowledge graphs medidos: 10× menos tokens por −9pp qualidade (Codebase-Memory); call-graph vs texto = 87% menos tokens. [MEDIDO]
- **Fit:** aider já provou em produção que symbol-graph + PageRank + budget é host-side e zero-LLM. Reforça e concretiza o brief Graphify (Wave 61) — não é só "recomendar Graphify", é adoptar o padrão.
- **Fontes:** [Chroma Context Rot 2025-07](https://www.trychroma.com/research/context-rot) · [Aider repomap (DeepWiki)](https://deepwiki.com/Aider-AI/aider/4-repository-understanding-and-context) · [Codebase-Memory arXiv 2603.27277](https://arxiv.org/html/2603.27277v1)

### 🟡 GAP 4 — Context-budgeting por tier · **routing puro**
- **O quê:** decidir *quanto contexto* cada tier recebe — T0 local (barato) pode receber mais cru; T3 Opus deve receber só o destilado. É uma dimensão da decisão de routing, não compactação.
- **Porquê:** subagentes com contexto isolado devolvem sumário de 1–2k tokens, não o trace bruto (Anthropic multi-agent). "Find the smallest set of high-signal tokens" é a regra-mestra de context engineering. [MEDIDO/doutrina vendor]
- **Fit:** não é proxy — é o router a dizer "para este destino, este orçamento de contexto". Encaixa em classify.js.
- **Fontes:** [Anthropic context engineering 2025-09](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Anthropic multi-agent 2025-06](https://www.anthropic.com/engineering/multi-agent-research-system)

### 🟡 GAP 5 — Guardrail anti-compressão para code-gen denso · **patch barato**
- **O quê:** o `prompt-optimizer.js` já desliga para architecture/cross-file/HIGH_RISK, mas **não explicitamente para `code_generation` denso**. A literatura diz que código é precisamente o caso sensível à compressão.
- **Porquê:** "Prompt Compression in the Wild" (2026): sumarização/QA aguentam, mas code-completion e few-shot são "sensitive or unsuitable". [MEDIDO]
- **Fit:** patch de guardrail, baixo esforço, evita degradação silenciosa.
- **Fonte:** [Prompt Compression in the Wild arXiv 2604.02985](https://arxiv.org/html/2604.02985)

### 🟡 GAP 6 — Política determinística de tool-result compression · **classify-style**
- **O quê:** classificar quais tool-results são descartáveis por categoria de tarefa (regra determinística) para alimentar o `/compact` do host.
- **Porquê:** reads dominam **76% dos tokens** de coding agents; "encontrar ficheiros" sozinho queima 108–117k tokens. Tool-result clearing é a compactação mais segura. [MEDIDO]
- **Fit:** regra zero-LLM no espírito do classify.js; não duplica o compaction do host, informa-o.
- **Fontes:** [Squeez arXiv 2604.04979](https://arxiv.org/pdf/2604.04979) · [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### ⚪ GAP 7 — Memory tiering local (core/recall/archival) · **organização**
- **O quê:** o MEMORY.md / Pastor é flat; o SOTA convergiu no modelo de 3 tiers (Letta/MemGPT: core sempre em contexto, recall pesquisável, archival frio).
- **Porquê:** structured distillation reporta 11× redução de tokens preservando retrieval. O Pastor já é "distillation com retrieval" — falta o tiering. [MEDIDO]
- **Fit:** organização de memória local-first, não proxy.
- **Fonte:** [Letta Memory Blocks](https://www.letta.com/blog/memory-blocks) · [Structured Distillation arXiv 2603.13017](https://arxiv.org/pdf/2603.13017)

---

## Correcções ao roadmap existente (achados que mudam decisões)

### ⚠️ EAGLE-3 / TurboQuant / speculative decoding — rebaixar
- **Speculative decoding e quantização operam no eixo COMPUTE/latência, NÃO no eixo tokens.** Geram os mesmos tokens; reduzem tempo/custo de compute local — que no T0 já é ~$0 marginal.
- **Pior:** num benchmark consumer real (RTX 3090, Qwen3 MoE A3B, single-request), **speculative decoding não dá net speedup** — os ganhos de EAGLE-3 (3.3–6.5×) são em GPU datacenter / batch / modelos densos, não no nosso caso de uso. [MEDIDO]
- **Acção:** rebaixar EAGLE-3 de "feature de velocidade" para "experimental, só rende em modelos densos / multi-sessão". TurboQuant só se for <Q4 (3-bit com importance matrix + guarda de qualidade para math). vLLM/SGLang = opt-in power-user, não default (o gap vs Ollama é quase todo *throughput em concorrência*, que o vibe-coder single-user não tem).
- **Não confundir eixos:** vender spec-decode/quant como "poupança" = confundir compute-cost (já ~$0 local) com token-cost (onde está o dinheiro).
- **Fontes:** [thc1006 RTX3090 spec-decode bench 2026-04](https://github.com/thc1006/qwen3.6-speculative-decoding-rtx3090) · [RunAIHome quant 2026-05](https://runaihome.com/blog/quantization-q4-q5-q6-q8-quality-loss-2026/)

### ✅ Confirmação: modelo-âncora T0
- **Qwen3-Coder-30B-A3B** corre ~73–87 tok/s na 4090 a Q4 (~18GB, cabe folgado). Na 2080S/8GB não cabe → tier 7–8B. Q4_K_M é o ponto óptimo medido para coding (= AWQ em HumanEval). KV-cache Q8 corta ~50% da VRAM do cache com perda no ruído → low-hanging fruit para contexto longo local. [MEDIDO]

---

## O que NÃO fazer (decidido, com razão)

- ❌ **Mecanismos de cache** (RadixAttention, vLLM APC, prefix-aware routers, KV stores) — todos exigem estar no caminho do pedido / ler KV-cache do engine. **Violam NO-PROXY.** Adoptamos só a ideia de custo (Gap 2).
- ❌ **Compaction própria** — o host (Claude Code) já o faz; replicar = proxy. O ângulo é *antecipar* a compaction para routing (parte do Gap 4/6).
- ⚪ **Semantic _response_ cache** — cachear *respostas* (≠ Pastor, que cacheia *decisões*) aproxima-se de proxy e é perigoso em código (false positives caros; sistemas regulados usam threshold 0.5%). Se entrar, **opt-in, local, por-prompt — nunca default.**
- ❌ **RAG/retrieval com embeddings + rerank na decisão** — custa um modelo extra na decisão; viola zero-LLM. Mantém-se a decisão determinística <50ms.

---

## Encaixe no roadmap (proposta)

| Slot | Gap | Eixo | Esforço | Nota |
|---|---|---|---|---|
| **Wave 60.5 / nova** | **GAP 1 — reasoning-effort hint** | Output | M | **Candidato a prioridade nº1** — maior ROI, fit perfeito como 2º output do classificador |
| **Wave 60** (já planeada) | GAP 2 — cache-aware cost function | Cache | S–M | Encaixa no refit do `decide-agent`/savings; muito defensável |
| **Wave 61** (já com brief) | GAP 3 — repomap symbol-graph | Contexto | M | Concretiza o brief Graphify com o padrão aider |
| **Wave 61.x** | GAP 4 — context-budget por tier | Contexto | S | Extensão natural do graph-context |
| **Wave 63** (fricção) | GAP 5 — guardrail code-gen · GAP 6 — tool-result policy | Vários | S | Patches baratos |
| **Backlog** | GAP 7 — memory tiering | Memória | M | Quando o Pastor for retrabalhado |

**Recomendação de sequência:** **GAP 1 (reasoning-effort) sobe a topo do roadmap** — é o maior eixo não-explorado, mede 30–55% de poupança independente, e é a adição mais barata e mais alinhada com a doutrina (segundo output determinístico do classify.js). GAP 2 (cache-aware) entra junto com o refit do decide-agent. GAP 3/4 consolidam a Wave 61.

---

## Nota de método (honestidade)

- Tudo etiquetado **[MEDIDO]** vem de papers peer-reviewable ou benchmarks de terceiros independentes (Chroma 194k chamadas, Artificial Analysis, aider source, arXiv 2025-2026). Tudo **[MARKETING-VENDOR]** (os "600%", "90% savings", "71×", "5×/3.8×") são tetos de melhor-caso — não usar como típico.
- A maioria dos números de poupança depende de condições (tamanho de repo, cache-hit-rate, tipo de tarefa). Claims do Mooter devem sempre emparelhar (número, condição, fonte, as_of) — gate humano antes de publicar, igual à política da Wave 59B.
