# Mooter — Sync Snapshot

> Canônico em `C:\Users\Paulo Loureiro\frugal\SYNC.md` (Windows) · `~/frugal/SYNC.md` (Mac).
> Canal bidirecional Cowork ↔ Claude Code (skill `/sync-project`).
> **Regra deste arquivo** (`AGENTS.md § Information architecture`): snapshot ≤ ~200 linhas, estado atual
> + últimas sessões. Histórico completo até 2026-07-07: `docs/foundation/SYNC_ARCHIVE_2026H1.md`.

## 📥 COWORK → CLAUDE CODE

### Instruções e decisões tomadas no Cowork para a próxima sessão

> Esta secção é escrita pelo Cowork. O Claude Code deve lê-la no início de cada sessão, antes de qualquer trabalho.
> Após lida e aplicada: escrever "✅ Lido em sessão #N — [data]" e limpar as instruções.

**Última actualização Cowork:** 2026-07-10
**Estado:** 🟡 Por ler

---

1. 🔥 **Executar `_handoff/WAVE_HANDOFF_SPINE_V2_MASTERPROMPT.md`** (WAVE HANDOFF SPINE V2). Day 0 recon primeiro; STOPs, allowlists e gates humanos estão no packet. Não mergear nada sem Paulo.
2. ⚠️ **Emenda Cowork já embutida no packet** (verificação read-only 2026-07-10): main local `35c19f9` está STALE — `origin/main = c5cda85` (MEO PR #237, 0.16.63); base de todas as branches da wave = `origin/main` após `git fetch origin main --tags`.
3. ❌ **Não tocar no trabalho vivo do tree**: 4 ficheiros do flicker-fix por stage seletivo (`tools/router/backtest.js`, `vram_detect.js`, `packages/overclock-moo/src/runner.mjs`+`benchmark.mjs`) · `feat/fleet-arm @21408f5` unpushed · `wave-w3 @da42695` parked. Detalhe no handoff flicker-fix abaixo e na Emenda do packet.
4. 🔜 Snapshot do SYNC com MEO shipped (follow-up 2026-07-10): incorporar via Fase C/E do spine — não escrever dois SYNCs concorrentes.

## Estado em 2026-07-07 (reescrito pós-limpeza IA)

| Item | Valor | Fonte |
|---|---|---|
| Branch da árvore compartilhada | `wave/honest-controls` (behind main; ~modificados: canônicos + landing + tools/router) | `.git/HEAD` + `git status` no `_handoff/cleanup-log.txt` |
| main | LP-4.7 quality engine (auto-declarado no SUPER_WAVE; confirmar `git log`) · MP5.2a select-lock @78dd9da · LP-3.2 vsix fix @2c1a492 | `docs/strategy/LIVE_EDIT_ROADMAP.md` |
| Comboio em execução | **SUPER_WAVE LP-4.8 → LP-5 → LP-6** lançado 2026-07-07 04:49 (sessão CC) | `_handoff/SUPER_WAVE_LP48_LP5_LP6.md` + handoff bfb01d25 |
| ⚠️ P0 aberto | **P0-1: edição $0 não amarrada à árvore servida** ("✓ aplicado" e a tela não muda) — FIX-MP-1 deve preceder o LP-6 publish | `_handoff/LIVE_PREVIEW_AUDIT_FINDINGS.md` |
| P1 graves | fence stale assimétrica (só delete é fail-closed) · +5 P1 · 7 P2 | idem |
| Próxima auditoria | CCA/evals+OWASP — masterprompt emendado pronto; Fase A (harness `tools/eval/`) pode arrancar já; B-D esperam FIX-MP-1 | `_handoff/LIVE_EDIT_CCA_AUDIT_MASTERPROMPT.md` |

## Sessão 2026-07-07 · Arquitetura de Informação (Cowork)

**O que mudou (working-tree, staging do Paulo):**

- **Regra "onde vive o quê"**: `AGENTS.md § Information architecture` (10 tipos × casa × ciclo de vida + 5 gatilhos; espelho no vault `00-core/onde-vive-o-que`). Enforcement mecânico planejado: `tools/docs-hygiene.js` (CI warn → gate).
- **`docs/strategy/LIVE_EDIT_ROADMAP.md`** criado — spec vivo ÚNICO do Live Edit/Preview (consolida VISION + MP5_SPEC + MP5.2 + LP-4.6 + LP-4.7; originais em `_handoff/_archive/2026-07/`).
- **`MEMORY.md`** +8 decisões destiladas Mai-Jul · **`LOOP.md`** +3 entries (vsix/@babel/parser · fence assimétrica · P0 árvore) · **`CLAUDE.md`** idioma → PT-BR.
- **Limpeza física executada** (script `_handoff/cleanup-info-architecture.ps1`, log `_handoff/cleanup-log.txt`, zero erros): 31 itens `_handoff` → `_archive/2026-06|07/` · 158 `WAVE*.md` → `docs/archive/waves/` · `node_modules` removido de `docs/strategy/` · SYNC antigo (371 KB) → `docs/foundation/SYNC_ARCHIVE_2026H1.md`.
- **Padrão de auditoria de produto** decidido (evals no CI + OWASP/MITRE; vale para projetos futuros): vault `20-decisions/padrao-auditoria-produto` + Notion HQ.
- Automação: scheduled task `fecho-do-dia-mooter` (19h, vault+Notion) · boot de sessão Cowork = `/sync-project` + tail deste arquivo · canon **PT-BR reconfirmado** (profile Anthropic a atualizar pelo Paulo).

**🔜 Pendências (ordem):**

1. **CC:** FIX-MP-1 (P0 árvore) + fence simétrica — antes do LP-6 tocar publish.
2. **CC:** Fase A da auditoria CCA (harness `tools/eval/` + golden set 20) — paralela, read-only.
3. **Paulo-hands:** staging/commit seletivo da limpeza + canônicos (o `git status` está no cleanup-log) · arrumar `wave/honest-controls` vs main · podar worktrees R6 (frugal-mp52a, land-mp52a, lpfix, lp4, lp45, lp47, audit) · atualizar profile Anthropic (draft entregue) · decidir duplicado `_handoff/LIVE_EDIT_CCA_AUDIT.md` vs `_MASTERPROMPT.md` (manter o emendado).
4. **CC (quando 1-2 aterrarem):** `LIVE_PREVIEW_TOTAL_AUDIT_WAVE.md` → `_archive/` (superseded pelo CCA masterprompt).

**Guards permanentes:** classify.js FROZEN `427d8c0b…` · git add seletivo, escrita git é do Paulo · T5 só via `@fable` · wave shipped ⇒ masterprompt arquiva no mesmo PR.

---

### ⇄ Últimos handoffs (referência)

- 2026-07-07 04:49 — CC iniciou `SUPER_WAVE_LP48_LP5_LP6.md` (handoff bfb01d25). Estado: em execução; confrontar antes de emitir qualquer handoff que toque o Live Edit.
- 2026-07-06 19:46 — SUPER WAVE LP-4.7→4.6→4.8 Qualidade (cc0501e1) — LP-4.7 declarado em main.
- Histórico anterior: `docs/foundation/SYNC_ARCHIVE_2026H1.md`.

<!-- mooter-handoff:bfb01d25-a71b-4518-9897-42ca85c371c9 -->
### ⇄ Handoff · Executa _handoff/SUPER_WAVE_LP48_LP5_LP6.md na ínteg · 2026-07-08 04:43

```
⇄ MOO HANDOFF · frugal · Executa _handoff/SUPER_WAVE_LP48_LP5_LP6.md na í/bfb01d25 · 2026-07-08 04:43
STATE:  🟡 parked (por aterrar)
TL;DR:  🟡 parked (por aterrar) · wave/lp-4-9-ux-intuitive @579e287 (journal) ⚠ diverge do tree · 11 decisões
── PARA TI ──
  Estado:  tem trabalho commitado por aterrar (correr o gate e mergear)
  Onde:    wave/lp-4-9-ux-intuitive @579e287 (journal) ⚠ diverge do tree · frugal
  Pediste: —
  Moo fez: Execute handoff/SUPER_WAVE_LP48_LP5_LP6.md in full.
  A-seguir:correr o gate (final-reviewer) e — se verde — push/merge para main
ASK:    review → 🔎 Rever (invariante em jogo)
HEAD:   579e287 "Merge remote-tracking branch 'origin/main' into wave/lp-4-9-ux-intuitive"
BASE:   wave/lp-4-9-ux-intuitive @579e287 (journal) ⚠ diverge do tree · main+22 · pushed · ⚠ tree trocado
GATE:   classify.js ✓ frozen · merge-commit · 4 fich. trazidos: lp-error-tap.ts, next.config.ts, extension.js, lp-tree-host.test.js · ⚠ mixed-sessions
TREE:   ⚠ 78 uncommitted fora do HEAD (ambiente)
FRESH:  vault 5d ago · Notion — · handoff agora
DELTA:  35 turnos · 22 commits desde o último handoff
PENDING:"FIX-MP-1 integrado sem dor. **PÁRO aqui para o teu OK** — não mergeio para main. ## ✅ Merge FIX-MP-1 × LP-4.9 — feito, provado, pushed **Branch `wave/lp-4-9-ux-intuitive` @ `579e287`** (pushed) · **22 ahead / 0 behind** origin/main (contém o main todo + o teu trabalho — o "sem dor" que querias). **C"
DECISIONS:
  Q:"Should LP-4.8 branch off `origin/main` (which already has LP-4.7 merged at v0.16.52), or would you prefer a different base?" → escolheu:"<tool_use_error>InputValidationError: [
  {
    "origin": "array",
    "code": "too_big",
    "maximum": 4,
    "inclusive": true,
    "path": [
      "questions"
    ],
    "message": "Too big: expec"
  Q:"For multi-select in LP-4.8, confirm the model: Cmd/Ctrl-click attaches multiple pins as read-only context to one prompt (Lovable attach-as-reference style), NOT batch-edit-all-selected?" → escolheu:"<tool_use_error>InputValidationError: [
  {
    "origin": "array",
    "code": "too_big",
    "maximum": 4,
    "inclusive": true,
    "path": [
      "questions"
    ],
    "message": "Too big: expec"
  Q:"For LP-6 Publish → Update flow: should the Vercel deploy create a preview URL (intermediate step before two-factor prod promotion), or go directly to production?" → escolheu:"<tool_use_error>InputValidationError: [
  {
    "origin": "array",
    "code": "too_big",
    "maximum": 4,
    "inclusive": true,
    "path": [
      "questions"
    ],
    "message": "Too big: expec"
  Q:"When a Critical security finding is open in LP-5, should LP-6's Update button be: completely disabled with tooltip, OR show a red warning + allow override?" → escolheu:"<tool_use_error>InputValidationError: [
  {
    "origin": "array",
    "code": "too_big",
    "maximum": 4,
    "inclusive": true,
    "path": [
      "questions"
    ],
    "message": "Too big: expec"
  Q:"For the /section skill (multi-node refactors): should it be un-fenced (trusted agent can write freely) or stay fenced like other skills?" → escolheu:"<tool_use_error>InputValidationError: [
  {
    "origin": "array",
    "code": "too_big",
    "maximum": 4,
    "inclusive": true,
    "path": [
      "questions"
    ],
    "message": "Too big: expec"
  Q:"Should LP-4.8 branch off `origin/main` (which already has LP-4.7 merged at v0.16.52), or would you prefer a different base?" → escolheu:"Yes, use origin/main"
  Q:"For multi-select in LP-4.8, confirm the model: Cmd/Ctrl-click attaches multiple pins as read-only context to one prompt (Lovable attach-as-reference style), NOT batch-edit-all-selected?" → escolheu:"Confirm: attach-as-reference"
  Q:"For LP-6 Publish → Update flow: should the Vercel deploy create a preview URL (intermediate step before two-factor prod promotion), or go directly to production?" → escolheu:"Direct to production"
~narrativa (qwen · best-effort): Execute handoff/SUPER_WAVE_LP48_LP5_LP6.md in full.
NEXT:   rever antes de tocar — invariante/sessões mistas em jogo
LAST:   TodoWrite · Bash cd "c:\Users\Paulo Loureiro\frugal-lp49" && git  · TodoWrite

~RECAP (qwen · best-effort):
  TodoWrite, Bash cd "c:\Users\Paulo Loureiro\frugal-lp49" && git.

model claude-opus-4-8 · mode moo · saved $-166.19 (sessão)
compressed locally (T0 · qwen2.5:3b · $0 · local best-effort) · ~0.1k tok saved vs screenshot (est.)
facts: complete
⇄ END HANDOFF
```
<!-- /mooter-handoff:bfb01d25-a71b-4518-9897-42ca85c371c9 -->

<!-- mooter-handoff:1cafc383-861b-45e5-b0db-81aaa01c9583 -->
### ⇄ Handoff · ⇄ COWORK → CC · LP-4.8 gate + merge (OK do Paulo dad · 2026-07-07 08:08

```
⇄ MOO HANDOFF · frugal · ⇄ COWORK → CC ·/1cafc383 · 2026-07-07 08:08
STATE:  🔵 awaiting-you (à-espera-de-ti)
TL;DR:  🔵 awaiting-you (à-espera-de-ti) · feat/lp-fix-treeid @f428a86 (journal) ⚠ diverge do tree · 0 decisões
── PARA TI ──
  Estado:  está à tua espera — há uma pergunta aberta para responderes
  Onde:    feat/lp-fix-treeid @f428a86 (journal) ⚠ diverge do tree · frugal
  Pediste: —
  Moo fez: CC code review and merging completed
  A-seguir:responde: "PR #228 (guard FIX-MP-1, P0 tree-identity) está gated SHIP-WITH-NITS e pronto. O merge para main foi bloqueado pelo guar"
ASK:    answer → 💬 Responder à pergunta
HEAD:   f428a86 "fix(live-edit): FIX-MP-1 — gate the model one-box + agent paths too (_promptEdit"
BASE:   feat/lp-fix-treeid @f428a86 (journal) ⚠ diverge do tree · main+2 · pushed · ⚠ tree trocado
GATE:   classify.js ✓ frozen · HEAD toca 2 fich.: extension.js, lp-tree-host.test.js
TREE:   ⚠ 77 uncommitted fora do HEAD (ambiente)
FRESH:  vault 4d ago · Notion — · handoff agora
DELTA:  3 turnos · 2 commits desde o último handoff
PENDING Q:"PR #228 (guard FIX-MP-1, P0 tree-identity) está gated SHIP-WITH-NITS e pronto. O merge para main foi bloqueado pelo guardrail (P0 self-authored). Como avançar?"
  opções: 1)Tu mergeias #228 (Recommended) 2)Autoriza-me a mergear 3)Hold — não mergear ainda
PENDING Q:"Os 2 nits de revert (undo/feed-revert e task-revert NÃO gateados). Provei que não atingem o P0 (bytes próprios, path in-wsRoot já provado, sha-fail-closed). Gatear bloquearia o undo do próprio user durante drift. Aceitar ou fechar?"
  opções: 1)Aceitar como nits (Recommended) 2)Gatear os reverts também
PENDING Q:"A Fase A do CCA audit (harness tools/eval/ + golden set, baseline 18/18) está commitada em feat/cca-eval-harness, pushed, ainda sem PR. Aditiva, read-only no produto. O que fazer?"
  opções: 1)Abro PR, deixo para revisão (Recommended) 2)Hold — só reportar
~narrativa (qwen · best-effort): CC code review and merging completed
NEXT:   responder à pergunta pendente acima
LAST:   Bash cd "c:/Users/Paulo Loureiro/frugal-fix-treeid" & · Bash cd "c:/Users/Paulo Loureiro/frugal-fix-treeid" & · AskUserQuestion

~RECAP (qwen · best-effort):
  -

model claude-opus-4-8 · mode moo · saved $-24.99 (sessão)
compressed locally (T0 · qwen2.5:3b · $0 · local best-effort) · ~0.6k tok saved vs screenshot (est.)
facts: complete
⇄ END HANDOFF
```
<!-- /mooter-handoff:1cafc383-861b-45e5-b0db-81aaa01c9583 -->

<!-- mooter-handoff:__fleet__ -->
### ⇄ Handoff · frugal · 2026-07-11 08:35

```
⇄ MOO PROJECT HANDOFF → cola no Cowork
project: frugal · 17 sessões · 2026-07-11 08:35
🎯 A ÚNICA COISA: responder a 1 sessão à-espera-de-ti (🔵 abaixo)
TRIAGE: ⏱~2min responder 1 · ⏱~5min push 3 · 💤 idle 16
ASK:    17 sessões · 8 verify+merge · 1 answer · 8 fyi · 0 review
⚠ RISCO: HIGH — 12 sessães com branch/SHA divergente do tree

▸ BOARD:
  ✅ ⇄ COWORK→CC · WAVE LP-4.5 v2 · Tarefas Ancoradas — u (77ea7c3b) · main @6928be6 ⚠ diverge do tree · claude-opus-4-8 · ⚠ 0 commits · uncommitted (verifica)
  ✅ ⇄ MOO HANDOFF · frugal · Executa _handoff/SUPER_WAVE (495a7833) · wave/lp-4-9-ux-intuitive @9a4358f ⚠ diverge do tree · claude-opus-4-8 · ⚠ 0 commits · uncommitted (verifica)
  ✅ ⇄ COWORK → CC · SUPER MASTERPROMPT — Quota-Aware + F (7ed5684a) · wave/honest-controls · branch incerto (tree partilhado) · claude-fable-5
  ✅ ⇄ COWORK→CC · SUPER WAVE LP-4.7→4.6→4.8 · Qualidade  (cc0501e1) · main @35c19f9 ⚠ diverge do tree · claude-haiku-4-5-20251001 · ⚠ 0 commits · uncommitted (verifica)
  ✅ ⇄ COWORK→CC · WAVE LP-4 · Prompt ancorado v2.1 — LLM (238afb6f) · main @35c19f9 ⚠ diverge do tree · claude-opus-4-8 · ⚠ 0 commits · uncommitted (verifica)
  ✅ Lê e executa _handoff/LIVE_PREVIEW_TOTAL_AUDIT_WAVE. (87bf76f5) · wave/honest-controls @eba5d3b · claude-fable-5  [UNPUSHED]
  ✅ ⇄ COWORK → CC · LP-4.8 gate + merge (OK do Paulo dad (1cafc383) · feat/lp-fix-treeid @f428a86 ⚠ diverge do tree · claude-opus-4-8 · ⚠ 0 commits · uncommitted (verifica)
  ✅ ⇄ COWORK → CC · FLEET TOTAL — os 13 pilares a rodar  (f372c271) · wave/honest-controls · branch incerto (tree partilhado) · claude-opus-4-8
  ✅ Executa _handoff/SUPER_WAVE_LP48_LP5_LP6.md na ínteg (bfb01d25) · wave/honest-controls @eba5d3b · claude-opus-4-8  [UNPUSHED]
  ✅ És o agente de tarefas ancoradas do Live Preview. O  (4248c27d) · wave/honest-controls @28fe2e5 ⚠ diverge do tree · claude-haiku-4-5-20251001  [UNPUSHED]
  ✅ És o agente de tarefas ancoradas do Live Preview. O  (fecf5aa2) · wave/honest-controls @28fe2e5 ⚠ diverge do tree · claude-haiku-4-5-20251001  [UNPUSHED]
  ✅ És o agente de tarefas ancoradas do Live Preview. O  (c37a9bc6) · wave/honest-controls @28fe2e5 ⚠ diverge do tree · claude-haiku-4-5-20251001  [UNPUSHED]
  ✅ És o agente de tarefas ancoradas do Live Preview. O  (cf37b9c3) · wave/honest-controls @28fe2e5 ⚠ diverge do tree · claude-sonnet-4-6  [UNPUSHED]
  ✅ És o agente de tarefas ancoradas do Live Preview. O  (1b439014) · wave/honest-controls @28fe2e5 ⚠ diverge do tree · claude-sonnet-4-6  [UNPUSHED]
  ✅ És o agente de tarefas ancoradas do Live Preview. O  (ac132492) · wave/honest-controls @28fe2e5 ⚠ diverge do tree · claude-sonnet-4-6  [UNPUSHED]
  ✅ És o agente de tarefas ancoradas do Live Preview. O  (5b844df2) · wave/honest-controls · branch incerto (tree partilhado) · claude-sonnet-4-6
  ✅ És o agente de tarefas ancoradas do Live Preview. O  (535a36ba) · wave/honest-controls @2c1a492 ⚠ diverge do tree · claude-sonnet-4-6  [UNPUSHED]

▸ PARKED (trabalho por push — nenhum remote tem estes commits):
  🟡 wave/lp-producao-perfeita @d522ad8 · 19 commits por push · frugal-final
  🟡 wave/honest-controls @eba5d3b · 1 commit por push · frugal
  🟡 feat/handoff-spine-v2-a-audit-fixes @1d9d020 · 1 commit por push · frugal-handoff-spine-v2-a

▸ OVERALL (local summary): És o agente de tarefas ancoradas do Live Preview. Todos os branchs estão em wave/honest-controls, com 412 sujos e à frente 0.

▸ FLAGS: 17 em wave/honest-controls · 0 UNCOMMITTED · 21 UNPUSHED
▸ AMBIENTE: frugal 412 dirty (working-tree partilhado por 17 sess)
▸ NEXT FOR COWORK: push 3 branches parked (21 commits)
⇄ END PROJECT HANDOFF
```
<!-- /mooter-handoff:__fleet__ -->

<!-- mooter-handoff:f372c271-c821-434b-9ed4-e02027efca1d -->
### ⇄ Handoff · ⇄ COWORK → CC · FLEET TOTAL — os 13 pilares a rodar  · 2026-07-08 04:53

```
⇄ MOO HANDOFF · frugal · ⇄ COWORK → CC ·/f372c271 · 2026-07-08 04:53
STATE:  🟢 in-progress
TL;DR:  🟢 in-progress · wave/honest-controls (branch incerto · tree partilhado) · 0 decisões
── PARA TI ──
  Estado:  ainda a trabalhar (ou sem journal para confirmar)
  Onde:    wave/honest-controls (branch incerto · tree partilhado) · frugal
  Pediste: —
  Moo fez: "Executing 13 pillars of fleet management coding"
  A-seguir:rever antes de tocar — invariante/sessões mistas em jogo
ASK:    review → 🔎 Rever (invariante em jogo)
HEAD:   n/d (sem journal)
BASE:   wave/honest-controls (branch incerto · tree partilhado) · n/d (sem journal)
GATE:   classify.js ✓ frozen · HEAD toca 460 fich.: AGENTS.md, CLAUDE.md, LOOP.md, MEMORY.md, SYNC.md +455 · ⚠ mixed-sessions
TREE:   ⚠ 78 uncommitted fora do HEAD (ambiente)
FRESH:  vault 5d ago · Notion — · handoff agora
DELTA:  62 turnos · n/d (sem journal) commits
PENDING:"F1·5 — Higiene: arquivar ledgers dry de 2026-06-23. Vejo o que existe."
~narrativa (qwen · best-effort): "Executing 13 pillars of fleet management coding"
NEXT:   rever antes de tocar — invariante/sessões mistas em jogo
LAST:   Bash cd "/c/Users/Paulo Loureiro/frugal-fleet-arm" && · Bash cd "/c/Users/Paulo Loureiro/frugal-fleet-arm" && · Bash cd "/c/Users/Paulo Loureiro/frugal-fleet-arm" &&

~RECAP (qwen · best-effort):
  Recent actions involved multiple changes to directory: `cd "/c/Users/Paulo Loureiro/frugal-fleet-arm"` performed three times.

model claude-opus-4-8 · mode moo · saved $-6.41 (sessão)
compressed locally (T0 · qwen2.5:3b · $0 · local best-effort) · ~0.8k tok saved vs screenshot (est.)
facts: complete
⇄ END HANDOFF
```
<!-- /mooter-handoff:f372c271-c821-434b-9ed4-e02027efca1d -->

<!-- mooter-handoff:flicker-fix-2026-07-10 -->
### ⇄ Handoff · COWORK → CC · CONSOLE-FLICKER DO MOOTER-FLEET ELIMINADO · 2026-07-10 07:02

```
⇄ MOO HANDOFF · frugal + frugal-fleet-arm · COWORK → CC · flicker-fix · 2026-07-10
STATE:  ✅ done — aceite provado (0 flashes 2×120s, pós-fix E pós-resurrect)
TL;DR:  causa-raiz corrigida na arquitetura: 1 nvidia-smi persistente escondido em vez de 1 spawn visível a cada 15s

── CAUSA-RAIZ (confirmada por recon + teste A/B do Paulo) ──
  App pm2 `mooter-fleet` = frugal-fleet-arm\_handoff\fleet\fleet-forever.mjs (fork, FLEET_CYCLE_GAP_MS=15000).
  vram-preflight.mjs:66 fazia spawnSync('nvidia-smi', …) SEM windowsHide antes de CADA ciclo (~15s);
  local-pillar.mjs queryGpu() idem (por round + module-load). Parent pm2 é windowless no Windows →
  cada spawn abria janela de console que roubava o foco (8 flashes/min medidos; 0 com o fleet parado).

── FIX (commit 21408f5 em feat/fleet-arm, SEM push) ──
  NOVO  _handoff/fleet/gpu-stream.mjs       — UM `nvidia-smi --query-gpu=… -l 15` persistente, spawn windowsHide:true,
                                              stdout em stream, última amostra em memória, auto-restart c/ backoff (1s→60s;
                                              ENOENT→5min), unref (runs bounded saem limpos). Amostra stale (>2×intervalo+5s) → null honesto.
  NOVO  _handoff/fleet/exec-hidden.mjs      — helper único: spawnHiddenSync (sem shell) + execHiddenSync (shell p/ shims .cmd tipo pm2).
  NOVO  _handoff/fleet/gpu-stream.test.mjs  — 3 testes puros (parse, staleness, honest-null).
  EDIT  _handoff/fleet/vram-preflight.mjs   — probeVramFreeMb/preflight leem do gpu-stream (espera limitada 3s; falta de amostra NUNCA bloqueia).
  EDIT  _handoff/fleet/local-pillar.mjs     — queryGpu() lê do stream; genGate agora é lazy (promise memo — cap intacto; antes era spawnSync no import).
  EDIT  _handoff/fleet/fleet-watchdog.mjs   — execSync('pm2 restart') → execHiddenSync (shell escondido).
  EDIT  _handoff/fleet/fleet-orchestrator.mjs — spawn do sdk-runner + windowsHide (só corre com FLEET_ALLOW_CLOUD=1).
  EDIT  _handoff/fleet/run-watchdog.cmd     — header documenta a instalação via wrapper invisível.
  NOVO  ecosystem.config.js (raiz worktree) — config-as-code do pm2 c/ windowsHide:true explícito + env atual; resurrect preservado.
  VERSIONADO _handoff/fleet/run-watchdog-hidden.vbs — o wrapper deixou de ser artefato órfão.
  Testes: 20/20 (sandbox E nativo Windows).

── REPO frugal (working-tree, stage seletivo pendente — tree partilhado, NÃO commitei aqui) ──
  tools/router/backtest.js       — (1) null-guard no loadDecisions: linha "null" é JSON válido e entrava como evento →
                                    resolveFeedback rebentava em e.event → exit 1 TODA noite às 02:00 (bônus resolvido;
                                    3 linhas "null" confirmadas no decisions.log). (2) windowsHide nos 2 spawns detached.
  tools/router/vram_detect.js    — windowsHide nos 2 spawnSync.
  packages/overclock-moo/src/runner.mjs + benchmark.mjs — windowsHide em todos os spawnSync (11 sites; sampler de 250ms!).
    ⚠ allowlist pontual desta missão aprovada pelo Paulo (packages/* frozen; diffs de 1 linha por site).
  Backups dos originais: _to_delete/flicker-fix/backup/ e backup-arm/.

── ESTADO DA MÁQUINA (mudanças fora do repo — manter) ──
  1. mooter-fleet esteve PARADO no pm2 durante o diagnóstico (2026-07-10 manhã) → RELIGADO via `pm2 restart ecosystem.config.js --update-env` + `pm2 save` (dump.pm2 regravado 10/07 07:00).
  2. Tarefa \MooterFleetWatchdog (5/5min) alterada MANUALMENTE pelo Paulo para:
       wscript.exe "C:\Users\Paulo Loureiro\frugal-fleet-arm\_handoff\fleet\run-watchdog-hidden.vbs"
     (agora o .vbs está versionado no repo; comando exato acima é o que está no XML da task).
  3. \FrugalRouterBacktest (02:00 diária) continua a apontar para ~\.claude\tools\router\run-backtest.cmd (v0.9);
     o backtest.js deployado foi substituído pelo corrigido (backup: _to_delete/flicker-validate/backtest.js.pre-fix.bak).
     Rodado manualmente pós-fix: exit 0 (era 1). Próximo /mooter-update ressincroniza o resto.
  4. savings-tracker.js (porta 7821, PID 40288) — auditado, JÁ conforme (gpu-probe c/ windowsHide; sha deployed == repo). Sem mudanças.

── PROVA (aceite, _to_delete/flicker-validate/validate-transcript.log) ──
  • FLASHES 120s pós-fix: 0 (aceite = 0) ✅
  • FLASHES 120s pós `pm2 kill && pm2 resurrect`: 0 ✅ (gpu-stream renasce: PID 51384 → 52880)
  • Métricas vivas: heartbeat {"vram_free_mb":17344,"foreign_models":["qwen2.5:3b"]}; ciclos 15 ran / 15 gated / 0 incidents
  • run-backtest.cmd: exit 0; feedback {"accepted":100,"followup_immediate":4}

── NEXT (para o CC) ──
  • Stage seletivo + commit dos 4 ficheiros do frugal (backtest.js, vram_detect.js, overclock runner+benchmark) na wave apropriada.
  • Push do feat/fleet-arm (21408f5) quando o Paulo der o gate.
  • /mooter-update após release que toque tools/router (rito do CLAUDE.md).
  • Opcional: converter \FrugalRouterBacktest p/ wrapper vbs (mesmo padrão) se algum flash às 02:00 incomodar (os spawns internos já estão hidden).
⇄ END HANDOFF
```
<!-- /mooter-handoff:flicker-fix-2026-07-10 -->
