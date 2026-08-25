📮 DESTINO: Gemini · CLI `gemini` em ~/frugal · sessão FRESCA (NUNCA o painel Code Assist)
   QUANDO: APÓS o Ledger (PRÓX-A) e a UX (PRÓX-B) landarem no teu working tree (checkout feito).
   Autodefesa: ficheiro ausente na tua árvore = `n/d — não no working tree`, PARA nesse item.
🔎📊 PRÓX-C · verify-ledger-gemini-20260720 · o Ledger NÃO fabrica? o custo mostrado bate com o medido?
---
type: MASTERPROMPT
id: verify-ledger-gemini-20260720
from: cowork (brain)
to: gemini (verificador read-only do WORKING TREE — readmissão gradual, honestidade comprovada 07-20)
severity: medium
generated_at: 2026-07-20
role: verificador read-only do WORKING TREE ATUAL. Zero escrita. Executa comandos de verdade.
---
⇄ COWORK → GEMINI · MASTERPROMPT · confirmar que a medição é honesta (zero número inventado)

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras). A tua corrida de 07-20 foi honesta (greps reais, `n/d`,
  V4 confirmado) — esse é o caminho. Repete: executa de verdade, ausente = `n/d`, nunca simular.

🎯 GOAL — verificação READ-ONLY (cada item: CONFIRMO/REFUTO/n/d + comando REAL + output bruto):
  W1. **O savings usa `computeSavingsReceipt`?** grep por `computeSavingsReceipt` e por `cloud.*avoid|avoided`
      cru em `tools/**` e `_handoff/**`. Se aparecer "cloud avoided" SEM `estimated`/contrafactual → REFUTA (fabricação).
  W2. **Campos sem medição são `n/d`, não zero?** grep no dashboard/statusline por como trata campo ausente —
      mostra `n/d` honesto ou finge zero/estimativa sem rótulo?
  W3. **O custo mostrado na UI lê o ledger real?** grep no plugin (`row-renderer`/statusline) — o número vem
      do ledger (`events.jsonl`/`snapshot.json`) ou é hardcoded/mock?
  W4. **Resume cronometrado ou PENDING?** grep por `resume`/`estimated` — o KPI ≤60s é medido de verdade ou
      marcado PENDING honesto? (PENDING honesto = OK; número inventado = REFUTA).
  W5. **Veredicto:** a medição é honesta (0 fabricação) ou há número sem fonte? Onde?
🛡 GUARD  READ-ONLY (grep/cat/ls — zero escrita) · comando REAL antes do output (corre de verdade) · ausente =
  `n/d — não no working tree` · PT-BR.
⚡ SE-ENTÃO  Achar QUALQUER número sem fonte de medição → é o teu achado nº1, cita path:linha. Refutar "é
  honesto" vale MAIS que confirmar — és o adversário da fabricação.
❌ DO-NOT  Escrever ficheiro · SIMULAR comandos · inventar path · painel Code Assist · afirmar sobre branches
  fora do working tree.
✅ GATE  moo-handoff-check reproduz cada grep · ACEITO = readmissão + achado útil.
📋 REGISTRO  Reporta ts BRT, resultado W1-W5, e a linha do ORCHESTRATION LOG (o Cowork carimba o events.jsonl).
📋 BACK  HANDOFF v1.1 INLINE (≤4k): tabela W1-W5 (item · veredicto · comando REAL · output) · veredicto de
  honestidade · TL;DR 5 linhas. 📮 DESTINO  Gemini CLI ~/frugal → BACK ao brain (juiz).
