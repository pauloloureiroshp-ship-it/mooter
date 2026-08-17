---
name: moo-talo
description: Consola de rondas GPU-local do Mooter — abre UMA ronda bounded do pilar certo para este device, com mutex de GPU, orçamento de VRAM, recibos no vault e gate humano. Usar quando o Paulo disser "/moo-talo", "põe a GPU a trabalhar", "abre uma ronda", "o mac não pode ficar ocioso", ou ao iniciar sessão de trabalho autônomo num device.
---

# /moo-talo — a GPU não para, mas nunca mente

> Doutrina: `40-strategy/mooter-gpu-pilares-2026-08-15` (vault) + GOVERNANCA_MEO + Harmony Mesh.
> **Métrica banida:** % de utilização de GPU. **Métrica real:** recibos-que-passam-o-check por hora, dentro do orçamento de VRAM.
> A sessão Cowork é **consola + abridora de rondas** — o trabalho $0 corre no `local-loop-runner` host-side.
> **Estado real (verificado 2026-08-15, não presumido):** o runner ESTÁ em main desde `1c0c077a`
> (`_handoff/loop/local-loop-runner.mjs`, suite nativa verde), e o gate pré-dispatch — STOP em
> `~/.mooter/stop.json` a falhar fechado, folga de VRAM tri-estado, 1 pilar por GPU via lease —
> vive em `packages/fleet-commander/src/stop-gate.mjs`. Mesmo assim, **cada ronda tem princípio,
> meio, fim e recibo**: isso é desenho, não uma limitação temporária à espera de daemon.

## Passo 0 — ARRANQUE VERDE (obrigatório, nunca saltar)

1. `mooter_fleet({verbose:true})` → confirma: `local_available:true`, worktree livre, **jobs live**.
2. **Mutex de GPU:** se há job live de OUTRO pilar neste device → esta ronda **só mede** (passo MEDE), não despacha. Um pilar ativo por GPU de cada vez.
3. **STOP:** se `mooter_setup` mostrar bloqueio/STOP declarado → parar e reportar. Nada se despacha.
4. `device_bash`: `shasum -a 256 tools/router/classify.js` → tem de bater `427d8c0b516315c6…`. Divergiu → STOP + escalar ao MEO.
5. `mooter_setup({id:'<pilar>', project:'mooter-pilar-<X>', session_model:'<modelo desta sessão>', steps:[...]})` — o plano da ronda fica visível no painel.
6. Escolhe o pilar pela tabela device×pilar (abaixo) + rotação: **máx. 2 pilares/dia no total da frota**. Fila de decisões humanas ≥3 hoje → todos os pilares só medem.

| Device | Pilares elegíveis | Receita de modelos |
|---|---|---|
| Mac mini | P1 routing · P3 coerência · P6 produto (P4 é cron, não ronda) | gpt-oss:20b residente + leve (gemma4/qwen); NUM_PARALLEL>1 só nos pequenos; nunca servidor partilhado com >30B |
| PC RTX 4090 | P2 qualidade · P5 motor | pequeno (7-9B) RESIDENTE como verificador + 30B SOB DEMANDA — folga ≥2,2 GB sempre |
| MacBook | ronda curta de qualquer pilar | throttle 20-30 min — nunca lease longo |

## Passos 1-7 — a ronda

1. **MEDE ($0, L0):** roda a bateria da skill do pilar (`/moo-pilar-*`). Números com comando à vista, nunca opinião.
2. **PROPÕE (GPU, $0):** fila de `mooter_work({agent:'moo', cargo:'<CARGO>', wave:'<pilar>-<data>', goal:'<1 input fechado>'})` — 1 diff, 1 par claim↔código, 1 decisão por job. Output em formato verificável, flag `moo-draft`. ❌ Nunca 1 job agentic longo. ❌ Nunca `write:true` sem o Paulo pedir.
3. **TESTA:** `mooter_check({wave})` + validação determinística: citação existe (grep via `device_bash`), schema bate. **Default-FAIL** — draft nasce reprovado; só passa quando a evidência foi LIDA.
4. **REGISTA:** recibo no formato RECIBO_DE_FECHO (7 blocos, nenhum inventado, "o que NÃO verifiquei" obrigatório) + `mooter_journal({kind:'learning', wave, title:'Ronda <pilar> <data>', body:<recibo>})` + `mooter_setup({sessao:'registar', feito, por_fazer, proximo})`.
5. **GATE HUMANO:** drafts sobrevivem como propostas no digest — **1 digest consolidado, ≤3 decisões/dia**. Push, merge, delete, troca de modelo residente, faixas do scorecard: sempre Paulo. A skill NUNCA executa o irreversível.
6. **REVERTE:** regressão pós-apply → revert + evento no ledger + caso entra no golden set do P2.
7. **CONTINUA OU FECHA:** enquanto (a) a fila L0 tem itens, (b) o orçamento da ronda não estourou (defina no passo 0: nº de jobs ou minutos), (c) não há STOP — despacha o próximo lote. Senão: fecha com recibo. Só oferece criar tarefa agendada DEPOIS de a ronda manual correr verde uma vez.

## Regras que não se negoceiam

- **Evidência ou `n/d`.** Recibo é composição do ledger/git/disco — nunca redação livre.
- **"Poupança" é palavra proibida** em recibo até existir A/B pareado. Reporta: custo real, tokens locais medidos, custo de fronteira da sessão (inclui a TUA quota).
- **Folga de VRAM ≥2,2 GB** é restrição bloqueante: não cabe → o job não despacha (veto MOO), não "tenta e reza".
- **1 pilar = 1 worktree = 1 device por vez.** Dois writers no mesmo repo nunca.
- Moos = transforms bounded single-shot. Nunca agentic <30B, nunca escrita canônica direta.
- Perguntas de gauntlet sem comando L0 declarado não se fazem em loop — vão para a revisão trimestral do Paulo.
- Fecha SEMPRE com no máximo 3 ações sugeridas e no máximo 1 pergunta.
