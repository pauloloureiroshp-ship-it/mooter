# INFRA.md — Mooter Infrastructure Reference
# Última verificação ao vivo: 2026-04-18 (v0.10.0 · post-landing-redesign)
# Estado em 2026-07-12: STALE / NÃO REVERIFICADO — confirmar cada ID/endpoint no serviço antes de operar.
# ⚠️ NUNCA commitar passwords reais aqui. Usar placeholders e referências a secrets managers.

> Ficheiro de referência operacional historicamente **auto-populado via MCP**.
> Os IDs abaixo foram obtidos directamente dos serviços na data da última verificação; não assumir que continuam
> atuais sem consulta ao conector correspondente.
> Qualquer sessão (Cowork ou Claude Code) pode operar autonomamente com este ficheiro.
> **Actualizar sempre que mudar qualquer endpoint, credencial ou estrutura.**

---

## ÍNDICE RÁPIDO

| Preciso de... | Vai para |
|---|---|
| Fazer deploy da landing | [→ Vercel](#vercel) |
| Query à base de dados | [→ Supabase](#supabase) |
| Ver logs / deploy do Worker | [→ Cloudflare](#cloudflare) |
| Ver estado do projecto | [→ Versão Actual](#versão-actual) |
| Saber qual MCP chamar para X | [→ Padrões MCP](#padrões-mcp-por-serviço) |
| Histórico e decisões | [→ Notion HQ](#notion-hq) |

---

## PADRÕES MCP POR SERVIÇO

> **Para qualquer sessão:** usa os padrões abaixo. Nunca precisas de navegar manualmente.

### Vercel (MCP ID: `e1fe49cb-32e5-4421-af51-11afacdca0bb`)

```
# Ver todos os projectos
list_projects → teamId: "team_q3kDk3fEFhlL6AcNryTzH3o2"

# Ver deploys da landing (últimos 5)
list_deployments → projectId: "prj_2aZMQagzjYOtLyvofeWPnEA0mM1b", teamId: "team_q3kDk3fEFhlL6AcNryTzH3o2", limit: 5

# Ver build logs de um deploy
get_deployment_build_logs → deploymentId: "<uid do deploy>"

# Ver runtime logs
get_runtime_logs → projectId: "prj_2aZMQagzjYOtLyvofeWPnEA0mM1b"

# Detalhes de um projecto
get_project → projectId: "prj_2aZMQagzjYOtLyvofeWPnEA0mM1b", teamId: "team_q3kDk3fEFhlL6AcNryTzH3o2"
```

### Supabase (MCP ID: `f96ae7c5-d9e8-4f90-8c27-ec9ea15a1515`)

```
# Listar projectos
list_projects  (sem parâmetros — devolve todos)

# Executar SQL no frugal
execute_sql → project_id: "eymtobwinevywmmlmxqa", query: "SELECT ..."

# Ver tabelas
list_tables → project_id: "eymtobwinevywmmlmxqa"

# Ver logs
get_logs → project_id: "eymtobwinevywmmlmxqa", service: "api"

# Aplicar migration
apply_migration → project_id: "eymtobwinevywmmlmxqa", name: "nome_da_migration", query: "SQL..."
```

### Cloudflare (MCP ID: `17520659-95cf-4c03-a8d0-7ee938f44957`)

```
# OBRIGATÓRIO PRIMEIRO — activar account
set_active_account → activeAccountIdParam: "b1093c8a6e663afd02f98a1e87d0fa34"

# Listar workers
workers_list  (sem parâmetros após set_active_account)

# Ver worker específico
workers_get_worker → workerName: "frugal-hub"

# Ver código do worker
workers_get_worker_code → workerName: "frugal-hub"

# Query D1
d1_database_query → databaseId: "3659b56e-6f9c-4da8-bc28-e9f79b8576f7", sql: "SELECT ..."
# NOTE: 3659b56e is the ACTIVE mooter-hub D1 (device_heartbeats etc.).
# 320b55f6-9444-4deb-bcd5-e8227739546e is the legacy frugal-hub D1 (empty, kept for history).

# Listar D1 databases
d1_databases_list  (sem parâmetros após set_active_account)
```

### Notion (MCP ID: `82234981-b2d6-4841-a52f-bd7b966bf833`)

```
# Buscar páginas
notion-search → query: "frugal sessão"

# Ler página
notion-fetch → url: "https://www.notion.so/<page-id>"

# Criar sub-página no HQ
notion-create-pages → parent: { page_id: "33d6f6e4-2bc4-816b-977a-fe84bbe912c9" }, title: "..."

# Actualizar página
notion-update-page → page_id: "<id>", ...
```

### Gmail (MCP ID: `623a068a-a5b6-433e-b69f-7c0657a8ea67`)

```
# Ver perfil
gmail_get_profile  (sem parâmetros)

# Pesquisar
gmail_search_messages → query: "from:github frugal"

# Criar draft
gmail_create_draft → to: "...", subject: "...", body: "..."
```

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

# Tag nova versão (ver POLÍTICA DE TAGS abaixo antes de escolher o nome)
git tag -a v1.44.0-slug -m "v1.44.0 — descrição" && git push origin v1.44.0-slug
```

### POLÍTICA DE TAGS E VERSÃO (2026-07-16)

A tag de release é `vX.Y.Z[-slug]`, onde o `-slug` nomeia a wave/feature (`v1.44.0-graphify`). Ao dar
push, `.github/workflows/version-sync.yml` deriva o core semver (tira o `v` e tudo a partir do primeiro
`-`) e escreve-o em **`tools/router/version.json` — a única fonte de verdade** — e em
`landing/app/version.json`, que é uma cópia gerada e existe só porque o Next.js não consegue importar
de fora da app root. **Nenhum dos dois se edita à mão**, e a versão nunca aparece hardcoded em JSX: a
landing lê o JSON (`app/page.tsx` hero badge, changelog, compare, install, methodology). Várias tags
podem partilhar o mesmo core semver — `v1.44.0-graphify`, `v1.44.0-first-magic` e
`v1.44.0-compaction-advisor` são três waves sob o mesmo 1.44.0, e isso é intencional: o core só sobe
quando o que o produto promete muda. Tags de componente usam prefixo próprio
(`vscode-cockpit-v0.12.1`) e são deliberadamente ignoradas pelo version-sync, que só faz match em
`v<dígito>`. Histórico da dor: o sync nasceu porque `version.json` ficou em 1.6.0 com as tags em 1.21.x;
a mesma classe de drift reapareceu em 2026-07-16 com a landing em 1.39.0 contra o router em 1.44.0 —
por isso o workflow passou a escrever os dois ficheiros no mesmo run. Regra do 2.0: `v2.0.0` é tag
**depois** do gate humano, nunca antes (ver `_handoff/MOOTER_20_RELEASE_GATE.md`).

---

## VERCEL

| Campo | Valor |
|---|---|
| Team slug | `pauloloureiroshp-ship-its-projects` |
| **Team ID** | `team_q3kDk3fEFhlL6AcNryTzH3o2` |
| Dashboard | https://vercel.com/pauloloureiroshp-ship-its-projects |
| Conta | paulo.loureiro.shp@gmail.com |
| Plano | Hobby |

### Projectos Vercel

| Nome | **Project ID** | URL Produção | Propósito |
|---|---|---|---|
| `landing` | `prj_2aZMQagzjYOtLyvofeWPnEA0mM1b` | https://landing-five-azure-16.vercel.app | Frugal landing page |
| `marleyliving` | `prj_QYvvtP4Buw0VQkFwPPNbR89YOPmd` | — | Marley Living |
| `cloude-speaker` | `prj_X3lBheMtmlZAcM1bHpY5AjOqFVBf` | — | Cloude Speaker |
| `dist` | `prj_YgIoFYN9QCK3jdOFpAO00TO75Jh6` | — | Dist (artefacto) |

### Env vars da landing (Vercel)

| Variável | Valor | Onde gerir |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://eymtobwinevywmmlmxqa.supabase.co` | Vercel → Settings → Env Vars |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `[Supabase → Settings → API]` | Vercel → Settings → Env Vars |
| `NEXT_PUBLIC_SITE_URL` | `https://mooter.ai` | Vercel → Settings → Env Vars |
| `NEXT_PUBLIC_MOOTER_HUB_URL` | `https://mooter-hub.frugal-hub.workers.dev` | Added 2026-04-18 |

### Deploy da landing

```bash
# No terminal do Paulo (não funciona no sandbox Linux)
cd "C:\Users\Paulo Loureiro\frugal\landing"

# Verificar TypeScript antes
npx tsc --noEmit

# Deploy para produção
vercel --prod

# OU via git push (auto-deploy está ligado)
git push origin main
```

---

## SUPABASE

| Campo | Valor |
|---|---|
| Org slug | `xfsjjqobwfxmljelcfri` |
| Dashboard | https://supabase.com/dashboard |
| Conta | paulo.loureiro.shp@gmail.com |
| Plano | Free |

### Projectos Supabase

| Nome | **Project Ref** | Região | Estado | URL |
|---|---|---|---|---|
| `frugal` | `eymtobwinevywmmlmxqa` | sa-east-1 | ✅ ACTIVE_HEALTHY | https://eymtobwinevywmmlmxqa.supabase.co |
| `casa-inteligente` | `lvhicdhbtkmqosnvndtp` | — | ✅ ACTIVE_HEALTHY | https://lvhicdhbtkmqosnvndtp.supabase.co |
| `marleyliving-production` | `avnjvatqvicxaqmxzpli` | — | 💤 INACTIVE | — |
| `cloude-speaker` | `ptlxrnqiumpnsfcaxkhm` | — | 💤 INACTIVE | — |

### Frugal — Tabelas

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

### Auth configurada

| Provider | Estado | Callback URL |
|---|---|---|
| Magic Link (email) | ✅ Activo | — |
| GitHub OAuth | ✅ Activo (confirmado 2026-04-13) | `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback` |

### GitHub OAuth App (já configurada)

| Campo | Valor |
|---|---|
| App name | `Frugal` |
| Homepage URL | `https://landing-five-azure-16.vercel.app` |
| Callback URL | `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback` |
| Estado | ✅ Criada e activa em github.com/settings/developers |

---

## CLOUDFLARE

| Campo | Valor |
|---|---|
| **Account ID** | `b1093c8a6e663afd02f98a1e87d0fa34` |
| Account email | paulo.loureiro.shp@gmail.com |
| Dashboard | https://dash.cloudflare.com |
| Plano | Free |

### Workers

| Nome | **Worker Tag** | URL | Modificado |
|---|---|---|---|
| `frugal-hub` | `a8b8a0a3808c4b359325fb213b3899fc` | https://mooter-hub.frugal-hub.workers.dev | 2026-04-13 |

### D1 Databases

| Nome | **UUID** | Versão | Tamanho | Notas |
|---|---|---|---|---|
| `mooter-hub` | `3659b56e-6f9c-4da8-bc28-e9f79b8576f7` | production | 112 KB | ✅ ACTIVE — bound to worker frugal-hub. Owns device_heartbeats, aggregated_stats, deltas, anomalies, mooter_events, model_signals |
| `frugal-hub` | `320b55f6-9444-4deb-bcd5-e8227739546e` | production | 92 KB | Legacy (2026-04-10 → 2026-04-13). No writes since migration to mooter-hub. Keep for history. |

### Secrets do Worker

| Secret | Estado | Como configurar |
|---|---|---|
| `PAULO_WEBHOOK_URL` | ⚠️ Placeholder | `echo "URL_REAL" \| npx wrangler secret put PAULO_WEBHOOK_URL` |
| `PAULO_EMAIL` | ✅ Definido | `paulo.loureiro.shp@gmail.com` |
| `FRUGAL_SUBMIT_TOKEN` | ✅ Configurado (2026-04-11) | Valor no password manager — `npx wrangler secret list` para confirmar |

### GitHub Actions Secrets (repo frugal)

| Secret | Estado | Propósito |
|---|---|---|
| `CF_API_TOKEN` | ✅ Configurado (2026-04-11) | Auto-deploy Worker quando `hub/` muda |

### Endpoints do hub

| Endpoint | Método | O que faz |
|---|---|---|
| `/health` | GET | Health check |
| `/api/stats` | GET | Agregados (últimos 7 dias). Inclui `installed_fleet` desde 2026-04-13. |
| `/api/delta` | POST | Recebe routing delta anónimo |
| `/api/device-heartbeat` | POST | Instalação/alive heartbeat (install_start / install_ok / install_fail / alive) — persiste em D1 `device_heartbeats` |

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

## GITHUB

| Campo | Valor |
|---|---|
| Username | `pauloloureiroshp-ship-it` |
| Email | `paulo.loureiro.shp@gmail.com` |
| Repo frugal | https://github.com/pauloloureiroshp-ship-it/frugal |
| Visibilidade | Privado |
| Licença | MIT |
| Branch principal | `main` |
| Developer Settings | https://github.com/settings/developers |
| OAuth App "Frugal" | ✅ Existe e está activa |

---

## FRONTEND — Landing Page

| Campo | Valor |
|---|---|
| Framework | Next.js 15 (App Router) |
| Directório | `C:\Users\Paulo Loureiro\frugal\landing\` |
| URL produção | https://landing-five-azure-16.vercel.app |
| Ficheiro principal | `landing/app/page.tsx` (~1900 linhas) |
| Route group app | `landing/app/(app)/` — layout autenticado partilhado |
| Admin page | `landing/app/(app)/admin/page.tsx` (806 linhas) |
| Auth callback | `landing/app/auth/callback/route.ts` |
| Supabase lib | `landing/app/lib/supabase.ts` |
| Estilos globais | `landing/app/globals.css` |
| Tema | Dark (#080808 background, #00ff88 accent) |

### Secções da landing (ordem de render)

| ID | O que faz |
|---|---|
| `#hero` | Headline + live counters + install CTA |
| `#demo` | 3 prompts universais com routing animado |
| `#flywheel` | 5-step flywheel + privacy proof |
| `#how` | Diagrama técnico 3 layers |
| `#comparison` | Tabela frugal vs concorrentes |
| `#pricing` | Free / Pro / Team |
| `#access` | Form de waitlist (email → Supabase) |

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
| Version SSOT | `~/.claude/tools/router/version.json` | Versão canónica |

### Skills instaladas

| Skill | Trigger |
|---|---|
| `/frugal-status` | Estado do router |
| `/frugal-savings` | Poupanças acumuladas |
| `/frugal-route` | Classifica uma task |
| `/frugal-summary` | Resumo de sessão |
| `/frugal-update` | Actualiza o router |
| `/frugal-beast` | Modo Beast (tudo Opus) |
| `/frugal-zen` | Modo Zen (tudo Ollama) |
| `/frugal-auto` | Modo Auto (routing inteligente) |
| `/frugal-hello` | Boas-vindas interactivo |
| `/frugal-doctor` | Diagnóstico de saúde |
| `/frugal-dashboard` | Dashboard visual |

### Scheduled Tasks Windows

```powershell
# Registar backtest diário (PowerShell, sem admin):
$action = New-ScheduledTaskAction -Execute "$env:USERPROFILE\.claude\tools\router\run-backtest.cmd"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable
Register-ScheduledTask -TaskName "FrugalRouterBacktest" -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Force

# Verificar:
schtasks /query /tn "FrugalRouterBacktest" /fo list
```

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

## NOTION HQ

| Campo | Valor |
|---|---|
| User Paulo — ID | `31ed872b-594c-8170-8ebb-0002685e24e0` |
| **HQ Page ID** | `33d6f6e4-2bc4-816b-977a-fe84bbe912c9` |
| HQ URL | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |

### Páginas de sessão

| Página | ID |
|---|---|
| ⚡ frugal — Model Router HQ | `33d6f6e4-2bc4-816b-977a-fe84bbe912c9` |
| 🚀 Sessão tarde 2026-04-10 | `33e6f6e4-2bc4-8100-9c74-e1bb9551106a` |
| 👥 Friends Beta — Onboarding & Tracking | `33e6f6e4-2bc4-8135-ae61-cccc625406d8` |
| 🌍 frugal v2.0 — OS Vision | `33e6f6e4-2bc4-8128-9155-d79fbc14a6e5` |

---

## OUTROS SERVIÇOS

| Serviço | Plano | Conta | Dashboard | Propósito |
|---|---|---|---|---|
| Anthropic API | Pay-as-go | paulo.loureiro.shp@gmail.com | console.anthropic.com | Haiku (T1) |
| Ollama | Local | — | localhost:11434 | T0 (qwen3:30b) |
| Sentry | Free? | — | sentry.io | Error tracking (MCP disponível) |

---

## MASTER PROMPTS DISPONÍVEIS (raiz do repo)

| Ficheiro | Propósito | Estado |
|---|---|---|
| `FRUGAL_OS_MASTER_PROMPT.md` | frugal v2.0 OS vision — 7 prioridades | 🟡 P1 feito, P2-P7 pendentes |
| `AUDIT_MASTER_PROMPT.md` | Auditoria completa 7 blocos | ✅ Executado |
| `POST_AUDIT_MASTER_PROMPT.md` | Fixes pós-auditoria | ✅ Executado — commit dd7a9fa |
| `SELF_FIX_MASTER_PROMPT.md` | classify.js T1 fix + scheduled task | 🟡 Pendente |
| `FRIENDS_MASTER_PROMPT.md` | Friends Beta — 10 prioridades | ✅ Executado — v0.9.4 |
| `master-prompt-sprint4-browser-dashboard.md` | Sprint 4 — Dashboard MVP | ✅ Executado — v0.9.7 |
| `docs/archive/master-prompts-2026-04/ROADMAP_MASTER_V2.md` | T0+T1+T2 — 7 módulos | ✅ Executado — v0.9.9 |

---

## VERSÃO ACTUAL

| Campo | Valor |
|---|---|
| **Versão** | `v0.9.9` |
| Canal | `friends-beta` |
| Data | `2026-04-13` |
| Patterns | 102 |
| Test prompts | 170 (100% accuracy) |
| Savings validados | 89.9% (1,437 prompts reais) |
| Último deploy | Vercel → landing, build READY ✅ |
| SSOT | `tools/router/version.json` |

### Próximos passos (desbloqueados quando ≥3 utilizadores reais)

| Task | Bloqueia em |
|---|---|
| Convidar 3 Friends Beta | https://landing-five-azure-16.vercel.app |
| VSCode extension publish | Azure DevOps PAT pendente |
| T3: Desktop App (Tauri v2) | ≥3 utilizadores |
| T3: MCP Server | ≥3 utilizadores |
| T3: Federated Learning v2 | ≥3 utilizadores |
