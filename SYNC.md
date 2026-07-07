# Mooter — Sync Snapshot

> Canônico em `C:\Users\Paulo Loureiro\frugal\SYNC.md` (Windows) · `~/frugal/SYNC.md` (Mac).
> Canal bidirecional Cowork ↔ Claude Code (skill `/sync-project`).
> **Regra deste arquivo** (`AGENTS.md § Information architecture`): snapshot ≤ ~200 linhas, estado atual
> + últimas sessões. Histórico completo até 2026-07-07: `docs/foundation/SYNC_ARCHIVE_2026H1.md`.

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
### ⇄ Handoff · Executa _handoff/SUPER_WAVE_LP48_LP5_LP6.md na ínteg · 2026-07-07 06:06

```
⇄ MOO HANDOFF · frugal · Executa _handoff/SUPER_WAVE_LP48_LP5_LP6.md na í/bfb01d25 · 2026-07-07 06:06
STATE:  🟡 parked (por aterrar)
TL;DR:  🟡 parked (por aterrar) · wave/lp-4-8-ux-skills @1fbd2d0 (journal) ⚠ diverge do tree · 10 decisões
── PARA TI ──
  Estado:  tem trabalho commitado por aterrar (correr o gate e mergear)
  Onde:    wave/lp-4-8-ux-skills @1fbd2d0 (journal) ⚠ diverge do tree · frugal
  Pediste: —
  Moo fez: Execute handoff/SUPER_WAVE_LP48_LP5_LP6.md in full.
  A-seguir:correr o gate (final-reviewer) e — se verde — push/merge para main
ASK:    push-ok → ⤴ Acompanhar o push/PR
HEAD:   1fbd2d0 "polish(live-edit): LP-4.8 — surface the attached-ref label in the chip title"
BASE:   wave/lp-4-8-ux-skills @1fbd2d0 (journal) ⚠ diverge do tree · main+6 · pushed · ⚠ tree trocado
GATE:   classify.js ✓ frozen · HEAD toca 1 fich.: extension.js
TREE:   ⚠ 294 uncommitted fora do HEAD (ambiente)
FRESH:  vault 4d ago · Notion — · handoff agora
DELTA:  15 turnos · 6 commits desde o último handoff
PENDING:"Wave A (LP-4.8) completa e no remoto. **PÁRA para o teu OK** (regra do comboio: não mergeio sem ti). ## ✅ Wave A · LP-4.8 — UX in-canvas + Skills — pronta para gate humano **Branch:** `wave/lp-4-8-ux-skills` (pushed, 6 commits off `origin/main` @ LP-4.7) **PR:** https://github.com/pauloloureiroshp-s"
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
NEXT:   acompanhar o PR / push até verde
LAST:   Bash cd "c:\Users\Paulo Loureiro\frugal-lp48" && echo · Bash cd "c:\Users\Paulo Loureiro\frugal-lp48" && git  · TodoWrite

~RECAP (qwen · best-effort):
  -

model claude-opus-4-8 · mode moo · saved $-30.12 (sessão)
compressed locally (T0 · qwen2.5:3b · $0 · local best-effort) · ~0.2k tok saved vs screenshot (est.)
facts: complete
⇄ END HANDOFF
```
<!-- /mooter-handoff:bfb01d25-a71b-4518-9897-42ca85c371c9 -->
