📥 COLAR EM: CC · sessão EXISTENTE da VS-W1 (worktree frugal-vs-w1) — SOMENTE APÓS: F5 visual ok + merge do PR vs-w1 (ou autorização do Paulo p/ validar na branch)
🖥️🏁 VS-VAL DEMO E2E AUDITADA · vs-val-e2e-20260719
---
type: MASTERPROMPT
id: vs-val-e2e-20260719
from: cowork (brain)
to: claude-code (sessão VS-W1)
severity: high
generated_at: 2026-07-19
socio_pack: v1@manual (tier M)
---
⇄ COWORK → CC · MASTERPROMPT · VS-VAL — a mágica vira NÚMERO: demo E2E do ciclo completo, com recibo

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🎯 GOAL  Provar de ponta a ponta, MEDIDO, o loop que abriu este projeto ("nunca errar onde colar"):
  1. SETUP auditável: workspace de demo com `sessions.json` (2 sessões: uma active 🟡, uma parked 🅿️)
     + `dispatch-queue.json` com 2 itens reais (1 pending normal 📥, 1 severity:critical 🚨) —
     fixtures derivadas dos contratos VS-W0, NUNCA inventadas fora do schema (validador tem que passar).
  2. ROTEIRO DE DEMO (para o Paulo executar em F5, ≤10 passos numerados): beacon acende 📥 →
     [Copiar] → conteúdo no clipboard já endereçado → simular paste (estado pending→pasted na queue)
     → beacon avança p/ próximo → badge da worktree muda (🟡→🅿️ editando sessions.json) → ViewBadge
     decrementa → rodar 1 comando via runWithReceipt num terminal REAL → exit code + duração aparecem
     (provar fallback n/d também: 1 terminal sem shell integration).
  3. MEDIÇÃO (o recibo da mágica): cronometrar dispatch→clipboard (alvo <10s) · registrar no formato
     do ledger: `vs-val: <passo> · <resultado> · <ms>` por passo · contar: exit codes CAPTURADOS vs
     cegos (antes: 3 sendText cegos; depois: N com recibo) · baseline de erro de paste (3 em 3 dias,
     spec Semáforo §1) fica registrado como métrica a acompanhar pós-adoção (não dá p/ medir em 1 demo — honesto).
  4. RELATÓRIO: `_handoff/VS_VAL_REPORT_<data>.md` (≤120 linhas): checklist passo-a-passo c/ PASS/FAIL
     real, medições, screenshots que o PAULO capturar no F5 (tu não tens GUI — lista exata do que ele
     fotografa), gaps achados, e a linha p/ o Currículo Vivo.
🛡 GUARD  classify FROZEN · allowlist: APENAS arquivos de demo/fixture em pasta de demo (fora de src/)
  + o relatório em _handoff/ — ZERO mudança de código de produção nesta corrida (se a demo revelar
  bug → reporta no relatório, NÃO conserta em voo) · git add seletivo · sem push.
⚡ SE-ENTÃO  Se registry (75b947c) não estiver merged → valida o subset queue+gates (📥🔒🚨 + recibos)
  e marca estados de registry como `pendente merge` no relatório — NÃO simules o registry com uma
  2ª verdade. Se um passo falhar → FAIL honesto no checklist + segue os demais (a demo é diagnóstico,
  não teatro). Se o beacon/decoration não atualizar sem reload → registra a latência real observada.
✅ GATE  Validador do Codex passa nas fixtures da demo · todos os passos com PASS/FAIL + ms reais ·
  zero código de produção tocado (diff prova) · rodapé 🤝 SOCIO.
📋 BACK  HANDOFF v1.1 inline + o relatório gravado. O relatório alimenta: Vista C do fluxograma
  (primeiros números reais), Currículo Vivo do Paulo ("demo E2E auditada do Agentic OS") e o
  material do futuro teste-do-amigo (o roteiro da demo É o roteiro do amigo).
📮 DESTINO  CC sessão VS-W1 → BACK ao brain (moo-handoff-check) → Paulo executa o roteiro em F5 e
  devolve screenshots+tempos → brain consolida o relatório final.
