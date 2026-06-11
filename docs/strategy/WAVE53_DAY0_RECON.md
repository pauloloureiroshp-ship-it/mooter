# WAVE 53 — Day-0 Recon Report

> **Status:** Phase 0 gate complete · read-only · **STOP→re-scope** decidido pelo Paulo (2026-06-10).
> **Branch:** `wave53-local-cc-mirror` @ `/mnt/c/Users/Paulo Loureiro/frugal-wave53`
> **Método:** evidência directa (inline) + 9 agentes de verificação adversarial em paralelo (`wf_e7469ba7-e55`, 88 tool-uses). Cada claim tem `source` ao nível `file:line`.
> **Companhia:** [[REFUTATIONS_LOG.md]] (R1–R7 + paths) · [[WAVE53_BRIEF_V3.md]] (phases re-scoped).

---

## 0. Sanidade / sha sagrada

| Item | Comando | Resultado |
|---|---|---|
| `classify.js` sha256 | `sha256sum tools/router/classify.js` | ✅ `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — **INTACTA** (== baseline) |
| Worktree limpo | `git status -s` | ✅ clean (`## wave53-local-cc-mirror...origin/main`) |
| Branch | `git branch --show-current` | ✅ `wave53-local-cc-mirror` |
| Main HEAD = Wave Mega + Wave 52 | `git log --oneline` | ✅ `#155` wave52, `#154` mega catch-up, `#147` wave-mega-1 |
| `statusline-multi.js` sha256 | `sha256sum` | `b64ad12d748195a35fe0f4656125786230003c272da114c4578174e614cf61a6` (baseline registado) |
| Sessions infra baseline | `find ~/.mooter/sessions -type d` | `0` (dir não existe) |
| Heartbeats dir | `ls ~/.mooter/orchestration/heartbeats/` | existe, **vazio** |
| Pastor LoRA | `ls ~/.mooter/pastor/` | ausente |

### Achado de topologia (corrige o brief)
- O `~/frugal-wave53` do brief é a **home Linux** (não existe lá). O worktree real está no FS Windows via WSL: **`/mnt/c/Users/Paulo Loureiro/frugal-wave53`** (`git worktree list`).
- **🐂 O binário `mooter` instalado é v1.21.4 (beta)** em `~/.local/bin/mooter` — build global **STALE**, não reflecte este worktree. Produto = `tools/router/version.json` = **1.33.0**; `packages/cli/package.json` = `1.0.0` (id estático de workspace). **Toda a recon via `mooter --help`/`mooter conductor` é não-fiável → verdicts baseados em SOURCE.**

---

## 1. As 7 premissas (verdict + evidência)

> Convenção: **TRUE** = a assunção do Cowork mantém-se. **FALSE** = refutada por evidência. **PARTIAL** = mantém-se em espírito mas o mecanismo/path/detalhe do brief está errado.

### P1 — "Statusline não tem cross-session visibility" → ✅ **TRUE** (high)
- 0 matches de `sister|cross.session|cross_session|sibling` em `statusline-multi.js` (sha `b64ad12d…`, 1619 linhas).
- O único uso de `session_id` é **filtro per-terminal** (o oposto): `statusline-multi.js:200-220` (`if (sessionFilter && evt.session_id !== sessionFilter) continue;`).
- `CHIP_PRIORITY` tem um slot `'sessions'` **reservado mas nunca usado** (`statusline-multi.js:1262`); só `'primary'` (1345) e `'quota'` (1347) são atribuídos a chips reais.
- Nenhum módulo line-3 sister/cross/peer existe (lista de 20 módulos: `statusline-multi.js:1226-1237`).
- **Impacto:** greenfield legítimo. Integração barata pré-existente: slot `priority:'sessions'` + mecanismo line-3 (módulos try/catch-isolados). **NÃO** relaxar o filtro per-session (200-220) — adicionar fonte de discovery dedicada.

### P2 — "Bash não mostra modelo + tokens em tempo real" → 🟡 **PARTIAL** (high)
- `post_tool_badge.js` é hook **PostToolUse** em `Bash|Agent|Task` (`settings.json:66-73`) → corre por cada Bash.
- **Modelo+tier JÁ são mostrados por Bash:** `buildPostToolBadge` devolve ex. `🐂 ☁ sonnet T2 · via model-architect` (`post_tool_badge.js:4-7,70-86,256-257`). → metade "modelo" **REFUTADA**.
- **Tokens NÃO** são mostrados: o badge carrega `{ model, subagent, tier }`, "NOT per-tool latency or cost" (`post_tool_badge.js:13-16`). `token_tracker.syncFromTranscript` só alimenta o cache que a **statusline** lê (`post_tool_badge.js:259-261`). → metade "tokens" **mantém-se**.
- `exec-logger.js:199-214` loga `model=… role=…` (sem tokens, e para ficheiro). `frugal-turn-header.js` é UserPromptSubmit (1×/turn, não por Bash).
- PreToolUse `Bash` existente = só `conductor-autolock.js` lock (`settings.json:54-64`).
- **Impacto:** valor real da Phase C é **só tokens**; re-mostrar modelo/tier duplicaria o badge. PreToolUse corre *antes* do comando → nunca sabe tokens reais. Tocar `settings.json` = config partilhada → T3 + ask-first.

### P3 — "Sem paridade /agents /memory /init; 8 comandos /moo-* (Wave 32)" → ✅ **TRUE** (high)
- Existem **exactamente 8** skills `/moo-*`, com teste "no stragglers": `EXPECTED = [moo-workflow, moo-effort, moo-herd, moo-dashboard, moo-status, moo-distill, moo-pack, moo-help]` (`tools/router/moo-skills.test.js:11`, assert `:38-41`).
- **Nenhuma** é parity-alias: nenhuma é agents/memory/init. `moo-agents|moo-memory|moo-init` → **0 hits** em todo o repo.
- `slash-commands.ts` NÃO é o namespace `/moo-*` — é o instalador da skill única `/mooter` (sub-args `route|savings|explain|digest|local|why-not-fable|tier|mcp|vision|bench`) (`packages/cli/src/commands/slash-commands.ts:24,28-62`; `index.ts:46,81,356-360`). **Duas superfícies distintas.**
- **Impacto:** Phase E é **ADITIVA** (criar skills novas), não aliasing. Update obrigatório de `moo-skills.test.js` (EXPECTED 8→11 + assert) ou a suite parte.

### P4 — "Sem guia de emojis canónico" → ✅ **TRUE** (high)
- `find -iname "*emoji*"` → 0 ficheiros. Sem `EMOJI_GUIDE.md`, sem `tools/lint/`.
- Hits de "emoji" são incidentais (master-prompts arquivados; `docs/TWO-TERMINALS.md:182` "Zero emoji em código").
- **Impacto:** Phase D net-new. `docs/` existe; `tools/lint/` precisa de `mkdir -p`. Reconciliar com `model-profile.json` (campo `emoji`) e a regra "zero emoji em código".

### P5 — "Conductor não vê sessões cross-worktree" → ❌ **FALSE** (high)
- `heartbeatsDir()` resolve de `homedir()`/`MOOTER_HOME` → **um dir global** `~/.mooter/orchestration/heartbeats`, partilhado por todos os worktrees (`packages/worktree-conductor/src/paths.ts:8-22`).
- `listHeartbeats()` **já** faz `readdirSync(heartbeatsDir(home))` e parseia todos (`heartbeat.ts:59-76`).
- `worktree_path` **já** é campo do tipo `Heartbeat`, escrito por `writeHeartbeat` (`types.ts:19`, `heartbeat.ts:24,37`); produção usa `opts.cwd ?? process.cwd()` (`commands.ts:62,197`).
- `conductor.status()` **já** agrega em live/stale (`conductor.ts:49-59`); **teste passa** com 2 cwds distintos em `status().liveSessions` (`tests/worktree-conductor.test.ts:149-158`).
- **Impacto:** Phase A.1 (criar `packages/cli/src/conductor/discovery.ts` + novo `HeartbeatRecord`) **duplica código testado**. → reutilizar `listHeartbeats()`/`status()` + tipo `Heartbeat`.

### P6 — "MooterBench RESULTS.json existe c/ accuracy (Wave Mega P1)" → ❌ **FALSE** (high)
- `packages/mooter-bench/` tem `Dockerfile, LICENSE, README.md, dataset/, src/, tests/, package.json` — **sem RESULTS.json**.
- Bench é **stdout-only**: `run.ts` emite via `console.log` (`:192-211`); **0** `writeFile/fs.` em `src/`. Nunca produz artefacto.
- README "60.0% / savings 62.4%" é snapshot **escrito à mão** em markdown (`README.md:42-72`).
- Wave Mega Day-0 confirma ausência (`.planning/wave-mega-50-51/WAVE_MEGA_DAY0_RECON.md:21`); a alegação "criado por Wave Mega P1" não tem suporte nos artefactos.
- `mooter explain bench` ainda não existe; o chip MLWR análogo já usa fallback honesto "no snapshot yet" (`explain.ts:168-170`).
- **Impacto:** Phase H tem de usar fallback `?` (anti-fabricação). Número real exige `writeFile` em `run.ts` ou invocar bench live — **fora de scope** desta wave (Decisão 4).

### P7 — "CC tem /agents /memory /init (+/mcp /compact /clear /help /plan)" → 🟡 **PARTIAL** (high)
- `/agents`, `/memory`, `/init`, `/mcp`, `/compact`, `/clear`, `/help` → **7/8 reais** (CC-knowledge + corroborado em `docs/strategy/MOOTER_OPERATIONS.md:566`, `~/.claude/CLAUDE.md`).
- **`/plan` NÃO é slash command** em CC oficial — Plan Mode é Shift+Tab / `ExitPlanMode` tool.
- **Impacto:** alvo de paridade válido para os 7; **remover `/plan`** da matriz (Decisão EXTRA).

---

## 2. Findings de path / release

### PATH-phaseA-C-I-files → ❌ **FALSE** (high) — quase todos os paths do brief estão errados
- `packages/cli/src/` só tem: `audit/, cascading/, commands/, fable-observe/, observability/, sync/` (+ `consent.ts, index.ts, packs.ts`). **Não existem** `conductor/, sessions/, wrappers/, cca-f/`.
- Mapeamento real:
  - A.1 discovery → **`packages/sessions-orchestrator/src/discovery.ts`** (o único `discovery.ts`; o "vs worktree-conductor" do brief também está errado).
  - A.4 heartbeat → **`packages/worktree-conductor/src/heartbeat.ts`**.
  - C.1 bash wrapper → **não existe nada** (`wrappers/` ausente; sem `wrapBash/bashWrapper`). Greenfield.
  - I.1 schema → subsistema chama-se **`fable-observe`** (`packages/cli/src/fable-observe/schema.ts` existe); token `cca-f` → **0 hits** em `cli/src`.
  - E.1 → **`packages/cli/src/commands/slash-commands.ts`** (hífen), não `slash_aliases.ts`.
- `mooter route-hint` subcommand → **0 hits** (não existe).
- Runtime `~/.mooter/sessions/` e `~/.mooter/cca-f/` → **ausentes** (criar como recursos novos, não preconditions).

### PATH-version-release → ✅ **TRUE** (high) — mas o alvo do bump está errado no brief
- `packages/cli/package.json` = `1.0.0` (id estático de workspace, **não a versão de release**).
- **Source-of-truth = `tools/router/version.json`** = `{version:"1.33.0", released:"2026-06-10", channel:"beta"}`; auto-bumped por `.github/workflows/version-sync.yml` no push da tag.
- `CHANGELOG.md` existe (root) mas o topo é `[1.15.0]` (lag) — informativo, não lido por código.
- HEAD tagged `v1.33.0-wave-mega-self-evolving`; binário v1.21.4 é release anterior (`SYNC.md:40-41`).
- Consumidores de `version.json`: `classify.js:82`, `gsd-statusline.js:191-192`, `frugal-doctor.js:417`, etc.
- **Impacto Phase F.2:** bump via tag `v1.34.0` (CI escreve `version.json`) **ou** editar só `tools/router/version.json`. **Não tocar** em package.json. Entrada `[1.34.0]` no CHANGELOG (provenance humano).

---

## 3. Honesty constraint do schema real (crítico p/ Phase A)

O `Heartbeat` real (`packages/worktree-conductor/src/types.ts:16-27`) tem **apenas**:
`session_id, terminal_name, worktree_path, branch, intent, last_heartbeat, last_heartbeat_ms, active_locks, pending_intents, pid`.

→ **NÃO** tem `model_active`, `tier_active`, `calls_total`, `tokens_total`, `saved_usd`, `saved_pct` (que o `HeartbeatRecord` do brief inventava). O mockup `mooter sessions discover` a mostrar `opus-4.6 T3 57 calls $0.33 saved` por sister **NÃO tem dados** → o chip cross-session mostra só campos reais (branch, terminal, idade). `STALE_MS = 30000` (`heartbeat.ts:14`) é o limiar canónico live/dead. Heartbeats são escritos pelo poll da própria sessão (**sem daemon**) → chip honestamente silencioso quando não há peers.

---

## 4. Gate decision

| Métrica | Valor |
|---|---|
| Premissas hard-FALSE | **2/7** (P5, P6) |
| Premissas PARTIAL | **2/7** (P2, P7) |
| Premissas TRUE | **3/7** (P1, P3, P4) |
| Path findings FALSE | 1 (paths A/C/E/I quase todos errados) |

Limiar literal "≥4/7 FALSE" **não** batido (2 hard-FALSE), mas os erros de path + 2 PARTIAL + duplicação de código testado (P5) justificam **STOP→re-scope** (doutrina "Honest > Forced").

**Decisão Paulo (2026-06-10): proceder Wave 53 re-scoped.** CC produz `WAVE53_BRIEF_V3.md`. Decisões 1–5 + EXTRA greenlit (ver [[REFUTATIONS_LOG.md]] §Decisões e [[WAVE53_BRIEF_V3.md]]).

---

## 5. Phase re-scope map (resumo — detalhe em WAVE53_BRIEF_V3.md)

| Phase | Brief assumiu | Realidade / acção |
|---|---|---|
| **A** chip cross-session | greenfield | ✅ válido — slot `priority:'sessions'` + módulo line-3 novo `sessions-status.js` |
| **A.1/A.4** discovery/heartbeat | criar em `cli/src/conductor`, `cli/src/sessions` | ♻️ **reutilizar** `worktree-conductor` (`listHeartbeats`/`Heartbeat`); não duplicar |
| **B** statusline chips | — | construir sobre arquitectura de chips existente (módulos try/catch) |
| **C** bash wrapper | `cli/src/wrappers/bash.ts` + settings.json | só **tokens** em `post_tool_badge.js`; **não** mexer settings.json; `tokens?` fallback se indisponível |
| **D** emoji guide | net-new | ✅ válido; `mkdir -p tools/lint`; reconciliar emojis existentes |
| **E** slash parity | aliasar 8 `/moo-*` | **aditivo**: criar `moo-agents/memory/init`; update `moo-skills.test.js` 8→11; `/plan` removido |
| **H** bench chip | citar RESULTS.json | fallback `?` (precedente `explain.ts:169`); número real → Wave 53.x/55 |
| **I** cca-f export | `cli/src/cca-f/` | extender **`fable-observe`** (`cli/src/fable-observe/cca-f-export.ts`) |
| **F** version bump | `packages/cli/package.json` 1.34.0 | tag `v1.34.0` (CI) ou `tools/router/version.json`; CHANGELOG entry |

---

*Gerado por CC (Opus 4.8 1M) · 9-agent adversarial verification · Doctrine V4 9/9.*
