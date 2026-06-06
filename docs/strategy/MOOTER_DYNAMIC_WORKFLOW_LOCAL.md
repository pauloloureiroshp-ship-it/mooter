# Mooter — Dynamic Workflows Local-First (design doc)

**Composto:** 2026-06-06 ~23h BRT, Cowork
**Status:** Design proposal · Wave 28+ candidate
**Trigger:** Pergunta Paulo durante Wave 27 a correr — "como replicar o dynamic workflow do CC mas local?"
**Ponto de partida:** Mooter já tem tiered routing (T0/T1/T2/T3) + subagents + classify.js + Pastor learning loop em prod (Wave 26 SHIPPED)

---

## TL;DR (3 linhas)

Dynamic Workflows da Anthropic moveu o plano de orquestração **para fora do context window** — Claude escreve um **script JavaScript** que um runtime executa em background, com até 1000 subagents paralelos, validação adversarial, e estado em variáveis. Replicar local-first significa: **Claude (Opus) escreve o script uma vez** (1 API call), e o runtime Mooter executa **com pool de Ollama workers** em vez de subagents Claude. Custo: 1 chamada Opus + N chamadas Ollama gratuitas. Vantagem competitiva única do Mooter: ninguém mais tem isto.

---

## Parte 1 — O que é Dynamic Workflows (Anthropic version)

### A inovação real

Anteriormente em Claude Code, subagents eram despachados pelo Claude **turn-by-turn**, com cada resultado intermédio a acumular no context window. **Esse acúmulo era o constraint binding em tarefas autónomas longas.**

Dynamic Workflows resolve isto movendo a orquestração para **código**:

```
ANTES (subagents tradicionais)
─────────────────────────────
[Claude planeia turn 1] → [spawn 3 subagents] → [resultados voltam ao context]
[Claude planeia turn 2 com context cheio] → [spawn mais] → [context inflated]
[Eventualmente context window cheio → tarefa morre]


DEPOIS (dynamic workflows)
──────────────────────────
[Claude escreve script JS UMA vez]
        ↓
[Runtime executa script em background]
        ↓
[Script orquestra 10-1000 subagents]
        ↓
[Estado vive em variáveis JS (não context window)]
        ↓
[Apenas resultado final volta ao Claude]
```

### Componentes operacionais (do mapping interno)

1. **Script writer (Claude)** — 1 chamada inicial. Recebe natural language prompt, devolve JS orchestration script.
2. **Runtime** — processo Node.js separado que executa o script. Não consome context window do Claude.
3. **Subagent pool** — até 16 concorrentes simultâneos, 1000 totais por run. Cada subagent é uma session Claude (Haiku/Sonnet/Opus) com prompt focado e context limpo.
4. **State store** — variáveis JS em memória + checkpoints em disco (resume-able).
5. **Adversarial verification** — agentes "reviewers" que tentam refutar findings de agentes "workers" antes de aceitar.
6. **Convergence loop** — itera até resultados convergirem (não há gold standard, há voting/cross-checking).

### Constraints duros (Anthropic)

| Constraint | Razão |
|---|---|
| 16 subagents concorrentes max | CPU/memory local |
| 1000 subagents totais por run | Anti runaway loops |
| Sem input do user a meio do run | Cada estágio é um workflow separado se precisar sign-off |
| Sem filesystem/shell directo no script | Apenas via subagents (separation of concerns) |
| Token consumption massivo | Cada subagent ~ uma session pequena de Claude |
| Resume-able na mesma session | Exit CC → restart fresh |

### Activação

Duas formas:
1. **Explícito:** prompt contém keyword `workflow` → CC escreve workflow
2. **Automático:** `/effort ultracode` → Claude decide quando precisa

### Quem fica de fora deste modelo

- Pro plan tem só por activação manual em `/config`
- Tokens contam para quota normal → uma run grande pode esgotar mensalidade
- Não-pagantes / API key-less: não conseguem usar de todo

**É exactamente neste gap que Mooter pode ganhar.**

---

## Parte 2 — Por que isto é uma mudança arquitectural fundamental

Antes de Dynamic Workflows, todos os agent frameworks (LangGraph, AutoGen, CrewAI, Mooter incluído) tinham o mesmo padrão:

> **LLM faz routing → spawn worker → worker devolve resultado para LLM → LLM decide próximo passo**

O LLM está **no caminho crítico** de cada decisão. Context window cresce monotonicamente. Tarefas longas morrem.

Dynamic Workflows quebra isto:

> **LLM escreve plano UMA vez (como código) → código orquestra → LLM volta só para sintetizar**

O LLM sai do caminho crítico das decisões intermédias. Context window fica constante. Tarefas longas escalam.

**Analogia:** é a diferença entre um **gerente que valida cada PR** e um **gerente que escreve a CI pipeline e deixa correr**.

---

## Parte 3 — Mapping operacional detalhado (fluxo passo-a-passo)

### Fluxo dum run típico

```
[1] User prompt
        ↓
[2] Claude (Opus) analisa pedido
        ↓
[3] Claude escreve JS script
    │
    │  Conteúdo típico do script:
    │  ─────────────────────────
    │  const phase1 = await Promise.all(
    │    files.map(f => agent({
    │      model: 'sonnet',
    │      prompt: `Analyze ${f} for X`,
    │      tools: ['Read']
    │    }))
    │  );
    │
    │  const phase2 = await Promise.all(
    │    phase1.map(finding => agent({
    │      model: 'sonnet',
    │      prompt: `Verify this finding: ${finding}`,
    │      tools: ['Read', 'Grep']
    │    }))
    │  );
    │
    │  const consensus = await voteAndConverge(phase2);
    │
    │  return synthesize(consensus);
        ↓
[4] User aprova plano (mostra phases + token estimate)
        ↓
[5] Runtime começa execução em background
        ↓
[6] Phase 1 — 50 subagents paralelos (Sonnet × 50)
    │  Cada um analisa 1 ficheiro, devolve finding JSON
        ↓
[7] Phase 2 — 50 reviewer subagents (Sonnet × 50)
    │  Cada um pega 1 finding e tenta refutar
    │  Adversarial — agentes incentivados a encontrar problemas
        ↓
[8] Phase 3 — Convergence vote
    │  Cross-checking: cada finding sobrevivente é validado por ≥2 agentes
    │  Findings que falham consenso são droppados
        ↓
[9] Phase 4 — Synthesis (Opus, single call)
    │  Pega consensus + escreve relatório final
        ↓
[10] User recebe resultado: cited report, com tudo que não sobreviveu já filtrado
```

### Onde estão os custos

| Estágio | Quantos calls | Modelo típico | Tokens estimados |
|---|---|---|---|
| 3 — Write script | 1 | Opus | ~10k |
| 6 — Workers | 50-200 | Sonnet | 50-200k each |
| 7 — Reviewers | 50-200 | Sonnet | 30-100k each |
| 8 — Convergence | 5-20 | Haiku | 5k each |
| 9 — Synthesis | 1 | Opus | ~20k |

**Total típico:** 5M-50M tokens por run. Comparar com sessão tradicional de 1-2M tokens.

**Custo $ aproximado (cloud Anthropic):** $30-$300 por run dependendo do modelo mix.

---

## Parte 4 — Replicação local-first para Mooter

### Hipótese central

> A inovação está no **arquitectura (script-out-of-context)**, não nos LLMs. Podemos manter a arquitectura e trocar os workers Anthropic por **Ollama locais**. O único call externo necessário é o **script writer** (Claude Opus) e a **synthesis final** (Claude Opus).

### Custo equivalente local-first

| Estágio | Quantos calls | Modelo | Custo |
|---|---|---|---|
| 3 — Write script | 1 | Claude Opus (API) | $0.15 |
| 6 — Workers | 50-200 | **Ollama qwen2.5-coder:7b** | **$0** |
| 7 — Reviewers | 50-200 | **Ollama qwen3:30b** | **$0** |
| 8 — Convergence | 5-20 | **Ollama qwen2.5-coder:7b** | **$0** |
| 9 — Synthesis | 1 | Claude Opus (API) | $0.30 |

**Total típico:** ~$0.45 por run. **Vs $30-$300 cloud-only.** Redução 99%+.

### Arquitectura proposta (Mooter Workflow Engine)

```
┌──────────────────────────────────────────────────────────────────┐
│                     User prompt (CLI / VS Code)                  │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  Step 1: Script Writer (Claude Opus via API, 1 call)             │
│  ───────────────────────────────────────────────────             │
│  Receive prompt, return mooter-workflow.js                       │
│  Spec: orchestration script that calls window.mooter.agent(...)  │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  Step 2: Mooter Workflow Runtime (Node.js, background process)   │
│  ──────────────────────────────────────────────────────────────  │
│  - Sandboxed VM (vm2 or isolated-vm)                             │
│  - Executes user-supplied script                                 │
│  - Exposes: agent(), parallel(), vote(), checkpoint()            │
│  - State in JS variables (not LLM context)                       │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  Step 3: Subagent Pool (Ollama local)                            │
│  ───────────────────────────────────                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Worker 1     │  │ Worker 2     │  │ Worker N     │           │
│  │ qwen2.5-7b   │  │ qwen2.5-7b   │  │ qwen2.5-7b   │           │
│  │ (Ollama HTTP)│  │ (Ollama HTTP)│  │ (Ollama HTTP)│           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  RTX 4090 (24GB VRAM): ~8 concurrent 7B workers                  │
│  Or sequential batching: 1 worker, queue                         │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  Step 4: Adversarial Review (Ollama qwen3:30b)                   │
│  ────────────────────────────────────────────                    │
│  Reviewers que tentam refutar findings dos workers               │
│  ~3 concurrent 30B (mais memory hungry)                          │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  Step 5: Convergence Vote (Ollama qwen2.5-7b)                    │
│  ────────────────────────────────────────                        │
│  Cross-checking, voting, consensus building                      │
│  Drops findings que não sobrevivem                               │
└──────────────────────────────────────────────────────────────────┘
                                ↓
┌──────────────────────────────────────────────────────────────────┐
│  Step 6: Synthesis (Claude Opus via API, 1 call)                 │
│  ─────────────────────────────────────────────                   │
│  Recebe consensus + escreve relatório final                      │
└──────────────────────────────────────────────────────────────────┘
                                ↓
                          [User receives report]
```

### Componentes a construir

| # | Componente | Linguagem | Esforço |
|---|---|---|---|
| 1 | `mooter workflow create <prompt>` CLI command | TS (existente) | 2h |
| 2 | Script writer integration (Claude API) | TS | 4h |
| 3 | Workflow runtime (sandboxed VM2) | TS | 8h |
| 4 | `agent()` API que abstrai Ollama HTTP + tool use | TS | 6h |
| 5 | `parallel()`, `vote()`, `converge()` helpers | TS | 4h |
| 6 | Ollama pool manager (concurrent limit, queue, retry) | TS | 6h |
| 7 | Checkpoint/resume (state em SQLite local) | TS | 4h |
| 8 | Progress UI (terminal TUI estilo CC `/workflows`) | TS + Ink/Termion | 8h |
| 9 | Synthesis call (Claude API single) | TS | 2h |
| 10 | Skill `/workflows` para invocar | Markdown | 1h |

**Total estimado:** ~45h CC autonomous (2-3 waves grandes ou 1 wave nuclear).

### Trade-offs honestos vs Anthropic version

| Dimensão | Anthropic CC | Mooter Local |
|---|---|---|
| Worker quality | Sonnet/Opus (estado-da-arte) | qwen2.5-coder:7b (worse, mas fine-tuned com LoRA pode aproximar) |
| Reviewer quality | Sonnet/Opus | qwen3:30b (mid-tier) |
| Concurrency real | 16 (cloud paralelo) | ~8 no 4090, 1-2 em laptops normais |
| Latência per agent | 1-5s | 5-30s (local) |
| Cost per run | $30-$300 | ~$0.45 (apenas script + synthesis Opus) |
| Privacy | Código sai para Anthropic | Código fica local (excepto prompt + synthesis) |
| Offline | ❌ requer cloud | ⚠️ requer cloud só para script + synthesis (pode ser pre-cached) |
| Resume | Same session only | **Cross-session** (estado em SQLite local) |
| Tooling integration | Apenas CC | **Qualquer CLI/editor** com Mooter |

### Killer feature do Mooter local-first

**Privacy + Cost.** Para code review, security audits, migrations em codebases enterprise (NDA-bound), o cloud Anthropic é frequentemente off-limits. Local-first com Mooter abre este mercado:

- **Defense contractors** (não podem usar cloud LLMs por compliance)
- **Healthcare** (HIPAA)
- **Financial** (SOC2)
- **Legal** (privilege)

Plus: developers solo que não querem queimar $300/run.

---

## Parte 5 — Roadmap implementação (4 waves)

### Wave 28 — Workflow Engine MVP (~20h CC)

**Goal:** Provar que conceito funciona localmente.

- 1, 2, 3, 4, 9, 10 da tabela acima (script writer + runtime + agent API + Ollama pool básico)
- Sem reviewers ainda, sem convergence — apenas workers em paralelo
- Demo: `mooter workflow create "audit src/ for unused exports"` → 1 script + 5 workers Ollama paralelos + 1 synthesis Opus
- Skill `/workflows` invocável dentro de CC

**Output:** working prototype, 1 example workflow shipped, demo video curto.

### Wave 29 — Adversarial Review + Convergence (~15h CC)

**Goal:** Atingir paridade conceptual com Anthropic em quality (não em raw model power).

- 5 (vote/converge helpers)
- 6 (pool manager completo)
- Reviewer integration (qwen3:30b)
- Demo: comparar Mooter local workflow vs single-pass Mooter para audit fictício, mostrar findings que survived consenso vs sozinhos

**Output:** quality benchmark Mooter Workflows vs single-pass. Métrica: % findings que sobreviveram cross-check.

### Wave 30 — Resume + UI + Marketing (~15h CC)

**Goal:** Production ready.

- 7 (checkpoint/resume cross-session em SQLite)
- 8 (progress TUI bonito)
- Blog post "How Mooter does Dynamic Workflows offline"
- Tweet thread comparando $300 cloud run vs $0.45 local run
- Updated landing page com "Workflows" como feature flagship

**Output:** v2.0 Mooter launch. Friends-launch round 2 com este pitch.

### Wave 31 — LoRA Pastor Workflow Specialization (~12h CC)

**Goal:** Pastor learning loop específico para workflow patterns.

- Pastor aprende: que tipos de workflow tendem a precisar quantos workers, quais tools
- LoRA adapter para script writer (aprende patterns de scripts bem-sucedidos do user)
- Optionally: usar `mooter-pastor-v1.gguf` (LoRA train Wave 23 carry) em vez de Opus para script writing

**Output:** workflow autonomy. Script writer pode correr local depois de N exemplos.

---

## Parte 6 — Riscos + mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| Ollama qwen2.5-coder:7b muito worse que Sonnet → quality colapsa | Alto | LoRA fine-tune com self-audit data (Wave 23 carry) + adversarial review compensates |
| Concurrency local limitada (~8 workers) vs 16-1000 cloud | Médio | Sequential batching aceitável para tarefas longas overnight. Marketing: "slow but private" |
| Sandboxed JS VM tem escapes (segurança) | Alto | Usar `isolated-vm` (V8 isolates), limitar APIs expostas, run em user-mode process |
| Resume cross-session pode corromper state | Médio | Checkpoint atómico (write-ahead log), validate ao retomar |
| Adoption: developers não sabem que existe | Alto | Plug agressivo no statusline ("you just used a workflow, saved $X") |
| LangGraph/AutoGen têm head-start | Médio | Local-first é nosso diferencial; LangGraph é cloud-first |

---

## Parte 7 — Decisão estratégica para Paulo

### Por que vale a pena (founder-pragmatic)

1. **Diferencial defensável.** Mooter já tem tiered routing (T0/T1/T2/T3). Adicionar local-first workflows duplica o moat. Ninguém mais combina: Ollama + tiered + Pastor + workflows.
2. **Direct response a um movimento Anthropic real.** Não é vapor. É response a feature que Anthropic shipped 2 semanas atrás.
3. **Market expansion.** Abre enterprise (privacy-sensitive) + solo (cost-sensitive). Hoje Mooter targets solo developers com Claude Code. Workflows targets também enterprise.
4. **Pastor synergy.** Pastor v2 pode aprender padrões workflow → cada user fica progressivamente melhor.
5. **Friends-launch upgrade.** Pitch v6 com "private dynamic workflows" é muito mais forte que pitch v5 (routing only).

### Por que pode não valer a pena (honest)

1. **Esforço grande.** 60h CC total (4 waves). Mooter ainda não tem product-market fit definitivo. Construir antes de validar é risky.
2. **Quality gap.** Sonnet/Opus são ~ 1 ano à frente de qwen2.5-coder:7b. Local workflows vão sentir-se medíocres comparativamente.
3. **Dependency lock-in.** O script writer + synthesis ainda usam Anthropic API. Se Anthropic muda preços ou TOS, somos afectados.
4. **Marketing complexidade.** "Local dynamic workflows" é mensagem mais difícil de transmitir que "cheap router". 

### Recomendação

🟡 **Hold até friends-launch dar sinal.** Wave 27 ship + LoRA train + friends-launch 3 DMs. Se houver sinal forte de demand (pelo menos 1 dos 3 amigos diz "isto é o que precisamos"), avança Wave 28 (MVP workflows). Se não, Mooter precisa de pivot anterior (não construir workflows num produto sem traction).

🔥 **Se quiseres avançar antes do sinal de friends:** podemos compor o brief Wave 28 (Workflow Engine MVP) durante Wave 27 e tu decides depois.

---

## Apêndice — Recursos canónicos

- [Introducing dynamic workflows in Claude Code (Anthropic blog)](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code)
- [Orchestrate subagents at scale (Claude Code Docs)](https://code.claude.com/docs/en/workflows)
- [Claude Code Adds Dynamic Workflows (InfoQ)](https://www.infoq.com/news/2026/06/dynamic-workflows-claude-code/)
- [Claude Code's Dynamic Workflows: 750k lines in 6 days (Medium)](https://medium.com/illumination/claude-codes-dynamic-workflows-the-ai-agent-architecture-that-just-rewrote-750-000-lines-of-code-d605a1d9b6d4)
- [Anthropic Opus 4.8 launch (Memeburn)](https://memeburn.com/claude-opus-4-8-launches-with-powerful-dynamic-workflows/)
- [Tech Times — Scripts Replace Context Windows](https://www.techtimes.com/articles/317363/20260529/claude-code-dynamic-workflows-scripts-replace-context-windows-ultracode-automates-orchestration.htm)

---

*Documento composto durante Wave 27 a correr no CC. Pre-decision draft, sujeito a iteração após friends-launch signal.*
