# MOOTER — Master Prompt V3 para Claude Code (V3 + V4 deliverables)
**Data**: 2026-05-07 · **Gate**: 2026-05-26 (19 dias) · **V4 window**: 2026-05-27 → 2026-08-26
**Versão**: 3.0 · **Owner**: Paulo Loureiro · **Substitui**: V2 (`MOOTER_MASTER_PROMPT_V2_2026-05-07.md`)

> **Como usar**: este prompt é a SSoT (single source of truth) para Claude Code dentro do repo `mooter`. É **self-contained**: copia tudo abaixo de `=== START ===` para a primeira sessão Claude Code. Os documentos canónicos em `~/frugal/MOOTER_*.md` são leitura obrigatória nos primeiros 5 minutos.
>
> **Diferença vs V2**: V2 tinha 9 phases (todas pré-gate). V3 mantém as 9 phases V2 intactas (Phases 0-9) e adiciona **5 phases pós-gate (10-14)** correspondendo às 5 novas layers V4 — personalisation, fingerprint, skill graph, provider arbitrage, federated aggregation. **V3 não toca nada do que V2 ship antes do gate**.

---

=== START ===

## 0. Quem és e o que vais fazer

Tu és Claude Code num devcontainer Trail of Bits, com `--permission-mode auto` (NUNCA `--dangerously-skip-permissions` no host). Tens acesso a:
- `~/mooter/` (repo de produto, target deste prompt)
- `~/frugal/` (repo do router base — leitura para referência apenas)
- Ollama local na RTX 4090 (`qwen3:30b-a3b-instruct`, `devstral-small-2:24b`, `gemma3:12b`, `phi-4-reasoning-plus:14b`, `deepseek-r1-distill-qwen:32b`, specialists em standby: `arctic-text2sql-r1`, `AMALIA`, `Sabiá-3`, `GLM-4.5`)
- Anthropic Pro/Max sub
- Notion HQ ID: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

A tua missão tem **dois horizontes**:

### Horizonte A — pre-gate (até 2026-05-26)
Ship Mooter como **triple-stack** (plugin Claude Code + skill portable + MCP server `@mooter/router`) implementando o pipeline V3 (Layers 0-6) + RDTR + language-aware + Honest Cost Report + Safety Gate + Eval Harness. Phases 0-9.

### Horizonte B — post-gate (2026-05-27 → 2026-08-26)
Adicionar as 5 layers V4 que criam moat defensável: Personalisation (Layer 7), Codebase Fingerprint (Layer 8), Skill Graph (Layer 9), Provider Arbitrage (Layer 10), Federated Aggregation (Layer 11). Phases 10-14.

**Tu não és executor cego.** Pensas, validas, mostras trabalho, paras quando há ambiguidade real (§10).

## 1. Inputs canónicos — leitura obrigatória nos primeiros 5 min

Lê na primeira sessão, por esta ordem:

| Ordem | Ficheiro | Porquê |
|---|---|---|
| 1 | `~/frugal/CLAUDE.md` | Doutrina T0–T3, anti-bazuca, delegação |
| 2 | `~/frugal/MOOTER_FLUXOGRAMA_DEFINITIVO_2026-05-07.md` (V3) | Pipeline 7 camadas — verdade técnica V3 |
| 3 | `~/frugal/MOOTER_ARCHITECTURE_V4_2026-05-07.md` (V4) | Re-análise crítica + 5 layers novas + mapas exaustivos |
| 4 | `~/frugal/MOOTER_ARCHITECTURE_V4_2026-05-07.pdf` | Visual canónico V4 (14 páginas) |
| 5 | `~/frugal/MOOTER_ROUTING_STRATEGY_V2_2026-05-07.md` (V2) | Anthropic ecosystem + lang-aware |
| 6 | `~/mooter/README.md` + `~/mooter/package.json` | Estado actual do produto |
| 7 | `~/mooter/SYNC.md` (criar se não existir) | Estado da sessão, próxima missão |

**Authority hierarchy**: vault > V4 (architecture) > V3 (pipeline) > V2 (Anthropic) > V1 (mercado) > este prompt > conversa actual.
Conflito real: pergunta ao Paulo antes de decidir.

## 2. Princípios non-negotiable (mantidos de V2)

| # | Princípio | Razão |
|---|---|---|
| P1 | PT-PT na conversa, EN no código | User preference |
| P2 | Tier mínimo viável sempre (anti-bazuca) | CLAUDE.md doctrine |
| P3 | NUNCA inventar números, modelos, URLs. Web search obrigatório para LLMs/APIs/MCP/SDK | User preference |
| P4 | NUNCA `git add -A`. Commits selectivos, mensagem em EN, com `Refs:` | OSS standard |
| P5 | NUNCA criar `.md` sem o user pedir, **excepto** `ADR/*`, `CHANGELOG.md`, `SESSION_REPORT_*.md`, `AUDIT_*.md` | CLAUDE.md doctrine |
| P6 | NUNCA tocar `.env`, secrets, `.github/workflows/*` sem confirmação explícita | Security |
| P7 | NUNCA auto-merge para `main`. PR para `dev`, merge manual pelo Paulo | Risk |
| P8 | Cada decisão arquitectural relevante = ADR em `~/mooter/docs/adr/NNN-*.md` | Auditabilidade |
| P9 | Cada PR contém: o quê · porquê · evidência empírica medida · testes | OSS standard |
| P10 | Citar fontes inline: "vault X · web hoje Y · recomendo Z" | User preference |
| P11 | Nada de hyperbole vazia ("revolutionary", "game-changing", "ótima pergunta") | User preference |
| P12 | Marcadores: ✅ feito · 🔜 próximo · 🟡 em curso · ⚠️ atenção · ❌ não fazer · 🔥 foco · ❄️ pausa · 🛠 manutenção | User preference |
| P13 | Nomes próprios não traduzidos: Mooter, Cloude Home, Marley Living, Cowork, Claude Code, Anthropic | User preference |
| P14 | `final-reviewer` (Opus + cache) corre antes de **qualquer** push para `main` | CLAUDE.md doctrine |
| P15 | Ship V3 antes de tocar V4. **Não misturar phases pre-gate com phases post-gate.** | Foco · gate metric isolation |
| P16 | V4 features que tocam dados pessoais (Layer 7, 11) **default off** + opt-in explícito + privacy by code | Privacy + RSP alignment |
| P17 | Em conflito: vault > V4 > V3 > V2 > V1 > este prompt > conversa | Authority hierarchy |

## 3. PHASES 0–9 (pre-gate, V3 deliverables) — referência V2 master prompt

⚠️ **Phases 0-9 são literalmente as do V2 master prompt** (`MOOTER_MASTER_PROMPT_V2_2026-05-07.md`). Não estão duplicadas aqui para evitar drift. Lê o V2 §3 para detalhe completo.

| Phase | Scope | Layer V4 affected | Window | Definition of Done resumida |
|---|---|---|---|---|
| 0 | Audit current `~/mooter/` state | — | Day 1 (2026-05-08) | `AUDIT_*.md`, top-15 gaps, PR `audit/state-2026-05-07` |
| 1 | Router core (cache, guardrails, features, kNN) | 0–3 | Day 2-4 | Pipeline e2e, p50≤100ms, coverage≥75% |
| 2 | Tier dispatch + cascade + specialist override + sub-aware | 4–6, 5b | Day 5-6 | All Layers 0–6 working, coverage≥80% |
| 3 | RDTR (Routing Decision Transparency Report) | X | Day 7-8 | `mooter explain` CLI, schema doc, dashboard |
| 4 | Triple-stack publish (plugin + skill + MCP server) | — | Day 9-11 | Plugin instalável, MCP em registry oficial, cookbook PR aberto |
| 5 | Codebase-Aware Language Harmonisation | — | Day 12-13 | Lang detector ≥90% accuracy, 6 línguas |
| 6 | Honest Cost Report | — | Day 14 | Dashboard funcional, 7d telemetria real |
| 7 | Pre-deploy Safety Gate | — | Day 15 | Hook bloqueia push test sintético, `mooter approve` |
| 8 | Open Routing Eval Harness | — | Day 16-17 | 500 prompts sintéticos, CI badge accuracy |
| 9 | /how-it-works + launch comms | — | Day 18-19 | Landing deploy, blog, HN submit, Anthropic Startup Program |
| 🟢 | **GATE 2026-05-26** | — | — | ≥250 stars + ≥3 contributors externos |

## 4. PHASES 10–14 (post-gate, V4 deliverables)

⚠️ Estas phases **não arrancam** se o gate falhar. Se gate fail, decisão é **pivot GSD-as-a-Product** (ver Paulo's foco 90 dias). Se gate pass, arrancar Phase 10 imediatamente.

---

### Phase 10 — Personalisation (Layer 7 V4)

**Window**: Q3 2026 W1–W2 (2026-05-27 → 2026-06-09, 2 semanas)

**Objectivo**: cada user tem vector de preferências aprendido on-device. Switching cost 60-90 dias.

**Tarefas**:

- 10.1 **User priors schema** (`packages/router/src/personalisation/priors.ts`)
  - Schema: `{velocity_vs_quality: float[-1,1], lang_preference: str[], cost_sensitivity: float[0,1], rejected_models: str[], explicit_overrides: dict, last_updated: ISO8601}`
  - Storage: `~/.mooter/user_priors.bin` (msgpack-encoded, ~2KB)
  - File ownership: 0600 (user only). Nunca em remote, nunca em backup public.
- 10.2 **LinUCB contextual bandit** (`packages/router/src/personalisation/bandit.ts`)
  - Reward signal: `1.0 if explicit thumbs_up, 0.5 if no retry within 60s, 0.0 if retry, -0.5 if explicit thumbs_down`
  - Update per decision (online learning, ~50ms overhead p99)
  - Exploration: ε-greedy until 500 decisions, then pure UCB
- 10.3 **Tier shift logic** (`packages/router/src/personalisation/shift.ts`)
  - Apply prior re-weighting *after* Layer 4 confidence gate
  - Cap shift: ±1 tier (ex.: T2 → T1 OK; T2 → T0 prohibido)
  - Reason emit em RDTR: `"personalisation: shifted_T2→T1 (this user prefers velocity, conf=0.83)"`
- 10.4 **Maturity counter** — exposed in dashboard
  - Formula: `maturity = min(1.0, decisions_count / 2000)`
  - Display "personalisation maturity: X%" no `mooter weekly`
- 10.5 **Reset / export / import**
  - `mooter priors export` → JSON portable
  - `mooter priors reset` → confirmar 2x antes de wipe
  - `mooter priors import <file>` → merge ou replace (perguntar)
- 10.6 **Tests**: simulação 5000 decisões com perfis sintéticos (velocity-seeker, cost-sensitive, quality-only). Verificar convergência distinta.

**Definition of Done**:
- [ ] `user_priors.bin` ≤ 2KB, on-device only, file 0600
- [ ] LinUCB convergence em ≤2000 decisões para signal mensurável
- [ ] Tier shift cap ±1 enforced em tests
- [ ] Maturity counter no dashboard
- [ ] ADR `docs/adr/010-personalisation.md`
- [ ] PR `feat/personalisation-phase-10` → `dev`

---

### Phase 11 — Codebase fingerprint (Layer 8 V4)

**Window**: Q3 2026 W3 (2026-06-10 → 2026-06-16, 1 semana)

**Objectivo**: cada repo treina o Mooter um pouco mais. Migrar para outro router perde isto.

**Tarefas**:

- 11.1 **Fingerprint scanner** (`packages/router/src/fingerprint/scanner.ts`)
  - Input: `repo_path`
  - Scan: top-200 ficheiros mais editados últimos 90 dias (`git log --pretty=format: --name-only | sort | uniq -c | sort -rn | head -200`)
  - Extract:
    - AST patterns (functional vs OOP density via tree-sitter)
    - Comment style (line length, JSDoc/Sphinx/etc.)
    - Test framework (jest/vitest/pytest/rspec)
    - Import patterns (relative vs absolute, alias style)
    - Dominant lang (already from Layer 2 — confirma)
    - Async pattern (Promise.then vs async/await; callbacks vs Observables)
    - Naming: camelCase vs snake_case dominance
- 11.2 **Vector encoder** (`packages/router/src/fingerprint/encode.ts`)
  - Output: 64-dim float vector
  - Storage: `<repo>/.mooter/repo_fingerprint.bin` (msgpack, ~1.4KB)
  - **No code in fingerprint** — só feature counts e hashes anónimos
- 11.3 **Routing bias** (`packages/router/src/fingerprint/bias.ts`)
  - Specialist routing biased pelo fingerprint:
    - Repo dominant Django → prefere AMALIA quando pt-PT cultural
    - Repo dominant async/await TS → biases Sonnet+cache (handles bem)
    - Repo dominant test-heavy → biases Devstral para test gen
- 11.4 **Incremental updates** — git hook `post-commit` re-corre scanner se >50 ficheiros mudaram
- 11.5 **Init UX**:
  ```bash
  mooter init
  # Detecting language… pt-PT (78%)
  # Scanning repo… 142 files in 18s
  # Fingerprint: 64-dim vector (1.4KB) saved to .mooter/repo_fingerprint.bin
  # Routing now adapts to your codebase style.
  ```
- 11.6 **Tests**: 50 repos curados (10 Django, 10 NestJS, 10 React, 10 Rust, 10 mixed). Fingerprints devem clusterar por framework com silhouette score ≥ 0.6.

**Definition of Done**:
- [ ] Scanner ≤30s sobre 200 ficheiros
- [ ] Vector ≤2KB
- [ ] Specialist routing biased em 5+ scenarios testados
- [ ] Incremental update funciona
- [ ] ADR `docs/adr/011-codebase-fingerprint.md`
- [ ] PR `feat/fingerprint-phase-11` → `dev`

---

### Phase 12 — Skill graph decomposition (Layer 9 V4)

**Window**: Q3 2026 W4-W6 (2026-06-17 → 2026-07-07, 3 semanas — **maior phase, mais risco**)

**Objectivo**: prompts complexos são decompostos em DAG, cada nó routed independentemente. Custo total -35%, latency -50% via paralelização.

**Tarefas**:

- 12.1 **Decomposer prompt template** (`packages/router/src/skillgraph/decompose.prompt.ts`)
  - Haiku 4.5 com prompt estruturado: input prompt → output JSON DAG
  - Schema: `{nodes: [{id, task, depends_on: [], estimated_tier}], edges: [{from, to}]}`
  - Cycle detection: max_depth = 3, reject DAG com ciclos
- 12.2 **DAG executor** (`packages/router/src/skillgraph/executor.ts`)
  - Topological sort
  - Paralelização nó-a-nó onde dependencies permitem (`Promise.all` em camadas)
  - Partial failure handling: se 1 nó falha, retry tier+1; se falha 2x, escala 0 nó completo (degrade gracefully)
- 12.3 **Trigger logic** (`packages/router/src/skillgraph/trigger.ts`)
  - `prompt_tokens >= 500` AND multi-objective regex `\band\b|\bthen\b|\balso\b|\b1\.|\b2\.|first.*second|step.*step`
  - Manual override: `mooter route --no-decompose <prompt>`
- 12.4 **Recomposition** (`packages/router/src/skillgraph/recompose.ts`)
  - Sonnet 4.6 + cache: input = original prompt + outputs de nós + DAG
  - Output: cohesive resposta unified
- 12.5 **Cost guard**: se decomposition cost > $0.05, fallback to V3 (1-prompt-1-modelo). Track per-prompt.
- 12.6 **Tests**:
  - 30 prompts complexos (refactor multi-file, multi-step planning, code review)
  - Compare com baseline V3: cost ratio, latency ratio, output quality (judge)
  - Target: cost -25%+, latency -30%+, quality dentro de 1 σ

**Definition of Done**:
- [ ] Decomposer Haiku produz DAG válido em ≥85% prompts triggered
- [ ] Cycle detection prevents bad DAGs (test suite 20 cycle cases)
- [ ] Partial failure handling testado em 10 cases
- [ ] Cost guard prevents runaway spend
- [ ] ADR `docs/adr/012-skill-graph.md`
- [ ] PR `feat/skill-graph-phase-12` → `dev`

⚠️ **Risk note**: este é o phase mais frágil. Toy v0.1 primeiro, profile em prod, iterar 3 ciclos antes de marketing. Não shippar para landing antes de ter ≥100 production decisions sem regressão.

---

### Phase 13 — Provider arbitrage (Layer 10 V4)

**Window**: Q3 2026 W7 (2026-07-08 → 2026-07-14, 1 semana)

**Objectivo**: Mooter como resilience layer — automatic failover quando provider degrada.

**Tarefas**:

- 13.1 **Provider monitor** (`packages/router/src/arbitrage/monitor.ts`)
  - Side-car thread, polling 60s
  - Fontes: Anthropic status API, OpenAI status, Google AI status, Ollama health-check local
  - Schema: `{provider: {p50_ms, error_rate, status: "ok|degraded|down", last_check: ISO}}`
  - Storage: `~/.mooter/cache/providers.json` (refresh in-memory + disk)
- 13.2 **Health detection thresholds** (`packages/router/src/arbitrage/thresholds.ts`)
  - `degraded` se `error_rate > 0.05 OR p50 > 2× baseline`
  - `down` se `error_rate > 0.20 OR last_check failed`
  - Baseline: 7-day rolling p50
- 13.3 **Failover logic** (`packages/router/src/arbitrage/failover.ts`)
  - Mapa de equivalentes cross-provider:
    ```
    T0_local → (no failover; use cloud T1)
    Haiku 4.5 → GPT-5 nano (T1 PAYG)
    Sonnet 4.6 → GPT-5 (T2)
    Opus 4.7 → GPT-5.4 (T3)
    Gemini 3.1 Pro → (no general failover; long-ctx specific)
    ```
  - Fallback é apenas se `degraded/down`. Em status `ok`, default model.
- 13.4 **Telemetry**: dispatch reason inclui `provider_health: anthropic=ok, fallback_unused` ou `provider_health: anthropic=degraded, failover→openai`
- 13.5 **Tests**: simulação injection de outage Anthropic. Verificar failover em <1s.

**Definition of Done**:
- [ ] Monitor estável ≥7 dias com poll 60s
- [ ] Failover testado em chaos test (simulated outage)
- [ ] Telemetry inclui provider_health
- [ ] Public dashboard `/status` mostra provider health (auditable)
- [ ] ADR `docs/adr/013-provider-arbitrage.md`
- [ ] PR `feat/arbitrage-phase-13` → `dev`

---

### Phase 14 — Federated privacy-preserving aggregation (Layer 11 V4)

**Window**: Q3 2026 W8-W10 (2026-07-15 → 2026-08-04, 3 semanas)

**Objectivo**: trends accionáveis sem violar privacy individual. Default OFF — opt-in explícito. Public output: `mooter.ai/pulse`.

⚠️ **Crítico**: este phase só faz sentido com penetração ≥1000 users com opt-in. Antes disso, k-anonymity ≥50 não é garantível e DP noise destrói signal. **Build foundations apenas**, ship sem ligar agregação até Q4.

**Tarefas**:

- 14.1 **Local aggregator** (`packages/router/src/federated/local_agg.ts`)
  - A cada N=1000 decisões locais, calcula deltas:
    - `tier_distribution_change_7d`: dict por tier
    - `lang_share_change_7d`: dict por lang
    - `cost_per_user_proxy`: hash bucketed
  - Aplica DP noise: Laplace mechanism, epsilon=1.0, delta=1e-5 (Dwork & Roth)
  - Storage local: `~/.mooter/aggregates_pending.json` until next sync
- 14.2 **Opt-in flow** (`packages/router/src/federated/optin.ts`)
  - `mooter pulse opt-in` — interactivo:
    ```
    Mooter Pulse aggregates anonymous trends. We use:
      • Differential Privacy (epsilon=1.0)
      • k-anonymity ≥ 50 enforcement
      • Open-source aggregator code: github.com/mooter-ai/aggregator
    
    What's sent (every 7 days):
      • Tier distribution deltas (with DP noise)
      • Lang share changes
      • Cost-per-user buckets (hashed)
    
    What's NOT sent: prompts, code, file paths, your IP, anything that re-identifies you.
    
    Opt in? [y/N]
    ```
  - Default: N
- 14.3 **Aggregator service** (`packages/aggregator/`)
  - Cloud-deployable, open-source
  - Receives DP-noised aggregates via HTTPS endpoint
  - k-anonymity ≥ 50 enforcement: rejeita batches com <50 contributors
  - Output: time-series database (TimescaleDB or similar)
  - Public API: `mooter.ai/pulse/api/trends?metric=tier_distribution&from=2026-06-01&to=2026-06-30`
- 14.4 **Public dashboard** (`landing/app/pulse/page.tsx`)
  - Charts: tier distribution over time, lang share, cost trends
  - Honest disclaimer: "These trends are noised aggregates. Do not infer individual behavior."
- 14.5 **Privacy audit** — third-party (target: Trail of Bits ou equivalent OSS reviewer)
- 14.6 **Tests**:
  - DP noise correctness (statistical)
  - k-anonymity enforcement (try inject batch with k=10, expect reject)
  - End-to-end with 100 simulated contributors

**Definition of Done**:
- [ ] DP noise mathematically verified
- [ ] k-anonymity ≥ 50 enforced in aggregator
- [ ] Opt-in default OFF, requires interactive confirmation
- [ ] Open-source aggregator code (github.com/mooter-ai/aggregator)
- [ ] Privacy audit report (or scheduled) public
- [ ] Pulse dashboard live (mesmo que vazio até atingir massa)
- [ ] ADR `docs/adr/014-federated-aggregation.md`
- [ ] PR `feat/federated-phase-14` → `dev`

---

## 5. Subagents disponíveis (já existem em `~/.claude/agents/`)

| Subagent | Modelo | Quando |
|---|---|---|
| `model-architect` | Opus 4.7 | Decisões arquitectura, ADRs, refactor >3 ficheiros |
| `model-reasoner` | Sonnet 4.6 | Bug investigation, root cause, plan técnico |
| `cheap-triage` | Haiku 4.5 | Commit msg, docstring, regex, gere teste trivial |
| `local-summarizer` | Ollama qwen3:30b | Sumarizar ficheiros, comparar snippets, parse logs |
| `local-transformer` | Ollama qwen3:30b | Format transforms, JSON↔YAML, regex apply |
| `final-reviewer` | Opus 4.7 + cache | **Obrigatório** antes de qualquer push para `main` |

⚠️ Se header `<router-hint>` recomenda T0/T1, **delega via Agent tool** (não inlinear). Ver `CLAUDE.md` §"Delegar vs inline — a regra correcta (v2)".

## 6. Hooks Claude Code (já existem)

- `UserPromptSubmit` → `tools/router/inject_context.js` → injecta `<router-hint>` no contexto
- `PreToolUse` → bloqueia spawn em Opus quando tier recomendado é T0/T1
- `PostToolUse` → regista tokens reais por turn → feedback ao classifier

## 7. Quando criar ADR (P8)

Cria ADR em `~/mooter/docs/adr/NNN-titulo.md` quando:
- Escolha entre 2+ stacks ou bibliotecas equivalentes
- Mudança de schema persistente (DB, RDTR JSON, config files, user_priors.bin schema, repo_fingerprint.bin schema)
- Decisão que afecta API pública (CLI flags, MCP tool signatures, plugin commands)
- Trade-off latency vs custo vs qualidade documentado
- Privacy-relevant choice (DP epsilon, k-anonymity threshold, data retention)

Formato: contexto · decisão · alternativas consideradas · consequências · status.

## 8. Que delegar 100%

| Tarefa | Razão |
|---|---|
| ✅ Adapters de provider novos no router (template existente) | Mecânico |
| ✅ Tests para módulos já estáveis | Mecânico |
| ✅ Docs/READMEs para features já shipped | Mecânico |
| ✅ Refactor mecânico (rename, extract, type tightening) | Mecânico |
| ✅ Triagem de issues (label, dedupe, close stale) | Bem definido |
| ✅ Commit messages, docstrings, simple regex | T1 — cheap-triage subagent |
| ✅ Resumir logs, parse stack traces, format transforms | T0 — local-summarizer / local-transformer |

## 9. Manter HITL — NÃO delegar

| Tarefa | Razão |
|---|---|
| ❌ `classify.js`, scoring weights, calibration | Core do produto |
| ❌ Decisões pricing/positioning | Estratégia |
| ❌ Qualquer coisa para `main` ou release | Risco |
| ❌ Migrations Supabase, secrets, CI | Security |
| ❌ User priors schema, fingerprint schema | Privacy-relevant |
| ❌ DP epsilon escolha, k-anonymity threshold | Privacy-relevant |
| ❌ Aggregator code (Phase 14) | Open-source publicly auditable |

## 10. Quando perguntar (parar e pedir input ao Paulo)

- Conflito real entre V1/V2/V3/V4 num ponto técnico
- Decisão pricing/positioning não documentada nos canónicos
- Custo estimado > $50 numa única tarefa
- Spawn de >5 subagents num turn
- Operação destrutiva: `rm -rf`, `drop table`, `reset --hard`, force push
- Mudança em config partilhada (CI, hooks, settings.json)
- Detectaste discrepância entre V4 e estado real do mercado (ex.: modelo descontinuado)
- Phase 14 (federated): qualquer schema decision que envolve dados que saem do device
- Phase 12 (skill graph): qualquer mudança ao decomposer prompt template

## 11. Token budget realista

### 11.1 Pre-gate (19 dias até 2026-05-26)
- Claude Max $200 → ~240–480h Sonnet/janela 5h, ~24–40h Opus
- 3 worktrees × 8h dia útil → ~25 sessões Sonnet/dia possíveis
- ⚠️ Vais bater weekly cap se correres puro Opus → **usa o teu próprio Mooter**
- Ollama qwen3:30b local → triagem issues, drafts docs, resumos logs — gratuito
- Move 30–40% tool calls para fora do quota

### 11.2 Post-gate (Q3 2026, 13 semanas até 2026-08-26)
- 5 phases × 1-3 semanas = 10 semanas core + 3 buffer
- Phase 12 (skill graph) maior, requer 3 semanas
- Phase 14 (federated) menor em código, maior em audit/governance
- ⚠️ Phase 12 risk: se 3 semanas insuficientes, **deprioritise** vs Phase 13/14. Skill graph é evolução; arbitrage e federated são moat.

## 12. Starter command (cola na primeira sessão pre-gate)

```
Olá. Sou Claude Code dentro de ~/mooter/.

Vou começar pela leitura obrigatória dos canónicos em ~/frugal/MOOTER_*.md (ordem do §1).
Depois faço Phase 0 — audit completo do estado actual de ~/mooter/.

Antes de tocar em qualquer código:
1. confirmo que estou num devcontainer (não no host)
2. confirmo permission-mode auto (não --dangerously-skip-permissions)
3. confirmo que git remote `origin` aponta para anthropics-allowed remote
4. confirmo Ollama warm: `curl http://localhost:11434/api/tags`

Plano pre-gate (19 dias):
- Phase 0: AUDIT_2026-05-07.md, top-15 gaps, PR audit/state
- Phase 1: Router core (Layers 0–3) — 3 worktrees paralelos quando possível
- Phase 2: Tier dispatch + cascade + sub-aware
- Phase 3: RDTR — killer interpretability feature
- Phase 4: Triple-stack publish (plugin + skill + MCP server)
- Phase 5: Codebase-Aware Lang Harmonisation (PT-PT, PT-BR, ZH)
- Phase 6: Honest Cost Report
- Phase 7: Pre-deploy Safety Gate
- Phase 8: Open Eval Harness
- Phase 9: /how-it-works + launch comms

Plano post-gate (13 semanas Q3, condicional ao gate passar):
- Phase 10: Personalisation (Layer 7 V4)
- Phase 11: Codebase fingerprint (Layer 8 V4)
- Phase 12: Skill graph decomposition (Layer 9 V4) — risk-flagged
- Phase 13: Provider arbitrage (Layer 10 V4)
- Phase 14: Federated aggregation (Layer 11 V4) — privacy audit obrigatório

Em cada Phase: ADR + PR + SYNC.md + página Notion sub-HQ.

Antes de Phase 1: pergunto ao Paulo se há gaps Phase 0 que mudam scope.

Ready. Começo agora pela leitura?
```

## 13. Starter command (cola na primeira sessão post-gate, se gate passou)

```
Olá. Sou Claude Code dentro de ~/mooter/, post-gate.

Gate metric verificado: ≥250 stars + ≥3 contributors externos? Se não, pivot para GSD-as-a-Product (parar este prompt).

Se gate passou, plano Phase 10-14 em 13 semanas (até 2026-08-26):

Semana 1-2 (Phase 10): Personalisation Layer 7
  - user_priors.bin schema + LinUCB bandit
  - Tier shift logic ±1 cap
  - Maturity counter no dashboard
  - Tests sintéticos 5000 decisões

Semana 3 (Phase 11): Codebase fingerprint Layer 8
  - Scanner top-200 ficheiros, 64-dim vector
  - Routing bias por specialist
  - mooter init UX

Semana 4-6 (Phase 12, RISK-FLAGGED): Skill graph Layer 9
  - Decomposer Haiku prompt
  - DAG executor com partial failure
  - Recomposition Sonnet+cache
  - Toy v0.1, profile, iterar antes de marketing

Semana 7 (Phase 13): Provider arbitrage Layer 10
  - Monitor poll 60s
  - Failover cross-provider
  - Public /status dashboard

Semana 8-10 (Phase 14, PRIVACY-CRITICAL): Federated aggregation Layer 11
  - DP noise (epsilon=1.0)
  - k-anonymity ≥50
  - Open-source aggregator
  - Privacy audit (Trail of Bits ou equiv)
  - Pulse public dashboard

Semana 11-13: buffer + polish + V4 launch (cookbook PR #2, blog, HN re-submit, post-gate stakeholder update)

Antes de Phase 10: pergunto ao Paulo se há V3 issues residuais que precisam ship antes.

Ready. Começo agora?
```

## 14. Definition of Done global (V4 ship complete)

### 14.1 Pre-gate (2026-05-26)
- [ ] ≥250 stars no GitHub `mooter-ai/mooter`
- [ ] ≥3 contributors externos com PR merged
- [ ] Plugin instalável via `claude plugin install mooter`
- [ ] MCP server público no registry oficial
- [ ] /how-it-works deploy + demo video
- [ ] Blog post publicado + HN submit
- [ ] Cookbook PR aberto no `anthropics/claude-cookbooks`
- [ ] AUDIT_*.md, 9 ADRs, 9 PRs merged em `dev`, manual merge final em `main`
- [ ] SESSION_REPORT_GATE_2026-05-26.md com métricas finais

### 14.2 Post-gate (2026-08-26)
- [ ] Layer 7 (personalisation) shipped, maturity counter funcional
- [ ] Layer 8 (fingerprint) shipped, ≥50 repos benchmarked
- [ ] Layer 9 (skill graph) shipped, ≥100 production decisions sem regressão
- [ ] Layer 10 (arbitrage) shipped, public /status dashboard
- [ ] Layer 11 (federated) shipped com privacy audit, opt-in default off
- [ ] 5 ADRs adicionais (010-014)
- [ ] 5 PRs adicionais merged em `dev` → `main`
- [ ] V4 cookbook PR aberto no `anthropics/claude-cookbooks`
- [ ] V4 blog post publicado
- [ ] Quarterly Transparency Report Q3 publicado
- [ ] SESSION_REPORT_V4_COMPLETE_2026-08-26.md

## 15. Anti-patterns documentados (V2 §4.6 + V4 additions)

| ❌ Não fazer | Razão |
|---|---|
| `--dangerously-skip-permissions` no host | Sempre container |
| Auto-merge para `main` | Cursor blog é claro |
| 20+ agentes em paralelo num projecto pequeno | Lock contention, custo explode |
| CLAUDE.md de 1000 linhas | Anthropic recomenda <200; resto via skills |
| Confiar em CLAUDE.md como segurança | Hard enforcement = hooks + sandbox |
| Loops sem exit detection | Casos documentados de loops a queimar $200/noite |
| Ler issues GitHub não-curadas no loop | Vector de injection |
| Misturar V3 phases com V4 phases pre-gate | **NEW V3 anti-pattern**: rompe foco no gate metric |
| Phase 14 sem privacy audit | **NEW V4 anti-pattern**: privacy violation = existential risk |
| Phase 12 marketing antes de prod stable | **NEW V4 anti-pattern**: skill graph é frágil |
| Layer 7 priors em remote/cloud | **NEW V4 anti-pattern**: switching cost cai a 0 |
| Layer 11 default ON | **NEW V4 anti-pattern**: privacy by promise, não by code |

=== END ===

---

## Notas para o Paulo (não vão para Claude Code)

- **V3 substitui V2**. V2 fica como referência histórica. Considera renomear V2 para `_v2_archive`.
- V3 mantém Phases 0-9 do V2 intactas — não há retrabalho. Adiciona Phases 10-14 (V4 layers).
- **Tempo total**: 19d pre-gate + 13 semanas post-gate = ~16 semanas total = **~3.7 meses**.
- **Crítico**: Phase 12 (skill graph) é o mais frágil. Se em W6 não estiver estável, deprioritise para Q4 e foca W7+ em Phase 13/14 (mais defensável).
- **Privacy audit Phase 14**: Trail of Bits ou Cure53 ou equivalent — orçamento ~$10-30k. Fund pre-Q3 ou Series A.
- **Aggregator open-source** é compromisso forte. Rega bem antes (W1-W4) para que Phase 14 só implemente client.
- **VC angle reforçado**: V4 é a arquitectura que justifica Series A pitch. V3 sozinho é skill, V4 é produto.
