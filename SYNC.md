# SYNC.md — frugal

> Canal bidirecional entre Cowork (Claude Desktop) e Claude Code CLI.
> **Última actualização:** 2026-04-11 — Claude Code (sessão #12 — feedback loop + install hardening + evolution snapshot)

---

## O que é o frugal

**Vibe Coder Intelligence Platform** — router inteligente de LLMs para Claude Code.

Classifica cada prompt em < 50 ms (regex puro, sem LLM) e emite um `<router-hint>` que direciona o modelo certo para o tier certo. Resultado: ~90% de poupança vs usar Opus em tudo.

**Repositório:** `C:\Users\Paulo Loureiro\frugal\` (alias CLI: `~/frugal/`)
**GitHub:** https://github.com/pauloloureiroshp-ship-it/frugal (privado, MIT)
**Hub live:** https://frugal-hub.frugal-hub.workers.dev

---

## Estado actual do projecto — 2026-04-11

### Versão: v0.9.4 (Friends Beta — Landing deployed 2026-04-10)

| Componente | Estado | Notas |
|---|---|---|
| `classify.js` v0.10 | ✅ em prod | +variant_hint, +SUBAGENT_SPAWN_RE, +previous_tier inheritance |
| `inject_context.js` | ✅ v0.10 | +readLastSessionTier() + export FRUGAL_PREV_TIER |
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
| Skills (10 total) | ✅ NOVO | 5 originais + 3 modos + frugal-hello + frugal-doctor |
| `frugal-doctor.js` | ✅ NOVO (2026-04-11) | Diagnóstico completo cross-platform, --fix mode |
| `install.sh` v2 | ✅ NOVO (2026-04-11) | LaunchAgent macOS + wizard subscriptions + smoke test |
| `gsd-turn-end.js` Stop hook | ✅ LIVE (2026-04-11 pm) | feedback loop agora registado em settings.json via install.sh + install-windows.ps1 |
| Multi-model telemetry | ✅ LIVE (2026-04-11 pm) | `detectExternalModel()` regista codex/gemini/aider no execution.log |

### Evolução recente (snapshot completo em [📊 Notion](https://www.notion.so/33f6f6e42bc481fea8e1e065f53ee73b))

- **v0.7 → v0.8** — classifier regex core + weighted scoring + arbiter Haiku para long tail
- **v0.8 → v0.9** — mode system, subscription profile, decomposition, adversarial test generator
- **v0.9 → v0.9.3** — hub Cloudflare deployed, GPU probe, statusline v0.12, Windows compat, onboarding auto
- **v0.9.3 → v0.9.4** — security audit, landing v9, Supabase + GitHub OAuth, 4-step onboarding, cross-platform installer
- **Sessões 2026-04-10/11** — E2E MVP validation, Landing v10 + OS Vision, classify.js v0.10, frugal-doctor, install.sh v2
- **Sessão #12 (hoje pm)** — bug crítico do feedback loop descoberto e corrigido (Stop hook nunca estava em `settings.json`), P0 cache key, P1 mode system, P3 multi-model telemetry, P4 SSOT dedup, push entregue (9 commits)

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
| 🧪 E2E MVP Validation — 2026-04-10 | `33e6f6e4-2bc4-81bc-8e01-ee0160b00928` | https://www.notion.so/33e6f6e42bc481bc8e01ee0160b00928 |
| 🔬 Sessão 2026-04-11 — frugal-doctor + install.sh v2 | `33e6f6e4-2bc4-817e-bd88-f17bbd39c597` | https://www.notion.so/33e6f6e42bc4817ebd88f17bbd39c597 |
| 🦙 Sessão 2026-04-11 — Model emoji + role label em cada Bash | `33f6f6e4-2bc4-816e-a1cf-d331893036b2` | https://www.notion.so/33f6f6e42bc4816ea1cfd331893036b2 |
| 🧠 Sessão 2026-04-11 — classify.js v0.10 (3 melhorias router) | `33f6f6e4-2bc4-81e4-8e0f-ddbd4b599359` | https://www.notion.so/33f6f6e42bc481e48e0fddbd4b599359 |
| 🔁 Sessão 2026-04-11 — Feedback loop + install hardening (P0→P4) | `33f6f6e4-2bc4-81ee-a03a-f973d3747461` | https://www.notion.so/33f6f6e42bc481eea03af973d3747461 |
| 📊 Evolução + Status atual — 2026-04-11 | `33f6f6e4-2bc4-81fe-a8e1-e065f53ee73b` | https://www.notion.so/33f6f6e42bc481fea8e1e065f53ee73b |
| 👁️ Sessão 2026-04-11 — Visibility stack + delegação real | `33f6f6e4-2bc4-8136-9255-d80e8780ed03` | https://www.notion.so/33f6f6e42bc48136 9255d80e8780ed03 |

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

**Última actualização Cowork:** 2026-04-11 (sessão #11 — classify.js v0.10, 3 melhorias router)
**Estado:** 🆕 Para ler na próxima sessão Claude Code

---

### ESTADO PÓS-SESSÃO #13 (Claude Code 2026-04-11 pm) — Visibility stack + delegação real

✅ **CONFIRMADO EM TERMINAL NOVO** — `FRUGAL_ROUTING_TEST.md` correu com sucesso.

**Motivação:** sessão #12 fixou install + feedback loop mas a statusline mostrava advisory savings que nunca materializavam. User frustrado: "evoluímos tanto para nada?"

**5 bugs em camadas descobertos e corrigidos:**

| # | Sintoma | Causa raiz | Commit |
|---|---|---|---|
| 1 | Bar mostrava Ollama% mas Bash todos 🔴 | `renderDistribution` lia `decisions.log` (advisory) | `08a6609` |
| 2 | Hero ↓62% saved com barra 100% vermelha | `renderSavingsHero` via tracker HTTP (advisory) | `2136164` |
| 3 | Orquestrador nunca delegava, tudo inline Opus | Doutrina "inline se < 5 tool calls" demasiado permissiva | `3cece08` |
| 4 | Subagents delegados não apareciam em `execution.log` | Hooks com matcher `Bash` apenas | `e0efe95` |
| 5 | User não via recomendação antes do turn | Faltava turn header visível | `08a6609` |

**3 camadas de enforcement activadas:**
1. **Doutrina CLAUDE.md v2** — T0/T1 obriga delegar, excepção única com estado de sessão declarado
2. **Runtime directive** em `inject_context.js` — injecta `<delegation_directive>` quando compliance 0% + tier T0/T1
3. **Visual warning** em `frugal-turn-header.js` — `⚠ session 100% Opus` no header

**Subagent tracking:**
- `exec-logger.js` + `PostToolUse.js` agora com matcher `Bash|Agent|Task`
- `subagentTypeToModel()` mapeia `subagent_type` → modelo efectivo
- Agent calls registados como `cmd=agent:<type>` com modelo real

**Proof of work (terminal novo, 4 turns):**

| # | Subagent | Modelo efectivo | Saved |
|---|---|---|---|
| 1 | local-summarizer | qwen2.5-coder:14b-q4 | $0.257 |
| 2 | local-transformer | qwen3:30b | $0.257 |
| 3 | local-summarizer | qwen2.5-coder:14b-q4 | $0.257 |
| 4 | model-reasoner | claude-sonnet-4-6 | $0.219 |

Statusline live: `🐕 💰 ↓100% saved ~$0.51 · spent ~$0.00 │ ██████████ exec 🦙 Local 100%`

**Ficheiros tocados:**
- `tools/router/gsd-statusline.js`, `gsd-turn-end.js`, `inject_context.js`
- `tools/router/frugal-turn-header.js` (NOVO), `exec-logger.js` (NOVO no repo), `PostToolUse.js` (NOVO no repo)
- `install.sh` / `install-windows.ps1` — copy hooks + matcher migration
- `CLAUDE.md` (pessoal + projeto) — doutrina v2
- `FRUGAL_ROUTING_TEST.md` (NOVO) — teste de aceitação visual

**Commits:** `08a6609` `2136164` `3cece08` `e0efe95` `35e1304`

**Página Notion:** [👁️ Visibility stack + delegação real](https://www.notion.so/33f6f6e42bc481369255d80e8780ed03) (com Proof of work appended)

**Pendentes próxima sessão:**
1. **[MÉDIA]** Browser tasks do `CLAUDE_AI_BROWSER_MASTER_PROMPT.md`
2. **[BAIXA]** `install.sh ${HAS_MAX,,}` bash 3.2 compat macOS
3. **[BAIXA]** Consolidar override detection entre `inject_context.js` (structured) e `frugal-turn-header.js` (substring)

---

### ESTADO PÓS-SESSÃO #12 (Claude Code 2026-04-11) — Feedback loop + install hardening

✅ Lido em sessão #12 — 2026-04-11 (pendentes #11 resolvidos abaixo)

**Pendentes da sessão #11 — estado:**

| # | Item | Estado |
|---|---|---|
| 1 | [ALTA] Cache key fix `SHA256(prompt + '|' + FRUGAL_PREV_TIER)` | ✅ em prod |
| 2 | [MÉDIA] Browser tasks (GitHub OAuth, Supabase RLS, Cloudflare, Vercel) | ⏳ próxima sessão |
| 3 | [MÉDIA] `applyActiveMode()` patch em `inject_context.js` | ✅ em prod |
| 4 | [BAIXA] Tracking GPT/Gemini/aider no execution.log | ✅ em prod (`detectExternalModel()` shared) |
| 5 | [BAIXA] Dedup statusline + turn-end | ✅ SSOT em `~/.claude/hooks/` |

**Bug crítico descoberto e resolvido nesta sessão:**

O hook `Stop` → `gsd-turn-end.js` nunca tinha sido instalado em `settings.json` em nenhuma máquina. `backtest.resolveFeedback()` corria sem dados. RESOLVIDO em `install.sh` + `install-windows.ps1`: merge idempotente do Stop hook no install e no `/frugal-update`.

**Commit:** `766844b feat(install): feedback loop Stop hook + router/hooks dedup`

**Pendentes para próxima sessão:**

1. **[MÉDIA] Browser tasks** — continuar `CLAUDE_AI_BROWSER_MASTER_PROMPT.md`
2. **[BAIXA] Verificar em produção** que o Stop hook dispara e `backtest.resolveFeedback` está a parear `turn_end` com os eventos do turn seguinte

---

### ESTADO PÓS-SESSÃO #11 (Cowork 2026-04-11) — classify.js v0.10

**O que ficou em produção:**

| Componente | Ficheiro | Estado |
|---|---|---|
| `variant_hint` no result object | `classify.js` L~579 | ✅ T0 expõe variante Ollama; outros tiers `null` |
| `SUBAGENT_SPAWN_RE` + `detectSubagentSpawn()` | `classify.js` L~170-206 | ✅ detecta spawn explícito e bare; `user_override: true`, tier preservado |
| `previous_tier` inheritance | `classify.js` L~454 | ✅ follow-ups < 50ch sem sinais herdam T2/T3 via `FRUGAL_PREV_TIER` |
| `readLastSessionTier()` + export `FRUGAL_PREV_TIER` | `inject_context.js` L~270, L~462 | ✅ tail 32KB decisions.log, silent on failure |

**Pendentes para próxima sessão:**

1. **[ALTA] Fix cache key** — `getCached`/`setCache` usa apenas `SHA256(prompt)`, não inclui `FRUGAL_PREV_TIER`. Dois prompts idênticos de sessões com tiers diferentes partilham resultado cached errado. Fix: `SHA256(prompt + '|' + (FRUGAL_PREV_TIER || ''))`. Mudança de 2 linhas em `classify.js`.

2. **[MÉDIA] Browser tasks** (CLAUDE_AI_BROWSER_MASTER_PROMPT.md):
   - GitHub OAuth App "frugal" em github.com/settings/applications/new
   - Supabase RLS: `CREATE POLICY "Allow anon insert" ON waitlist FOR INSERT TO anon WITH CHECK (true);`
   - Cloudflare: secret `PAULO_WEBHOOK_URL` real
   - Vercel: env vars `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SITE_URL`

3. **[MÉDIA] MODES_MASTER_PROMPT.md** — aplicar patch `applyActiveMode()` em `inject_context.js`

4. **[BAIXA] Tracking GPT/Gemini** no execution.log — heurística análoga ao `ollama_call.sh` para `codex`, `gemini-cli`, `openai` em comandos bash

5. **[BAIXA] Dedup statusline** — `hooks/gsd-statusline.js` e `tools/router/gsd-statusline.js` fora de sincronia

---

### ESTADO PÓS-SESSÃO #10 (Claude Code 2026-04-11) — Model transparency per-call

**O que ficou em produção:**

| Componente | Ficheiro | Estado |
|---|---|---|
| Visual hook (PostToolUse) | `~/.claude/hooks/PostToolUse.js` | ✅ resolve modelo real por `tool_use_id`, com Pass 1.5 que varre `subagents/*.jsonl` (mtime < 30s) |
| Execution log hook | `~/.claude/hooks/exec-logger.js` | ✅ escreve `~/.claude/hooks/execution.log` em cada Bash call com schema `[ISO] session model role cmd resolve_ms mode` |
| Hook registration | `~/.claude/settings.json` | ✅ 2 hooks PostToolUse para matcher `Bash` (visual + logger), PostToolUse.js preservado intocado na lógica visual |
| Heurística T0 | ambos | ✅ comando contém `ollama_call.sh` → override para `qwen3:30b` / role `local` |
| Self-tuning perf | `exec-logger.js` + `exec-logger-perf.json` | ✅ rolling 20 samples, threshold 200ms, auto-flip para `decisions_log` se transcript scan ficar lento |

**Smoke test final (4/4 tiers correctos):**
```
T3 inline                → claude-opus-4-6            / architect   (resolve 1ms)
T2 model-reasoner        → claude-sonnet-4-6          / reasoning   (resolve 2ms)
T1 cheap-triage          → claude-haiku-4-5-20251001  / reflex      (resolve 2ms)
T0 local-summarizer+ollama_call.sh → qwen3:30b        / local       (resolve 2ms)
```

Mode actual: `transcript_scan`. Média 1.5–2 ms/call → 130× abaixo do threshold, não há risco de flip.

**Iterações que foram necessárias (para referência se bug aparecer):**
1. Primeira abordagem (instrução nos agent files para escreverem eles próprios o log) **falhou** — os modelos improvisam formato livre. Abandonada.
2. Hook global sem Pass 1.5 atribuía tudo ao parent (opus) porque `transcript_path` é sempre o do orquestrador.
3. Sibling scan no mesmo dir também falhava — sub-agent transcripts vivem em `<project>/<session-id>/subagents/*.jsonl`, não ao lado do parent.
4. Pass 1.5 final: `path.join(parentDir, basename(no-ext), 'subagents')` + filtro mtime < 30s → bounded I/O, 1-3 ficheiros, resolve em 1-2ms.

**Ficheiros modificados nesta sessão:**
- `~/.claude/hooks/PostToolUse.js` — Pass 1.5 sibling scan + heurística ollama_call.sh
- `~/.claude/hooks/exec-logger.js` — NOVO, cloned do PostToolUse.js com append ao execution.log + perf self-tuning
- `~/.claude/hooks/execution.log` — NOVO, persistent log per-Bash-call
- `~/.claude/hooks/exec-logger-perf.json` — NOVO, perf samples rolling window
- `~/.claude/settings.json` — + 1 PostToolUse hook entry (Bash matcher)
- `~/.claude/agents/local-summarizer.md`, `model-reasoner.md`, `cheap-triage.md` — tentativa 1 deixou instruções de logging nos agent files (ficam como documentação, não são críticas, o hook faz o trabalho)

**Pendentes para próxima sessão:**

1. **Tracking real de modelos externos no classify.js** — o router já sabe quando recomenda GPT/Gemini, mas o `recommended_model` escrito em `decisions.log` é genérico. Precisa ligar ao output real do subprocess (quando existe) para podermos distinguir, no execution.log, entre `claude-opus-4-6` e uma call a `gpt-4o` via bash. Heurística análoga à do `ollama_call.sh`: se comando contém `codex`, `openai`, `gemini-cli`, etc → override para o modelo correspondente.

2. **Issue upstream: titlePrefix no Claude Code** — os sub-agents não expõem o seu próprio modelo no PostToolUse payload do parent hook. Tivemos de scan ao filesystem para resolver. Seria mais limpo se o runtime passasse o `agent_model` no payload de PostToolUse, ou se aceitasse um `titlePrefix` do hook para decorar a statusline por sub-agent. Vale abrir issue em anthropics/claude-code.

3. **Commit `~/.claude/`** — não é git repo. Se queres versionar a doutrina + hooks + agents, fazer `git init` em `~/.claude/` em sessão dedicada. Blast radius alto, pausou-se e decidiu-se skip nesta sessão (opção 2).

4. **Dedup statusline** — memória `feedback_dual_statusline_files` já flagged: `hooks/` e `tools/router/` têm cópias fora-de-sincronia do statusline. Relembrar quando mexer em statusline.

---

### ESTADO PÓS-SESSÃO #9 (Cowork 2026-04-11)

**Ficheiros novos criados nesta sessão:**

| Ficheiro | Propósito |
|---|---|
| `tools/router/frugal-doctor.js` | Diagnóstico completo: 9 secções, --fix mode, --json mode |
| `skills/frugal-doctor/SKILL.md` | Slash command `/frugal-doctor` |
| `FRUGAL_EXPERIENCE_REPORT.md` | Diagnóstico de gaps cross-platform + plano de acção |

**Ficheiros modificados:**

| Ficheiro | O que mudou |
|---|---|
| `install.sh` | + wizard subscriptions interativo, + LaunchAgent macOS (02:00 backtest), + cron Linux, + auto-start tracker, + smoke test, + summary visual final, + `/frugal-doctor` na lista de skills |

**Causa raiz dos problemas MacBook identificados:**
1. LaunchAgent macOS em falta → dados nunca chegavam ao hub → algoritmo não melhorava → **FIXED** (install.sh v2)
2. Subscription profile vazio (anthropic: 'unknown') → router não sabia do Claude Max → **FIXED** (wizard no install)
3. Tracker não arrancava na 1ª sessão → statusline simplificada → **FIXED** (auto-start no install)
4. Sem visibilidade pós-install → utilizador sem confirmação → **FIXED** (frugal-doctor + summary visual)

**Para aplicar no MacBook (fazer antes da próxima sessão Claude Code):**
```bash
cd ~/frugal && git pull origin main
bash install.sh   # responder às perguntas de subscriptions
node ~/.claude/tools/router/frugal-doctor.js  # verificar tudo
node ~/.claude/tools/router/frugal-doctor.js --fix  # corrigir o que falhar
```

---

### MISSÃO PRÓXIMA SESSÃO CLAUDE CODE: Cache key fix + Browser tasks + Mode system

**Prioridade 0 — Fix cache key em classify.js (2 linhas, fazer primeiro)**
Em `getCached`/`setCache`, mudar a key de `SHA256(prompt)` para `SHA256(prompt + '|' + (process.env.FRUGAL_PREV_TIER || ''))`.
Testar: `rm .classify-cache.json && FRUGAL_PREV_TIER=T3 node classify.js "e agora?" | grep tier` vs `FRUGAL_PREV_TIER=T1 node classify.js "e agora?" | grep tier` — devem dar resultados diferentes.

**Prioridade 1 — MODES_MASTER_PROMPT.md**
Aplicar o patch do mode system em `inject_context.js` — função `applyActiveMode()` após `applyBudgetCap()`.
O ficheiro MODES_MASTER_PROMPT.md tem o patch exacto pronto a aplicar.

**Prioridade 2 — Browser tasks (CLAUDE_AI_BROWSER_MASTER_PROMPT.md)**
Estas tarefas requerem browser:
- T1: github.com/settings/applications/new → criar OAuth App "frugal"
- T2: Supabase SQL Editor → RLS anon INSERT na `waitlist`: `CREATE POLICY "Allow anon insert" ON waitlist FOR INSERT TO anon WITH CHECK (true);`
- T3: Cloudflare → secret `PAULO_WEBHOOK_URL` (webhook.site ou Discord)
- T4: Vercel → env vars NEXT_PUBLIC_SUPABASE_ANON_KEY + NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SITE_URL

**Prioridade 3 — Decisão repo público**
Para que amigos instalem com o oneliner, o repo tem de ser público OU o install.sh hospedado na landing.
Paulo decide quando tornar público (auditoria de segurança: ✅ feita em v0.9.4).

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
| **P10** | SYNC.md, Notion Friends Beta, snapshot, push | Sempre | 