# SYNC.md — frugal

> Canal bidirecional entre Cowork (Claude Desktop) e Claude Code CLI.
> **Última actualização:** 2026-04-10 — Cowork (sessão Cowork intensa — sessão #5)

---

## O que é o frugal

**Vibe Coder Intelligence Platform** — router inteligente de LLMs para Claude Code.

Classifica cada prompt em < 50 ms (regex puro, sem LLM) e emite um `<router-hint>` que direciona o modelo certo para o tier certo. Resultado: ~90% de poupança vs usar Opus em tudo.

**Repositório:** `C:\Users\Paulo Loureiro\frugal\` (alias CLI: `~/frugal/`)
**GitHub:** https://github.com/pauloloureiroshp-ship-it/frugal (privado, MIT)
**Hub live:** https://frugal-hub.frugal-hub.workers.dev

---

## Estado actual do projecto — 2026-04-10

### Versão: v0.9.2 (sessão Cowork de 2026-04-10)

| Componente | Estado | Notas |
|---|---|---|
| `classify.js` v3 | ✅ em prod | fast-paths, weighted scoring, SHA-256 cache |
| `inject_context.js` | ✅ v0.9.2 | onboarding auto (L3 fix), mode override (v0.9.3 pendente) |
| `patterns.js` | ✅ em prod | single source of truth (v0.7.0) |
| 6 subagents | ✅ em prod | model-architect, model-reasoner, cheap-triage, local-summarizer, local-transformer, final-reviewer |
| `backtest.js` | ✅ v0.9.2 | hub-push auto no --export-delta (L4 fix) |
| `savings-tracker.js` | ✅ em prod | HTTP :7821, statusline v3 |
| `gpu-probe.js` | ✅ em prod | NVIDIA/Apple/AMD/CPU fallback |
| `onboarding.js` | ✅ em prod | chamado automaticamente pelo inject_context.js |
| `hub-push.js` | ✅ URL corrigida | frugal-hub.frugal-hub.workers.dev |
| `hub-pull.js` | ✅ URL corrigida | frugal-hub.frugal-hub.workers.dev |
| `hub-status.js` | ✅ URL corrigida | frugal-hub.frugal-hub.workers.dev |
| `frugal-mode.js` | ✅ NOVO | Beast/Zen/Auto mode system |
| **frugal-hub** (Cloudflare) | ✅ LIVE | D1 + R2 + Worker deployed |
| **Landing v8** | ✅ build passing | live counters, Install Now CTA, slash commands grid |
| **Dashboard** | ⚠️ scaffold | npm install feito, build passing |
| VSCode extension | ⚠️ v0.4.0 | não publicado no marketplace |
| Skills (8 total) | ✅ NOVO | 5 originais + 3 modos (beast/zen/auto) |

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

### HEAD do repo (após sessão Cowork 2026-04-10)

```
aecb9cd  feat(hub): deploy frugal-hub to Cloudflare Workers  ← HEAD
ef22ebd  fix(landing): SSRF hardening + apostrophe cosmetic fix
b78cf4a  feat(v0.9.1): public landing page with URL analyser and waitlist
8af879f  refactor(v0.7.0): extract patterns.js
76dcd94  fix(dashboard): deduplicate decisions
fa2ee52  feat(v0.6.0): dashboard scaffold
e97e8a4  chore: .vscode + SYNC
5989b62  chore(v0.9.0): replay fix
1e852f3  feat: v0.9.0
tag v0.9.0
```

### Loopholes — Estado 2026-04-10

| ID | Descrição | Estado |
|---|---|---|
| L1 | Hub não estava deployed | ✅ FECHADO — live em frugal-hub.frugal-hub.workers.dev |
| L2 | install.sh não instalava onboarding/hub-push/hub-pull | ✅ FECHADO — glob *.js inclui, doctor check adicionado |
| L3 | inject_context.js não chamava onboarding automaticamente | ✅ FECHADO — fix aplicado pelo Claude Code |
| L4 | backtest.js não chamava hub-push automaticamente | ✅ FECHADO — fix aplicado pelo Claude Code |
| L5 | Dashboard não funcional | ⚠️ Scaffold validado, npm install feito |
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
| ⚠️ Pendente | RLS policy anon INSERT na tabela `waitlist` |

### Vercel — Landing

| Campo | Valor |
|---|---|
| Team | `pauloloureiroshp-ship-its-projects` |
| URL landing | `https://landing-five-azure-16.vercel.app/` |

---

## Master Prompts criados hoje (para Claude Code)

| Ficheiro | Conteúdo |
|---|---|
| `FIXES_MASTER_PROMPT.md` | L1 + L3 + L4 + 5 skills originais + install.sh |
| `MODES_MASTER_PROMPT.md` | Beast/Zen/Auto mode system — inject_context.js patch |
| `LANDING_MASTER_PROMPT_V8.md` | Landing v8 — live counters + Install Now + slash commands |
| `INTELLIGENCE_LOOP_MASTER_PROMPT.md` | frugal-hub architecture + community feedback loop |

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

**Última actualização Cowork:** 2026-04-10
**Estado:** 🟡 Por ler

---

### Prioridade 1 — Aplicar MODES_MASTER_PROMPT.md (Beast/Zen/Auto)

O ficheiro `~/frugal/MODES_MASTER_PROMPT.md` contém o patch exacto para implementar o sistema de modos. Os ficheiros `frugal-mode.js` e os 3 SKILL.md já existem no repo. Falta:

1. Aplicar o patch em `inject_context.js` (função `applyActiveMode()` após `applyBudgetCap()`)
2. Adicionar campo `MODE:` e `FORCED:` ao router-hint output
3. Instalar as 3 skills em `~/.claude/skills/` (frugal-beast, frugal-zen, frugal-auto)
4. Copiar `frugal-mode.js` para `~/.claude/tools/router/`
5. Actualizar `install.sh` com as novas skills e o `frugal-mode.js`
6. Actualizar a skill `frugal-update` para sincronizar os ficheiros de modos
7. Smoke test: `node ~/.claude/tools/router/frugal-mode.js beast` → `node inject_context.js` → verificar `MODE: beast` no hint

### Prioridade 2 — Actualizar webhook Paulo

Substituir o placeholder do secret PAULO_WEBHOOK_URL por um webhook real:

```powershell
echo "URL_REAL_DO_WEBHOOK" | npx wrangler secret put PAULO_WEBHOOK_URL
```

Sugestão: criar conta em webhook.site ou Zapier/Make para receber notificações do hub.

### Prioridade 3 — Fix RLS Supabase waitlist

No Supabase dashboard:
- Table Editor → waitlist → Policies → New policy
- Name: "Allow anon INSERT"
- Operation: INSERT / Target: anon / WITH CHECK: `true`

Sem isto, o botão "Get early access" da landing falha silenciosamente.

### Prioridade 4 — Tornar repo GitHub público (quando pronto)

O repo está privado. Antes de tornar público:
- Verificar que não há chaves de API no histórico git
- Adicionar `.env.example` com placeholders
- Confirmar que `SECURITY.md` está actualizado

---

## 📤 CLAUDE CODE → COWORK
### Relatório do que foi feito (para o Cowork ler)
> Esta secção é escrita pelo Claude Code. O Cowork lê-a no início de cada sessão de review.

**Última actualização:** 2026-04-11 (sessão overnight autónoma)

### Sessão Overnight 2026-04-10 → 2026-04-11 — relatório

**Início:** ~04:55 UTC (2026-04-10)
**Fim:** ~05:15 UTC (2026-04-10)
**Commits feitos:** 4

#### Commits
- `b28b307` — feat(v0.9.3): Beast/Zen/Auto mode system
- `09ff285` — chore(evolution): snapshot v0.9.2
- `3181299` — perf(classifier): add 5 patterns from dogfood telemetry
- `1a3bf14` — docs: update ARCHITECTURE + ROADMAP for v0.9.3

#### P1 — Beast/Zen/Auto Modes
- applyActiveMode() aplicado em inject_context.js (runtime + source) — ja estava no source
- frugal-mode.js instalado em ~/.claude/tools/router/
- 3 skills de modos instaladas e verificadas
- Smoke test: beast→T3 OK, zen→T1 OK, auto→clear OK, ficheiro ausente PASS
- install.sh ja cobria tudo (wildcard *.js + skill loop com 8 skills)

#### P2 — Dogfood com telemetria
- decisions.log activo com 263 entradas
- 10 prompts classificados: 7 correctos, 3 misroutings identificados
- Backtest: 263 prompts, savings 58.1% ($4.96 vs $11.84 naive T3)
- Tier distribution: T0=40.3% T1=0% T2=21.7% T3=38.0%

#### P3 — Snapshot de evolucao
- .evolution/v0.9.2-snapshot.json criado com SHA-256 hashes
- .evolution/README.md criado
- git tag algo-v0.9.2 criada (nao pushed)

#### P4 — Auditoria MDs
- ROADMAP.md: adicionados v0.9.2 e v0.9.3 como released, v0.7.0 marcado done, hub movido de vision para shipped
- ARCHITECTURE.md: adicionados frugal-mode.js, hub scripts, skills ao module map
- frugal-status URL corrigida para frugal-hub.frugal-hub.workers.dev

#### P5 — Skills audit
- 8/8 skills instaladas e sincronizadas
- frugal-update: adicionado patterns.js, frugal-mode.js, e skill loop ao sync step
- frugal-status: URL hub corrigida

#### P6 — Melhorias ao classifier
- 3 misroutings corrigidos:
  - "redesenha o sistema de auth para multi-tenant" T0→T3 (added redesenha/redesign + multi-tenant to HIGH_RISK)
  - "cria um endpoint REST para user profile" T0→T2 (added cria endpoint to MED_RISK)
  - "optimiza a query SQL do dashboard" T0→T2 (added optimiza/optimize to MED_RISK)
- 5 patterns adicionados a patterns.js com evidencia de misrouting

#### Telemetria frugal (dogfood)
- Prompts classificados: 10 (sinteticos) + 263 (historico)
- Tier distribution: T0=40.3% T1=0% T2=21.7% T3=38.0%
- Savings: 58.1% (backtest) — nota: savings reais sao maiores porque o backtest conta custo naive T3
- Misroutings identificados: 3 (todos corrigidos)
- Padroes adicionados: 5

#### Tiers usados por prioridade
- P1 (modes): T0-inline (edits + bash, < 10 tool calls)
- P2 (dogfood): T0-inline (bash commands)
- P3 (snapshot): T0-inline (file writes + bash)
- P4 (docs): T0-inline (reads + edits)
- P5 (skills): T0-inline (reads + copies)
- P6 (classifier): T2-equivalent (pattern analysis + edits + verification)

#### Para o Paulo fazer manualmente
- [ ] `git push` (nao foi feito — requer aprovacao)
- [ ] `git push --tags` (tag algo-v0.9.2)
- [ ] Configurar PAULO_WEBHOOK_URL real no Cloudflare
- [ ] Fix RLS Supabase waitlist
- [ ] Hub delta push quando hub estiver acessivel

---

### Sessao Cowork 2026-04-10 — O que foi feito

Esta foi uma sessão longa e intensa no Cowork. Resumo do que foi produzido:

#### Documentos criados

| Ficheiro | Descrição |
|---|---|
| `INTELLIGENCE_LOOP_MASTER_PROMPT.md` | Arquitectura completa do community feedback loop v1.1 |
| `FIXES_MASTER_PROMPT.md` | Master prompt L1+L3+L4 + 5 skills + install.sh |
| `MODES_MASTER_PROMPT.md` | Beast/Zen/Auto mode system completo |
| `LANDING_MASTER_PROMPT_V8.md` | Landing v8 com live counters + CTA + slash commands |
| `tools/router/frugal-mode.js` | CLI para set/get/clear modo activo |
| `skills/frugal-beast/SKILL.md` | Skill `/frugal-beast` |
| `skills/frugal-zen/SKILL.md` | Skill `/frugal-zen` |
| `skills/frugal-auto/SKILL.md` | Skill `/frugal-auto` |

#### Deploy frugal-hub (L1 fechado)

- D1 criado: `frugal-hub` (320b55f6-9444-4deb-bcd5-e8227739546e)
- R2 activado e bucket criado: `frugal-hub-storage`
- Migrations aplicadas remotamente: 9 queries, 17 rows
- Secrets configurados: PAULO_WEBHOOK_URL, PAULO_EMAIL
- R2 base objects uploaded: router-tuning-latest.json, model-catalog-latest.json
- Worker deployed: `https://frugal-hub.frugal-hub.workers.dev`
- Smoke test: `/health` ✅, `/api/stats` ✅, `POST /api/delta` → trust_score: 0.8 ✅

#### URLs actualizadas

`hub-pull.js`, `hub-push.js`, `hub-status.js`, `landing/app/page.tsx` — todos actualizados para `frugal-hub.frugal-hub.workers.dev`

#### Commit

`aecb9cd` — feat(hub): deploy frugal-hub to Cloudflare Workers

#### Notion HQ — páginas criadas

| Página | URL |
|---|---|
| 🗺️ System Architecture Deep Dive | https://www.notion.so/33e6f6e42bc481618221fd034f2e1dd5 |
| 🚀 frugal v0.9.2 — Fixes + Skills | https://www.notion.so/33e6f6e42bc48108a0cce71c35ceb78 |
| 🌍 Landing v8 | https://www.notion.so/33e6f6e42bc481838948c759d612bd9f |
| 🦁🧘 Beast/Zen/Auto Modes | https://www.notion.so/33e6f6e42bc4818489bfdacd426c847d |

#### Pendente (para Claude Code)

1. `MODES_MASTER_PROMPT.md` — aplicar patch em `inject_context.js`
2. Webhook Paulo — substituir placeholder
3. RLS Supabase waitlist — fix policy
4. GitHub repo — tornar público quando pronto

---

### Sessão #4 — relatório ✅

4 commits pushed. Landing page v0.9.1 criada e validada. SSRF hardening aplicado. Ver sessão #4 completa acima no histórico.

---

### Sessão #3 — relatório ✅

patterns.js extraído (v0.7.0). Dashboard deduplicate fix (sessão #2). Landing deferida.

---

### Sessão #2 — relatório ✅

Commit `76dcd94`. Dashboard deduplication fix. 59/59 testes.

---

### Sessão #1 — relatório ✅

Commits `e97e8a4` + `fa2ee52`. .vscode/ + SYNC.md + dashboard scaffold.
