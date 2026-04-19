# Graph + Memory + Vault — Master Prompt

> **Objectivo:** dotar o Mooter.ai de um "sistema nervoso central" para o smartrouting, combinando três camadas open-source — **Graphify** (estrutura), **claude-mem** (histórico) e **kepano/obsidian-skills** (interface humana) — de modo a reduzir tokens em retrieval, acelerar o auto-learning loop e tornar as regras de routing editáveis sem deploy.
>
> **Status:** plano em 5 fases, pronto para executar no Claude Code. Cada fase tem tier recomendado e critério de aceitação.
>
> **Criado:** 2026-04-19 — Paulo + Claude (Opus, inline, T3 arq.)

---

## 1. Sumário executivo (TL;DR)

Hoje o `classify.js` é um classificador heurístico quase stateless: decide tier por keywords, tamanho do prompt e regras em JS. Funciona, mas:

1. **Não aprende de forma automática** entre sessões (o scratchpad é manual).
2. **Não sabe o que é hub ou folha no próprio codebase** (trata um edit num `lib/` partilhado como igual a um edit num script isolado).
3. **As regras estão em código** — cada afinação é um deploy.

As três ferramentas fecham exactamente essas três lacunas:

| Camada | Ferramenta | Lacuna que fecha |
|---|---|---|
| **Estrutura** | Graphify (safishamsi/graphify) | Router deixa de ser cego ao grafo de dependências do próprio Mooter. |
| **Histórico** | claude-mem (thedotmack/claude-mem) | Cada decisão de routing + outcome fica persistida e queryable. |
| **Interface** | kepano/obsidian-skills + vault | Regras e padrões vivem em Markdown/Bases editáveis, não em JS. |

Juntas → **router com retrieval-augmented grounding**: classify.js enriquece cada decisão com 1 query ao grafo + 1 query à memória, antes de escolher tier. Impacto esperado nos tokens de retrieval: **-50% a -70%** em queries com contexto de projecto. Auto-learning passa de manual a contínuo.

---

## 2. Análise individual + fit no Mooter.ai

### 2.1 Graphify — camada de estrutura

- **O que é:** Agent skill open-source que constrói knowledge graph a partir de código, Markdown, PDFs, imagens e vídeos. Parsing via tree-sitter AST em 25 linguagens. Outputs: `graph.html` interactivo, `graph.json` persistente, `GRAPH_REPORT.md`, export nativo para Obsidian vault e Neo4j. Processamento local — nada sai da máquina.
- **Claim de marketing:** 71.5× redução de tokens (123k → 1.7k) num repo de 52 ficheiros. Realista no nosso caso: 5-10× nas queries de retrieval, não em tudo.
- **Fit directo no Mooter:**
  - `hub/` + `docs/` (já são ~50+ ficheiros entre MPs, architecture, sync) torna-se grafo queryable.
  - `classify.js` ganha sinal novo: *"este ficheiro tem N dependentes no grafo → refator afecta > 3 ficheiros → força T3"* sem precisar que o user escreva "refactor".
  - Os 22+ MPs passam a ser retrievable por semântica em vez de grep por nome.
- **Custo:** skill instalada em `.claude/skills/`. Rebuild semanal ou on-demand. Zero runtime cost depois do grafo estar em cache.

### 2.2 claude-mem — camada de histórico

- **O que é:** sistema de memória persistente via 5 hooks do lifecycle do Claude Code (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd). Backend SQLite (FTS5) + Chroma (vectores). Worker HTTP em `:37777` com UI web. Skill `mem-search` com progressive disclosure (index ~50-100 tokens → timeline → detalhes ~500-1000 tokens).
- **Fit directo no Mooter:**
  - Substitui/complementa `.claude/scratch/session_*.md` do doctrine — captura **automaticamente** o que hoje Paulo faz à mão.
  - Schema de observação customizável → cada routing decision vira registo estruturado: `(prompt_hash, tier_chosen, subagent, tokens, cost, user_correction, outcome)`.
  - Feed directo do auto-learning loop referido em `ROADMAP_MASTER_V2.md`.
  - Progressive disclosure casa exactamente com a "Disciplina de tokens" da CLAUDE.md.
- **⚠️ Atenção à licença:** claude-mem é **AGPL-3.0**. Se Mooter.ai for distribuído como serviço fechado/comercial, AGPL exige abrir qualquer modificação deployada. **Decidir na Fase 0:** aceitar, forkar com alternativa, ou reescrever versão mínima (5 hooks + SQLite + schema próprio, ~500 linhas).

### 2.3 kepano/obsidian-skills — camada humana

- **O que é:** skills oficiais da Obsidian (Steph Ango, CEO, aka kepano) que ensinam o Claude a editar `.md`, `.base` (Bases) e `.canvas` (JSON Canvas). MIT-licensed. Install: colocar `.claude/` na raíz do vault.
- **Fit directo no Mooter:**
  - **Bases** (`.base`) → regras de routing deixam de estar hardcoded em `classify.js`. Paulo edita uma tabela no Obsidian, o router recarrega no próximo SessionStart.
  - **JSON Canvas** (`.canvas`) → fluxograma visual do routing, auto-gerado a partir do claude-mem. Olhas para o canvas e percebes os últimos 50 prompts num relance.
  - **Markdown** → padrões identificados, post-mortems, playbooks. Tudo queryable pelo Graphify.
  - Integra-se de forma natural com o export "Obsidian vault" do Graphify — passa a haver uma única "source of truth" em Markdown.

---

## 3. Arquitectura proposta

```
                    ┌──────────────────────────────────┐
                    │     Obsidian Vault               │
                    │     ~/mooter-brain/              │
                    │   ┌─────────┐ ┌───────────────┐  │
                    │   │ rules/  │ │ canvas/       │  │
                    │   │ *.base  │ │ router.canvas │  │
                    │   └────┬────┘ └──────┬────────┘  │
                    │        │             │           │
                    │   ┌────┴─────────────┴─────┐     │
                    │   │ graph/ (graphify out)  │     │
                    │   │ sessions/ (mem sync)   │     │
                    │   └────────────────────────┘     │
                    └─────┬────────────────────┬───────┘
                          │ obsidian-skills    │
                          │ (read/write)       │
        ┌─────────────────┼────────────────────┼──────────────────┐
        │                 ▼                    ▼                  │
        │          ┌──────────────────────────────┐               │
        │          │   classify.js (router)       │               │
  prompt├─────────▶│  1. static rules (existing)  │──▶ subagent   │
        │          │  2. graph query (NEW)        │               │
        │          │  3. mem retrieval (NEW)      │               │
        │          └────┬──────────────────┬──────┘               │
        │               │                  │                      │
        │        ┌──────▼──────┐    ┌──────▼───────┐              │
        │        │  Graphify   │    │  claude-mem  │              │
        │        │  graph.json │    │ SQLite+Chroma│              │
        │        │  (struct)   │    │   (history)  │              │
        │        └─────────────┘    └──────┬───────┘              │
        │                                  │                      │
        │                                  │ hooks                │
        │                                  │ (PostToolUse, ...)   │
        │                                  ▼                      │
        │                          log outcome → feed learning   │
        └─────────────────────────────────────────────────────────┘
                          [Mooter runtime — local]
```

**Ciclo de dados:**

1. **Prompt entra** → classify.js corre regras estáticas.
2. **Enriquece:** query ao `graph.json` (ex: "este path tem quantos dependentes?") + query `mem-search` (ex: "prompts semelhantes → que tier correu bem?").
3. **Decide** com score ponderado: estático × graph × histórico.
4. **Executa** no subagent.
5. **Loga outcome** via hook PostToolUse no claude-mem.
6. **Semanalmente:** export mem → vault `sessions/`, rebuild Graphify, Paulo revê Canvas e ajusta Bases.
7. **Na próxima sessão:** classify.js recarrega rules do vault, grafo actualizado, memória mais rica.

---

## 4. Ganho esperado (com números honestos)

| Vector | Baseline actual | Com integração | Delta |
|---|---|---|---|
| Tokens para classify com contexto de projecto | 3k-5k (lê CLAUDE.md + greps) | ~1k (graph + mem index) | **-60% a -70%** |
| Tempo para propagar nova regra de routing | Commit + deploy (~15min) | Editar `.base` no vault | **Minutos** |
| Recall de decisão passada | Grep em `docs/` / git log | `mem-search` ~100 tokens | **-90% tokens** |
| Auto-learning loop | Manual (Paulo revê logs) | Automático (hooks + export) | **~10× velocidade** |
| Accuracy de tier em prompts ambíguos | *medir na Fase 1* | *medir Fase 5* | Esperado **+15-25%** |

**Caveats honestos:**

- 71.5× é número de marketing do Graphify num cenário favorável. Não prometer isso ao investidor.
- claude-mem adiciona latência no SessionStart (hidrata contexto). Medir — se > 2s, optimizar.
- Stack soma 3 deps operacionais (Chroma, Bun, SQLite 3). Overhead aceitável para uma máquina de dev, a reavaliar para deploy cloud.
- A "source of truth" passar a ser um vault local implica disciplina de sync (Obsidian Sync ou Git-based) — tem de ser decidido antes da Fase 4.

---

## 5. Plano faseado — pronto para jogar no Claude Code

Cada fase = 1 master prompt auto-contido. Tiers recomendados seguem a doctrine.

---

### Fase 0 — Pré-requisitos & decisões bloqueantes

**Tier:** T2 (`model-reasoner`) para análise de licenças + scripting.

**Tarefas:**

1. **Licença claude-mem** — revê AGPL-3.0 no contexto de distribuição do Mooter.ai. Três caminhos:
   - (a) Aceitar AGPL → Mooter fica também AGPL quando distribuído como serviço.
   - (b) Usar como "tooling de dev" apenas, não embebido no produto final.
   - (c) Reescrever versão mínima MIT: 5 hooks + SQLite + schema próprio (~500 linhas, 2 sessões de trabalho).
   - **Output:** decisão documentada em `docs/LICENSE_DECISION_CLAUDE_MEM.md`.
2. **Vault bootstrap** — criar `~/mooter-brain/` vazio (Paulo já tem Obsidian instalado). Apontar Obsidian para ele. Inicializar git `git init` no vault (sync por git, não Obsidian Sync).
3. **Snapshot pré-integração** — commit tag `v-pre-graph-mem-vault` no repo Mooter. Se der merda, `git reset` para este ponto.

**Critério de aceitação:** decisão de licença em ficheiro, vault existe, snapshot tagged.

**Master prompt:**

```
# Fase 0 — Graph+Mem+Vault: decisões & bootstrap

Tier: T2 (model-reasoner)

Contexto: docs/MASTER_PROMPTS/GRAPH_MEMORY_VAULT_MASTER_PROMPT.md
(lê a secção 2.2 sobre a licença AGPL-3.0)

Tarefas:
1. Spawna model-reasoner para analisar AGPL-3.0 no contexto do Mooter.ai.
   Output: docs/LICENSE_DECISION_CLAUDE_MEM.md com 3 opções +
   recomendação justificada.
2. Cria ~/mooter-brain/ (vault). git init. .obsidian config mínimo.
3. Tag snapshot: git tag v-pre-graph-mem-vault && git push --tags
4. Actualiza SYNC.md secção "Pendentes" → marca Fase 0 done.

Sem PRs, sem deploys. Fase de preparação.
```

---

### Fase 1 — Baseline de tokens & custos

**Tier:** T2.

**Tarefas:**

1. Extrair 20-30 prompts históricos reais de `CHANGELOG_SESSIONS.md` + sessões recentes.
2. Para cada prompt, medir: tokens gastos, tier efectivamente escolhido pelo router, custo em USD, se houve correcção do user depois.
3. Computar médias por tier + distribuição.
4. Produzir `docs/BENCHMARK_PRE_INTEGRATION_2026-04-19.md`.

**Critério de aceitação:** ficheiro existe com tabela, médias, e gráfico (histogram ASCII ou Markdown-renderable).

Sem isto, qualquer ganho claimed depois é fé, não métrica.

---

### Fase 2 — Graphify integrado ao router

**Tier:** T3 para a arquitectura (`model-architect`), T1 para execução (`cheap-triage`).

**Tarefas:**

1. Instalar graphify como skill em `.claude/skills/graphify/`.
2. Correr primeira build: `graphify build hub/ docs/ --out ~/mooter-brain/graph/` → `graph.json` + export Obsidian.
3. Criar `hub/lib/graph-query.js` — wrapper thin sobre `graph.json`:
   - `dependents(path) → number`
   - `cluster(path) → string` (qual comunidade no grafo)
   - `similar(prompt_text, top_k=3) → [paths]`
4. Modificar `classify.js`:
   - Atrás de feature flag `MOOTER_USE_GRAPH=1`.
   - Se prompt referencia um path, consulta `dependents()`. Se > 3 → força T3.
   - Se prompt tem embedding próximo de cluster, injecta cluster name no contexto.
5. Cron: `graphify build` semanal + on `postcommit` de mudanças > 5 ficheiros.
6. A/B test em shadow mode: duplica 50% do tráfego pelo pipeline com graph, 50% sem. Compara tokens + accuracy por 7 dias. Output: `docs/AB_GRAPH_REPORT_*.md`.

**Critério de aceitação:** feature flag funciona, A/B report mostra diff mensurável (positivo ou negativo — ambos são resultado válido).

**Guardrail:** se graph.json > 14 dias, classify.js emite warning e degrade para baseline sem graph.

---

### Fase 3 — claude-mem (ou substituto) no pipeline

**Tier:** T3 para arq., T2 para implementação.

**Tarefas (se Fase 0 aprovou AGPL ou uso como dev-tool):**

1. Instalar via `npx claude-mem install` (após validar no dev environment primeiro).
2. Definir schema de observação custom:
   ```json
   {
     "type": "routing_decision",
     "prompt_hash": "<sha256 first 16>",
     "tier_chosen": "T0|T1|T2|T3",
     "subagent": "cheap-triage|local-summarizer|...",
     "tokens_used": 0,
     "cost_cents": 0,
     "session_id": "...",
     "user_correction": null,
     "outcome": "accepted|corrected|reverted"
   }
   ```
3. Hook `PostToolUse`: grava `routing_decision`.
4. Hook `UserPromptSubmit`: `mem-search` por prompts similares → injecta top 3 no contexto do router (antes do classify).
5. Script de back-populate: parser de `CHANGELOG_SESSIONS.md` + `git log` → seeding retroactivo da DB.
6. Feature flag: `MOOTER_USE_MEM=1`.

**Tarefas (se Fase 0 decidiu reescrita MIT):**

- Implementar versão mínima em `hub/lib/mem/` — 5 hooks + `better-sqlite3` + schema acima. Sem Chroma inicialmente (usar FTS5 do SQLite); adicionar vectores só se FTS5 não chegar.

**Critério de aceitação:** após 3 dias de uso real, `mem-search "similar routing"` devolve resultados relevantes em < 200ms.

---

### Fase 4 — Obsidian vault como interface humana

**Tier:** T2 + T1.

**Tarefas:**

1. Instalar `kepano/obsidian-skills` em `~/mooter-brain/.claude/`.
2. Estrutura final do vault:
   ```
   mooter-brain/
   ├── .claude/            # skills kepano + custom Mooter skills
   │   ├── skills/
   │   └── settings.json
   ├── rules/
   │   ├── tier-rules.base       # tabela: pattern | tier | rationale
   │   └── guardrails.base       # tabela: trigger | force_tier
   ├── patterns/           # Markdown, 1 ficheiro por padrão identificado
   ├── canvas/
   │   └── router-flow.canvas    # auto-gerado semanalmente
   ├── graph/              # output Graphify (symlink ou copy)
   └── sessions/           # export claude-mem, 1 ficheiro por semana
   ```
3. **Migrar regras hardcoded** de `classify.js` → `tier-rules.base`. classify.js passa a ler do vault com cache 1h (SessionStart hydrate).
4. Gerador `hub/jobs/canvas-from-mem.js`: consome claude-mem → produz `router-flow.canvas` com decision tree visual dos últimos N prompts.
5. Cron do canvas: diário.

**Critério de aceitação:** Paulo consegue adicionar uma rule editando `tier-rules.base` no Obsidian e vê-la aplicada na sessão seguinte, sem tocar em código.

---

### Fase 5 — Fechar o loop (feedback contínuo)

**Tier:** T3 (é onde a decisão arquitectural do auto-learning vive).

**Tarefas:**

1. **Consolidação semanal** (cron domingo 03:00):
   - claude-mem → export observações da semana → `sessions/WEEK_YYYY-WW.md`.
   - Graphify rebuild incremental.
   - Canvas regenerado.
   - Git commit automático no vault.
2. **Alarm:** se `user_correction` rate > 10% em 7 dias, spawn `model-architect` para propor nova rule.
3. **Métrica de sucesso mensal:** taxa de `user_correction` deve diminuir mês a mês. Plotada em `docs/AUTO_LEARNING_CURVE.md`, actualizada automaticamente.
4. **Rollback path:** se em qualquer momento o router com loop fechado perfomar pior que baseline (do Fase 1), feature flag off imediato. Fica o vault como documentação, sem influência no runtime.

**Critério de aceitação:** 30 dias após Fase 5 completar, gráfico de `user_correction` rate tem tendência descendente (slope negativo estatisticamente significativo).

---

## 6. Riscos & guardrails

| Risco | Severidade | Mitigação |
|---|---|---|
| AGPL contamina distribuição comercial do Mooter | Alta | Fase 0 decide; plano B = reescrita MIT |
| Graphify stale → router decide com dados podres | Média | Staleness warning > 14d, feature flag off automático |
| Latência acumulada (graph + mem + vault read) | Média | Cache agressivo, cada retrieval < 50ms p95 |
| Vault diverge entre máquinas do Paulo | Baixa | Vault é git repo, sync por push/pull |
| Dependência de vault local quebra CI/cloud | Alta se não mitigado | Todos os artefactos críticos têm fallback em ficheiros do repo Mooter |
| Chroma + Bun + SQLite = mais 3 coisas para manter | Média | Documentar em `INFRA.md`; health check no dashboard |
| Prompt injection via vault (user edita base com payload hostil) | Baixa (solo dev) | Sanitizar inputs do base antes de alimentar classify.js |

---

## 7. Primeira acção concreta — o que correr agora

**Cola isto no Claude Code (no root do repo Mooter) para iniciar a Fase 0:**

```
Vais executar a Fase 0 do plano em
docs/MASTER_PROMPTS/GRAPH_MEMORY_VAULT_MASTER_PROMPT.md

Tier: T2 (spawna model-reasoner para a decisão de licença).

Steps:
1. Lê o master prompt inteiro (secção 5, Fase 0).
2. Spawna model-reasoner com este prompt:
   "Analisa AGPL-3.0 no contexto de thedotmack/claude-mem
    sendo usado dentro do Mooter.ai. O Mooter é distribuído como
    CLI + worker Cloudflare. Produz docs/LICENSE_DECISION_CLAUDE_MEM.md
    com: (a) o que AGPL implica se claude-mem for embebido,
    (b) 3 caminhos (aceitar / só dev-tool / reescrever MIT),
    (c) recomendação justificada em 2 parágrafos."
3. Cria ~/mooter-brain/ vazio com git init + README.md mínimo.
4. Tag git do repo Mooter: v-pre-graph-mem-vault.
5. Actualiza SYNC.md — secção Pendentes → "Fase 0 done, aguarda
   review do Paulo antes de Fase 1".

Não avances para Fase 1 até o Paulo aprovar a decisão de licença.
```

---

## 8. Referências externas

- **Graphify** — https://github.com/safishamsi/graphify — MIT, agent skill para knowledge graph de codebase
- **claude-mem** — https://github.com/thedotmack/claude-mem — AGPL-3.0, memória persistente via hooks
- **obsidian-skills** — https://github.com/kepano/obsidian-skills — MIT, skills oficiais da Obsidian (Steph Ango)

## 9. Ligações internas

- `docs/MASTER_ARCHITECTURE.md` — contexto geral
- `docs/FEDERATED_LEARNING.md` — onde o loop fechado encaixa
- `docs/MASTER_PROMPTS/ROADMAP_MASTER_V2.md` — para alinhar prioridade
- `hub/lib/` — local onde entram `graph-query.js` e `mem/`
- `agents/` — onde o `cheap-triage`, `model-reasoner`, `model-architect` já vivem
