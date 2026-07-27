# ⇄ Handoff Cowork → Cowork · Armar a Fleet de moos locais — GPU no talo, $0, por pilar

> **Objetivo (Paulo, 2026-07-06):** enquanto o cloud (extra usage) constrói o Live Preview MP5, pôr a **RTX
> 4090 no talo** com **moos locais** a evoluir **cada pilar** em loop contínuo, **$0**, com governança que
> impede qualquer desastre. Máximo trabalho na GPU, o cloud só para o irreversível/arquitectura.
> **Regra-mãe do dia:** disciplina de worktree (1 pilar = 1 worktree própria, commit atómico) — ver
> `_handoff/LIVE_PREVIEW_POSTMORTEM_PROTOCOL.md` (R1–R6). O caos de hoje nasceu de a ignorar.

## 1. Estado atual (o que já existe — REUSAR, não reconstruir)
- **12 pilares scaffolded, todos IDLE, 0 loop** (Fleet Console): `segurança · council · bench-eval · design ·
  integracoes-llm · lora-dora · matriz · quantizacao · site · skills · statusline · vscode-plugin`. Cada um tem
  `STATE.json` (idle 12-13d). Fonte read-only: `_handoff/fleet/*/STATE.json`.
- **Overclock Moo** (`packages/overclock-moo`) — o pool que **satura a 4090** com moos locais concorrentes
  (allocator + metrics + benchmark A/B). Ver [[project_mooter_overclock_moo]] / [[project_mooter_overclock_audit_fix]].
- **fleet-orchestrator** (`_handoff/fleet/fleet-orchestrator.mjs` + `feat/fleet-orchestrator`) — scheduler /
  lease / fsm / proof-gate. Ver [[project_mooter_fleet_commander_stale_branch]].
- **`fleet.json`** — roster + **caps** já definidos: `gpuHeavyConcurrent:1 · cloudConcurrent:2 · poolWidth:4 ·
  budgetUsdPerDay:5`.
- **`_handoff/FLEET_FASE3_ARM_MASTERPROMPT.md`** — masterprompt JÁ ESCRITO para armar **council + seguranca**
  em loop real (STANDING_POLICY + charter + critério de sucesso + 2-3 rondas + ledger honesto). **É o ponto de arranque.**
- **`~/.mooter` + Ollama qwen3:30b** na 4090 (6 moos locais capazes, $0). LOCAL MOO FLEET no cockpit.
- Blueprint dores×SOTA: `_handoff/MOOTER_PAINS_X_SOTA_BLUEPRINT.md` (fleet-by-exception, U2 GATE executável).

## 2. O que cada pilar-moo faz por ronda (o loop $0)
**mede** (estado atual vs critério de sucesso do charter) → **propõe** (uma melhoria) → **testa** (local, $0) →
escreve **`fleet-ledger.jsonl`** com o **delta MEDIDO** (nunca fabricado; `n/d` se não mediu). Se `change ≠
improvement` (regride) → **reverte** (via AUTO). GPU saturada usando o **pool concorrente do Overclock**.

## 3. Governança (o que torna isto SEGURO — STANDING_POLICY por pilar)
- **AUTO** (corre sozinho, reversível): próxima ronda, refactors, evals locais, commits em **branch/worktree própria do pilar**, ficheiros novos.
- **DIGEST** (não-bloqueante, destrutivo): push/merge/deploy/secrets/apagar → escreve em `_handoff/fleet/<pilar>/DECISIONS.md`; o loop **continua noutras rondas** (nunca executa o destrutivo).
- **Two-factor** (só o Paulo): **merge para `main`** = recomendação no DECISIONS.md + o OK humano. **NUNCA auto-merge/push.**

## 4. Plano faseado (arranque seguro — NÃO os 12 de uma vez)
- **Fase 3a · Provar com 1-2 pilares:** lançar `_handoff/FLEET_FASE3_ARM_MASTERPROMPT.md` (council + seguranca)
  → orchestrator REAL (não DRY_RUN) só com esses 2 → **2-3 rondas reais** → provar: **GPU saturada** (util medida
  sobe, do Overclock) · **$0** (Ollama local, zero cloud sem cap) · **ledger honesto** (delta medido) · todo o
  destrutivo foi só para `DECISIONS.md`. **1 pilar = 1 worktree própria** (disciplina de hoje).
- **Fase 3b · GPU no talo real:** confirmar que o **pool concorrente do Overclock** satura a 4090 (não o runner
  sequencial antigo — ver o gap em [[project_mooter_overclock_moo]]). Card vivo no cockpit mostra util%/VRAM/moos.
- **Fase 4 · Escalar aos 12:** mesmo orchestrator, mais entradas no `fleet.json`; definir charter + critério de
  sucesso de cada pilar restante; meta-avaliador cross-pilar. Fleet Console UI já mostra tudo read-only.

## 5. Guardrails (não-negociáveis)
- 🔒 `classify.js` **FROZEN** (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`).
- 🐮 **$0 local** (Ollama qwen3:30b na 4090); cloud só com budget cap (`budgetUsdPerDay:5`), respeitar `gpuHeavyConcurrent:1`.
- 🚦 **Gate humano no irreversível** (merge/push/secrets) — sempre two-factor.
- 📒 **Ledger honesto:** delta MEDIDO, nunca fabricado; `change ≠ improvement` → reverte. **U2 GATE executável**
  (bloco `gate:` yaml; um **moo local $0 re-corre como juiz independente** — mata o falso-verde).
- 🌳 **1 pilar = 1 worktree própria + commit atómico** (a régua que hoje custou trabalho perdido).
- **Térmico/watt:** respeitar o cap do allocator do Overclock (não fritar a 4090).

## 6. Questões a resolver (a nova conversa fecha)
1. O `fleet-orchestrator` está em `main` ou ainda em `feat/fleet-orchestrator`? Aterrar/confrontar primeiro (git real, não mount).
2. O Overclock (pool concorrente Fase 2) está em `main` ou WIP? Precisa dele para saturar a GPU.
3. Charters + critérios de sucesso dos 12 (só council+seguranca definidos no FASE3).
4. Como o cockpit mostra a GPU no talo ao vivo (util%/VRAM/moos/pilar) — Fleet Console já lê `STATE.json`.
5. Métrica de sucesso da Fleet: rondas/dia por pilar · % deltas positivos · GPU util média · $0 mantido.

## 7. Como arrancar (para a nova conversa)
1. Ler este brief + `_handoff/FLEET_FASE3_ARM_MASTERPROMPT.md` + `_handoff/MOOTER_PAINS_X_SOTA_BLUEPRINT.md` + [[project_mooter_autopilot_fleet]] · [[project_mooter_overclock_moo]] · [[project_mooter_fleet_commander_stale_branch]].
2. **Confrontar o git REAL** (orchestrator + Overclock: em main ou WIP?) antes de tocar.
3. Aterrar o que falta (orchestrator/Overclock), com disciplina R1–R6.
4. Lançar o FASE3 (council+seguranca) REAL, provar GPU saturada + $0 + ledger honesto em 2-3 rondas.
5. Só depois escalar aos 12. Voltar ao Paulo com: GPU util medida, ledger colado, decisão de escala.

---
**Contexto:** foco actual do Paulo = Live Preview MP5 (select-to-edit) no cloud. Esta Fleet corre **em paralelo,
$0, na GPU** — é a "mão-de-obra local" da missão do Mooter ([[project_mooter_vibe_coder_mission]]). Não descarrilar
o Live Preview; a Fleet é um track autónomo de background.
