# ⇄ COWORK → CC · WAVE RUNNER — a fila inteira de waves, da maior prioridade à menor, SEM parar e SEM caos (2026-07-10)

> **És o executor sequencial da fila de waves do Mooter.** Uma wave de cada vez (R3 — o postmortem de
> 05-07 é lei), cada uma na SUA worktree, gate executável entre elas, checkpoint em disco após cada uma.
> Corres até: fila vazia · STOP file · quota semanal >90% · ou gate humano bloquear TUDO (nunca deve —
> o que é do Paulo vai para a fila dele e TU SEGUES para a próxima wave).
> **Contexto confrontado (2026-07-10, NÃO redescobrir):** fleet 13 pilares corre 24/7 em pm2 (NÃO lhe
> toques — trilho paralelo) · Live Preview MP5 corre no cloud (NÃO dupliques) · draft PRs
> feat/fleet-arm + feat/quota-aware podem já existir (verifica com `gh pr list`) · tree `~/frugal`
> partilhado por N sessões (INTOCÁVEL salvo Onda-0 docs-only).

## 🧼 REGRAS DA SESSÃO (token-diet + disciplina)
Sonnet · zero subagents · context7 off · R2 commit atómico · **R1/R5**: worktree nova POR WAVE a partir
de main ATUAL (`git fetch` antes) · **R6**: `git worktree remove` + prune ao fechar cada wave · sha
classify `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` provada no início de cada
wave · **NUNCA merge/push para main** (drafts PR sim; merge = Paulo) · destrutivo → DECISIONS · PT-PT/EN.

## 🛑 TRAVÕES (verificar ANTES de cada wave — 30s)
1. `_handoff/waves/STOP` existe → pára limpo (escreve estado e sai).
2. `~/.mooter/quota-live.json` fresco: `seven_day_pct > 90` → pára e regista "quota-guard" no estado.
   Ficheiro ausente/stale → fail-soft: continua mas regista `quota: n/d` (honesto, nunca inventar).
3. Heartbeat da fleet >20min sem STOP dela → incident no teu relatório (o watchdog dela devia agir; tu
   NÃO ages — só reportas).

## 📒 CHECKPOINT (após CADA wave — o §RESUME depende disto)
Actualiza `_handoff/waves/RUNNER_STATE.md`: wave · branch · sha final · gate PASS/FAIL · PR draft (link)
· pendências Paulo geradas · próxima da fila. Commit docs-only deste ficheiro na worktree da wave.

## 🎯 A FILA (executar por esta ordem — prioridade do roadmap v3 × estado real 2026-07-10)

| # | Wave | O que fazer | Modo/limite |
|---|---|---|---|
| 0 | **HARMONY CLOSER** (se gates ainda abertos) | Executa `_handoff/FLEET_HARMONY_CLOSER.md` F1→F4 (verifica primeiro o que já está: DECISIONS + `pm2 ls` + PRs) | usa a worktree fleet-arm EXISTENTE (excepção ao R5 — é continuação) |
| 1 | **W-LAND · Aterragem em lote** | Inventaria branches com trabalho gated não-merged (`git branch -a` + PRs abertos): para cada uma, gate executável (testes+sha) → draft PR com corpo denso → linha na fila do Paulo. NÃO resolvas conflitos à força — conflito = reporta e segue | 1 worktree de inspecção read-only; ≤2h |
| 2 | **W3 · Distribuição/First-Magic** | Onboarding <5min p/ não-dev (card Notion "First-Magic"): detecção de prontidão → guia 1-clique → prompt-demo routed local $0; republicar vsix actual (CI tag, SEM publish sem OK — prepara e pede) + `/install` E2E verde | worktree `wave-w3`; gate: install E2E + lighthouse ≥95 |
| 3 | **W-UX · Live Sessions clean** | Executa o brief `_handoff/COCKPIT_LIVE_SESSIONS_UX_BRIEF.md` (§3: confronto → inventário de controlos → implementação). A lista de remoções vai para a fila do Paulo; implementa o resto | worktree `wave-ux`; gate do brief |
| 4 | **W15 · CTO Command Deck Fase 0+1** | `_handoff/CTO_COMMAND_DECK_SPEC.md` — SÓ Fase 0 (tokens) e Fase 1 (espinha+inbox). Fases 2-5 voltam à fila como itens novos no fim (re-prioritização honesta: são L) | worktrees do spec; gates do spec |
| 5 | **W6 · Budget/Economics spans** | Span-level cost no cockpit Economics + `est_cloud_tokens_avoided` do fleet-ledger + quota-live chip wire (sinergia MP-Q) | worktree `wave-w6` |
| 6 | **W5 · Moo Loop Sessions** | `+New` multi-tipo (Loop/Schedule) + Fleet Console expand (respeitando slot W15) | worktree `wave-w5` |
| 7 | **W7 · Forge nightly (Schedule)** | NÃO treinar agora: escreve o schedule + runbook (LORA_TRAINING_RUNBOOK existe) + charter lora-dora já cobre a mão-de-obra; instala schtasks nightly SÓ com dry-run validado | worktree `wave-w7`; gate: dry-run |
| 8 | **FRONTIER specs (W8 speculative · W9 TTL)** | 1 spec executável cada (design doc + bench plan $0 delegado à fleet via INBOX dos pilares integracoes-llm/bench-eval) — NÃO implementar engine | docs-only; ≤1h cada |

**Régua de delegação (harmonia com a doutrina):** antes de codificares QUALQUER coisa numa wave,
pergunta "a fleet consegue fazer isto em rondas $0?" — SIM → escreve INBOX/charter-update do pilar
certo e passa à frente (máxima delegação ao local); NÃO (irreversível/UI/arquitectura) → é teu.

## ✅ GATE GLOBAL (quando a fila esvaziar ou um travão disparar)
RUNNER_STATE.md completo · cada wave: gate PASS ou FAIL+razão (zero silêncio) · todos os PR drafts
listados · fila do Paulo consolidada em `_handoff/waves/PAULO_QUEUE.md` (merges · publish · remoções UX
· admin) · worktrees limpas (R6) · sha intacta em todas · fleet continuou viva (heartbeat testemunha) ·
relatório final ≤20 linhas: waves DONE/SKIP/FAIL + o delta que o Mooter ganhou hoje.

## 🔁 §RESUME
Sessão fresca: "Continua `_handoff/WAVE_RUNNER_MASTERPROMPT.md`. Lê `_handoff/waves/RUNNER_STATE.md`
— retoma na primeira wave sem gate PASS. NUNCA refaças wave committed/gated."
