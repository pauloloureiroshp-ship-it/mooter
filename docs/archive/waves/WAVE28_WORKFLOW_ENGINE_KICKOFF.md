# WAVE 28 — Mooter Workflow Engine (Local-First) · KICKOFF

**Composto:** 2026-06-06 ~23h BRT, Cowork
**Sequência:** Wave 27 SHIPPED → **Wave 28**
**Tag esperada:** `v1.16.0-workflow-engine-mvp`
**Estimate:** ~20-25h CC autonomous (1 wave grande, 5 dias com gates intermédios)
**Mode:** `--dangerously-skip-permissions` (Paulo observador)
**Owner:** Paulo + CC autonomous

---

## 🎯 Posicionamento estratégico (LER PRIMEIRO)

**Esta wave NÃO é invenção nova.** É a materialização do **Layer 10 — Skill Graph (Task Decomposition Routing)** da `ARCHITECTURE_V4.md` (gap nº 4, linhas 90-110 do V4 doc).

V4 antecipou isto há **2 meses**:

> *"Routing 1-prompt-1-modelo é o paradigma de 2024. O paradigma de 2026 é task graph routing: 1 prompt vira N subtasks, cada uma com modelo certo, executadas em DAG."* — ARCHITECTURE_V4.md §2.4

A Anthropic shipped Dynamic Workflows em 2026-05-28 (3 semanas atrás). Mooter foi previsto para ter isto na V4 — agora **construímos**.

**Diferencial defensável vs Anthropic:**

| Dimensão | Anthropic Dynamic Workflows | Mooter Workflow Engine |
|---|---|---|
| Worker pool | Sonnet/Opus cloud | Ollama local (qwen2.5-coder:7b, qwen3:30b) |
| Cost/run | $30-$300 | ~$0.45 (apenas script writer + synthesis Opus) |
| Privacy | Código sai para Anthropic | Local-first (apenas prompt + synthesis) |
| Resume | Same session | **Cross-session** (SQLite state) |
| Plan-gated | Max/Team/Enterprise only | All tiers (Mooter is OSS) |
| Concurrency | 16 cloud | ~8 local (RTX 4090) |

---

## ⚠️ NÃO QUEBRAR — Lista oficial (gate verification obrigatória)

### Stack actual (CONGELADA — nem tocar)

| Componente | Path | Razão |
|---|---|---|
| `classify.js` | `tools/router/classify.js` | sha256 `7b01eb86…87762` — **gate test obrigatório no end** |
| `inject_context.js` (hook UserPromptSubmit) | `tools/router/inject_context.js` | Path crítico — qualquer mudança quebra routing |
| Subagents existentes | `.claude/agents/` (model-architect, model-reasoner, cheap-triage, local-summarizer, local-transformer, final-reviewer) | Auto-learning depende destes nomes |
| `subagentstop_hook.js` | `tools/router/subagentstop_hook.js` | Wave 22 foundation, herd-50 protected |
| `mooter sync` | `packages/cli/src/sync/` | Wave 26 SHIPPED, sync_events live |
| CF Worker endpoints existentes | `hub/routes/*.js` (delta, events, feedback, heartbeat, models, stats, sync_events, version) | Production, breaking = downtime |
| Pastor state schema | `hub/migrations/001-011` | Wave 26 SHIPPED, pastor_state populated |
| Statusline format actual | `tools/router/statusline-multi.js`, `gsd-statusline.js` | UI contract com users existentes |
| Token tracker | `tools/router/token_tracker.js` (Wave 22) | Dashboard depende |
| Savings tracker | `tools/router/savings-tracker.js` | Statusline depende |

### Princípios V4 não-negociáveis (LEMBRAR sempre)

1. **No proxy** — Workflow Engine NUNCA senta entre user e LLM. Se morre, Claude Code continua.
2. **Zero LLM cost na classificação** — workflow detection é regex/keyword (não chamar LLM para decidir se é workflow).
3. **Doctrine > configuration** — workflow primitives são markdown + JS, não YAML.
4. **Explainability** — cada workflow run tem `reasoning` em cada decisão (porquê este worker, porquê este modelo).
5. **Doctrine nunca cede ao optimizador** — workflows não podem bypass guardrails (push/deploy/secrets sempre T3, mesmo dentro de workflow).

---

## 📐 Arquitectura proposta (zero modificação de existente)

### Novo package: `packages/workflow/`

```
packages/workflow/                    # NOVO — separado de @mooter/cli
├── src/
│   ├── index.ts                      # Entry point
│   ├── runtime.ts                    # Sandboxed VM (isolated-vm)
│   ├── agent.ts                      # agent() API (Ollama/Claude HTTP)
│   ├── pool.ts                       # Concurrency manager (p-limit)
│   ├── primitives.ts                 # parallel, vote, converge, checkpoint
│   ├── state.ts                      # SQLite checkpoint store
│   ├── writer.ts                     # Script writer (Claude Opus API call)
│   ├── presenter.ts                  # Plan presentation + user approval
│   └── tui.ts                        # Terminal UI (ink) — /workflows progress
├── tests/
│   ├── runtime.test.ts
│   ├── primitives.test.ts
│   ├── pool.test.ts
│   ├── state.test.ts
│   └── e2e.test.ts
└── package.json
```

### Novo subcomando: `mooter workflow`

```
packages/cli/src/commands/workflow.ts  # NOVO — apenas DELEGA para packages/workflow
```

**API CLI:**

```bash
# Criar workflow (writer = Opus, 1 call)
mooter workflow create "audit src/ for unused exports"
# → escreve .mooter/workflows/<auto-name>.js
# → mostra plano: phases + agent counts + token estimate
# → pede aprovação user
# → executa em background, devolve run_id

# Listar
mooter workflow list

# Watch progress (TUI)
mooter workflow watch <run_id>

# Saved workflow (idempotente)
mooter workflow run <name>

# Stop / pause / resume
mooter workflow stop <run_id>
mooter workflow resume <run_id>
```

### Skill `/workflows` para Claude Code

```
.claude/skills/workflows/          # NOVO
├── SKILL.md                        # Documentation
└── examples/
    ├── audit-codebase.js
    └── deep-research.js            # Replica /deep-research da Anthropic
```

**Trigger:** prompt contém keyword `workflow` OU `audit codebase` OU `migrate ... files` OU explicit `/workflows`.

### Novo endpoint CF Worker: `/v1/workflows`

```
hub/routes/workflows.js              # NOVO
hub/migrations/012_workflow_runs.sql  # NOVO
```

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS workflow_runs (
  run_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  workflow_name TEXT,
  ts_start INTEGER NOT NULL,
  ts_end INTEGER,
  num_phases INTEGER,
  num_agents_total INTEGER,
  num_agents_local INTEGER,
  num_agents_cloud INTEGER,
  duration_ms INTEGER,
  status TEXT,                      -- 'running' | 'completed' | 'failed' | 'cancelled'
  estimated_savings_usd REAL,
  actual_cost_usd REAL,
  doctrine_violations INTEGER DEFAULT 0
);

CREATE INDEX idx_workflow_device ON workflow_runs(device_id, ts_start);
```

**Pastor integration:** após N runs, Pastor pode aprender padrões e sugerir "this task tends to need N workers, you used M".

### Statusline integration (opt-in, sem quebrar formato actual)

`tools/router/gsd-statusline.js` é **NÃO TOCADO**. Em vez disso:

```
tools/router/workflow-status.js     # NOVO — emite linha extra quando há run activa
```

Quando há workflow a correr, statusline mostra linha 3 (não modifica linhas 1-2 existentes):

```
🐮 saved $2.51 today · 84% vs all-Opus · last 10 T0:6 T1:3 T2:1   ← Linha 1 (intacta)
🔥 T3 opus · conf 0.90 · exec opus                                  ← Linha 2 (intacta)
🔄 workflow: audit-unused-exports · phase 2/4 · 12/50 agents       ← Linha 3 (NOVA, opt-in)
```

---

## 🔍 Phase A — Day 0 Honest Recon (T0/T1, 30min) 🔥

**ANTES de tocar em código:**

1. **Inventory packages:**
   ```bash
   ls packages/                        # Confirmar existem: cli, possivelmente workflow
   cat packages/cli/package.json       # Stack actual
   ```

2. **Confirmar V4 doctrine:**
   ```bash
   grep -n "Skill graph\|Layer 10\|task decomposition" docs/strategy/ARCHITECTURE_V4.md
   ```

3. **Validar que classify.js intocado:**
   ```bash
   sha256sum tools/router/classify.js
   # Esperado: começa com 7b01eb86…
   ```

4. **Subagents disponíveis:**
   ```bash
   ls ~/.claude/agents/                # Confirmar 6 subagents existentes
   ```

5. **CF Worker config:**
   ```bash
   grep -E "^\[" hub/wrangler.mooter.toml
   ```

6. **Ollama local available?**
   ```bash
   curl -s http://localhost:11434/api/tags | head -200
   ```

**Output obrigatório:** `docs/strategy/WAVE28_DAY0_FINDINGS.md` com:
- Stack atual confirmada
- Premissas do brief que precisam ajuste
- Modelos Ollama disponíveis (qwen2.5-coder, qwen3 disponíveis?)
- Concurrency teórica (VRAM disponível)
- Path forward final

**SE alguma premissa core falhar (ex: Ollama indisponível), PARA e reporta antes de continuar.**

---

## 📋 Phases B-J (executar pela ordem)

### Phase B — Package skeleton + CLI entry (T2 Sonnet, 2h)

- Criar `packages/workflow/` com `package.json`, `tsconfig.json`, `src/`, `tests/`
- Dependências: `isolated-vm`, `better-sqlite3`, `p-limit`, `ink`, `ink-table`, `node-fetch`, `chalk`
- `packages/workflow/src/index.ts` — entry point
- `packages/cli/src/commands/workflow.ts` — apenas delega
- `packages/cli/src/index.ts` — adiciona case `workflow` (não modifica casos existentes)
- Unit test: `mooter workflow --help` mostra usage

**Gate:** unit tests pass. Mooter existing tests (333 currently) **todos ainda passam**.

### Phase C — agent() API + Ollama pool (T2 Sonnet, 4h)

- `packages/workflow/src/agent.ts`:
  - Suporta `{model: 'qwen2.5-coder:7b', prompt, tools, max_tokens}`
  - Backends: `ollama` (default), `claude-api` (para Opus/Sonnet/Haiku)
  - Tools support: Read, Grep, Glob (reusar leitura existente do CLI)
  - Returns: `{result, tokens_in, tokens_out, latency_ms, cost_usd}`
- `packages/workflow/src/pool.ts`:
  - Concurrency manager via `p-limit`
  - Auto-detect optimal concurrency baseada em VRAM (`tools/router/vram_detect.js` já existe — IMPORTAR, não recriar)
  - Queue overflow: graceful degradation

**Gate:** integration test corre 5 agents em paralelo contra Ollama mock + Ollama real (se disponível).

### Phase D — Workflow primitives (T2 Sonnet, 3h)

`packages/workflow/src/primitives.ts`:

```typescript
export async function parallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: { concurrency?: number } = {}
): Promise<R[]>;

export async function vote<R>(
  candidates: R[],
  voteFn: (candidates: R[]) => Promise<R[]>
): Promise<R[]>;

export async function converge<R>(
  initial: R[],
  refineFn: (r: R) => Promise<R | null>,
  maxIterations?: number
): Promise<R[]>;

export async function checkpoint(
  name: string,
  data: any
): Promise<void>;

export async function log(
  message: string,
  metadata?: Record<string, any>
): Promise<void>;
```

**Gate:** unit tests pass para cada primitive isoladamente + 1 e2e que encadeia parallel → vote → checkpoint.

### Phase E — Sandboxed runtime (T3 Opus, 4h) 🔒 CRÍTICO

`packages/workflow/src/runtime.ts`:
- Usar `isolated-vm` (V8 isolates, não `vm2` que tem CVEs históricos)
- Expor APIs: `mooter.agent()`, `mooter.parallel()`, etc.
- NÃO expor: `fs`, `child_process`, `process`, `require()` directo
- Timeout per script: 4h max
- Memory limit per isolate: 512MB

**Gate:** security test — script malicioso (`process.exit`, `require('fs')`) **deve** falhar.

### Phase F — SQLite checkpoint store (T2 Sonnet, 2h)

`packages/workflow/src/state.ts`:
- `~/.mooter/workflows/state.db` (SQLite via `better-sqlite3`)
- Tables: `runs`, `checkpoints`, `agents`
- API: `saveCheckpoint(run_id, name, data)`, `loadRun(run_id)`, `resumeFrom(run_id)`

**Gate:** unit test — start run, kill process, restart, resume continua exactly where left off.

### Phase G — Script writer + plan presenter (T2 Sonnet, 3h)

`packages/workflow/src/writer.ts`:
- Aceita prompt user em natural language
- Chama Claude Opus (Anthropic API) UMA vez
- System prompt rigoroso: "Write a workflow.js using mooter.agent(), mooter.parallel(), mooter.vote(), mooter.checkpoint(). Available models: ..."
- Returns: JS script + execution plan (phases, agent counts, token estimate)

`packages/workflow/src/presenter.ts`:
- Mostra plano ao user em tabela bonita (`ink-table`)
- Opções: [Yes, run] [View script] [Cancel] [Edit prompt]
- Em `--dangerously-skip-permissions`, auto-aceita

**Gate:** e2e test — `mooter workflow create "test prompt"` produz script válido + plan + executa em modo dry-run.

### Phase H — Hub telemetry + Pastor integration (T2 Sonnet, 2h)

- `hub/routes/workflows.js` — POST `/v1/workflows` para guardar run metadata
- `hub/migrations/012_workflow_runs.sql` — schema (acima)
- `tools/router/workflow-status.js` — emite linha statusline opcional (linha 3)
- Pastor pull endpoint passa a incluir `workflow_hints` quando há padrões

**Gate:** smoke `curl -X POST /v1/workflows -d '{...}'` devolve 200 + row em D1.

### Phase I — Demo workflow + skill (T1 Haiku, 2h)

- `.claude/skills/workflows/SKILL.md` — docs do skill
- `.claude/skills/workflows/examples/audit-unused-exports.js` — workflow exemplo
- Demo: `mooter workflow run audit-unused-exports --target src/` produz relatório real
- Tweet draft em `audit/TWEET_WORKFLOWS_LAUNCH.md`

**Gate:** demo corre end-to-end com Ollama local + Opus synthesis, produz output JSON válido.

### Phase J — Final-reviewer + PR + merge + tag (T3 Opus, 1h)

- `final-reviewer` (Opus) sobre o branch wave28-workflow-engine
- Critério: **zero HIGH**, classify.js sha intacto, todos os 333 tests existentes ainda passam, novos 50+ tests passam
- PR `wave28-workflow-engine` → `dev`
- CI verde
- PR `dev` → `main`
- **Tag DEPOIS do merge:** `v1.16.0-workflow-engine-mvp` em new main HEAD

---

## 🛡️ Anti-pattern checklist (não fazer)

| Tentação | Razão para NÃO fazer |
|---|---|
| Modificar `classify.js` para detectar workflows | Quebra sha integrity. Detection vive em CLI, não no classifier |
| Substituir `inject_context.js` hook | Não precisa. Workflow é separate code path. |
| Renomear subagents existentes para "worker" / "reviewer" | Quebra auto-learning. Adiciona novos prefixados `wf-` |
| Adicionar workflow logic ao Pastor pull-based loop existente | Pastor permanece intocado. Workflow telemetria é tabela separada |
| Tornar `mooter sync` ciente de workflows | Sync envia routing decisions. Workflows enviam run metadata para `/v1/workflows`. Endpoints separados |
| Modificar D1 schema existente (migrations 001-011) | Adicionar migration 012 nova. Zero touch em existing |
| Substituir statusline format | Adicionar linha 3 opt-in. Linhas 1-2 intactas |
| Usar `vm2` em vez de `isolated-vm` | vm2 tem CVEs históricos de sandbox escape |
| Hardcoded Ollama URL | Reusar `tools/router/ollama_call.sh` lógica + config existente |
| Recriar VRAM detection | `tools/router/vram_detect.js` já existe — IMPORTAR |

---

## 🎯 Triple-stack play (já alinhado com V4)

Esta wave naturalmente entrega:

1. **Skill** — `.claude/skills/workflows/SKILL.md` com slash command `/workflows`
2. **Plugin** — Wave 29 podemos empacotar como Claude Code plugin distribuível
3. **MCP server** — Wave 30 podemos expor `mooter_workflow_create` / `mooter_workflow_run` via MCP

Triple-stack é o sinal técnico mais forte para Anthropic — exactamente como V4 §1.3 prevê.

---

## 📊 Sucesso / falha critérios

### Sucesso (tag v1.16.0)

- [ ] `mooter workflow create "audit src/ for X"` funciona end-to-end
- [ ] Demo workflow corre 5+ agents Ollama em paralelo
- [ ] Cross-session resume validado (kill mid-run, retomar, completa)
- [ ] classify.js sha intacto (`7b01eb86…`)
- [ ] Subagents existentes intactos (todos os 6)
- [ ] Existing 333 tests ainda passam
- [ ] Novos 50+ tests passam
- [ ] Hub endpoint `/v1/workflows` LIVE
- [ ] Statusline linha 3 mostra workflow status quando activo
- [ ] Cost real run demo < $0.50 (apenas script writer + synthesis)
- [ ] Pastor pull devolve `workflow_hints` (vazio é OK, mas campo existe)
- [ ] final-reviewer PASS sem HIGH

### Falha (revert)

- [ ] Qualquer test existing falha
- [ ] classify.js sha muda
- [ ] Subagent existente afectado
- [ ] CF Worker existing endpoint quebra
- [ ] Pastor pull break
- [ ] Sandbox escape vulnerability

---

## 🔜 Roadmap futuro (Wave 29-31)

| Wave | Goal | Estimate |
|---|---|---|
| **29** | Adversarial review + convergence quality benchmark | 15h |
| **30** | Resume cross-session polish + TUI bonito + marketing launch | 15h |
| **31** | LoRA Pastor specialization para workflow patterns + auto-trigger | 12h |

---

## 📚 Recursos canónicos

- `docs/strategy/MOOTER_DYNAMIC_WORKFLOW_LOCAL.md` — design doc completo (composto Wave 27)
- `docs/strategy/ARCHITECTURE_V4.md` — Layer 10 (Skill graph) reference
- `docs/strategy/ROUTING.md` — princípios non-negotiable
- `docs/strategy/STRATEGY.md` — Single Source of Truth strategy
- [Anthropic Dynamic Workflows blog](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code)
- [Claude Code Workflows docs](https://code.claude.com/docs/en/workflows)

---

## ⏱️ Estimativa total

| Fase | Horas | Tier predominante |
|---|---|---|
| A — Day 0 Recon | 0.5 | T0/T1 |
| B — Package skeleton | 2 | T2 |
| C — agent + pool | 4 | T2 |
| D — Primitives | 3 | T2 |
| E — Sandbox runtime | 4 | **T3** |
| F — SQLite checkpoint | 2 | T2 |
| G — Script writer + presenter | 3 | T2 |
| H — Hub + Pastor integration | 2 | T2 |
| I — Demo + skill | 2 | T1 |
| J — Gate + PR + tag | 1 | T3 |
| **Total** | **23.5h** | |

Em modo dangerous, CC executa autonomously com Paulo a observar. Reportes por Phase obrigatórios.

---

*Brief composto pelo Cowork durante Wave 27 a correr. Pre-implementation review por Paulo recomendado.*
