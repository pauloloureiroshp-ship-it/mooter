# KICKOFF — Correções de UX/UI do painel Moo Pilot (achados do teste A/B de 25/08, Cowork no Mac)
Executor CC no mac. MUTEX: aborta se _handoff/cc-sistema.log sem "=== fim". Suite verde obrigatória; classify.js FROZEN.
1. BUG repaint: o corpo do painel (:4290/panel) não re-renderiza — tab aberta 5h mostrou tudo de 12:09 rotulado "source live" (só a pill do header atualizava). Corrigir: refresh periódico do snapshot no cliente (ou SSE), e o rótulo do rodapé deve dizer a idade real do render quando >60s. Prova: journal do vault 20:35Z.
2. BUG frota: nome de device longo rende vertical (span 8×233px, overflow-wrap:anywhere sem min-width no card). Corrigir CSS: min-width/ellipsis+title. Reproduz com desktop-j26409q.
3. Painel: device com frescura "morto" (PC 3592s) aparece com pill "holding" sem idade proeminente — idade/estado morto deve dominar o card (multi-device confia nisto).
4. Beacon do PC sem pilar e engine n/d ("no pillar reported in this beacon") — alinhar schema do beacon win32 com o do mac.
5. Aceites da triagem de hoje para corrigir: StatuslineCard.tsx:78 (texto "routed cheap" mostrado quando d.routedCheap falso/nulo) · build-snapshot.js:247 (race: snapshot.preview atribuído após await sobre estado antigo — provável causa-mãe do nº1).
6. Cards do dono pendentes fora do alcance do Cowork: projecto activo divergente (cowork-session.json vs sessoes/mooter.json — decidir precedência) · preferences.json em falta (statusline_line3). Resolver ambos.
7. Contadores: após triagem, achados reconciliou 828→827 e descartado +1 (esperado +2) até novo fetch — verificar consistência de escrita do triagem.json (relaciona com o nº5-race).
Depois: relançar o loop via circuito (1-LANCAR-MOO.command) para carregar o código novo — NUNCA em paralelo com outro executor.
