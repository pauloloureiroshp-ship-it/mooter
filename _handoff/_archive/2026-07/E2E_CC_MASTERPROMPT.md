📥 COLAR EM: CC · sessão EXISTENTE da VS-W1 (worktree frugal-vs-w1) — completa o kit de demo E2E
🎬🖥️ E2E-DEMO · e2e-demo-cc-20260720 · a experiência INTEIRA num F5 (o momento "aha")
---
type: MASTERPROMPT
id: e2e-demo-cc-20260720
from: cowork (brain)
to: claude-code (sessão VS-W1)
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier M)
---
⇄ COWORK → CC · MASTERPROMPT · E2E-DEMO — juntar tudo num F5 que prova a experiência ponta a ponta

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🧭 CONTEXTO: as peças existem isoladas (semáforo no cockpit ✅, recibos ✅, fila-schema ✅, fleet-metrics
  contrato ✅) mas o Paulo nunca as viu JUNTAS a funcionar num fluxo. Esta wave monta a demo E2E completa:
  um workspace de fixtures que aciona TODAS as superfícies ao mesmo tempo + um smoke-test que asserta o
  fluxo inteiro sem GUI. É a prova "a experiência funciona ponta a ponta", pré-merge.

🎯 GOAL — só `demo/` + relatório (zero código de produção novo):
  1. **Workspace de demo E2E** em `packages/vscode-extension/demo/e2e/`: `sessions.demo.json` (4 sessões
     nos estados working/parked/needsYou/idle-unpushed) + `dispatch-queue.demo.json` (2 itens: 1 paste,
     1 blocker — validados pelo validador do Codex) + `fleet-contrib.demo.json` (a métrica de fleet por
     sessão, no shape do contrato do Codex `fleet:{rollups,tokens,tok_per_s,cloud_avoided_usd,estimated:true}`).
  2. **Smoke-test E2E headless** (`e2e-projection.test.js`): dado o workspace, asserta a projeção
     COMPLETA de cada superfície ao mesmo tempo — chip do semáforo por sessão no cockpit (cor+estado) +
     campo fleet preenchido (do fixture) + beacon (se fila) + ViewBadge. Prova que TODAS as peças se
     compõem coerentes, não só isoladas.
  3. **Roteiro F5 E2E** (≤10 passos) no relatório: abrir a worktree → F5 → abrir `demo/e2e` como
     workspace → conferir na ORDEM: (a) chips do semáforo coloridos nas sessões do cockpit, (b) o campo
     fleet mostrando tok/s $0 por sessão, (c) beacon na status bar, (d) ViewBadge no 🐮. Cada passo diz o
     que fotografar.
  4. **Relatório** `_handoff/E2E_DEMO_REPORT_2026-07-20.md` (≤120 linhas): asserts PASS/FAIL do smoke +
     checklist F5 + o que ainda é n/d (fila viva real espera moo-dispatch; fleet real espera #257).
📍 WHERE  worktree frugal-vs-w1 · branch feat/vs-w1-semaforo (mesma). Fetch antes.
🛡 GUARD  classify FROZEN · allowlist SÓ `packages/vscode-extension/demo/**` + 1 test + o relatório —
  **ZERO mudança no código de produção** (semáforo/cockpit já aprovados @5599b55; se o smoke revelar
  divergência → reporta, não corrige em voo) · não tocar `tools/**` · git add seletivo · sem push.
♻️ REUSE  as fixtures VS-VAL existentes (`demo/vs-val/`) como base · `semaforoForSession`/`decorationSpec`
  (a projeção) · o contrato de fleet do Codex (o shape do `fleet-contrib.demo.json`) · o padrão do
  smoke-test do VS-VAL.
⚡ SE-ENTÃO  Se um assert compor errado (ex.: chip + fleet não renderizam juntos) → é BUG de integração
  real: documenta obtido vs esperado, NÃO maquia. Se o contrato de fleet do Codex ainda não estiver
  fixado → usa o shape declarado no masterprompt VS-FLEET-METRICS e marca `contrato provisório`.
❌ DO-NOT  Código de produção novo · tocar tools/ · inventar fila/fleet reais (é DEMO, fixtures rotuladas) ·
  push/merge (Paulo).
✅ GATE  smoke E2E verde (ou FAIL honesto) · fixtures passam o validador do Codex · 0 código de produção
  tocado (diff prova) · roteiro F5 completo · testes verdes · sha frozen · 🤝 SOCIO + council-mini.
📋 BACK  HANDOFF v1.1 ≤4k + relatório. O smoke É a auditoria E2E sem GUI; o roteiro F5 é a experiência
  para o Paulo VER tudo junto. Juntos fecham "validar a experiência end-to-end".
📮 DESTINO  CC → BACK ao brain (moo-handoff-check) → Paulo roda o F5 E2E (ou Cowork via computer-use) →
  o momento "aha": semáforo + fleet + beacon, tudo aceso no cockpit, ao mesmo tempo.
