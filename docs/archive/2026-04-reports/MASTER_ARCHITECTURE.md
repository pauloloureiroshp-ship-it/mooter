# frugal — Master Architecture Document
# Versão do documento: 1.0 · Gerado: 2026-04-11 · Autor: Paulo Loureiro + Claude

> **Este documento é o mapa completo do sistema frugal.**
> Inclui visão de produto, arquitectura técnica, algoritmo do classifier, infraestrutura,
> pipeline de dados, roadmap e estratégia competitiva.
> Lê antes de qualquer decisão de produto ou engenharia.

---

## Índice

1. [O Problema e a Visão](#1-o-problema-e-a-visão)
2. [O que o frugal É — v2.0](#2-o-que-o-frugal-é--v20)
3. [Estado actual — v0.9.6](#3-estado-actual--v096)
4. [Arquitectura de Alto Nível](#4-arquitectura-de-alto-nível)
5. [O Algoritmo — classify.js v0.10](#5-o-algoritmo--classifyjs-v010)
6. [O Hook — inject_context.js](#6-o-hook--inject_contextjs)
7. [A Doutrina — CLAUDE.md](#7-a-doutrina--claudemd)
8. [Subagents — A Equipa de Modelos](#8-subagents--a-equipa-de-modelos)
9. [Auto-learning Loop](#9-auto-learning-loop)
10. [Telemetria e Savings Tracker](#10-telemetria-e-savings-tracker)
11. [Statusline — Visibilidade em Tempo Real](#11-statusline--visibilidade-em-tempo-real)
12. [frugal-hub — Backend Cloudflare](#12-frugal-hub--backend-cloudflare)
13. [Landing + Auth — Supabase + Vercel](#13-landing--auth--supabase--vercel)
14. [Dashboard Local — v0.6.0](#14-dashboard-local--v060)
15. [Skills — Slash Commands](#15-skills--slash-commands)
16. [Instalação e Runtime Local](#16-instalação-e-runtime-local)
17. [Infraestrutura de Terceiros](#17-infraestrutura-de-terceiros)
18. [Arquitectura de Dados e Motor Proprietário](#18-arquitectura-de-dados-e-motor-proprietário)
19. [Falhas e Degradação Graceful](#19-falhas-e-degradação-graceful)
20. [Performance Budget](#20-performance-budget)
21. [Segurança e Privacidade](#21-segurança-e-privacidade)
22. [Roadmap Técnico](#22-roadmap-técnico)
23. [Estratégia Competitiva](#23-estratégia-competitiva)
24. [Monetização](#24-monetização)
25. [Glossário](#25-glossário)

---

## 1. O Problema e a Visão

### O Problema Real

Um vibe coder hoje enfrenta:

- Claude Max ($20/mês), Copilot ($10/mês), ChatGPT Plus ($20/mês) — paga tudo, usa mal
- Sem visibilidade de quanto gasta ou onde desperdiça
- Opus em cada prompt de "muda a cor do botão" = queima $0.15 por call trivial
- Medo de carregar em "build" porque não sabe quanto vai custar

**A maior barreira não é talento ou ideias — é ruído, paralisia e medo de custo.**

### A Resposta do frugal

> *"O frugal é o sistema operativo do vibe coder."*

Não é um proxy. Não é um agregador. É a camada de inteligência que:
1. Classifica cada prompt em < 50 ms (regex puro, zero LLM)
2. Emite um `<router-hint>` que Claude Code honra
3. Reduz o custo em ~90% sem degradar a qualidade
4. Aprende com cada decisão e melhora automaticamente
5. Cresce com a comunidade — dados agregados melhoram o algoritmo para todos

### Os Cinco Princípios (não negociáveis)

1. **No proxy** — frugal nunca senta entre o user e o LLM. Se frugal morrer, Claude Code continua.
2. **Zero LLM cost na classificação** — um router que chama um LLM para decidir qual LLM chamar é recursão idiota. Regex puro em < 50 ms.
3. **Doctrine > configuration** — 165 linhas de Markdown lidas pela sessão valem mais que qualquer YAML.
4. **Explainability** — cada decisão tem um campo `reasoning`. Sempre sabes "porquê Opus?".
5. **Doctrine nunca cede ao optimizador** — auto-learning pode mover prompts triviais para T0, mas push/deploy/secrets/architect são T3 para sempre, dual-enforced.

---

## 2. O que o frugal É — v2.0

### Os 3 Tipos de Utilizador

| Tipo | Perfil | O que o frugal resolve |
|---|---|---|
| **Iniciante** (maior mercado) | Começou no Lovable, tem medo do terminal | Onboarding guiado, config automática, "for dummies" |
| **Intermediate** (mais valioso para dados) | Usa Claude Code, paga $20-100/mês, sabe que desperdiça | Savings imediatos, perfil via GitHub, config optimizada |
| **Power User** (evangelista) | Developer experiente, quer controlo total | Beast/Zen/Auto mode, acesso ao hub de dados, customização |

### A Promessa Central (v2.0)

De: *"Poupa 90% no Claude Code"*
Para: *"Concentra-te na tua ideia. Nós tratamos do resto."*

---

## 3. Estado actual — v0.9.7 + Sprint 5-A

**Data:** 2026-04-11 · **Sprint 5-A:** Prompt Optimizer completo ✅ · **Milestone:** frugal passa a optimizar o prompt além de o rotear

| Componente | Versão | Estado |
|---|---|---|
| `classify.js` | v0.10 | ✅ Em prod — +variant_hint, +SUBAGENT_SPAWN_RE, +previous_tier inheritance |
| `inject_context.js` | v0.10+ | ✅ +prompt-optimizer call + `<optimized-task>` emission + logging |
| `prompt-optimizer.js` | v1.0 | ✅ NOVO (Sprint 5-A) — 5 estratégias, guardrails, < 5ms, 46/46 testes |
| `patterns.js` | v0.7.0 | ✅ SSOT de regexes — shared com backtest.js |
| 6 subagents | — | ✅ architect, reasoner, cheap-triage, local-summarizer, local-transformer, final-reviewer |
| `backtest.js` | v0.9.6 | ✅ +optimizer hits/tokens/strategies no analyze() e report() |
| `savings-tracker.js` | — | ✅ HTTP :7821 + novo /optimizer-stats endpoint |
| `gpu-probe.js` | — | ✅ NVIDIA/Apple/AMD/CPU fallback |
| `frugal-mode.js` | — | ✅ Beast/Zen/Auto mode system |
| `frugal-doctor.js` | — | ✅ Diagnóstico cross-platform, --fix mode |
| `feedback-collector.js` | — | ✅ CLI de ratings (Sprint 2) |
| `gold-labels.json` | 62 entries | ✅ 95.2% accuracy validada |
| `hub-submit-events.js` | — | ✅ Cliente local com batching (Sprint 3) |
| frugal-hub Worker | — | ✅ LIVE — D1 + R2 + POST /submit-events + GET /aggregate-stats |
| GitHub Actions CI | — | ✅ test.yml + deploy-hub.yml activos |
| Landing | v10 | ✅ Live em Vercel — live counters, Install Now CTA |
| Dashboard | scaffold | ⚠️ npm install feito, build passing, UI em construção (Sprint 4) |
| VSCode extension | v0.4.0 | ⚠️ Não publicada no marketplace |
| Supabase RLS anon | — | ⏳ Pendente (Sprint 4 B1) |
| GitHub OAuth | — | ⏳ Pendente (Sprint 4 B2) |

**Métricas de produção:**
- Accuracy: 100% no corpus de 1,437 prompts reais (com 170 prompts de teste, ajustado)
- Savings validados: ~90% vs usar Opus em tudo
- Gold labels: 62 entradas curadas, 95.2% accuracy em validação offline
- Patterns: 102 regexes em 4 categorias (HIGH/MED/LOW/TRIVIAL)
- Latência típica do classifier: 20–45 ms (cold), 2 ms (cached)

---

## 4. Arquitectura de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          MÁQUINA LOCAL DO PAULO                                 │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                        CLAUDE CODE (session)                             │   │
│  │                                                                          │   │
│  │   user digita prompt                                                     │   │
│  │         │                                                                │   │
│  │         ▼                                                                │   │
│  │   [UserPromptSubmit hook] ──► inject_context.js                         │   │
│  │         │                            │                                  │   │
│  │         │                            ▼                                  │   │
│  │         │                     classify.js v0.10                        │   │
│  │         │                     (regex, <50ms)                           │   │
│  │         │                            │                                  │   │
│  │         │                            ▼                                  │   │
│  │         │                   <router-hint> emitido                      │   │
│  │         │                            │                                  │   │
│  │         ▼                            ▼                                  │   │
│  │   CLAUDE CODE lê hint + CLAUDE.md (doutrina)                           │   │
│  │         │                                                                │   │
│  │         ├── T0 → spawn local-summarizer/local-transformer (Ollama)      │   │
│  │         ├── T1 → spawn cheap-triage (Haiku API)                         │   │
│  │         ├── T2 → spawn model-reasoner (Sonnet)                          │   │
│  │         ├── T3 → spawn model-architect (Opus)                           │   │
│  │         └── pre-merge → spawn final-reviewer (Opus)                     │   │
│  │                                                                          │   │
│  │   [PostToolUse hook] ──► exec-logger.js → execution.log (TSV)          │   │
│  │   [Stop hook]        ──► gsd-turn-end.js → decisions.log (turn_end)    │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐    │
│  │ Ollama :11434           │    │ savings-tracker.js :7821                │    │
│  │ qwen3:30b (T0 reason)   │    │ GET /metrics → savings data             │    │
│  │ qwen2.5:3b (T0 terse)   │    │ GET /summary → human-readable           │    │
│  │ qwen2.5-coder:14b (code)│    │ GET /last → last decision               │    │
│  │ deepseek-r1:14b (math)  │    │ GET /gpu → GPU status                   │    │
│  └─────────────────────────┘    └─────────────────────────────────────────┘    │
│                                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ auto-learning loop (02:00 daily via Windows Task Scheduler)            │    │
│  │   backtest.js ──► router-tuning.json ──► update-router.js ──► classify │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ Dashboard Next.js :7820 (Sprint 4 — em construção)                     │    │
│  │ Overview | Misroutes | Tuning | Community                               │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                │                                          │
                ▼                                          ▼
┌─────────────────────────────┐      ┌────────────────────────────────────────┐
│  Anthropic API              │      │  frugal-hub (Cloudflare Workers)       │
│  haiku (T1)                 │      │  https://frugal-hub.frugal-hub.workers │
│  sonnet (T2 subagent)       │      │  .dev                                  │
│  opus (T3 subagent)         │      │                                        │
└─────────────────────────────┘      │  POST /api/delta — recebe deltas       │
                                     │  GET  /api/stats — agregados públicos  │
                                     │  POST /submit-events — eventos (auth)  │
                                     │  GET  /aggregate-stats — stats eventos │
                                     │  GET  /health                          │
                                     │                                        │
                                     │  D1 SQLite: routing_deltas             │
                                     │             frugal_events              │
                                     │  R2: router-tuning-latest.json         │
                                     │       model-catalog-latest.json        │
                                     │                                        │
                                     │  Crons: hourly aggregate               │
                                     │         daily generate                 │
                                     │         weekly notify                  │
                                     └────────────────────────────────────────┘
                                                        │
                                                        ▼
                                     ┌────────────────────────────────────────┐
                                     │  Supabase (sa-east-1)                  │
                                     │  eymtobwinevywmmlmxqa.supabase.co      │
                                     │                                        │
                                     │  tables: waitlist, profiles,           │
                                     │          usage_sessions                │
                                     │  auth: Magic Link ✅, GitHub OAuth ⏳  │
                                     └────────────────────────────────────────┘
                                                        │
                                                        ▼
                                     ┌────────────────────────────────────────┐
                                     │  Landing (Vercel)                      │
                                     │  landing-five-azure-16.vercel.app      │
                                     │  Next.js 15 App Router                 │
                                     │  7 secções: Hero→Demo→Flywheel→        │
                                     │  HowItWorks→Comparison→Pricing→Access  │
                                     └────────────────────────────────────────┘
```

---

## 5. O Algoritmo — classify.js v0.10

### Input / Output

**Input:** string do prompt (de argv[2] ou stdin)

**Output JSON:**
```json
{
  "task_category": "architecture_or_critical",
  "risk_level": "high",
  "tier": "T3",
  "recommended_backend": "claude_subagent",
  "recommended_model": "claude-opus-4-6",
  "suggested_subagent": "model-architect",
  "confidence": 0.9,
  "escalation_rule": "none",
  "reasoning": "high-risk signals: 2, multiFile: false",
  "variant_hint": null,
  "user_override": false,
  "previous_tier": null,
  "anthropic_key_present": true,
  "prompt_length": 142,
  "file_hint_count": 3
}
```

### O Sistema de Tiers

| Tier | Nome | Backend | Modelo | Custo típico/prompt | Quando |
|---|---|---|---|---|---|
| **T0** | Local | Ollama | qwen2.5:3b (terse) / qwen3:30b (reason) / qwen2.5-coder:14b / deepseek-r1:14b | $0.00 | Trivial, resumo, transformação, código local |
| **T1** | Cheap | Haiku API | claude-haiku-4-5-20251001 | ~$0.001 | Commit messages, docstrings, explicações ligeiras |
| **T2** | Reasoner | Sonnet subagent | claude-sonnet-4-6 | ~$0.01 | Bug investigation, planeamento, debugging médio |
| **T3** | Architect | Opus subagent | claude-opus-4-6 | ~$0.05+ | Arquitectura, refactor multi-ficheiro, decisões críticas |

### T0 Sub-tiers (v0.10 — novidade)

O T0 não é um modelo só — é 4 especialistas locais:

| Sub-tier | Modelo | Quando |
|---|---|---|
| `ollama_terse` | qwen2.5:3b | Resumo, transforms, output curto |
| `ollama_reason` | qwen3:30b | Análise local com 1-2 hops de reasoning |
| `ollama_code` | qwen2.5-coder:14b-q4 | Tarefas de código local (detectado por padrões) |
| `ollama_math` | deepseek-r1-distill-qwen:14b | Math e reasoning complexo |

### As 4 Categorias de Risco

```
HIGH_RISK  (16 patterns) — força T3 sempre:
  push, deploy, migrate, architect, refactor multi-file, .env,
  CI/CD, secrets, production, redesign, multi-tenant, review final...

MED_RISK   (14 patterns) — candidato a T2:
  bug, debug, investigate, root cause, explain error, compare approaches,
  diagnose, why is, profiling, optimize...

LOW_RISK   (11 patterns) — candidato a T1:
  summarize, format, translate, extract, list, convert, rewrite as,
  generate docs, write test for...

TRIVIAL    (5 patterns) — candidato a T0:
  classify, categorize, is this, quick check, what type...
```

### A Árvore de Decisão (11 passes)

```
PASS 1 — Cache: SHA256(prompt + prev_tier)? → devolve cached (30min TTL)
PASS 2 — MD Enrichment: lê ## Router Context do CLAUDE.md do projecto
PASS 3 — User Override: "usa opus" / "@sonnet" / "força haiku"? → pin directo
PASS 4 — Subagent Spawn Detection: "spawn model-architect" / "usa o reasoner"? → user_override
PASS 5 — Previous Tier Inheritance: follow-up curto sem sinais herda tier da sessão anterior
PASS 6 — Fast paths:
           BASH_PASTE (~30 CLI tools detectados) → T0 ollama_terse
           PS_PASTE (PowerShell paste marker) → T0 ollama_terse
           READ_INTENT ("lê", "read" + filename, curto) → T0 local-summarizer
PASS 7 — Scoring principal:
           high > 0 OR multi-file → T3 (architect)
           med > 0 AND high == 0 → T2 (reasoner)
           low > 0 → T1 (cheap-triage)
           triv > 0 OR very short → T0 (summarizer)
           else → ambiguous (length × TUNED_COMPLEXITY_THRESHOLD)
PASS 8 — Low-confidence escalation: confidence < 0.5 AND (med > 0 OR high > 0) → bump tier up 1
PASS 9 — TUNED_DEMOTE_T3: tier T2/T3 AND high==0 AND pattern match → force T1
PASS 10 — TUNED_PROMOTE_T0: tier != T0 AND high==0 AND pattern match → force T0
PASS 11 — Degradations:
            T1 sem ANTHROPIC_API_KEY → T0
            Budget > 95% → hard cap T0
```

### O Guardrail Dual-Enforce (crítico)

**O bug de produção (2026-04-07):** o backtest aprende "review final antes" como candidato a demote, mesmo que o runtime o bloqueie. Na próxima run, `update-router.js` re-injecta o padrão veneno. Loop infinito de ficheiro sujo.

**A solução:**
- Runtime (`classify.js`): `if (high === 0)` → só demote/promote se zero sinais HIGH_RISK
- Upstream (`backtest.js`): `if (hasHighRisk(d.prompt_preview)) continue` → filtra o corpus ANTES de derivar candidatos

**A regra:** quando o runtime bloqueia uma acção do pipeline de auto-learning, o pipeline que gera as regras também tem de ser ensinado a não propor essa acção.

---

## 6. O Hook — inject_context.js + Prompt Optimizer

### Papel

Registado em `~/.claude/settings.json` como hook `UserPromptSubmit`. Claude Code executa este script a cada prompt e injeta o stdout como mensagem de sistema adicional.

### O que faz por turno (v0.10+, Sprint 5-A)

```
1. Lê FRUGAL_PREV_TIER do env (exportado da sessão anterior via decisions.log)
2. Invoca classify.js com o prompt + timeout 500ms
3. [NOVO] Invoca prompt-optimizer.js → <optimized-task> se aplicável
4. Constrói <router-hint> com o resultado JSON + optimized-task
5. Se compliance 0% e tier T0/T1 → injeta <delegation_directive> de enforcement
6. Chama frugal-turn-header.js → emite header visual para o user ver antes do turn
7. Appenda a decisions.log (linha JSONL com eventos 'classified' e 'prompt_optimized')
8. Retorna o hint ao Claude Code
```

### Safety Rails

- **Timeout 500ms:** se classify.js bloquear, emite hint vazio. Session continua normalmente.
- **Never throws:** qualquer excepção retorna `''`. Frugal invisível, Claude Code funciona.
- **Idempotente:** SHA-256 cache garante o mesmo resultado para o mesmo prompt.
- **Optimizer fail-safe:** qualquer erro no optimizer → null → hint emitido sem `<optimized-task>`.

### Funcionalidades v0.10 (novas)

- `readLastSessionTier()` — lê tail 32KB do decisions.log, extrai o tier da última sessão
- Export `FRUGAL_PREV_TIER` — disponível para o classify.js na próxima invocação
- `applyActiveMode()` — lê `.frugal-mode.json`, sobrepõe tier antes de emitir hint
- `CASCADE_RE` detection — detecta prompts que são cascatas de subagent

---

## 6-B. Prompt Optimizer — prompt-optimizer.js (Sprint 5-A)

### O que é

**Milestone arquitectural:** o frugal passa de "onde enviar" para "onde E como enviar". É a primeira camada que transforma activamente o conteúdo do prompt antes de chegar ao modelo — zero latência, puro Node.js, sem LLM secundário no caminho crítico.

### Value proposition actualizado

> **Antes:** *"Envia o prompt para o modelo certo"*
> **Depois:** *"Envia o prompt certo para o modelo certo"*

### Arquitectura da camada

```
prompt (raw) + decision (classify output)
        │
        ▼
  prompt-optimizer.js
        │
        ├── Guardrail check ──► architecture_or_critical? HIGH_RISK? < 30 chars? → null
        │
        ├── S1: Padding removal
        │     remove "podes fazer", "consegues", "would you kindly", etc.
        │     ganho: 5-15% tokens em prompts conversacionais
        │
        ├── S2: Tier-aware reformat
        │     T0 → imperativo denso (remove artigos/preposições)
        │     T1 → instrução directa e curta
        │     T2 → bullet points estruturados para multi-step
        │     T3 → "Context: / Task: / Constraints:" explícitos
        │
        ├── S3: Category-aware framing
        │     bug_hunt → "Debug: [erro em destaque]"
        │     commit   → formato padronizado
        │     summary  → "Summarize in N lines:"
        │     code_gen → "Implement: ... Output: [lang] code only."
        │     math     → "Solve step-by-step:"
        │
        ├── S4: Error trace structuring
        │     has_error_trace → Bug: / Stack: (top 3) / Task: separados
        │
        └── S5: Language normalization
              lang_detected ≠ en + tier T1/T2 → "[Note: respond in PT]"
        │
        ▼
  { optimized_task, tokens_saved_est, strategy }
        │
        ▼
  inject_context.js emite:
  <optimized-task tier="T1" strategy="s1+s2" tokens-saved="23">
    [versão reformatada]
  </optimized-task>
```

### Resultados do dry-run (corpus histórico 363 prompts)

| Métrica | Valor |
|---|---|
| Prompts optimizados | 202 / 363 **(56%)** |
| Tokens saved estimados (conservador) | 282 (sobre preview 80 chars) |
| Tokens saved real estimado | ~850–1.400 (sobre prompts completos) |
| Estratégia dominante | s1+s2 (58% dos optimizados) |
| Budget de execução | < 5ms (validado nos 46 testes) |

### Guardrails obrigatórios

- Nunca toca em `architecture_or_critical`
- Nunca toca em prompts HIGH_RISK
- Nunca toca em prompts < 30 chars
- Nunca em cache hits (já foram optimizados)
- Falha silenciosamente — erro → null → hint sem `<optimized-task>`

### Fase 2 (documentada, não implementada)

- **Ollama rewrite async** — qwen2.5:3b com meta-prompt de compressão (~200ms, só se Ollama quente)
- **Semantic cache** — embeddings `nomic-embed-text`, flat file 500 entries LRU, threshold coseno 0.92
- **Cross-session learning** — prompts optimizados aceites alimentam backtest com padrões

---

## 7. A Doutrina — CLAUDE.md

### O que é

Um ficheiro Markdown de ~165 linhas que Claude Code lê como instrução global ao início de cada sessão. É o "contrato" entre o classifier e a sessão.

### O que contém

1. A sequência mental de routing (CLASSIFY → RISK → SCOPE → ROUTE → ACT)
2. Quando honrar o `<router-hint>` e quando overridar
3. A tabela de decisão por tier com exemplos canónicos
4. Os guardrails (operações que forçam T3 independente do hint)
5. Regras de disciplina de tokens (lê mínimo viável, paraleliza, sem preâmbulo)
6. O catálogo de subagents e quando spawn cada um
7. A regra-mãe: "Bazuca só quando a parede é de betão. Para um post-it, dedo basta."

### Regra de Delegação (v2, 2026-04-11)

A regra antiga "inline se < 5 tool calls" foi revogada — produzia sessões 100% Opus com poupança real de $0.

**Nova regra por precedência:**
1. Header diz T0/T1 → **DELEGA sempre** (exceção única: estado de sessão que subagent fresco não veria)
2. Header diz T2 → **DELEGA** para investigação. Inline só em follow-up mecânico
3. Header diz T3 → inline (já és o modelo certo). Spawn só para isolamento genuíno
4. USER_OVERRIDE pinning Opus → inline sem culpa
5. Pré-merge/push/deploy → `final-reviewer` sempre

---

## 8. Subagents — A Equipa de Modelos

Cada tier tem um ficheiro Markdown em `~/.claude/agents/`. Claude Code spawna-os via Agent tool quando a doutrina manda.

| Subagent | Tier | Modelo | Custo aprox. | Especialização |
|---|---|---|---|---|
| `local-summarizer` | T0 | Ollama qwen3:30b | $0.00 | Resumo, comparação, extracção de campos |
| `local-transformer` | T0 | Ollama qwen3:30b | $0.00 | Transforms de formato, regex, reformatação |
| `cheap-triage` | T1 | Haiku API | ~$0.001 | Commit messages, docstrings, explicações ligeiras |
| `model-reasoner` | T2 | Sonnet | ~$0.01 | Bug hunts, planeamento, root cause analysis |
| `model-architect` | T3 | Opus | ~$0.05+ | Arquitectura, refactor multi-ficheiro, decisões críticas |
| `final-reviewer` | T3-gate | Opus | ~$0.05+ | Gate não-skipável pré-merge/push/release/deploy |

**São apenas ficheiros Markdown.** Claude Code trata de tudo nativamente — sem plumbing, sem processo externo, sem RPC.

---

## 9. Auto-learning Loop

### O Ciclo Completo

```
RUNTIME (cada prompt)
  classify.js ──► decisions.log (JSONL append-only)
      ▲
      │ lê TUNED_DEMOTE_T3, TUNED_PROMOTE_T0, TUNED_COMPLEXITY_THRESHOLD

OFFLINE (02:00 diário — Windows Task Scheduler: FrugalRouterBacktest)

  backtest.js:
    1. Carrega decisions.log
    2. Per-entry: filtra HIGH_RISK (guardrail upstream — crítico)
    3. Agrupa por signature (primeiras 3 palavras significativas, lowercase)
    4. Identifica candidatos:
       - shortHighTier   → prompt < 50 chars em T2/T3
       - lowConfHighTier → confidence < 0.6 em T2/T3
       - repeated        → mesma signature ≥3 vezes, sempre high tier
    5. Calcula savings adicionais se candidatos fossem demoted
    6. Emite router-tuning.json + relatório human-readable

  update-router.js:
    1. Backup classify.js → classify.js.bak
    2. Lê router-tuning.json
    3. Constrói bloco TUNED:
       const TUNED_COMPLEXITY_THRESHOLD = X;
       const TUNED_PROMOTE_T0 = [...regexes...];
       const TUNED_DEMOTE_T3 = [...regexes...];
    4. Substitui bloco existente (TUNED-BLOCK-START/END) ou insere após 'use strict'
    5. Escreve de volta. Idempotente.

PRÓXIMO PROMPT
  classify.js lê as TUNED_* constants actualizadas em runtime
```

### Garantias do Loop

- **Idempotência:** correr `update-router.js` duas vezes produz um `classify.js` byte-idêntico
- **Testado:** o teste `backtest.test.js` verifica a idempotência automaticamente
- **Guardrail dual:** HIGH_RISK filtrado tanto no runtime como no upstream
- **Human-readable:** `backtest-latest.log` tem relatório para auditoria manual

---

## 10. Telemetria e Savings Tracker

### decisions.log (JSONL)

Cada classificação appenda uma linha:
```json
{
  "ts": "2026-04-07T10:20:53.944Z",
  "event": "classified",
  "prompt_len": 99,
  "prompt_preview": "primeiros ~80 chars do prompt",
  "tier": "T0",
  "task_category": "trivial_local",
  "recommended_backend": "ollama",
  "recommended_model": "qwen2.5:3b",
  "confidence": 0.8,
  "escalation_rule": "none"
}
```

### execution.log (TSV)

Cada Bash/Agent call appenda uma linha via `exec-logger.js`:
```
2026-04-11T10:00:00Z  session_id  qwen3:30b  local-summarizer  agent:local-summarizer  resolve_ms  auto
```

### savings-tracker.js HTTP :7821

| Endpoint | Retorna |
|---|---|
| `/health` | `{ok: true, port, pid}` |
| `/metrics` | JSON completo com savings, by_tier, by_model, cost_by_tier |
| `/summary` | Texto human-readable |
| `/last` | Última entrada do decisions.log |
| `/gpu` | Estado do GPU (via gpu-probe.js) |

**Design:** single-instance (exit silencioso em EADDRINUSE), best-effort (nunca crasha a statusline), bound a 127.0.0.1 apenas.

### Cálculo de Savings

```
naive_cost = prompts × custo médio Opus
real_cost  = Σ (custo do tier efectivo × prompts nesse tier)
saved      = naive_cost - real_cost
saved_pct  = (saved / naive_cost) × 100
```

---

## 11. Statusline — Visibilidade em Tempo Real

```
⬆ /gsd-update │ Opus 4.6 │ cloude-home █░░░░░ 14% │ 💰 $1.73 (77%) │ Ollama:62% Sonnet:18% Opus:20%
```

**Segmentos (da esquerda para direita):**

1. **GSD update hint** — se há nova versão do toolkit
2. **Modelo** — modelo actual do Claude Code
3. **Tarefa actual** — retirada da to-do list se activa
4. **Directório** — `basename(pwd)`
5. **Context bar** — barra de 10 segmentos (considera 16.5% de buffer de auto-compact)
6. **Savings** — `saved` USD + `saved_pct` do tracker (timeout 500ms, falha silenciosamente)
7. **Breakdown de modelos** — `pct_by_model` do tracker

**A statusline nunca bloqueia** — timeout 400ms, qualquer erro retorna segmento vazio.

### frugal-turn-header.js (novo — Sprint 3)

Header visual antes de cada turn:
```
[frugal] T0 → local-summarizer | qwen3:30b | confidence: 0.92 | 🟢 delegating
⚠ session 100% Opus — delegation enforcement active
```

Emitido pelo hook antes do turn. Permite ao user ver a recomendação ANTES que o turn execute.

---

## 12. frugal-hub — Backend Cloudflare

### Arquitectura do Worker

```
mooter-hub.frugal-hub.workers.dev
│
├── worker.js (entry point)
│   ├── POST /api/delta     → handleDelta (routes/delta.js)
│   ├── GET  /api/stats     → handleStats (routes/stats.js)
│   ├── GET  /api/models    → handleModels (routes/models.js)
│   ├── GET  /api/version   → handleVersion (routes/version.js)
│   ├── POST /submit-events → handleSubmitEvents (routes/events.js) [Sprint 3]
│   ├── GET  /aggregate-stats → handleAggregateStats (routes/events.js) [Sprint 3]
│   └── GET  /health        → 200 ok
│
├── jobs/
│   ├── aggregate.js  — cron hourly: agrega deltas em stats
│   ├── generate.js   — cron daily: gera router-tuning.json novo
│   └── notify.js     — cron weekly: notifica Paulo + prune dados antigos
│
└── lib/
    ├── anomaly.js    — detecção de anomalias nos deltas
    ├── model-detect.js — detecta modelos a partir de padrões
    └── trust.js      — trust score por utilizador (anti-spam)
```

### Persistência

| Recurso | Tipo | ID | Propósito |
|---|---|---|---|
| D1 (SQLite) | Database serverless | `320b55f6-9444-4deb-bcd5-e8227739546e` | `routing_deltas` + `frugal_events` tables |
| R2 | Object storage | `frugal-hub-storage` | `router-tuning-latest.json`, `model-catalog-latest.json` |

### Schema D1

```sql
-- routing_deltas (anonimizados da comunidade)
id, hw_tier, tier, confidence, cascade_path, latency_ms,
trust_score, created_at, expires_at

-- frugal_events (Sprint 3 — telemetria estruturada)
id, event_type, tier, model, confidence, prompt_len,
session_hash, hw_tier, frugal_version, created_at
```

### Secrets do Worker

| Secret | Estado |
|---|---|
| `FRUGAL_SUBMIT_TOKEN` | ✅ Configurado (2026-04-11) — auth para POST /submit-events |
| `PAULO_WEBHOOK_URL` | ⚠️ Placeholder — substituir por webhook real |
| `PAULO_EMAIL` | ✅ paulo.loureiro.shp@gmail.com |

### GitHub Actions CI

| Workflow | Trigger | O que faz |
|---|---|---|
| `test.yml` | Push/PR em main | gold-labels, event-builder, latency tests |
| `deploy-hub.yml` | Push em hub/ | Auto-deploy do Worker via wrangler (usa CF_API_TOKEN) |

---

## 13. Landing + Auth — Supabase + Vercel

### Landing (Next.js 15, Vercel)

**URL:** https://landing-five-azure-16.vercel.app

| Secção | ID | O que faz |
|---|---|---|
| Hero | `#hero` | Headline + live counters (fetch /api/stats) + install CTA |
| Demo | `#demo` | 3 prompts universais com routing animado |
| Flywheel | `#flywheel` | 5-step flywheel + privacy proof + freedom banner |
| HowItWorks | `#how` | Diagrama técnico 3 camadas |
| Comparison | `#comparison` | Tabela frugal vs concorrentes |
| Pricing | `#pricing` | Free / Pro / Team |
| Access | `#access` | Form de waitlist (email → Supabase) |

**Tema:** Dark (#080808 background, #00ff88 accent)

### Supabase (Auth + DB)

**URL:** https://eymtobwinevywmmlmxqa.supabase.co
**Região:** sa-east-1 (São Paulo)

| Tabela | Schema | RLS |
|---|---|---|
| `waitlist` | id, email, url, savings_est, created_at | ⚠️ anon INSERT pendente |
| `profiles` | id, email, os_type, github_username, github_primary_language, github_language_distribution, github_public_repos_count, github_connected_at, experience_level, frugal_config, frugal_version, install_completed, first_prompt_at, last_active_at | ✅ próprio user apenas |
| `usage_sessions` | id, user_id, session_date, prompts_total, t0-t3_count, savings_usd, created_at | ✅ próprio user apenas |

**Auth activa:**
- Magic Link (email) ✅
- GitHub OAuth ⏳ (pendente criação de OAuth App)

---

## 14. Dashboard Local — v0.6.0

**Em construção (Sprint 4).** Next.js bound a `127.0.0.1:7820`.

| Página | URL | O que mostra |
|---|---|---|
| Overview | `/` | 4 cards (savings, tier breakdown, top categories, latency) + timeline + últimas 10 decisões |
| Misroutes | `/misroutes` | Decisões com confidence < 0.65, filtros por tier/categoria |
| Tuning | `/tuning` | router-tuning.json preview + botão "Retrain now" + diff |
| Community | `/community` | Stats do hub `/aggregate-stats` |

**Sucesso:** Paulo consegue debugar qualquer misroute em < 30 segundos sem grep.

---

## 15. Skills — Slash Commands

Skills são pastas em `~/.claude/skills/`. Cada uma tem um `SKILL.md` com instruções.

| Skill | Trigger | O que faz |
|---|---|---|
| `frugal-status` | `/frugal-status` | Health check: hook, Ollama, hub, últimas decisões |
| `frugal-savings` | `/frugal-savings` | Report económico: savings + projecção anual |
| `frugal-route` | `/frugal-route <task>` | Classifica uma tarefa antes de executar |
| `frugal-summary` | `/frugal-summary` | O que o router decidiu nesta sessão |
| `frugal-update` | `/frugal-update` | Pull do GitHub + sync classifier |
| `frugal-beast` | `/frugal-beast` | Beast Mode: força T3 (Opus) em tudo |
| `frugal-zen` | `/frugal-zen` | Zen Mode: cap em T1 (Haiku/Ollama) |
| `frugal-auto` | `/frugal-auto` | Volta ao routing inteligente automático |
| `frugal-hello` | `/frugal-hello` | Onboarding interactivo para novos utilizadores |
| `frugal-doctor` | `/frugal-doctor` | Diagnóstico completo + --fix mode |
| `frugal-dashboard` | `/frugal-dashboard` | Abre o dashboard local (Sprint 4) |
| `model-router` | automático | Skill de routing interno |

### Mode System (frugal-mode.js)

| Mode | Efeito | Persistência |
|---|---|---|
| Beast | Força T3 (Opus) em tudo | `.frugal-mode.json` com `{mode: "beast"}` |
| Zen | Cap em T1, nunca vai acima | `.frugal-mode.json` com `{mode: "zen"}` |
| Auto | Router decide (default) | Apaga `.frugal-mode.json` |

**Excepção de segurança:** tarefas T3-gate (push/deploy/merge) nunca são afectadas pelo Zen Mode.

---

## 16. Instalação e Runtime Local

### Ficheiros instalados por `install.sh`

```
~/.claude/
├── CLAUDE.md                       ← doutrina mediadora (lida cada sessão)
├── settings.json                   ← hooks registados:
│   ├── UserPromptSubmit → inject_context.js
│   ├── PostToolUse → exec-logger.js + PostToolUse.js
│   └── Stop → gsd-turn-end.js
├── tools/router/
│   ├── classify.js                 ← classifier principal
│   ├── inject_context.js           ← hook UserPromptSubmit
│   ├── patterns.js                 ← SSOT das regexes (HIGH/MED/LOW/TRIVIAL)
│   ├── savings-tracker.js          ← HTTP :7821
│   ├── backtest.js                 ← auto-learning analyser
│   ├── update-router.js            ← patcher idempotente
│   ├── event-builder.js            ← privacy contract enforcer
│   ├── feedback-collector.js       ← CLI de ratings
│   ├── hub-submit-events.js        ← cliente hub (Sprint 3)
│   ├── hub-push.js / hub-pull.js   ← push/pull deltas comunitários
│   ├── frugal-mode.js              ← Beast/Zen/Auto CLI
│   ├── frugal-doctor.js            ← diagnóstico cross-platform
│   ├── gpu-probe.js                ← probe de hardware
│   ├── gsd-statusline.js           ← statusline
│   ├── frugal-turn-header.js       ← header visual por turn
│   ├── decisions.log               ← JSONL, uma linha por classificação
│   ├── execution.log               ← TSV, modelo efectivo por Bash/Agent call
│   └── gold-labels.json            ← 62 prompts curados para validação offline
├── hooks/
│   ├── gsd-statusline.js           ← statusline hook
│   ├── exec-logger.js              ← PostToolUse hook
│   └── gsd-turn-end.js             ← Stop hook
├── agents/
│   ├── model-architect.md          ← T3 Opus subagent
│   ├── model-reasoner.md           ← T2 Sonnet subagent
│   ├── cheap-triage.md             ← T1 Haiku subagent
│   ├── local-summarizer.md         ← T0 Ollama subagent
│   ├── local-transformer.md        ← T0 Ollama subagent
│   └── final-reviewer.md           ← gate pré-merge (Opus)
└── skills/
    └── frugal-{status,savings,route,summary,update,beast,zen,auto,hello,doctor}/
```

### Scheduled Tasks (Windows)

| Task | Schedule | Comando |
|---|---|---|
| `FrugalRouterBacktest` | 02:00 diário | `%USERPROFILE%\.claude\tools\router\run-backtest.cmd` |

### Serviços locais em runtime

| Serviço | Porta | Propósito |
|---|---|---|
| Ollama | :11434 | Modelos T0 locais |
| savings-tracker.js | :7821 | Métricas de savings |
| Dashboard Next.js | :7820 | UI de debugging (Sprint 4) |

---

## 17. Infraestrutura de Terceiros

| Serviço | Plano | Account | Propósito |
|---|---|---|---|
| **Cloudflare** | Free | paulo.loureiro.shp@gmail.com | Worker + D1 + R2 |
| **Supabase** | Free | paulo.loureiro.shp@gmail.com | Auth + DB |
| **Vercel** | Free (Hobby) | pauloloureiroshp-ship-its-projects | Landing deploy |
| **GitHub** | Free | pauloloureiroshp-ship-it | Repo + CI + OAuth App |
| **Anthropic API** | Pay-as-go | paulo.loureiro.shp@gmail.com | Haiku (T1) + Sonnet/Opus (subagents) |
| **Ollama** | Local | — | T0 (zero custo) |
| **Notion** | Free | paulo.loureiro.shp@gmail.com | Documentação + logs de sessão |

### Repositórios

| Repo | Localização | Visibilidade |
|---|---|---|
| `frugal` (público MIT) | `C:\Users\Paulo Loureiro\frugal\` + GitHub | Privado (MIT — será público em v1.0) |
| `frugal-core` (proprietário) | A criar | Nunca público — dataset + model |
| `frugal-data` | A criar (1000+ users) | Nunca público — raw deltas |

---

## 18. Arquitectura de Dados e Motor Proprietário

### As 4 Camadas de Dados

```
Nível 1 — Público (MIT)
  classify.js, inject_context.js, install.sh
  O código que qualquer um pode copiar.
  NÃO é o diferenciador.

Nível 2 — Comunidade (hub, agregado, anónimo)
  tier + confidence + prompt_len + hw_tier + cascade_path
  Melhora o classify.js automaticamente.
  Parcialmente público (stats na landing).

Nível 3 — Perfil (privado por utilizador, encriptado)
  hardware, subscriptions, stack, GitHub repos metadata,
  routing history, savings history, custom patterns
  Nunca sai da conta do utilizador.

Nível 4 — Motor (privado, repo frugal-core)
  O modelo treinado nos dados do Nível 2.
  O dataset com labels de qualidade.
  As decisões de arquitectura do algoritmo.
  Nunca público. É o segredo da Coca-Cola.
```

### Evolução do Motor de Routing

| Fase | Quando | Técnica | Latência | Dataset |
|---|---|---|---|---|
| **1 (actual)** | v0.x | Regex puro, 102 patterns, 11 passes | < 50 ms | 1,437 prompts |
| **2** | v1.5 (5k+ prompts) | Regex + TF-IDF + tabela estatística da comunidade | ~ 0 ms (lookup local) | 5,000+ |
| **3** | v2.0 (50k+ prompts) | Modelo tiny ONNX (1-3M params) treinado em corpus | < 10 ms (CPU) | 50,000+ |
| **4** | v3.0 | Modelo base + fine-tuning por cohort de utilizador | < 10 ms | 1M+ |

### O Activo Competitivo Real

O código é MIT. Qualquer um cria um clone em 2 semanas.

O que protege o frugal:
1. **O dataset** — 1,437 prompts hoje, 1,000,000 amanhã. Não replicável.
2. **Os perfis** — conhecimento acumulado de cada utilizador. Não replicável.
3. **A comunidade** — confiança construída ao longo do tempo.
4. **A reputação de privacidade** — "nunca vimos o teu código" desde o dia 1.

---

## 19. Falhas e Degradação Graceful

| Falha | O que acontece | Porque é seguro |
|---|---|---|
| `classify.js` lança excepção | `inject_context.js` retorna hint vazio | Claude Code usa comportamento default |
| `classify.js` > 500ms | Hook aborta, emite hint vazio | Sessão continua sem hint — igual a frugal não instalado |
| `decisions.log` ilegível | Tracker retorna métricas vazias | Statusline omite segmento de savings |
| Tracker down | Statusline omite savings + breakdown | Sem impacto no routing |
| `router-tuning.json` corrompido | `update-router.js` sai com erro, classify.js mantém bloco TUNED anterior | Humano vê erro no próximo `/update-router` |
| Ollama offline | T0 subagent falha, Claude Code responde inline | Sem escalamento de custo — ainda T0 |
| Sem Anthropic API key | T1 degrada automaticamente para T0 | Documentado no output do classifier |
| Budget > 95% | Hard cap em T0 para todos os tiers pagos | Previne gasto excessivo |
| TUNED block com regex inválida | classify.js lança no require() | Backup `classify.js.bak` é um `cp` de distância |

**Principio:** cada modo de falha cai para comportamento default ou tier mais barato — nunca para cima.

---

## 20. Performance Budget

| Operação | Budget | Típico | Worst case |
|---|---|---|---|
| `classify.js` (cold) | < 50 ms | 20-45 ms | 90 ms (primeira run, require cache) |
| `classify.js` (cached) | < 5 ms | 2 ms | 10 ms |
| `inject_context.js` overhead | < 5 ms | 2 ms | 20 ms |
| Savings tracker `/metrics` | < 50 ms | 15 ms | 400 ms (hard timeout) |
| Statusline total | < 100 ms | 35 ms | 500 ms (timeout Claude Code) |
| `backtest.js` (60 prompts) | < 200 ms | 80 ms | 400 ms |
| `update-router.js` | < 100 ms | 30 ms | 150 ms |
| Suite de testes completa | < 500 ms | 143 ms | 800 ms |

---

## 21. Segurança e Privacidade

### O que NUNCA sai da máquina

- O conteúdo dos prompts (apenas `prompt_preview` com ~80 chars em decisions.log, local)
- Código-fonte de qualquer projecto
- API keys ou secrets
- decisions.log (nunca enviado para o hub — só os deltas anonimizados vão)

### O que vai para o hub (anonimizado)

- `tier` + `confidence` + `prompt_len` + `hw_tier` + `cascade_path`
- **Sem prompt_preview. Sem código. Sem identidade.**

### Controlos técnicos

- savings-tracker.js bound a `127.0.0.1:7821` — sem acesso LAN
- Nenhuma API key no repo (`.env*` em `.gitignore`)
- `.gitignore` exclui: `decisions.log`, `router-tuning.json`, `*.bak`, `backtest-latest.log`, `.env*`
- `FRUGAL_TELEMETRY=off` em `.env` desactiva toda a telemetria
- `event-builder.js` enforce o contrato de privacidade antes de qualquer export

### Para desactivar telemetria completamente

```bash
echo "FRUGAL_TELEMETRY=off" >> ~/.claude/tools/router/.env
```

---

## 22. Roadmap Técnico

### Completo ✅

| Versão | Nome | Data |
|---|---|---|
| v0.1.0 | Foundation — classifier + hook | 2026-04-06 |
| v0.2.0 | Doctrine — mediator doctrine + install | 2026-04-06 |
| v0.3.0 | Real-world validation — 1,437 prompts, 90% savings | 2026-04-06 |
| v0.4.0 | Budget awareness — statusline + guardrail orçamental | 2026-04-07 |
| v0.5.0 | Auto-learning loop — backtest + update-router | 2026-04-07 |
| v0.7.0 | SSOT patterns — patterns.js | 2026-04-09 |
| v0.9.0 | Statusline v3 + GPU + federated foundation | 2026-04-09 |
| v0.9.2 | Community hub + 8 slash commands | 2026-04-09 |
| v0.9.3 | Beast/Zen/Auto modes + pattern fixes | 2026-04-10 |
| v0.9.4 | Security audit + landing v9 + GitHub OAuth + friends beta | 2026-04-10 |
| v0.9.5 | frugal-doctor + install.sh v2 + classify.js v0.10 | 2026-04-11 |
| v0.9.6 | Feedback loop (Sprint 2) + Hub Event Ingestion (Sprint 3) | 2026-04-11 |

### Em construção 🔨

| Versão | Nome | O que falta |
|---|---|---|
| v0.6.0 | Web Dashboard | D1-D7 Sprint 4 — Next.js UI pages |
| Sprint 4 B1 | Supabase RLS anon INSERT | Fazer no browser |
| Sprint 4 B2 | GitHub OAuth App | Criar no GitHub + ligar Supabase |

### Planeado 🟡

| Versão | Nome | Quando |
|---|---|---|
| v0.8.0 | Team shared config | Após Friends Beta |
| v1.0 | Public launch | Q2 2026 |
| v1.5 | Perfil via GitHub + config personalizada | Q2 2026 |
| v2.0 | Sistema operativo completo + success fee | Q3 2026 |
| v3.0 | Motor proprietário + API pública | Q4 2026 |

### Explicitamente Rejeitado ⏸

| O que | Porquê |
|---|---|
| Proxy mode | Viola Princípio #1. Usa LiteLLM se precisas. |
| Classifier LLM em vez de regex | Latência 200ms+ vs 50ms. Reconsiderar em v1.0 com 10k+ prompts. |
| Modelos não-Anthropic como T3 | Precisa de tabela de decisão com dados reais de beta. Deferred v0.8. |

---

## 23. Estratégia Competitiva

### Comparação com alternativas

| | frugal | LiteLLM | OpenRouter | Helicone | Continue.dev |
|---|---|---|---|---|---|
| **Modelo de integração** | Hook Claude Code | Proxy | Proxy | Proxy | Extensão VS Code |
| **Latência de routing** | < 50 ms (local) | 100-300 ms | 100-300 ms | N/A (observ.) | N/A |
| **Zero LLM cost na clasificação** | ✅ | ❌ | ❌ | ❌ | N/A |
| **Privacy dos prompts** | ✅ (local) | ❌ (passa pelo proxy) | ❌ | ❌ | ✅ |
| **Auto-learning** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Funciona sem internet** | ✅ (Ollama) | ❌ | ❌ | N/A | Parcial |
| **Savings validados** | ~90% | Variável | Variável | N/A | N/A |
| **Instalação** | 1 linha bash/ps1 | npm + config | API key | SDK | VS Code marketplace |

### O Fosso Competitivo

**Hoje:** 102 patterns + corpus de 1,437 prompts reais → qualquer developer replica o código em 2 horas. O que não replica: os dados.

**Em 12 meses:** modelo de routing treinado em 100,000+ decisões reais com labels de qualidade.

**Em 24 meses:** perfis de utilizador cruzando hardware + subscriptions + stack + padrões de prompting. Nenhum concorrente tem este acesso ao nível do prompt.

---

## 24. Monetização

### Fase 1 — Free (actual)

Tudo gratuito. Foco em crescimento e recolha de dados.

### Fase 2 — Success Fee (v2.0)

- Free tier: acesso completo, sem limites
- Pro tier: **20% das savings geradas pelo frugal**
  - Exemplo: frugal poupou $100 este mês → utilizador paga $20
  - Se frugal não poupar → utilizador não paga
  - Cap: $50/mês

### Fase 3 — B2B/Enterprise (v3.0)

- Hub privado (dados da empresa não entram na pool pública)
- Modelo customizado para a stack da empresa
- SSO, audit logs, SLA
- Preço: $500-2000/mês por equipa

### North Star Metrics

| Metric | Meta v1.0 | Meta v2.0 |
|---|---|---|
| Savings totais da comunidade | $10,000 | $1,000,000 |
| Activation (chegam ao /frugal-status) | 60% | 80% |
| T0% médio da comunidade | 60% | 75% |
| Retenção 30 dias | 40% | 60% |

---

## 25. Glossário

| Termo | Definição |
|---|---|
| **Tier** | Categoria de routing (T0=local, T1=haiku, T2=sonnet, T3=opus) |
| **router-hint** | Bloco XML injectado no contexto da sessão pelo hook |
| **Doctrine** | O CLAUDE.md pessoal — as regras que a sessão lê e honra |
| **Subagent** | Ficheiro Markdown que define um agente especializado (spawn via Agent tool) |
| **decisions.log** | JSONL local com uma linha por classificação — base do auto-learning |
| **execution.log** | TSV local com modelo efectivo por Bash/Agent call |
| **TUNED block** | Bloco auto-gerado em classify.js com padrões aprendidos pelo backtest |
| **dual-enforce** | Guardrail aplicado tanto no runtime como upstream no backtest |
| **Beast Mode** | Modo que força T3 (Opus) em todos os prompts |
| **Zen Mode** | Modo que cap em T1 (Haiku/Ollama), nunca paga mais |
| **Auto Mode** | Modo default — router decide |
| **T3-gate** | Tarefas que são sempre T3 independente do mode (push/deploy/merge) |
| **frugal-hub** | O backend Cloudflare Worker — recebe deltas anónimos da comunidade |
| **delta** | Snapshot anonimizado de uma decisão de routing para enviar ao hub |
| **cascade** | Prompt que invoca um subagent dentro de outro subagent |
| **gold-labels** | 62 prompts curados com tier correcto para validação offline |
| **vibe coder** | Developer que usa ferramentas de IA para construir sem saber tudo |
| **SSOT** | Single Source of Truth — um só lugar onde uma coisa é definida |
| **hw_tier** | Tier de hardware detectado: gpu_high/gpu_mid/gpu_low/cpu |

---

*Documento gerado em 2026-04-11. Para actualizar, editar directamente ou pedir ao Claude em sessão Cowork.*
*Fonte primária: ARCHITECTURE.md, SYNC.md, VISION_V2.md, INFRA.md, ARCHITECTURE_PRIVATE.md, ROADMAP.md, tools/router/classify.js, hub/worker.js*
