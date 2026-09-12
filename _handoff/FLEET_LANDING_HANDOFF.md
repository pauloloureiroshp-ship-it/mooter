---
handoff_schema: 1
task_id: fleet-landing-2026-07-17
type: HANDOFF
id: fleet-landing-2026-07-17
from: CC
to: COWORK
status: OPEN
state: STOP_B_STAGED
owner: Paulo
created_at: 2026-07-17
updated_at: 2026-07-17
worktree: C:/Users/Paulo Loureiro/frugal-fleet-landing
branch: feat/fleet-landing
base: 71340b25ccb7eb1b27e37e02a5a5f5cf3f63d2b7
head: 71340b25ccb7eb1b27e37e02a5a5f5cf3f63d2b7
sha: 71340b25ccb7eb1b27e37e02a5a5f5cf3f63d2b7
uncommitted: 19
tests: 33/33 pass (node --test _handoff/fleet/*.test.mjs)
decisions_pending: 1
ledger_ref: n/d
supersedes: n/d
---

# ⇄ CC → COWORK · HANDOFF — Fleet Landing (FASE 1 portada, staged, pré-commit)
> Budget: ≤ 4k tokens · source: _handoff/FLEET_LANDING_MASTERPROMPT.md (worktree `frugal`)

TL;DR: Linhagem Fleet completa (13 ficheiros + 6 testes) portada de `origin/feat/fleet-arm`
@ 4f72359 para worktree limpo a partir de `origin/main` @ 71340b2. 33/33 verdes, sha classify
intacta, 4/4 spawns com `windowsHide`. Staged, zero commits. Aguarda gate de commit.

INTENT: Aterrar a linhagem Fleet mínima que a Mesh A2 exige, via PR novo e limpo, sem mergear
nem consertar o #232.

STATE: STOP_B_STAGED — 19 paths staged, nada commitado, nada pushado.
WORKTREE: C:/Users/Paulo Loureiro/frugal-fleet-landing (branch `feat/fleet-landing`, novo)
UNPUSHED: 0 commits (nada commitado ainda)
TIME: 2026-07-17
DELTA: 19 files changed, 1498 insertions(+), 1 deletion(-)

GATE:
- `node --test _handoff/fleet/*.test.mjs` → tests 33 · pass 33 · fail 0 · duration_ms 251.3457
- sha256 `tools/router/classify.js` → 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f (FROZEN, intacta)
- `git diff --cached --check` → limpo (zero whitespace errors)
- windowsHide: 4/4 spawns reais do diff verificados no ficheiro final —
  exec-hidden.mjs:22, exec-hidden.mjs:27, fleet-orchestrator.mjs:156, gpu-stream.mjs:55.
  Zero spawn novo sem `windowsHide`.
- FC-8 (consumidor sem mount): `vram-preflight.mjs` importado sem gpu-stream montado → sem
  spawn, sem crash. Consumidor lê amostra em memória, nunca spawna.
- Regressão em suites pré-verdes: ZERO, provado mecanicamente. A árvore `packages/` neste worktree
  é byte-idêntica a `origin/main` (`git diff origin/main HEAD -- packages/` → 0 ficheiros; staged
  → 0; working tree → 0) e o diff não contém nenhum ficheiro em `packages/` nem `tools/`. Logo
  nenhuma suite pré-verde pode ter mudado de estado por este PR.
- ⚠️ `packages/cli` tem 1 falha PRÉ-EXISTENTE, herdada de main e alheia a esta wave:
  `tests/workflow-watch.test.ts:50` → ENOENT em `…\.mooter\workflow-control\wf_test3.json`.
  Não é regressão (ver prova acima); é uma falha de main que esta wave não introduziu nem conserta.
  Reportada, não tocada — fora da allowlist do STOP A.

WORK: PORT seletivo, fonte única `origin/feat/fleet-arm` @ 4f72359 (= head do PR #232 = tag
`insurance/fleet-arm-2026-07-16` — os três SHAs coincidem; não havia terceira fonte a confrontar).
`origin/main` não tinha nenhum dos alvos: 18 adições + 1 modificação. Proveniência por ficheiro:

| Ficheiro | Fonte |
|---|---|
| _handoff/fleet/gpu-stream.mjs · .test.mjs | 21408f5 (flicker-fix) |
| _handoff/fleet/vram-preflight.mjs | 21408f5 |
| _handoff/fleet/vram-preflight.test.mjs | fb4a992 |
| _handoff/fleet/fleet-watchdog.mjs | 21408f5 |
| _handoff/fleet/exec-hidden.mjs | 21408f5 |
| _handoff/fleet/fleet-orchestrator.mjs (M, 13/1) | 21408f5 |
| _handoff/fleet/run-watchdog.cmd · run-watchdog-hidden.vbs | 21408f5 |
| _handoff/fleet/fleet-forever.mjs | e13aab5 |
| _handoff/fleet/local-pillar.mjs · night-window.mjs · night-window.test.mjs | e13aab5 |
| _handoff/fleet/local-pillar.test.mjs | d70a16f |
| _handoff/fleet/cronista-pillar.mjs · fleet-sync-mirror.mjs · .test.mjs | 2bba0fd |
| _handoff/fleet/cronista-pillar.test.mjs | d88ca4a |
| ecosystem.config.js (raiz) | 21408f5 |

DECISIONS:
- D1 APPROVED: portado `ecosystem.config.js` (raiz, 21408f5, `cwd: __dirname` + `windowsHide: true`);
  `_handoff/fleet/ecosystem.config.cjs` (4ae3558, stale, cwd hardcoded, sem windowsHide) descartado.
- D2 APPROVED: `fleet-orchestrator.mjs` incluído — único port não-aditivo (13 ins/1 del). Traz o
  `windowsHide: true` no spawn do runner (linha 159). Sem ele, main mantinha um spawn sem windowsHide.
- D3 APPROVED: 3 adaptações de path (única mudança além de conteúdo portado):
  1. `run-watchdog.cmd:7` — `cd /d "C:\Users\Paulo Loureiro\frugal-fleet-arm"` → `cd /d "%~dp0..\.."`
  2. `run-watchdog.cmd:6` — REM de exemplo schtasks: path absoluto do worktree → placeholder `<REPO>`
  3. `run-watchdog-hidden.vbs` — path absoluto do .cmd → derivado de `WScript.ScriptFullName`
     (`FileSystemObject.GetParentFolderName`); window style `0` preservado intacto.
- D4 APPROVED: linhagem completa (13 + 6 testes). `fleet-forever.mjs` não faz parse sem
  local-pillar / cronista-pillar / night-window; cronista arrasta fleet-sync-mirror.
- CHANGES-needed: nenhum. Zero lógica nova; nenhum alvo exigiu mudança além de paths/imports.

PENDING:
- Gate de commit: autorização do Paulo (STOP B → commit é autorização separada).
- Destino deste handoff: staged no commit ou deixado untracked (fora da allowlist do STOP A).
- Fora desta wave: a falha pré-existente `workflow-watch.test.ts:50` em main merece issue própria.

RED ALERT — uncommitted (19 paths staged em C:/Users/Paulo Loureiro/frugal-fleet-landing/):
- _handoff/fleet/cronista-pillar.mjs · cronista-pillar.test.mjs · exec-hidden.mjs
- _handoff/fleet/fleet-forever.mjs · fleet-orchestrator.mjs · fleet-sync-mirror.mjs
- _handoff/fleet/fleet-sync-mirror.test.mjs · fleet-watchdog.mjs · gpu-stream.mjs
- _handoff/fleet/gpu-stream.test.mjs · local-pillar.mjs · local-pillar.test.mjs
- _handoff/fleet/night-window.mjs · night-window.test.mjs · run-watchdog-hidden.vbs
- _handoff/fleet/run-watchdog.cmd · vram-preflight.mjs · vram-preflight.test.mjs
- ecosystem.config.js
- Untracked por desenho: `_handoff/FLEET_LANDING_HANDOFF.md` (este ficheiro) — fora da allowlist
  do STOP A; staged só se o Paulo mandar.

RISK: `ecosystem.config.js` e o par watchdog são config de runtime — nenhum é ativado por este PR
(pm2/schtasks = gate nativo do Paulo pós-merge). `fleet-orchestrator.mjs` é o único ficheiro que já
existia em main; a sua modificação é aditiva em comportamento (enriquecimento best-effort do
heartbeat + windowsHide), com `try/catch` que nunca bloqueia o fleet.

GUARDS:
- classify.js FROZEN — não tocada; sha verificada no GATE
- git add seletivo — 19 paths explícitos, zero `git add -A`
- #232 não mergeado, não fechado, não rebaseado, não comentado — só lido
- worktrees do Codex (frugal-lingua-franca) não tocados — template do #255 lido via `git show`
- zero ativação pm2/schtasks · zero escrita em ~/.claude/**
- invariantes do flicker-fix preservados (1 nvidia-smi persistente; windowsHide em todo spawn)

NEXT: COWORK devolve DECISION CONTRACT: commit (com proveniência por ficheiro) → push → PR draft.
Cada um é autorização separada. Merge = Paulo.
RESUME: `cd C:/Users/Paulo Loureiro/frugal-fleet-landing && git status` — 19 staged sobre 71340b2.

~narrativa: O masterprompt nomeava 5 alvos e 3 fontes. A recon mostrou 2 árvores (o head do #232
é literalmente o mesmo SHA da feat/fleet-arm) e uma allowlist que não fechava: fleet-forever importa
4 módulos não nomeados. E o alvo `ecosystem.config.cjs` era o ficheiro errado — stale e sem o
windowsHide que o próprio GUARD exigia. As três correções foram aprovadas no STOP A antes de
qualquer edição.

conf: git verificado · gate 33/33 verificado · sha classify verificada · não-regressão provada
(packages/ byte-idêntica a main) · falha cli pré-existente identificada, não herdada desta wave

Evidence:
- _handoff/FLEET_LANDING_MASTERPROMPT.md:19-31 (FASE 0 / STOP A)
- _handoff/fleet/gpu-stream.mjs:55 (spawn único, windowsHide)
- _handoff/fleet/fleet-orchestrator.mjs:156-159 (spawn do runner + windowsHide, D2)
- _handoff/fleet/exec-hidden.mjs:22,27 (spawns sancionados)
- _handoff/fleet/run-watchdog.cmd:6-9 · run-watchdog-hidden.vbs:1-7 (adaptações D3)
- ecosystem.config.js:19-23 (script/cwd `__dirname`/windowsHide, D1)
- `gh pr view 232 --json headRefOid` → 4f723591dde82369d06c11ad81156ec9e60f1514

⛔ STOP: GATE fechado (33/33 · sha intacta · 4/4 windowsHide · FC-8 · zero regressão provada).
Commit / push / PR draft = autorizações separadas. Merge = Paulo.
HUMAN GATE: Paulo autoriza commit, push, PR e merge.
BACK: Um bloco COWORK → CC com APPROVE/CHANGES no commit e no destino do handoff (staged ou não).
CCA: 5/5
🔍 council n/d · objeção mais forte: n/d · resolvida: n/d
⇄ END
