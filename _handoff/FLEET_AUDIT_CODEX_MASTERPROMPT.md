# ⇄ Cowork → Cowork(→Codex) · FLEET AUDIT — auditoria independente + fixes eficientes (2026-07-12)

> **Porquê Codex:** auditor independente já validado na casa (achou o P0 fail-open do Live Preview que
> o happy-path escondia). Quota OpenAI, não queima a semana Claude. Orquestração = conversa Cowork nova
> (padrão do runner `_handoff/wux-run` queue/results, gotchas conhecidos: briefs UTF-8 em
> `.codex-briefs/`, sandbox do codex bloqueia spawn → TESTES corre o verificador (Cowork/CC), modelo
> default da CLI actual).

## 0. Estado confrontado pelo Cowork (2026-07-12 09:00Z — leads, NÃO conclusões; o Codex confirma causa-raiz)
| Facto (disco) | Lead |
|---|---|
| 8 pilares GPU `stalled` desde 2026-07-08T13:13 (DIGEST do cronista) com **14.3GB VRAM livres** | Bug no caminho de geração pós-13:13 de 08-07 (não é contenção) — o quê partiu? (troca day-model? env do pm2? path? erro engolido?) |
| 4 pilares idle com **round 34361, 0 wins, delta n/d** + **11.454 shutdowns** no ledger desde 08-07 | O ciclo NÃO dorme 10min (ou reinicia em loop); idle roda em vazio a alta frequência = busywork + ledger a inchar (verificar tamanho/rotação) |
| Watchdog/pm2 saudáveis, heartbeat fresco, $0, sha OK, cronista U2 OK | O "nunca morre" funciona; falta o "**nunca gira em vazio**" — nenhum consumidor dos alertas `stalled` do DIGEST |
| Propostas dos pilares (amostra council r12: "sobe timeout p/ 15min") | Qualidade mediana: ataca sintoma, não o critério do charter — prompt de ronda precisa de auditoria |

## 1. ESCOPO da auditoria Codex (read-only primeiro; fixes só depois do relatório aprovado)
**Alvo:** worktree `frugal-fleet-arm` — `_handoff/fleet/**` (local-pillar.mjs · cronista · fleet-forever.mjs · fleet-watchdog.mjs · vram-preflight.mjs · ecosystem.config.cjs · fleet.json · ledger/DIGEST/STATE como evidência) + cruzar com as promessas: `_handoff/FLEET_TOTAL_MASTERPROMPT.md` (F4 endurecido) · §CHARTERS/§GPU-POLICY/§USAGE-RELIEF do `FLEET_FASE3_LAUNCH_HANDOFF.md` · doutrina vault (Full Moo: "só valor pendente real, nada de busywork" · ledger honesto · caps).

**Perguntas obrigatórias (mínimo):**
A. **Causa-raiz do stall** dos 8 pilares GPU (timeline no ledger ao redor de 08-07T13:13 + código do caminho de geração; erro engolido por fail-soft?).
B. **Porque o ciclo não dorme** (sleep? pm2 restart-loop? min_uptime?) e porque os idle re-entram a cada ciclo (staleness/quota `daysQuota` ignorada?). 11.454 ciclos/4 dias = ~2/min — confrontar com o desenho (6 rondas + sleep 10min).
C. **Ledger/disco**: tamanho actual, taxa de crescimento, rotação (a política era arquivar; existe?).
D. **Alerta sem consumidor**: desenhar o menor fix para `stalled`/incoerências do DIGEST terem consequência (ex.: watchdog lê DIGEST e alerta/para; ou linha no SYNC; ou notificação) — sem violar "cronista só reporta".
E. **Qualidade das rondas**: amostrar ≥6 OUTBOX de pilares distintos; classificar propostas (ataca critério do charter? é accionável? claims grounded?); propor a menor mudança no prompt-assembly do local-pillar que suba a qualidade (ex.: exigir referência explícita ao critério + 1 medição antes de propor).
F. **daysQuota/caps**: o orçamento diário por pilar está a ser respeitado? (34k rondas diz que não).

## 2. ENTREGÁVEIS
1. `_handoff/FLEET_AUDIT_REPORT.md`: findings P0→P3, cada um com **evidência colada** (linha de ledger/código) + causa-raiz + fix mínimo proposto + risco. Formato do LP_CODEX_AUDIT_REPORT (o padrão da casa).
2. Após OK do Paulo/Cowork ao relatório: **fixes mecânicos via Codex** (1 commit atómico por finding, testes; o verificador corre `node --test` fora do sandbox do codex). P0s primeiro. NO-SHIP de contínuo "perfeito" até P0s fechados.
3. Contabilidade: tokens Claude gastos (orquestração) vs findings/fixes entregues.

## 3. GUARD
Read-only até o relatório ser aprovado · depois: só `_handoff/fleet/**` na worktree fleet-arm · classify FROZEN (sha `427d8c0b…`) · a fleet pode continuar a correr durante a auditoria read-only; para fixes, usar STOP file → fix → testes → retirar STOP (janelas curtas, registadas) · sem push/merge (branch própria de fix = ok; PR draft ok) · ledger honesto: findings com evidência, nunca "acho que" · Codex nunca vê secrets/env.

## 4. GATE
Relatório com P0s confirmados-ou-refutados por evidência · fixes P0 aplicados+testados · prova pós-fix: 1 ciclo com os 13 pilares ok:true/idle-documentado · rondas/dia ≈ desenho (não 34k) · DIGEST stalled vazio · disco sob controlo (rotação viva) · qualidade: re-amostra de 3 OUTBOX melhor que baseline (juízo humano do Paulo, colados lado-a-lado) · sha intacta.
