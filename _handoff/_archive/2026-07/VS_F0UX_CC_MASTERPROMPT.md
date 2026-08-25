📥 COLAR EM: CC · sessão FRESCA na worktree própria (../frugal-f0ux) — DEPOIS de 2 merges: #260 (vs-w1) E feat/ledger-receipts (a fonte do Codex)
🖥️🧹 VS-F0UX v3 · vs-f0ux-cc-20260719 · higiene de confiança + ligar ao contrato de savings do Codex
---
type: MASTERPROMPT
id: vs-f0ux-cc-20260719
from: cowork (brain)
to: claude-code (sessão FRESCA)
severity: high
generated_at: 2026-07-19
socio_pack: v1@manual (tier M)
base_audit: _handoff/MOOTER_BOTAO_A_BOTAO_2026-07-19.md (D1–D5)
contrato_codex: feat/ledger-receipts @9ff1735 (computeSavingsReceipt — fonte única, ACEITO pelo brain)
---
⇄ COWORK → CC · MASTERPROMPT · VS-F0UX — os defeitos de confiança + ligar a fonte única de savings

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🧭 CONTEXTO: o Codex já resolveu a RAIZ do D1 (fonte única `computeSavingsReceipt()` em
  `tools/router/savings-tracker.js:140-160`, que NUNCA emite negativo — clamp a 0, negativo só em
  `raw_delta_usd`/`excess_cost_usd` rotulado). TU fazes o lado UI: ligar Cockpit e Control a essa
  fonte e rotular. Não recalcules savings — LÊ o contrato do Codex.

🎯 GOAL — 5 defeitos, por prioridade de "fisga do amigo":
  D1 🔴 **Savings inconsistente/negativo** — LIGAR a UI ao contrato do Codex (não recalcular):
     · Cockpit lê `tasks[].savings.routing_advisory` (rotular **"estimativa de routing · advisory"**) —
       trocar os aliases antigos em `packages/vscode-extension/src/extension.js:10086-10098`.
     · Control/Mission Control lê `tasks[].savings.execution_receipt` (rotular **"execução medida"**) —
       `mission-control-view.js:254-258` ("poupado hoje") passa a usar `saved_usd` (já clamped ≥0);
       o `-$109.39` do `host-extra.js:1925-1929` deixa de vazar (usar a fonte, não o cálculo local).
     · Regra: NUNCA exibir negativo em "poupado"; se quiseres mostrar o excesso, usa `excess_cost_usd`
       num campo separado e rotulado. Cockpit e Control passam a NÃO se contradizer (métricas
       diferentes, cada uma rotulada — não fundir).
  D2 🔴 **hardware n/d** no header/GPU → mostra o real (gpu-stream/gpu-monitor) OU esconde o chip
     (degrada; nunca "n/d" na cara do user).
  D3 🟡 **`toggleProject` não persiste** (extension.js:961 grava via `extra.preferences.__set`
     inexistente; host-extra:118 só lê) → implementa o `__set` (escrita atómica, padrão do host-extra)
     OU remove a ilusão de persistência.
  D4 🟢 **`archMode`+`auditFilter`** enviam `send()` MORTO ao host → remove a mensagem morta (mantém
     o comportamento client-side).
  D5 🟡 **`refreshIntegrations`** (extension.js:974) só carimba hora local → renomeia o rótulo para a
     verdade ("marcar como visto") OU implementa o sync (fora de escopo → renomeia).
📍 WHERE  worktree própria `../frugal-f0ux` · branch `feat/f0-ux-trust` · from origin/main APÓS
  #260 E ledger-receipts merged (fetch antes; se algum não mergeou → PARA e reporta).
🛡 GUARD  classify FROZEN `427d8c0b…` · packages engine intocados · allowlist EXATA (webview/host que
  tocas — declara no ACK) · **NÃO tocar `tools/router/**`** (é do Codex; tu só CONSOMES o contrato) ·
  git add seletivo · zero feature nova · não fundir os 2 webviews (god-mode F2) · sem push.
🛠 DO  Day-0 recon: os 2 merges aterraram? · `computeSavingsReceipt` existe em savings-tracker.js? ·
  confirma os aliases antigos em extension.js:10086-10098 antes de trocar · teste por correção (data.test.js).
♻️ REUSE  contrato do Codex (`computeSavingsReceipt` — só ler) · gpu-stream/gpu-monitor (D2) · escrita
  atómica do host-extra (D3) · row-renderer/mission-control-view (render).
⚡ SE-ENTÃO  Se a fonte do Codex não estiver merged → PARA (não recalcules savings tu mesmo, seria 2ª
  verdade). Se hardware indisponível headless → esconde. Se um "controlo morto" for feature não-ligada →
  PENDING de decisão, não inventes comportamento.
❌ DO-NOT  Recalcular savings (usa a fonte) · tocar tools/router · inventar número · fundir webviews ·
  push/merge (Paulo).
✅ GATE  D1–D5 fechados com ANTES/DEPOIS · **Cockpit e Control mostram números coerentes e rotulados,
  zero negativo em "poupado"** · testes verdes · 0 regressão · sha frozen · screenshot (tu ou Cowork via
  computer-use) · rodapé 🤝 SOCIO + council-mini.
📋 BACK  HANDOFF v1.1 ≤4k · diff · antes/depois de cada D · PENDING honesta.
📮 DESTINO  CC → BACK ao brain (moo-handoff-check confere o contrato ligado) → Paulo → **Cowork valida
  VISUALMENTE via computer-use** (Cockpit "estimativa" + Control "execução medida", sem -$). Sobe 6.5→~8.
