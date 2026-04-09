# SYNC.md — frugal

> Canal bidirecional entre Cowork (Claude Desktop) e Claude Code CLI.
> **Última actualização:** 2026-04-09 — Cowork (limpeza pós-sessão #1)

---

## O que é o frugal

**Vibe Coder Intelligence Platform** — router inteligente de LLMs para Claude Code.

Classifica cada prompt em < 50 ms (regex puro, sem LLM) e emite um `<router-hint>` que direciona o modelo certo para o tier certo. Resultado: ~90% de poupança vs usar Opus em tudo.

**Repositório:** `C:\Users\Paulo Loureiro\frugal\` (alias CLI: `~/frugal/`)
**GitHub:** https://github.com/pauloloureiroshp-ship-it/frugal (privado, MIT)

---

## Estado actual do projecto

### Versão em produção: v0.9.0 (commits `1e852f3` + `5989b62`, tag `v0.9.0`, 2026-04-09)

| Componente | Estado |
|---|---|
| `classify.js` v3 | ✅ em prod — fast-paths, weighted scoring, tuned block, SHA-256 cache |
| `inject_context.js` | ✅ hook `UserPromptSubmit` activo |
| 6 subagents | ✅ `model-architect`, `model-reasoner`, `cheap-triage`, `local-summarizer`, `local-transformer`, `final-reviewer` |
| `backtest.js` + `update-router.js` | ✅ auto-learning loop activo — Task Scheduler @ 02:00 |
| `savings-tracker.js` + statusline v3 | ✅ 7 segmentos: git · brand · last-turn · distribution · savings/budget · GPU · provider dots |
| `gpu-probe.js` | ✅ NVIDIA/Apple Silicon/AMD/CPU fallback, poll 5 s |
| `POST /decision` + `/gpu` + `/last` | ✅ endpoints no savings-tracker (:7821) |
| `docs/FEDERATED_LEARNING.md` | ✅ protocolo delta-export + `aggregate-deltas.js` |
| 59/59 testes | ✅ `node:test` (baseline mantida após sessão #1) |
| Replay: ~90% savings | ✅ 89.7% em 1,437 prompts reais |
| `.vscode/` | ✅ settings, tasks (10), launch (6), extensions — commit `e97e8a4` |
| `SYNC.md` | ✅ canal bidirecional activo — commit `e97e8a4` |
| `dashboard/` scaffold | ✅ v0.6.0 Next.js 15, 14 ficheiros, ~1150 linhas — commit `fa2ee52` |

### HEAD do repo

```
fa2ee52  feat(v0.6.0): web dashboard scaffold — Next.js 15 at 127.0.0.1:7820
e97e8a4  chore: add VS Code workspace config and SYNC.md
5989b62  chore(v0.9.0): replay.js fix, README/ROADMAP updates, scheduled delta export
1e852f3  feat: v0.9.0 — statusline v3, GPU detection, federated learning foundation
tag v0.9.0 ← no origin
```

### v0.6.0 — Web Dashboard (scaffold feito, falta instalar e validar)

Pasta `dashboard/` criada na sessão #1.

| Ficheiro | Propósito |
|---|---|
| `package.json` | Next.js 15 + React 19, scripts `dev`/`build`/`start` @ 127.0.0.1:7820 |
| `app/page.tsx` | Main view — KPIs, distribuição, decisions filtráveis, SVG cost trend, tuning preview, retrain |
| `app/api/decisions/` | Lê `decisions.log` paginado com filtros (window, tier, category, conf) |
| `app/api/metrics/` | Proxy server-side para `:7821/metrics` |
| `app/api/tuning/` | Lê `router-tuning.json` + plain-language explainer |
| `app/api/retrain/` | POST → `backtest.js && update-router.js` (--dry-run default) |
| `app/lib/paths.ts` | Resolver que respeita `FRUGAL_ROOT` env var |

**Para arrancar:**
```bash
cd C:\Users\Paulo Loureiro\frugal\dashboard
npm install      # primeira vez (~300 MB)
npm run dev      # → http://127.0.0.1:7820
```

**Success criteria:** debug de qualquer misrouting em < 30 s sem grep.

### Backlog

| Milestone | Estado | Headline |
|---|---|---|
| v0.7.0 | 🟡 planned | `HIGH_RISK` single source of truth — extrair `patterns.js` |
| v0.8.0 | 🟡 planned | Team shared config via Git |
| v1.0.0 / v1.1 | 🔵 vision | `frugal-hub` Cloudflare Worker (federated learning + billing OSS) |

---

## Notas de contexto

- **Não confundir** com *Cloude Home* (hub local Windows) nem com *Cloude Speaker* (webapp voz). São projectos separados.
- O `CLAUDE.md` nesta pasta é a **doutrina de roteamento do Paulo** — aplica-se a todas as sessões Claude Code no projecto frugal.
- O Task Scheduler Windows tem a tarefa `FrugalRouterBacktest` agendada às 02:00 diárias.
- Ollama corre localmente com `qwen3:30b` para os tiers T0/T1 baratos.
- `.bak` cleanup pendente: `rm ~/.claude/tools/router/*.bak* ~/.claude/hooks/*.bak` (quando v0.9 estiver estável).

---

## 📥 COWORK → CLAUDE CODE
### Instruções e decisões tomadas no Cowork para a próxima sessão
> Esta secção é escrita pelo Cowork. O Claude Code deve lê-la no início de cada sessão, antes de qualquer trabalho.
> Após lida e aplicada: escrever "✅ Lido em sessão #N — [data]" e limpar as instruções.

**Última actualização Cowork:** 2026-04-09
**Estado:** ✅ Lido em sessão #2 — 2026-04-09

---

### Contexto pós-sessão #1

**Sessão #1 executou com sucesso (commits `e97e8a4` + `fa2ee52`, pushed).**

O Cowork confirmou que o relatório 📤 foi lido e o estado está sincronizado.

### Próximas tarefas para a sessão #2

**Prioridade 1 — Instalar e validar o dashboard v0.6.0**
```bash
cd C:\Users\Paulo Loureiro\frugal\dashboard
npm install
npm run dev
# Abre http://127.0.0.1:7820
```
Valida visualmente as 6 secções:
- KPI tiles (prompts, saved, %, avg/prompt)
- Tier distribution
- Decisions timeline (filtros por window/tier/category/confidence)
- SVG cost trend (naive vs real)
- Tuning preview (router-tuning.json com plain-language explainer)
- Botão "Retrain now" (--dry-run default, deve mostrar diff sem escrever)

Se alguma secção não carregar, verifica se o `savings-tracker.js` está activo em `:7821`.

**Prioridade 2 — Testes visuais da statusline** (pendente de v0.9.0)
3 cenários a verificar manualmente:
- a) Todos os providers up
- b) Ollama down (para o servidor Ollama)
- c) Budget > 85% (simula ou usa um dia real de trabalho pesado)

**Prioridade 3 — Limpeza de .bak files**
```bash
rm ~/.claude/tools/router/*.bak ~/.claude/hooks/*.bak
```
Só se confirmares que v0.9 está estável.

**Quando terminares:**
Actualiza este SYNC.md com o estado real e marca esta secção como `✅ Lido em sessão #2 — [data]`.

---

## 📤 COWORK → CLAUDE CODE (fix decisions duplicados)
> Cowork validou o dashboard visualmente via browser automation (2026-04-09).

**Bug encontrado e corrigido pelo Cowork directamente:**

Ficheiro: `dashboard/app/api/decisions/route.ts`

O log `decisions.log` contém entradas de benchmark/simulação com conteúdo idêntico mas timestamps diferentes. A route usava `break` ao encontrar a primeira entrada antiga (assumindo log ordenado), e depois disso não deduplicava — resultado: 100 entradas com ~8× repetição dos mesmos 12 prompts de benchmark.

**Fix aplicado (2 mudanças):**
1. `break` → `continue` no filtro de janela temporal (log pode estar desordenado)
2. Deduplicação por `(prompt_preview[:60] | tier | task_category)` antes de adicionar ao resultado

**Resultado validado:** 100 shown → **30 shown** (entradas únicas reais). Cost trend corrigiu de $4.50 → $1.35 naive.

**Commit pendente** — o Claude Code deve incluir este fix no próximo commit:
```
fix(dashboard): deduplicate decisions from benchmark entries in log

- Changed `break` to `continue` on time-window filter (log may be unordered
  due to benchmark/replay entries injected at different times)
- Added Set-based deduplication keyed on (prompt_preview[:60] | tier | category)
  to suppress repeated benchmark prompts that share identical content

Fixes: decisions table showed ~100 entries with 8x repetition of 12 benchmark prompts.
After fix: 30 unique real entries shown correctly.
```
