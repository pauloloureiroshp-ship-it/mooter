# MASTERPROMPT — 🐮♾️ W4 · Autopilot Fleet (4 fases · GPU no talo · $0 · gate humano)

Hoje a frota estreou (auditoria $0 read-only, apanhou 1 bug real). Agora construímos a Fleet **contínua**: os
pilares a evoluir a solução **sem parar**, GPU **saturada**, **$0** local, com **gate humano no irreversível**.
4 fases **por ordem** — cada fase é worktree própria + gate. **NÃO avançar sem o gate da anterior.**

## Invariantes globais (hard)
- `classify.js` **FROZEN** (prova a sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`).
- Packages frozen intactos — só `packages/overclock-moo/` (Fase 1) e `_handoff/fleet/` (ficheiros novos).
- `git add` selectivo · **sem push sem OK** · **gate humano** no merge/push/deploy/secrets (a governança abaixo).
- **$0**: tudo local (Ollama). Cloud só com **budget cap** declarado.

---

## FASE 0 — Drenar o WIP (pré-requisito NÃO-negociável)
**Porquê:** a Fleet cria uma branch por pilar. 43 worktrees / 42 podáveis = ela nasceria no caos. Primeiro limpa.
**DO** (nativo, gate humano — nada de destrutivo sem verificar):
- `git worktree prune` (remove as stale). Depois `git worktree list` → remove as já-mergeadas (loss-proof) e as prunable: `git worktree remove <path>`.
- **Antes de remover cada uma: confirma que NÃO tem uncommitted por salvar** (o alerta-mãe). Se tiver, salva primeiro.
- Arquiva as 3 parked (`wave64-compaction-advisor`, `wave62_5-confidence-cascade`, `pilar/council`): `git tag archive/<name> <sha>` (preserva) → `git branch -D <name>`.
**Gate:** worktrees ≤ ~5 · 3 parked arquivadas (tag) · tree limpo em `main` · **nada perdido** (tudo em origin ou tag). Cola-me `git worktree list` + `git branch`.

## FASE 1 — Overclock Fase 2 (o motor: GPU saturada de verdade)
**Objetivo:** executor **concorrente** (batching) — hoje corre em série, a GPU não satura.
**Reusa:** `packages/overclock-moo/src/` (allocator.ts, **pool.mjs, runner.mjs**, metrics.ts, job-catalogue.ts).
**DO:**
- Lê o que `pool.mjs` + `runner.mjs` já fazem. Completa o **executor concorrente**: `batchRun(plan)` lança N jobs em paralelo no Ollama (continuous batching, KV-cache partilhado no modelo base residente), coleta em paralelo, **timeout per-job isolado** (1 falha ≠ mata o batch).
- `adaptive-batcher.ts`: descobre o **sweet-spot** da RTX 4090 + qwen3.6:27b (começa 2 slots; sobe se GPU idle; recua se satura). Guarda o sweet-spot medido.
- Instrumenta `metrics.ts`: amostra `nvidia-smi` / Ollama `/api/ps` **durante** o batch → `gpuUtil[]` (prova a saturação, sem fabricar).
- Respeita o cap de thermals/watt (o allocator já o tem).
**Gate:** DRY prova **batching real** (2+ jobs, ordem não-garantida nos resultados) + **GPU util medida sobe** vs série · `node --test` · sha intacta.

## FASE 2 — O orquestrador (`fleet-orchestrator.mjs`)
**Objetivo:** gerir os pilares — SPOQ scheduler, caps, ledger, resiliência.
**Reusa:** `_handoff/loop/sdk-runner.mjs` (governors + bus) + o **executor da Fase 1** + `packages/workflow/src/`.
**DO:**
- `_handoff/fleet/fleet.json`: os pilares (`id, workdir, priority, gpu_heavy, cloud_heavy, daysQuota`).
- `_handoff/fleet/fleet-orchestrator.mjs`: lê fleet.json + cada `STATE.json`; **SPOQ** (prioridade + round-robin justo); **caps hard** (1 `gpu_heavy` concorrente, N cloud, budget/dia); executor por ronda (sdk-runner **no worktree do pilar** = sem colisões); **try/catch por ronda (nunca morre)**; escreve `fleet-ledger.jsonl`; **meta-avaliador** (a cada N min reprioriza).
- Smoke **DRY_RUN**: 3 pilares fake, prova caps respeitados + ledger atualiza + zero erro.
**Gate:** DRY_RUN verde (caps respeitados, resiliente) · `node --test` · sha intacta.

## FASE 3 — Armar 1-2 pilares em loop REAL (arranque faseado — NÃO os 12)
**Objetivo:** ligar **council + seguranca** em loop real (não dry), validar, gate humano.
**Governança (STANDING_POLICY, por pilar):**
- **AUTO** (avança sozinho, reversível): próxima wave, refactors, evals locais, commits em branch própria, ficheiros novos.
- **DIGEST** (não-bloqueante, destrutivo): push/merge/deploy/secrets/apagar → vão para `DECISIONS.md` do pilar; o loop **continua noutras waves**.
- **Two-factor** (só tu): **merge para `main`** = recomendação + o teu OK.
**DO:**
- `_handoff/fleet/<pilar>/STANDING_POLICY.json` (council, seguranca) + charter + critério (council: oracle_gap ≤5%, p99 ≤100ms · seguranca: 0 leaks, audit 100%).
- Liga o orchestrator com **2 pilares reais**. Corre **2-3 rondas**. Cada pilar: mede→propõe→testa→ledger.
**Gate:** 2 pilares correm 2+ rondas reais · **$0** · GPU saturada (Fase 1) · ledger **honesto** (delta MEDIDO, não fabricado) · destrutivo foi para `DECISIONS.md` · **ZERO merge sem o teu OK**. Cola-me o `fleet-ledger.jsonl` + os `DECISIONS.md`.

---

## NEXT (só depois de 1-2 pilares provados)
Escalar aos 12 pilares (mesmo orchestrator, mais entradas no fleet.json) · Cockpit Fleet UI (F4, integra no plugin) · meta-avaliador cross-pilar (council melhora → seguranca re-red-team).

## Red-team embebido (as leis que impedem o desastre)
1. **WIP primeiro** (Fase 0) — senão a Fleet nasce no pântano.
2. **Faseado** (2 pilares, não 12) — validar antes de escalar.
3. **change ≠ improvement** — o ledger de cada pilar mede o delta real (oracle_gap, p99); regride → reverte (AUTO).
4. **Gate humano no irreversível** — merge/push/deploy = two-factor. A Fleet propõe, tu decides.
5. **$0 com budget cap** — cloud só com teto; a GPU local é a mão-de-obra.
