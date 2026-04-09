# SYNC.md — frugal

> Canal bidirecional entre Cowork (Claude Desktop) e Claude Code CLI.
> **Última actualização:** 2026-04-09 — Paulo via Cowork

---

## O que é o frugal

**Vibe Coder Intelligence Platform** — router inteligente de LLMs para Claude Code.

Classifica cada prompt em < 50 ms (regex puro, sem LLM) e emite um `<router-hint>` que direciona o modelo certo para o tier certo. Resultado: ~90 % de poupança vs usar Opus em tudo.

**Repositório:** `C:\Users\Paulo Loureiro\frugal\` (alias CLI: `~/frugal/`)

---

## Estado actual do projecto

### Versão em produção: v0.9.0 (commit `1e852f3`, 2026-04-09)

Tudo instalado e a correr em dogfood diário na máquina do Paulo.

| Componente | Estado |
|---|---|
| `classify.js` v3 | ✅ em prod — fast-paths, weighted scoring, tuned block, SHA-256 cache |
| `inject_context.js` | ✅ hook `UserPromptSubmit` activo |
| 6 subagents | ✅ `model-architect`, `model-reasoner`, `cheap-triage`, `local-summarizer`, `local-transformer`, `final-reviewer` |
| `backtest.js` + `update-router.js` | ✅ auto-learning loop activo — Task Scheduler @ 02:00 |
| `savings-tracker.js` + statusline v3 | ✅ 7 segmentos: git · brand · last-turn · distribution · savings/budget · GPU · provider dots |
| `gpu-probe.js` | ✅ NVIDIA/Apple Silicon/AMD/CPU fallback, poll 5 s |
| `POST /decision` + `/gpu` + `/last` | ✅ endpoints no savings-tracker |
| `docs/FEDERATED_LEARNING.md` | ✅ protocolo delta-export + `aggregate-deltas.js` |
| 59/59 testes | ✅ `node:test` |
| Replay: ~90 % savings | ✅ validado em 1 437 prompts reais |

### Próximo milestone: v0.6.0 — Web dashboard

Dashboard local `127.0.0.1:7820` em Next.js 15.

- 🟡 Timeline de decisões (24h/7d/30d)
- 🟡 Filtros por tier, categoria, escalation, confidence
- 🟡 Cost trend chart (naive vs real)
- 🟡 Botão "Retrain now" → `/update-router` + diff
- 🟡 Preview `router-tuning.json` com pattern explainer

**Success criteria:** Paulo consegue debugar qualquer misrouting em < 30 s sem grep.

### Backlog relevante

- v0.7.0 — `HIGH_RISK` single source of truth (extrair `patterns.js` partilhado)
- v0.8.0 — Team shared config via Git
- v1.0.0 — `frugal-hub` Cloudflare Worker (federated learning + billing OSS)

---

## Ficheiros-chave

```
~/frugal/
  tools/router/
    classify.js          ← classifier principal
    inject_context.js    ← hook UserPromptSubmit
    backtest.js          ← auto-learning analyser
    update-router.js     ← patcher idempotente do classify.js
    savings-tracker.js   ← servidor de métricas + statusline
    gpu-probe.js         ← telemetria GPU
    aggregate-deltas.js  ← federated learning aggregator
  agents/                ← 6 subagents
  docs/                  ← ROUTING_POLICY, HOW_IT_WORKS, MODEL_MAPPING, etc.
  ROADMAP.md             ← source of truth de versões
  ARCHITECTURE.md        ← diagrama técnico completo
  CLAUDE.md              ← doutrina pessoal do Paulo (lida por Claude Code)
```

---

## Notas de contexto

- **Não confundir** com *Cloude Home* (hub local Windows) nem com *Cloude Speaker* (webapp voz). São projectos separados.
- O `CLAUDE.md` nesta pasta é a **doutrina de roteamento do Paulo** — aplica-se a todas as sessões Claude Code no projecto frugal.
- O Task Scheduler Windows tem a tarefa `FrugalRouterBacktest` agendada às 02:00 diárias.
- Ollama corre localmente com `qwen3:30b` para os tiers T0/T1 baratos.

---

## Para o Claude Code (ao ler este ficheiro)

1. Lê `ROADMAP.md` para perceber o estado exacto de cada versão.
2. Lê `ARCHITECTURE.md` para entender o fluxo técnico antes de tocar em código.
3. O próximo trabalho activo é **v0.6.0 — dashboard**. Nada do backlog foi iniciado.
4. Todos os testes estão em `node:test`. Corre `node --test` na raiz antes de qualquer PR.
5. A doutrina de roteamento em `CLAUDE.md` aplica-se a esta sessão — usa os tiers e subagents correctos.

---

## 📥 COWORK → CLAUDE CODE
### Instruções e decisões tomadas no Cowork para a próxima sessão
> Esta secção é escrita pelo Cowork. O Claude Code deve lê-la no início de cada sessão, antes de qualquer trabalho.
> Após lida e aplicada: escrever "✅ Lido em sessão #N — [data]" e limpar as instruções.

**Última actualização Cowork:** 2026-04-09
**Estado:** 🟡 Por ler

---

### Contexto da sessão Cowork (2026-04-09)

**O que foi feito nesta sessão Cowork:**

1. **SYNC.md criado** em `~/frugal/` (não existia). É este ficheiro — canal bidirecional entre Cowork e Claude Code.

2. **VS Code configurado** — `.vscode/` criado de raiz com:
   - `settings.json` — formatOnSave, file nesting (classify.js↔tuning.json, CLAUDE.md↔SYNC.md), `FRUGAL_ROOT` env var
   - `tasks.json` — 10 tasks: run tests, classify prompt, backtest, backtest --explain/--export-delta, update-router, update-router --dry-run, savings-tracker, stats, replay
   - `launch.json` — 6 debug configs para classify.js, backtest, update-router --dry-run, savings-tracker, testes
   - `extensions.json` — ESLint, Prettier, GitLens, GitHub PR, ErrorLens, Markdownlint, shellcheck
   - `frugal.code-workspace` — actualizado com nome e settings partilhadas

3. **Notion HQ actualizado** (`frugal — Model Router HQ`):
   - Versão: v0.8.0 → **v0.9.0**
   - Métricas: 56/56 → **59/59** testes, 1,370 → **1,437** prompts
   - Roadmap: v0.9.0 marcado shipped, **v0.6.0 dashboard** como próximo milestone
   - File Map: adicionados `gpu-probe.js`, `aggregate-deltas.js`, `replay.js`, `SYNC.md`
   - Secção VS Code Workspace adicionada

4. **GitHub verificado** — repo local em par com `origin/main`, tag `v0.9.0` existe.

---

### Próximas tarefas para o Claude Code

**Prioridade 1 — Commit os novos ficheiros**
Os seguintes ficheiros existem localmente mas não estão versionados:
- `.vscode/settings.json`, `.vscode/tasks.json`, `.vscode/launch.json`, `.vscode/extensions.json`
- `SYNC.md`
- `frugal.code-workspace` (actualizado)

Commit sugerido:
```
chore: add VS Code workspace config and SYNC.md

- .vscode/: settings, tasks (10), launch (6 configs), extensions
- SYNC.md: bidirecional Cowork <-> Claude Code channel
- frugal.code-workspace: updated with workspace name and shared settings
```

**Prioridade 2 — Iniciar v0.6.0 (Web Dashboard)**
Próximo milestone. Nada foi ainda iniciado.
- Next.js 15 app em `dashboard/` (ou pasta a decidir)
- Bound a `127.0.0.1:7820`
- Lê de `decisions.log` + `router-tuning.json` via savings-tracker.js ou novo `dashboard.js`
- Features: timeline (24h/7d/30d), filtros, cost trend, "Retrain now", pattern explainer
- **Success criteria:** debug de qualquer misrouting em < 30 s sem grep

**Prioridade 3 — Testes visuais da statusline** (pendente de v0.9.0)
3 cenários a testar manualmente (não automatizáveis em one-shot):
- Statusline correcta quando todos os providers estão up
- Statusline correcta quando Ollama está down
- Statusline correcta com budget > 85%

**Quando terminares a sessão:**
Actualiza o corpo deste SYNC.md com o estado real pós-sessão e marca esta secção como `✅ Lido em sessão #N — [data]`.
