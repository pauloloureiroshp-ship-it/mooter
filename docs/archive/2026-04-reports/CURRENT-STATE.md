# CURRENT-STATE.md — Mooter Discovery Inventory

**Gerado em:** 2026-04-21 08:10 UTC · **Autor:** Claude Code (Opus 4.7, sessão de descoberta read-only)
**Âmbito:** snapshot factual do ecosistema Mooter neste momento. **Não modifica nada fora deste ficheiro.**

---

## SEÇÃO 1 — ARQUITETURA DE SYNC E DOUTRINA

### 1.1 Localização do SYNC.md
- **Path canónico:** `C:\Users\Paulo Loureiro\frugal\SYNC.md` (Windows)
- **Espelho Mac:** `~/frugal/SYNC.md` (referência; mesma SSOT via git)
- **Tamanho:** 50026 bytes, 745+ linhas, última mod `2026-04-21 07:57`
- Declarado "canónico" no próprio ficheiro, linha 3: *"Canónico em `~/frugal/SYNC.md` no Mac, `C:\Users\Paulo Loureiro\frugal\SYNC.md` no Windows."*

### 1.2 Schema do SYNC.md (seções existentes, top-level + 2º nível relevante)
| Linha | Seção | Propósito |
|---|---|---|
| 1 | `# Mooter — Sync Snapshot` | Header (versão, último commit, sessão #) |
| 11 | `### 🏆 Claude Certified Architect — 10/10` | Scoreboard dos 10 critérios CCA |
| 26 | `### ⚠️ Acções PENDENTES para Paulo (runtime config)` | TODO manual (Sentry, etc) |
| 40 | `### ⚠️ Acções URGENTES pendentes (security)` | Patches de segurança urgentes |
| 52 | `### HIBP blocker (decisão estratégica)` | Bloqueio HaveIBeenPwned |
| 56–101 | `### Sessão #28/#29 commits` | Log cronológico de commits |
| 102 | `### Bugs reais eliminados (11)` | Tracking de bugs fechados |
| 116 | `### CCA scoreboard (landing column — delta)` | Delta do scoreboard público |
| 126 | `### Parallel sessions awareness` | Aviso sobre sessões concorrentes |
| 136 | `## 🎯 Estado Actual do Projecto` | Estado global do Mooter |
| 150–181 | `## 🖥️ Multi-device — Mac ↔ Windows PC` | Cowork handoff |
| 184 | `## 🎯 BIG PICTURE — MVP Onboarding end-to-end` | Pipeline alvo MVP |
| 209 | `## 📥 COWORK → CLAUDE CODE` | **Canal bidirecional de instruções** |
| 219 | `### 🔍 Sessão #34 — Full-system audit` | Audit em curso (17 findings) |
| 245–605 | `### ✅ Sessão #33 … #25` | Logs detalhados de sessões passadas |
| 611 | `### 🔴 PRIORIDADE #1 — OAuth fix Friends Beta` | Top-priority bug |
| 643 | `### 🟠 PRIORIDADE #2 — /api/device-heartbeat` | Endpoint pendente |
| 667 | `### ✅ Bugs RESOLVIDOS nesta sessão Cowork` | Referência histórica |
| 697 | `## 🏁 Sprints` | Tabela de sprints (v0.9.9 → v1.0) |
| 711 | `## 📊 Stats actuais` | Métricas (88.3% accuracy, 89/89 tests) |
| 721 | `## 🧱 Stack técnica` | Camadas e tecnologias |
| 732 | `## 🔗 Links` | Notion HQ + páginas de sessão |

### 1.3 Doutrina `final-reviewer`
- **Path:** `C:\Users\Paulo Loureiro\.claude\agents\final-reviewer.md`
- **Modelo hardcoded:** `model: opus` (frontmatter)
- **Tools permitidos:** `Read, Grep, Glob, Bash` (read-only; não pode editar/escrever)
- **Quando invocar (doctrine global CLAUDE.md):** pré-merge, pré-push, pré-release, pré-deploy → **spawn obrigatório, nunca skip**
- **O que valida:** diff vs. intent original, blast radius, security, "did we actually do what was asked"
- **Citação:** *"You are the gate. Nothing reaches production without you having looked at it."*
- **Comportamento:** *"Always picks Opus — never compromised."*

### 1.4 Doutrina de git push
- Definida em `~/.claude/CLAUDE.md` e `frugal/CLAUDE.md` (idênticos):
  - **Pré-push/merge/deploy → sempre `final-reviewer` antes**
  - Nunca `--no-verify` sem pedido explícito do Paulo
  - Nunca `git add -A` em projetos do Paulo (commits seletivos)
  - Nunca force-push para main/master (warning obrigatório)
  - `-i` (interactive) proibido (não suportado pelo harness)
- Rollback anchor: `git log --oneline` tail-30 mostra que o último "safe point" antes do audit Sprint D é `4d60d9f` (HEAD actual); pré-Sprint A é `fc2c991`.

### 1.5 Runtime-state files protegidos / "sagrados"
| Path | Propósito | Estado actual |
|---|---|---|
| `~/.claude/tools/router/.mooter-mode.json` | Mode lock (beast/zen/auto). Lido por `inject_context.js` a cada prompt. | **AUSENTE agora** → modo "auto" (default) |
| `~/.claude/tools/router/.frugal-mode.json` | Legacy fallback (seamless migration). | **AUSENTE** |
| `~/.claude/tools/router/decisions.log` | **Telemetria SSOT.** Todas as classify decisions, arbiter calls, overrides. | 13MB, 38 565 linhas |
| `~/.claude/tools/router/adversarial-history.json` | Arbiter adversarial prompts | presente |
| `~/.claude/tools/router/embedding-cache.jsonl` | Cache de embeddings Ollama | presente |
| `frugal/tools/router/gold-labels.json` | **MOAT.** Labels manualmente curadas p/ classifier. | 596 linhas, 20K |
| `frugal/tools/router/validation-set.json` | **MOAT.** Conjunto de validação (regression gate). | 615 linhas, 24K |
| `frugal/tools/router/patterns.js` | **MOAT.** 114+ regex patterns (ARCH_SIGNALS, HIGH_RISK, etc). | 14 008 bytes, 18-Apr |
| `frugal/tools/router/router-tuning.json` | Backtest-derived tuning suggestions | presente em runtime (395 bytes, actualizado 07:29 hoje) |
| `frugal/tools/router/model-catalog.json` | Catálogo de modelos (mapping tier→model) | 21 linhas |
| `frugal/tools/router/model-intelligence.json` | Metadata + performance por modelo | 709 linhas |
| `frugal/tools/router/model-profile.json` | Perfil seleccionado (budget/balanced/quality) | 256 linhas |
| `frugal/tools/router/mooter-tester-focus.json` | **Focus config** do continuous tester (autopilot + 6 pillars) | 573 linhas, v3.0 |
| `frugal/tools/router/mooter-tester-backlog.json` | Backlog que o tester gera entre reviews | 832 linhas |
| `frugal/tools/router/mooter-tester-stats.json` | Stats acumulados do tester | 118 linhas |
| `frugal/tools/router/mooter-review-state.json` | Watermark do último `/mooter-review` | 132 linhas |
| `frugal/tools/router/version.json` | **SSOT da versão** do mooter (hoje `v0.10.0`) | 7 linhas |
| `frugal/tools/router/mooter-quality-matrix.json` | (declarado) quality matrix | **0 bytes — suspeito** |

### 1.6 Beast mode — accionamento técnico
**CLI:** `node ~/.claude/tools/router/mooter-mode.js beast` (ou `/mooter-beast` skill)
**Ficheiro escrito:** `~/.claude/tools/router/.mooter-mode.json` com `{mode: "beast", active_since: "..."}`
**Leitura pelo classifier:** em `~/.claude/tools/router/inject_context.js` linhas 782–830, função `applyActiveMode()`:

```js
if (activeMode === 'beast') {
  decision.tier = 'T3';
  decision.max_tier = 'T3';
  decision.escalation_rule = 'beast_mode';
}
if (activeMode === 'zen') {
  // cap at T1 unless T3-gate (push/merge/deploy/release/migration)
  if (currentIdx > 1) decision.tier = 'T1';
}
```

**Schema union** (fix Sprint A / F5.1): aceita `{mode: "beast"}` (string, novo) **OU** `{beast_mode: true}` (flag, legacy de `mooter-autopilot.js`). Audit #34 identificou esta fork; Sprint A alinhou-a.
**Desactivação:** `node mooter-mode.js auto` (remove o ficheiro → default behaviour).

---

## SEÇÃO 2 — SKILLS INSTALADOS (`~/.claude/skills/`)

**Total observado:** ≥150 skills. Categorizados abaixo.

### 2.1 Mooter-specific (essenciais, fluxo canónico)
| Skill | SKILL.md path | Descrição (1ª linha) | Tipo |
|---|---|---|---|
| `mooter-auto` | `~/.claude/skills/mooter-auto/SKILL.md` | Clears any active mooter/frugal mode and returns to intelligent auto-routing. | **essencial** |
| `mooter-beast` | `~/.claude/skills/mooter-beast/SKILL.md` | Activates Beast Mode: forces T3 (Opus) on all subsequent prompts. | **essencial** |
| `mooter-zen` | `~/.claude/skills/mooter-zen/SKILL.md` | Activates Zen Mode: caps all prompts at T1 (Haiku/Ollama). | **essencial** |
| `mooter-dashboard` | `~/.claude/skills/mooter-dashboard/SKILL.md` | Opens the mooter local dashboard (localhost:7820). | útil |
| `mooter-hello` | `~/.claude/skills/mooter-hello/SKILL.md` | Welcome check. | raramente |
| `mooter-route` | `~/.claude/skills/mooter-route/SKILL.md` | Classifies any task/prompt and explains which tier. | útil |
| `mooter-savings` | `~/.claude/skills/mooter-savings/SKILL.md` | Detailed savings report. | útil |
| `mooter-status` | `~/.claude/skills/mooter-status/SKILL.md` | Live status of the mooter router. | útil |
| `mooter-update` | `~/.claude/skills/mooter-update/SKILL.md` | Pulls latest classifier, runs backtest, syncs runtime, push hub. | **essencial** |
| `mooter-review` | `~/.claude/skills/mooter-review/SKILL.md` | Delta-based review of continuous tester findings (watermark). | **essencial** (fluxo self-healing) |
| `mooter-focus` | `~/.claude/skills/mooter-focus/SKILL.md` | Set/show/reset tester's directed focus theme. | **essencial** (directed tester) |
| `mooter-summary` | `~/.claude/skills/mooter-summary/SKILL.md` | Intelligence Dashboard v2 (real-usage savings, tester lab metrics). | útil |

### 2.2 Frugal-* (DEPRECATED redirects — mantidos para compat)
`frugal-auto, frugal-beast, frugal-dashboard, frugal-hello, frugal-route, frugal-savings, frugal-status, frugal-summary, frugal-update, frugal-zen` — todos descrevem "DEPRECATED — redirects to /mooter-* equivalent".

### 2.3 GSD skills (70+) — namespace genérico do Paulo
`gsd-add-backlog, gsd-add-phase, gsd-add-tests, gsd-add-todo, gsd-ai-integration-phase, gsd-analyze-dependencies, gsd-audit-fix, gsd-audit-milestone, gsd-audit-uat, gsd-autonomous, gsd-check-todos, gsd-cleanup, gsd-code-review, gsd-code-review-fix, gsd-complete-milestone, gsd-debug, gsd-discuss-phase, gsd-do, gsd-docs-update, gsd-eval-review, gsd-execute-phase, gsd-explore, gsd-extract_learnings, gsd-fast, gsd-forensics, gsd-from-gsd2, gsd-graphify, gsd-health, gsd-help, gsd-import, gsd-inbox, gsd-insert-phase, gsd-intel, gsd-join-discord, gsd-list-phase-assumptions, gsd-list-workspaces, gsd-manager, gsd-map-codebase, gsd-milestone-summary, gsd-new-milestone, gsd-new-project, gsd-new-workspace, gsd-next, gsd-note, gsd-pause-work, gsd-plan-milestone-gaps, gsd-plan-phase, gsd-plant-seed, gsd-pr-branch, gsd-profile-user, gsd-progress, gsd-quick, gsd-reapply-patches, gsd-remove-phase, gsd-remove-workspace, gsd-research-phase, gsd-resume-work, gsd-review, gsd-review-backlog, gsd-scan, gsd-secure-phase, gsd-session-report, gsd-set-profile, gsd-settings, gsd-ship, gsd-sketch, gsd-sketch-wrap-up, gsd-spec-phase, gsd-spike, gsd-spike-wrap-up, gsd-stats, gsd-thread, gsd-ui-phase, gsd-ui-review, gsd-undo, gsd-validate-phase, gsd-verify-work, gsd-workstreams`

### 2.4 Outros (híbridos / globais)
| Skill | Tipo |
|---|---|
| `model-router` | Essencial — skill público para o user invocar `/router` |
| `varlock` | Genérico — secrets management |
| `systematic-debugging` | Genérico — debugging methodology |
| `claude-api` | Genérico — SDK Anthropic |
| `update-config`, `keybindings-help`, `simplify`, `fewer-permission-prompts`, `loop`, `schedule` | Harness/infra |
| Vercel plugin skills: `vercel:ai-sdk, vercel:ai-gateway, vercel:nextjs, vercel:deploy, vercel:env, vercel:vercel-cli, ...` (~20) | Vercel-specific, injectados pelo plugin |
| `auth-app-redesign, cert-audit, landing-redesign, platform-audit, statusline-redesign` | **Project-level skills** (frugal/skills/) |

### 2.5 Project skills (`frugal/skills/`)
Subdirectorias presentes: `frugal-auto, frugal-beast, frugal-dashboard, frugal-doctor, frugal-hello, frugal-route, frugal-savings, frugal-status, frugal-summary, frugal-update, frugal-zen, model-router, mooter-bad, mooter-feedback, mooter-good, mooter-review`. **Divergem do estado de `~/.claude/skills/`** — ver PONTOS DE ATENÇÃO.

---

## SEÇÃO 3 — COMANDOS SLASH CUSTOMIZADOS

**Nota importante:** a maioria dos `/mooter-*` não são slash-commands `.claude/commands/*.md` — são **skills**. Os `/frugal-*` antigos eram commands; após rebrand migraram para skills (directoria acima).

### 3.1 Commands user-level (`~/.claude/commands/`)
| Command | Path | Função |
|---|---|---|
| `/frugal-hello` | `~/.claude/commands/frugal-hello.md` | Welcome check (legacy pre-skill) |

### 3.2 Commands project-level (`frugal/.claude/commands/`)
| Command | Path | Função (1 frase) |
|---|---|---|
| `/auth-app-redesign` | `frugal/.claude/commands/auth-app-redesign.md` | Master prompt — Mooter Auth + App Area Redesign + Infra Check |
| `/cert-audit` | `frugal/.claude/commands/cert-audit.md` | Claude Certified Architect Foundations Audit |
| `/landing-redesign` | `frugal/.claude/commands/landing-redesign.md` | Mooter Landing Redesign (warm beige) |
| `/platform-audit` | `frugal/.claude/commands/platform-audit.md` | mooter.ai Platform Audit v3 |
| `/statusline-redesign` | `frugal/.claude/commands/statusline-redesign.md` | Statusline v2.0 "Badge, not Dashboard" |

### 3.3 /mooter-* e /frugal-* (skills, não commands)
Ver Secção 2.1/2.2. Principais canónicos: `/mooter-auto, /mooter-beast, /mooter-zen, /mooter-route, /mooter-savings, /mooter-status, /mooter-update, /mooter-review, /mooter-focus, /mooter-summary, /mooter-dashboard, /mooter-hello`.

### 3.4 Sync com Notion
**Não existe slash-command dedicado** para Notion sync. A sincronização é **doutrinal** (ver "PROTOCOLO NOTION" em `frugal/CLAUDE.md`, linhas ~200–240): no fim de cada sessão, Claude **deve** criar página no Notion HQ + actualizar SYNC.md. Mecanismo manual, não automatizado.

---

## SEÇÃO 4 — MCPs CONECTADOS

**Config path:** registo dentro de `~/.claude.json` (user-level). Verificado via `claude mcp list`.

| # | MCP | Status | Transport | Essencial? |
|---|---|---|---|---|
| 1 | claude.ai Google Drive | ✓ Connected | HTTPS | útil (docs externos) |
| 2 | claude.ai Cloudflare Developer Platform | ✓ Connected | HTTPS | **essencial** (Workers/KV) |
| 3 | claude.ai Context7 | ✓ Connected | HTTPS | **essencial** (docs live) |
| 4 | claude.ai Linear | ✓ Connected | HTTPS | útil (issue tracking) |
| 5 | claude.ai Sentry | ✓ Connected | HTTPS | **essencial** (error monitoring) |
| 6 | claude.ai Figma | ✓ Connected | HTTPS | útil (design) |
| 7 | claude.ai Supabase | ✓ Connected | HTTPS | **essencial** (DB) |
| 8 | claude.ai Canva | ✓ Connected | HTTPS | raramente |
| 9 | claude.ai Notion | ✓ Connected | HTTPS | **essencial** (HQ + session logs) |
| 10 | claude.ai Google Calendar | ✓ Connected | HTTPS | raramente |
| 11 | claude.ai Gmail | ✓ Connected | HTTPS | raramente |
| 12 | claude.ai Microsoft Learn | ✓ Connected | HTTPS | raramente |
| 13 | `filesystem` (local) | ✓ Connected | stdio npx | útil (read-write fora do cwd) |
| 14 | `context7` (local) | ✓ Connected | stdio npx | redundante vs #3 |
| 15 | claude.ai Ahrefs | ! Needs auth | HTTPS | raramente |
| 16 | claude.ai Slack | ! Needs auth | HTTPS | raramente |
| 17 | claude.ai Stripe | ! Needs auth | HTTPS | útil (subs tier) |
| 18 | plugin:vercel:vercel | ! Needs auth | HTTPS | **essencial quando usado** (deploy, logs) |

**14 conectados · 4 a precisar de auth · 2 locais stdio.**
**Config `.mcp.json` do projeto:** existe (mencionado em SYNC.md linha 155) e commitado.

---

## SEÇÃO 5 — DOCKER

### 5.1 `docker ps`
```
CONTAINER ID   IMAGE              COMMAND                  STATUS        PORTS                         NAMES
d54fa99ddb7f   devlikeapro/waha   "/usr/bin/tini ..."      Up 40 hours   0.0.0.0:3000->3000/tcp        waha
```

### 5.2 `docker images` (top-4)
```
devlikeapro/waha:latest                    3GB    767MB
node:20-bookworm-slim                      293MB  74MB
public.ecr.aws/supabase/edge-runtime:1.70  1.11GB 387MB
public.ecr.aws/supabase/edge-runtime:1.73  1.11GB 391MB
```

### 5.3 Relação com Mooter
| Resource | Pertence a Mooter? |
|---|---|
| `waha` container | **NÃO — projeto externo** (WhatsApp HTTP API, possivelmente para outro produto do Paulo) |
| `node:20-bookworm-slim` | Indirecto — base image usada por algumas Vercel/Supabase functions |
| `supabase/edge-runtime:1.70` / `:1.73` | **Sim — Supabase local dev** (Mooter usa Supabase) |

---

## SEÇÃO 6 — NOTION CANONICAL

### 6.1 HQ
- **Mooter HQ page ID:** `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`
- **URL:** https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9
- **MCP registado em `INFRA.md` linha 91** com ID: `82234981-b2d6-4841-a52f-bd7b966bf833`

### 6.2 Páginas canónicas recentes
| Página | URL | Uso |
|---|---|---|
| Auditoria Mooter 2026-04-19 (Sessão #34) | https://www.notion.so/3476f6e42bc481e3b01ed827804a89a6 | Espelho do `AUDIT-MOOTER-2026-04-19.md` |
| Sessão #33 — One-command install | https://www.notion.so/3476f6e42bc48124a4dee39b75c514cb | Log sessão |
| Sessão #32 — Statusline v6.8 | https://www.notion.so/3476f6e42bc4810888e3e64204721c85 | Log sessão |
| Sessão #31 — Statusline v6.7 multi-line | https://www.notion.so/3476f6e42bc48132814cd4fbdbafa7af | Log sessão |
| Claude Certified Architect (Sessão #29) | https://www.notion.so/3466f6e42bc481dfbe28fad9a9e71d33 | Certificação |
| MacBook Install Playbook | https://www.notion.so/3446f6e42bc48156a7a7fab59fa87ac5 | Setup guide |

### 6.3 Última página actualizada (inferido)
Dentro do SYNC.md, a referência mais recente é **Sessão #34 — Auditoria Mooter 2026-04-19** (linha 226). Timestamp ~2026-04-19 late.

### 6.4 Source-of-truth em caso de conflito código ↔ Notion
- **SYNC.md é canónico.** Linha 3 do SYNC.md declara-o explicitamente.
- Notion HQ é **espelho** (session logs, decisões narrativas) — não é SSOT para código ou métricas.
- Quando Notion e SYNC.md divergem → **SYNC.md ganha**, Notion deve ser actualizado.
- Código `frugal/tools/router/version.json` é SSOT para a versão do mooter (hoje `0.10.0`).

---

## SEÇÃO 7 — HARDWARE E AMBIENTE

### 7.1 GPU (nvidia-smi)
- **Modelo:** NVIDIA GeForce RTX 4090 (WDDM, Windows driver)
- **Driver:** 595.97 · **CUDA:** 13.2
- **VRAM:** 22 339 MiB usada / 24 564 MiB total → **~2.2 GB livre**
- **GPU util:** 13% · **Temp:** 44 °C · **Power:** 27 W / 477 W max
- **Processo dominante:** `ollama.exe` (PID 10272) — consome ~20 GB VRAM (um modelo carregado residente)

### 7.2 Ollama (`ollama list`)
```
qwen2.5-coder:7b         4.7 GB   3 days ago
qwen2.5-coder:14b        9.0 GB   5 days ago
nomic-embed-text:latest  274 MB   5 days ago
gemma4:e4b               9.6 GB   6 days ago
deepseek-r1:7b           4.7 GB   7 days ago
gemma3:12b               8.1 GB   7 days ago
qwen2.5:3b               1.9 GB   2 weeks ago
qwen3:30b                18 GB    4 weeks ago
```
**8 modelos · total disco ~56 GB · Ollama a correr (3 processos `ollama.exe` visíveis)**

### 7.3 Runtimes
| Componente | Versão |
|---|---|
| Node.js | v24.14.0 |
| Python | 3.12.10 |
| PowerShell | 5.1.26100.8115 (Windows PowerShell; não PS7) |
| WSL2 | Instalado (default distro: `docker-desktop`, versão 2) |

---

## SEÇÃO 8 — ESTRUTURA DO REPO

### 8.1 Top-level (`C:\Users\Paulo Loureiro\frugal\`)
```
agents/                        # Agents overrides do projeto (6 agents espelhados de ~/.claude/agents)
dashboard/                     # Next.js dashboard (node_modules presente)
docs/                          # 40+ docs (MASTER_PROMPTS, MP-*, ARCHITECTURE)
hub/                           # Cloudflare Worker (wrangler.toml, jobs, routes, migrations)
landing/                       # Next.js landing (mooter.ai)
mooter-design-updated/         # ⚠️ UNTRACKED (git status)
mooter-package/                # npm package stub (@mooter/cli)
output/                        # artefactos (whitepaper.md, PDFs)
prompts/                       # prompt templates (setup guides, audit)
reports/                       # session reports
scripts/                       # build/install scripts
skills/                        # project skills (16 dirs; DIVERGE de ~/.claude/skills)
tests/                         # test fixtures
tools/router/                  # ⭐ CORE — classifier + arbiter + telemetry (95+ ficheiros)
vscode-extension/              # VS Code ext companion
+ top-level .md files:
  README.md, SYNC.md (SSOT), INFRA.md, CLAUDE.md, CHANGELOG.md, ROADMAP.md,
  ARCHITECTURE.md, ARCHITECTURE_PRIVATE.md, AUDIT_CCA.md,
  AUDIT-MOOTER-2026-04-19.md, NOTICE.md, PRIVACY.md, SECURITY.md,
  CONTRIBUTING.md, LICENSE, CLAUDE.md.template
+ installers: install.sh, install.ps1, install-legacy.sh, install-legacy.ps1, uninstall.sh
+ workspace: frugal.code-workspace
+ decks: frugal-investor-deck.pptx, frugal-investor-deck-v2.pptx
```

### 8.2 `tools/router/` — core inventory (~95 ficheiros)
Principais (agrupados por função):
- **Classifier:** `classify.js` (+ `.bak`, `.sync-bak`), `patterns.js` (+ `.sync-bak`), `arbiter.js` (+ `.bak`, `.sync-bak`)
- **Hook runtime:** `inject_context.js`, `frugal-turn-header.js` (em `~/.claude/hooks/`)
- **Telemetry:** `decisions.log` (13MB), `event-builder.js`, `savings-tracker.js`, `update-metrics.js`
- **Mode management:** `mooter-mode.js` (v0.9+), `frugal-mode.js` (legacy alias)
- **Autopilot/Tester:** `mooter-autopilot.js`, `mooter-continuous-tester.js`, `mooter-focus.js`, `mooter-dashboard.js`, `mooter-review.js`
- **Hub sync:** `hub-pull.js`, `hub-push.js`, `hub-status.js`, `hub-submit-events.js`
- **Moat files (JSON):** `gold-labels.json`, `validation-set.json`, `model-catalog.json`, `model-intelligence.json`, `model-profile.json`, `router-tuning.json` (runtime only), `mooter-quality-matrix.json` (0 bytes!)
- **Tests:** `classify.test.js`, `classify-branches.test.js`, `classify-retry.test.js`, `backtest.test.js`, `env.test.js`, `sanitize.test.js`, `validation-set.test.js`, `prompt-optimizer.test.js`, `shadow-mode.test.js`
- **CLI launchers:** `mooter.cmd`, `mooter.ps1`, `install-mooter.ps1`
- **Config/infra:** `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `types.d.ts`, `env.js`

### 8.3 Moat file sizes
| Ficheiro | Linhas | Bytes |
|---|--:|--:|
| `gold-labels.json` | 596 | 20K |
| `validation-set.json` | 615 | 24K |
| `model-intelligence.json` | 709 | ~28K |
| `model-profile.json` | 256 | — |
| `patterns.js` | — | 14 008 |
| `mooter-tester-backlog.json` | 832 | — |
| `mooter-tester-focus.json` | 573 | — |
| `decisions.log` (runtime) | 38 565 | 13 MB |

---

## SEÇÃO 9 — TERMINAIS E SHELLS ATIVOS

### 9.1 Processos observados
- **Ollama:** 3 processos (`ollama app.exe` PID 42616, `ollama.exe` PIDs 21580, 10272 [model residente], 47052)
- **Node.exe:** ≥25 instâncias (mix de hooks, tests leaked, MCP servers, continuous tester?)
- **Claude Code:** não consegui isolar por nome (todos aparecem como `node.exe`); pelo menos **1 sessão activa** (esta, PID do bash 360977)

### 9.2 Background bash shells — leaked de sessões passadas
Confirmados por `ps -ef`:
| PID | Data | Comando | Recomendação |
|---|---|---|---|
| 834 | **Apr 17** (4 dias) | `until curl -sS mooter.ai \| grep eymtobwinevywmmlmxqa; do sleep 15; done` | **Morto — terminar** (poll infinito de um deploy antigo) |
| 55448, 55698, 55728, 55757, 56036, 56153, 56358, 56452 | Apr 18 (3 dias) | `npm test` / `node --test classify*.test.js` (loops de teste antigos) | **Terminar — leak de sessões antigas** |
| 58683, 58760, 58813 | Apr 18 | `npm test` variantes | idem |
| 60452, 60576, 60932, 61108, 62024, 62304, 62428, 62784, 62804, 62984, 63772, 63940, 63988, 64140 | Apr 18 | test loops | idem |
| 356694 | **hoje 07:33** | `node --test classify-branches.test.js ...` | Recente; possivelmente ainda útil |
| 360977, 360982 | **hoje 08:09 UTC** | esta sessão (tasklist/grep) | **Deixar viver** |

**Resumo:** há ~20+ shells de Apr 17-18 ainda alive em memória. Não críticos mas consomem RAM. Safe terminar em bloco.

### 9.3 HUD "4 shells"
Os 4 shells referidos no HUD são provavelmente os mais recentes (356694, 360977, + dois invocados nesta sessão). **Nenhum é crítico** — são spawn temporários do bash-tool.

### 9.4 `mooter-continuous-tester`
**Não detectado como processo activo visível.** Nenhum `node.exe` com `mooter-continuous-tester.js` no tasklist. Possível explicação: parado manualmente ou está a correr em background noutro terminal não-claude. **Verificar com `/mooter-review` ou `/mooter-focus` para confirmar estado.**

---

## SEÇÃO 10 — AUDITORIAS RECENTES E BUGS CONHECIDOS

### 10.1 Audit Mooter 2026-04-19 (Sessão #34) — 17 findings
Relatório completo: `frugal/AUDIT-MOOTER-2026-04-19.md` · Master prompt: `frugal/docs/AUDIT-MASTERPROMPT.md`

**Severidade:** 3 CRITICAL · 6 HIGH · 5 MEDIUM · 3 LOW

**3 CRITICAL:**
1. **Mode schema fork** — `mooter-mode.js` escreve `{mode:"beast"}`, `mooter-autopilot.js` escreve `{beast_mode:true}`. Statusline lê bool (mostra BEAST on), `inject_context.js` lia só string (não aplicava T3). **Fix Sprint A (commit `0cdf73f`) — union schema agora aceita ambos.**
2. **Triple-location file drift** — 8 ficheiros × 3 cópias: `~/.claude/tools/router/`, `~/.claude/hooks/`, `frugal/tools/router/`. Edits no repo não propagavam ao runtime. **Fix Sprint B (commit `0a9d05c`) — canonical path declarado + `sync-to-runtime.sh` + `.sync-bak` marker.**
3. **Arbiter metrics zero-on-restart** — 80 arbiter_call events em decisions.log mas `/metrics` reportava 0. **Fix Sprint C (commit `028a0ea`) — metrics honesty.**

### 10.2 Commits Sprint A–D (HEAD → base)
| Commit | Sprint | Âmbito |
|---|---|---|
| `4d60d9f` | Sprint D | reviewer follow-ups |
| `028a0ea` | Sprint C | metrics honesty |
| `0a9d05c` | Sprint B | canonical + spec + DRY |
| `0cdf73f` | Sprint A | 3 CRITICAL + quick wins |
| `fc2c991` | (pré-audit) | mooter-landing cleanup + Vercel flag |

### 10.3 Side-findings não-documentados

**[NOVO — detectado nesta sessão 2026-04-21]** Runtime missing `mooter-mode.js` shim
- **Sintoma:** durante `/mooter-auto`, o shim `~/.claude/tools/router/frugal-mode.js` falhava com `Cannot find module './mooter-mode.js'`.
- **Raiz:** `frugal-mode.js` delega via `require('./mooter-mode.js')`, mas o ficheiro **não existia** em `~/.claude/tools/router/` (existia em `frugal/tools/router/`, nunca foi sincronizado).
- **Fix aplicado manualmente:** copiado de `frugal/tools/router/mooter-mode.js` → `~/.claude/tools/router/mooter-mode.js`. Timestamp do ficheiro runtime agora: `Apr 21 08:06`.
- **Follow-up sugerido:**
  1. Commit: garantir que `scripts/install.*` e `sync-to-runtime.sh` incluem `mooter-mode.js` na lista de ficheiros a sincronizar (Sprint B canonical list).
  2. Regression test: validar `/mooter-auto` `/mooter-beast` `/mooter-zen` a partir de uma install fresca sem o ficheiro runtime.
- **Impacto:** qualquer user com install antes deste fix terá `/mooter-auto` partido silenciosamente.

### 10.4 Outros quirks conhecidos
- `mooter-quality-matrix.json` **tem 0 bytes** — seeded vazio? Esperado? Verificar uso.
- `frugal/tools/router/mooter-tester-focus.json` declara 6 pillars + autopilot — mas o tester não está visível como processo activo. Divergência intent vs estado.
- Múltiplos `.sync-bak` files em `~/.claude/tools/router/` — artefactos do Sprint B; não limpos.
- `~/.claude/tools/router/classify.js.bak2` — duplo-backup sugere retry durante Sprint A.

---

## PONTOS DE ATENÇÃO

### Duplicações / divergências
1. **`frugal/skills/` vs `~/.claude/skills/`** — ambos contêm skills mooter-*. Os do projeto (`frugal/skills/mooter-bad`, `mooter-feedback`, `mooter-good`) **não existem em `~/.claude/skills/`**. Parece namespace de escrita de feedback, mas não consigo confirmar invocação activa. **Risco: skills órfãos não usados** ou **duplicação deliberada não documentada**.
2. **`frugal/agents/` vs `~/.claude/agents/`** — 6 agents espelhados. Se o projeto override ficar stale, divergência invisível. **Verificar sync.**
3. **Namespace `frugal-*` legacy** — 10 skills DEPRECATED que redirecionam. Limpar pós-audit quando seguro.
4. **Triple-location drift** — foi identificada e fechada na Sprint B, mas os `.sync-bak` ficheiros ficaram. **Cleanup pendente.**

### Contradições
5. **Mode file ausente vs. HUD anterior** — a session anterior mencionou que `.mooter-mode.json` tinha `beast_mode:true`. **Agora está ausente** → modo auto (default). Consistente com `/mooter-auto` ter sido executado. Confirmado.
6. **`mooter-continuous-tester` visão** — doutrina descreve-o como sempre-on, mas não o vejo como processo. **Gap estado declarado vs. estado real.**
7. **Notion "última página" inferida do SYNC.md** — não validei via MCP Notion agora; é possível haver páginas mais recentes não referenciadas em SYNC.md.

### Dependências frágeis
8. **`mooter-mode.js` shim missing** (Secção 10.3) — evidência de que a pipeline install/sync-to-runtime tem buracos. **Frágil em install fresca.**
9. **`mooter-quality-matrix.json` = 0 bytes** — se algo o lê, partirá silenciosamente.
10. **Ollama com 2.2 GB VRAM livre** — pouco headroom; um modelo novo carregado causa OOM ou swap.
11. **13MB em `decisions.log`** sem rotação visível — vai crescer. Verificar `rotate-logs.js`.

### Skills / MCPs órfãos
12. `claude.ai Canva`, `Ahrefs`, `Google Calendar`, `Gmail`, `Microsoft Learn` — conectados mas **não vi uso activo em nenhuma sessão recente do SYNC.md**. Potencialmente removíveis para reduzir surface.
13. Skills `mooter-bad`, `mooter-good`, `mooter-feedback` em `frugal/skills/` — sem invocação detectada.

### Gaps código ↔ Notion
14. SYNC.md linha 506 lista 3 páginas Notion de Sessão #25/26/26v2.1, mas **não há entry para Sessão #30 (Mooter Performance B4)** nos links da secção `## 🔗 Links`. Assimetria.
15. `AUDIT_CCA.md` existe no repo; não é óbvio se há página Notion espelho.

### Riscos detectados
16. **`mooter-design-updated/` untracked** — está no `git status` mas não adicionado nem ignorado. **Decidir: commit, gitignore, ou delete.**
17. **~20 shells leaked** desde Apr 17/18 — memory creep. Safe matar em bloco.
18. **Sessão com `M tools/router/mooter-continuous-tester.js` + `M tools/router/mooter-review.js` uncommitted** — work-in-progress não persistido. Se sessão crashar agora, perde-se.
19. **Branch `main` é também a working branch** — sem feature-branch actualmente. Commits audit Sprint A-D foram directamente a main.

---

## SUMMARY (10 linhas)

1. SYNC.md canónico em `C:\Users\Paulo Loureiro\frugal\SYNC.md` (50KB, 745 linhas, 30+ seções).
2. `final-reviewer` agent em `~/.claude/agents/final-reviewer.md` — model:opus, gate obrigatório pré-push/merge/deploy.
3. Beast/Zen/Auto mode accionado via `mooter-mode.js` → `.mooter-mode.json` (agora AUSENTE → modo auto) lido por `inject_context.js:782-830`.
4. Skills: 12 mooter-* essenciais + 10 frugal-* DEPRECATED + 70+ gsd-* + ~20 vercel:* + genéricos. Commands: só 1 no user level, 5 no projeto.
5. MCPs: 14 connected (Notion, Supabase, Sentry, Cloudflare, Context7, Figma, Linear essenciais) + 4 needing auth (Vercel, Stripe, Slack, Ahrefs).
6. Docker: 1 container live (`waha`, não-Mooter), imagens Supabase edge-runtime.
7. Hardware: RTX 4090 (2.2GB VRAM livre), 8 Ollama models (~56GB), Node 24, Python 3.12, WSL2.
8. Audit #34: 17 findings (3 CRIT/6 HI/5 MED/3 LOW), fechados via Sprint A-D (4 commits `0cdf73f…4d60d9f`).
9. **Side-finding novo:** runtime `~/.claude/tools/router/mooter-mode.js` estava em falta; sincronizado manualmente esta sessão. Follow-up para /mooter-auto-capable em fresh install.
10. Riscos top: `mooter-design-updated/` untracked, 2 working-changes não-commit, 20+ shells leaked, `mooter-quality-matrix.json` 0 bytes, `frugal/skills` diverge de `~/.claude/skills`.
