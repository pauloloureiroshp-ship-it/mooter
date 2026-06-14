# Refutations Log

## 2026-06-14 — Wave 60 (Cache-Aware + Roster + HW-aware T0) · W60-R1 qwen3-coder-next absent

**Assumption (Master Prompt §4 Wave 60 Block C):** swap `qwen2.5:* → qwen3-coder-next / qwen3-30b` in `model-manager.js`.
**Reality (Day-0 `ollama list`):** `qwen3-coder-next` is NOT installed and is not a known Ollama tag. Best installed coder is `qwen2.5-coder:14b`. `qwen3:30b` IS installed.
**Action:** Cannot hardcode a non-existent model (the brief itself flagged this). Block C target invalid.
**Doctrine line:** "confirmar disponibilidade no Ollama no Day-0 antes de hardcodar".

## 2026-06-14 — Wave 60 · W60-R2 roster not in model-manager.js; general swap already done

**Assumption:** the local roster lives in `model-manager.js` and still uses `qwen2.5:*`.
**Reality:** `model-manager.js` is a management CLI (one stale hint string `ollama pull qwen2.5:3b` at `:268`). The dispatch path already uses `qwen3:30b` (`_model-resolver.js:19,31`, `budget-engine.js:46`). The remaining `qwen2.5:3b` is the T0 **default in FROZEN `classify.js`** (`:162-216`), changeable only via env (`ROUTER_OLLAMA_*`), never by editing the file.
**Action:** **Block C is essentially moot/blocked.** At most fix the stale hint string; no model hardcoding; the real default lives behind a frozen file + env override.
**Doctrine line:** "Honest > brief" · "classify.js FROZEN".

## 2026-06-14 — Wave 60 · W60-R3 hw-capability.json path + presence

**Assumption:** Block D reads `hw-capability.json` (implied under `~/.mooter`), assumed present.
**Reality:** written by `gpu-probe.js` to `~/.claude/tools/router/hw-capability.json` (`:144`), and ONLY when a GPU is detected (`:206`). Absent on this machine now.
**Action:** Block D reads the correct path and degrades gracefully (no fake bias when absent/GPU-less); respects that the local model is already `qwen3:30b`.
**Doctrine line:** "No fabrication".

## 2026-06-14 — Wave 60 · W60-R4 decide-agent.ts wrappable (not editable)

**Assumption (§4):** wrap `decide-agent.ts`, never edit (FROZEN engine).
**Reality (confirmed):** clean interface — `blended_cost` on its result, `blendedCost(in,out)=in+0.3*out`. Block A's NEW `packages/router/src/cache-aware-cost.ts` consumes the result + session context and applies a switching-cost adjustment without re-implementing cost math. We adopt only the *idea* of switching cost, never a cache mechanism (NO-PROXY).
**Doctrine line:** "Adoptamos só a ideia de custo, nunca o mecanismo".

---

## Wave 53 — Refutations Log (earlier)

> Metacognition: o sistema reconhece e corrige os seus próprios pressupostos. Cada entrada = assunção do brief → realidade verificada → acção → linha da Doutrina V4.
> Companhia: [[WAVE53_DAY0_RECON.md]] · [[WAVE53_BRIEF_V3.md]].

> **Nota de proveniência (honestidade):** o Paulo pediu "R1–R5 do meu V2". Nenhum ficheiro V2 com lista R1–R5 existe no disco, e o *Unified Master Prompt* recebido não contém uma lista R1–R5 literal (`grep -rliE "wave.?53|R1.*R5|refuta" docs/ .planning/ prompts/` → nada relevante). Para não fabricar refutações anteriores (Doctrine V4 #5 — *No fabrication*), este log é construído a partir da **evidência Day-0 verificada** (9-agent adversarial, `file:line`), que de qualquer forma supera uma lista não-verificada.

---

## 2026-06-10 — Wave 53 Phase A (Cross-Session) · P5

**Assumption (Cowork brief):** "Conductor não vê sessões em worktrees diferentes" → criar `packages/cli/src/conductor/discovery.ts` com um `HeartbeatRecord` novo que escaneia heartbeats home-level e grava `worktree_path`.
**Reality (CC Day-0 recon):** Já implementado e **testado**. `worktree-conductor/src/heartbeat.ts:listHeartbeats()` faz `readdirSync(heartbeatsDir(home))` sobre o dir global; o tipo `Heartbeat` já tem `worktree_path` (`types.ts:19`); `conductor.status()` agrega live/stale (`conductor.ts:49-59`); teste prova 2 cwds distintos em `status().liveSessions` (`tests/worktree-conductor.test.ts:149-158`).
**Action:** REWRITE Phase A.1 — reutilizar `listHeartbeats()`/`status()` + tipo `Heartbeat`; **não** criar discovery.ts nem HeartbeatRecord. O trabalho novo é só a apresentação CLI/statusline.
**Doctrine V4 line:** "Honest > Forced" · "Zero side scope creep".

## 2026-06-10 — Wave 53 Phase A · HeartbeatRecord inventado

**Assumption (Cowork brief):** `HeartbeatRecord` inclui `model_active`, `tier_active`, `calls_total`, `tokens_total`, `saved_usd`, `saved_pct`, `last_decision`; mockup `mooter sessions discover` mostra `opus-4.6 T3 57 calls $0.33 saved` por sister.
**Reality (CC Day-0 recon):** O `Heartbeat` real (`types.ts:16-27`) tem só `session_id, terminal_name, worktree_path, branch, intent, last_heartbeat(_ms), active_locks, pending_intents, pid`. **Zero** campos de modelo/tier/tokens/savings.
**Action:** O chip cross-session mostra **apenas campos reais** (branch, terminal_name, idade vs `STALE_MS=30000`). Nunca fabricar modelo/tokens/$ por sister. Se essa info for desejada, é uma extensão futura ao schema (Wave 54+), não esta wave.
**Doctrine V4 line:** "No fabrication" · "Honest > Forced".

## 2026-06-10 — Wave 53 Phase H · P6

**Assumption (Cowork brief):** `packages/mooter-bench/RESULTS.json` existe com accuracy data, criado por Wave Mega P1; chip H.1 e `mooter explain bench` citam 60%.
**Reality (CC Day-0 recon):** Ficheiro ausente. Bench é **stdout-only** (`run.ts:192-211`, 0 `writeFile`). O "60.0%" do README é snapshot escrito à mão (`README.md:42-72`). Wave Mega Day-0 confirma ausência (`WAVE_MEGA_DAY0_RECON.md:21`).
**Action:** Shipar fallback `?`/empty (precedente honesto `explain.ts:168-170` para o chip MLWR). Persistir RESULTS.json (writeFile em `run.ts`) ou invocar bench live = **Wave 53.x / 55**, fora de scope (Decisão 4).
**Doctrine V4 line:** "No fabrication".

## 2026-06-10 — Wave 53 Phase E · P3

**Assumption (Cowork brief):** Mooter tem 8 comandos `/moo-*` que se aliasam para paridade CC (`/agents → /moo-agents`, etc.).
**Reality (CC Day-0 recon):** Existem 8 skills `/moo-*` (test-locked "no stragglers", `moo-skills.test.js:11,38-41`) mas são `workflow/effort/herd/dashboard/status/distill/pack/help` — **nenhuma** é agents/memory/init. `moo-agents|moo-memory|moo-init` → 0 hits. Aliasar apontaria para comandos inexistentes.
**Action:** Phase E **aditiva** — criar `moo-agents/moo-memory/moo-init` à imagem das 8 (SKILL.md, name==dir, desc>20 chars); **actualizar** `moo-skills.test.js` EXPECTED 8→11 + assert "no stragglers" (Decisão 2). **Não** sombrear os nomes nativos `/agents //memory //init` do CC (collision risk — CC é dono).
**Doctrine V4 line:** "Honest > Forced" · "Refutações são VALIOSAS".

## 2026-06-10 — Wave 53 Phase E · /plan

**Assumption (Cowork brief):** `/plan` é slash command CC a espelhar.
**Reality (CC Day-0 recon):** `/plan` **não existe** como slash command — Plan Mode em CC é Shift+Tab / `ExitPlanMode` tool.
**Action:** Remover `/plan` da matriz de paridade. Manter `/agents //memory //init //mcp //skills //compact //clear //help` (Decisão EXTRA).
**Doctrine V4 line:** "No fabrication".

## 2026-06-10 — Wave 53 Phase C · P2

**Assumption (Cowork brief):** Bash não mostra modelo + tokens em tempo real → adicionar hook PreToolUse `mooter route-hint` a `~/.claude/settings.json`.
**Reality (CC Day-0 recon):** Modelo+tier **já** são mostrados por Bash (`post_tool_badge.js` PostToolUse, ex. `🐂 ☁ sonnet T2 · via model-architect`). Só **tokens** faltam. `route-hint` não existe; PreToolUse corre *antes* do comando (nunca sabe tokens reais); settings.json já tem hook Bash (duplicaria o badge).
**Action:** Restringir a **tokens-only** dentro de `post_tool_badge.js`; **não** mexer em `~/.claude/settings.json` (config partilhada → T3/ask-first). Se tokens não forem expostos por tool_use de Bash no transcript → shipar `tokens?` honest fallback (Decisão 3).
**Doctrine V4 line:** "No fabrication" · guardrail config-partilhada.

## 2026-06-10 — Wave 53 Phase I · cca-f naming

**Assumption (Cowork brief):** export CCA-F vive em `packages/cli/src/cca-f/schema.ts`.
**Reality (CC Day-0 recon):** Token `cca-f` → 0 hits em `cli/src`. O subsistema real é **`fable-observe`** (`packages/cli/src/fable-observe/schema.ts` já existe).
**Action:** Extender `fable-observe` (export em `packages/cli/src/fable-observe/cca-f-export.ts`); **não** criar árvore `cca-f` paralela (Decisão 5). `~/.mooter/cca-f/` ausente → criar como recurso novo.
**Doctrine V4 line:** "Match existing naming" · "Zero side scope creep".

## 2026-06-10 — Wave 53 Paths · PATH-phaseA-C-I-files

**Assumption (Cowork brief):** novo código aterra em `packages/cli/src/{conductor,sessions,wrappers,cca-f}/`.
**Reality (CC Day-0 recon):** Nenhum desses dirs existe. `cli/src/` = `audit/ cascading/ commands/ fable-observe/ observability/ sync/`. Conductor/sessions vivem em packages irmãos (`worktree-conductor`, `sessions-orchestrator`). `wrappers/` é greenfield total. `mooter route-hint` não existe.
**Action:** Re-mapear cada phase para paths reais (ver [[WAVE53_BRIEF_V3.md]]). Tratar `~/.mooter/sessions/` e `~/.mooter/cca-f/` como recursos a criar.
**Doctrine V4 line:** "Honest > Forced".

## 2026-06-10 — Wave 53 Phase F · version bump target

**Assumption (Cowork brief):** bump `packages/cli/package.json` → 1.34.0.
**Reality (CC Day-0 recon):** Esse ficheiro é id estático de workspace (`1.0.0`). Source-of-truth = `tools/router/version.json` (1.33.0), auto-bumped por `.github/workflows/version-sync.yml` no push da tag.
**Action:** Bump via tag `v1.34.0` (CI escreve version.json) ou editar só `tools/router/version.json`; entrada `[1.34.0]` no `CHANGELOG.md`. **Não** tocar package.json. Binário instalado (v1.21.4) é stale, não reflecte o worktree.
**Doctrine V4 line:** "No fabrication" · "classify.js sha sagrada / release hygiene".

## 2026-06-10 — Wave 53 Recon tooling · binário stale

**Assumption (Cowork brief):** recon via `mooter --help` / `mooter conductor sessions list --all-worktrees` reflecte o worktree.
**Reality (CC Day-0 recon):** Binário instalado = v1.21.4 (beta) ≠ worktree (produto 1.33.0). `mooter conductor` nem tem subcommand `sessions` (verbos: `status|lock|unlock|queue|heartbeats|locks|history|reap|beat|stop`). `/moo-*` count via `--help` = 0 (enganador).
**Action:** Todos os verdicts baseados em SOURCE do worktree, nunca no binário global.
**Doctrine V4 line:** "Honest > Forced".

---

## Decisões do Paulo (2026-06-10) — greenlit

| # | Decisão |
|---|---|
| 1 | Proceder Wave 53 **re-scoped**; CC produz `WAVE53_BRIEF_V3.md` (mais limpo que Cowork re-emitir). |
| 2 | Phase E **aditiva**: criar `moo-agents/moo-memory/moo-init`; update `moo-skills.test.js` → EXPECTED 11 + assert. **Não** sombrear nativos CC. |
| 3 | Phase C **tokens-only** em `post_tool_badge.js`; **não** mexer settings.json; `tokens?` honest fallback se indisponível. |
| 4 | Phase H fallback `?` agora; writeFile ao bench → Wave 53.x/55, **não** scope creep. |
| 5 | Phase I **extender `fable-observe`** (`cca-f-export.ts`); não criar árvore cca-f. |
| EXTRA | Remover `/plan` da parity matrix (Shift+Tab, não slash). Manter `/agents //memory //init //mcp //skills //compact //clear //help`. |

**Doctrine V4 status: 9/9 ✅.**

---

# Wave 55 V3 — Refutations Log (Product + Audit)

> Companion: [[WAVE55_DAY0_RECON.md]] · [[MAC_INCONSISTENCIES_RECON.md]]. Same
> format: brief assumption → verified reality → action → Doctrine V4 line.

## 2026-06-11 — Wave 55 Phase B · P2 (legacy chips "dropped")

**Assumption (kickoff):** Wave 53 reorganized the statusline and **dropped** the
tier breakdown (token counts), VRAM, Ollama model+quant, embed model, GPU mode,
and user chips → Phase B must *restore* them.
**Reality (CC Day-0, verified against the live render `statusline-multi.js --demo
green` + source):** 4 of 6 are present, not dropped — `🪙 T0:N tkns · T1 · T2 · T3`
(granular tier breakdown) renders today; `🎮 …VRAM` exists, **gated on a GPU
profile**; `🔧 gpu-high` renders (`setup-status.js:34`); `👤 user <hash8>` renders
(`user-status.js`) as an **opaque hash by the Wave 33.8 privacy decision**. Only
the Ollama model-name+quant and the embed (nomic) model genuinely lack a chip.
The reason they don't *show* on the Mac is missing data (no GPU profile / no
`auth.json`), not a regression.
**Action:** Phase B **re-scoped** — do NOT "restore dropped chips" (they exist) and
do NOT add a cleartext `paulo-XXXX` user label (that regresses privacy). Instead
ship a **mode selector** (`mooter statusline mode <minimal|standard|extended|
legacy>`) + a dense **`extended` mode** that surfaces the existing (gated) chips
opt-in, default byte-identical. The two genuinely-missing chips are an optional
add only if their data source exists.
**Doctrine V4 line:** "Honest > Forced" · "No fabrication" · "Statusline default
byte-idêntico".

## 2026-06-11 — Wave 55 Phase A.6 · macOS-alignment fixes DEFERRED to Wave 55.1

**Assumption (addendum A.6):** after the cross-platform recon, CC applies the
"common fixes" for the macOS inconsistencies in this wave.
**Reality (CC recon, `MAC_INCONSISTENCIES_RECON.md`):** every genuinely
macOS-specific fix (B1 digest column pad, B2 chip-collapse budget, B3/B4
truncation) is an **emoji display-width** problem that needs a `string-width`
dependency the repo does not have, plus a rewrite of shared layout math, plus a
real Apple-Silicon screenshot to verify. The only dependency-free item (D1,
`sessions.ts` POSIX-separator) is actually a *Windows* bug, tangential to the Mac
statusline scope. Bundling a new dep + shared-render rewrite blind (no Mac in the
CC env) is exactly the high-blast-radius move Doctrine V4 #3 warns against.
**Action (honest call, as Paulo asked):** **DEFER** the alignment cluster
(B1–B4, C1) **and** D1 to a focused **Wave 55.1 cross-platform patch** — one
`string-width` dependency decision + Mac visual verification, done together. This
wave ships the dependency-free Mac wins that ARE in the kickoff's Phase A scope:
the cross-platform rendering doc (A.1), the Mac smoke-test doc (A.2), and the
`MOOTER_GLYPH_MODE=ascii` glyph fallback (A.4).
**Doctrine V4 line:** "Honest > Forced" · "Zero scope creep" · "Refutações são
valiosas".

## 2026-06-11 — Wave 55 audit · R6 (repo visibility)

**R6 (Wave 55 audit):** repo público 2026-04-07 → 2 meses exposed. Doctrine V4
sintetiza: "0 forks/stars = exposição mínima, mas viola Paulo mandate". Decisão
Opção A: stay public + Wave 55.1 install refactor. Privatize decision deferred.

**Evidence:** `gh repo view` → `{isPrivate:false, visibility:PUBLIC}`; forks 0 ·
stars 0 · watchers 0; created 2026-04-07. Pre-push **secrets scan** (full history)
→ ✅ CLEAN, no real secret values — only the public-by-design Supabase **anon**
key, env-var-name references, `wrangler secret put` commands, and well-known
dummies (AWS `AKIAIOSFODNN7EXAMPLE`, jwt.io example, sequential `ghp_` dummy).
service_role key never committed. See [[WAVE55_SECRETS_SCAN_2026-06-11.md]] ·
[[../audit/E2E_SMOKE_AUDIT_REPORT_2026-06-11.md]] §3.
**Action:** push Wave 55 (public-safe); Wave 55.1 = refactor `install.sh` off
`git clone` → `npm install -g @mooter/cli` / R2 tarball; privatize once shipped.
**Doctrine V4 line:** "Honest > Forced" · "Refutações são valiosas".

**Wave 55 Doctrine V4 status: refutations logged (R6 incl.), Honest > Forced upheld.**
