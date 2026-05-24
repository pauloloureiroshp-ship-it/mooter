# MOOTER — Routing Strategy V2
**Análise estratégica · 2026-05-07 · 19 dias até gate (2026-05-26)**
**Foco**: skills ecosystem · language-aware routing · features que impressionam Anthropic · autonomous dev loops

> Continuação de `MOOTER_ROUTING_STRATEGY_2026-05-07.md`. Este documento responde às 4 perguntas adicionais do Paulo e adiciona a stack autonomous dev.

---

## 0. TL;DR — 5 takeaways operacionais

1. 🔥 **Janela 12 dias**: **Code with Claude London (2026-05-19)** é o evento certo para entrar no radar Anthropic. Submeter demo e PR ao `anthropics/claude-cookbooks` (42k stars) **antes**. Não é deadline mole.

2. 🔥 **Anthropic separou first-party de third-party em 2026-04-04**. Subscriptions Pro/Max deixaram de cobrir Cursor, Cline, Aider. Claude Code é first-party, isento. Tradução: **o Mooter não pode ser "proxy que substitui Claude Code". Tem que coabitar como plugin/skill/MCP**. Esta é uma fronteira-vermelha estratégica.

3. 🔥 **Killer language feature**: "Codebase-aware language harmonisation" — auto-detectar língua dominante da codebase (comments, docstrings) e routear coerente. Cursor/Continue/Copilot forçam EN mesmo em codebases PT — atrito real para devs BR/PT. **AMALIA (PT-PT) e Sabiá-3 (PT-BR) são publicamente disponíveis** e nenhum router os trata como cidadãos de primeira.

4. 🔥 **Autonomous dev loop SIM, mas só dentro de container**. Trail of Bits devcontainer + Ralph Loop + 2-3 worktrees + HITL para merge. Setup ~1.5 dias; ganho realista 2-3x em tarefas mecânicas, 0x em arquitectura. Rate limits Max **não permitem 24/7 puro Opus** — usa o próprio Mooter para auto-rotear o teu workflow.

5. 🔥 **Triple-stack play**: publica Mooter como **(skill + plugin + MCP server)** simultaneamente. É o sinal mais forte que podes mandar à Anthropic — demonstra composição correcta de toda a stack deles.

---

## 1. Skills ecosystem Anthropic — onde o Mooter encaixa

### 1.1 Estado do ecossistema (Maio 2026)

| Camada | Maturidade | Repos canónicos | Volume |
|---|---|---|---|
| **Skills** (formato `SKILL.md`) | Estável | `github.com/anthropics/skills` (~17 oficiais) | 4 200+ skills comunidade |
| **Agent SDK** (Python + TS) | Estável | `claude-agent-sdk-python`, `claude-agent-sdk-typescript` | Hooks: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart/End`, `UserPromptSubmit` |
| **Plugins Claude Code** | Lançado oficial 2025-10-09 | `anthropics/claude-plugins-official` (~101) | 9 000+ plugins comunidade |
| **MCP registry** | Production | `registry.modelcontextprotocol.io` (Anthropic doou à Agentic AI Foundation) | 10 000+ servers; 770+ alta-qualidade |
| **Cowork plugins** | Beta | `anthropics/knowledge-work-plugins` (11 OSS) | sales/legal/finance |

### 1.2 ⚠️ Fronteira-vermelha 2026-04-04

Anthropic alterou billing: **Pro/Max só cobre first-party**. Cursor/Cline/Aider/Roo Code/OpenClaw deixaram de funcionar com sub. Claude Code é isento.

| Implicação para Mooter | Acção |
|---|---|
| Não posicionar como "use Claude no Cursor" | ❌ |
| Não fazer proxy que esconda Claude Code do user | ❌ |
| Coabitar com Claude Code como plugin/skill/MCP | ✅ |
| Posicionar como "amplificador do Claude Code", não substituto | ✅ |

### 1.3 Skills/SDKs para REFERENCIAR

| Repo | O que copiar | O que evitar |
|---|---|---|
| `musistudio/claude-code-router` | Separação cli/server/shared/ui, conceito de "transformer", config-first JSON | Abordagem proxy que requer substituir Claude Code |
| `ryoppippi/ccusage` | Parser JSONL local + MCP server embutido, "5-hour billing window tracking" | — (é exactamente o vector que Mooter pode estender) |
| Issues `anthropics/claude-code#19269` e `#30453` | **Sinal ouro**: pedido oficial de model field em skill frontmatter para per-phase routing | Anthropic ainda **não** tem solução nativa — janela aberta |
| `anthropics/skills/skill-creator` | Meta-skill, estrutura modelo | — |
| Skill `AI Model Selection & Routing` (mcpmarket.com) | Template pre-existente | Cobertura superficial |

### 1.4 Skills/SDKs que Mooter deve INTEGRAR

**MCP servers a consumir:**

| MCP | Para quê |
|---|---|
| `ccusage` MCP | Fonte de verdade para token usage real |
| `traceloop/opentelemetry-mcp-server` | Exportação OTEL para Jaeger/Tempo (credibilidade enterprise) |
| `mcp-checkup` | Feedback loop — Mooter sugere desligar MCPs desnecessários |

**Hooks Claude Code que Mooter deve usar:**

| Hook | Uso |
|---|---|
| `UserPromptSubmit` | Classifica + injecta `<router-hint>` (já fazes em Frugal) |
| `PreToolUse` | Bloqueia spawn em Opus quando T0/T1 |
| `PostToolUse` | Regista tokens reais por turn → feedback ao classifier |
| `SessionStart`/`SessionEnd` | Snapshot poupança vs baseline all-Opus |

### 1.5 Skills/SDKs que Mooter deve CRIAR (triple-stack play)

🔥 **Esta é a jogada.** Publica Mooter simultaneamente como:

| Camada | Nome | O que faz | Para quem |
|---|---|---|---|
| **Plugin** Claude Code | `mooter` | Bundle: slash commands (`/mooter-route`, `/mooter-stats`, `/mooter-explain`) + subagents + hooks + statusline custom + MCP server | Devs Claude Code (~milhões) |
| **Skill** portable | `mooter-router` | Versão sem hooks, só decisão. Para Cowork e Agent SDK directo | Devs Agent SDK |
| **MCP server** | `@mooter/router` em `registry.modelcontextprotocol.io` | Tools: `classify_prompt`, `get_savings`, `recommend_subagent`, `audit_session` | Qualquer cliente MCP (Claude Code + outros) |
| **Skill audit** | `mooter-audit` | Pós-sessão: "estavas em 100% Opus, 6 calls eram T0 — terias poupado $X" | Devs preocupados com waste |
| **Hook standalone** | em `awesome-claude-code-hooks` | Para users que não querem plugin todo | Power users |

### 1.6 Sinais sobre direcção Anthropic

| Sinal | Implicação |
|---|---|
| Issues `#19269`/`#30453` abertas | Anthropic está a **aceitar feedback** nesta área. Mooter deve participar |
| Anthropic ainda não tem solução nativa per-skill model routing | Janela aberta |
| Anthropic moveu-se para per-token billing em Abr 2026 | Routing inteligente alinha com pricing sustentável |
| First-party preferência | Mooter coabita (não substitui) → fica do lado certo |
| Ticket-routing case-study oficial usa Haiku | Validação de tier-based routing como pattern oficial |

---

## 2. Language-aware routing — não é mito, ganho heterogéneo

### 2.1 Quem entende melhor cada língua (Maio 2026)

| Língua | Top 1 | Top 2 | Top 3 | Notas-chave |
|---|---|---|---|---|
| **EN** | GPT-5.5 / Opus 4.7 (empate) | Gemini 3.1 Pro | DeepSeek V4 Pro | Baseline; todos frontiers ≥90% MMLU |
| **PT-BR** | Gemini 2.5/3.1 Pro | Claude Opus 4.7 | **Sabiá-3** (especialista) | Gemini lidera Intento 2025 + WMT25 PT-BR; Sabiá-2 já batia GPT-4 em 23/64 exames brasileiros |
| **PT-PT** | **AMALIA** (especialista, NOVA+IST+Coimbra+Porto+Minho, PROPOR 2026) | Gemini 3.1 Pro | Claude Opus 4.7 | Modelos generalistas confundem PT-PT com PT-BR |
| **ZH** | Qwen 3.6-Max / Kimi K2.6 | DeepSeek V4 Pro | Gemini 3.1 Pro | Qwen e Kimi treinados ZH-heavy |
| **ES** | Gemini 3.1 Pro | Opus 4.7 | GPT-5.5 | Alta-recurso |

**Multilingual Q&A geral 2026**: Opus 4.7 = **91.5%**, GPT-5.5 = **83.2%**, Gemini 3.1 Pro lidera no aggregate.

### 2.2 Efeito "thinking language"

⚠️ Paper [Do Multilingual LLMs Think In English?](https://arxiv.org/html/2502.15603v1) (arxiv 2502.15603) confirma que LLMs ocidentais (Llama, GPT, Claude) decidem num espaço **mais próximo do inglês**. Anthropic ([Tracing Thoughts](https://www.anthropic.com/research/tracing-thoughts-language-model)) mostra "language of thought" universal — mas o vector enviesa para EN em modelos EN-heavy.

### 2.3 Pre-translate vale a pena? Heurística

| Tarefa | Frontier (Claude/GPT/Gemini) | Local (Qwen/Llama/Mistral) |
|---|---|---|
| Extractive (QA, NER) | ❌ Não traduzas | ❌ Não traduzas |
| Generative (summary, reasoning) | 🟡 Marginal (<3%) PT-BR/ES | ✅ +5-15% gain |
| Code generation | 🟡 Gap 3-5% pass@1 PT vs EN | ⚠️ Qwen3 cai com prompt PT |
| Cultural / native | ❌ Não traduzas (perde nuance) | Use AMALIA/Sabiá-3 |

### 2.4 Cost penalty real

| Língua | Token overhead vs EN |
|---|---|
| EN | 1.0x (baseline) |
| PT | 1.3-1.5x (~30-50% mais tokens) |
| ZH | 2.0x (~100% mais tokens) |

**Speakers de não-EN são overcharged e recebem qualidade pior** (Petrov et al. 2023, replicado 2025). Isto é gap de mercado.

### 2.5 Regras concretas para Mooter language-aware routing

```
prompt_lang = fasttext.detect(prompt)  // 1ms, 176 línguas
codebase_lang = detect_from_comments(context_files)  // se houver

if prompt_lang in ["pt-PT", "pt-BR"]:
    if task == code_generation:
        prefer: Claude Opus 4.7 / Gemini 3.1 Pro
        avoid: Qwen3, modelos ZH-heavy
        comment_lang := match(codebase_lang || prompt_lang)
    elif task == reasoning_heavy:
        consider: pre-translate to EN (ganho 2-5% em CoT) — só em local
    elif task == cultural/legal/native:
        prefer: AMALIA (pt-PT) / Sabiá-3 (pt-BR)

if prompt_lang == "zh":
    prefer: Qwen 3.6-Max, Kimi K2.6, DeepSeek V4
    avoid: pre-translate (Qwen optimiza ZH; perde nuance)

if prompt_lang == "en":
    routing standard (T0/T1/T2/T3)

if prompt_mixed (>20% non-EN tokens em prompt EN):
    flag: warn user — code-mixed degrada pass@1 (CodeMixBench arxiv 2505.05063)
```

### 2.6 🔥 Killer feature: Codebase-Aware Language Harmonisation

**O que é:**
1. Auto-detectar língua dominante da codebase (comments, docstrings, identifiers non-EN)
2. Routear para o modelo que melhor performa nessa língua para o tipo de task
3. Forçar comments/docstrings gerados a fazer **match com a codebase** (não impor EN como Cursor/Copilot fazem)
4. Manter `language profile per-project` em `.mooter/lang.json`

**Por que ninguém faz:**
- Cursor com prompt PT ainda gera docstrings EN por default
- Continue, Aider, Copilot assumem EN-first
- OpenRouter, LiteLLM, Portkey ignoram língua

**Por que faz sentido para o Paulo:**
- User-base inicial BR/PT — sentem o atrito real
- AMALIA + Sabiá-3 são **publicamente disponíveis e baratos**
- Mooter pode ser o **primeiro router que trata PT-PT e PT-BR como cidadãos de primeira** (não fallback genérico)
- Marketing: "o primeiro router que fala como tu" — narrativa forte na comunidade tech BR/PT

**Implementação MVP**: FastText detection (1ms) + heuristic table 12 regras + flag `--lang-aware` opcional. ~200 LoC, zero deps pesadas.

---

## 3. 5 Features que impressionam a Anthropic

Cada feature mapeia a uma Anthropic priority documentada. Não inventei alinhamento — está em research/RSP/Economic Index oficiais.

### 3.1 Routing Decision Transparency Report (RDTR) — interpretabilidade aplicada

| Aspecto | Detalhe |
|---|---|
| **Descrição** | Cada decisão de routing emite JSON com features usadas (tier estimado, confidence, signals: keywords, file count, blast radius), análogo aos "circuit traces" da interpretability team. UI mostra ao user "porquê este modelo" |
| **Alinhamento Anthropic** | Replica vocabulário oficial de [Tracing Thoughts](https://www.anthropic.com/research/tracing-thoughts-language-model). Combate "black box" criticism de Abr 2026 (Fortune backlash sobre transparência) |
| **Effort** | Médio (1-2 semanas) — `classify.js` já existe, falta emit + UI |
| **Beneficiários** | Devs (debug router), researchers (datasets routing), Anthropic (showcase de aplicação prática) |

### 3.2 MCP Server `@mooter/router` + Server Card pública

| Aspecto | Detalhe |
|---|---|
| **Descrição** | Mooter como MCP server segundo spec 2026 (stateless HTTP, Server Card em `.well-known/mcp.json`, Tasks primitive). Outros agents invocam `mooter.classify(prompt) → tier` |
| **Alinhamento Anthropic** | Anthropic explicitamente quer ver MCP servers maduros production-ready (MCP Roadmap 2026: Stateless Transport, Server Cards, Tasks). **Primeiro MCP "router-as-a-service" público** é nicho ainda vazio |
| **Effort** | Médio-alto (2-3 semanas) — implica adoptar nova spec stateless transport |
| **Beneficiários** | Ecossistema MCP, qualquer cliente Claude Code, Anthropic (validação do spec) |

### 3.3 Honest Cost Report — Economic Index para indivíduos

| Aspecto | Detalhe |
|---|---|
| **Descrição** | Dashboard local: "esta semana poupaste $X delegando Y tarefas para tier mais baixo; perdeste $Z em retries falhados". Opt-in para anonimizar e contribuir agregados a um "Mooter Economic Pulse" público (formato inspirado no [Anthropic Economic Index](https://www.anthropic.com/research/anthropic-economic-index-january-2026-report)) |
| **Alinhamento Anthropic** | Paralela directamente o Economic Index report. Privacy-preserving by design (Anthropic privacy team adoraria). Conta a história "AI augmentation barata democratiza" |
| **Effort** | Médio (logging existe; adicionar agregação) |
| **Beneficiários** | Dev individual (visibilidade), comunidade (benchmarks), researchers |

### 3.4 Pre-deploy Safety Gate (RSP-aligned `final-reviewer`)

| Aspecto | Detalhe |
|---|---|
| **Descrição** | Mooter intercepta `git push`/`merge` e força review por modelo escolhido (Opus default), com checklist alinhada com [RSP v3.0](https://www.anthropic.com/news/responsible-scaling-policy-v3) dimensions (Security, Alignment-relevant changes, Safeguards). Bloqueia se detectar mudanças em `.env`, secrets, CI/CD sem review explícita |
| **Alinhamento Anthropic** | Aplica à *engenharia* o que Anthropic aplica a model deploys. Vocabulário RSP. "Responsible scaling for code" |
| **Effort** | Baixo-médio (guardrails CLAUDE.md já existem — formaliza) |
| **Beneficiários** | Equipas pequenas/solo devs sem CI maduro |

### 3.5 Open Routing Eval Harness (à la Petri/Bloom)

| Aspecto | Detalhe |
|---|---|
| **Descrição** | Harness OSS que gera N prompts sintéticos com tier conhecido, mede precisão do classifier, expõe regression suite. Output: scorecard público "Mooter routes correctly Z% of time across N categories". Inclui adversarial test cases |
| **Alinhamento Anthropic** | Anthropic publicou [Petri](https://www.anthropic.com/research/petri-open-source-auditing) (Out 2025) e Bloom como tools auditoria. Mesma filosofia (open eval, auditável) **fala-lhes a língua** |
| **Effort** | Médio (~3 semanas) |
| **Beneficiários** | Contributors (PR-friendly), researchers, Anthropic safety team (potencial leitura directa) |

### 3.6 ❌ Red flags Anthropic — o que NÃO fazer

| Anti-padrão | Porquê |
|---|---|
| ❌ Comoditizar Claude num gateway anonimizado | Anthropic vê Claude qualitativamente diferenciado; "Claude == GPT == Gemini" é o oposto da mensagem |
| ❌ Esconder Claude tier ao user | Acceptable Use 2026 reforçou "deception" como red line |
| ❌ Bypass Claude rate limits via paralelização absurda | Acceptable Use proíbe "malicious infrastructure compromise"; spawn explosivo é zona cinzenta |
| ❌ Enviar prompts user para LLMs locais/estrangeiros sem consent explícito | Privacy 30-day default; Mooter precisa data flow visível |
| ❌ Cache outputs Claude e revender como serviço | Viola Consumer Terms |
| ❌ Tocar em facial data, voter targeting, electoral content | Enforcement priorities Anthropic Set 2025+ |

### 3.7 Caminho concreto para o radar Anthropic

🔥 **Eventos Maio-Julho 2026:**

| Evento | Data | Acção |
|---|---|---|
| **Code with Claude London** | **2026-05-19 (12 dias!)** | Submeter demo via Anthropic events page; livestream grátis |
| **Code with Claude Tokyo** | 2026-06-10 | Pitch como case study Asia/multilingual |
| **Anthropic Fellows Program** | Applications Mai e Jul 2026 | alignment.anthropic.com |

**Quem deve ler primeiro (target legítimo):**

| Pessoa | Razão |
|---|---|
| Alex Albert (Head Claude Relations) e DevRel Anthropic | Canal natural |
| Boris Cherny (líder Claude Code) | Mooter é complementar, não competitivo |
| Chris Olah (Interpretability) | Apenas se RDTR estiver impecável |
| Deep Ganguli (Economic Research) | Padrões de uso reais, Honest Cost Report |

**Acções concretas (ordem):**

| # | Acção | Effort | Impacto |
|---|---|---|---|
| 1 | PR ao [`anthropics/claude-cookbooks`](https://github.com/anthropics/claude-cookbooks) (42k stars, 132 PRs abertos): notebook *"Routing requests across Claude tiers: a transparent open-source approach"* | Baixo | Alta visibilidade |
| 2 | Publicar MCP server `@mooter/router` em `modelcontextprotocol.io` registry | Médio-alto | Ecossistema MCP |
| 3 | Apply ao [Anthropic Startup Program](https://claude.com/programs/startups) — credits $1k-$25k | Baixo | Canal directo |
| 4 | Blog post engineering-style "Building a transparent model router: lessons from N production weeks" → HN + tag DevRel | Médio | Visibilidade comunidade |
| 5 | Twitter/X tag @AnthropicAI quando publicares Petri-style eval harness | Baixo | Anthropic quote-tweets tools alignment-friendly |
| 6 | VC partner program (se levantares pre-seed): a16z, Menlo, Spark — abrem canal partnerships | Variável | Long game |

❌ **Não tentes:** cold email Dario; aplicar Partner Network ($100M é enterprise integrators); pitchar aquisição antes de tracção pública.

**Caminho**: technical credibility first → DevRel attention → partnership conversations.

---

## 4. Autonomous dev loops — sim, mas com regras

### 4.1 ⚠️ "Dangerous mode" honestamente

Flag oficial: `--dangerously-skip-permissions` (alias `--permission-mode bypassPermissions`). Comunidade chama "YOLO mode".

**O que faz**: skipa toda confirmação humana — writes ficheiros, comandos shell, network calls, tool executions. Claude corre "uninterrupted until completion".

**O que NÃO skipa**: nada. É nuclear. Sem classifier, sem deny-list robusta, sem proteção contra prompt injection. **Anthropic chama-lhe "no protection against prompt injection or unintended actions"** e em Maio 2026 lançou **Auto Mode** (`--permission-mode auto`) explicitamente para o substituir.

**Riscos reais documentados:**
- CVE-2025-66032 (patched v1.0.93): 8 bypasses ao deny-list
- Pre-2026-03-05c: prompt injection conseguia `git remote add` para remoto controlado pelo atacante e push de histórico inteiro
- `rm -rf`, drop DB, force push, exfiltração via webhook — possível sem prompt

### 4.2 Setup recomendado (consenso forte 2026)

⚠️ **Dangerous mode SÓ dentro de container com network egress restringido.**

| Componente | Recomendação | URL |
|---|---|---|
| **Devcontainer base** | Trail of Bits sandboxed devcontainer | `github.com/trailofbits/claude-code-devcontainer` |
| **Alternativa oficial** | Anthropic devcontainer + feature `claude-code:1.0` | code.claude.com/docs/en/devcontainer |
| **Network isolation** | Allowlist apenas `api.anthropic.com`, `github.com`, `registry.npmjs.org` — drop o resto | Built-in firewall |
| **Filesystem** | Bind-mount apenas o repo do projecto | `${devcontainerId}` para isolar config por projecto |
| **Paralelismo** | Git worktrees nativos (`claude --worktree feature-x` ou `-w`) | Cada agente em branch própria |
| **Validação** | Hooks deterministas: `PreToolUse`, `PostToolUse`, `Stop`. Pre-commit corre lint+typecheck+tests | code.claude.com/docs/en/hooks-guide |

### 4.3 Padrões de loop que funcionam

| Padrão | Como | Quando |
|---|---|---|
| **Ralph Loop** ([snarktank/ralph](https://github.com/snarktank/ralph)) | Cada iteração = sessão fresh; lê PRD; faz 1 task; commita; sai. Loop externo (bash) corre até EXIT_SIGNAL ou max-iterations. Insight: **nunca deixes o mesmo agente acumular contexto** | Sweet spot autonomous dev |
| **Auto Mode + /loop + /schedule** | Anthropic-blessed, classifier safety, kill-switch a 3 denials consecutivos ou 20 totais | Anthropic-recommended |
| **Agent Teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) | Lead coordena, peers em contextos próprios; investigation, hipóteses concorrentes, módulos paralelos | Investigação técnica |
| **Agent Farm** ([Dicklesworthstone/claude_code_agent_farm](https://github.com/Dicklesworthstone/claude_code_agent_farm)) | 20-50 agentes paralelos, lock-coordination, tmux monitor | ⚠️ Demasiado para Mooter |
| **Self-improving skills** | Learnings file que agente actualiza por iteração; broken-link repair atingiu 95% autonomia ao batch 4 | Drift Detection skills |

### 4.4 Cuidados não-óbvios

| Cuidado | Mitigação |
|---|---|
| ⚠️ **Rate limits Max NÃO permitem 24/7 puro Opus**. Anthropic [duplicou rate limits 5h em Mai 2026](https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/) **explicitamente para travar Claude Code 24/7 background**. Weekly cap mantém-se | Usa o próprio Mooter — Sonnet para implement, Opus só para `final-reviewer` e arquitectura. Move 30-40% tool calls para Ollama local |
| ⚠️ Qualidade degrada sem HITL | Spec-driven: PRD curto + acceptance tests ANTES de qualquer código |
| ⚠️ Gold-plating ("while we're at it...") | Per-step constraint design — escrever **o que output deve atingir, não como** |
| ⚠️ Stale branches / abandoned work | Convenção `auto/<issue>-<sha>`; garbage-collect 7 dias |
| ⚠️ Prompt injection via issues/READMEs externos | Sandbox network deny + curate issues `auto-ok` |

### 4.5 🔥 Setup concreto para o Paulo

**Stack:**

| Componente | Escolha |
|---|---|
| Container | Trail of Bits devcontainer dentro de WSL2 (Windows host, RTX 4090 acessível via Ollama no host) |
| Worktrees | `~/.mooter-worktrees/<branch>`, criadas por script |
| Concorrência | **2-3 worktrees**, não 20. RTX 4090 + Claude Max ≠ Cursor cloud |
| Orchestrator | Ralph Loop em bash (não Node — menos peças) |
| Hooks | pre-commit corre `pnpm typecheck && pnpm test --run && pnpm lint`. Falha → revert + retry com erro como prompt |
| CLAUDE.md repo Mooter | Scope rígido + lista de "NÃO MEXER" (router core, classify.js, hook injector) |

**Workflow:**

| Passo | Quem |
|---|---|
| 1. Issue com acceptance criteria + ficheiros tocáveis | **Tu** (não delegues) |
| 2. Loop selecciona issue marcada `auto-ok`, cria worktree, branch | Auto |
| 3. Agent corre Ralph: implementa + testes + commit. Exit signal = todos tests verdes + acceptance reportados | Auto |
| 4. PR aberto contra `dev` | Auto |
| 5. **Tu** fazes merge manual. Sem auto-merge | **Tu** (HITL) |
| 6. `final-reviewer` (Opus) corre antes de qualquer push para `main` | Hook |

**Que delegar 100%:**

| Tarefa | Razão |
|---|---|
| ✅ Adapters de provider novos no router | Template existente |
| ✅ Tests para módulos já estáveis | Mecânico |
| ✅ Docs/READMEs para features já shipped | Mecânico |
| ✅ Refactor mecânico (rename, extract, type tightening) | Mecânico |
| ✅ Triagem de issues (label, dedupe, close stale) | Bem definido |

**Manter HITL (NÃO delegar):**

| Tarefa | Razão |
|---|---|
| ❌ Mexer em `classify.js`, scoring weights, calibration | Core do produto |
| ❌ Decisões pricing/positioning | Estratégia |
| ❌ Qualquer coisa para `main` ou release | Risco |
| ❌ Migrations Supabase, secrets, CI | Security |

**Token budget realista (19 dias):**

| Item | Detalhe |
|---|---|
| Claude Max $200 | ~240-480h Sonnet/janela 5h, ~24-40h Opus |
| 3 worktrees × 8h dia útil | ~25 sessões Claude Code/dia em Sonnet |
| ⚠️ Vais bater weekly cap se correres puro Opus | Solução: usa o teu próprio Mooter |
| Ollama qwen3:30b local | Triagem issues, drafts docs, resumos logs, parse stack traces — **gratuito** |
| Move 30-40% tool calls para fora do quota | Sem perda perceptível de qualidade nestas tarefas |

### 4.6 Anti-patterns documentados

| ❌ Não fazer | Porquê |
|---|---|
| Correr `--dangerously-skip-permissions` no host | Sempre container |
| Auto-merge para main | Cursor blog é claro: revisão humana antes de prod fica |
| 20+ agentes em paralelo num projecto pequeno | Lock contention, merges hell, custo explode |
| CLAUDE.md de 1000 linhas | Anthropic recomenda <200; resto move para skills |
| Confiar em CLAUDE.md como segurança | É advisory. Hard enforcement = hooks + `--allowedTools` + sandbox |
| Loops sem exit detection | Casos documentados de loops a queimar $200/noite |
| Ler issues GitHub não-curadas no loop | Vector de injection |

### 4.7 Aceleração realista esperada

| Tipo de tarefa | Ganho |
|---|---|
| Tarefas mecânicas (adapters, tests, docs) | **2-3x throughput** |
| Tarefas com decisão técnica | **1.2-1.5x** (gargalo passa a ser tu a rever) |
| Tarefas arquitectura/posicionamento | **0x** — não delegues |

**Setup honesto:** 1.5 dias devcontainer + Ralph + hooks + CLAUDE.md afinado. Tuning leva 2-3 dias antes de confiar.

**Para o gate 250 stars + 3 contributors:** o autonomous loop ajuda mais a **manter velocity de polish** (issues triadas, PRs externos com testes adicionados, docs sempre fresh) do que a "shippar features". A barra dos 250 stars é marketing+timing, não throughput de código.

🔥 **Recomendação final**: faz o setup. Mas trata-o como **multiplicador da tua execução, não substituto**. 19 dias com Paulo sleep-deprived a correr 3 loops de noite > 19 dias com Paulo a confiar no auto-pilot e acordar para repo cheio de PRs medíocres. Setup mínimo viável em 2 dias, depois 17 dias a usar com disciplina.

---

## 5. Roadmap consolidado V2 — 19 dias até gate

### Semana 1 (até 2026-05-13) — Foundation + autonomous setup

| Dia | Tarefa | Responsável |
|---|---|---|
| 2026-05-08 | Setup Trail of Bits devcontainer + WSL2 + Ollama bridge | Paulo (3h) |
| 2026-05-08 | Decidir stack core: `aurelio-labs/semantic-router` vs estender `classify.js` | Paulo (ADR) |
| 2026-05-09 | Curar seed 100 exemplos PT-PT/PT-BR/EN (20-30 por tier) | Paulo + 1 worktree auto |
| 2026-05-09 | Setup Ralph Loop + 2 worktrees + hooks pre-commit | Paulo (3h) |
| 2026-05-10 | Implementar Camada 0 (regex guardrails) | 1 worktree auto |
| 2026-05-10 | FastText language detection layer | 1 worktree auto |
| 2026-05-11 | Implementar Camada 1 (embedding k-NN) | 1 worktree auto + Paulo review |
| 2026-05-12 | Cache semântico GPTCache + Redis local | 1 worktree auto |
| 2026-05-13 | Eval framework v0 (golden dataset 200 prompts) + CI Github Actions | Paulo + 1 worktree |

### Semana 2 (até 2026-05-20) — Killer features + Anthropic submission

| Dia | Tarefa | Responsável |
|---|---|---|
| 2026-05-14 | Subscription-Aware config layer (YAML/env) | 1 worktree auto |
| 2026-05-14 | **Codebase-Aware Language Harmonisation MVP** | 1 worktree auto + Paulo review |
| 2026-05-15 | Integração Ollama (Qwen3-30B-A3B + Devstral Small 2 + Gemma 3 12B + AMALIA) | 1 worktree auto |
| 2026-05-15 | **Routing Decision Transparency Report (RDTR) v0** | Paulo |
| 2026-05-16 | Métricas `$ saved` + statusline integration | 1 worktree auto |
| 2026-05-16 | **PR ao `anthropics/claude-cookbooks`** | 🔥 Paulo (alta prioridade) |
| 2026-05-17 | Documentação README com 3 use cases canónicos | 1 worktree auto |
| 2026-05-18 | Demo video Loom 5min | Paulo |
| 2026-05-18 | **MCP server `@mooter/router` v0** publicar em `registry.modelcontextprotocol.io` | Paulo |
| 2026-05-19 | 🔥 **Code with Claude London (livestream)** — submeter demo, networking | Paulo |
| 2026-05-20 | **Lançamento HN: "Show HN: Mooter — subscription-aware multilingual LLM router"** | Paulo |

### Semana 3 (até 2026-05-26) — Recta final

| Dia | Tarefa | Responsável |
|---|---|---|
| 2026-05-21 | Posts Reddit (r/LocalLLaMA, r/ClaudeAI, r/OpenAI) | Paulo |
| 2026-05-22 | Outreach 10 vibe coders/OSS maintainers | Paulo + 1 worktree (drafts auto) |
| 2026-05-23 | Bug fixes feedback semana 2 | Worktrees auto |
| 2026-05-24 | Blog post técnico "Why we built Mooter" | Paulo |
| 2026-05-25 | Apply Anthropic Startup Program | Paulo (30 min) |
| 2026-05-25 | Prep gate review — métricas finais | Paulo |
| **2026-05-26 — GATE** | ≥250 stars + ≥3 contributors externos | Decisão: continua ou pivot GSD-as-a-Product |

---

## 6. Resumo numa linha por pergunta nova

| # | Pergunta | Resposta directa |
|---|---|---|
| 1 | Skills referência | Triple-stack: publica como **plugin Claude Code + skill portable + MCP server `@mooter/router`** simultaneamente. Referencia `musistudio/claude-code-router` (transformers) e `ryoppippi/ccusage` (telemetria-as-MCP). Issues `#19269` e `#30453` mostram janela aberta |
| 2 | Língua do prompt | **Ganho heterogéneo, não mito**. Frontier: ~3-8% gain por language-aware. Local: 15-30% gain. Killer feature: **Codebase-Aware Language Harmonisation** — auto-detect lang, route coerente, AMALIA/Sabiá-3 como cidadãos de primeira |
| 3 | Features que impressionam Anthropic | (1) RDTR — interpretability aplicada; (2) MCP server público; (3) Honest Cost Report — Economic Index para indivíduos; (4) Pre-deploy Safety Gate — RSP-aligned; (5) Open Routing Eval Harness — Petri-style. **PR ao claude-cookbooks** é a entrada baixo-effort/alta-visibilidade. **Code with Claude London 2026-05-19** é deadline crítico |
| 4 | Dangerous mode 24/7 local | **Sim mas com regras**. Trail of Bits devcontainer + Ralph Loop + 2-3 worktrees + HITL para merge. Setup 1.5 dias. Ganho 2-3x mecânico, 0x arquitectura. **Rate limits Max não permitem puro Opus 24/7** — usa o próprio Mooter para auto-rotear |

---

## 7. ⚠️ Pontos onde devo ser franco contigo (V2)

1. **Code with Claude London 2026-05-19 são 12 dias.** Se queres entrar no radar Anthropic *este ciclo*, é now-or-never. PR cookbook + MCP publish ANTES disso. Depois é Tokyo (Junho) ou esperar Q3.

2. **A separação first-party/third-party de Abril 2026 é fronteira-vermelha estratégica.** O Mooter **não pode** posicionar-se como "use Claude no Cursor barato" — Anthropic activamente cortou esse vector. O Mooter coabita com Claude Code. Esta restrição é boa: força clareza de mensagem.

3. **Rate limits Max travam autonomous loops puros.** Anthropic explicitamente limitou em Julho 2025 e mesmo depois de duplicar em Mai 2026, o weekly cap mantém-se. Se planeias 24/7, o teu próprio Mooter é a única forma sã (Sonnet implement + Ollama drafts + Opus só para review).

4. **AMALIA é aposta forte para PT-PT mas NÃO para PT-BR.** Para PT-BR, **Sabiá-3 (Maritaca)** é a referência. Não confundas — são produtos distintos com qualidade diferente em cada variante.

5. **Não inventei nomes ou versões.** Tudo vem de fontes citadas. Se algo te parecer suspeito (Opus 4.7 pricing, Code with Claude data, RSP v3.0, MCP roadmap items), verifica nos URLs do §8. Em particular: o estado exacto dos plugins/marketplace muda semanalmente.

6. **Não testei pessoalmente Trail of Bits devcontainer no Windows/WSL2.** Se houver atrito, o fallback canónico é o devcontainer oficial Anthropic.

7. **A análise do plan-with-frontier+execute-with-local (V1) mantém-se**: perde para Opus solo em harness maduro. **Não combines** as recomendações V1 e V2 sem ler ambas — V2 é incremento, não substitui V1.

---

## 8. Sources V2 (consolidadas)

### Anthropic ecosystem — skills, plugins, MCP, agent SDK
- [Anthropic Skills docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) · [GitHub](https://github.com/anthropics/skills)
- [Claude Code skills docs](https://code.claude.com/docs/en/skills)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) · [Official GitHub](https://github.com/anthropics/claude-plugins-official)
- [Cowork plugins blog](https://claude.com/blog/cowork-plugins) · [knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins)
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) · [Hooks](https://platform.claude.com/docs/en/agent-sdk/hooks) · [Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Official MCP Registry](https://registry.modelcontextprotocol.io/) · [Blog](https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/)
- [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router)
- [ryoppippi/ccusage](https://github.com/ryoppippi/ccusage)
- [Issue #30453 — model field skill frontmatter](https://github.com/anthropics/claude-code/issues/30453) · [Issue #19269 — user-configurable model routing](https://github.com/anthropics/claude-code/issues/19269)
- [AI Model Selection & Routing skill](https://mcpmarket.com/tools/skills/ai-model-selection-routing)
- [mcp-checkup](https://github.com/yifanyifan897645/mcp-checkup) · [traceloop/opentelemetry-mcp-server](https://github.com/traceloop/opentelemetry-mcp-server)
- [Anthropic billing change April 2026](https://relayplane.com/blog/anthropic-billing-change-april-2026)
- [Statusline docs](https://code.claude.com/docs/en/statusline)
- [Building effective agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents)
- [Ticket routing case study](https://docs.anthropic.com/en/docs/about-claude/use-case-guides/ticket-routing)

### Multilingual benchmarks e papers
- [LLM Stats 2026 Leaderboard](https://llm-stats.com/) · [Vellum](https://www.vellum.ai/llm-leaderboard) · [LM Council](https://lmcouncil.ai/benchmarks)
- [Claude Multilingual Support](https://docs.claude.com/en/docs/build-with-claude/multilingual-support)
- [Open Portuguese LLM Leaderboard (HF)](https://huggingface.co/spaces/eduagarcia/open_pt_llm_leaderboard)
- [AMALIA technical report (arxiv 2603.26511)](https://arxiv.org/abs/2603.26511) · [PROPOR 2026](https://aclanthology.org/2026.propor-1.38/)
- [Sabiá-2 paper](https://arxiv.org/abs/2403.09887) · [Prosa BR-PT benchmark](https://arxiv.org/html/2605.01630)
- [CAPITU instruction-following PT-BR](https://arxiv.org/html/2603.22576)
- [GAIA Portuguese Gemma 3](https://deepmind.google/models/gemma/gemmaverse/gaia/) · [Gemma 3 report](https://arxiv.org/abs/2503.19786)
- [Beyond English: prompt translation strategies (arxiv 2502.09331)](https://arxiv.org/html/2502.09331v1)
- [Do Multilingual LLMs Think in English? (arxiv 2502.15603)](https://arxiv.org/html/2502.15603v1)
- [Anthropic — Tracing thoughts](https://www.anthropic.com/research/tracing-thoughts-language-model)
- [CodeMixBench (arxiv 2505.05063)](https://arxiv.org/html/2505.05063v1)
- [Tokenization unfairness (arxiv 2305.15425)](https://arxiv.org/pdf/2305.15425) · [HF tokenization blog](https://huggingface.co/blog/omarkamali/tokenization)
- [FastText vs CLD3 JS comparison 2026](https://www.pkgpulse.com/blog/franc-vs-langdetect-vs-cld3-language-detection-javascript-2026)

### Anthropic priorities & roadmap
- [Anthropic Usage Policy](https://www.anthropic.com/news/usage-policy-update)
- [Responsible Scaling Policy v3.0](https://www.anthropic.com/news/responsible-scaling-policy-v3) · [PDF](https://anthropic.com/responsible-scaling-policy/rsp-v3-0)
- [Frontier Safety Roadmap](https://www.anthropic.com/responsible-scaling-policy/roadmap)
- [Introducing Claude Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7) · [What's new](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7)
- [Claude Managed Agents engineering](https://www.anthropic.com/engineering/managed-agents)
- [Code with Claude](https://claude.com/code-with-claude) · [SF 2026 recap](https://blakecrosley.com/blog/code-with-claude-sf-2026-recap)
- [Alignment Science Blog](https://alignment.anthropic.com/) · [Introspection Adapters](https://alignment.anthropic.com/2026/introspection-adapters/) · [Sandbagging](https://alignment.anthropic.com/2025/automated-researchers-sandbag/)
- [Anthropic Fellows Program 2026](https://alignment.anthropic.com/2025/anthropic-fellows-program-2026/)
- [Economic Index Jan 2026](https://www.anthropic.com/research/anthropic-economic-index-january-2026-report) · [Mar 2026](https://www.anthropic.com/research/economic-index-march-2026-report)
- [MCP Roadmap](https://modelcontextprotocol.io/development/roadmap) · [New Stack 2026](https://thenewstack.io/model-context-protocol-roadmap-2026/)
- [Claude Partner Network $100M](https://www.anthropic.com/news/claude-partner-network) · [Startup Program](https://claude.com/programs/startups) · [VC Partner Program](https://claude.com/contact-sales/vc-partner)
- [Petri open-source auditing](https://www.anthropic.com/research/petri-open-source-auditing) · [Bloom](https://www.anthropic.com/research/bloom)
- [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks)
- [Anthropic Transparency Hub](https://www.anthropic.com/transparency)

### Autonomous coding loops
- [Permission modes — Claude Code Docs](https://code.claude.com/docs/en/permission-modes)
- [Claude Code auto mode (Anthropic)](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [Claude Code sandboxing (Anthropic)](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Pasquale Pillitteri — autonomous mode guide 2026](https://pasqualepillitteri.it/en/news/141/claude-code-dangerously-skip-permissions-guide-autonomous-mode)
- [UpGuard YOLO Mode risks](https://www.upguard.com/blog/yolo-mode-hidden-risks-in-claude-code-permissions)
- [InfoQ Auto Mode](https://www.infoq.com/news/2026/05/anthropic-claude-code-auto-mode/)
- [Devcontainer docs](https://code.claude.com/docs/en/devcontainer)
- [trailofbits/claude-code-devcontainer](https://github.com/trailofbits/claude-code-devcontainer)
- [Docker Sandboxes blog](https://www.docker.com/blog/docker-sandboxes-run-claude-code-and-other-coding-agents-unsupervised-but-safely/)
- [con/yolo](https://github.com/con/yolo) · [thevibeworks/claude-code-yolo](https://github.com/thevibeworks/claude-code-yolo)
- [Agent Teams docs](https://code.claude.com/docs/en/agent-teams)
- [Dicklesworthstone/claude_code_agent_farm](https://github.com/Dicklesworthstone/claude_code_agent_farm)
- [Cursor Cloud Agents blog](https://cursor.com/blog/scaling-agents) · [Security agents](https://cursor.com/blog/security-agents)
- [snarktank/ralph](https://github.com/snarktank/ralph) · [frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code) · [Samanvya Tripathi blog](https://samanvya.dev/blog/claude-code-ralph-loop)
- [Worktrees workflow](https://code.claude.com/docs/en/common-workflows) · [ClaudeFast worktree guide](https://claudefa.st/blog/guide/development/worktree-guide)
- [Hooks guide](https://code.claude.com/docs/en/hooks-guide) · [10 best hooks 2026](https://www.ayautomate.com/blog/best-claude-code-hooks)
- [Best practices Claude Code](https://code.claude.com/docs/en/best-practices)
- [How Anthropic teams use Claude Code (PDF)](https://www-cdn.anthropic.com/58284b19e702b49db9302d5b6f135ad8871e7658.pdf)
- [TechCrunch rate limits 2025-07-28](https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/)
- [Pro/Max plan support](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [Drift Detection skill](https://mcpmarket.com/tools/skills/drift-detection)
- [Self-improving agent (Medium)](https://medium.com/@davidroliver/recursive-self-improvement-building-a-self-improving-agent-with-claude-code-d2d2ae941282)
