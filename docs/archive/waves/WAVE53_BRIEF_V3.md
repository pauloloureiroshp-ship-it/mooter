# WAVE 53 — Brief V3 (re-scoped on real paths)

> **Origem:** corrige o *Unified Master Prompt* (V2) após [[WAVE53_DAY0_RECON.md]] + [[REFUTATIONS_LOG.md]]. Autor: CC (Opus 4.8 1M), 2026-06-10. Greenlit pelo Paulo (Decisões 1–5 + EXTRA).
> **Branch:** `wave53-local-cc-mirror` @ `/mnt/c/Users/Paulo Loureiro/frugal-wave53`. **Tag alvo:** `v1.34.0-local-cc-mirror`.
> **Invariantes:** `classify.js` sha `427d8c0b…` **intacta**; statusline lines 1-2 **byte-idênticas** (tudo novo = opt-in); selective git adds; PR squash → `dev`; PT-PT docs / inglês código.

---

## Doutrina V4 (resumo operacional)
1. `classify.js` sha sagrada — se mudar, STOP. 2. Honest > Forced. 3. Zero side scope creep. 4. PT-PT docs / inglês código. 5. No fabrication. 6. Statusline byte-idêntica default. 7. Selective git adds. 8. PR squash → dev. 9. Refutações são valiosas.

## Objectivo
Mooter == Local CC Mirror + Anthropic Pride, **sobre a infra real existente** (worktree-conductor, post_tool_badge, fable-observe, line-3 chips), sem duplicar código testado nem fabricar dados.

---

## Phase A′ — Cross-Session Visibility (reutiliza worktree-conductor)

**Refutação aplicada:** P5 FALSE — discovery cross-worktree já existe e é testada. HeartbeatRecord do brief inventava campos.

**A′.1 — Consumir discovery existente (NÃO criar discovery.ts)**
Reutilizar `packages/worktree-conductor`:
- `listHeartbeats(home?)` → `Heartbeat[]` (`heartbeat.ts:59`)
- `isHeartbeatStale(hb, now)` / `STALE_MS = 30000` (`heartbeat.ts:14,78`)
- tipo `Heartbeat` (`types.ts:16-27`) — campos reais: `session_id, terminal_name, worktree_path, branch, intent, last_heartbeat(_ms), active_locks, pending_intents, pid`.

**A′.2 — Chip line-3 `sessions-status.js` (greenfield, opt-in)** ✅ **ESTA SESSÃO**
- Novo `tools/router/sessions-status.js`, padrão `conductor-status.js` (zero-dep CommonJS, pure renderer, `hidden_chips` opt-out, qualquer falha → `''`).
- Lê `~/.mooter/orchestration/heartbeats/*.json` (mesmo dir que o conductor; sibling de `locks/`).
- **Self-exclude** pelo `session_id` actual (passado por `buildLine3` → `statusLine(selfSessionId)`).
- Render só campos reais: `⇄ N sisters (branch Xs · branch Ys)`; live = idade ≤ `STALE_MS`. Cor 🟢/🟡 por frescura. Silencioso quando 0 sisters (sem daemon — só sessões Mooter-aware escrevem heartbeat).
- Wire: adicionar `'./sessions-status.js'` à lista de `buildLine3` (`statusline-multi.js:1226-1237`); usar slot `priority:'sessions'` já reservado (`:1262`). `buildLine3(force, selfSessionId)` + `statusLine(selfSessionId)` — retro-compatível (módulos existentes ignoram o arg).
- Tests: `sessions-status.test.js` (renderer puro: empty→'', self-excluded, live vs stale, formatação de N).

**A′.3 — `mooter sessions discover` CLI (opcional, V3.x)**
Se shipado: consome `listHeartbeats()`; output mostra **só campos reais** (terminal, branch, worktree_path, idade, live/stale). **Sem** colunas model/tier/tokens/$ (não existem no schema). ⚠️ não reescrever o output do brief que fabricava savings.

**A′.4 — Heartbeat write (reutiliza writeHeartbeat)**
Não criar `cli/src/sessions/heartbeat.ts`. Se o CLI precisar de escrever heartbeat, chamar `writeHeartbeat()` (`heartbeat.ts:32`) com os campos reais. Write já é atómico no package.

**Out:** inbox/delegation cross-session (A.5 do V2) → defer Wave 54 (precisa schema novo).

---

## Phase B — Statusline UX (sobre arquitectura de chips existente)
- Cada chip novo = módulo line-3 try/catch-isolado (padrão dos 20 existentes) ou chip com `priority` em `CHIP_PRIORITY`. Todos **opt-in**; lines 1-2 byte-idênticas.
- **B.1 burn-rate / B.3 agent-focus / B.4 ctx-fullness / B.5 pluggable:** só se a fonte de dados for real (token_tracker snapshot já existe; subagent_tracker já existe). Nunca inventar $/h sem dados.
- Reconciliar com `post_tool_badge.js` (modelo/tier já per-Bash) — não duplicar.

---

## Phase C — Bash tokens-only (Decisão 3)
**Refutação aplicada:** P2 PARTIAL — modelo/tier já mostrados por `post_tool_badge.js`.
- **Só tokens.** Estender `tools/router/post_tool_badge.js` para anexar contagem de tokens por tool-use **se e só se** o transcript expõe usage por tool_use de Bash. **Verificar primeiro** — provavelmente não exposto → shipar `tokens?` honest fallback.
- **NÃO** mexer em `~/.claude/settings.json` (config partilhada do harness → T3/ask-first). **NÃO** criar `mooter route-hint`. **NÃO** re-mostrar modelo/tier (duplicaria badge).
- `wrappers/bash.ts` do V2 → **descartado** (path inexistente, duplicaria badge).

---

## Phase D — Emoji Canonical Guide (net-new)
- `docs/EMOJI_GUIDE.md` (`docs/` existe). `mkdir -p tools/lint` antes de `tools/lint/emoji_lint.js`.
- Reconciliar com emojis intencionais existentes: campo `emoji` de `model-profile.json` (statusline por-modelo) + regra "Zero emoji em código" (`docs/TWO-TERMINALS.md:182`). O lint não pode contradizer uso intencional.
- Anti-hype list (🚀🎉💯🤯🔝💎) mantém-se. Linter CI opt-in via `MOOTER_EMOJI_STRICT=1`.

---

## Phase E — Slash CC Parity (aditiva — Decisão 2)
**Refutação aplicada:** P3 — não há `/moo-agents/memory/init`; aliasar apontaria a inexistentes. `/plan` não é slash CC.
- **Criar 3 skills novas** à imagem das 8 (`.claude/skills/moo-{agents,memory,init}/SKILL.md`, name==dir, desc>20 chars, sub-args mapeados a CLI real).
  - `moo-agents` → lista subagents Mooter (model-architect/reasoner/cheap-triage/local-*/final-reviewer/conductor) + status.
  - `moo-memory` → mostra CLAUDE.md (project + global) + MEMORY.md.
  - `moo-init` → scaffolds preferences.json / CLAUDE.md / AGENTS.md.
- **Update obrigatório** `tools/router/moo-skills.test.js`: EXPECTED 8→11 (+ os 3 nomes) e o assert "no stragglers" (`:38-41`).
- **NÃO** sombrear `/agents //memory //init` nativos do CC (collision risk). User vindo do CC aprende `/moo-agents` via convenção já estabelecida.
- Parity matrix: alvo = `/agents //memory //init //mcp //skills //compact //clear //help`. **Sem `/plan`.**

---

## Phase G — Anthropic Reflection Layer
- `docs/strategy/ANTHROPIC_ALIGNMENT_V2.md`: tabela phase → CCA-F domain → doctrine match → evidência **real** (cita ficheiros desta wave). Refutações já em [[REFUTATIONS_LOG.md]].

---

## Phase H — Bench chip honest (Decisão 4)
**Refutação aplicada:** P6 FALSE — RESULTS.json não existe; bench é stdout-only.
- Chip `🧪 bench ?` (fallback) por default — precedente honesto `explain.ts:168-170`. **Nunca** hardcode 60% do README como dados live.
- `mooter explain bench` (se shipado): descreve metodologia + limitações; número só se vier de execução live parseada.
- writeFile RESULTS.json em `bench/run.ts` ou invocação live = **Wave 53.x / 55** (fora de scope).

---

## Phase I — CCA-F export em fable-observe (Decisão 5)
**Refutação aplicada:** subsistema real = `fable-observe`, não `cca-f`.
- `packages/cli/src/fable-observe/cca-f-export.ts` (extende, não cria árvore paralela). Reutilizar `fable-observe/schema.ts` existente.
- `mooter cca-f export` → escreve `~/.mooter/cca-f/export-<date>.jsonl` (criar dir). Privacy: prompts truncados ≤ 50 chars. Domain classifier heurístico determinístico (não-LLM).

---

## Phase F — Final Review + Ship
- **F.1** spawn `final-reviewer` (Opus) — gate SHIP/REWORK/DEFER por phase.
- **F.2** version: **NÃO** editar `packages/cli/package.json`. Bump via tag `v1.34.0` (CI `version-sync.yml` escreve `tools/router/version.json`) ou editar só `version.json`. Entrada `[1.34.0]` em `CHANGELOG.md` (root).
- **F.3** commit selectivo (`git add -p`, nunca `-A`); PR squash → `dev`.

---

## Out of scope (Wave 54+)
- Inbox/delegation cross-session (A.5) · RESULTS.json persist + bench live number · multi-LoRA · MCP marketplace UI · cloud sync sessions · CCA-F audit harness execution.

## Success criteria (corrigidos)
| Critério | Pass |
|---|---|
| `classify.js` sha | `427d8c0b…` intacta |
| Statusline default | lines 1-2 byte-idênticas (line-3 opt-in) |
| Cross-session chip | `sessions-status.js` mostra sisters de heartbeats reais; self-excluded; silencioso se 0; **sem** model/tier/$ fabricados |
| Bash tokens | tokens reais OU `tokens?` honest; **settings.json intocado** |
| Emoji linter | `MOOTER_EMOJI_STRICT=1` exit 0; não contradiz emojis intencionais |
| Slash parity | 3 skills novas; `moo-skills.test.js` EXPECTED=11 verde; sem shadow de nativos |
| Bench chip | `?` fallback quando sem RESULTS.json |
| CCA-F export | em `fable-observe`; prompts ≤ 50 chars |
| Version | `tools/router/version.json`/tag, não package.json |
| Tests | `npm test` 100% |
| Reviewer | SHIP 0-HIGH |

*Doctrine V4 9/9 ✅.*
