# Fleet View — cockpit tab "🚀 Fleet" (brief para o loop construir)

Objetivo: um PAINEL ÚNICO no plugin VS Code onde o Paulo vê TODOS os pilares a evoluir ao vivo (sem abrir 12 sessões). Depende do F1 (fleet.json + buses por pilar em _handoff/fleet/<pilar>/).

CONSTRUIR (aditivo, no estilo real de packages/vscode-extension):
1. `packages/vscode-extension/src/fleet-view.js` (módulo, espelha cockpit-loop.js):
   - `readFleet(repoRoot)`: lê fleet.json + cada `_handoff/fleet/<pilar>/{STATE.json,ledger.jsonl,heartbeat.json,ASK_HUMAN.md}` (fs PURO, sem spawn). Robusto: lê o transcript completo, tolera ficheiros truncados/ausentes.
   - `renderFleetTab(fleet)`: 1 cartão por pilar — nome, pill de estado (cc_running/awaiting_eval/awaiting_human/done/stopped), round/maxRounds, última linha do ledger (ok/ts), último DID, indicador de gate (se ASK_HUMAN), custo. Header global: nº running/queued/awaiting-human, custo total, slot de GPU em uso. Botões Aprovar/Parar POR pilar (data-attr CSP-safe `data-fleet="approve:<pilar>"` etc., listener delegado — ver a adaptação D2 do cockpit-loop.js). CSS escopado sob `.fleetwrap`.
   - exports: readFleet, renderFleetTab, approvePillar, stopPillar.
2. Wiring em extension.js (6 pontos, como o cockpit-loop): require, tab estática `data-v="fleet"` + `#v-fleet`, snapshot.fleetHtml=renderFleetTab(readFleet(repoRoot())) em DataService.refresh (fs puro, respeita overlap-guard), casos onDidReceiveMessage (fleetApprove/fleetStop por pilar), comando `mooter.openFleet`.
3. Smoke: com 2-3 buses de pilar fake, o tab mostra os cartões e os botões disparam.

INVARIANTES: classify.js FROZEN (sha 427d8c0b...364bc48f). 100% aditivo (não tocar engine frozen). git add seletivo. NUNCA merge/push para main (gate humano). Alimenta Notion+vault no fim.
Termina com bloco status. DONE:yes só com o tab a renderizar os pilares + smoke verde + Notion/vault.
