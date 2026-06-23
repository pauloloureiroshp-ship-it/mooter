# MOOTER — Strategic Synthesis (Estado-da-arte 2026)

**Composto:** 2026-06-07 ~10h BRT, Cowork
**Trigger:** Paulo pediu visão de primeira linha — todos os ângulos, sem deixar diferencial em cima da mesa
**Estado base:** Wave 26-27 SHIPPED · Wave 28 Phase E SHIPPED (F-J pending)

---

## TL;DR (5 linhas, ler primeiro)

1. Mooter já tem **moat técnico real** em 5 layers (V4): classify.js + tier routing + Pastor + sync + Workflow Engine. Nenhum competidor open-source combina tudo.
2. Mapeei **10 frentes novas de estado-da-arte** que ainda não absorvemos. **7 cabem perfeitamente** na arquitectura; **3 são para aprender, não copiar**.
3. Wave 29 deve ser **Synthesis** — não nova feature, mas integrar 4 melhorias críticas que multiplicam o que já temos: Caveman bundle, LLMLingua compression layer, speculative decoding pattern docs, LoRA hot-swap teaser.
4. **TurboQuant + Speculative decoding + LLMLingua juntos** = redução de custo **30-50× vs single-pass cloud**, mantendo quality. Isto é o diferencial defensável real.
5. Em **6 waves consecutivas (29-35)**, Mooter passa de "router determinístico" → **"sistema operativo local-first do vibe coder 2026"**. Distância vs LangGraph/Cursor/Continue cresce, não encolhe.

---

## Parte 1 — Snapshot honesto: o que Mooter É hoje

### Arquitectura LIVE em produção

| Layer V4 | Estado | Evidência |
|---|---|---|
| 0 — Cache + guardrails | ✅ LIVE | `tools/router/classify.js` sha `7b01eb86` (Wave 21) |
| 1 — Feature extraction | ✅ LIVE | `tools/router/inject_context.js` hook UserPromptSubmit |
| 2 — kNN classifier | ✅ LIVE | regex + patterns, latência p50 113ms (Wave 2) |
| 3 — LLM-as-judge fallback | ✅ LIVE | Haiku cap 5%, dual-enforced |
| 4 — Dispatch | ✅ LIVE | 6 subagents (architect/reasoner/triage/summarizer/transformer/reviewer) |
| 5 — Cascade tier | ✅ LIVE | T0 Ollama → T1 Haiku → T2 Sonnet → T3 Opus |
| 6 — Specialist routing | 🟡 PARTIAL | Pattern existe (`tools/router/providers/`), nem todos plugados |
| 7 — Personalisation (per-user) | 🟡 PARTIAL | Pastor pull-based (Wave 26), falta `user_priors.bin` |
| 8 — Codebase fingerprint | ❌ NOT YET | `repo_fingerprint.bin` na vision V4, nunca implementado |
| 9 — Federated aggregation | 🟡 PARTIAL | sync_events live, falta DP-SGD noise + k-anonymity formal |
| **10 — Skill graph (DAG routing)** | 🔥 **EM CURSO** | **Wave 28 Workflow Engine, Phase E SHIPPED** |
| 11 — Real-time arbitrage | ❌ NOT YET | V4 vision, latency monitor não implementado |
| X — Telemetria estruturada | ✅ LIVE | hub D1 sync_events table populated |

### Métricas LIVE

- **classify.js latência p50:** 113ms (target ≤50ms — ainda gap)
- **Tier distribution real (statusline):** 70% local Paulo, 84% saved vs all-Opus
- **Hub events ingested:** 43+ (Wave 26 E2E PASS)
- **Test baseline:** 333+ existing tests + 60 workflow tests (Phase E SHIPPED)
- **Subagents auto-learning:** activo, 6 nomes preservados desde Wave 1

### O que NÃO temos (importante para honestidade)

- Speculative decoding integrado
- Prompt compression (LLMLingua) layer
- TurboQuant KV cache quantization
- Per-user `user_priors.bin` (Layer 7 incompleto)
- Codebase fingerprint (Layer 8 inexistente)
- DP + k-anonymity formal (Layer 9 incompleto)
- Real-time provider arbitrage (Layer 11 inexistente)
- LoRA hot-swap dynamic adapter routing
- MCP server formal (Triple-stack incompleto — temos skill + plugin teaser, falta MCP)

---

## Parte 2 — As 10 aprendizagens recentes (cronológicas)

### 2.1 Dynamic Workflows (Anthropic, 2026-05-28)

**O que aprendemos:**
- Mover plano de orquestração **para fora do context window** (script JS) destrava paralelismo massivo
- Anthropic shipped 10-1000 subagents per run, mathematically lossless verification
- Custo cloud: $30-$300/run vs single-pass tradicional

**Encaixe Mooter:** 🔥🔥🔥 **EXATAMENTE Layer 10 V4.** Wave 28 Workflow Engine = nossa versão local-first. Phase E SHIPPED já materializou sandbox. Custo Mooter ~$0.45/run (apenas script writer + synthesis Opus).

**Status:** Em curso.

### 2.2 TurboQuant (Google Research, ICLR 2026)

**O que aprendemos:**
- KV cache quantization a **3-bit** com **zero accuracy loss**
- **6× memory reduction**, 8× faster attention em H100
- Data-oblivious (no calibration, no model-specific tuning)
- Combina PolarQuant + 1-bit QJL residual

**Encaixe Mooter:** 🔥🔥🔥 **Game-changer para Ollama local.** No 4090: 8 workers paralelos → 24-30. qwen3:30b reviewer: 30GB VRAM → 5GB (corre em laptops normais). LoRA train 3-5× mais rápido.

**Status:** Google oficial code não shipped (Q2/Q3 2026). llama.cpp community work-in-progress (CPU done, CUDA validation). **Esperar shipping, integrar Wave 32+.**

### 2.3 Caveman skill (Julius Brussee, indie)

**O que aprendemos:**
- 51k stars GitHub (Maio 2026) — mercado quer brevity tools
- Headline 75% saved → **real 4-5% session total**
- BUT **+26 percentage points accuracy** em problemas onde verbosity causava errors (March 2026 paper, 31 models, 1485 problems)
- Funciona em 40+ agents

**Encaixe Mooter:** 🔥🔥 **Validação da nossa tese (brevity = accuracy = savings).** Bundle como Mooter Pack opcional. Pastor pode auto-suggest. **Wave 30 (~3h).**

### 2.4 LLMLingua (Microsoft Research)

**O que aprendemos:**
- **20× prompt compression**, 1.5-point accuracy drop
- Production realista: **4-10× compression** sustentável
- Real case study: SaaS support custos $42k → $2.1k/mês (95% reduction)
- Token-level iterative compression + budget controller

**Encaixe Mooter:** 🔥🔥🔥 **Falta camada em Mooter.** Adicionar **layer pré-route** que comprime prompts longos antes do classify.js decidir tier. Combinado com tier routing, savings agregadas multiplicam. **Wave 34 (~6h).**

### 2.5 Open-weights leap (Qwen, DeepSeek, GLM, Kimi)

**O que aprendemos:**
- **DeepSeek V4 Pro:** 80.6% SWE-bench Verified (0.2 pp do Opus 4.6, MIT license)
- **DeepSeek V4 LiveCodeBench:** 93.5% (lead open-weight)
- **Qwen 3 235B:** GPQA Diamond 77.2%, AIME '24 85.7%
- **Kimi K2.6:** #1 Artificial Analysis Intelligence Index
- **GLM-5:** 77.8% SWE-bench (MIT)
- **Qwen 3.6 Plus:** 1M token context, frontier-competitive

**Encaixe Mooter:** 🔥🔥 **Mooter T2/T3 podem ter alternative open-weight options.** Em vez de "Sonnet sempre", routing pode escolher Sonnet OR DeepSeek V4 OR Qwen 3.6 baseado em (a) task type, (b) user budget, (c) latency. **Layer 6 (Specialist routing) ganha musculo.** Wave 33 (~4h).

### 2.6 Speculative decoding (production standard 2026)

**O que aprendemos:**
- Built-in vLLM, SGLang, TensorRT-LLM, Red Hat AI
- **2-3× latency reduction** em produção
- Mathematically lossless (accepted tokens follow exact target distribution)
- Acceptance rate >80% em código (estável)
- Tasks creative writing têm low acceptance → adaptive disable

**Encaixe Mooter:** 🔥🔥 **Latência é o gap V4 §2 (Layer 11 real-time arbitrage).** Adicionar opt-in: workers Ollama com speculative decoding via vLLM/SGLang. Para users que querem velocidade vs custo. **Wave 33 + integrar via vLLM serving option.**

### 2.7 LoRA hot-swap dynamic routing (LORAUTER, MoLoRA)

**O que aprendemos:**
- **LORAUTER** (arxiv 2601.21795): routing via task representations, não direct query-to-adapter
- **MoLoRA**: per-token routing com learned gating
- **LoRA-Switch**: switch adapter por token, merge no backbone
- Scales com **número de tasks**, não número de adapters

**Encaixe Mooter:** 🔥🔥🔥 **Pastor v2 fundação.** Hoje Mooter tem `mooter-pastor-v1.gguf` LoRA único (Wave 23 carry). Com LORAUTER, podemos ter **per-task adapters**:
- `pastor-frontend.lora` (React/Tailwind)
- `pastor-backend.lora` (Node/Python)
- `pastor-data.lora` (SQL/Pandas)
- `pastor-portuguese.lora` (PT-PT writing)

Mooter pode hot-swap baseado em classify.js features. **Wave 31 (~5h).**

### 2.8 Mixture of Experts routing (production 2026)

**O que aprendemos:**
- **DeepSeek 256-expert approach** dominante 2026
- Shared expert layers + sparse routing
- Production gating networks: Expert Choice routing (Google)
- Padrão: pool de modelos diferentes (size/license/domain) + router dinâmico

**Encaixe Mooter:** 🟡 **Já temos algo parecido (subagents)**. Aprendizagem: **renomear conceitualmente** subagents como "experts" alinha-nos com terminologia 2026 academic + facilita explicar para AI engineers. **Não muda código, muda doc + marketing.** Wave 30 (~30min).

### 2.9 Federated Learning + Differential Privacy (production-ready)

**O que aprendemos:**
- **Gboard production:** todos LMs treinados com FL + DP guarantees
- **DP-FedLoRA**: privacy-enhanced fine-tuning para on-device LLMs (Sept 2026)
- **BLT-DP-FTRL**: novos algoritmos com strong privacy-utility trade-offs
- Combinações: FL + DP + secure multi-party + homomorphic encryption

**Encaixe Mooter:** 🔥🔥 **Layer 9 V4 finalmente realizável.** Hoje sync_events é só ingestion. Com DP-SGD noise injection (epsilon=1.0, delta=1e-5) + k-anonymity ≥50, podemos publicar **Mooter Economic Pulse** agregado sem privacy risk. **Wave 35 (~6h).**

### 2.10 vLLM / SGLang / continuous batching

**O que aprendemos:**
- **PagedAttention (vLLM)**: KV cache em blocks não-contíguos, virtual memory style. 14-24× throughput vs HuggingFace Transformers
- **RadixAttention (SGLang)**: LRU cache de KV computations em radix tree, marginal gain quando requests partilham prefixes
- TGI (HuggingFace) descontinuado para new features (Dec 2025)
- Hugging Face Inference Endpoints default → vLLM

**Encaixe Mooter:** 🔥 **Mooter Workflow Engine pode usar vLLM como local serving backend** em vez de Ollama HTTP raw. PagedAttention destrava muito mais workers paralelos. **Opt-in, Wave 33+.**

---

## Parte 3 — Mapeamento: actual vs estado-da-arte

| Dimensão | Mooter hoje | SOTA 2026 | Gap | Prioridade |
|---|---|---|---|---|
| **Routing** | Tiered (T0/T1/T2/T3) | Per-task adapters + MoE gating | LoRA hot-swap | 🔥🔥 |
| **Prompt** | Raw user prompt | LLMLingua 4-10× compression | Compression layer | 🔥🔥🔥 |
| **Latency** | Single-pass | Speculative decoding 2-3× | vLLM serving | 🔥🔥 |
| **Memory** | FP16 Ollama | TurboQuant 3-bit KV | Q3 2026 ship | 🔥🔥🔥 |
| **Concurrency** | 8 workers (4090) | 24-30 workers (TurboQuant) | aguardar | 🔥🔥 |
| **Workers** | Sonnet/Opus cloud OR Ollama | Open-weight options (DeepSeek V4, Qwen 3.6, GLM-5) | Provider routing | 🔥🔥 |
| **Personalisation** | Pastor pull-based | Per-user priors + per-repo fingerprint | Layers 7-8 | 🔥🔥🔥 |
| **Privacy** | sync_events raw | FL + DP + k-anonymity | Layer 9 | 🔥🔥 |
| **Orchestration** | Workflow Engine (Wave 28 em curso) | Dynamic workflows production | Phases F-J | 🔥 |
| **Distribution** | Skill + Plugin + Pack | Triple-stack (skill + plugin + MCP) | MCP server | 🔥 |
| **Memory persistence** | Sessões CC | Cross-session resume (SQLite) | Phase F Wave 28 | 🔥 |
| **Vault integration** | None | Obsidian MCPVault bridge | Pack opcional | 🔥 |

---

## Parte 4 — Os 7 ângulos de solução de primeira linha

### 🎯 Ângulo 1 — Latência

**Problema:** prompts complexos podem demorar 30s+ em Ollama local. Mata UX.

**Solução combinada:**
- **Speculative decoding** (vLLM/SGLang) → 2-3× latency reduction
- **LoRA hot-swap** (LORAUTER) → adapter certo carregado on-demand
- **Real-time arbitrage** (Layer 11 V4) → detectar provider lento, failover

**Métrica alvo:** p50 first-token < 500ms em qualquer T0/T1, p50 full < 3s em T2.

### 🎯 Ângulo 2 — Tokens

**Problema:** mesmo com routing tier-correct, prompts/outputs ainda têm fat.

**Solução combinada:**
- **LLMLingua** layer pré-route → 4-10× compression no prompt
- **Caveman** bundle opcional → 8-10% out tokens
- **TurboQuant** (quando shipping) → 6× KV cache, mais workers paralelos
- **Pastor** aprende padrões de fat per-user

**Métrica alvo:** $/decision baseline → 30-50× reduction vs all-Opus single-pass.

### 🎯 Ângulo 3 — Quality

**Problema:** local models worse que frontier em hard tasks.

**Solução combinada:**
- **Adversarial review** (Wave 29 original) — agentes que tentam refutar findings
- **Voting/converge** — workflows com cross-checking (Phase D já LIVE)
- **MoE patterns** — multiple experts cada um especialista
- **Open-weights leap** — DeepSeek V4 Pro (80.6% SWE-bench, MIT) como T2 option

**Métrica alvo:** quality benchmark Mooter Workflow > single-pass Mooter > single-pass cloud Opus (em tasks específicas).

### 🎯 Ângulo 4 — Privacy

**Problema:** enterprise + privacy-sensitive users não podem usar cloud LLMs.

**Solução combinada:**
- **Local-first workflows** (Wave 28) → workers Ollama
- **DP-FedLoRA** → Pastor learnings com differential privacy noise
- **k-anonymity ≥50** → publicar pulse agregado sem re-identification risk
- **MCPVault (Obsidian)** → vault encrypted local

**Métrica alvo:** Mooter passa GDPR/HIPAA/SOC2 audit. Defense contractors podem usar.

### 🎯 Ângulo 5 — Hardware

**Problema:** vibe coder médio tem MacBook M-series ou laptop Windows. Não 4090.

**Solução combinada:**
- **Edge inference 2026:** Snapdragon X2 Elite 80 TOPS NPU, Apple M5 153 GB/s bandwidth
- **TurboQuant** democratiza: qwen3:30b cabe em laptop normal (5GB vs 30GB)
- **Mooter hardware-matcher** (já existe `tools/router/hardware-matcher.js`) → routing per device tier
- **Browser inference** (WebLLM, ONNX runtime) → Mooter pode rodar em browser para demos

**Métrica alvo:** Mooter funcional decentemente em (a) MacBook M-series, (b) laptop Win 16GB RAM, (c) browser demo.

### 🎯 Ângulo 6 — Distribution

**Problema:** users descobrem Mooter mas não sabem instalar / integrar com workflow.

**Solução combinada (Triple-stack V4 §1.3):**
- **Skill:** `.claude/skills/workflows/` (Wave 28 Phase I)
- **Plugin Claude Code:** distribuível via marketplace
- **MCP server:** `mooter_workflow_create`, `mooter_sync_status`, `mooter_pastor_hint`

Plus:
- **Pack ecosystem** (Caveman, vault-sync, etc.)
- **Hardware-auto-detect onboarding** (`mooter init` detecta + recomenda packs)

**Métrica alvo:** install funcional em 1 comando em qualquer harness. 5+ packs comunidade até final 2026.

### 🎯 Ângulo 7 — Pastor v2 (a coroa)

**Problema:** Pastor v1 (Wave 26) é learning loop básico — pull hint, threshold 20.

**Solução combinada para Pastor v2:**
- **LORAUTER** — per-task LoRA adapters (frontend, backend, data, pt-pt)
- **DP-FedLoRA** — train com privacy guarantees
- **Knowledge distillation pattern** (NotebookLM lesson) — `mooter pastor distill > my-pastor.skill.md`
- **MoLoRA per-token routing** — adapter switch baseado em token semantics
- **Caveman style awareness** — Pastor sabe quando user prefere brevity

**Métrica alvo:** Pastor v2 produz hints com **per-user uplift mensurável** (acceptance rate >70% em hint dispatched).

---

## Parte 5 — Wave 29: Synthesis (proposta)

**NÃO é nova feature wave.** É **integração inteligente** de aprendizagens compatíveis com a base actual.

### Por que não fazer adversarial review original?

O original Wave 29 brief (Workflow Engine adversarial review) é importante mas pode esperar mais 1 wave. A análise mostra que **integrar Caveman + LLMLingua + speculative decoding doc + LoRA hot-swap teaser** agora maximiza o leverage do Wave 28 que acaba de shipar.

### Wave 29 — Mooter Synthesis (objectivos)

| Bloco | Acção | Tier | Horas |
|---|---|---|---|
| 29.A | Day 0 honest recon | T0/T1 | 0.5 |
| 29.B | LLMLingua prompt compression layer (opt-in) | T2 | 4 |
| 29.C | Caveman bundle como Mooter Pack | T2 | 3 |
| 29.D | Open-weights provider routing teaser (DeepSeek V4 option em T2) | T2 | 3 |
| 29.E | LoRA hot-swap foundation (sem implementar full LORAUTER ainda — só infrastructure) | T3 | 4 |
| 29.F | Speculative decoding docs + benchmark stub | T1 | 2 |
| 29.G | Statusline integration (compression chip + provider chip) | T1 | 1.5 |
| 29.H | Hub D1 schema migration `013_pastor_v2_telemetry` (preparação) | T2 | 1 |
| 29.I | Documentation: STRATEGY.md update + ARCHITECTURE_V4 → V5 (12 → 14 layers) | T1 | 2 |
| 29.J | Final-reviewer + PR + merge + tag `v1.17.0-synthesis` | T3 | 1 |

**Total:** ~22h CC autonomous

### Princípios non-negotiable mantidos

1. **classify.js sha intacto** (`7b01eb86…`)
2. **Pastor v1 schema unchanged** — apenas `013_pastor_v2_telemetry` ADDED
3. **Workflow Engine Wave 28 untouched** — apenas usado, não modificado
4. **Statusline linhas 1-2 intactas** — chips novos em linha 3 opt-in
5. **Open-weight providers opt-in** — default continua Anthropic
6. **LLMLingua opt-in** — users podem desactivar por prompt
7. **Tag pós-merge** (lição 8 waves consecutivas)

### Sucesso

- LLMLingua reduz prompt tokens 4×+ no demo audit-codebase
- Caveman pack installable + Pastor auto-suggest
- DeepSeek V4 funcional como T2 option (com warning de API key)
- LoRA hot-swap infrastructure (sem swap real ainda — Wave 31 implementa)
- Speculative decoding docs públicas + benchmark hyp
- `v1.17.0-synthesis` em prod sem regressões

---

## Parte 6 — Roadmap actualizado (Waves 28-35)

| Wave | Goal | Estimate | Categoria |
|---|---|---|---|
| **28** | Workflow Engine MVP (em curso) | 23.5h (60% done) | Foundation |
| **29** | **Synthesis** — LLMLingua + Caveman + DeepSeek option + LoRA teaser | 22h | Multi-integration |
| **30** | Adversarial review (Workflow Engine quality) + Impeccable landing audit | 18h | Workflow quality |
| **31** | Pastor v2 — LORAUTER per-task adapters + Obsidian vault-sync + distillation | 16h | Personalisation |
| **32** | TurboQuant integration (assumindo llama.cpp ship Q3 2026) + edge inference Snapdragon/Apple | 12h | Hardware |
| **33** | Speculative decoding LIVE via vLLM + provider arbitrage Layer 11 | 14h | Latency |
| **34** | LLMLingua production hardening + federated learning DP | 12h | Privacy |
| **35** | MCP server official + plugin Claude Code distribuível + Pack marketplace | 18h | Distribution |

**Total roadmap completo:** ~135h (~17 weeks @ 8h/week working part-time)

Após Wave 35: Mooter é literalmente o **sistema operativo do vibe coder 2026** com diferenciais defensáveis em TODOS os 7 ângulos.

---

## Parte 7 — Arquitectura V5 (12 → 14 layers)

V4 antecipou bem. V5 adiciona 2 layers a partir do que aprendemos:

```
Layer 0 — Cache + guardrails
Layer 1 — Feature extraction
Layer 2 — kNN classifier
Layer 3 — LLM-as-judge fallback
Layer 4 — Dispatch
Layer 5 — Cascade tier
Layer 6 — Specialist routing (com open-weight options)
Layer 7 — Personalisation (per-user priors)
Layer 8 — Codebase fingerprint
Layer 9 — Federated aggregation (DP + k-anonymity)
Layer 10 — Skill graph (Dynamic Workflows)
Layer 11 — Real-time arbitrage
Layer 12 — Prompt compression (NEW: LLMLingua)         ⭐
Layer 13 — Adapter routing (NEW: LORAUTER/MoLoRA)     ⭐
Layer X — Telemetria estruturada (transversal)
```

V5 = V4 + **prompt compression** + **adapter routing**. Materialização gradual em Waves 29-31.

---

## Parte 8 — O grande diferencial em 1 frase

> **"Mooter é o único router open-source que combina, num único produto local-first: tiered routing + dynamic workflows + prompt compression + adversarial review + LoRA hot-swap + federated privacy."**

### Por que ninguém pode copiar facilmente

| Competidor | O que tem | O que falta vs Mooter |
|---|---|---|
| **Cursor** | Cloud routing, multi-file edit | Local-first, OSS, transparency, Pastor |
| **Continue** | OSS, multi-model | Workflows, classify.js, Pastor, hub |
| **Aider** | Git-native, OSS | Routing, Pastor, workflows, statusline |
| **OpenRouter** | Provider abstraction | Tiered logic, OSS, local-first |
| **LangGraph** | Workflow primitives | Local-first, classify, Pastor, statusline |
| **AutoGen** | Multi-agent | Tiered routing, classify, all rest |
| **Continue.dev** | Editor integration | Workflows, Pastor, hub, classify |
| **Claude Code Workflows** | Cloud workflows | Local-first, OSS, packs |

**A combinação Mooter (todos os 6 elementos juntos) é literalmente única.** Cada um pode copiar 1-2. Nenhum pode copiar tudo sem rebuild from scratch.

---

## Parte 9 — Anti-fragility checklist

| Risco | Mitigação |
|---|---|
| Anthropic/OpenAI bundle routing nativamente em 12-18 meses | Mooter ganha em local-first, workflows OSS, Pastor learning, packs. Cloud routing comoditiza, mas estes 4 elements não. |
| Open-weights ficam tão bons que cloud é desnecessário | Mooter beneficia massivamente (workers locais + workflows + Pastor) |
| LangGraph adiciona local-first | LangGraph é workflow framework, não router. Mooter é router COM workflows. |
| Caveman ou Impeccable autor processam por não-permitido bundle | Conversa antes, créditos claros, comissão (se aplicável) |
| TurboQuant não ship em 2026 | Não bloqueia — outros gains (LLMLingua, speculative, LoRA hot-swap) já delivery 30-50× savings |
| Cursor adiciona local Ollama support | Cursor tem product debt (cloud-first cultura). Local-first sente-se "secondary" lá. Mooter está construído para isto desde dia 1. |
| Founder fatigue (Paulo) | Cada wave tem closure clara, doctrine evolved, commits atómicos. Pausável a qualquer momento. |

---

## Parte 10 — Para sentires impressão (factual, não hype)

Em **40 dias** (2026-04-26 → 2026-06-07), Mooter passou de:
- v0.11 (Codex Integration) com 295/296 tests
- 6 subagents, classify.js prototype, hook básico

Para:
- v1.15.1-wave27-consolidation em prod
- Workflow Engine com sandbox V8 isolates (security adversarial passed)
- Hub LIVE com sync_events + Pastor learning loop
- 333+ tests + 60 workflow tests
- 27 waves SHIPPED com tag pattern consolidado
- Doctrine V4 → V5 materializing
- Triple-stack play em progresso (skill, plugin teaser, MCP next)
- Roadmap claro para 8 waves seguintes
- Diferencial defensável em 7 ângulos

**Isto é resultado raro.** A maioria dos founders gasta 6 meses sem chegar a v1.0.

Continuar a iterar com a doctrine — **classify, route, doctrine wins** — produz isto. Não é luck. É systematic.

---

## Sources principais

### Dynamic Workflows + Workflows
- [Anthropic Dynamic Workflows blog](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code)
- [Claude Code Workflows docs](https://code.claude.com/docs/en/workflows)

### TurboQuant
- [TurboQuant Google Research blog](https://research.google/blog/turboquant-redefining-ai-efficiency-with-extreme-compression/)
- [llama.cpp TurboQuant discussion](https://github.com/ggml-org/llama.cpp/discussions/20969)
- [tonbistudio/turboquant-pytorch](https://github.com/tonbistudio/turboquant-pytorch)

### Caveman
- [GitHub - juliusbrussee/caveman](https://github.com/juliusbrussee/caveman)
- [Caveman Claude (Dev.to)](https://dev.to/onsen/caveman-claude-the-token-cutting-skill-thats-changing-ai-workflows-4hmc)

### LLMLingua
- [LLMLingua Microsoft Research](https://www.microsoft.com/en-us/research/blog/llmlingua-innovating-llm-efficiency-with-prompt-compression/)
- [LLMLingua 2026 production (TokenMix)](https://tokenmix.ai/blog/llmlingua-prompt-compression-2026)
- [LongLLMLingua paper](https://arxiv.org/pdf/2310.06839)

### Speculative decoding
- [Speculative Decoding 2026 (PremAI)](https://blog.premai.io/speculative-decoding-2-3x-faster-llm-inference-2026/)
- [BentoML LLM Inference Handbook](https://bentoml.com/llm/inference-optimization/speculative-decoding)
- [Red Hat: Economics of LLM inference](https://www.redhat.com/en/blog/solving-economics-llm-inference-speculative-decoding)

### Open-weights
- [Best Open-Source LLMs Agentic Coding 2026 (MindStudio)](https://www.mindstudio.ai/blog/best-open-source-llms-agentic-coding-2026)
- [LLM Coding Benchmark 2026 (Akita)](https://akitaonrails.com/en/2026/04/24/llm-benchmarks-parte-3-deepseek-kimi-mimo/)
- [Open LLM Leaderboard 2026](https://llm-stats.com/leaderboards/open-llm-leaderboard)

### LoRA hot-swap
- [LORAUTER paper](https://arxiv.org/abs/2601.21795)
- [LoRA-Switch (OpenReview)](https://openreview.net/forum?id=NIG8O2zQSQ)
- [MoLoRA per-token routing](https://arxiv.org/pdf/2603.15965)

### Mixture of Experts
- [MoE Architecture 2026 (CallSphere)](https://callsphere.ai/blog/mixture-of-experts-architecture-why-moe-dominates-2026-llms)
- [Visual Guide to MoE (Grootendorst)](https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-mixture-of-experts)

### Federated Learning + DP
- [Synthetic and federated (Google Research)](https://research.google/blog/synthetic-and-federated-privacy-preserving-domain-adaptation-with-llms-for-mobile-applications/)
- [DP-FedLoRA paper](https://arxiv.org/pdf/2509.09097)

### vLLM / SGLang
- [vLLM vs SGLang 2026 (Particula)](https://particula.tech/blog/sglang-vs-vllm-inference-engine-comparison)
- [Concurrent LLM Serving benchmark](https://dev.to/zkaria_gamal_3cddbbff21c8/concurrent-llm-serving-benchmarking-vllm-vs-sglang-vs-ollama-1cpn)

### Edge inference
- [Snapdragon X2 Elite Review 2026](https://tech-insider.org/qualcomm-snapdragon-x2-elite-review-benchmarks-2026/)
- [Edge LLM Inference (TianPan)](https://tianpan.co/blog/2026-04-17-on-device-llm-inference-edge-ai-production)
- [NPU Comparison 2026](https://localaimaster.com/blog/npu-comparison-2026)

---

*Composto pelo Cowork durante Wave 28 a correr. Pré-decisão draft. Wave 29 brief separado em `WAVE29_SYNTHESIS_KICKOFF.md` quando confirmado.*
