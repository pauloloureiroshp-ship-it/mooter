# ⇄ COWORK → CC · Fleet Fase 3 — armar council + seguranca em loop REAL (GPU no talo, $0, com travões)

> A frota está montada e à espera: `_handoff/fleet/fleet-orchestrator.mjs` + `fleet.json` (roster + caps) **em main**;
> o Overclock F2 (pool concorrente que satura a 4090) **em main**; os 12 pilares scaffolded (`STATE.json`, idle 11d).
> Falta o último passo: **armar 1-2 pilares em loop real** (NÃO os 12 — arranque faseado). Confronto Cowork 2026-07-04.
> `classify.js` FROZEN · **gate humano no irreversível** · $0 local · sem merge/push sem OK do Paulo.

## 🎯 GOAL
`council` e `seguranca` a evoluir sozinhos em loop contínuo — medir→propor→testar→ledger — com a GPU saturada a $0 e
governança que impede qualquer desastre. Prova de que a mão-de-obra $0 do Mooter funciona, antes de escalar aos 12.

## 🚦 A governança que torna isto SEGURO (STANDING_POLICY por pilar)
- **AUTO** (corre sozinho, reversível): próxima ronda, refactors, evals locais, commits em branch própria do pilar, ficheiros novos.
- **DIGEST** (não-bloqueante, destrutivo): push/merge/deploy/secrets/apagar → escreve em `_handoff/fleet/<pilar>/DECISIONS.md`; o loop **continua noutras rondas** (nunca faz o destrutivo).
- **Two-factor** (só o Paulo): **merge para `main`** = recomendação no DECISIONS.md + o OK humano. **NUNCA auto-merge.**

## ▶ DO (worktree `../frugal-fleet-arm`, branch `feat/fleet-arm`, from main · Sonnet)
1. `_handoff/fleet/council/STANDING_POLICY.json` + `_handoff/fleet/seguranca/STANDING_POLICY.json` (AUTO/DIGEST/two-factor acima) + **charter** (norte de 1 linha) + **critério de sucesso**: council = `oracle_gap ≤5% · p99 ≤100ms`; seguranca = `0 leaks · audit 100%`.
2. Liga o **orchestrator REAL** (não DRY_RUN) só com estes 2 pilares (`fleet.json` já tem o roster; respeita os caps: `gpuHeavyConcurrent:1 · cloudConcurrent:2 · poolWidth:4 · budgetUsdPerDay:5`).
3. Corre **2-3 rondas reais**. Cada pilar por ronda: **mede** (o estado atual vs critério) → **propõe** (uma melhoria) → **testa** (local, $0) → escreve `fleet-ledger.jsonl` com o **delta MEDIDO** (nunca fabricado; `n/d` se não mediu).
4. GPU no talo: usa o **pool concorrente do Overclock** (`packages/overclock-moo`) para saturar a 4090 com os moos locais dos 2 pilares. Respeita o cap térmico/watt do allocator.
5. Qualquer destrutivo (push/merge) → só uma **linha em DECISIONS.md**, nunca executado.

## 🔒 GUARD
`classify.js` FROZEN (prova a sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) · caps do `fleet.json` respeitados (1 gpu_heavy concorrente, budget $5/dia) · **NUNCA merge/push** (two-factor = Paulo) · ledger honesto (delta medido, `change ≠ improvement` → regride → reverte via AUTO) · $0 local (cloud só com budget cap) · selective `git add` · PT-PT / inglês código.

## ✅ GATE
2 pilares correm **2+ rondas reais** · **$0** provado (Ollama local, zero cloud sem cap) · GPU saturada (util medida sobe, do Overclock) · `fleet-ledger.jsonl` **honesto** (delta MEDIDO, não fabricado) · todo o destrutivo foi para `DECISIONS.md` (nada executado) · `classify.js` sha intacta · **ZERO merge sem o OK do Paulo**. Cola o `fleet-ledger.jsonl` + os `DECISIONS.md`.

## ⏭ NEXT (só depois de 2 pilares provados)
Escalar aos 12 (mesmo orchestrator, mais entradas no `fleet.json`) · meta-avaliador cross-pilar · Fleet Console UI no cockpit já mostra tudo read-only.

## 📋 BACK
Branch (git-write worktree) · `fleet-ledger.jsonl` (as rondas) · os `DECISIONS.md` (o que espera o teu gate) · `git --no-pager diff --stat main..HEAD` (só adições) · sha intacta. **Nada de merge/push — o Paulo autoriza o irreversível.**
