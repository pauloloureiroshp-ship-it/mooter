# INFRA.md — frugal Infrastructure Reference
# Última actualização: 2026-04-10
# ⚠️ NUNCA commitar passwords reais aqui. Usar placeholders e referências a secrets managers.

> Ficheiro de referência operacional. Consultado por Claude Code no início de cada sessão
> e sempre que for necessário saber "onde está X" ou "qual é o comando para Y".
> Actualizar sempre que mudar qualquer endpoint, credencial ou estrutura.

---

## REPOSITÓRIOS

| Nome | Localização | Visibilidade | Propósito |
|---|---|---|---|
| `frugal` | `C:\Users\Paulo Loureiro\frugal\` | Privado (MIT) | Repo principal — classifier, runtime, landing |
| `frugal` GitHub | https://github.com/pauloloureiroshp-ship-it/frugal | Privado | Remote principal |
| `frugal-core` | `C:\Users\Paulo Loureiro\frugal\frugal-core\` | Privado (nunca público) | Dataset anonimizado + model proprietary |
| Runtime mirror | `~/.claude/tools/router/` | Local | Cópia operacional instalada pelo install.sh |

### Comandos rápidos de repo

```bash
# Abrir sessão Claude Code no projecto
cd "C:\Users\Paulo Loureiro\frugal" && claude

# Ver estado do repo
git status --short && git log --oneline -5

# Push standard
git push origin main

# Tag nova versão
git tag -a v0.9.X -m "v0.9.X — descrição" && git push origin v0.9.X
```

---

## FRONTEND — Landing Page

| Campo | Valor |
|---|---|
| Framework | Next.js 15 (App Router) |
| Directório | `C:\Users\Paulo Loureiro\frugal\landing\` |
| URL produção | https://landing-five-azure-16.vercel.app |
| Ficheiro principal | `landing/app/page.tsx` (componente único, ~1800 linhas) |
| Estilos globais | `landing/app/globals.css` |
| API routes | `landing/app/api/waitlist/route.ts`, `landing/app/api/waitlist/route.ts` |
| Tema | Dark (#080808 background, #00ff88 accent) |
| Deployed via | Vercel CLI (`vercel --prod`) — correr no terminal local, não no sandbox |

### Secções da landing (ordem de render)

| ID | Componente | O que faz |
|---|---|---|
| `#hero` | HeroSection | Headline + live counters + install CTA |
| `#demo` | DemoSection | 3 prompts universais com routing animado |
| `#flywheel` | FlywheelSection | 5-step flywheel + privacy proof + freedom banner |
| `#how` | HowItWorksSection | Diagrama técnico 3 layers |
| `#comparison` | ComparisonSection | Tabela frugal vs concorrentes |
| `#pricing` | PricingSection | Free / Pro / Team |
| `#access` | AccessSection | Form de waitlist (email → Supabase) |

### Deploy da landing

```bash
# No terminal do Paulo (não funciona no sandbox Linux)
cd "C:\Users\Paulo Loureiro\frugal\landing"
vercel --prod

# Verificar TypeScript antes
npx tsc --noEmit
```

### Env vars da landing (Vercel dashboard)

| Variável | Valor | Onde gerir |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://eymtobwinevywmmlmxqa.supabase.co` | Vercel → Settings → Environment Variables |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `[ver Supabase → Settings → API]` | Vercel → Settings → Environment Variables |
| `NEXT_PUBLIC_SITE_URL` | `https://landing-five-azure-16.vercel.app` | Vercel → Settings → Environment Variables |

---

## BACKEND — frugal-hub (Cloudflare Worker)

| Campo | Valor |
|---|---|
| Worker name | `frugal-hub` |
| URL | https://frugal-hub.frugal-hub.workers.dev |
| Account ID | `b1093c8a6e663afd02f98a1e87d0fa34` |
| Account email | paulo.loureiro.shp@gmail.com |
| Dashboard | https://dash.cloudflare.com → Workers → frugal-hub |
| Código fonte | `C:\Users\Paulo Loureiro\frugal\hub\` |

### Recursos Cloudflare

| Recurso | Tipo | ID / Nome | Propósito |
|---|---|---|---|
| D1 database | SQLite serverless | `320b55f6-9444-4deb-bcd5-e8227739546e` | Routing deltas da comunidade |
| R2 bucket | Object storage | `frugal-hub-storage` | router-tuning-latest.json, model-catalog |
| KV namespace | Key-value | (ver wrangler.toml) | Cache temporária |

### Secrets do Worker (configurar via dashboard ou wrangler)

| Secret | Estado | Como configurar |
|---|---|---|
| `PAULO_WEBHOOK_URL` | ⚠️ Placeholder | `echo "URL_REAL" \| npx wrangler secret put PAULO_WEBHOOK_URL` |
| `PAULO_EMAIL` | Definido | `paulo.loureiro.shp@gmail.com` |
| `FRUGAL_SUBMIT_TOKEN` | ✅ Configurado (2026-04-11) | Valor guardado no password manager do Paulo — corre `npx wrangler secret list` para confirmar |

### GitHub Actions Secrets (repo frugal)

| Secret | Estado | Propósito |
|---|---|---|
| `CF_API_TOKEN` | ✅ Configurado (2026-04-11) | Auto-deploy do Worker quando hub/ muda — template "Edit Cloudflare Workers" |

### Endpoints do hub

| Endpoint | Método | O que faz | Teste |
|---|---|---|---|
| `/health` | GET | Health check | `curl https://frugal-hub.frugal-hub.workers.dev/health` |
| `/api/stats` | GET | Agregados (últimos 7 dias) | `curl .../api/stats` |
| `/api/delta` | POST | Recebe routing delta anónimo | `curl -X POST .../api/delta -d '{"hw_tier":"high",...}'` |

### Crons do hub

| Schedule | O que corre |
|---|---|
| `0 * * * *` | Hourly aggregate — agrega deltas em stats |
| `0 6 * * *` | Daily generate — gera router-tuning.json novo |
| `0 6 * * 1` | Weekly notify — notifica Paulo + prune de dados antigos |

### Comandos wrangler

```bash
cd "C:\Users\Paulo Loureiro\frugal\hub"

# Deploy do worker
npx wrangler deploy

# Ver logs em tempo real
npx wrangler tail

# Query à D1
npx wrangler d1 execute frugal-hub --command "SELECT COUNT(*) FROM routing_deltas"

# Actualizar secret
echo "VALOR" | npx wrangler secret put PAULO_WEBHOOK_URL

# Ver secrets configurados
npx wrangler secret list
```

---

## BACKEND — Supabase (Auth + DB)

| Campo | Valor |
|---|---|
| Project name | `frugal` |
| Project ID | `eymtobwinevywmmlmxqa` |
| URL | `https://eymtobwinevywmmlmxqa.supabase.co` |
| Region | `sa-east-1` (São Paulo) |
| Status | `ACTIVE_HEALTHY` |
| Dashboard | https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa |

### Tabelas

| Tabela | Propósito | RLS |
|---|---|---|
| `waitlist` | Emails de inscrição + savings estimate | ✅ `Allow anonymous inserts` activa |
| `profiles` | Perfis de utilizadores autenticados | ✅ Apenas próprio user |
| `usage_sessions` | Sessões de uso por utilizador | ✅ Apenas próprio user |

### Schema rápido

```sql
-- waitlist
id, email, url, savings_est, created_at

-- profiles (expandido 2026-04-10)
id, email, os_type, github_username, github_primary_language,
github_language_distribution, github_public_repos_count, github_connected_at,
experience_level, frugal_config, frugal_version, install_completed,
first_prompt_at, last_active_at

-- usage_sessions
id, user_id, session_date, prompts_total, t0_count, t1_count, t2_count, t3_count,
savings_usd, created_at
```

### RLS pendente (CRÍTICO — bloqueia form de waitlist)

```sql
-- Correr no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/sql/new
CREATE POLICY "Allow anon insert" ON waitlist
FOR INSERT TO anon
WITH CHECK (true);
```

### Auth configurada

| Provider | Estado | Callback URL |
|---|---|---|
| Magic Link (email) | ✅ Activo | — |
| GitHub OAuth | ⚠️ Pendente | `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback` |

### GitHub OAuth App (pendente — requer browser)

1. Ir a https://github.com/settings/applications/new
2. Application name: `frugal`
3. Homepage URL: `https://landing-five-azure-16.vercel.app`
4. Callback URL: `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback`
5. Copiar Client ID + Secret → Supabase → Authentication → Providers → GitHub

---

## RUNTIME LOCAL — frugal core

| Componente | Localização | Propósito |
|---|---|---|
| Hook principal | `~/.claude/tools/router/inject_context.js` | UserPromptSubmit hook entry |
| Classifier | `~/.claude/tools/router/classify.js` | Regex classifier (102 patterns, <50ms) |
| Patterns | `~/.claude/tools/router/patterns.js` | Single source of truth para regexes |
| Savings tracker | `~/.claude/tools/router/savings-tracker.js` | HTTP server :7821 |
| Backtest | `~/.claude/tools/router/backtest.js` | Auto-learning diário |
| GPU probe | `~/.claude/tools/router/gpu-probe.js` | Detecta hardware |
| Mode system | `~/.claude/tools/router/frugal-mode.js` | Beast/Zen/Auto modes |
| Paths helper | `~/.claude/tools/router/paths.js` | Cross-platform path resolver |
| Smoke test | `~/.claude/tools/router/smoke-test.js` | Post-install verification |

### Skills instaladas

| Skill | Trigger | Localização |
|---|---|---|
| `/frugal-status` | `/frugal-status` | `~/.claude/skills/frugal-status/` |
| `/frugal-savings` | `/frugal-savings` | `~/.claude/skills/frugal-savings/` |
| `/frugal-route` | `/frugal-route <task>` | `~/.claude/skills/frugal-route/` |
| `/frugal-summary` | `/frugal-summary` | `~/.claude/skills/frugal-summary/` |
| `/frugal-update` | `/frugal-update` | `~/.claude/skills/frugal-update/` |
| `/frugal-beast` | `/frugal-beast` | `~/.claude/skills/frugal-beast/` |
| `/frugal-zen` | `/frugal-zen` | `~/.claude/skills/frugal-zen/` |
| `/frugal-auto` | `/frugal-auto` | `~/.claude/skills/frugal-auto/` |
| `/frugal-hello` | `/frugal-hello` | `~/.claude/skills/frugal-hello/` |
| `/frugal-doctor` | `/frugal-doctor` | `~/.claude/skills/frugal-doctor/` |
| `/frugal-dashboard` | `/frugal-dashboard` | `~/.claude/skills/frugal-dashboard/` |

### Scheduled Tasks Windows

| Task | Schedule | Comando | Estado |
|---|---|---|---|
| `FrugalRouterBacktest` | Diário 02:00 | `%USERPROFILE%\.claude\tools\router\run-backtest.cmd` | ⚠️ Pendente registo |

```powershell
# Registar (PowerShell, sem admin):
$action = New-ScheduledTaskAction -Execute "$env:USERPROFILE\.claude\tools\router\run-backtest.cmd"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable
Register-ScheduledTask -TaskName "FrugalRouterBacktest" -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force

# Verificar:
schtasks /query /tn "FrugalRouterBacktest" /fo list
```

---

## SERVIÇOS DE TERCEIROS

| Serviço | Plano | Conta | Dashboard | Propósito |
|---|---|---|---|---|
| Cloudflare | Free | paulo.loureiro.shp@gmail.com | dash.cloudflare.com | Worker + D1 + R2 |
| Supabase | Free | paulo.loureiro.shp@gmail.com | supabase.com/dashboard | Auth + DB |
| Vercel | Free (Hobby) | pauloloureiroshp-ship-its-projects | vercel.com/dashboard | Landing deploy |
| GitHub | Free | pauloloureiroshp-ship-it | github.com | Repo + OAuth App |
| Anthropic API | Pay-as-go | paulo.loureiro.shp@gmail.com | console.anthropic.com | Haiku (T1) |
| Ollama | Local | — | localhost:11434 | T0 (qwen3:30b) |
| Notion | Free | paulo.loureiro.shp@gmail.com | notion.so | Documentação + logs |

---

## SUBAGENTS DISPONÍVEIS

| Subagent | Modelo | Localização | Quando usar |
|---|---|---|---|
| `model-architect` | Opus | `~/.claude/agents/model-architect.md` | Arquitectura, refactor crítico |
| `model-reasoner` | Sonnet | `~/.claude/agents/model-reasoner.md` | Bug hunt, plano técnico |
| `cheap-triage` | Haiku | `~/.claude/agents/cheap-triage.md` | Commit msg, docstring, regex |
| `local-summarizer` | Ollama | `~/.claude/agents/local-summarizer.md` | Resumo, comparação, extracção |
| `local-transformer` | Ollama | `~/.claude/agents/local-transformer.md` | Format transforms |
| `final-reviewer` | Opus | `~/.claude/agents/final-reviewer.md` | Gate pré-merge/push/deploy |

---

## MASTER PROMPTS DISPONÍVEIS (raiz do repo)

| Ficheiro | Propósito | Estado |
|---|---|---|
| `FRUGAL_OS_MASTER_PROMPT.md` | frugal v2.0 OS vision — 7 prioridades | 🟡 P1 feito, P2-P7 pendentes |
| `AUDIT_MASTER_PROMPT.md` | Auditoria completa 7 blocos | ✅ Executado — ver AUDIT_REPORT.md |
| `POST_AUDIT_MASTER_PROMPT.md` | Fixes pós-auditoria (docs, version, gitignore) | ✅ Executado — commit dd7a9fa |
| `SELF_FIX_MASTER_PROMPT.md` | classify.js T1 fix + scheduled task | 🟡 Pendente execução |
| `LANDING_V10_MASTER_PROMPT.md` | Landing v10 — logo, Simple Icons, install journey | 🟡 Pendente |
| `CLAUDE_AI_BROWSER_MASTER_PROMPT.md` | Browser tasks — GitHub OAuth, Supabase RLS, Cloudflare | 🟡 Parcial (RLS ✅, OAuth pendente) |
| `FRIENDS_MASTER_PROMPT.md` | Friends Beta — 10 prioridades | ✅ Executado — v0.9.4 |
| `master-prompt-sprint4-browser-dashboard.md` | Sprint 4 — Dashboard MVP + browser tasks | ✅ Executado — v0.9.7 |

---

## NOTION HQ

| Página | ID | URL |
|---|---|---|
| ⚡ frugal — Model Router HQ | `33d6f6e4-2bc4-816b-977a-fe84bbe912c9` | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |
| 🚀 Sessão tarde 2026-04-10 | `33e6f6e4-2bc4-8100-9c74-e1bb9551106a` | https://www.notion.so/33e6f6e42bc481009c74e1bb9551106a |
| 👥 Friends Beta — Onboarding & Tracking | `33e6f6e4-2bc4-8135-ae61-cccc625406d8` | https://www.notion.so/33e6f6e42bc48135ae61cccc625406d8 |
| 🌍 frugal v2.0 — OS Vision | `33e6f6e4-2bc4-8128-9155-d79fbc14a6e5` | https://www.notion.so/33e6f6e42bc481289155d79fbc14a6e5 |

---

## VERSÃO ACTUAL

| Campo | Valor |
|---|---|
| Versão | `v0.9.7` |
| Canal | `friends-beta` |
| Data | `2026-04-11` |
| Patterns | 102 |
| Test prompts | 170 (100% accuracy) |
| Savings validados | 89.9% (1,437 prompts reais) |
| SSOT | `tools/router/version.json` |
