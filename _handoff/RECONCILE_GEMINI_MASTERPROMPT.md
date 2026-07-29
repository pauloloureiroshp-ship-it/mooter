📥 COLAR EM: Gemini · CLI `gemini` em ~/frugal · sessão FRESCA (NUNCA o painel) — verificação do WORKING TREE atual
🔎🚌 E2E-RECONCILE-VERIFY · reconcile-gemini-20260720 · o bus ficou ÚNICO? (verificação read-only ajustada ao teu alcance)
---
type: MASTERPROMPT
id: reconcile-gemini-20260720
from: cowork (brain)
to: gemini (CLI, candidato EM PROVAÇÃO — papel ajustado: verificas o WORKING TREE, não SHAs de branches)
severity: high
generated_at: 2026-07-20
role: verificador read-only do WORKING TREE ATUAL. Zero escrita.
---
⇄ COWORK → GEMINI · MASTERPROMPT · verificar que o bus ficou único (no que corre HOJE na tua árvore)

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras). AJUSTE DE PAPEL (aprendizado das tuas 2 corridas): tu
NÃO acedes a SHAs/branches arbitrários — o teu `gemini` CLI só vê o WORKING TREE ATUAL. Então esta tarefa
é DELIBERADAMENTE sobre o que está no checkout corrente. Regra de ouro: se um ficheiro NÃO existir na tua
árvore, diz `n/d — não no working tree`, NUNCA simules `git show`. A tua honestidade de 07-20 (marcar
"Simulado", n/d em vez de fabricar) foi notada e é o caminho — repete-a, mas agora EXECUTA de verdade os
greps no que existe.

🎯 GOAL — verificação READ-ONLY do WORKING TREE (cada item: CONFIRMO/REFUTO/n/d + comando REAL + output bruto):
  V1. **Quantos buses de dispatch existem?** grep por escritores/leitores: quem escreve
      `dispatch-queue.json` vs quem escreve `dispatch.jsonl`/`dispatch/*` no working tree? (grep -rn nos
      packages/src e tools). O objetivo da reconciliação é 1 bus só — conta os writers de cada.
  V2. **O semáforo lê o bus certo?** grep `dispatch-queue` em `packages/vscode-extension/src/semaforo-decorations.js`.
  V3. **O slot fleet está ligado ou n/d?** grep `fleet` em `row-renderer.js`/`semaforo-decorations.js` —
      é `n/d` honesto ou já lê `fleet-contrib`?
  V4. **Métrica fabricada?** grep `cloud.*avoid|avoided` em `_handoff/fleet/*` — há "cloud avoided" sem
      `estimated`/contrafactual? (é o gap #4).
  V5. **Veredicto:** no que corre na tua árvore HOJE, o bus está único ou ainda duplo? Onde ainda há gap?
🛡 GUARD  READ-ONLY (grep/cat/ls/node numa fixture — zero escrita) · comando REAL executado ANTES do
  output (não "simulado" — corre de verdade) · ficheiro ausente = `n/d — não no working tree` · PT-BR.
⚡ SE-ENTÃO  Se achares 2 buses ainda (writers de .jsonl E de dispatch-queue) → é o teu achado nº1, cita os
  2 writers com path:linha. Refutar "o bus está único" (se ainda estiver duplo) VALE MAIS que confirmar.
❌ DO-NOT  Escrever QUALQUER ficheiro · SIMULAR comandos (executa-os) · inventar path/SHA · usar o painel
  Code Assist · afirmar sobre branches que não estão no teu working tree (diz n/d).
✅ GATE (o juiz)  moo-handoff-check reproduz cada grep no working tree · ACEITO = readmissão gradual (esta
  é a tarefa CERTA para o teu alcance) + achado útil; n/d honesto continua melhor que fabricação.
📋 REGISTRO (tracking)  Reporta no handoff: ts BRT da corrida, resultado por V1-V5, e a linha para o
  ORCHESTRATION LOG (o Cowork carimba o events.jsonl por ti, já que és read-only).
📋 BACK  HANDOFF v1.1 INLINE (≤4k): tabela V1-V5 (item · veredicto · comando REAL · output bruto),
  veredicto do bus (único/duplo), TL;DR 5 linhas. 📮 DESTINO  Gemini CLI ~/frugal → BACK ao brain (juiz).
