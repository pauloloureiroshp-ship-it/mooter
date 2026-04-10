# SYNC.md — frugal

> Canal bidirecional entre Cowork (Claude Desktop) e Claude Code CLI.
> **Última actualização:** 2026-04-10 — Cowork (sessão #8 — Landing v10 + frugal OS Vision)

---

## O que é o frugal

**Vibe Coder Intelligence Platform** — router inteligente de LLMs para Claude Code.

Classifica cada prompt em < 50 ms (regex puro, sem LLM) e emite um `<router-hint>` que direciona o modelo certo para o tier certo. Resultado: ~90% de poupança vs usar Opus em tudo.

**Repositório:** `C:\Users\Paulo Loureiro\frugal\` (alias CLI: `~/frugal/`)
**GitHub:** https://github.com/pauloloureiroshp-ship-it/frugal (privado, MIT)
**Hub live:** https://frugal-hub.frugal-hub.workers.dev

---

## Estado actual do projecto — 2026-04-10

### Versão: v0.9.4 (Friends Beta — Landing deployed 2026-04-10)

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
| **Landing v9** | ✅ DEPLOYED | live counters, Install Now CTA, slash commands grid, ComparisonSection |
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

### HEAD do repo (após deploy landing 2026-04-10)

```
928f6f3  security(repo): enforce private repo — update onboarding docs  ← HEAD
8205b10  docs(friends): onboarding kit + frugal-hello skill + v0.9.4 snapshot
7bcfa3f  feat(friends): cross-platform installer, privacy audit, smoke tests
bd9c7e9  fix(windows): paths.js cross-platform helper + quoted paths
bb12e7a  feat(testing): adversarial prompt generator + 3 more patterns
6e477fa  perf(classifier): mega test — 37 new patterns, 170 prompts, 100% adjusted
3cc3052  chore(v0.9.3): CHANGELOG updated, gitignore cleaned, final evolution snapshot
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

## Notion HQ — Páginas de Referência

| Página | ID | URL |
|---|---|---|
| ⚡ frugal — Model Router HQ | `33d6f6e4-2bc4-816b-977a-fe84bbe912c9` | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |
| 🚀 Sessão tarde 2026-04-10 (Landing v10 + OS Vision) | `33e6f6e4-2bc4-8100-9c74-e1bb9551106a` | https://www.notion.so/33e6f6e42bc481009c74e1bb9551106a |
| 👥 Friends Beta — Onboarding & Tracking | `33e6f6e4-2bc4-8135-ae61-cccc625406d8` | https://www.notion.so/33e6f6e42bc48135ae61cccc625406d8 |
| 🌍 frugal v2.0 — Sistema Operativo do Vibe Coder | `33e6f6e4-2bc4-8128-9155-d79fbc14a6e5` | https://www.notion.so/33e6f6e42bc481289155d79fbc14a6e5 |

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

**Última actualização Cowork:** 2026-04-10 (sessão #8 — Landing v10 + frugal OS Vision)
**Estado:** 🆕 Para ler na próxima sessão Claude Code

---

### MISSÃO PRÓXIMA SESSÃO CLAUDE CODE: Auditoria + Browser tasks

**Prioridade 1 — AUDIT_MASTER_PROMPT.md**
Correr auditoria completa → gerar AUDIT_REPORT.md → responder: "pronto para amigos: sim/não/com condições"

**Prioridade 2 — FRUGAL_OS_MASTER_PROMPT.md (P2-P7)**
P2: GitHub OAuth code já está em `lib/supabase.ts` — falta Claude AI activar no GitHub + Supabase dashboard
P3: Onboarding wizard 4 steps em `/app/onboarding/page.tsx`
P4: Live savings banner no hero
P5: hub-push.js + frugal-link.js
P6: .gitignore protecção frugal-core/
P7: Deploy + SYNC.md update

**Prioridade 3 — CLAUDE_AI_BROWSER_MASTER_PROMPT.md**
Estas tarefas requerem browser (GitHub OAuth UI, Supabase dashboard, Cloudflare Worker settings, Vercel env vars):
- T1: github.com/settings/applications/new → criar OAuth App "frugal"
- T2: Supabase SQL Editor → RLS policy anon INSERT na waitlist
- T3: Verificar tabelas profiles + usage_sessions
- T4: Cloudflare → PAULO_WEBHOOK_URL (webhook.site ou Discord)
- T5: Vercel → NEXT_PUBLIC_SUPABASE_ANON_KEY + NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SITE_URL

**Protocolo Notion (obrigatório no fim de cada sessão):**
1. Criar página de log em Notion sob o HQ (ID: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`)
2. Actualizar secção "Sessão" do HQ com o que foi feito
3. Actualizar este SYNC.md com os IDs das páginas criadas

---

### [ARQUIVADO] MISSÃO ANTERIOR: Friends Beta — "pronto para amigos hoje"

O Paulo quer partilhar o frugal com 3-10 amigos (Mac e Windows) ainda hoje.
O master prompt completo está em `~/frugal/FRIENDS_MASTER_PROMPT.md` — lê-o inteiro antes de começar.

**Resumo das 10 prioridades (detalhes no FRIENDS_MASTER_PROMPT.md):**

| P | O que fazer | Bloqueia amigos? | Requer aprovação Paulo? |
|---|---|---|---|
| **P1** | Fix Windows paths com espaços (crons partidos) | Sim | Não |
| **P2** | One-line installer Mac + Windows (curl/irm) | Sim | Sim (Gist ou repo público) |
| **P3** | Auditoria privacidade hub-push + PRIVACY.md | Sim (confiança) | Não |
| **P4** | frugal-hello skill + frugal-status friendly | Alto impacto | Não |
| **P5** | Auditoria secrets + repo pronto para ser público | Sim | Sim (tornar público) |
| **P6** | ONBOARDING_GUIDE.md + FRIEND_KIT.md | Sim | Não |
| **P7** | Fluxo hub-push end-to-end para multi-user | Médio | Não |
| **P8** | smoke-test.js + graceful degradation | Alto (confiança) | Não |
| **P9** | Fix Windows health checks (paths sem aspas) | Urgente | Não |
| **P10** | SYNC.md, Notion Friends Beta, snapshot, push | Sempre | Sim (push) |

### Contexto crítico que o master prompt explica:
- O maior problema Windows: `C:/Users/Paulo Loureiro/` com espaço parte todos os bash commands
- Privacy contract: hub-push envia APENAS tier+confidence+prompt_len+hw_tier. NADA de conteúdo.
- Instalar a partir de URL só funciona se repo for público OU via GitHub Gist/Release
- A experiência "WOW" é: amigo instala → faz 1 prompt → corre /frugal-status → vê que foi grátis

### Decisões que o Paulo tomou nesta sessão Cowork:
- Zero cobrança para amigos (free para sempre para beta testers)
- Dados de amigos são bem-vindos e esperados (é o ponto)
- Privacidade é inegociável: prompts nunca saem da máquina
- O Paulo quer controlar quando o repo fica público (aguardar aprovação)

### Ficheiros criados nesta sessão Cowork (2026-04-10):
- `FRIENDS_MASTER_PROMPT.md` — master prompt completo para esta sessão
- `frugal-investor-deck-v2.pptx` — deck v2 (20 slides, full dark theme)
- `landing/app/page.tsx` — UPDATED sessão #6 + sessão #7:
  - S9 ComparisonSection (10-row comparison, real model prices, 6 value prop cards, vibe coding callout)
  - S5 DemoSection rebuilt: 3 universal vibe coder prompts (button colour T0, mobile crash T2, payment system T3)
  - S5b FlywheelSection NOVO: flywheel 5-step visual, privacy proof (what IS sent vs NEVER sent), freedom banner "83.9% of your prompts cost nothing"
  - TypeScript check: ✅ 0 errors
  - **Aguarda deploy: `cd landing && vercel --prod` (fazer no terminal do Paulo)**
- `landing/app/globals.css` — UPDATED: CSS para ComparisonSection + DemoSection + FlywheelSection

---

## 📤 CLAUDE CODE → COWORK
### Relatório do que foi feito (para o Cowork ler)
> Esta secção é escrita pelo Claude Code. O Cowork lê-a no início de cada sessão de review.

**Última actualização:** 2026-04-10 (sessão Friends Beta)

### Sessão Friends Beta — 2026-04-10

**Missão:** Preparar frugal para partilha com 3-10 amigos (Mac + Windows)

#### Ficheiros criados/modificados
- `tools/router/paths.js` — NEW: cross-platform path resolver
- `tools/router/smoke-test.js` — NEW: post-install verification (4/4 pass, avg 51ms)
- `tools/router/.env.example` — NEW: placeholder env vars
- `tools/router/run-backtest.cmd` — FIXED: relative paths via %~dp0
- `tools/router/hub-push.js` — ADDED: --dry-run support
- `install.sh` — IMPROVED: banner, smoke test step, frugal-hello, friendly output
- `install-windows.ps1` — NEW: native PowerShell installer (Doctor/Uninstall/DryRun)
- `skills/frugal-hello/SKILL.md` — NEW: first-use WOW moment skill
- `skills/frugal-status/SKILL.md` — IMPROVED: friendly output format
- `PRIVACY.md` — NEW: transparent telemetry documentation
- `ONBOARDING_GUIDE.md` — NEW: friend-facing install guide
- `FRIEND_KIT.md` — NEW: copy-paste message for WhatsApp/email
- `.gitignore` — ADDED: backtest-delta.json, backtest-latest.log, classify.js.bak*
- `.evolution/v0.9.4-friends-beta.json` — NEW: evolution snapshot

#### Prioridades — Estado

| P | Título | Estado |
|---|--------|--------|
| P1 | Fix Windows paths + paths.js | ✅ Feito |
| P2 | install-windows.ps1 + install.sh | ✅ Feito |
| P3 | PRIVACY.md + audit hub-push | ✅ Feito |
| P4 | frugal-hello + frugal-status friendly | ✅ Feito |
| P5 | Security audit (.gitignore, .env.example) | ✅ Feito |
| P6 | ONBOARDING_GUIDE.md + FRIEND_KIT.md | ✅ Feito |
| P7 | hub-push --dry-run | ✅ Feito |
| P8 | smoke-test.js + graceful degradation | ✅ Feito (4/4 pass) |
| P9 | Windows health checks (run-backtest.cmd) | ✅ Feito |
| P10 | SYNC.md + snapshot + report | ✅ Feito |

#### Requer aprovação do Paulo
1. [ ] Tornar o repo público? (audit de secrets feito, .gitignore actualizado)
2. [ ] Push e tag v0.9.4?
3. [ ] Personalizar kit para algum amigo específico?

#### Notas
- O classifier é agressivo no T0 (commit messages → T0 em vez de T1). Isto é uma optimização, não um bug.
- O install one-liner via curl/irm requer repo público ou Gist. Por agora, `git clone` funciona.
- Dashboard (P7) continua em scaffold — dados reais do hub existem, mas falta UI multi-user.
- Smoke test: 4/4 passed, avg 51ms.

---

### Sessão Overnight 2026-04-10 → 2026-04-11 — relatório

**Início:** ~04:55 UTC (2026-04-10)
**Fim:** ~05:15 UTC (2026-04-10)
**Commits feitos:** 4

#### Commits
- `b28b307` — feat(v0.9.3): Beast/Zen/Auto mode s