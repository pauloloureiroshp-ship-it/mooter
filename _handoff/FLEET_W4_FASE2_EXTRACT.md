# ⇄ COWORK → CC · Fleet W4 Fase 2 — extrair fleet-commander (branch stale) + construir o orchestrator

> A Fase 0 (drenar WIP: 43→6 worktrees) e a Fase 1 (Overclock F2, executor concorrente `pool.mjs`) estão **feitas e em `main`**.
> A Fase 2 (o maestro da frota) **já existe substancialmente** em `feat/fleet-local-runner` — MAS essa branch é **stale**
> (`2176 add / 4946 DEL`; nasceu de um `main` antigo). **Mergeá-la apaga todo o trabalho de hoje.** Por isso: extracção
> cirúrgica dos aditivos sobre o `main` atual, depois construir o orchestrator. NUNCA merge/rebase da branch inteira.

## 🎯 GOAL
Aterrar o `fleet-commander` (scheduler+lease+fsm+proof-gate, já hardened 2× por final-reviewer) sobre o `main` de hoje
**sem regredir nada**, e ligá-lo num `fleet-orchestrator.mjs` que usa o `pool.mjs` da Fase 1 como mão-de-obra $0. DRY-RUN.

## 📍 WHERE
Worktree nova `../frugal-fleet2` · branch `feat/fleet-orchestrator` · **from `main`** (4ae19b6).
`feat/fleet-local-runner` (worktree `../frugal-fleet-f05`) é **fonte READ-ONLY** — nunca a faças checkout/merge para trabalhar.

## ▶ DO
1. **Confrontar** (a verdade nativa, sem pager): `git --no-pager diff --stat main..feat/fleet-local-runner`.
   Confirma que os **aditivos** (só na branch, main não tem) são exactamente:
   `packages/fleet-commander/**` · `_handoff/loop/local-loop-runner.mjs` + `.test.mjs` · `docs/strategy/MOOTER_EVOLUTION_FLEET.md`.
   Tudo o resto no diff são **deleções** (branch velha) ou **modificações stale da extensão** (`arch-tree.js`, `extension.js`,
   `row-renderer.js`, `pc-snapshot*`, `project-command-view*`, `forecast/*`) → **NÃO trazer nada disso**.
2. **Extracção cirúrgica** (traz só os aditivos, main de hoje intacto):
   ```
   git worktree add ../frugal-fleet2 -b feat/fleet-orchestrator main
   cd ../frugal-fleet2
   git checkout feat/fleet-local-runner -- packages/fleet-commander _handoff/loop/local-loop-runner.mjs _handoff/loop/local-loop-runner.test.mjs docs/strategy/MOOTER_EVOLUTION_FLEET.md
   ```
3. **Validar não-regressão** (o guard-mãe): `git status` mostra SÓ os paths acima como novos/staged.
   Prova que o trabalho de hoje está **intacto** em disco: `git diff --stat main..HEAD` NÃO contém nenhuma deleção de
   `tools/router/forecast/*`, `pc-snapshot.js`, `project-command-view.js`, `AGENTS.md`, `MOOTER_ROADMAP.md`, `HandoffStory.tsx`.
   `classify.js` sha == `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`.
4. **Testar o fleet-commander**: `cd packages/fleet-commander && npm install && npm test` (fsm/lease/proof-gate/scheduler).
5. **Ler o design** `docs/strategy/MOOTER_EVOLUTION_FLEET.md` (F0) + os 4 módulos → construir:
   - `_handoff/fleet/fleet.json` — os 12 pilares (`id, workdir, priority, gpu_heavy, cloud_heavy, daysQuota`) — reusa os 12
     já scaffolded em `_handoff/fleet/<pilar>/STATE.json`.
   - `_handoff/fleet/fleet-orchestrator.mjs` — liga `scheduler` (attention quota/SPOQ) + `lease` (orphan-report-never-steal)
     + `fsm` (proposal) + `proof-gate` + o **`pool.mjs`** de `packages/overclock-moo` (Fase 1, executor concorrente $0) como
     mão-de-obra; caps HARD (1 `gpu_heavy` concorrente, N cloud, budget/dia); try/catch por ronda (nunca morre); escreve
     `_handoff/fleet/fleet-ledger.jsonl` (o formato já existe do dry-run 23-Jun). Reusa `_handoff/loop/sdk-runner.mjs`.
6. **Smoke DRY_RUN**: 2-3 pilares fake, prova caps respeitados + ledger atualiza + zero erro (sem gastar tokens).

## 🔒 GUARD
`classify.js` FROZEN (prova a sha no início e no fim) · `packages/overclock-moo` e restantes frozen NÃO tocar (`fleet-commander`
e `fleet-orchestrator` são ADIÇÕES) · **NUNCA merge/rebase de `feat/fleet-local-runner`** (regride o dia) · selective `git add`
(nunca `-A`) · **sem push/merge sem o OK do Paulo** · PT-PT conversa, inglês no código.

## ✅ GATE
`git --no-pager diff --stat main..HEAD` mostra **só adições** (fleet-commander + local-loop-runner + EVOLUTION_FLEET +
fleet-orchestrator + fleet.json) e **zero deleção** do trabalho de hoje · `npm test` verde no fleet-commander · DRY_RUN verde
(caps respeitados, resiliente) · sha intacta. Cola o `diff --stat main..HEAD` + o output do dry-run + confirma forecast/Project
Command intactos.

## ⏭ NEXT
Fase 3 — armar `council` + `seguranca` em loop REAL (STANDING_POLICY por pilar, 2-3 rondas, ledger honesto, **gate humano no merge**).

## 📋 BACK
`git --no-pager diff --stat main..HEAD` · `npm test` do fleet-commander · output do DRY_RUN · confirmação "forecast + Project
Command + AGENTS + roadmap intactos em main". Reporta a branch onde o trabalho aconteceu (`feat/fleet-orchestrator` em
`../frugal-fleet2`) e o estado git real (unpushed/uncommitted). **Nada de merge — o Paulo autoriza o irreversível.**
