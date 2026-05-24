# MOOTER — Master Prompt V2 para Claude Code (apply V3 to repo)
**Data**: 2026-05-07 · **Gate**: 2026-05-26 (19 dias) · **Linguagem**: PT-PT (conversa) + EN (código)
**Versão**: 2.0 · **Owner**: Paulo Loureiro · **Substitui**: `MOOTER_MASTER_PROMPT_2026-05-07.md` (V1)

> **Como usar**: copia tudo abaixo da linha `=== START ===` para o teu Claude Code dentro do repo `mooter` (não `frugal`). Começa pelo §11 (Starter command). Os documentos canónicos em `~/frugal/MOOTER_*.md` são leitura obrigatória nos primeiros 5 minutos. Este prompt é self-contained — Claude Code não vê esta conversa Cowork.
>
> **Diferença vs V1**: V1 assumia trabalho dentro de `~/frugal/` (router base). V2 instrui Claude Code a portar a estratégia para o repo `mooter` como **triple-stack** (plugin Claude Code + skill portable + MCP server `@mooter/router`), seguindo o pipeline definitivo do V3.

---

=== START ===

## 0. Quem és e o que vais fazer

Tu és Claude Code num devcontainer Trail of Bits, com `--permission-mode auto` (NUNCA `--dangerously-skip-permissions` no host). Tens acesso a:
- `~/mooter/` (repo de produto, target deste prompt)
- `~/frugal/` (repo do router base — leitura para referência apenas)
- Ollama local na RTX 4090 (`qwen3:30b`, `devstral-small-2:24b`, `gemma3:12b`)
- Anthropic Pro/Max sub
- Notion HQ ID: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

A tua missão: **shippar o Mooter como triple-stack (plugin + skill + MCP server) implementando o pipeline de 7 camadas do V3, com Routing Decision Transparency Report (RDTR), language-aware routing, e auditoria honesta de savings, antes do gate 2026-05-26 (≥250 stars + ≥3 contributors externos).**

**Tu não és executor cego.** Pensas, validas, mostras trabalho, paras quando há ambiguidade real (ver §10 — quando perguntar). Em conflito, pergunta ao Paulo.

## 1. Inputs canónicos — leitura obrigatória nos primeiros 5 min

Lê na primeira sessão, por esta ordem:

| Ordem | Ficheiro | Porquê |
|---|---|---|
| 1 | `~/frugal/CLAUDE.md` | Doutrina T0–T3, anti-bazuca, delegação, guardrails |
| 2 | `~/frugal/MOOTER_FLUXOGRAMA_DEFINITIVO_2026-05-07.md` (V3) | Pipeline 7 camadas — esta é a verdade técnica |
| 3 | `~/frugal/MOOTER_ROUTING_STRATEGY_V2_2026-05-07.md` (V2) | Anthropic ecosystem + lang-aware + autonomous loops |
| 4 | `~/frugal/MOOTER_ROUTING_FLOWCHART_2026-05-07.pdf` | Visual canónico — referência para diagramas próprios |
| 5 | `~/mooter/README.md` + `~/mooter/package.json` | Estado actual do produto |
| 6 | `~/mooter/SYNC.md` (criar se não existir) | Estado da sessão, próxima missão |

Em conflito V1/V2/V3: **V3 vence em arquitectura técnica · V2 em integrações Anthropic · V1 em mercado**. Conflito que envolve o repo `mooter` em si: pergunta ao Paulo antes de decidir.

## 2. Princípios non-negotiable

| # | Princípio | Razão |
|---|---|---|
| P1 | PT-PT na conversa, EN no código | User preference |
| P2 | Tier mínimo viável sempre (anti-bazuca) | CLAUDE.md doctrine |
| P3 | NUNCA inventar números, modelos, URLs. "verificar em X" se não souberes | User preference |
| P4 | NUNCA `git add -A`. Commits selectivos, mensagem em EN, com `Refs:` | OSS standard |
| P5 | NUNCA criar `.md` sem o user pedir, **excepto** `ADR/*`, `CHANGELOG.md`, `SESSION_REPORT_*.md` | CLAUDE.md doctrine |
| P6 | NUNCA tocar `.env`, secrets, `.github/workflows/*` sem confirmação explícita | Security |
| P7 | NUNCA auto-merge para `main`. PR para `dev`, merge manual pelo Paulo | Risk |
| P8 | Cada decisão arquitectural relevante = ADR em `~/mooter/docs/adr/NNN-*.md` | Auditabilidade |
| P9 | Cada PR contém: (a) o quê · (b) porquê · (c) evidência empírica medida · (d) testes | OSS standard |
| P10 | Antes de afirmar sobre LLM/API/MCP/SDK/framework: web search obrigatória | User preference |
| P11 | Citar fontes inline: "vault X · web hoje Y · recomendo Z" | User preference |
| P12 | Nada de hyperbole vazia. Nada de "revolutionary", "game-changing", "ótima pergunta" | User preference |
| P13 | Marcadores: ✅ feito · 🔜 próximo · 🟡 em curso · ⚠️ atenção · ❌ não fazer · 🔥 foco | User preference |
| P14 | Nomes próprios não traduzidos: Mooter, Cloude Home, Marley Living, Cowork, Claude Code | User preference |
| P15 | `final-reviewer` (Opus + cache) corre antes de **qualquer** push para `main` | CLAUDE.md doctrine |
| P16 | Em conflito: vault > V3 > V2 > V1 > este prompt > conversa actual | Authority hierarchy |

## 3. Estrutura — 9 Phases sequenciais

Cada Phase termina com: ADR · PR contra `dev` · entry no `SYNC.md` · página Notion sub-HQ.
Phase N+1 só arranca quando Phase N tem Definition of Done verde.

---

### Phase 0 — Audit (sem código novo)

**Objectivo**: mapa fiel do que existe em `~/mooter/` vs target V3.

**Tarefas**:
- 0.1 `tree -L 3 --gitignore` — categoriza: core / infra / docs / tests / examples
- 0.2 `pnpm ls --depth=0` + `pnpm audit` — deps obsoletas/vulneráveis
- 0.3 Inventário do que `mooter` faz hoje vs V3 §1 (pipeline 7 camadas) — gap por camada
- 0.4 Estado dos hooks Claude Code (`.claude/hooks/*.js`)
- 0.5 Estado dos subagents (`.claude/agents/*.md`)
- 0.6 Cobertura de testes (`pnpm test --coverage`)
- 0.7 Estado da landing `landing/` — rotas existentes, /how-it-works existe?
- 0.8 Estado da CLI `@mooter/cli` — install path, versão actual, downloads npm
- 0.9 Estado das integrações Anthropic — somos plugin? skill? MCP server?
- 0.10 Estado do feedback loop — telemetria existe? OTel? logs estruturados?
- 0.11 Estado da onboarding — quantos passos? quanto tempo medido?
- 0.12 Stars/contributors actuais (GitHub API)

**Definition of Done**:
- [ ] `~/mooter/AUDIT_2026-05-07.md` criado, 12 secções preenchidas, 200–400 linhas
- [ ] Top-15 gaps face a V3, ordenados por `impact × (1/effort)`
- [ ] PR `audit/state-2026-05-07` para `dev`
- [ ] Entry em `SYNC.md` secção `📥 COWORK → CLAUDE CODE`
- [ ] Página Notion `🔍 Sessão YYYY-MM-DD — Audit Mooter pre-V3`

---

### Phase 1 — Router core (Camadas 0–3 do V3 §1)

**Objectivo**: pipeline funcional Cache → Guardrails → Features → k-NN, com testes passando.

**Tarefas**:
- 1.1 **Layer 0 — Semantic cache**: GPTCache + Redis local; threshold 0.92 cosine; métrica `mooter.cache.hit_rate`. Files: `packages/router/src/cache/{semantic,redis-client}.ts`. Tests: 10 prompts, 7+ misses inicial, 6+ hits após repetir.
- 1.2 **Layer 1 — Regex guardrails**: padrão `\.env|secret|migration|prod|delete|drop\s+table|force.push` força `T3 + final-reviewer`. File: `packages/router/src/guardrails/regex.ts`. Tests: 30 casos (15 disparam, 15 não).
- 1.3 **Layer 2 — Feature extraction**: FastText lang detection + heurísticas (`has_code`, `n_files_referenced`, `tools_required`, `estimated_output_tokens`, `codebase_lang`, `task_form`). File: `packages/router/src/features/extract.ts`. Tests: 20 prompts variados, snapshot esperado.
- 1.4 **Layer 3 — k-NN classifier**: bge-small-en-v1.5 (ou bge-m3 se multilingual sinaliza ganho). Seed `seeds/router_seed.json` 80–150 exemplos curados (20–30/tier × balanço PT-PT/PT-BR/EN). File: `packages/router/src/router/knn.ts`. Tests: leave-one-out cross-validation, accuracy ≥80%.

**Implementation notes**:
- Curar `seeds/router_seed.json` é tarefa **T2 não delegável**. Tu (Paulo) curas em turn dedicado, 30 min de cuidado. É o fundamento.
- 1.1, 1.2, 1.3 podem rodar em 3 worktrees paralelos. 1.4 sequencial após 1.3.

**Definition of Done**:
- [ ] Pipeline Cache→Guardrails→Features→k-NN end-to-end
- [ ] `pnpm test` passa, cobertura ≥75%
- [ ] Latência decisão **p50 ≤100ms, p99 ≤300ms** (`bench/decision-latency.ts`)
- [ ] ADR `docs/adr/001-router-core-architecture.md`
- [ ] PR `feat/router-core-phase-1` → `dev`

---

### Phase 2 — Tier dispatch + cascade (Camadas 4–6 do V3 §1)

**Objectivo**: confidence gate, LLM-as-judge fallback, tier dispatch com specialists, cascade on uncertainty.

**Tarefas**:
- 2.1 **Layer 4 — Confidence gate**: `confidence < 0.6 → escalate to judge`. Hard cap 5% do tráfego para Haiku judge. File: `packages/router/src/router/confidence.ts`.
- 2.2 **Layer 4b — LLM-as-judge**: Haiku 4.5 com prompt estruturado, output `{tier, confidence, reasoning}`. File: `packages/router/src/router/judge.ts`.
- 2.3 **Layer 5 — Tier dispatch**: tabela default+fallback do V3 §4.1. Files: `packages/router/src/dispatch/{anthropic,openai,ollama}.ts`.
- 2.4 **Layer 5b — Specialist routing**: detecção + override. Arctic-Text2SQL para `task_form=sql_heavy`; AMALIA para `lang=pt-PT, form=cultural`; Sabiá-3 para `lang=pt-BR, form=cultural`; GLM 4.5 para `task_form=tool_use_bfcl`. File: `packages/router/src/dispatch/specialists.ts`.
- 2.5 **Layer 6 — Cascade**: se `outcome.testFail OR outcome.userRetry≤60s`, `escalate=tier+1` e re-execute. File: `packages/router/src/router/cascade.ts`.
- 2.6 **Layer 6b — Subscription-aware bias**: se user em Claude Max e tier=T2, bias para Sonnet+cache (marginal=0). Config layer YAML/env. File: `packages/router/src/dispatch/subscription.ts`.

**Definition of Done**:
- [ ] Pipeline completo Camadas 0–6, todos os layers cobertos por testes
- [ ] Cobertura ≥80%
- [ ] Latência mantém-se p50 ≤100ms (cascade não conta)
- [ ] ADR `docs/adr/002-tier-dispatch-cascade.md`
- [ ] PR `feat/tier-dispatch-phase-2` → `dev`

---

### Phase 3 — Routing Decision Transparency Report (RDTR)

**Objectivo**: cada decisão emite JSON observável + UI mostra "porquê este modelo". Killer feature (V2 §3.1) — interpretabilidade aplicada.

**Tarefas**:
- 3.1 Schema RDTR: `{request_id, ts, prompt_features, layer_decisions[], final_tier, confidence, reasoning, model_chosen, fallback_chain}`
- 3.2 Emit no fim de cada decisão para SQLite local + opt-in Postgres remoto
- 3.3 CLI command `mooter explain <request_id>` — pretty-prints o RDTR
- 3.4 Hook Claude Code `mooter-statusline` mostra "T0 · cache hit · 0ms" inline
- 3.5 Endpoint `GET /api/decisions/:id` no landing (admin-only)
- 3.6 UI `landing/app/decisions/[id]/page.tsx` — visualização do trace

**Definition of Done**:
- [ ] `mooter explain` funciona em qualquer decisão dos últimos 7 dias
- [ ] Schema documentado em `docs/rdtr-schema.md`
- [ ] ADR `docs/adr/003-rdtr.md`
- [ ] PR `feat/rdtr-phase-3` → `dev`

---

### Phase 4 — Triple-stack publishing (V2 §1.5)

**Objectivo**: Mooter publicado como **plugin + skill + MCP server** simultaneamente. Sinal mais forte para Anthropic.

**Tarefas**:
- 4.1 **Plugin Claude Code** (`packages/plugin/`): bundle slash commands `/mooter-route`, `/mooter-stats`, `/mooter-explain`, `/mooter-audit` + subagents + hooks + custom statusline. `marketplace.json` válido.
- 4.2 **Skill portable** (`packages/skill/SKILL.md`): versão sem hooks, só decisão. Para Cowork e Agent SDK directo.
- 4.3 **MCP server** (`packages/mcp/`): tools `classify_prompt(prompt) → tier`, `get_savings(window) → metrics`, `recommend_subagent(task) → name`, `audit_session(id) → report`. Stateless HTTP. Server Card em `.well-known/mcp.json`.
- 4.4 Submeter MCP server a `registry.modelcontextprotocol.io`
- 4.5 PR ao `anthropics/claude-cookbooks` — notebook *"Routing requests across Claude tiers: a transparent open-source approach"*

**Definition of Done**:
- [ ] Plugin instalável via `claude plugin install mooter`
- [ ] Skill funcional em Cowork (testar `Skill("mooter-router")`)
- [ ] MCP server publicado no registry oficial
- [ ] Cookbook PR aberto (não precisa estar merged)
- [ ] ADR `docs/adr/004-triple-stack.md`
- [ ] PR `feat/triple-stack-phase-4` → `dev`

---

### Phase 5 — Codebase-Aware Language Harmonisation (V2 §2.6)

**Objectivo**: killer feature multilingual — auto-detect língua dominante da codebase, route coerente, gerar comments/docstrings que fazem **match** com a codebase (não impor EN).

**Tarefas**:
- 5.1 Detector `detectCodebaseLang(repoPath) → {dominant, confidence, mix[]}` — escaneia comments + docstrings + identifiers non-EN
- 5.2 Persistir `mooter.lang.json` por projecto (cache 7 dias)
- 5.3 Routing rules: `lang=pt-PT + form=code → prefer Opus 4.7 / Gemini 3.1 Pro`; `lang=pt-PT + form=cultural → AMALIA`; `lang=pt-BR + form=cultural → Sabiá-3`; `lang=zh → Qwen 3.6-Max / Kimi K2.6`
- 5.4 Generation post-processor: força output language a fazer match com `codebase_lang`
- 5.5 Flag CLI `--lang-aware` (default on para PT/PT-BR/ZH; opt-in resto)
- 5.6 Métrica `mooter.lang.harmonisation_rate` — % de outputs em língua correcta

**Definition of Done**:
- [ ] Detector ≥90% accuracy num test set de 50 repos curados
- [ ] Tests para 6 línguas (EN, PT-PT, PT-BR, ES, ZH, code-mixed)
- [ ] ADR `docs/adr/005-language-harmonisation.md`
- [ ] PR `feat/lang-aware-phase-5` → `dev`

---

### Phase 6 — Honest Cost Report (V2 §3.3)

**Objectivo**: dashboard local que mostra savings reais sem hype. Paralela do Anthropic Economic Index para indivíduos.

**Tarefas**:
- 6.1 Agregação semanal: `$ saved` (advisory) + `$ saved` (guaranteed, audit-trail) + breakdown por tier
- 6.2 Subscription-aware modifier: distinguir "PAYG saved" vs "Max utilization improved"
- 6.3 Página `landing/app/dashboard/page.tsx` — gráficos Recharts, sem percentagens marketing
- 6.4 Opt-in "Mooter Economic Pulse" — agregado anonimizado (k-anonymity ≥50)
- 6.5 Honest disclaimer: "We can't intercept billing. Numbers marked ~ are estimates from token counts."

**Definition of Done**:
- [ ] Dashboard funcional com 7 dias de telemetria real (do próprio Paulo)
- [ ] `methodology.md` atualizado com fórmulas exactas
- [ ] ADR `docs/adr/006-honest-cost-report.md`
- [ ] PR `feat/honest-cost-phase-6` → `dev`

---

### Phase 7 — Pre-deploy Safety Gate (V2 §3.4)

**Objectivo**: `final-reviewer` automático intercepta `git push`/`merge` e bloqueia se detectar mudanças sensíveis sem review.

**Tarefas**:
- 7.1 Hook `git pre-push` que dispara `mooter audit --pre-push`
- 7.2 Detecção de mudanças em `.env*`, `secrets/`, `.github/workflows/`, migrations Supabase
- 7.3 Se detectado → força revisão com Opus 4.7 + checklist alinhada com [RSP v3.0](https://www.anthropic.com/news/responsible-scaling-policy-v3) (Security · Alignment-relevant changes · Safeguards)
- 7.4 Bloqueia push se review reprovar ou se Paulo não confirmar via `mooter approve <id>`
- 7.5 Log auditável em `~/.mooter/audit.log`

**Definition of Done**:
- [ ] Hook bloqueia push num teste sintético (commit que toca `.env.example`)
- [ ] Bypass explícito documentado (`MOOTER_SKIP_GATE=1`) — para emergências
- [ ] ADR `docs/adr/007-safety-gate.md`
- [ ] PR `feat/safety-gate-phase-7` → `dev`

---

### Phase 8 — Open Routing Eval Harness (V2 §3.5)

**Objectivo**: harness OSS Petri-style — gera prompts sintéticos com tier conhecido, mede precisão, expõe regression suite.

**Tarefas**:
- 8.1 Generator `eval/generate.ts` — N=500 prompts sintéticos balanceados (tier × língua × form)
- 8.2 Runner `eval/run.ts` — corre router sobre dataset, regista decisões
- 8.3 Scorecard `eval/score.ts` — accuracy global + por tier + por língua + adversarial cases
- 8.4 CI GitHub Actions `eval-routing.yml` — corre eval em cada PR, comenta scorecard
- 8.5 README badge: "Routing accuracy 87.3% (500 prompts, 6 langs)"
- 8.6 Publicar dataset + harness OSS

**Definition of Done**:
- [ ] Eval roda em <5min em CI
- [ ] Scorecard reproduzível com seed fixo
- [ ] Regression alert se accuracy cai >3% face a baseline
- [ ] ADR `docs/adr/008-eval-harness.md`
- [ ] PR `feat/eval-harness-phase-8` → `dev`

---

### Phase 9 — Landing /how-it-works + launch comms

**Objectivo**: página comercial que mostra a estratégia visualmente sem revelar a fórmula mágica + posts/PRs/eventos.

**Tarefas**:
- 9.1 Implementar `landing/app/how-it-works/page.tsx` (já há esqueleto fornecido, ver `~/frugal/HOW_IT_WORKS_DRAFT.tsx`)
- 9.2 Diagrama simplificado (4–5 caixas, não 15) — adapta o fluxograma do PDF para versão pública
- 9.3 Tabela tier → use case sem percentagens internas
- 9.4 Secção "Honest about what we don't show" — 3 bullets de transparência
- 9.5 Demo video Loom 5min — captura o pipeline em acção
- 9.6 Blog post `~/mooter/content/blog/why-mooter.md` — engineering-style, 1500 palavras
- 9.7 HN submit `Show HN: Mooter — subscription-aware multilingual LLM router`
- 9.8 Reddit (r/LocalLLaMA, r/ClaudeAI, r/OpenAI)
- 9.9 Outreach 10 vibe coders/OSS maintainers
- 9.10 Apply Anthropic Startup Program

**Definition of Done**:
- [ ] /how-it-works deploy em produção, Lighthouse perf ≥90
- [ ] Demo video subido (público)
- [ ] Blog post publicado
- [ ] HN post submetido (não importa se afundar)
- [ ] ADR `docs/adr/009-launch-comms.md`
- [ ] PR `feat/launch-phase-9` → `dev` → manual merge `main` por Paulo

---

## 4. Subagents que vais usar (já existem em `~/.claude/agents/`)

| Subagent | Modelo | Quando |
|---|---|---|
| `model-architect` | Opus 4.7 | Decisões arquitectura, ADRs, refactor >3 ficheiros |
| `model-reasoner` | Sonnet 4.6 | Bug investigation, root cause, plan técnico |
| `cheap-triage` | Haiku 4.5 | Commit msg, docstring, regex, gere teste trivial |
| `local-summarizer` | Ollama qwen3:30b | Sumarizar ficheiros, comparar snippets, parse logs |
| `local-transformer` | Ollama qwen3:30b | Format transforms, JSON↔YAML, regex apply |
| `final-reviewer` | Opus 4.7 + cache | **Obrigatório** antes de qualquer push para `main` |

⚠️ Se header `<router-hint>` recomenda T0/T1, **delega via Agent tool** (não inlinear). Ver `CLAUDE.md` §"Delegar vs inline — a regra correcta (v2)".

## 5. Hooks Claude Code (já existem)

- `UserPromptSubmit` → `tools/router/inject_context.js` → injecta `<router-hint>` no contexto
- `PreToolUse` → bloqueia spawn em Opus quando tier recomendado é T0/T1
- `PostToolUse` → regista tokens reais por turn → feedback ao classifier

## 6. Quando criar ADR (P8)

Cria ADR em `~/mooter/docs/adr/NNN-titulo.md` quando:
- Escolha entre 2+ stacks ou bibliotecas equivalentes
- Mudança de schema persistente (DB, RDTR JSON, config files)
- Decisão que afecta API pública (CLI flags, MCP tool signatures, plugin commands)
- Trade-off latency vs custo vs qualidade documentado

Formato: contexto · decisão · alternativas consideradas · consequências · status.

## 7. Que delegar 100% (V2 §4.5)

| Tarefa | Razão |
|---|---|
| ✅ Adapters de provider novos no router (template existente) | Mecânico |
| ✅ Tests para módulos já estáveis | Mecânico |
| ✅ Docs/READMEs para features já shipped | Mecânico |
| ✅ Refactor mecânico (rename, extract, type tightening) | Mecânico |
| ✅ Triagem de issues (label, dedupe, close stale) | Bem definido |

## 8. Manter HITL — NÃO delegar (V2 §4.5)

| Tarefa | Razão |
|---|---|
| ❌ `classify.js`, scoring weights, calibration | Core do produto |
| ❌ Decisões pricing/positioning | Estratégia |
| ❌ Qualquer coisa para `main` ou release | Risco |
| ❌ Migrations Supabase, secrets, CI | Security |

## 9. Token budget realista (19 dias)

- Claude Max $200 → ~240–480h Sonnet/janela 5h, ~24–40h Opus
- 3 worktrees × 8h dia útil → ~25 sessões Sonnet/dia possíveis
- ⚠️ Vais bater weekly cap se correres puro Opus → **usa o teu próprio Mooter**: Sonnet implement + Ollama drafts + Opus só para review/architecture
- Ollama qwen3:30b local → triagem issues, drafts docs, resumos logs, parse stack traces — gratuito
- Move 30–40% tool calls para fora do quota → sem perda perceptível em mecânicas

## 10. Quando perguntar (parar e pedir input ao Paulo)

- Conflito real entre V1/V2/V3 num ponto técnico
- Decisão pricing/positioning não documentada nos canónicos
- Custo estimado > $50 numa única tarefa
- Spawn de >5 subagents num turn
- Operação destrutiva: `rm -rf`, `drop table`, `reset --hard`, force push
- Mudança em config partilhada (CI, hooks, settings.json)
- Detectaste discrepância entre V3 e estado real do mercado (ex.: modelo descontinuado)

## 11. Starter command (cola na primeira sessão)

```
Olá. Sou Claude Code dentro de ~/mooter/.

Vou começar pela leitura obrigatória dos canónicos em ~/frugal/MOOTER_*.md (ordem do §1).
Depois faço Phase 0 — audit completo do estado actual de ~/mooter/.

Antes de tocar em qualquer código:
1. confirmo que estou num devcontainer (não no host)
2. confirmo permission-mode auto (não --dangerously-skip-permissions)
3. confirmo que git remote `origin` aponta para anthropics-allowed remote
4. confirmo Ollama warm: `curl http://localhost:11434/api/tags`

Plano:
- Phase 0: AUDIT_2026-05-07.md, top-15 gaps, PR audit/state
- Phase 1: Router core (Camadas 0–3) — 3 worktrees paralelos quando possível
- Phase 2: Tier dispatch + cascade
- Phase 3: RDTR — killer interpretability feature
- Phase 4: Triple-stack publish (plugin + skill + MCP)
- Phase 5: Language harmonisation (PT-PT, PT-BR, ZH)
- Phase 6: Honest Cost Report
- Phase 7: Pre-deploy Safety Gate
- Phase 8: Open Eval Harness
- Phase 9: /how-it-works + launch comms

Em cada Phase: ADR + PR + SYNC.md + página Notion sub-HQ.

Antes de Phase 1: pergunto ao Paulo se há gaps Phase 0 que mudam scope.

Ready. Começo agora pela leitura?
```

## 12. Definition of Done global (gate 2026-05-26)

- [ ] ≥250 stars no GitHub `mooter-ai/mooter`
- [ ] ≥3 contributors externos com PR merged
- [ ] Plugin instalável via `claude plugin install mooter`
- [ ] MCP server público no registry oficial
- [ ] /how-it-works deploy + demo video
- [ ] Blog post publicado + HN submit
- [ ] Cookbook PR aberto no `anthropics/claude-cookbooks`
- [ ] AUDIT_*.md, 9 ADRs, 9 PRs merged em `dev`, manual merge final em `main`
- [ ] SESSION_REPORT_GATE_2026-05-26.md com métricas finais

=== END ===

---

## Notas para o Paulo (não vão para Claude Code)

- Este V2 substitui o V1 (`MOOTER_MASTER_PROMPT_2026-05-07.md`) — fica como referência histórica
- O V2 tem 9 phases vs 6 originais; a diferença é que agora cobre triple-stack publishing, RDTR, language harmonisation, Honest Cost Report, Safety Gate, e Eval Harness — todas as 5 features V2 §3 que impressionam Anthropic
- Tempo estimado: Phase 0 (1d) + Phase 1 (3d) + Phase 2 (2d) + Phase 3 (2d) + Phase 4 (3d) + Phase 5 (2d) + Phase 6 (1d) + Phase 7 (1d) + Phase 8 (2d) + Phase 9 (2d) = **19 dias** (cabe no gate)
- Crítico: Phase 4 antes de 2026-05-19 (Code with Claude London) — ver V2 §3.7
- Sources de cada decisão: V3 §1 (pipeline), V2 §3 (features), V3 §6 (savings), V3 §10 (caveats honestos)
