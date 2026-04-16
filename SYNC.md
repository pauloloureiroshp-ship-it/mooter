# SYNC.md — frugal

> Canal bidirecional entre Cowork (Claude Desktop) e Claude Code CLI.
> **Última actualização:** 2026-04-14 — Claude Code (sessão Gemma 4 swap + validação read-only)

---

## O que é o frugal

**Vibe Coder Intelligence Platform** — router inteligente de LLMs para Claude Code.

Classifica cada prompt em < 50 ms (regex puro, sem LLM) e emite um `<router-hint>` que direciona o modelo certo para o tier certo. Resultado: ~90% de poupança vs usar Opus em tudo.

**Repositório:** `C:\Users\Paulo Loureiro\frugal\` (alias CLI: `~/frugal/`)
**GitHub:** https://github.com/pauloloureiroshp-ship-it/frugal (privado, MIT)
**Hub live:** https://frugal-hub.frugal-hub.workers.dev

---

## Estado actual do projecto — 2026-04-13

### Versão: v0.9.9 (Sessão #roadmap-execution — ROADMAP T0+T1+T2 completos)

#### Novidades da sessão #roadmap-execution (Claude Code, 2026-04-13)

**3 commits:**
| Hash | Descrição | Impact |
|---|---|---|
| `58acd6b` | fix(core): hub https + gpu-probe/ollama repo (T0-B/D) | Hub connectivity fix, fixes synced to repo |
| `6db982d` | feat(platform): admin + budget + model-profile + budget-engine (T0-E/T1) | 8 ficheiros, admin UI, budget onboarding |
| `583189c` | feat(intelligence): model-manager + project-context + activity + feedback (T2) | 4 novos módulos de inteligência |

**Ficheiros criados (7):**
- `landing/app/admin/page.tsx` — dashboard admin com stats, funnel, users, activity
- `tools/router/model-profile.json` — 7 modelos com 8 quality dimensions
- `tools/router/budget-engine.js` — calcula config óptima por perfil (hw+subs+budget)
- `tools/router/model-manager.js` — detecta modelos Ollama, benchmark, recomenda upgrades
- `tools/router/project-context.js` — detecta tipo de projecto e maturity
- `tools/router/activity-classifier.js` — detecta padrões repetitivos, sugere skills
- `tools/router/feedback-collector.js` — recolhe quality ratings para backtest

**Ficheiros modificados (9):**
- `frugal-doctor.js` — https fix + --optimize flag + frugal-hello detection
- `inject_context.js` — maybeHubPush fire-and-forget
- `gsd-statusline.js` — session + total savings side by side
- `generate-frugal-config.ts` — budget_tier + monthly_budget_usd
- `onboarding/page.tsx` — budget-first flow com 5 tiers
- `gold-labels.json` — 77 entries (era 62)
- `gpu-probe.js` + `ollama_call_node.js` — synced to repo

**Safety Gates:**
- T0: ✅ PASS (classifier T2, hub reachable, doctor green, TSC 0 errors)
- T1: ✅ PASS (hub data, budget engine, model-profile, mode system)
- T2: ✅ PASS (model-manager, project-context, activity-classifier, --optimize)

### Sessão #statusline-phase3 (Claude Code, 2026-04-13)

**2 commits:**
| Hash | Descrição | Impact |
|---|---|---|
| `0e8fc16` | feat(statusline): Phase 1+2 — complete main, semantic coherence, cow rebrand | 3 ficheiros, fix render truncado, 🐕→🐮 |
| `ffe82f6` | feat(statusline): Phase 3 — responsive layout, provider layers, latency tradeoff | 118 ins, 77 del em gsd-statusline.js |

**Notion:** [🎨 Sessão 2026-04-13 statusline-phase3](https://www.notion.so/3416f6e42bc48139893ff3669e170102)

**Destaques:**
- Statusline responsivo (savings hero em linha própria)
- Distribution por camadas: 🏠 Local │ ☁️ Claude │ 🔌 External
- 10 modelos com abreviaturas 3-char, só activos visíveis
- Provider dots nomeados (Cld● Oll● DSk○...)
- Session vs lifetime separados (📍 sessão vs 🌍 lifetime)
- Latency tradeoff explícito (⏱ ~Xs/prompt · +Ys for savings)
- VS Code extension v0.5.1→v0.5.2, settings.json single source

---

#### 📥 COWORK → CLAUDE CODE — Missão para próxima sessão
> Actualizado em 2026-04-14 (Claude Code · rebrand P0/P1). Estado: ✅ Rebrand tools/router concluído — 1 pendente bloqueado por dados (Fase 3)

**Sessão 2026-04-14 — Mooter rebrand P0/P1 tools/router (Claude Code)** · [Notion](https://app.notion.com/p/3426f6e42bc481f1b5aae8ec3c332232)

Commits: `c330b3d` (mooter-mode.js + frugal-mode.js alias) · `6dbad9a` (.env.local.example mooter.ai) · `ac1a56c` (migration 004 mooter_events view)

✅ **Concluído:**
- Hub URLs → `mooter-hub.frugal-hub.workers.dev` (já feito em 0187b46/9821a92 — confirmado)
- `.frugal-mode.json` → `.mooter-mode.json` com auto-migração silenciosa
- `mooter-mode.js` canónico + `frugal-mode.js` como require-shim (backward compat)
- `landing/.env.local.example` NEXT_PUBLIC_SITE_URL → mooter.ai
- Migration `004_mooter_events_alias.sql` — VIEW sobre frugal_events (no-drop)
- Dashboard community route — já tinha `MOOTER_HUB_URL || FRUGAL_HUB_URL` fallback

⏳ **Pendente Fase 3 (bloqueado — não tocar ainda):**
- `hub/wrangler.toml` swap para D1 mooter-hub: D1 existe (UUID 3659b56e) mas está vazia (0 tabelas). Swap imediato perde histórico de `frugal_events`. Precisa de migração de dados primeiro.
- `landing/app/setup/page.tsx` paths `~/.frugal/auth.token` — runtime ainda usa; alterar quebra install-flow. Bloqueia até rebrand do CLI.

**Safety gate final:** classify.js ✅ · curl mooter-hub ✅ · mooter-mode.js ✅ · frugal-doctor.js ✅ (1 warning não relacionado)

**Próxima missão:** Continuar Gemma 4 work — `classify.js` ambiguous thresholds (ver secção arquivo abaixo). Fase 3 rebrand (D1 data migration) fica para depois de ter ≥3 beta users.

---

#### 📥 Sprint B.0–B.3 — METHODOLOGY FOUNDATION + SHADOW + CLOSED LOOP (2026-04-16)
> Actualizado em 2026-04-16 (Claude Code · 15 commits atómicos). Estado: ✅ **Completo.**

**Sessão 2026-04-16** · [Notion](https://www.notion.so/3446f6e42bc48100afdbf228fec08974) · [Fluxograma](https://www.notion.so/3446f6e42bc48120ba57d430785a9452)

✅ **Sprint B.0 — Foundation (4 commits):**
- `1b81d17` — `docs/METHODOLOGY.md` source of truth (19 secções, savings formula, per-user)
- `caf8a67` — `validation-set.json` (60 gold labels) + `validate-set.js` drift detector
- `16c2f14` — `user-profile.js` consolidador (hw+subs+pattern+learned)
- `5630e46` — Audit harmony: 3 SSOT roles, naming align, migration 005

✅ **Safety fix (1 commit):**
- `5e50cbb` — HIGH_RISK guard em early-returns + beast-mode intent + PT merge patterns (+5pp accuracy: 70→75%)

✅ **Sprint B.1 — Shadow Mode (4 commits):**
- `c273d91` — Schema + flag + sampling module (20 tests, default OFF)
- `c87b1d7` — Background spawn em inject_context.js (fire-and-forget, Windows-safe)
- `781a14d` — Judge nightly Ollama (qwen3:30b) + Task Scheduler .cmd
- `2576620` — Backtest consome shadow verdicts (shadow_better → force demote)

✅ **Sprint B.2 — Closed Loop (3 commits):**
- `bc94084` — `signals.js` — 187 implicit signals (91% positive, 9% negative)
- `4eb7f8c` — `ground-truth.js` — oracle determinístico (v1 foundation)
- `88ea3fb` — `classify.js` lê budget cap do user-profile (per-user adaptation live)

✅ **Sprint B.3 — Infra (3 commits):**
- `aa99b79` — `privacy.js` (12 regex rules, 45 PII found) + `similarity.js` (KNN + nomic-embed-text)
- `61c68db` — `sync-to-runtime.sh` + frugal→mooter skill deprecation (10 skills)

**Números:** 89 testes pass · 18 ficheiros criados · validation 75% · 2 safety bugs eliminados · nomic-embed-text instalado

**Para activar:** `bash tools/router/sync-to-runtime.sh` → editar `.mooter-mode.json` shadow_mode:true → `schtasks /create /tn FrugalShadowJudge ...`

🎯 **Próxima missão (Sprint B.4+):**
- Thompson Sampling bandit (zona confidence 0.5–0.75)
- Semantic layer L1.5 (centróides por categoria)
- Correr teste A/B via `docs/MASTER_PROMPTS/MOOTER_AB_TEST.md`
- Acumular ≥100 shadow pairs para validar loop

---

#### 📥 COWORK → CLAUDE CODE — Sprint B handoff (arquivo, 2026-04-15)
> Actualizado em 2026-04-15 (Claude Code · Sprint A entregue). Estado: ✅ Executado em Sprint B.0–B.3 acima.

**Sessão 2026-04-15 — Feedback loop UX + Sprint B handoff (Claude Code)** · [Notion](https://www.notion.so/3446f6e42bc481269744cc7780b095fe)

✅ **Sprint A concluído (3 commits atómicos):**
- `2d1f5fc` — Slash commands `/mooter-good`, `/mooter-bad`, `/mooter-feedback` + mirror `feedback-collector.js` para runtime
- `b86afc1` — `backtest.js` consome `quality_feedback` events: bad→demote (length-agnostic), good→veto de demote. 66/66 tests passam, schema inalterado
- `5b4a5d6` — `/frugal-status` mostra feedback count (nudge de adopção) com tail "Sprint B unlocks at ≥30"

🔁 **Loop feedback fechado end-to-end**: `/mooter-good` → `feedback-collector.js` → `decisions.log` → `backtest.js resolveExplicitFeedback()` → `router-tuning.json` → `update-router.js` → `classify.js` patch.

**Descobertas que pouparam trabalho:**
- `feedback-collector.js` já estava 100% implementado — faltavam só entry points
- `replay.js --gold-labels` já falha CI com accuracy < 85% → gate #4 já existia
- Sentry sem destino válido (landing legacy, hub sem bundler, mooter-landing estático, savings-tracker dev-local) → pivot para backtest wiring
- Zero edits em `classify.js`, `inject_context.js`, migrations, workflows CI

⚠️ **Pré-requisito para Sprint B (bloqueia tudo):**
Paulo acumular ≥ 30 ratings reais via slash commands ao longo de 1–3 dias de uso. Sem sinal suficiente, shadow mode e bandit aprendem ruído. Alvo mínimo: 10 T0/T1/T2 + 5 T3.

🎯 **Sprint B (ordem sugerida, uma sessão dedicada cada):**
1. **Shadow Mode Lite 5%** — spawn tier-1 em background, Ollama LLM-as-judge nightly. Schema D1 tem colunas prontas (`ab_variant`, `shadow_output`). Feature flag obrigatório default OFF.
2. **Thompson Sampling bandit** na zona confidence 0.5–0.75 — Beta distribution per `(task_category × arm)`, reward = `3×rating + no_followup + no_override`. Substitui ~50% das chamadas Haiku arbiter. Ref: [BaRP arXiv 2510.07429](https://arxiv.org/abs/2510.07429).
3. **L1.5 Semantic layer** — `nomic-embed-text` via Ollama, centróides por categoria, cosine similarity entre regex e Haiku arbiter. Latency budget <50ms. Ref: [vLLM Semantic Router](https://blog.vllm.ai/2025/09/11/semantic-router.html).
4. **Sentry** — adiada até `mooter.ai` live com Next.js próprio (não é a legacy `landing/`).

**Master prompt pronto para outro terminal:** `docs/MASTER_PROMPTS/SPRINT_B_SHADOW_MODE_MASTER_PROMPT.md` — cola num novo terminal Claude Code quando tiveres ≥30 ratings. 4 fases, 4 commits atómicos, invariantes não-negociáveis, plano B de rollback.

**Critério de sucesso Sprint B**: overall ≥ 85% good após 100+ ratings; shadow apanha ≥5 over-routings em 100 amostras; bandit reduz custo arbiter ≥40% sem regressão; semantic apanha ≥20% dos casos que hoje vão ao Haiku.

**Safety gates Sprint B**: cada change em classify/inject_context → commit atómico + CI verde (gold-labels ≥85%) + feature flag default OFF + final-reviewer antes de merge.

---

#### 📥 COWORK → CLAUDE CODE — Missão anterior (arquivo — Gemma 4 E2E)
> Actualizado em 2026-04-14 (Claude Code · sessão E2E). Estado: ⚠️ Gemma 4 validado com 2 bloqueadores identificados

**Sessão 2026-04-14 — Gemma 4 E2E validation + feedback loop** · [Notion](https://app.notion.com/p/3426f6e42bc481c7b797fb258084cbb0)

- ✅ Smoke test 3 prompts: trivial 2.5s / ambíguo 4.2s (empty) / reasoning 4.2s (PT→ES drift)
- ❌ **Wrapper estrangula Gemma 4**: `num_predict:512` + `think` default no ollama_call.sh → o thinking preamble consome todo o budget e `response` vem `""`. Fix testado manualmente: `num_predict:2048` + `think:false` → 549 tokens em 4.5s, resposta limpa em PT-PT.
- ❌ **Arbiter nunca activou**: 0 entries `arbiter_honored:true` em 788 prompts. Condição (`ambiguous_*` + confidence < 0.75) nunca satisfeita em uso real — classifier está a resolver tudo em fast path.
- ✅ backtest+update-router: 788 prompts, poupança 45.7% ($19.27 actual vs $35.46 naive T3); ideal $18.15 com +$1.12 se 3 demote patterns aplicados (já aplicados via update-router.js).
- ⚠️ **Language drift**: prompt C em PT respondeu em ES — Gemma 4 tem tendência multilingual menos disciplinada que qwen3.
- 🟡 classify.js.bak actualizado automaticamente; zero edits manuais em classify.js / inject_context.js / ollama_call.sh (read-only honrado).

**Follow-up aplicado na mesma sessão (2ª passagem):**
- ✅ `ollama_call.sh` fixado: `num_predict:2048` + `think:false` + system prompt de language-matching. 3/3 prompts testados respondem em PT-PT correctamente.
- ✅ `arbiter.js` refactorado: novo `callOllamaSync()` + `extractDecisionFromText()` + arbitrate() prefere Ollama, fallback para Haiku se `ANTHROPIC_API_KEY` existir.
- ✅ Criado `_arbiter_ollama_call.js` (helper dedicado) — spawnSync no Windows corrompe argv inline com payloads >2KB, ficheiro separado resolve.
- ✅ Testado: `node arbiter.js "devo refatorar?"` → T2/model-reasoner em 825ms, backend:ollama, custo:$0. Segundo prompt → T0/local-summarizer em 576ms. JSON válido nos dois.

**Estado real do arbiter agora**: funcional via CLI; **invocação automática via inject_context ainda não dispara** porque o classifier regex é demasiado confiante (emite confidence ≥0.75 para quase tudo, nunca cai em `ambiguous_*`). Este é o último bloqueador para o arbiter trabalhar organicamente em produção.

**Master prompt reutilizável**: `~/.claude/docs/MASTER_PROMPTS/GEMMA_VALIDATION.md` — cola-se noutro terminal para validar/trocar modelo Ollama do arbiter sem risco.

**Próxima missão (T2):** Rever thresholds em `classify.js` — especificamente as condições que emitem `ambiguous_short/medium/long` e o cálculo de confidence. Em 788 prompts reais, 0 caíram em categoria ambígua. Hipótese: os regex de task_category matcham cedo demais. Solução provável: baixar confidence quando o match é fraco (<3 keywords), ou criar `ambiguous_default` como fallback quando nenhum pattern bate com score alto.

---

#### 📥 COWORK → CLAUDE CODE — Missão anterior (arquivo)
> Actualizado pelo Cowork em 2026-04-13. Estado: ✅ Lido em sessão 2026-04-13 (Claude Code)

**INFRA.md foi reescrito com todos os IDs reais.** Antes de qualquer trabalho, lê `INFRA.md` — tem os IDs de Vercel, Supabase, Cloudflare e Notion + padrões exactos de tool call MCP.

**Confirmações desta sessão Cowork (não precisas de verificar):**
- ✅ GitHub OAuth App "Frugal" já existe (github.com/settings/developers)
- ✅ Supabase GitHub provider já está activo
- ✅ v0.9.9 live em https://landing-five-azure-16.vercel.app (commit 4adf734 corrigiu duplicate admin page)
- ✅ Vercel auto-deploy activo — `git push origin main` é suficiente

**IDs críticos (agora em INFRA.md):**
- Vercel team: `team_q3kDk3fEFhlL6AcNryTzH3o2` | landing project: `prj_2aZMQagzjYOtLyvofeWPnEA0mM1b`
- Supabase frugal: `eymtobwinevywmmlmxqa` (sa-east-1, ACTIVE)
- Cloudflare account: `b1093c8a6e663afd02f98a1e87d0fa34` | D1: `320b55f6-9444-4deb-bcd5-e8227739546e`
- Notion HQ: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

**Próximas prioridades:**
1. **Paulo: convidar 3 amigos Friends Beta** — link: https://landing-five-azure-16.vercel.app — desbloqueia T3
2. **Paulo: VSCode extension publish** — .vsix gerado, aguarda Azure DevOps PAT
3. **Quando ≥ 3 users com dados reais** → avançar T3: Desktop App (Tauri v2), MCP Server, Federated Learning v2

**O que NÃO fazer na próxima sessão:**
- Não criar GitHub OAuth App (já existe)
- Não activar Supabase provider (já activo)
- Não fazer deploy manual — push para main é suficiente

---

### Versão: v0.9.8 (Sessão #23 — fix: qwen3 think mode + Option A protection para novos utilizadores)

#### Novidades da sessão #23
| Componente | Estado | Notas |
|---|---|---|
| **`inject_context.js`** | ✅ COMMIT `9b558e7` | Option A lê `_hwCapability.option_a_model` com fallback `qwen2.5:3b` — hardcode removido |
| **`gpu-probe.js`** | ✅ LOCAL | `buildHwCapability()` agora grava `option_a_model: 'qwen2.5:3b'` no hw-capability.json — protege novos utilizadores com GPU potente |
| **`ollama_call_node.js`** | ✅ LOCAL | `think: false` no body do request ao Ollama — desactiva thinking mode do qwen3 para Option A |

**Root cause do bug:** `hw-capability.json` detectava RTX 4090 e recomendava `qwen3:30b` como `recommended_t0`. O `inject_context.js` usava esse valor para Option A. O qwen3:30b com thinking mode demora 17s+, o timeout era de 8s → erro 500 em cada hook invocation.

**Fix arquitectural:** separar `recommended_t0` (modelo para delegação) de `option_a_model` (modelo para pre-compute rápido). O qwen2.5:3b é sempre usado para Option A independentemente da GPU.

**Pendente para Claude Code:** `gpu-probe.js` e `ollama_call_node.js` estão em `~/.claude/` fora do repo. O fix local foi aplicado mas não está no repo. Para proteger novos utilizadores na instalação, o `install.sh` e `install-windows.ps1` precisam de aplicar o patch durante o setup. Ver MP-19.

---

### Versão: v0.9.8 (Sessão #strategic-review — Cowork — ROADMAP_MASTER_V2)

#### Novidades da sessão #strategic-review (Cowork, 2026-04-13)
| Componente | Estado | Notas |
|---|---|---|
| **ROADMAP_MASTER_V2.md** | ✅ CRIADO | `~/frugal/ROADMAP_MASTER_V2.md` — 4 tiers, safety gates, atlas de soluções públicas |
| **Notion** | ✅ REGISTADO | [🗺️ Sessão 2026-04-13 strategic-review](https://www.notion.so/3416f6e42bc481a8b6bce232218e7098) |
| **Notion** | ✅ REGISTADO | [🚀 Sessão 2026-04-13 roadmap-execution](https://www.notion.so/3416f6e42bc481dc93c3fb4c62521b06) |

#### 📥 COWORK → CLAUDE CODE — Missão para próxima sessão

**Abrir `ROADMAP_MASTER_V2.md` e executar TIER 0 pela ordem indicada.**

Estado a verificar antes de começar:
```bash
node ~/frugal/tools/router/classify.js "debug this stack trace" --debug
# Esperado ACTUAL: T0 (errado) → TIER 0 vai corrigir para T2

node ~/frugal/tools/router/frugal-doctor.js
node ~/frugal/tools/router/replay.js --gold-labels 2>&1 | grep accuracy
```

Ordem de execução TIER 0:
1. **T0-A** — classifier debug misroutes + gold-labels gl-063 a gl-072
2. **T0-B** — hub timeout fix (3s→6s + retry)
3. **T0-C** — frugal-hello skill em falta
4. **T0-D** — gpu-probe.js + ollama_call_node.js para o repo (fix sessão #23)
5. **T0-E** — Friends Beta completar (verificar MP-1 a MP-6, aplicar o que falta)

Safety gate T0 obrigatório antes de avançar para T1.

---

### Versão: v0.9.8 (Sessão #22 — MP-15/16/17/18: audit, GPU, flowchart, metrics coherence)

#### Novidades da sessão #22
| Componente | Estado | Notas |
|---|---|---|
| **MP-15 Pre-flight audit** | ✅ LIVE | `tools/audit/preflight-audit.js` — 5 blocos, READY FOR MACBOOK |
| **MP-16 GPU + Metrics tab** | ✅ LIVE | GPU name na sidebar, tab Metrics com comparação de fontes |
| **MP-17 Flowchart interactivo** | ✅ EM PROGRESSO | Tab "How it works" com 6 nós animados, dados reais |
| **MP-18 Metrics Coherence** | 📋 SPEC PRONTA | `docs/MP-18-metrics-coherence.md` — auto-sync pipeline completo |
| **Migration 004** | ✅ EXECUTADA | `gpu_name TEXT + gpu_vram_mb INTEGER` na tabela devices |
| **frugal-doctor --sync** | ✅ OK | gpu_name agora incluso no payload (RTX 4090) |
| **Savings field fix** | ✅ FIX | `saved` em vez de `guaranteed_saved` — $72.83 correctos |

#### Pendentes para próxima sessão (prioritários)
1. **MP-19** — `docs/MP-19-backlog-windows-fixes.md` — 5 grupos: classifier debug fix, hub timeout, frugal-hello, gold-labels expansion, applyActiveMode
2. **MP-20** — `docs/MP-20-savings-transparency.md` — methodology visível em todas as superfícies + success-fee model
3. **MP-21** — `docs/MP-21-intelligence-platform-v2.md` — perfil exclusivo por utilizador, rich terminal feedback, qualidade no backtest, Commands FAQ, sanitize-log, arquitectura actualizada
4. **MacBook install** — quando o Mac estiver disponível (não urgente)

#### Estado das 5 superfícies de métricas (antes do MP-18)
| Superfície | Estado | Fix em MP-18 |
|---|---|---|
| Statusline terminal | ⚠️ Só sessão atual | Peça 6: session% + total% |
| Dashboard Supabase | ⚠️ Sync manual | Peça 1: auto-sync.js |
| decisions_log Supabase | ❌ VAZIA | Peça 2: INSERT em install-complete |
| frugal-hub D1 | ❌ VAZIA | Peça 3+4: hub-push automático |
| Landing page counters | ❌ Fallback 1437/1 | Peça 5: mapear campos reais |

---

### Versão: v0.9.8 (Sessão #21 — MP-12/13/14: multi-device, admin dashboard, app shell redesign)

#### Novidades da sessão #21
| Componente | Estado | Notas |
|---|---|---|
| **MP-12 Multi-device** | ✅ LIVE | `devices` table + RLS + DevicesCard + frugal-doctor sync com device_id |
| **MP-13 Admin dashboard** | ✅ LIVE | 4 tabs (Overview/Users/Devices/Health), filtros, CSV export, decisions_log |
| **MP-14 App shell redesign** | ✅ LIVE | Sidebar fixa, 3 tabs dashboard, Settings page, admin integrado no shell |
| **Supabase migrations** | ✅ EXECUTADAS | 002_devices_table.sql + 003_decisions_log.sql em produção |
| **frugal-doctor --sync** | ✅ OK | 409 decisões, 69% savings, $72.83 poupados (Windows RTX 4090) |
| **Route group (app)** | ✅ NOVO | Auth check centralizado, sidebar, admin link condicional |
| **Settings page** | ✅ NOVO | /settings com profile, subscriptions, devices, logout |

#### Estado actual da área logada
- URL: https://landing-five-azure-16.vercel.app/dashboard
- Shell com sidebar: Dashboard / Settings / Admin (só para paulo.loureiro.shp@gmail.com)
- Dashboard: 3 tabs — Overview (Savings Hero + AI Stack + Health), Devices, Setup Guide (TerminalBlock)
- Admin: 4 tabs — Overview (funnel + metrics), Users (search/filter/CSV), Devices, Health

#### Pendentes para próxima sessão
1. `v0.9.8` hardcoded na sidebar → passar a dinâmico (ler de `frugal_version` do profile)
2. Decisions tab no dashboard (histórico via `decisions_log` table)
3. Install frugal no MacBook
4. Auto-sync silencioso no hook PostToolUse
5. Setup Wizard master prompts para utilizadores beginner (spec em `docs/PRD-setup-wizard.md`)

---

### Versão: v0.9.8 (Sessão #19 — Friends Beta OAuth + Setup Health Check)

#### Novidades da sessão #19
| Componente | Estado | Notas |
|---|---|---|
| **OAuth GitHub** | ✅ LIVE | Client ID corrigido (O vs 0), Supabase Site URL, Redirect URLs |
| **Implicit flow bridge** | ✅ LIVE | /auth/callback HTML bridge + /auth/token endpoint |
| **POST /api/install-complete** | ✅ NOVO | Endpoint para CLI sincronizar dados com Supabase |
| **Dashboard Setup Health Check** | ✅ NOVO | Card 5 checks (installed, hw, anthropic, ollama, savings) |
| **frugal-doctor --sync** | ✅ NOVO | Sincroniza dados locais para o dashboard |
| **auth/token token no response** | ✅ NOVO | CLI pode guardar token para --sync |

#### Arquitectura de dados por utilizador (estado actual)
- **Local**: subscription-profile.json, hw-capability.json, decisions.log
- **Supabase**: profiles (user_id, hardware_tier, frugal_config com has_anthropic_key, has_ollama, decisions_count, savings_usd)
- **Gap fechado**: frugal-doctor --sync sobe dados locais para Supabase

---

### Versão: v0.9.7 (Sprint 4 — Dashboard MVP + Option A fix)

| Componente | Estado | Notas |
|---|---|---|
| `classify.js` v0.10 | ✅ em prod | +variant_hint, +SUBAGENT_SPAWN_RE, +previous_tier inheritance |
| `inject_context.js` | ✅ v0.10 | +readLastSessionTier() + export FRUGAL_PREV_TIER |
| `patterns.js` | ✅ em prod | single source of truth (v0.7.0) |
| 6 subagents | ✅ em prod | model-architect, model-reasoner, cheap-triage, local-summarizer, local-transformer, final-reviewer |
| `backtest.js` | ✅ v0.9.5 | +--export-events flag, circular dep fix |
| `savings-tracker.js` | ✅ em prod | HTTP :7821, statusline v3 |
| `gpu-probe.js` | ✅ em prod | NVIDIA/Apple/AMD/CPU fallback |
| `onboarding.js` | ✅ em prod | chamado automaticamente pelo inject_context.js |
| `hub-push.js` | ✅ URL corrigida | frugal-hub.frugal-hub.workers.dev |
| `hub-pull.js` | ✅ URL corrigida | frugal-hub.frugal-hub.workers.dev |
| `hub-status.js` | ✅ URL corrigida | frugal-hub.frugal-hub.workers.dev |
| `frugal-mode.js` | ✅ NOVO | Beast/Zen/Auto mode system |
| **frugal-hub** (Cloudflare) | ✅ LIVE | D1 + R2 + Worker deployed |
| **Landing v9** | ✅ DEPLOYED | live counters, Install Now CTA, slash commands grid, ComparisonSection |
| **Dashboard** | ✅ v0.6.0 | 3 páginas + sidebar + /frugal-dashboard skill |
| VSCode extension | ⚠️ v0.4.0 | não publicado no marketplace |
| Skills (11 total) | ✅ | 5 originais + 3 modos + frugal-hello + frugal-doctor + frugal-dashboard |
| `frugal-doctor.js` | ✅ NOVO (2026-04-11) | Diagnóstico completo cross-platform, --fix mode |
| `install.sh` v2 | ✅ NOVO (2026-04-11) | LaunchAgent macOS + wizard subscriptions + smoke test |
| `gsd-turn-end.js` Stop hook | ✅ LIVE (2026-04-11 pm) | feedback loop agora registado em settings.json via install.sh + install-windows.ps1 |
| Multi-model telemetry | ✅ LIVE (2026-04-11 pm) | `detectExternalModel()` regista codex/gemini/aider no execution.log |
| `feedback-collector.js` | ✅ NOVO (Sprint 2) | CLI interactivo para ratings de decisões do router |
| `gold-labels.json` | ✅ NOVO (Sprint 2) | 62 entradas curadas, 95.2% accuracy validada |
| `replay.js --gold-labels` | ✅ NOVO (Sprint 2) | Validação offline do classifier contra gold labels |
| `backtest.js --export-events` | ✅ NOVO (Sprint 2) | Export de eventos com privacy contract enforced |
| `prompts/` gitignored | ✅ (Sprint 2) | Conteúdo estratégico removido do repo público |
| `hub/README.md` | ✅ NOVO (Sprint 2) | Documentação de deploy do Worker |
| `ARCHITECTURE.md` | ✅ Actualizado (Sprint 2) | Module map + runtime flow com sessions #10-13 |
| `CLAUDE.md.template` | ✅ NOVO (Sprint 2) | Doutrina backup no repo |
| `frugal_events` table (D1) | ✅ APLICADA (Sprint 3) | Migration 002 aplicada, tabela vazia |
| `POST /submit-events` | ✅ NOVO (Sprint 3) | Schema validation, bearer auth, rate limiting |
| `GET /aggregate-stats` | ✅ NOVO (Sprint 3) | Live aggregation de frugal_events |
| `hub-submit-events.js` | ✅ NOVO (Sprint 3) | Cliente local, batching, dry-run |
| `.github/workflows/test.yml` | ✅ Actualizado (Sprint 3) | +gold-labels +event-builder +latency |
| `.github/workflows/deploy-hub.yml` | ✅ NOVO (Sprint 3) | Auto-deploy Worker em hub/ changes |
| `install.sh` bash 3.2 compat | ✅ FIX (Sprint 3) | ${var,,} → tr lowercase |
| `MASTER_ARCHITECTURE.md` | ✅ NOVO (Sessão #16) | 48KB, 25 secções — mapa técnico completo da solução |
| `architecture-diagram.html` | ✅ NOVO (Sessão #16) | 66KB, 10 tabs interactivos, dark theme |
| `frugal-flowmap.html` | ✅ NOVO (Sessão #16) | 74KB, 6 vistas operacionais ultra-profissional |
| `update-metrics.js` | ✅ NOVO (Sessão #16) | Conta corpus real de decisions.log → metrics-snapshot.json |
| `backtest.js` | ✅ RESTAURADO + integrado | Restaurado 555 linhas do git + auto-spawn update-metrics em main() |
| `savings-tracker.js` | ✅ RESTAURADO + /corpus | Restaurado 1032 linhas + GET /corpus endpoint com fallback live |
| `run-backtest.cmd` | ✅ actualizado (Sessão #16) | +update-metrics.js --readme no fim de cada run diário |
| `prompt-optimizer.js` | ✅ NOVO (Sprint 5-A) | 5 estratégias S1-S5, guardrails, <5ms, 46/46 testes |
| `prompt-optimizer.test.js` | ✅ NOVO (Sprint 5-A) | 46 testes — padding, tier, category, error, lang |
| `inject_context.js` | ✅ v0.10+ (Sprint 5-A) | +optimizer call + `<optimized-task>` emission + logging |

### Evolução recente (snapshot completo em [📊 Notion](https://www.notion.so/33f6f6e42bc481fea8e1e065f53ee73b))

- **v0.7 → v0.8** — classifier regex core + weighted scoring + arbiter Haiku para long tail
- **v0.8 → v0.9** — mode system, subscription profile, decomposition, adversarial test generator
- **v0.9 → v0.9.3** — hub Cloudflare deployed, GPU probe, statusline v0.12, Windows compat, onboarding auto
- **v0.9.3 → v0.9.4** — security audit, landing v9, Supabase + GitHub OAuth, 4-step onboarding, cross-platform installer
- **Sessões 2026-04-10/11** — E2E MVP validation, Landing v10 + OS Vision, classify.js v0.10, frugal-doctor, install.sh v2
- **Sessão #12 (2026-04-11 pm)** — bug crítico do feedback loop descoberto e corrigido (Stop hook nunca estava em `settings.json`), P0 cache key, P1 mode system, P3 multi-model telemetry, P4 SSOT dedup, push entregue (9 commits)
- **Sessão #14 (2026-04-11 noite)** — Sprint 2 completo: feedback-collector.js, gold-labels.json (62 entries, 95.2%), --gold-labels em replay.js, --export-events em backtest.js. Repo cleanup: prompts/ gitignored, hub/README.md, ARCHITECTURE.md actualizado, CLAUDE.md.template. 4 commits pushed
- **Sessão #15 (2026-04-12)** — Sprint 3 completo: migration 002 aplicada no D1, POST /submit-events + GET /aggregate-stats no Worker, hub-submit-events.js cliente, CI test.yml expandido, deploy-hub.yml, install.sh bash 3.2 compat. 4 commits pushed
- **Sessão #16 (2026-04-11 noite)** — Documentação total da arquitectura: MASTER_ARCHITECTURE.md (48KB, 25 secções), architecture-diagram.html (66KB, 10 tabs), frugal-flowmap.html (74KB, 6 vistas operacionais). Corpus auto-update: update-metrics.js, backtest.js integrado (spawn background), savings-tracker.js +/corpus endpoint, run-backtest.cmd actualizado. Dois ficheiros restaurados do git (estavam truncados: backtest.js 414→555 linhas, savings-tracker.js 877→1032 linhas). [Notion](https://www.notion.so/3406f6e42bc4810fbb95d2901a1979ac)
- **Sessão #17 (2026-04-11 noite) — MILESTONE** — Sprint 5-A: Prompt Optimizer completo. frugal passa a optimizar o prompt além de o rotear. prompt-optimizer.js (5 estratégias S1-S5, <5ms, 46/46 testes), inject_context.js +<optimized-task>, backtest.js +optimizer report, savings-tracker.js +/optimizer-stats. Dry-run: 56% dos 363 prompts históricos optimizados, ~850-1400 tokens saved est. real. Value prop evolui: "envia o prompt certo para o modelo certo". [Notion Milestone](https://www.notion.so/3406f6e42bc481f48bd9ecc919b4055e)
- **Sessão #18 (2026-04-12)** — Validação 9/9 do router (97% saved, $0.06 gasto), fix bug TUNED_DEMOTE vs quality_intent (classify.js + 3 testes), fix PostToolUse:Bash model reporting (last-subagent.json TTL 30s), ROUTING_LESSONS.md criado, CLAUDE.md global+projecto actualizados com definição de "estado de sessão". 3 commits pushed (973b2a3, d40ed71, 58e2dd1). [Notion](https://www.notion.so/3406f6e42bc4817c86bfcd9acc67f55e)

### Skills instaladas

| Skill | Trigger | Função |
|---|---|---|
| `/frugal-status` | `/frugal-status` | Health check: hook, Ollama, hub, last decisions |
| `/frugal-savings` | `/frugal-savings` | Report económico: savings + projecção anual |
| `/frugal-route` | `/frugal-route <task>` | Classifica uma tarefa antes de executar |
| `/frugal-summary` | `/frugal-summary` | O que o router decidiu nesta sessão |
| `/frugal-update` | `/frugal-update` | Pull do GitHub + sync classifier |
| `/frugal-beast` | `/frugal-beast` | Beast Mode: força T3 (Opus) em tudo |
| `/frugal-zen` | `/frugal-zen` | Zen Mode: cap em T1 (Haiku/Ollama) |
| `/frugal-auto` | `/frugal-auto` | Volta ao routing inteligente automático |

### frugal-hub — Detalhes de produção

| Campo | Valor |
|---|---|
| Worker URL | `https://frugal-hub.frugal-hub.workers.dev` |
| D1 database_id | `320b55f6-9444-4deb-bcd5-e8227739546e` |
| R2 bucket | `frugal-hub-storage` |
| Account ID | `b1093c8a6e663afd02f98a1e87d0fa34` |
| Conta Cloudflare | paulo.loureiro.shp@gmail.com |
| Version ID | `bb4686c8-623d-4513-b62b-347e92182108` |
| Crons | hourly aggregate / daily generate / weekly notify |
| Smoke test | `/health` ok, `/api/stats` ok, `POST /api/delta` → trust_score: 0.8 |

### HEAD do repo (após sessão #18, 2026-04-12)

```
58e2dd1  fix: PostToolUse:Bash must not report main session model  ← HEAD
d40ed71  docs: clarify session-state exception to prevent false Opus inline
973b2a3  fix: tuned_demote must not override quality_intent
8db12ec  docs(sync): session #16 — Sprint 4 complete, v0.9.7
bd9e67a  fix(router): Option A now fires for hw-recommended Ollama models
92c3c19  feat(dashboard): Sprint 4 — dashboard MVP + misroutes + community pages
```

### Loopholes — Estado 2026-04-10

| ID | Descrição | Estado |
|---|---|---|
| L1 | Hub não estava deployed | ✅ FECHADO — live em frugal-hub.frugal-hub.workers.dev |
| L2 | install.sh não instalava onboarding/hub-push/hub-pull | ✅ FECHADO — glob *.js inclui, doctor check adicionado |
| L3 | inject_context.js não chamava onboarding automaticamente | ✅ FECHADO — fix aplicado pelo Claude Code |
| L4 | backtest.js não chamava hub-push automaticamente | ✅ FECHADO — fix aplicado pelo Claude Code |
| L5 | Dashboard não funcional | ✅ FECHADO — v0.6.0 com 3 páginas + sidebar em localhost:7820 |
| L6 | URL frugal-hub.workers.dev inexistente | ✅ FECHADO — URL correcta em todos os ficheiros |
| L7 | VSCode extension não publicada | 🟡 Pendente |
| L8 | Time-based routing não implementado | 🟡 Pendente |

---

## Infraestrutura disponível

### Cloudflare — frugal-hub

| Campo | Valor |
|---|---|
| Worker | `frugal-hub` em `frugal-hub.frugal-hub.workers.dev` |
| D1 | `frugal-hub` (320b55f6-9444-4deb-bcd5-e8227739546e) |
| R2 | `frugal-hub-storage` (10GB free tier) |
| Secrets | PAULO_WEBHOOK_URL, PAULO_EMAIL |
| R2 objects | router-tuning-latest.json, model-catalog-latest.json |

### Supabase — projecto `frugal`

| Campo | Valor |
|---|---|
| Project ID | `eymtobwinevywmmlmxqa` |
| URL | `https://eymtobwinevywmmlmxqa.supabase.co` |
| Region | `sa-east-1` |
| Status | `ACTIVE_HEALTHY` |
| RLS | ✅ `Allow anonymous inserts` activa na tabela `waitlist` |

### Vercel — Landing

| Campo | Valor |
|---|---|
| Team | `pauloloureiroshp-ship-its-projects` |
| URL landing | `https://landing-five-azure-16.vercel.app/` |

---

## Master Prompts criados (para Claude Code)

| Ficheiro | Conteúdo |
|---|---|
| `FIXES_MASTER_PROMPT.md` | L1 + L3 + L4 + 5 skills originais + install.sh |
| `MODES_MASTER_PROMPT.md` | Beast/Zen/Auto mode system — inject_context.js patch |
| `LANDING_MASTER_PROMPT_V8.md` | Landing v8 — live counters + Install Now + slash commands |
| `INTELLIGENCE_LOOP_MASTER_PROMPT.md` | frugal-hub architecture + community feedback loop |
| `FRIENDS_MASTER_PROMPT.md` | Friends Beta — 10 prioridades, cross-platform installer |
| `FRUGAL_OS_MASTER_PROMPT.md` | frugal v2.0 OS vision — GitHub OAuth, onboarding, hub-push |
| `AUDIT_MASTER_PROMPT.md` | Auditoria completa 7 blocos → AUDIT_REPORT.md |
| `LANDING_V10_MASTER_PROMPT.md` | Landing v10 — logo, Simple Icons, install journey, signup |
| `CLAUDE_AI_BROWSER_MASTER_PROMPT.md` | Tarefas browser: GitHub OAuth, Supabase RLS, Cloudflare, Vercel |
| `master-prompt-feedback-loop-v1.md` | Feedback loop v1 (supersedido por v2) |
| `master-prompt-feedback-loop-v2.md` | Sprint 1 feedback loop — event-builder, frugal_events, privacy contract |
| `master-prompt-sprint2-repo-cleanup.md` | Sprint 2 — feedback-collector, gold-labels, repo cleanup, ARCHITECTURE update |

## Notion HQ — Páginas de Referência

| Página | ID | URL |
|---|---|---|
| ⚡ frugal — Model Router HQ | `33d6f6e4-2bc4-816b-977a-fe84bbe912c9` | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |
| 🚀 Sessão tarde 2026-04-10 (Landing v10 + OS Vision) | `33e6f6e4-2bc4-8100-9c74-e1bb9551106a` | https://www.notion.so/33e6f6e42bc481009c74e1bb9551106a |
| 👥 Friends Beta — Onboarding & Tracking | `33e6f6e4-2bc4-8135-ae61-cccc625406d8` | https://www.notion.so/33e6f6e42bc48135ae61cccc625406d8 |
| 🌍 frugal v2.0 — Sistema Operativo do Vibe Coder | `33e6f6e4-2bc4-8128-9155-d79fbc14a6e5` | https://www.notion.so/33e6f6e42bc481289155d79fbc14a6e5 |
| 🧪 E2E MVP Validation — 2026-04-10 | `33e6f6e4-2bc4-81bc-8e01-ee0160b00928` | https://www.notion.so/33e6f6e42bc481bc8e01ee0160b00928 |
| 🔬 Sessão 2026-04-11 — frugal-doctor + install.sh v2 | `33e6f6e4-2bc4-817e-bd88-f17bbd39c597` | https://www.notion.so/33e6f6e42bc4817ebd88f17bbd39c597 |
| 🦙 Sessão 2026-04-11 — Model emoji + role label em cada Bash | `33f6f6e4-2bc4-816e-a1cf-d331893036b2` | https://www.notion.so/33f6f6e42bc4816ea1cfd331893036b2 |
| 🧠 Sessão 2026-04-11 — classify.js v0.10 (3 melhorias router) | `33f6f6e4-2bc4-81e4-8e0f-ddbd4b599359` | https://www.notion.so/33f6f6e42bc481e48e0fddbd4b599359 |
| 🔁 Sessão 2026-04-11 — Feedback loop + install hardening (P0→P4) | `33f6f6e4-2bc4-81ee-a03a-f973d3747461` | https://www.notion.so/33f6f6e42bc481eea03af973d3747461 |
| 📊 Evolução + Status atual — 2026-04-11 | `33f6f6e4-2bc4-81fe-a8e1-e065f53ee73b` | https://www.notion.so/33f6f6e42bc481fea8e1e065f53ee73b |
| 👁️ Sessão 2026-04-11 — Visibility stack + delegação real | `33f6f6e4-2bc4-8136-9255-d80e8780ed03` | https://www.notion.so/33f6f6e42bc481369255d80e8780ed03 |
| 📝 Sessão 2026-04-11 — Cowork: PRIVACY.md + README + ONBOARDING_DEV + Sprint 2 master prompt | `33f6f6e4-2bc4-8110-b415-e3ec18bad318` | https://www.notion.so/33f6f6e42bc48110b415e3ec18bad318 |
| 📊 Sessão 2026-04-11 — Sprint 4: Dashboard MVP + Option A fix | `3406f6e4-2bc4-81bf-8d92-c754d040c4d2` | https://www.notion.so/3406f6e42bc481bf8d92c754d040c4d2 |
| 🏗️ Sessão 2026-04-12 — MP-12/13/14: multi-device, admin dashboard, app shell redesign | `3406f6e4-2bc4-8179-aa58-c2f372bf6cfb` | https://www.notion.so/3406f6e42bc48179aa58c2f372bf6cfb |
| 🔗 Sessão 2026-04-12 — MP-15/16/17/18: audit, GPU, flowchart, metrics coherence | `3406f6e4-2bc4-81cf-a9be-e6737f9349d8` | https://www.notion.so/3406f6e42bc481cfa9bee6737f9349d8 |
| 🔧 Sessão 2026-04-13 — fix: qwen3 think mode breaking Option A (high-VRAM GPUs) | `3416f6e4-2bc4-81a8-af8a-d65ea11eef7e` | https://www.notion.so/3416f6e42bc481a8af8ad65ea11eef7e |
| 🔧 MP-19 — Backlog Windows: classifier fix + hub timeout + gold-labels + applyActiveMode | `3416f6e4-2bc4-8117-84dd-e9e088872a40` | https://www.notion.so/3416f6e42bc4811784dde9e088872a40 |
| 💰 MP-20 — Savings Transparency: mecânica clara em todas as superfícies + success-fee | `3416f6e4-2bc4-81a0-b3a0-d9710cbf8780` | https://www.notion.so/3416f6e42bc481a0b3a0d9710cbf8780 |
| 🧠 MP-21 — frugal Intelligence Platform v2: perfil exclusivo + rich terminal + qualidade + segurança | `3416f6e4-2bc4-811e-99e4-dc07919f8794` | https://www.notion.so/3416f6e42bc4811e99e4dc07919f8794 |
| 🔧 Sessão 2026-04-14 — Mooter rebrand Fase 1+2 + validação DNS | `3426f6e4-2bc4-816c-bdc3-dd2f50946018` | https://www.notion.so/3426f6e42bc4816cbdc3dd2f50946018 |
| 🔬 Sessão 2026-04-14 — Gemma 4 E2E validation + ollama_call.sh think-strip | `3426f6e4-2bc4-815e-8c22-d051c19411e4` | https://www.notion.so/3426f6e42bc4815e8c22d051c19411e4 |
| 🔁 Sessão 2026-04-15 — Feedback loop UX + Sprint B handoff | `3446f6e4-2bc4-8126-9744-cc7780b095fe` | https://www.notion.so/3446f6e42bc481269744cc7780b095fe |
| 🧪 Sessão 2026-04-16 — Mooter A/B Test (10 prompts) | `3446f6e4-2bc4-81cf-b172-d1e662c80727` | https://www.notion.so/3446f6e42bc481cfb172d1e662c80727 |

> **Protocolo Notion:** No final de cada sessão Claude Code, actualizar o HQ e criar uma página de log da sessão.
> ID do HQ para referência rápida: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

---

## Notas de contexto

- **frugal-mode.js** cria `.frugal-mode.json` em `~/.claude/tools/router/`. Beast força T3, Zen cap T1, Auto apaga o ficheiro.
- **Zen Mode excepção de segurança**: tarefas T3-gate (push/merge/deploy) nunca são afectadas pelo Zen Mode.
- **MODES_MASTER_PROMPT.md** contém o patch exacto para `inject_context.js` — função `applyActiveMode()` após `applyBudgetCap()`. **Ainda não aplicado no runtime** — Claude Code tem de implementar.
- **Landing v8** tem live counters que fazem fetch a `frugal-hub.frugal-hub.workers.dev/api/stats`. Quando o hub tiver dados reais, os contadores actualizam automaticamente sem code change.
- **Webhook Paulo**: o secret `PAULO_WEBHOOK_URL` está como placeholder. Quando Paulo tiver um webhook real (ex: webhook.site ou Zapier), deve correr: `echo "URL_REAL" | npx wrangler secret put PAULO_WEBHOOK_URL`
- O Task Scheduler Windows tem `FrugalRouterBacktest` às 02:00 diárias.
- Ollama corre localmente com `qwen3:30b` para tiers T0/T1.

---

## 📥 COWORK → CLAUDE CODE
### Instruções e decisões tomadas no Cowork para a próxima sessão
> Esta secção é escrita pelo Cowork. O Claude Code deve lê-la no início de cada sessão, antes de qualquer trabalho.
> Após lida e aplicada: escrever "✅ Lido em sessão #N — [data]" e limpar as instruções.

**Última actualização Cowork:** 2026-04-14 (sessão #mooter-rebrand-fase1-2-dns)
**Estado:** 🟡 Por ler — **MISSÃO 0 (mooter rebrand) tem novidades críticas; MISSÃO 3 continua em aberto**

---

### MISSÃO 0 (NOVA, 2026-04-14) — Mooter rebrand Fase 1+2 core CONCLUÍDA

**Commits feitos nesta sessão:**
- `0187b46` — Fase 1: Worker `mooter-hub` + D1 `mooter-hub` + R2 `mooter-hub-storage` criados; hub URLs hardcoded substituídos nos 11 ficheiros P0 (tools/router/, landing, dashboard)
- `9821a92` — Fase 2 core: runtime aceita `MOOTER_*` e `FRUGAL_*` env vars (fallback); state file migra auto `.frugal-mode.json` → `.mooter-mode.json`

**Infra actual:**
- Worker live: `mooter-hub.frugal-hub.workers.dev` (URL técnico, não user-facing)
- Worker `frugal-hub` mantido em paralelo durante deprecation window (≥30 dias)
- Tabela `mooter_events` criada via migration nova; `frugal_events` mantida
- `@mooter/cli@0.0.1` publicado em npm; scope `@mooter/*` reservado
- Domínio `mooter.ai` comprado via Vercel Registrar ($160, 2 anos, factura #2363-4787)

**DNS decision — ADIADO (importante):**
Tentámos CNAME `hub.mooter.ai → mooter-hub.frugal-hub.workers.dev` via Vercel DNS mas NÃO funciona com HTTPS (cert Workers é `*.workers.dev`, não cobre custom domain). Para `hub.mooter.ai` funcionar precisa:
1. Migrar zona DNS de Vercel para Cloudflare (mudar NS no Vercel Registrar, 1-4h propagação)
2. Usar Worker Custom Domain no Cloudflare

**Decisão do Paulo:** adiado para janela planeada (sem data). Hub fica em `mooter-hub.frugal-hub.workers.dev` até lá. CNAME errado já foi removido do Vercel DNS.

**Ver radar completo:** `/sessions/kind-nifty-albattani/mnt/.auto-memory/project_mooter_rebrand_radar.md` (actualizado 2026-04-14).

**Pendentes mooter (por ordem de prioridade):**
1. **[BLOQUEADO por DNS]** Fase 3 swap público — landing, logo, strings user-visible. Não faz sentido avançar até `hub.mooter.ai` existir.
2. **[MÉDIA]** Criar projecto Supabase `mooter` em sa-east-1 (Supabase não renomeia projectos via API, só recriar). Migrar tabelas/auth/storage do projecto `frugal` (eymtobwinevywmmlmxqa) quando houver janela.
3. **[MÉDIA]** Migração skills `frugal-*` → `mooter-*` em `~/.claude/skills/` (sessão dedicada; aliases backward-compat obrigatórios).
4. **[BAIXA]** Fase 4 cleanup P2 docs (~79 ficheiros .md) via find/replace com review. Só depois de 30 dias sem regressões em prod.
5. **[BAIXA]** Criar org GitHub `mooter-ai` e mover repo `pauloloureiroshp-ship-it/frugal` → `mooter-ai/mooter`.
6. **[BAIXA]** VSCode extension rename (package.json: name, displayName, publisher, command IDs, config keys) antes de publish.

**Guardrails (não violar):**
- NÃO usar find/replace cego por "frugal" — git history, `.frugal-mode.json` em máquinas de users existentes, e URL `frugal-hub.workers.dev` não podem ser renomeados.
- NÃO dropar tabela `frugal_events` sem migrar dados para `mooter_events` primeiro.
- NÃO deletar Worker `frugal-hub` até confirmar zero tráfego por ≥30 dias.
- Backward-compat obrigatório: env vars (`FRUGAL_HUB_URL` + `MOOTER_HUB_URL`), paths de estado, nomes de skills — aceitar ambos durante transição.

---

### MISSÃO 1 (5 min) — Contexto actualizado

Lê `INFRA.md` antes de qualquer trabalho — foi reescrito com todos os IDs reais de Vercel/Supabase/Cloudflare/Notion obtidos via MCP. Não precisas de navegar browsers para nada desta sessão.

IDs críticos:
- Vercel team: `team_q3kDk3fEFhlL6AcNryTzH3o2` | landing: `prj_2aZMQagzjYOtLyvofeWPnEA0mM1b`
- Supabase frugal: `eymtobwinevywmmlmxqa` | Cloudflare: `b1093c8a6e663afd02f98a1e87d0fa34`
- Confirmado: OAuth ✅, Supabase provider ✅, Vercel auto-deploy ✅ (git push = deploy)

---

### MISSÃO 3 (3-4 sessões × 1h) — STATUSLINE REDESIGN [PRIORIDADE ABSOLUTA]

**Abre e executa `STATUSLINE_REDESIGN_MASTER_PROMPT.md`** na raiz do repo.

**Bug crítico descoberto pelo Cowork (2026-04-13):** `tools/router/gsd-statusline.js` está **literalmente truncado** a meio da linha 712 (`tail -c 50` mostra `...'router', '.frugal-mod`). Funções `renderDistribution`, `renderSavingsHero`, `renderProviders`, `renderLatency`, `renderGpu` existem completas, mas a função `main` que as assembla foi cortada — nunca são chamadas. É por isto que:
- Tela pequena → quase vazia
- Tela grande → emojis sem labels
- Layout 2 linhas referenciado em comentários mas não implementado em produção
- VS Code statusbar e terminal mostram números diferentes sem labels de scope (sessão vs lifetime)

**O master prompt resolve em 7 fases por ordem:**
1. Reparar truncamento + completar `main()` (CRÍTICO)
2. Coerência semântica sessão↔lifetime↔VSCode (📍 vs 🌍 prefixes)
3. Responsive multi-linha (compact/standard/wide por COLUMNS)
4. Per-Ollama-model breakdown (qwen3 / qwen2.5 / gemma / deepseek com emojis próprios)
5. Source-of-truth tagging (exec verde / adv amarelo)
6. Falha graciosa (tracker offline → mensagem clara)
7. Documentação `docs/STATUSLINE.md` + bump v0.9.10

**Ficheiros-alvo:** `tools/router/gsd-statusline.js`, `hooks/PostToolUse.js` (espelhar `bucketFor`), VS Code extension statusbar (Fase 2).

**Ship em fases — cada fase tem gate próprio. Não avançar sem validar visualmente.**

---

### MISSÃO 2 (90-120 min) — Multi-Model Routing V2 [BLOQUEADA atrás de M3]

**Antes:** executar M3. Depois: abrir `MODEL_ROUTING_V2_MASTER_PROMPT.md`.

Razão: M3 reconstrói a UI que M2 precisa para mostrar o resultado dos novos modelos. Fazer M2 antes seria pintar paredes numa casa sem chão.

Alguns elementos de M2 já foram parcialmente feitos numa sessão anterior (gemma3 e deepseek-r1 instalados, `bestOllamaT0()`, statusline 2 linhas iniciada). Validar estado contra o master prompt antes de re-fazer.

---

### MISSÃO 4 (12-18h, 6 sub-sessões) — INTELLIGENCE V3 [PARQUEADA]

**Não executar agora.** O master prompt `INTELLIGENCE_V3_MASTER_PROMPT.md` está pronto e descreve a transição de cost router → specialist router (quality matrix empírica + feedback loop + vectorização + selector + retrain federado).

**Gate para arrancar:** M3 + M2 completas e em produção há ≥1 semana de dogfooding sem regressões.

---

### Pendente de sessão anterior (Alta prioridade)
`gpu-probe.js` e `ollama_call_node.js` com fix Option A estão em `~/.claude/` mas não no repo. O master prompt T2 pode incluir este fix (commitar versões correctas para o install.sh copiar). Verifica se ainda está por fazer antes de avançar.

---

### Pendentes do Paulo (não são tarefas de código)
1. Convidar 3 amigos Friends Beta → https://landing-five-azure-16.vercel.app (desbloqueia T3 product)
2. VSCode extension publish → .vsix gerado, aguarda Azure DevOps PAT

---

### ESTADO PÓS-SESSÃO #16 (Claude Code 2026-04-11) — Sprint 4: Dashboard MVP + Option A fix

**Commits pushed:** `92c3c19`, `bd9e67a`

**Sprint 4 — estado:**

| Task | Estado | Notas |
|---|---|---|
| B1 — Supabase RLS | ✅ | Já existia, validado com curl (201) |
| B2 — GitHub OAuth | ⏳ | Requer browser manual do Paulo |
| B3 — Testar landing form | ⏳ | Depende de B2 |
| D1-D2 — Dashboard setup + Overview | ✅ | Scaffold já avançado |
| D3 — Misroutes page | ✅ | Criado — low-confidence debugger |
| D4 — Tuning + Retrain | ✅ | Já existia no Overview |
| D5 — Community page | ✅ | Criado — hub stats vs local |
| D6 — Sidebar navigation | ✅ | Layout refeito |
| D7 — install.sh + skill | ✅ | /frugal-dashboard + 11 skills |
| C1 — ROADMAP.md | ✅ | v0.6.0 completo, v0.9.7 adicionado |
| C2 — Landing v11 | ✅ | Slash commands 6→11 |

**Bug crítico corrigido: Option A nunca disparava**
- `hw-capability.json` → `recommended_t0: qwen3:30b`
- `inject_context.js` → verificava hardcoded `qwen2.5:3b`
- Fix: check genérico `backend === 'ollama' && tier === 'T0'` + modelo via env var

**Pendentes para próxima sessão:**
1. **[ALTA]** Testar Option A em sessão n