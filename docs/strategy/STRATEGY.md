---
title: "Mooter — Estratégia Canónica 2026"
subtitle: "Single Source of Truth · Routing inteligente para vibe coders"
author: "Paulo Loureiro"
date: "2026-05-07"
documentclass: article
geometry: "margin=2cm"
fontsize: 11pt
linkcolor: "blue"
urlcolor: "blue"
toccolor: "black"
colorlinks: true
toc: true
toc-depth: 2
numbersections: false
---

\newpage

# Sumário Executivo

**Mooter é o sistema operativo do vibe coder.** É um router determinístico que decide, em menos de 50ms, qual o LLM mínimo viável para cada prompt — sem se sentar entre o user e o LLM, sem inventar custos, sem esconder o "porquê" da decisão.

**Hoje (2026-05-07)**: Mooter está em **v0.11** (Codex Integration). Wave-2 (advisor → executor) acaba de aterrar com **295/296 testes verdes**, **12 commits atómicos**, **Final-reviewer Opus APPROVED**. Latência do hook: **113ms p50**. Validation accuracy: **87.5%** (target ≥85%, hit). Subagents (cheap-triage, model-architect, model-reasoner, local-summarizer, local-transformer, final-reviewer) implementados e dual-enforced contra a doctrine.

**Gate em 19 dias (2026-05-26)**: ≥250 stars + ≥3 contributors externos. Decisão pivot: continuar como router OSS standalone, ou pivot para *GSD-as-a-Product*.

**Janela estratégica**: Anthropic, OpenAI e Google estão a comoditizar routing intra-família dentro dos próprios SDKs. Em 12-18 meses, "router OSS standalone" deixa de ter moat. **A janela é agora.**

**3 pilares competitivos defensáveis**:

1. **Subscription-Aware Routing** — ninguém combina pricing model awareness com routing. Cursor não, Continue não, Aider não, OpenRouter não. User com Claude Max ($200/mês) tem marginal cost = 0; Mooter detecta e bias para frontier+cache. PAYG users ganham agressividade local-first.
2. **Codebase-Aware Language Harmonisation** — auto-detect lingua dominante da codebase e routear coerente. AMALIA (PT-PT) e Sabiá-3 (PT-BR) são publicamente disponíveis e nenhum router os trata como cidadãos de primeira.
3. **Triple-stack Anthropic alignment** — publicar como **plugin Claude Code + skill portable + MCP server** simultâneos. Sinal técnico mais forte que se pode mandar à Anthropic.

**Redução de custo realista**: 65–82% vs all-Opus baseline em workloads heterogéneos (não os 95% de blogs — esses são MT-Bench numbers que não generalizam).

**Anti-goal central**: Mooter NÃO substitui Claude Code. Coabita. Anthropic separou first-party de third-party em 2026-04-04 — Cursor/Cline/Aider perderam cobertura Pro/Max, Claude Code é isento. Mooter fica do lado certo da fronteira.

\newpage

# 1. Tese Estratégica

## 1.1 O problema

Um vibe coder em Maio 2026 paga Claude Max ($200/mês) + Copilot ($10/mês) + ChatGPT Plus ($20/mês) e usa-os mal. Sem visibilidade de quanto gasta, sem método para o pipeline de decisão, com medo de carregar em "build" porque não sabe quanto vai custar. Opus em "muda a cor do botão" queima $0.15 por call trivial.

**A maior barreira ao impacto real do AI-coding hoje não é talento ou ideias — é ruído, paralisia e medo de custo.**

## 1.2 A resposta do Mooter

> "O Mooter é o sistema operativo do vibe coder."

Não é um proxy. Não é um agregador. É a camada de inteligência que:

| # | Capacidade | Implementação |
|---|---|---|
| 1 | Classifica cada prompt em <50ms | Regex puro, zero LLM cost na classificação |
| 2 | Emite `<router-hint>` que Claude Code honra via hook | `tools/router/inject_context.js` |
| 3 | Reduz custo em ~65-82% sem degradar qualidade | Dual-enforcement doctrine + classifier |
| 4 | Aprende com cada decisão | Auto-learning loop + savings-tracker |
| 5 | Cresce com a comunidade | Federated learning roadmap |

## 1.3 Os 5 princípios não-negociáveis

1. **No proxy** — Mooter nunca senta entre o user e o LLM. Se Mooter morrer, Claude Code continua a funcionar.
2. **Zero LLM cost na classificação** — um router que chama um LLM para decidir qual LLM chamar é recursão idiota. Regex puro em <50ms.
3. **Doctrine > configuration** — 165 linhas de Markdown lidas pela sessão valem mais que qualquer YAML.
4. **Explainability** — cada decisão tem campo `reasoning`. O user sabe sempre "porquê Opus?".
5. **Doctrine nunca cede ao optimizador** — auto-learning pode mover prompts triviais para T0, mas push/deploy/secrets/architect são T3 para sempre, dual-enforced (regex guardrail + sub-agent gating).

## 1.4 Janela competitiva — 12-18 meses

Anthropic, OpenAI e Google estão a comoditizar routing intra-família nos próprios SDKs (Anthropic smart switching, OpenAI Responses API, Gemini guidance "default Flash, escala Pro on low confidence"). Em 12-18 meses, **routing intra-família vira nativo do provider**.

**Onde Mooter mantém valor depois disto**:

| Eixo | Janela aberta? |
|---|---|
| Routing intra-família (Haiku → Sonnet → Opus) | ❌ Vai virar nativo |
| Routing cross-provider (Anthropic + OpenAI + Google + local) | ✅ Permanente |
| Cost-aware com hard caps e SLAs | ✅ Permanente |
| Subscription-aware (sub vs PAYG) | ✅ Permanente — moat real |
| Local-first integrado | ✅ Permanente |
| Routing de reasoning budget (o1/o3-style) | ✅ Janela aberta |
| Codebase-aware / language-aware | ✅ Janela aberta |

\newpage

# 2. Estado Actual — Maio 2026 (v0.11)

## 2.1 Mooter já tem (auditoria do repo, 2026-05-07)

| Camada | Estado | Evidência |
|---|---|---|
| **Classifier** | `tools/router/classify.js` (1228 linhas) — v0.10 | Hook 113ms p50, 87.5% accuracy validation |
| **Hook UserPromptSubmit** | `tools/router/inject_context.js` | Cross-session classify cache, async budget refresh, Ollama keep-alive |
| **Executor (Wave-2)** | `tools/router/router-execute.js` (886 linhas) | LANDED 2026-05-07, advisor → executor, 12 commits atómicos |
| **Subagents** | 6 implementados em `agents/` | cheap-triage · final-reviewer · local-summarizer · local-transformer · model-architect · model-reasoner |
| **Cost model** | `tools/router/pricing.js` token-anchored | Real Anthropic prices, distinção advisory vs guaranteed |
| **Telemetry** | `tools/router/savings-tracker.js` | `/last-execution`, `/metrics.executions` block |
| **Calibration loop** | `tools/router/backtest.js --calibration-only` | Alerta se bin 0.8-1.0 < 90% (count ≥100) |
| **Doctrine** | `CLAUDE.md` (16 KB) + `docs/ROUTING_POLICY.md` | T0-T3 + risk signals + escalation rules |
| **Hub backend** | `hub/` Cloudflare Worker | Federated learning placeholder, jobs, routes |
| **Landing** | `landing/` Next.js + Tailwind + Sentry | Live em mooter.ai |
| **Dashboard** | `dashboard/` v0.6.0 | Local TUI |
| **Onboarding** | `install.sh` + `install.ps1` (~11KB cada) | Quickstart cross-platform |
| **npm package** | `mooter-package/` | CLI wrapper |
| **Docs** | 50+ ficheiros em `docs/` | BENCHMARK, COST_MODEL, MASTER_ARCHITECTURE, MODEL_MAPPING, ECOSYSTEM_PLAN, FRIENDS_BETA_ROADMAP, etc. |
| **Tests** | 295/296 verdes (1 skip esperado) | suite cobrindo I1..I11 + boundary cases |
| **CI** | GitHub Actions | suite + tsc strict + ESLint |

## 2.2 Métricas reais (não estimativas)

| Métrica | Valor actual | Target gate (2026-05-26) |
|---|---|---|
| Tier accuracy validation | 87.5% (35/40) | ≥85% ✅ |
| T0 accuracy | 100% (11/11) | — |
| Calibration 0.6-0.8 | 91% | — |
| Calibration 0.8-1.0 | 86% | ≥95% (aspirational) |
| Hook latency p50 | 113ms | <200ms ✅ |
| Hook latency p95 | 407ms | <500ms ✅ |
| Hook latency p99 | 1846ms | <4000ms ✅ |
| Tests passing | 295/296 | green ✅ |
| Stars GitHub | (verificar) | ≥250 |
| Contributors externos | (verificar) | ≥3 |

## 2.3 Loopholes residuais (acceptable, não-blockers)

Pós patch cycle 2026-05-07 (Sessão #39), 4 misclassifications restantes — todos por qualidade do corpus de validação, não defeitos do classifier:

1. `prompt-010` — `<task-notification>` system XML (corpus quality)
2. `prompt-015` — comentário PT-PT 80-char-truncado
3. `prompt-019` — HIGH_RISK guardrail recusa override (validation label disputado, by design)
4. `prompt-026` — header de projecto truncado

\newpage

# 3. Arquitectura Técnica

## 3.1 Pipeline de decisão (7 camadas)

Cada prompt passa por este pipeline. Latência alvo p50 ≤100ms.

| # | Camada | O que faz | Tempo típico |
|---|---|---|---|
| 0 | **Cache semântico** | Threshold cosine ≥0.92 sobre prompts anteriores; hit-rate alvo 30-60% | 0ms (hit) |
| 1 | **Guardrails regex** | `\.env\|secret\|migration\|prod\|delete\|drop\s+table` força T3 + final-reviewer | <1ms |
| 2 | **Feature extraction** | FastText lang detect + heurísticas (has_code, n_files, tools_required, estimated_output_tokens, codebase_lang, task_form) | ~5ms |
| 3 | **Embedding k-NN** | bge-small + 80-150 seeds curados; Phase 0 (≤1k decisões) | ~50ms |
| 4 | **Confidence gate** | Se confidence <0.6 → fallback Haiku judge (cap hard 5% tráfego) | ~0ms (sem fallback) |
| 5 | **Tier dispatch** | T0 local · T1 Haiku · T2 Sonnet+cache · T3 Opus+cache | <1ms |
| 6 | **Cascade on uncertainty** | Test fail OU user retry ≤60s → escala tier+1 e re-executa | n/a (assíncrono) |

## 3.2 Diagrama do pipeline

```
[Prompt user]
     │
     ├─→ [Cache semântico] ──── hit ──→ retorna 0ms
     │         miss
     │
     ├─→ [Guardrails regex] ── match ──→ T3 + final-reviewer
     │         no match
     │
     └─→ [Feature extract] (FastText, heurísticas)
              │
              └─→ [Embedding k-NN classifier]
                       │
                       ├── confidence ≥0.6 ───┐
                       │                      │
                       └── confidence <0.6 ───┤
                                              │
                                              ▼
                       ┌──────────────────────┴──────────────┐
                       │                                     │
                  [Camada 5: Tier dispatch]            [LLM-as-judge]
                       │                                     │
        ┌──────────┬───┴───┬──────────┐                     │
        ▼          ▼       ▼          ▼                     │
       T0         T1      T2         T3                     │
     [Local]   [Haiku]  [Sonnet]  [Opus]                    │
        │          │       │          │                     │
        └──────────┴───┬───┴──────────┘                     │
                       │                                     │
                  [Executar + medir]  ←──────────────────────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
         test fail?       success
              │                 │
              ▼                 ▼
         [Cascade tier+1]  [Retornar resposta]
                                │
                                ▼
                        [Log telemetry OTel]
                                │
                                ├─→ Hot reload Thompson 100×
                                ├─→ Golden replay 1k×
                                └─→ Champion vs challenger
```

## 3.3 Subagents (já implementados em `agents/`)

| Subagent | Modelo | Para quê | Status |
|---|---|---|---|
| `cheap-triage` | Haiku 4.5 ou Ollama (sem key) | commit msg, docstring, regex, explica erro, test trivial | ✅ Implementado |
| `local-summarizer` | Ollama qwen3:30b | sumarização, comparação snippets, extração | ✅ Implementado |
| `local-transformer` | Ollama qwen3:30b | format transforms | ✅ Implementado |
| `model-reasoner` | Sonnet 4.6 | bug hunt, root cause, plano técnico | ✅ Implementado |
| `model-architect` | Opus 4.6 (default) / 4.7 (opt-in) | arquitectura, refactor crítico | ✅ Implementado |
| `final-reviewer` | Opus + cache | gate pré-merge/push/deploy | ✅ Implementado, APPROVED Wave-2 |

\newpage

# 4. Modelo de Routing — Tiers + Specialist

## 4.1 Tiers default

| Tier | Backend | Modelo default | Custo relativo | Tarefas típicas |
|---|---|---|---|---|
| **T0** | Ollama | `qwen3:30b-a3b-instruct-q4_K_M` | ~0 (GPU casa) | triagem, sumarização curta, extração, snippet trivial |
| **T1** | API Anthropic direta | `claude-haiku-4-5` | $ (~$0.0003/task) | commit msg, docstring, regex, explicar erro simples, classificação |
| **T2** | Subagent Claude Code | `claude-sonnet-4-6` + cache | $$ (~$0.005/task) | bug hunt moderado, root cause, plano técnico, decomposição |
| **T3** | Subagent Claude Code | `claude-opus-4-6` (default) ou `4-7` (opt-in) + cache | $$$$ (~$0.05/task) | arquitectura, refactor multi-arquivo, tradeoff analysis, review final |

> Sem `ANTHROPIC_API_KEY`, T1 cai para T0. O router avisa.

> ⚠️ Opus 4.7 tem tokenizer que produz +35% tokens vs 4.6 → custo real ~30% acima. Recomendação: **fixar 4.6 como default T3** até 4.7 estabilizar economics.

## 4.2 Sinais de risco que forçam escalada

| Sinal | Acção |
|---|---|
| prompt menciona produção, deploy, migração de banco, segurança, credenciais, secrets | sobe ≥1 tier |
| `git push --force`, `rm -rf`, drop table, reset --hard | T3 sempre |
| mais de 3 ficheiros a tocar | T3 |
| prompt > 800 caracteres com múltiplas instruções | T3 |
| HIGH_RISK regex match | T3 + final-reviewer obrigatório |

## 4.3 Specialist routing — pelo tipo de task

A regra-mãe: **forma da task > tamanho do diff**.

| Task category | Default | Fallback | Local viable? |
|---|---|---|---|
| Regex generation | Sonnet 4.6 | Haiku 4.5 | ✅ Qwen3-Coder-30B |
| SQL geração (BIRD-style) | **Arctic-Text2SQL-R1** (specialist) | GPT-5 Strict Mode | ✅ Arctic-R1 ou Qwen3-Coder |
| JSON extraction | GPT-5 Strict (100% schema) | Sonnet 4.6 output_config | ✅ Qwen3 + Outlines |
| Unit test generation | Opus 4.7 (87.6% SWE) | Sonnet 4.6 | ⚠️ Devstral Small 2 (68% SWE) |
| Single-line bug fix | Sonnet 4.5 (Opus excessivo) | Haiku 4.5 | ✅ Qwen3-Coder-30B |
| Multi-file refactor (>3) | Opus 4.7 Adaptive | GPT-5.3 Codex | ❌ Frontier-only |
| Debugging stack trace | Sonnet 4.6 | GPT-5.3 Codex | ✅ Qwen3-Coder-30B |
| Commit message | **Haiku 4.5** | GPT-5 Mini | ✅✅ qwen2.5-coder local |
| Docstring | Haiku 4.5 | GPT-5 Mini | ✅✅ Qwen3-30B-A3B-Instruct |
| TS type inference | Claude 4 (88%) | GPT-5 + Zod | ⚠️ TypePro+LLM (86.6%) |
| Python data analysis | GPT-5.5 | Sonnet 4 / o4-mini | ✅ Qwen3-Coder-30B |
| Math reasoning (AIME) | GPT-5.4 (~99%) | Gemini 3.1 Pro | ⚠️ Phi-4-reasoning-plus |
| Logic puzzles | Mythos / Opus 4.7 | Gemini 3.1 Pro | ❌ Frontier-only |
| Long-context summary >500k | **Gemini 3.1 Pro** (1M-10M) | Sonnet 4.6 (200k-1M) | ✅ Qwen3-30B-A3B (256K nativo) |
| Tool use single (BFCL) | **GLM 4.5** (76.7) | Sonnet 4.5/4.6 | ✅ GLM-4.5 open-weight |
| Tool use multi-step (τ-bench) | Mythos (89.2%) | Sonnet 4.5 | ❌ Frontier <50% retail |
| Translation EN-PT | GPT-4o/5 (FLORES-200) | Opus 4 / Sonnet 3.5+ | ⚠️ Qwen3-235B-A22B / Tucano 2 |
| **PT code generation** | Sonnet 4.5 / Opus 4.7 | GPT-5 | ⚠️ Qwen3-235B-A22B |
| **PT-PT cultural** | **AMALIA** (open) | Gemini 3.1 Pro | ✅✅ AMALIA é open |
| **PT-BR cultural** | **Sabiá-3** (Maritaca) | Gemini 3.1 Pro | ✅✅ Sabiá-3 |
| Architecture decisions | Opus 4.7 / Mythos | GPT-5.4 | ❌ Frontier-only |

\newpage

# 5. Mapa de LLMs — Maio 2026

## 5.1 Latency, throughput e custo (números reais)

| Modelo | TTFT p50 | tokens/s | $/M input | $/M output | Cache hit saving | Notas |
|---|---|---|---|---|---|---|
| Qwen3-30B-A3B Q4 (Ollama, RTX 4090) | 4 600ms | 78 | $0 | $0 | n/a | MoE 30B/3B activos |
| Devstral Small 2 Q4 (4090) | ~2 500ms | ~50-69 | $0 | $0 | n/a | 24B params single-4090 |
| Gemma 3 12B Q4 (4090) | ~1 500-2 500ms | ~70 | $0 | $0 | n/a | KV-cache quant lento |
| **Haiku 4.5** | **680ms** | 90.3 | $1.00 | $5.00 | -90% input, -85% latency | TTFT mais baixo do mercado |
| **Sonnet 4.6** | 1 240ms | 43-63 | $3.00 | $15.00 | -90% / -85% | 1M context flat |
| **Opus 4.7** | 1 450-2 000ms | 20-45 | $5.00 | $25.00 | -90% / -85% | Tokenizer +35% tokens vs 4.6 |
| Opus 4.6 Fast Mode | ~1 500ms | ~60 (2.5× boost) | $5.00 | $25.00 | -90% | Speed-prioritized |
| **GPT-5.4 nano** | 1 140ms | ~200 | $0.05 | $0.40 | n/a | Mais barato + rápido |

## 5.2 Total task time end-to-end (TTFT + generation)

| Task | tokens out | Local 4090 | Haiku 4.5 | Sonnet 4.6 | Opus 4.7 | GPT-5.4 nano |
|---|---|---|---|---|---|---|
| Commit msg | 50 | 5.2s | **1.25s** | 2.4s | 4.0s | 1.4s |
| Format transform | 200 | 7.2s | **2.9s** | 5.8s | 11.5s | **2.1s** |
| Bug fix simples | 500 | 11.0s | **6.2s** | 12.8s | 26.5s | **3.6s** |
| Refactor multi-file | 3 000 | **42.6s** | 33.7s | 71s | 151s | 16.1s |
| Architecture decision | 5 000 | 68.6s | 55.7s | 117s | 251s | 26.1s |

**Insights críticos**:

- Para outputs <500 tokens, local PERDE em wall-time. Cold start mata UX.
- Para outputs >2 000 tokens, qwen3-30B local **bate Sonnet** em wall-time absoluto.
- Opus em modo non-fast é brutalmente lento em outputs longos (4 minutos para architecture).
- GPT-5.4 nano é economicamente superior ao Haiku para T0/T1 sem dependência Anthropic-specific.
- Prompt caching Sonnet muda equação: -90% input cost + -85% latency. **Default obrigatório**.

## 5.3 Hardware support map (LLMs locais)

| Hardware | Que cabe (Q4) | Throughput | Custo capex | Mooter recipe |
|---|---|---|---|---|
| **RTX 4090 (24GB)** | Qwen3-30B-A3B + Devstral Small 2 + Gemma 3 12B | 78-196 t/s | $1 600-2 200 (~$0 marginal) | **Default Mooter** |
| **RTX 5090 (32GB)** | Qwen3-32B dense + Llama 4 Scout offloaded | 85-213 t/s | $1 800-2 500 | Premium |
| **Apple M4 Ultra (64GB unified)** | Qwen3-32B + Gemma 3 27B | ~30-50 t/s | $5 000+ | Mac power users |
| **Apple M4 Max (36-48GB)** | Qwen3-30B-A3B + Gemma 3 12B | ~25-40 t/s | $3 500+ | Mac default |
| **RTX 3090 (24GB)** | Qwen3-30B-A3B + Devstral Small 2 | ~40-70 t/s | $700-1 000 (used) | Budget tier |
| **RTX 4070 (12GB)** | Gemma 3 12B + Phi-4 14B Q5 | ~30-50 t/s | $500-700 | Light tier |
| **CPU-only (32GB+ RAM)** | Phi-4 14B Q4, qwen2.5-coder Q4 | ~5-10 t/s | $0 | Fallback only |
| **MacBook Air M2/M3 (16GB)** | Phi-3 mini, gemma3:4b | ~15-25 t/s | $1 100+ | Tier mínimo |

\newpage

# 6. Specialist Routing — As 3 Killer Features

## 6.1 Subscription-Aware Routing 🔥

**O insight**: ninguém combina pricing model awareness com routing.

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

**Métricas a expor no statusline**:

| Métrica | Como calcular |
|---|---|
| `$ saved this month` | (all-Opus PAYG cost) - (actual cost paid) |
| `% calls que ficaram local` | Local calls / total calls |
| `% subscription utilization` | Used subscription rate-limit / max |
| `Quality delta vs all-Opus` | Pareto comparison contra baseline |

**Por que é defensável**:

1. Time-locked moat — providers SDKs vão lá chegar mas não nos próximos 12 meses.
2. Cross-provider obrigatório — Claude Max só cobre Anthropic. User típico combina Max + GPT-5 PAYG + local.
3. Marketing barato e auditável — `$ saved this month` é número que aparece no statusbar. Vibe coders partilham screenshots.

## 6.2 Codebase-Aware Language Harmonisation 🔥

**O que é**:

1. Auto-detectar lingua dominante da codebase (comments, docstrings, identifiers non-EN)
2. Routear para o modelo que melhor performa nessa lingua para o tipo de task
3. Forçar comments/docstrings gerados a fazer match com a codebase
4. Manter `language profile per-project` em `.mooter/lang.json`

**Por que ninguém faz**:

- Cursor com prompt PT ainda gera docstrings EN por default
- Continue, Aider, Copilot assumem EN-first
- OpenRouter, LiteLLM, Portkey ignoram lingua

**Por que faz sentido**:

- User-base inicial BR/PT — sentem o atrito real ("o Cursor americaniza o meu código")
- AMALIA (PT-PT) e Sabiá-3 (PT-BR) são publicamente disponíveis e baratos
- Mooter pode ser **o primeiro router que trata PT-PT e PT-BR como cidadãos de primeira**

**Ranking 2026 por lingua**:

| Lingua | Top 1 | Top 2 | Top 3 | Notas |
|---|---|---|---|---|
| EN | GPT-5.5 / Opus 4.7 | Gemini 3.1 Pro | DeepSeek V4 Pro | Baseline |
| **PT-BR** | Gemini 3.1 Pro | Opus 4.7 | **Sabiá-3** specialist | Sabiá-2 já batia GPT-4 em 23/64 exames brasileiros |
| **PT-PT** | **AMALIA** specialist | Gemini 3.1 Pro | Opus 4.7 | NOVA+IST+Coimbra+Porto+Minho, PROPOR 2026 |
| ZH | Qwen 3.6-Max / Kimi K2.6 | DeepSeek V4 Pro | Gemini 3.1 Pro | ZH-heavy training |
| ES | Gemini 3.1 Pro | Opus 4.7 | GPT-5.5 | Alta-recurso |

**Cost penalty real**:

- PT: 1.3-1.5× tokens vs EN
- ZH: 2.0× tokens vs EN
- Implicação: speakers de não-EN são overcharged e recebem qualidade pior

**Implementação MVP**: FastText detection (1ms) + heuristic table 12 regras + flag `--lang-aware`. ~200 LoC.

## 6.3 Triple-Stack Anthropic Alignment 🔥

**A jogada**: publicar o Mooter simultaneamente como **plugin Claude Code + skill portable + MCP server**.

| Camada | Nome | O que faz | Para quem |
|---|---|---|---|
| **Plugin** Claude Code | `mooter` | Bundle: slash commands + subagents + hooks + statusline + MCP server embebido. `marketplace.json` em `paulo/mooter-plugin`. PR a `anthropics/claude-plugins-official` | Devs Claude Code (~milhões) |
| **Skill** portable | `mooter-router` | Versão sem hooks, só decisão. Para Cowork e Agent SDK directo | Devs Agent SDK |
| **MCP server** | `@mooter/router` em `registry.modelcontextprotocol.io` | Tools: `classify_prompt`, `get_savings`, `recommend_subagent`, `audit_session` | Qualquer cliente MCP |

**Por que é o sinal mais forte para a Anthropic**:

- Demonstra composição correcta de toda a stack deles
- Issues `anthropics/claude-code#19269` e `#30453` mostram que Anthropic está a aceitar feedback nesta área. Janela aberta.
- Anthropic ainda **não tem** solução nativa para per-skill model routing.
- Mooter coabita com Claude Code (não substitui) — fica do lado certo da fronteira de 2026-04-04 (first-party vs third-party).

\newpage

# 7. Loop de Retro-Alimentação

## 7.1 Sinais a recolher

| Signal | Como capturar | Fiabilidade | Custo |
|---|---|---|---|
| Test pass/fail | Pre-commit hook + CI | Alta (objectivo) | 0 |
| User retry/regenerate ≤60s | Hook no client | Alta | 0 |
| Refusal pattern detection | "I can't help" string match | Alta (drift detection) | 0 |
| User edits output (diff) | Git pre-commit | Média-alta | 0 |
| Explicit thumbs | UI button | Alta mas <1% adoption | 0 |
| Follow-up question (semantic sim >0.8) | Turn N+1 detection | Média | 0 |
| LLM-as-judge offline (5-20% sample) | Nightly batch | Alta calibrada | $$ |
| Token efficiency vs budget | Compare actual/expected | Indirecta | 0 |
| Time-to-resolution | Session TTL | Indirecta | 0 |

⚠️ **Nunca optimizar 1 só sinal**. Reward hacking é real (Anthropic documentou que generaliza para misalignment). Combinar ≥3 sinais.

## 7.2 Algoritmos por fase

| Fase | Decisões | Algoritmo | Sample efficiency | ENG complexity |
|---|---|---|---|---|
| **Fase 0** (já implementada) | 0-1k | ε-greedy (ε=0.2 → 0.05) + k-NN sobre seed | Razoável | Trivial |
| **Fase 1** (Wave-3 target) | 1k-10k | **Thompson sampling** sobre features (length, lang, code-detected) | Top-tier | Média |
| **Fase 2** (Wave-4 target) | 10k-100k | **LinUCB com embeddings + budget constraint** (PILOT-style) | Muito boa | Média-alta |
| **Fase 3** (pós-gate) | 100k+ | Avaliar neural bandit ou reward model dedicado | Variável | Alta |

## 7.3 Convergência realista

| Samples | Ganho típico vs baseline naive |
|---|---|
| 100 | Ruído estatístico |
| 1k | Primeira convergência observável — ganho 14-20% |
| 10k | Convergência forte — ganho 25-30% |
| 100k | Ganhos marginais decrescentes |

**Regra prática**: 5-10% melhoria por ordem de magnitude de samples acima de ~1k, com tecto perto de 30% sobre baseline naive.

## 7.4 Cadência operacional

| Time | Action |
|---|---|
| Cada decisão | Log OTel span (SQLite local) |
| Cada 100 decisões | Hot-reload Thompson posteriors |
| Cada 1k decisões | Golden-set replay 500 prompts; alerta drop >3% |
| Cada 10k | Re-train bandit + re-embed prompts; adversarial eval |
| Novo modelo provider | Adicionar como challenger; shadow 5% durante 1k decisões |
| Trimestral | Audit reward hacking; calibrar judge mensal |

\newpage

# 8. Diferenciadores vs Concorrentes

## 8.1 Mapa do mercado

| Player | Tipo | Approach | Pricing | OSS? | Diferenciador |
|---|---|---|---|---|---|
| **OpenRouter** | Gateway hosted | Catálogo + fallbacks; "best-of" routing | 5.5% fee | API client sim, backend não | 400+ modelos, ~$50M ARR Q1 2026 |
| **RouteLLM (LMSYS)** | Framework OSS de research | Routers treinados em Arena | Self-host gratuito | Apache-2 | 85% redução MT-Bench |
| **LiteLLM (BerriAI)** | Proxy/SDK | YAML fallbacks, latency-based | OSS gratuito; Cloud pago | MIT | 100+ providers OpenAI format |
| **Martian** | Routing comercial closed | "Model mapping" interpretability | Closed enterprise | Não | YC, ~$1.3B valuation Abr 2026 |
| **NotDiamond** | Routing comercial | Classifier por query | Freemium | Parcialmente | Auto Router em OpenRouter |
| **Unify AI** | Router hosted | Quality/cost/speed tuning | Pay-per-token | Não | Tuning dashboard |
| **Portkey** | AI gateway full-stack | Routing + canary + circuit breakers | $49/mês+ | Gateway core MIT | OTEL nativa + guardrails |
| **Helicone** | Observability-first gateway | Rust load-balancing | OSS self-host | Sim | Performance Rust |
| **vLLM Semantic Router** (Iris) | OSS lib emergente | 4-layer signal-decision | Self-host | Apache 2.0 | Backed Red Hat |
| **aurelio-labs/semantic-router** | OSS lib madura | Embedding similarity + hybrid kw | Self-host | MIT, 3.2k stars | Sweet spot indie OSS |

## 8.2 Onde o Mooter ganha

| Eixo | Mooter | Concorrência |
|---|---|---|
| **Subscription-Aware** | ✅ Único | Ninguém faz |
| **Codebase-Aware lang** | ✅ Único (planeado Phase 3) | Cursor força EN |
| **Local-first nativo** | ✅ Ollama integrado | OpenRouter cloud-only |
| **Doctrine dual-enforced** | ✅ Regex + sub-agent gating | Routers só ML |
| **Triple-stack Anthropic** | 🔜 Phase 6 | LiteLLM/Portkey gateway-only |
| **Zero-LLM classification** | ✅ <50ms regex | NotDiamond usa LLM-as-judge |
| **Coabita Claude Code (não substitui)** | ✅ | Cursor/Cline/Aider bloqueados Abr 2026 |
| **PT-PT/PT-BR cidadão de primeira** | ✅ AMALIA + Sabiá-3 | Anglocêntrico |

## 8.3 Onde NÃO competir

| ❌ Não copiar | Razão |
|---|---|
| Catálogo OpenRouter de 400+ modelos | Esforço infinito, sem moat |
| Closed-source "model mapping" Martian | Fora do alcance OSS indie |
| Hosted-only model como NotDiamond | Vai contra Local-first ethos |
| Fee% como OpenRouter | Requer hosted, mata local-first |

\newpage

# 9. Roadmap para o Gate (2026-05-26)

## 9.1 Posicionamento das Waves

| Wave | Estado | Data | Tema |
|---|---|---|---|
| **Wave-1** | ✅ LANDED | 2026-04 | Classifier v0.10 + hook + subagents + cost model honesto |
| **Wave-2** | ✅ LANDED 2026-05-07 | 2026-05-07 | Advisor → executor (router-execute.js, ollama-api.js, savings-tracker `/last-execution`) |
| **Wave-3** | 🔜 EM PLANEAMENTO | 2026-05-08 → 2026-05-13 | Async appendDecisionsLog · statusline reflectir guaranteed_saved separado · Gemini provider wrapper · Thompson sampling Phase 1 |
| **Wave-4** | 🔜 PLANEADO | 2026-05-14 → 2026-05-20 | Subscription-Aware + Codebase-Aware + RDTR (Routing Decision Transparency Report) + Honest Cost Report dashboard |
| **Wave-5** | 🔜 PLANEADO | 2026-05-21 → 2026-05-25 | Triple-stack publish (plugin + skill + MCP) + PR claude-cookbooks + Code with Claude London 2026-05-19 |
| **Gate** | 🎯 | 2026-05-26 | ≥250 stars + ≥3 contributors externos |

## 9.2 Timeline de eventos críticos

| Data | Evento | Acção |
|---|---|---|
| **2026-05-19** (12 dias) | 🔥 **Code with Claude London** (livestream grátis) | Submeter demo via Anthropic events page |
| 2026-05-20 | Show HN: "Mooter — subscription-aware multilingual LLM router" | Post live em horário US morning |
| 2026-05-21 | Posts Reddit (r/LocalLLaMA, r/ClaudeAI, r/OpenAI) | 3 posts diferentes, não cross-post |
| 2026-05-22 | Outreach 10 vibe coders/OSS maintainers | Personalizado, não bulk |
| 2026-05-24 | Blog post técnico "Why we built Mooter" | Medium + dev.to |
| 2026-05-25 | Apply Anthropic Startup Program | claude.com/programs/startups |
| **2026-05-26** | 🎯 **GATE** | Decisão: continua ou pivot GSD-as-a-Product |
| 2026-06-10 | Code with Claude Tokyo | Backup se London correr mal |
| 2026-Jul | Anthropic Fellows Program applications | alignment.anthropic.com |

## 9.3 Critérios de aceitação por Wave

### Wave-3 (próxima)

- [ ] `appendDecisionsLog` async + queue (Wave-2 reviewer note)
- [ ] Statusline reflectir `guaranteed_saved_usd` separado de `advisory_saved_usd`
- [ ] Gemini provider wrapper (`tools/router/providers/gemini-api.js`)
- [ ] Validation runner re-run fresh contra Wave-2 (acceptance §10 #5: ≥55% executions OK ratio)
- [ ] live `/metrics.executions` curl validation
- [ ] Thompson sampling Phase 1 sketch (research-only, não merge)
- [ ] Notion sub-page Wave-3
- [ ] All 295/296 tests passing + new Gemini coverage

### Wave-4 (specialist routing)

- [ ] Subscription-Aware config layer (`~/.mooter/subscription.yaml`)
- [ ] Subscription detection: 4 setups (none, Pro, Max, hybrid) com decisão correcta
- [ ] Codebase-Aware Language Harmonisation MVP (FastText + 12 regras + `.mooter/lang.json`)
- [ ] AMALIA + Sabiá-3 specialist routing (3 testes E2E)
- [ ] RDTR JSON emit + comando `/mooter explain`
- [ ] Honest Cost Report dashboard (`mooter dashboard`)

### Wave-5 (Anthropic alignment)

- [ ] Plugin Claude Code instalável: `/plugin marketplace add paulo/mooter-plugin && /plugin install mooter`
- [ ] Skill `mooter-router` testada em Cowork
- [ ] MCP server `@mooter/router` publicado em `registry.modelcontextprotocol.io`
- [ ] PR ao `anthropics/claude-cookbooks` submetido
- [ ] Demo video Loom 5min gravado
- [ ] Submeter demo Code with Claude London

\newpage

# 10. Economic Case

## 10.1 Cenários de redução de custo

Distribuição típica de tasks (vault telemetry + Anthropic Economic Index):

| Distribuição | T0 | T1 | T2 | T3 |
|---|---|---|---|---|
| % volume típico | 25% | 40% | 25% | 10% |
| All-Opus baseline cost (per task) | $0.15 | $0.30 | $0.80 | $3.00 |
| Mooter routed cost (per task) | $0 (local) | $0.005 (Haiku) | $0.20 (Sonnet+cache) | $2.50 (Opus+cache) |
| % saved per task | 100% | 98.3% | 75% | 17% |

**Weighted average savings**: `0.25×100% + 0.40×98.3% + 0.25×75% + 0.10×17%` = **~84% savings** (caso óptimo).

**Realista (50% prompt cache hit, 80% accuracy classifier)**: **65-72% savings**.

## 10.2 Subscription modifier

| Setup user | Savings | Killer metric |
|---|---|---|
| **PAYG puro** | 65-82% vs all-Opus baseline | "$X saved this month vs all-Opus" |
| **Claude Pro ($20/mês)** | Marginal — melhora rate-limit avoidance | "% subscription utilization" |
| **Claude Max ($200/mês)** | Marginal cost = 0; routing optimiza rate-limits + qualidade | "% calls dentro de subscription window" + "$Y saved vs equivalent PAYG" |
| **Híbrido (Max + GPT-5 PAYG + local)** | 70-90% vs all-frontier-PAYG | "Total saved across providers + local" |

## 10.3 Trade-off honesto sobre tempo perdido

| Task | Local 4090 | Cloud Haiku | Δ (perdido em local) |
|---|---|---|---|
| Commit msg (50 tok) | 5.2s | 1.25s | **+3.95s** ❌ |
| Format transform (200 tok) | 7.2s | 2.9s | **+4.3s** ❌ |
| Bug fix simples (500 tok) | 11.0s | 6.2s | +4.8s ⚠️ |
| Refactor multi-file (3000 tok) | 42.6s | 33.7s | +8.9s ⚠️ |
| Architecture decision (5000 tok) | 68.6s | 55.7s | +12.9s ⚠️ |

**Conclusão**: Para tasks <500 tokens, local PERDE em wall-time. Para >2 000 tokens, local empata ou bate Sonnet. Mooter deve ser honesto sobre isto na UX — mostrar "saved $X but +4s" para o user decidir.

## 10.4 Quando vale aceitar tempo extra para poupar

| Situação | Aceitar local | Não aceitar |
|---|---|---|
| Privacy obrigatória | ✅ Sempre | — |
| Volume alto sustentado >50 calls/h PAYG | ✅ Yes | — |
| Sub Pro/Max esgotada | ✅ Yes | — |
| Outputs longos (>2 000 tok) | ✅ Empata em wall-time | — |
| Iteração offline (avião, internet má) | ✅ Yes | — |
| UX interactivo crítico (<3s desejável) | — | ❌ Use Haiku/nano |
| User não tem hardware (≤8GB VRAM) | — | ❌ Cloud |

\newpage

# 11. Riscos e Mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Anthropic lança routing nativo Q3 2026 | Alta | Médio (Mooter mantém moat cross-provider + sub-aware + local-first) | Acelerar triple-stack publish; Submission Code with Claude London |
| R2 | Gate falha (<250 stars, <3 contributors) | Média | Alto (pivot GSD-as-a-Product) | Marketing tight semana 3; outreach personalizado; demo video impecável |
| R3 | Opus 4.7 tokenizer degrada economics | Confirmada | Médio | Default 4.6 até estabilizar; flag opt-in 4.7 |
| R4 | Cold start Ollama mata UX | Confirmada | Médio | `OLLAMA_KEEP_ALIVE=24h` obrigatório; fallback automático Haiku se cold + output<200 tok |
| R5 | Reward hacking no auto-learning | Média | Alto (router optimiza métrica wrong) | Combinar ≥3 sinais; capped objective; audit trimestral |
| R6 | Drift silencioso de provider | Alta (já aconteceu no GPT-4o histórico) | Médio | Pin versions; calibração judge mensal; alarmes distribution shift |
| R7 | Privacy: prompt logging em telemetry | Média | Alto (PII leak) | Hashing on-device; Postgres opt-in; redaction automática secrets/emails |
| R8 | Custo de LLM-as-judge mata economics | Média | Alto | Sample 5-20%; hierarchical judge; distilled judge |
| R9 | Implicit feedback ruidoso | Confirmada | Baixo | Pesa baixo até signal forte; NUNCA single-signal optimization |
| R10 | Anthropic rejeita PR claude-cookbooks | Baixa | Baixo (publish Medium) | PR bem feito; tom técnico; sem vendor talk |
| R11 | First-party/third-party ban estende-se | Baixa | Crítico | Mooter coabita (não substitui) — design defensivo |
| R12 | Concorrente OSS faz mesmo + faster | Baixa | Médio | Triple-stack play é defensivo; nicho subscription-aware é único |

\newpage

# 12. Próximos Passos Accionáveis (próximas 72h)

## 12.1 Hoje (2026-05-07, restante)

- [ ] Push autorizado de Wave-2 (12 commits sobre `aa25a2b`) — Paulo decide GO
- [ ] Notion sub-page Wave-2 criada
- [ ] Restart savings-tracker server (apanha `/last-execution` + executions block)
- [ ] Criar issues GitHub para Wave-3 com label `auto-ok`

## 12.2 Amanhã (2026-05-08)

- [ ] ADR `docs/adr/W3-001-async-decisions-log.md` (commit antes de implementar)
- [ ] T-1 Wave-3: implementar `appendDecisionsLog` async + queue
- [ ] T-2 Wave-3: statusline `guaranteed_saved_usd` separado
- [ ] Validation runner fresh contra Wave-2 corpus

## 12.3 Esta semana (até 2026-05-13)

- [ ] Wave-3 LANDED com final-reviewer APPROVED
- [ ] Gemini provider wrapper + 9 testes
- [ ] Thompson sampling Phase 1 sketch + ADR
- [ ] Bug bash sobre Wave-2 telemetry edge cases
- [ ] Submeter demo proposal Code with Claude London 2026-05-19

## 12.4 Próxima semana (2026-05-14 → 2026-05-20)

- [ ] Wave-4 LANDED (specialist routing)
- [ ] Subscription-Aware MVP
- [ ] Codebase-Aware MVP
- [ ] RDTR + Honest Cost Report dashboard
- [ ] PR ao `anthropics/claude-cookbooks`
- [ ] Code with Claude London livestream

## 12.5 Recta final (2026-05-21 → 2026-05-26)

- [ ] Wave-5 LANDED (triple-stack publish)
- [ ] Show HN
- [ ] 3 posts Reddit
- [ ] Outreach personalizado
- [ ] Demo video Loom 5min
- [ ] Apply Anthropic Startup Program
- [ ] **GATE 2026-05-26**

\newpage

# 13. Decisão final — confiança no caminho

**Acredito que estamos no caminho correcto?** Sim, com 4 caveats explícitos.

**3 razões para confiança**:

1. **Maturidade técnica acima da média do mercado OSS.** v0.11 com 295/296 testes, advisor → executor LANDED, classifier 87.5% accuracy, hook 113ms p50. Nenhum router OSS indie tem este rigor empírico.

2. **3 moats defensáveis identificados** com janela mínima 12-18 meses (subscription-aware, codebase-aware lang, triple-stack Anthropic alignment). Cada um isolado é pequeno; combinados, é único no mercado.

3. **Anthropic está no momento certo de prestar atenção**. Code with Claude SF (6 Mai) lançou Managed Agents. Issues `#19269` e `#30453` mostram que estão a aceitar feedback em routing. Janela está aberta.

**4 caveats honestos**:

| ⚠️ Caveat | Mitigação |
|---|---|
| **Gate de 250 stars em 19 dias é apertado**. 250 stars vem de marketing+timing, não de throughput de código. | Wave-5 prioriza marketing; demo video impecável; submeter Code with Claude London 12 dias antes do gate |
| **A janela fecha em 12-18 meses**. Anthropic vai lançar routing nativo. | Triple-stack play é o seguro; Mooter mantém valor cross-provider depois |
| **Subscription-aware exige instrumentação fiável** que pode não estar pronta para Wave-4. | MVP simplificado: detecta via env var, não tenta auto-discover |
| **PT-PT/PT-BR como diferenciador é nicho** — comunidade é menor que EN. | Não é único marketing angle. EN-vibe-coder pequeno-team sub Max é segmento maior |

**Probabilidade subjectiva de hit gate (250 stars + 3 contributors em 19 dias)**: 35-50%. Não é certeza. Mas o downside é limitado (pivot GSD-as-a-Product está mapeado) e o upside é grande (router OSS standalone com narrativa clara, doctrine dual-enforced, 3 moats únicos).

**Top 3 leverage points para subir essa probabilidade**:

1. **Demo video de 5 minutos brilhante** — vibe coders partilham screenshots/videos. Um GIF do statusline a mostrar "78% saved (Opus→Haiku ×4)" vale 100 commits.
2. **PR ao `anthropics/claude-cookbooks` aceite** — 42k stars, alta visibilidade. Mesmo se rejeitado, podes publicar como blog com link.
3. **Code with Claude London** (2026-05-19) — submeter demo cedo. Mesmo sem ser aceite para palco, networking no livestream.

**Faz com orgulho.**

\newpage

# Apêndice A — Stack técnica obrigatória

| Layer | Stack |
|---|---|
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind v4 + shadcn/ui |
| Backend | Supabase Postgres + Edge Functions (DENO runtime) |
| Deploy | Vercel |
| Local LLM | Ollama (default), opcional vLLM advanced |
| Local models default | Qwen3-30B-A3B Q4 + Devstral Small 2 Q4 + Gemma 3 12B Q4 |
| Cloud Anthropic | Opus 4.6 (default T3) ou 4.7 (opt-in), Sonnet 4.6, Haiku 4.5 |
| Cloud OpenAI | GPT-5.4 nano para T0/T1 advanced |
| Cloud Google | Gemini 3.1 Pro long-context >500k |
| TTS futuro | Cartesia sonic-3 |
| STT futuro | Groq Whisper API |
| Embeddings | bge-small-en-v1.5 (default) ou bge-m3 multilingual |
| Cache | GPTCache + Redis local |
| Telemetry | OpenTelemetry + GenAI Semantic Conventions |
| Vector store | pgvector em Supabase |
| Lang detection | FastText (não cld3, não langdetect) |

# Apêndice B — Anti-goals consolidados

Estes não fazem parte do scope até pós-gate (excepto se o user explicitamente pedir):

- ❌ Implementar speculative decoding custom
- ❌ Test-time compute scaling com PRM
- ❌ Plan-with-frontier+execute-with-local como default
- ❌ Fine-tuning próprio do qwen3
- ❌ Catálogo de 400+ modelos
- ❌ Closed-source "model mapping" como Martian
- ❌ Auto-merge para `main`
- ❌ 20+ agentes paralelos em worktrees (limite: 3)
- ❌ CLAUDE.md de 1000+ linhas (target <200)
- ❌ Confiar em CLAUDE.md como segurança
- ❌ Loops sem exit detection
- ❌ Ler issues GitHub não-curadas no loop
- ❌ LLM-as-judge no hot-path com Sonnet/Opus
- ❌ Cascade puro estilo FrugalGPT em agente interactivo
- ❌ Comoditizar Claude num gateway anonimizado
- ❌ Esconder Claude tier ao user
- ❌ Bypassar Claude rate limits via paralelização
- ❌ Cache outputs Claude e revender
- ❌ Inventar números, modelos, URLs

# Apêndice C — Glossário

| Termo | Definição |
|---|---|
| **T0** | Tier local — Ollama qwen3:30b ou similar; ~$0 marginal cost |
| **T1** | Tier Claude barato — Haiku 4.5; commit msgs, docstrings, regex |
| **T2** | Tier Claude reasoning — Sonnet 4.6 + cache; bug hunt, plano técnico |
| **T3** | Tier Claude premium — Opus 4.6/4.7 + cache; arquitectura, refactor multi-file |
| **Doctrine** | CLAUDE.md + ROUTING_POLICY.md — dual-enforced regras T0-T3 |
| **Advisor mode** | Wave-1: classifier emite hint, sub-agent executa |
| **Executor mode** | Wave-2: classifier emite hint + router-execute despacha non-Anthropic directamente |
| **`<router-hint>`** | Bloco JSON injectado no prompt pelo hook UserPromptSubmit |
| **HIGH_RISK** | Sinal regex que força T3 + final-reviewer (`.env`, secrets, prod, etc.) |
| **Cascade** | Escala tier+1 e re-executa quando test fail OU user retry |
| **Champion-challenger** | Shadow routing: novo router log-only sobre 100% tráfego, comparado weekly |
| **Shadow routing** | Challenger corre paralelo, log-only, decisões comparadas mas não servidas |
| **Final-reviewer** | Sub-agent Opus + cache que corre antes de qualquer push para main |
| **Doctrine dual-enforcement** | Regex guardrail + sub-agent gating — auto-learning não pode quebrar |
| **Subscription-aware** | Mooter detecta sub Anthropic/OpenAI/Google e bias decisão |
| **Codebase-aware** | Mooter detecta lingua dominante da codebase e routea coerente |
| **Triple-stack** | Mooter publicado como plugin + skill + MCP server simultâneo |

# Apêndice D — Fontes consolidadas

## Mooter — documentos internos do repo

- `~/frugal/CLAUDE.md` (16 KB) — doctrine geral
- `~/frugal/docs/MASTER_ARCHITECTURE.md` — arquitectura completa
- `~/frugal/docs/ROUTING_POLICY.md` — política T0-T3
- `~/frugal/docs/COST_MODEL.md` — token-anchored pricing
- `~/frugal/docs/BENCHMARK.md` — latency v0.7
- `~/frugal/docs/MODEL_MAPPING.md` — onde trocar cada modelo
- `~/frugal/docs/HOW_IT_WORKS.md` — diagrama e fluxo
- `~/frugal/docs/LIMITATIONS.md` — o que não automatiza
- `~/frugal/docs/SAFETY-MECHANISMS.md` — guardrails
- `~/frugal/.planning/wave-2/SPEC.md` — Wave-2 design contract
- `~/frugal/.planning/wave-2/PLAN.md` — Wave-2 11-task DAG
- `~/frugal/.planning/validation-2026-05-07/VALIDATION-REPORT.md` — verdict autónomo
- `~/frugal/MOOTER_ROUTING_STRATEGY_2026-05-07.md` (V1) — estado mercado
- `~/frugal/MOOTER_ROUTING_STRATEGY_V2_2026-05-07.md` (V2) — Anthropic ecosystem
- `~/frugal/MOOTER_FLUXOGRAMA_DEFINITIVO_2026-05-07.md` (V3) — pipeline quantificado
- `~/frugal/MOOTER_MASTER_PROMPT_2026-05-07.md` — playbook Claude Code

## Routing — papers e benchmarks

- RouteLLM (LMSYS) blog — <https://www.lmsys.org/blog/2024-07-01-routellm/>
- RouteLLM paper — <https://arxiv.org/abs/2406.18665>
- RouterBench — <https://arxiv.org/abs/2403.12031>
- RouterArena — <https://arxiv.org/html/2510.00202v1>
- FrugalGPT — <https://arxiv.org/abs/2305.05176>
- Cascade Routing ICLR 2025 — <https://arxiv.org/abs/2410.10347>
- PILOT — <https://arxiv.org/html/2508.21141v1>
- BaRP — <https://arxiv.org/abs/2510.07429>
- CARROT — <https://arxiv.org/abs/2502.03261>
- Calibration-Gated Pseudo-Observations — <https://arxiv.org/html/2604.14961>

## Anthropic — primary sources

- Anthropic Skills docs — <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview>
- Claude Code skills — <https://code.claude.com/docs/en/skills>
- Plugin marketplaces — <https://code.claude.com/docs/en/plugin-marketplaces>
- Official MCP Registry — <https://registry.modelcontextprotocol.io/>
- RSP v3.0 — <https://www.anthropic.com/news/responsible-scaling-policy-v3>
- Tracing Thoughts — <https://www.anthropic.com/research/tracing-thoughts-language-model>
- Petri open-source auditing — <https://www.anthropic.com/research/petri-open-source-auditing>
- Building Effective Agents — <https://www.anthropic.com/research/building-effective-agents>
- Code with Claude — <https://claude.com/code-with-claude>

## Local LLMs

- Qwen3 Complete Guide — <https://insiderllm.com/guides/qwen3-complete-guide/>
- Qwen3-30B-A3B HuggingFace — <https://huggingface.co/Qwen/Qwen3-30B-A3B>
- Devstral comparison — <https://pricepertoken.com/compare/mistral-ai-devstral-2512-vs-qwen-qwen3-coder-next>
- Best Local LLMs RTX 4090 — <https://toolhalla.ai/blog/best-local-llms-rtx-4090-2026>
- Open Portuguese LLM Leaderboard — <https://huggingface.co/spaces/eduagarcia/open_pt_llm_leaderboard>
- AMALIA technical report — <https://arxiv.org/abs/2603.26511>
- Sabiá-2 paper — <https://arxiv.org/abs/2403.09887>

## Multilingual

- Beyond English: prompt translation — <https://arxiv.org/html/2502.09331v1>
- Do Multilingual LLMs Think in English? — <https://arxiv.org/html/2502.15603v1>
- CodeMixBench — <https://arxiv.org/html/2505.05063v1>
- FastText vs CLD3 — <https://www.pkgpulse.com/blog/franc-vs-langdetect-vs-cld3-language-detection-javascript-2026>

## Auto-feedback

- vLLM Semantic Router (Iris) — <https://blog.vllm.ai/2026/01/05/vllm-sr-iris.html>
- aurelio-labs/semantic-router — <https://github.com/aurelio-labs/semantic-router>
- LiteLLM — <https://github.com/BerriAI/litellm>
- Langfuse OTel — <https://langfuse.com/integrations/native/opentelemetry>

\newpage

# Documento metadata

| Campo | Valor |
|---|---|
| Versão | 1.0 (canónica) |
| Data | 2026-05-07 |
| Autor | Paulo Loureiro + Claude (Cowork) |
| Substitui | V1, V2, V3 e Master Prompt em assuntos estratégicos |
| Substituído por | (futuro) MOOTER_STRATEGY_CANONICAL_VNN_YYYY-MM-DD.md |
| Source of truth | Sim — single source of truth estratégico |
| Audiência | Paulo (interno), futuros contributors, partners potenciais, Anthropic DevRel |
| Renovar quando | Wave-3 LANDED, ou Anthropic lança routing nativo, ou pivot pós-gate |

**Disclaimer**: Este documento agrega análise estratégica V1+V2+V3 + leitura do estado real do repo Mooter `~/frugal/` em 2026-05-07. Números do mercado (latency, pricing, leaderboards) verificados em fontes citadas no Apêndice D. Estado interno do projecto (Wave-2 LANDED, métricas validation, subagents) lido directamente de `SYNC.md` Sessão #40 e `docs/`. Em caso de conflito entre este documento e o repo: **repo vence** (estado actual prevalece sobre snapshot).

---
