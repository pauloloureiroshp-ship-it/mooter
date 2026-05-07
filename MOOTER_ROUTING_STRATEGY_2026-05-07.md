# MOOTER — Routing Strategy 2026
**Análise estratégica · 2026-05-07 · 19 dias até gate (2026-05-26)**

---

## 0. TL;DR — 3 leituras essenciais

1. 🔥 **A janela de oportunidade do Mooter como router OSS standalone fecha em 12-18 meses** — Anthropic, OpenAI e Google estão a comoditizar routing intra-família dentro dos próprios SDKs (smart switching, Responses API). O moat não é "mais um router". O moat é **subscription-aware cross-provider routing com integração local-first nativa**.

2. 🔥 **A pergunta "Opus primeiro ou local primeiro" está mal formulada** — a resposta empírica é: nenhum dos dois como default. **Specialist routing com cascade-on-uncertainty** vence em quality-cost Pareto. Plan-with-frontier+execute-with-local **perde para Opus solo em harness maduro** (Akita 2026: Opus 4.7 em opencode = 97/100, $4 — nenhum combo bate isto). Meta-prompting só compensa em batch jobs (>10 chamadas com mesmo template).

3. 🔥 **Killer feature que ninguém implementa hoje: Subscription-Aware Routing.** Se o utilizador tem Claude Max ($200/mês), o marginal cost do Opus é zero — o router deve assumir frontier-first com cache agressivo e mostrar "saved $X vs PAYG". Se é PAYG, agressivo no local-first. Cursor não faz, Continue não faz, Aider não faz, OpenRouter não faz. **Está no teu MEMORY.md como north star — executa.**

---

## 1. Estado do mercado de LLM routing (Maio 2026)

### 1.1 Players principais

| Player | Tipo | Approach | Pricing | OSS? | Diferenciador |
|---|---|---|---|---|---|
| **OpenRouter** | Gateway hosted | Catálogo + fallbacks; "best-of" routing opcional | 5,5% fee em compras de créditos | API client sim, backend não | 400+ modelos, 60+ providers, ~$50M ARR Q1 2026 |
| **RouteLLM (LMSYS)** | Framework OSS de research | Routers treinados em Arena preference data — matrix factorization, BERT, causal LLM, similarity-weighted | Self-host gratuito | Apache-2 | 85% redução custo MT-Bench mantendo 95% GPT-4 quality |
| **LiteLLM (BerriAI)** | Proxy/SDK | simple-shuffle, latency-based, usage-based-v2; fallbacks YAML; cooldown/retries | OSS gratuito; Cloud enterprise pago | MIT | 100+ providers em formato OpenAI |
| **Martian** | Routing comercial closed | "Model mapping" interpretability | Closed, enterprise | Não | YC, perto de $1.3B valuation Abr 2026; 20-97% cost reduction |
| **NotDiamond** | Routing comercial | Classifier por query | Freemium + enterprise | Parcialmente | Maintém `awesome-ai-model-routing`; rank #12 RouterArena |
| **Unify AI** | Router hosted | Routing por quality/cost/speed | Pay-per-token | Não | Tuning dashboard |
| **Portkey** | AI gateway full-stack | Routing condicional + canary + circuit breakers + guardrails | $49/mês+ | Gateway core MIT, Cloud pago | Observability OTEL nativa |
| **Helicone** | Observability-first gateway | Rust load-balancing | OSS self-host gratuito | Sim | Performance Rust |
| **vLLM Semantic Router (Iris)** | OSS lib emergente | 4-layer signal-decision (kw + embed + classifier + LLM) | Self-host | Apache 2.0 | Backed Red Hat, release Athena Mar/2026 |
| **aurelio-labs/semantic-router** | OSS lib madura | Embedding similarity + hybrid keyword | Self-host | MIT, 3.2k stars | Sweet spot para indie OSS |

### 1.2 Padrões arquitecturais comuns (consenso técnico)

| Padrão | Quem usa | Trade-off |
|---|---|---|
| **Regras estáticas (YAML)** | LiteLLM, Portkey | Latência 0, debug trivial, não generaliza |
| **Classifier ML (BERT/MF)** | RouteLLM, Martian, NotDiamond | 92-96% precision após tuning, precisa dataset |
| **Embedding + k-NN** | aurelio-labs, vLLM Iris | Zero training, cresce com uso, cold-start fraco |
| **LLM-as-judge** | Raro em runtime | Generaliza imediatamente, mas adiciona LLM call ao caminho crítico |
| **Cost-aware bandit** | CARROT, contrastive routing papers | Optimiza utility directamente, complexidade alta |
| **Cascade (FrugalGPT-style)** | RouteLLM cascade, Speculative Cascades (Google) | 95% quality com 26% das calls, mas latência aditiva no worst case |

**Telemetria standard (todos):** OTEL — tokens in/out, latency, cost, error rate, model id.

### 1.3 Gaps que ninguém resolve bem (= oportunidade)

| Gap | Estado actual | Onde Mooter pode entrar |
|---|---|---|
| ⚠️ **Multilingue PT-PT/PT-BR** | Routers OSS treinados em LMSYS Arena anglocêntrica | Fine-tune em prompts PT + AMALIA/Gemma3 como base |
| ⚠️ **Privacy-preserving local-first** | OpenRouter/Martian/NotDiamond hosted; LiteLLM/Portkey self-host mas routing estático | Classifier local (CPU/Ollama) decide *antes* de chamar API |
| ⚠️ **Tool-use / agentic workflows** | Benchmarks single-turn QA; ignoram tool calls multi-step | Router que considera tool reliability do modelo |
| ⚠️ **Codebase-aware routing** | Nenhum router lê estrutura do projecto | Hint baseado em ficheiros tocados, language, framework |
| ⚠️ **Confidence/abstention** | Apenas papers académicos (EMNLP 2025) | Mooter pode shippar antes de virar standard |
| 🔥 **Subscription-aware** | Ninguém | **Killer feature** |

### 1.4 Benchmarks autoritativos (table-stakes)

| Benchmark | O que mede | URL |
|---|---|---|
| **RouterBench** | 405k inferências, 11 modelos, métrica AIQ | arxiv.org/abs/2403.12031 |
| **RouterEval** | 200M+ records, 12 evals, 8500+ LLMs | arxiv.org/abs/2503.10657 |
| **RouterArena** | 5 dimensões, live leaderboard | arxiv.org/html/2510.00202 |
| **LLMRouterBench** | 400k instances, 21 datasets, 33 modelos | arxiv.org/html/2601.07206 |

**Recomendação:** publicar Mooter em RouterArena (live leaderboard). É marketing barato com credibilidade técnica.

---

## 2. O que dizem os especialistas (consenso emergente)

### 2.1 Pontos de consenso

| Ponto | Quem disse | Evidência |
|---|---|---|
| **50-85% poupança via routing/cascade sem perda significativa** | LMSYS, Anthropic | RouteLLM: 85% MT-Bench, 45% MMLU, 35% GSM8K. Haiku→Sonnet→Opus blended ~$10.50/M output vs $25/M Opus = 58% saving |
| **Hybrid SLM+frontier é o default em prod 2026** | MachineLearningMastery, Together AI | Together: Gemma 3 27B fine-tuned bate Sonnet 4 em 60% no domínio específico |
| **Plan-and-execute formalizou-se como padrão dominante** | LangChain, SurePrompts | LangGraph já tem pré-construído |
| **Inference-time scaling é vector dominante de progresso** | Sebastian Raschka, HuggingFace | "Improved tooling and inference-time scaling rather than core model" |
| **Routing por complexidade = currículo standard** | Hamel Husain | "Lesson 8: Cost Optimization", 4.000+ engs |

### 2.2 Debates abertos

⚠️ **MoE interno vs routing externo.** DeepSeek-V3 (671B/37B activos, 256 experts) tornou MoE interno standard em frontier. Cameron Wolfe: "in 2026, nearly all frontier models use MoE". Tensão real: granularidade de routing já existe *dentro* do modelo. O eixo *capability* dilui-se. O eixo *cost* (entre $0.20/M nano e $25/M Opus) continua a justificar routing externo.

⚠️ **Pareto cost-quality está a achatar?** Sonnet 4.6 oferece "Opus-level intelligence at Sonnet pricing" e foi preferido a Opus 4.5 por 59% dev. Mas Opus 4.7 mantém gap em "Hard Prompts" e "Coding" no Arena. A fronteira está a achatar **no meio**, a estender-se **nos extremos** (nano $0.20/M ↔ Opus xhigh).

⚠️ **Frontier pequenos especializados.** SLMs ganham em narrow domains, perdem em "broad reasoning, complex multi-step, creative synthesis". A direcção é "tiny is the future" mas com asterisco grande.

### 2.3 Recomendações oficiais providers (Maio 2026)

| Provider | Modelo | Quando usar (texto oficial) |
|---|---|---|
| **Anthropic** | Haiku 4.5 | Budget tasks, file reads, quick edits, routine questions |
| | Sonnet 4.6 | Daily driver, 90%+ coding, "Opus-level intelligence at Sonnet pricing" ($3/$15) |
| | Opus 4.7 | Architecture, large codebase analysis, agent teams, xhigh effort tier ($5/$25) |
| **OpenAI** | GPT-5.4 nano | Classification, data extraction, ranking, coding subagents ($0.20/$1.25) |
| | GPT-5.4 mini | Low-latency, high-volume workloads ($0.75/$4.50) |
| | GPT-5.4 | Final high-stakes reasoning |
| **Google** | Gemini 3 Flash-Lite | Budget default, ~20× mais barato que Pro |
| | Gemini 3 Flash | Moderate-complexity generation |
| | Gemini 3.1 Pro | Factuality-critical (financial, scientific, legal) |

**Padrão recorrente nos 3:** default no mid/cheap, escalar para Pro/Opus apenas quando confidence é baixo ou parsing falha.

### 2.4 Padrões emergentes em produção

| Padrão | Como funciona | Quem usa |
|---|---|---|
| **Cascade clássico** | Cheap upstream filtra, expensive downstream resolve hard cases | Eugene Yan; FrugalGPT followups |
| **Speculator+verifier** | Draft pequeno propõe K tokens, target verifica em paralelo | ICLR 2026 "Speculative Speculative Decoding" |
| **Plan-and-execute** | Planner Opus/Pro, executor Haiku/nano/Flash | LangChain, Cursor architect mode, Aider |
| **Critic-as-second-opinion** | Modelo barato gate antes do caro | LMSYS BenchLM |
| **Confidence-routing** | Pro só para low-confidence ou parse failures | Gemini guidance oficial |

### 2.5 Sinais 12-24 meses

| Sinal | Implicação para Mooter |
|---|---|
| **Routing comoditizado nos SDKs** | ⚠️ Anthropic já tem smart switching; OpenAI Responses API. **Routing intra-família vai virar nativo do provider em 12 meses.** Mooter mantém valor em cross-provider e cost-aware com hard caps |
| **Inference-time compute muda equação** | Custo varia por *prompt* (reasoning tokens), não só por modelo. Routers do futuro têm de prever reasoning budget |
| **Distillation pessoal** | Karpathy nanochat (Feb 2026): "GPT-2 capability for $48". Direcção clara: fine-tune local sobre dados do user como tier zero |
| **RouterArena vira standard** | Mooter deve publicar números aí para credibilidade |

---

## 3. Mapa LLMs locais (RTX 4090, Maio 2026)

### 3.1 Runtimes — qual usar quando

| Runtime | Plataforma | Strengths | Weaknesses | OSS? |
|---|---|---|---|---|
| **llama.cpp** | All (CPU/CUDA/Metal/Vulkan) | Performance bruta, GGUF nativo, MCP client merged Mar/2026, RPC sharding multi-máquina, Flash Attention | Setup manual, sem registry, CLI cru | MIT |
| **Ollama** ⭐ | All | UX trivial, model registry, dynamic context, tool calling nativo, MLX preview macOS | 10–30% overhead vs llama.cpp puro | MIT |
| **vLLM** | Linux/CUDA | Continuous batching + PagedAttention; ~3.3× throughput vs Ollama em concorrência | Linux-only prático, complexo | Apache-2 |
| **LM Studio** | Win/Mac/Linux | GUI sólida, MLX support, MCP tool-calling, SDK | Proprietário | Não |
| **Jan AI** | Win/Mac/Linux | Apache-2, extension system | Mais novo, ecosistema menor | Apache-2 |
| **ExLlamaV2** | CUDA | EXL2 format, 10–20% mais rápido que Ollama em 4090 | Python, NVIDIA-only | MIT |
| **TensorRT-LLM** | NVIDIA | Até **70% mais rápido** que llama.cpp em RTX 4090 | Build per-model, NVIDIA-only | Apache-2 |
| **MLX / mlx-lm** | Apple Silicon | Nativo Metal | Só Apple | MIT |
| **bitnet.cpp** | CPU | 2.4–6.2× speedup CPU, energia 70-82% lower | Modelos limitados, MS recomenda não usar prod | MIT |

⭐ Recomendação Mooter v1: **Ollama** como cidadão de 1ª classe (já é); adicionar **vLLM** como tier "advanced" para users com GPU server-grade.

### 3.2 Modelos top-12 que cabem em 24GB VRAM

| Modelo | Params | Quant. | VRAM Q4 | Strengths | Weaknesses | Use case ideal |
|---|---|---|---|---|---|---|
| **Qwen3-32B** dense | 32B | Q4_K_M | ~22GB | Top quality, 91 ArenaHard | Lento (~20 tok/s) | Best overall 4090 |
| **Qwen3-30B-A3B** MoE | 30B/3B activos | Q4_K_M | ~18GB | **~196 tok/s**, 69.6 SWE-bench | Quality < dense 32B | **Default Mooter (speed+quality)** |
| **Qwen3-Coder-30B** | 30B MoE | Q4_K_M | ~18GB | Specialized coding, fast | Não generalista | Coding assistant local |
| **Qwen3-14B** | 14B | Q8_0 | ~15GB | Best 14B all-rounder, MMLU 81.1 | Atrás do 32B em raciocínio | Coding + headroom contexto |
| **Devstral Small 2** | 24B | Q4/Q5 | ~16GB | **72.2% SWE-bench Verified**, 256k context | Não generalista | Coding agentic local |
| **DeepSeek-R1-Distill-Qwen-32B** | 32B | Q4_K_M | ~22GB | Bate o1-mini, raciocínio strong | Verbose CoT | Reasoning / math |
| **Llama 4 Scout** | 17B/109B MoE | Q4 c/ offload | ~22GB | **10M context window**, multimodal | MoE total não cabe; precisa RAM offload | Long-context / RAG |
| **Gemma 3 27B** | 27B | Q4_K_M | ~18GB | 80% LiveCodeBench, 85.2 MMLU-Pro, ótimo PT | Sem thinking dedicado | Single-GPU prod |
| **Gemma 3 12B** | 12B | Q5/Q8 | ~12GB | **Melhor open-weight em pt-PT** | Atrás do 30B+ em raciocínio | Multilingue / PT-PT |
| **Phi-4 14B** | 14B | Q5_K_M | ~10GB | **Bate 70B+ em math/logic** | Fraco multilingue, conversa | Math/reasoning |
| **Mistral Small 3.x** | 24B | Q4_K_M | ~14GB | MT-Bench 8.0, instruction-following | Coding atrás de Qwen3 | General chat |
| **AMALIA** | 7B/12B | Q5/Q8 | 8–14GB | **Specialist europeu PT-PT** | Fora-domínio fraco | PT-PT cultural |

### 3.3 Best fit por use case

| Use case | Recomendação |
|---|---|
| 🔥 Coding assistant local | **Devstral Small 2** (72.2% SWE) ou **Qwen3-Coder-30B** se preferes velocidade |
| 💬 General chat local | **Qwen3-32B** Q4 (qualidade) ou **Mistral Small 3.x** (velocidade) |
| 🛠 Tool-use / function calling | **Qwen3 family** lidera; **Llama 4 Scout** sólido. ⚠️ chat-template compatibility importa mais que param-count |
| 🌍 Multilingue / PT-PT | **Gemma 3 12B/27B** geral; **AMALIA** PT-PT cultural; **Qwen3-8B/14B** fallback compacto |
| ⚡ Latência mínima | **Qwen3-30B-A3B** (~196 tok/s 4090) |
| 📚 Long context (>32k) | **Llama 4 Scout** (10M context) |

### 3.4 Onde local ainda perde para cloud (honestamente)

| Gap | Quão grande |
|---|---|
| ⚠️ Quality gap **≈ 1 ano** | Best local Maio 2026 ≈ frontier Maio 2025. MiniMax M2.5 fechou em SWE-bench (80.2 vs 80.8 Opus) mas só com 256GB+ VRAM |
| ⚠️ Multi-file / long-context coding | Frontier 1M+ contextos out-of-reach localmente sem RAM offload pesado; ~60% vantagem em refactor multi-arquivo |
| ⚠️ Tool-use reliability em chains longas | Reasoning encadeado >3 saltos degrada notavelmente abaixo dos 30B |
| ⚠️ First-token latency | Local: ~100–200ms; Cloud edge: <80ms. UX-relevant em interactivo |
| ⚠️ Reasoning multi-step | DeepSeek-R1-Distill-32B decente mas atrás de o3 / Opus 4.7 em multi-hop denso |
| ⚠️ Fresh knowledge | Locais 6–12 meses mais antigos que frontier prod |

### 3.5 Onde local ganha em 2026 (oportunidades para Mooter)

| Caso | Porque ganha |
|---|---|
| ✅ Tier T0/T1 (commit msgs, summarization, regex, format, classification) | Qwen3-30B-A3B Q4 cobre 60-70% volume típico de dev agents. Após hardware sunk-cost, é literalmente grátis |
| ✅ Privacy-sensitive flows | Único caminho legítimo para código proprietário, contratos, dados pessoais |
| ✅ High-volume bursty (batch labeling, RAG pre-processing, embedding cleanup) | vLLM continuous batching torna RTX 4090 economicamente devastador vs API per-token |

### 3.6 Onde local NÃO está pronto (Mooter não deve ser opinionated)

| Caso | Porquê não |
|---|---|
| ❌ Architecture / multi-file refactor / T3 | Opus/Sonnet imbatíveis; forçar local = bad UX e foot-gun |
| ❌ Frontier reasoning (debug profundo, audits pré-deploy) | Gap ~1 ano persiste; "final-reviewer" cloud-only |
| ❌ Tool-use em chains longas / agentes autónomos | Reliability degrada após 3-4 saltos. Não recomendar local sem disclaimer |

---

## 4. Taxonomia de routing strategies (qual implementar)

| # | Strategy | Pros | Cons | Quando usar | Para Mooter |
|---|---|---|---|---|---|
| 1 | **Rule-based (regex/keyword)** | Latência 0ms, determinístico, free | Não generaliza, maintenance burden | Camada 0 (guardrails) | ✅ `.env`, `migration`, `secret`, `prod`, `delete` → força T3 |
| 2 | **Classifier-based (BERT)** | 92-96% precision, ~10-50ms, offline | Precisa training data (>1k exemplos), opaco | Camada 1 com dataset | 🔜 v0.2 quando tiveres 1k+ prompts reais |
| 3 | **Embedding similarity (k-NN)** | Zero training, explica decisão, cresce com uso | Cold-start fraco, ops surface | **Sweet spot OSS sem dataset inicial** | ✅ **MVP — usa `aurelio-labs/semantic-router`** |
| 4 | **LLM-as-judge** | Generaliza imediatamente | Adiciona LLM call ao caminho crítico (irónico para router de poupança) | Eval offline, fallback de baixa confiança | ⚠️ Camada 2 com hard cap (<5% prompts) |
| 5 | **Cost-aware bandit** | Optimiza utility directamente, adapta drift | Eng. complexa, precisa quality signal | v2+ depois de telemetria | 🔜 v1.0 |
| 6 | **Cascade (FrugalGPT)** | 95% quality com 26% calls | Latência aditiva worst case, UX má em streaming | Tasks tolerantes a latência | ⚠️ Opt-in, não default |

### 4.1 Bibliotecas open-source maduras

| Lib | Approach | Stars | Maintained | Stack |
|---|---|---|---|---|
| `aurelio-labs/semantic-router` ⭐ | Embedding + hybrid keyword | 3.2k | Sim (v0.1.12 Nov 2025) | Python, MIT |
| `lm-sys/RouteLLM` | mf, BERT, causal LLM, similarity-weighted | ~3k | Sim, ICLR 2025 | Python, paper-grade |
| `vllm-project/semantic-router` (Iris) | 4-layer signal-decision | crescendo | Sim, Red Hat-backed | Go + Python, Apache 2.0 |
| `zilliztech/GPTCache` | Semantic cache | 7k+ | Sim | Python |
| `withmartian/routerbench` | Benchmark dataset | ~200 | Estagnou desde 2024 | Dataset |

⭐ **Para Mooter v0.1: aurelio-labs/semantic-router.** Maturidade certa, license MIT, encoder swappable (Cohere/OpenAI/HF/FastEmbed).

### 4.2 Prompt-level optimisations (orden de win/effort)

| Técnica | Ganho típico | Effort | Recomendação |
|---|---|---|---|
| ✅ **Caching semântico** (GPTCache, RedisVL) | 30-60% hit rate em produtos com queries repetitivas | Baixo | **Faz primeiro, sempre** |
| ✅ **LLMLingua / LLMLingua-2** | 4-10x compression típica | Médio | Vale para system prompts longos |
| 🔜 Prompt rewriting (Haiku → canónico) | 30-50% tokens | Médio | v2+ |
| ⚠️ Context distillation | Variável | Alto | Útil em sessões >20 turns (já tens scratchpad protocol) |

---

## 5. A pergunta crítica respondida: frontier-first vs local-first?

### 5.1 Reformulação honesta da pergunta

A pergunta original — "Opus 4.7 ou qwen3 30B no primeiro prompt?" — assume binária. **A pergunta correcta é "qual modelo para qual classe de prompt"**, e a resposta é roteamento por classe (specialist routing), não escolha global de "primeiro".

### 5.2 Avaliação das 7 estratégias possíveis

| # | Estratégia | Quality | Cost | Latency | Sweet spot |
|---|---|---|---|---|---|
| 1 | Frontier-only (Opus sempre) | A+ | $$$ | 1x | Sob subscription com marginal cost = 0 |
| 2 | Local-only (qwen3 sempre) | B | $0 | 1x | Privacy hard-required, batch high-volume |
| 3 | Cascade (local→frontier on retry) | A- | $-$$ | 1.3x médio | Workloads c/ judger fiável |
| 4 | **Plan-frontier+exec-local** | B+ | $$ | 2x | ⚠️ **Sub-óptimo** — perde para frontier solo |
| 5 | Plan-local+exec-frontier | A | $$ | 2x | Long-context (>200k) onde local faz pre-processing |
| 6 | **Specialist routing** ⭐ | A | $-$$ | 1x | **Default de produção 2026** |
| 7 | TTS small model (CoT longa) | A em narrow | $0 | 5-10x | Math/code competition, não real work |

### 5.3 Por que "plan-with-Opus, execute-with-local" perde como default

Razões empíricas (não opinião):

1. **Plan-then-execute homogéneo > heterogéneo.** [PEAR EACL 2026](https://aclanthology.org/2026.findings-eacl.237.pdf) e estudos de cyber 2026 mostram que mixed-model coordenação dentro do mesmo modelo bate divisão. Quando Opus desenha plano e qwen3 executa, **o executor segue cegamente erros do planner sem capacidade de detectar**.

2. **Latência dupla.** 2 inferências serializadas. Tarefa de 30s em frontier vira 60-90s. Vibe coder em Cursor não espera.

3. **Solo frontier em harness maduro vence combos.** Akita 2026: Opus 4.7 em opencode = 97/100, $4. Nenhuma combinação multi-agente bate isto em quality+cost.

4. **Prompt distillation funciona offline, não online.** PLD 2026 mostra Gemma-3 4B subindo de 57% → 90% F1 com prompt destilado de teacher — **mas é compilation step, não runtime**. Opus desenhar prompt para qwen3 em runtime ≠ distillation prática.

### 5.4 Quando "frontier compõe prompt para local" tem nicho real

✅ **Quando o local vai correr muitas vezes com aquele prompt** (batch processing, ETL pipeline, RAG de 10k docs). Aí o overhead de 1 chamada Opus amortiza-se sobre N chamadas locais. **Isto é distillation prática, vale opt-in feature: "compile your prompt".**

### 5.5 O efeito do Prompt Caching que muda a equação

⚠️ **Anthropic prompt caching** (5-min TTL, hit = 10% input price = 90% saving). Em sessões activas o cache nunca expira efectivamente. Multi-turn em Opus com system prompt cached é **dramaticamente mais barato** do que aparenta no preço de tabela. Isto significa que **frontier-first é menos caro do que parece** — e routing precisa de levar isto em conta.

### 5.6 Trade-offs honestos

| Issue | Magnitude |
|---|---|
| ⚠️ Latência 2x mata UX em chat interactivo | Crítico |
| ⚠️ Failure mode silencioso (planner alucina, executor segue) | Crítico sem judger |
| ⚠️ Privacy: só importa se user valoriza explicitamente | Variável |
| ⚠️ **Sob subscription, marginal cost de Opus = 0** | **Routing perde economic justification para esse user — tens que admitir isto no posicionamento** |

### 5.7 Resposta directa à pergunta do Paulo

> **"Devo usar Opus 4.7 no primeiro prompt para gerar prompt óptimo, ou usar capacidade máxima do LLM local?"**

**Nenhum dos dois como default.** Specialist routing por classe + cascade-on-uncertainty vence empiricamente. Razões:

- ❌ "Opus para gerar prompt óptimo para qwen3" (meta-prompting) → não vale o overhead em runtime. Latência dupla, harness combos perdem para frontier solo, planner brittleness é bottleneck #1. Vale apenas em batch (compile-step).
- ❌ "Local máximo a tentar resolver tudo" → Quality gap ~1 ano persiste em refactor multi-file, reasoning multi-hop, tool chains longas. Forçar local nestes casos = foot-gun para vibe coders.
- ✅ **Specialist routing**: classifier (que já tens em `classify.js`) decide tier inicial. T0/T1 → local. T2 → Sonnet. T3 → Opus. **Cascade automático** se output local tem baixa confidence — judger leve em qwen3 mesmo (~$0). Isto é a evolução do FrugalGPT que [DeKoninck 2024 ETHZ](https://files.sri.inf.ethz.ch/website/papers/dekoninck2024cascaderouting.pdf) chama "cascade routing" — **bate routing puro e cascade puro**.

---

## 6. Recomendação concreta para Mooter (arquitectura)

### 6.1 Stack para v0.1 (MVP, próximos 19 dias)

```
┌──────────────────────────────────────────────────────────────┐
│  CAMADA 0 — Guardrails rule-based (regex)                    │
│  .env, migration, secret, prod, delete → força T3            │
│  Latência: 0ms                                               │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  CAMADA 1 — Embedding similarity (k-NN)                       │
│  aurelio-labs/semantic-router + bge-small-en-v1.5             │
│  Seed: 80-150 exemplos curados (20-30 por tier)              │
│  Confidence threshold: 0.6                                    │
│  Latência: 50-200ms                                           │
└──────────────────┬───────────────────────────────────────────┘
                   │ confidence < 0.6 (max 5% prompts)
┌──────────────────▼───────────────────────────────────────────┐
│  CAMADA 2 — Fallback LLM-as-judge (Haiku)                    │
│  Hard cap: 5% dos prompts                                    │
│  Custo: ~$0.0001/call                                        │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  CACHE SEMÂNTICO (GPTCache + Redis)                          │
│  Threshold: 0.92 cosine                                      │
│  Hit-rate alvo: 30-60%                                       │
│  À frente de TUDO acima                                      │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Defaults pre-shipped (Mooter "RTX 4090 recipe")

| Componente | Recomendação |
|---|---|
| Local runtime | **Ollama** (default) + opcional **vLLM** para advanced |
| Local models default | **Qwen3-30B-A3B Q4** + **Devstral Small 2 Q4** + **Gemma 3 12B Q4** |
| Disco total | ~50GB (cabe confortavelmente) |
| Cobertura | T0/T1 (~70% volume típico) + coding + multilingue PT |
| Quantização default | **Q4_K_M** (GGUF) para máxima compat |
| Cloud tiers | Haiku (T1 com tools), Sonnet 4.6 (T2 default), Opus 4.7 (T3) |

### 6.3 Tier mapping honesto (sem fingir)

| Tier | Default | Opt-in advanced | Quando local NÃO |
|---|---|---|---|
| **T0** (typo, rename, format) | Local (qwen3-30B-A3B) | — | Privacy não importa, cost é zero |
| **T1** (commit msg, regex, docstring, summary) | Local primário | Haiku se tool-use | Tool chains >3 saltos → escala |
| **T2** (bug, plano técnico, refactor 2-3 ficheiros) | **Sonnet 4.6** | Qwen3-32B para users avançados | Multi-file >3 ficheiros sempre Sonnet+ |
| **T3** (arquitectura, refactor multi-file, decisões críticas) | **Opus 4.7** | Sempre | Cloud-only |
| **T3-gate** (pré-merge/push/deploy) | **Opus 4.7** + judger | Sempre | Sem excepção |

### 6.4 Eval framework mínimo viável

| Componente | Detalhes |
|---|---|
| **Dataset** | 200-500 prompts reais do Paulo + amostra de RouterBench (sanity check) |
| **Métrica primária** | Cost-quality Pareto curve (eixo x: $/query, eixo y: quality score) |
| **Métricas secundárias** | Routing accuracy (top-1 tier vs human label), Avg cost vs all-Opus baseline (% saved), Quality regression vs all-Opus (target: ≤2% drop) |
| **Judge** | Sonnet ou Opus como reference judge — só *fora* do hot-path. Alterna 2 judges, mede agreement |
| **CI** | Nightly run sobre dataset golden, alerta se Pareto degradar |
| **Baselines** | Random router, all-cheap, all-expensive, oracle (upper bound) |

### 6.5 O que NÃO fazer (próximos 19 dias)

| ❌ Não fazer | Porquê |
|---|---|
| MoE-style gating treinado de raiz | Complexidade brutal, ganho nulo vs k-NN para volume Mooter |
| LLM-as-judge no hot-path com Sonnet/Opus | Ironia anti-frugal, mata o pitch |
| Cascade puro estilo FrugalGPT em agente interactivo | UX má, user vê falhas |
| Speculative decoding custom | Acceptance rate cai 60→40% em coding domain; eng. profunda; só faz sentido se serves o teu próprio inference |
| Test-time compute scaling com PRM | Eng. >6 semanas |
| Plan-with-frontier-execute-with-local como default | Perde para Opus solo |
| Fine-tuning próprio do qwen3 | 6+ semanas de eng. + GPU compute |
| Catálogo de 400+ modelos como OpenRouter | Esforço infinito, sem moat |
| Closed-source "model mapping" como Martian | Fora do alcance OSS indie |

---

## 7. Killer feature: Subscription-Aware Routing 🔥

### 7.1 A insight

Ninguém combina **pricing model awareness com routing**:
- Cursor não.
- Continue não.
- Aider não.
- OpenRouter não (BYOK mas não trata subscription como variável).
- LiteLLM não.

### 7.2 A mecânica

```
User config:
  anthropic_subscription: "max"     # "none" | "pro" | "max" | "team"
  openai_subscription: "plus"        # "none" | "plus" | "team"
  google_subscription: "advanced"    # "none" | "advanced"

Mooter routing logic:
  if user.anthropic_subscription in ("max", "team"):
    # Marginal cost = 0 para Anthropic
    # Bias para Sonnet/Opus, prompt caching agressivo
    # Mostrar "saved $X this month vs PAYG" como evidência

  elif user.anthropic_subscription == "none":
    # PAYG agressivo no local-first
    # Frontier só quando guardrails forçam ou cascade escala
```

### 7.3 Métricas a expor

| Métrica | Como calcular |
|---|---|
| `$ saved this month` | (all-Opus PAYG cost) − (actual cost paid) |
| `% calls que ficaram local` | Local calls / total calls |
| `% subscription utilization` | Used subscription rate-limit / max |
| `Quality delta vs all-Opus` | Pareto comparison contra baseline |

### 7.4 Por que isto é defensável

1. **Time-locked moat** — providers SDKs vão eventualmente lá chegar mas não nos próximos 12 meses. Tens janela de execução.
2. **Cross-provider obrigatório** — Claude Max só cobre Anthropic. Mooter ganha relevância porque user típico vai querer combinar Claude Max + GPT-5 PAYG + local Qwen3.
3. **Marketing barato e auditável** — `$ saved this month` é número que aparece no statusbar. Vibe coders partilham screenshots no Twitter.
4. **Está no teu MEMORY.md como north star** — `[Frugal — North Star Vision](project_frugal_north_star.md): budget-first, subscription-aware, equilíbrio perfeito para vibe coders`. Não é invenção minha — é o teu plano.

---

## 8. Roadmap 19 dias até gate (2026-05-26)

### Semana 1 (até 2026-05-13)

| Dia | Tarefa | Critério de aceitação |
|---|---|---|
| 2026-05-08 | Decidir stack: integrar `aurelio-labs/semantic-router` ou estender `classify.js` actual | ADR escrito |
| 2026-05-09 | Curar seed de 100 exemplos (20-30 por tier) em PT-PT/EN | JSON commitado em `/seeds/router_seed.json` |
| 2026-05-10 | Implementar Camada 0 (regex guardrails) | Tests cobrem `.env`, `migration`, `secret`, `prod`, `delete` |
| 2026-05-11 | Implementar Camada 1 (embedding k-NN) | API `classify(prompt) → {tier, confidence, neighbors}` |
| 2026-05-12 | Cache semântico com GPTCache + Redis local | Hit rate dashboard funcional |
| 2026-05-13 | Eval framework v0 (golden dataset 200 prompts) | CI Github Actions a correr |

### Semana 2 (até 2026-05-20)

| Dia | Tarefa | Critério de aceitação |
|---|---|---|
| 2026-05-14 | Implementar Subscription-Aware config layer | YAML/env config + lógica de bias |
| 2026-05-15 | Integração Ollama (Qwen3-30B-A3B + Devstral Small 2 + Gemma 3 12B) | Recipe `ollama-rtx4090-default.yaml` |
| 2026-05-16 | Métricas `$ saved` + statusline integration | Mostra no terminal/IDE |
| 2026-05-17 | Documentação `README.md` com 3 use cases canónicos | Quickstart < 5min |
| 2026-05-18 | Demo video (Loom 5min) | Publicado em Twitter/HN |
| 2026-05-19 | Submeter ao **RouterArena** | Score baseline publicado |
| 2026-05-20 | Lançamento HN "Show HN: Mooter — subscription-aware LLM router" | Post live |

### Semana 3 — recta final (até 2026-05-26)

| Dia | Tarefa | Critério de aceitação |
|---|---|---|
| 2026-05-21 | Posts Reddit: r/LocalLLaMA, r/ClaudeAI, r/OpenAI | 3 posts |
| 2026-05-22 | Outreach a 10 vibe coders / OSS maintainers | Personalizados |
| 2026-05-23 | Bug fixes baseado em feedback semana 2 | Issues priorizadas |
| 2026-05-24 | Blog post técnico "Why we built Mooter" | Publicado em Medium/dev.to |
| 2026-05-25 | Prep gate review | Métricas finais consolidadas |
| **2026-05-26 — GATE** | ≥250 stars + ≥3 contributors externos | Decisão: continua ou pivot GSD-as-a-Product |

---

## 9. Resumo numa linha por pergunta do Paulo

| # | Pergunta original | Resposta directa |
|---|---|---|
| 1 | Best practices skills + repos | `aurelio-labs/semantic-router` (3.2k stars MIT) + RouteLLM (LMSYS, ICLR 2025) + Portkey AI gateway. Não copiar OpenRouter (catálogo) ou Martian (closed). |
| 2 | Especialistas | Karpathy (nanochat — distillation pessoal), Simon Willison, Hamel Husain (Lesson 8 cost), Eugene Yan (cascade pattern), Sebastian Raschka (inference-time scaling). Consenso: hybrid SLM+frontier é default 2026, plan-and-execute formalizou-se. |
| 3 | Mapa IA + LLMs locais + vetorização | Ver §1.1 (mercado), §3 (locais), §4 (estratégias). Stack vencedor para Mooter: rule-based guardrails → embedding k-NN → cache semântico, com cascade opt-in. |
| 4 | Mapa LLMs locais detalhado | Ver §3.2 (12 modelos top), §3.3 (best fit por use case). Default RTX 4090: Qwen3-30B-A3B + Devstral Small 2 + Gemma 3 12B. |
| 5 | Estratégia para o Mooter | **Specialist routing + cascade-on-uncertainty + Subscription-Aware** (killer feature). MVP em 19 dias com `aurelio-labs/semantic-router`. |
| 6 | Frontier-first vs local-first | **Nenhum dos dois como default.** Plan-with-frontier+exec-with-local perde para Opus solo em harness maduro (Akita 2026). Specialist routing por classe vence Pareto. Meta-prompting só vale em batch (compile-step), não runtime. |

---

## 10. Sources (consolidadas)

### Routing — papers e benchmarks
- [RouteLLM (LMSYS) blog](https://www.lmsys.org/blog/2024-07-01-routellm/) — paper [arxiv 2406.18665](https://arxiv.org/abs/2406.18665)
- [RouterBench (arxiv 2403.12031)](https://arxiv.org/abs/2403.12031)
- [RouterEval (arxiv 2503.10657)](https://arxiv.org/abs/2503.10657)
- [RouterArena (arxiv 2510.00202)](https://arxiv.org/html/2510.00202v1)
- [LLMRouterBench (arxiv 2601.07206)](https://arxiv.org/html/2601.07206v1)
- [FrugalGPT (arxiv 2305.05176)](https://arxiv.org/abs/2305.05176)
- [Cascade Routing ICLR 2025 (ETH/SRI)](https://arxiv.org/abs/2410.10347)
- [Speculative Cascades (Google)](https://research.google/blog/speculative-cascades-a-hybrid-approach-for-smarter-faster-llm-inference/)
- [Self-Aware Token-Efficient Routing (EMNLP 2025)](https://aclanthology.org/2025.emnlp-main.531.pdf)
- [Cost-Aware Contrastive Routing](https://openreview.net/pdf?id=4Qe2Hga43N)
- [Doing More with Less Survey (arxiv 2502.00409)](https://arxiv.org/html/2502.00409v1)
- [Dynamic Routing Survey HF](https://huggingface.co/papers/2603.04445)

### Routing — players
- [OpenRouter Pricing](https://openrouter.ai/pricing) · [Sacra revenue](https://sacra.com/c/openrouter/)
- [LiteLLM routing docs](https://docs.litellm.ai/docs/routing) · [GitHub](https://github.com/BerriAI/litellm)
- [Portkey AI Gateway](https://portkey.ai/features/ai-gateway) · [GitHub](https://github.com/Portkey-ai/gateway)
- [Helicone vs LiteLLM vs Portkey](https://www.truefoundry.com/blog/litellm-alternatives)
- [Felicis: Routing the Future](https://www.felicis.com/insight/model-routing)
- [Awesome AI Model Routing](https://github.com/Not-Diamond/awesome-ai-model-routing)
- [vLLM Semantic Router (Iris)](https://blog.vllm.ai/2026/01/05/vllm-sr-iris.html) · [GitHub](https://github.com/vllm-project/semantic-router)
- [aurelio-labs/semantic-router](https://github.com/aurelio-labs/semantic-router)

### Especialistas
- [Karpathy nanochat](https://github.com/karpathy/nanochat) · [microgpt](http://karpathy.github.io/2026/02/12/microgpt/)
- [Simon Willison LLM predictions 2026](https://simonwillison.net/2026/Jan/8/llm-predictions-for-2026/)
- [Latent Space podcast](https://www.latent.space/podcast)
- [Hamel Husain Evals FAQ](https://hamel.dev/blog/posts/evals-faq/)
- [Eugene Yan More Patterns](https://eugeneyan.com/writing/more-patterns/)
- [Sebastian Raschka State of LLMs 2025](https://magazine.sebastianraschka.com/p/state-of-llms-2025)
- [Cameron Wolfe MoE LLMs](https://cameronrwolfe.substack.com/p/moe-llms)

### Plan-and-execute / cascading
- [LangChain Planning Agents](https://www.langchain.com/blog/planning-agents)
- [Plan-and-Act (arxiv 2503.09572)](https://arxiv.org/html/2503.09572v2)
- [PEAR EACL 2026](https://aclanthology.org/2026.findings-eacl.237.pdf)
- [Architecting Resilient LLM Agents](https://arxiv.org/abs/2509.08646)
- [SAP Plan-then-Execute](https://community.sap.com/t5/security-and-compliance-blog-posts/plan-then-execute-an-architectural-pattern-for-responsible-agentic-ai/ba-p/14239753)
- [Akita: Mixing 2 models benchmark](https://akitaonrails.com/en/2026/04/25/llm-benchmarks-vale-a-pena-misturar-2-modelos/)

### Speculative / TTS
- [Speculative Decoding 2026 (BentoML)](https://bentoml.com/llm/inference-optimization/speculative-decoding)
- [Speculative Speculative Decoding ICLR 2026](https://openreview.net/pdf?id=aL1Wnml9Ef)
- [TTS scaling beats scale (HF/VentureBeat)](https://venturebeat.com/ai/how-test-time-scaling-unlocks-hidden-reasoning-abilities-in-small-language-models-and-allows-them-to-outperform-llms)
- [Scaling LLM Test-Time Compute](https://arxiv.org/abs/2408.03314)
- [Prompt-Level Distillation 2026](https://openreview.net/forum?id=XzlHlS6Mf5)

### Caching / compression
- [LLMLingua (Microsoft)](https://github.com/microsoft/LLMLingua)
- [LongLLMLingua (arxiv 2310.06839)](https://arxiv.org/abs/2310.06839)
- [GPTCache](https://github.com/zilliztech/GPTCache)
- [Redis Semantic Cache](https://redis.io/blog/what-is-semantic-caching/)
- [Anthropic Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Lessons from Claude Code: caching is everything](https://claude.com/blog/lessons-from-building-claude-code-prompt-caching-is-everything)

### Recomendações oficiais providers (Maio 2026)
- [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Claude AI Complete Guide 2026 (NxCode)](https://www.nxcode.io/resources/news/claude-ai-complete-guide-models-pricing-features-2026)
- [GPT-5.4 mini API docs](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Gemini Flash-Lite vs Flash vs Pro](https://www.verdent.ai/guides/gemini-3-1-flash-lite-vs-flash-vs-pro)

### LLMs locais — runtimes e modelos
- [llama.cpp vs Ollama vs vLLM 2026](https://www.decodesfuture.com/articles/llama-cpp-vs-ollama-vs-vllm-local-llm-stack-guide)
- [vLLM Benchmarks 2026](https://www.morphllm.com/vllm-benchmarks)
- [Anyscale Continuous Batching 23x](https://www.anyscale.com/blog/continuous-batching-llm-inference)
- [TensorRT-LLM Benchmark](https://menlo.ai/blog/benchmarking-nvidia-tensorrt-llm)
- [Best Local LLMs RTX 4090 2026](https://toolhalla.ai/blog/best-local-llms-rtx-4090-2026)
- [Qwen3 Complete Guide](https://insiderllm.com/guides/qwen3-complete-guide/)
- [Qwen3-30B-A3B HuggingFace](https://huggingface.co/Qwen/Qwen3-30B-A3B)
- [qwen3-coder:30b on Ollama](https://ollama.com/library/qwen3-coder:30b)
- [Llama 4 Multimodal](https://ai.meta.com/blog/llama-4-multimodal-intelligence/)
- [DeepSeek V3 Local](https://www.sitepoint.com/deepseek-v3-complete-guide-deploy-and-optimize-local-ai-in-2026/)
- [Best Open Source LLM for Portuguese 2026](https://www.siliconflow.com/articles/en/best-open-source-LLM-for-Portuguese)
- [AMALIA Technical Report](https://arxiv.org/html/2603.26511v1)
- [Open Portuguese LLM Leaderboard (HF)](https://huggingface.co/spaces/eduagarcia/open_pt_llm_leaderboard)
- [Quantization GGUF/AWQ/GPTQ Guide 2026](https://localaimaster.com/blog/quantization-explained)
- [Local LLMs Tool Calling 2026 (JD Hodges)](https://www.jdhodges.com/blog/local-llms-on-tool-calling-2026-pt1-local-lm/)

### Hybrid / SLM
- [Hybrid Cloud-Local LLM Architecture 2026](https://www.sitepoint.com/hybrid-cloudlocal-llm-the-complete-architecture-guide-2026/)
- [Together AI: Fine-tune SLMs outperform closed](https://www.together.ai/blog/fine-tune-small-open-source-llms-outperform-closed-models)
- [Birkholm-Buch — Frontier to Specialized SLMs](https://birkholm-buch.dk/2026/04/10/the-evolution-of-ai-from-frontier-models-to-specialized-small-language-models/)
- [LogRocket — Future of AI agents tiny](https://blog.logrocket.com/small-language-models/)
- [SLM Complete Guide 2026](https://machinelearningmastery.com/introduction-to-small-language-models-the-complete-guide-for-2026/)
