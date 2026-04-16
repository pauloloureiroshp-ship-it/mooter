# SYNC.md — frugal/mooter

> Canal bidirecional entre Cowork (Claude Desktop) e Claude Code CLI.
> **Última actualização:** 2026-04-16 — Claude Code (organização de ficheiros)

---

## O que é o frugal

**Vibe Coder Intelligence Platform** — router inteligente de LLMs para Claude Code.

Classifica cada prompt em < 50 ms (regex puro, sem LLM) e emite um `<router-hint>` que direciona o modelo certo para o tier certo. Resultado: ~90% de poupança vs usar Opus em tudo.

**Repositório:** `C:\Users\Paulo Loureiro\frugal\` (alias CLI: `~/frugal/`)
**GitHub:** https://github.com/pauloloureiroshp-ship-it/frugal (privado, MIT)
**Hub live:** https://frugal-hub.frugal-hub.workers.dev
**Domínio:** mooter.ai (comprado, DNS pendente migração para Cloudflare)

---

## Estado actual — 2026-04-16

### Versão: v0.9.9

| Métrica | Valor |
|---|---|
| Classifier accuracy (validation-set) | **88.3%** GATE PASS (60 prompts, era 75%) |
| Classifier accuracy (canonical) | **100%** (15 prompts, era 10) |
| Classifier accuracy (adversarial) | **96%** (25 prompts, era 80%) |
| Gold labels | 89 (era 84, +5 do review #1) |
| Savings validados | 89.9% (1,437+ prompts reais) |
| Patterns | 114+ (era 102, +12 MED_RISK, +2 LOW_RISK) |
| Tuned patterns (auto) | 48 promote-to-T0 + 3 demote-from-T3 (backtest 5019 prompts) |
| Módulos tools/router/ | 66 JS files |
| Skills | 15 (11 frugal-* + 3 mooter-* + model-router) |
| Sprint B | ✅ Completo (shadow mode, closed loop, signals, ground-truth) |
| Tester (24/7) | 2511 classifications, 297 misroutings, 553 executions, 6 modelos |
| Delta review model | ✅ Review #1 aplicado — 4 context-aware overrides commitados |
| Optimizer win rate | 47.4% (era 16.7%, +30.7pp) — tropicalization comprovada |
| A/B tests | 120+ testes, gemma3:12b surpreende (domina deepseek-r1 e qwen3:30b) |
| Evolution tracking | .evolution/2026-04-16.json — snapshot completo com métricas |

### Review #1 — Aplicado (sessão 2026-04-16, commit `4b6e454`)

4 context-aware overrides no classify.js (fast-paths ANTES do HIGH_RISK):
- **Regex tasks** → T1 mesmo com keywords de arquitectura (CQRS, hexagonal, etc.)
- **Explain difference** → T1 para explicações curtas (REST vs GraphQL)
- **Package.json read** → T0 quando read-only intent (show/read/lê)
- **Translate** → T0 independente do conteúdo a traduzir

Também: `setCache()` agora retorna resultado, 48 auto-tuned promote patterns, 5 gold labels.

### Loopholes abertos

| ID | Descrição |
|---|---|
| L7 | VSCode extension não publicada (aguarda Azure DevOps PAT) |
| L8 | Time-based routing não implementado |
| L9 | 5 drift items T1→T0: degradação sem ANTHROPIC_API_KEY (infra, não classifier) |
| L10 | mooter-review ainda não consulta contexto completo do projecto (ver visão self-healing) |

### 🖥️ Multi-device setup — MacBook via Claude AI Dispatch

O projecto está pronto para trabalhar em qualquer device:

1. **Repo no GitHub** — `git pull origin main` traz tudo (commit `4b6e454`)
2. **Runtime files** — os ficheiros em `tools/router/` são o source of truth; copiar para `~/.claude/tools/router/` no MacBook
3. **Ficheiros runtime-only** (NÃO no repo, gerar localmente):
   - `mooter-review-state.json` — watermark do review (gera-se no primeiro `--report`)
   - `decisions.log` — log de decisões (acumula localmente)
   - `.classify-cache.json` — cache efémero
   - `hw-capability.json` — detectado automaticamente pelo hardware probe
4. **Ollama** — instalar modelos: `qwen2.5:3b`, `qwen3:30b`, `gemma4:e4b`, `qwen2.5-coder:14b`
5. **ANTHROPIC_API_KEY** — definir no ambiente se quiser Haiku directo (sem key, degrada para Ollama)

**No Claude AI (Dispatch/Cowork):**
- Ler `SYNC.md` no início de cada sessão
- Usar MCPs (Notion, Vercel, Supabase, Cloudflare) para operações
- Não precisa de Ollama — as classificações correm no classify.js (regex puro)
- Pode fazer edits no repo via GitHub MCP ou localmente

---

## 📥 COWORK → CLAUDE CODE — Missão activa

> Escrita pelo Cowork. Claude Code lê no início de cada sessão.
> ID do HQ Notion: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

**Última actualização Cowork:** 2026-04-14

### Mooter rebrand — estado

- **Fase 1+2:** ✅ Concluídas (runtime aceita MOOTER_* + FRUGAL_*, state file migra auto)
- **Fase 3:** ⏳ Bloqueada por DNS (hub.mooter.ai precisa NS migrados para Cloudflare)
- **Guardrails:** não find/replace cego "frugal", não dropar frugal_events, não deletar Worker frugal-hub sem 30d zero tráfego

### Missões por ordem de prioridade

1. **Statusline redesign** — master prompt em `docs/MASTER_PROMPTS/STATUSLINE_REDESIGN_MASTER_PROMPT.md`
2. **Multi-Model Routing V2** — bloqueada atrás de #1. Master prompt em `docs/MASTER_PROMPTS/MODEL_ROUTING_V2_MASTER_PROMPT.md`
3. **Intelligence V3** — parqueada. Gate: #1 + #2 em prod ≥1 semana. Master prompt em `docs/MASTER_PROMPTS/INTELLIGENCE_V3_MASTER_PROMPT.md`

### Sprint B.4+ (próximos passos técnicos)

- **Self-healing mooter-review** — redesenhar para consultar contexto completo (decisions.log, tools, skills, MDs, gold-labels, trends) e gerar backlogs priorizados com retroalimentação automática. Ciclo virtuoso: tester→review→backlog→fix→tester.
- Thompson Sampling bandit (zona confidence 0.5–0.75)
- Semantic layer L1.5 (centróides por categoria, nomic-embed-text)
- A/B test via `docs/MASTER_PROMPTS/MOOTER_AB_TEST.md`
- Acumular ≥100 shadow pairs para validar loop

### Pendentes do Paulo (não são tarefas de código)

1. Convidar 3 amigos Friends Beta → https://landing-five-azure-16.vercel.app
2. VSCode extension publish → .vsix gerado, aguarda Azure DevOps PAT

---

## Referência rápida

| Preciso de... | Ficheiro |
|---|---|
| IDs de serviços (Vercel, Supabase, Cloudflare, Notion) | `INFRA.md` |
| Arquitectura técnica pública | `ARCHITECTURE.md` |
| Arquitectura privada (motor proprietário) | `ARCHITECTURE_PRIVATE.md` |
| Arquitectura completa (48KB, 25 secções) | `docs/MASTER_ARCHITECTURE.md` |
| Roadmap de features | `ROADMAP.md` |
| Como o router funciona | `docs/HOW_IT_WORKS.md` |
| Master prompts para sessões | `docs/MASTER_PROMPTS/` |
| Reports e logs de sessões | `docs/reports/` |
| Visualizações HTML interactivas | `docs/viz/` |
| Histórico completo de sessões | `docs/CHANGELOG_SESSIONS.md` |
| Metodologia de savings | `docs/METHODOLOGY.md` |

## Notion HQ — Páginas de Referência

| Página | ID |
|---|---|
| ⚡ frugal — Model Router HQ | `33d6f6e4-2bc4-816b-977a-fe84bbe912c9` |
| 👥 Friends Beta — Onboarding & Tracking | `33e6f6e4-2bc4-8135-ae61-cccc625406d8` |
| 🌍 frugal v2.0 — OS Vision | `33e6f6e4-2bc4-8128-9155-d79fbc14a6e5` |
| 📊 Evolução + Status | `33f6f6e4-2bc4-81fe-a8e1-e065f53ee73b` |
| 🔧 Sessão 2026-04-16 — Classifier 75%→80% | `3446f6e4-2bc4-8186-8164-c3c654755a81` |
| 🔬 Sessão 2026-04-16 — Review #1 + Multi-device Setup | `3446f6e4-2bc4-819e-b313-fa21cf15765d` |

> Lista completa de 25+ sessões Notion em `docs/CHANGELOG_SESSIONS.md` secção "Notion HQ — Páginas de Referência".

---

> **Protocolo Notion:** No final de cada sessão Claude Code, criar página de log no HQ e actualizar esta secção.
