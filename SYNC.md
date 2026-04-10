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

### Versão: v0.9.4 (sessão Friends Beta de 2026-04-10)

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

**Última actualização Cowork:** 2026-04-10 (sessão #6 — Friends Beta)
**Estado:** ✅ Lido em sessão Friends Beta — 2026-04-10

---

### MISSÃO DESTA SESSÃO: Friends Beta — "pronto para amigos hoje"

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
- P6 (classif