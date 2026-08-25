📥 COLAR EM: CC · sessão EXISTENTE da VS-W1 (worktree frugal-vs-w1) — a que rodou o VS-VAL
🖥️🎬 VS-VISUAL · vs-visual-cc-20260719 · a UI viva no F5 (fixtures + roteiro + auto-check)
---
type: MASTERPROMPT
id: vs-visual-cc-20260719
from: cowork (brain)
to: claude-code (sessão VS-W1)
severity: high
generated_at: 2026-07-19
socio_pack: v1@manual (tier M)
---
⇄ COWORK → CC · MASTERPROMPT · VS-VISUAL — acender o semáforo no F5, com prova

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🎯 GOAL  Tornar a experiência visual REPRODUTÍVEL e AUTO-VERIFICADA, sem depender de olho humano
  para saber se está certo:
  1. FIXTURES DE DEMO commitadas numa pasta de demo (NÃO em src): `sessions.json` (4 sessões:
     working/parked/closed/working) + `dispatch-queue.json` (2 itens: 1 pending normal + 1
     severity:critical) — o Cowork já validou estas fixtures no validador do Codex (item-a-item);
     usa-as verbatim (anexo no fim) ou deriva equivalentes que passem o validador.
  2. SMOKE-TEST HEADLESS DE PROJEÇÃO (o truque anti-"n/d de screenshot"): teste que importa
     `semaforo-decorations` + `paste-beacon` e, dadas as fixtures, ASSERTA o resultado que a UI
     mostraria — badge esperado por worktree (frugal-registry→🚨 por precedência sobre working;
     frugal-vs-w1→🅿️; frugal-genesis→🟡; frugal-mesh-a→✅), cor charts.* por estado, texto do
     beacon (`📥 próximo: colar 🔐 registry…`), contagem do ViewBadge (=3). Isto PROVA a projeção
     por asserção mesmo sem GUI — é o recibo visual que faltava.
  3. ROTEIRO F5 (≤8 passos numerados) para o Paulo (ou o Cowork via computer-use) executar:
     abrir worktree → F5 (Extension Dev Host) → abrir a pasta de demo como workspace → conferir,
     na ordem, os 4 pontos: badge no Explorer · beacon na status bar (warning-bg) · nº no 🐮 ·
     terminal por lane com cor. Cada passo diz EXATAMENTE o que fotografar.
  4. RELATÓRIO `_handoff/VS_VISUAL_REPORT_<data>.md` (≤100 linhas): asserts PASS/FAIL do smoke-test
     (a prova mecânica) + a checklist do F5 para o humano + gaps.
🛡 GUARD  classify FROZEN · allowlist: pasta de demo (fixtures) + 1 arquivo de teste smoke +
  o relatório em _handoff/ — ZERO mudança no código de produção (semaforo/beacon/lane já aprovados
  @531a3b1; se o smoke revelar divergência da spec → reporta no relatório, NÃO corrige em voo) ·
  git add seletivo · sem push.
⚡ SE-ENTÃO  Se um assert do smoke divergir do esperado (ex.: precedência não aplica 🚨) → é BUG
  real encontrado: documenta com o valor obtido vs esperado, NÃO maquia o teste para passar.
  Se o registry (session-registry.js) não estiver na branch → o smoke usa as fixtures (é para isso
  que existem); marca no relatório que dados reais chegam no merge do registry.
✅ GATE  smoke-test verde (ou FAIL honesto documentado) · fixtures passam o validador do Codex ·
  0 código de produção tocado (diff prova) · roteiro F5 completo · rodapé 🤝 SOCIO.
📋 BACK  HANDOFF v1.1 inline + relatório. O smoke-test É a auditoria da experiência visual (prova
  sem GUI); o roteiro F5 é a experiência para o humano ver. Juntos fecham "auditar + validar + ver".
📮 DESTINO  CC sessão VS-W1 → BACK ao brain (moo-handoff-check confere os asserts) → Paulo roda o F5
  (ou autoriza o Cowork a dirigir via computer-use) com o roteiro.

— ANEXO · fixtures validadas pelo Cowork (podes usar verbatim):
sessions.json:
[
 {"session_id":"cc-genesis-01","worktree":"C:/Users/Paulo Loureiro/frugal-genesis","branch":"feat/genesis-tab","state":"working"},
 {"session_id":"cc-vsw1-02","worktree":"C:/Users/Paulo Loureiro/frugal-vs-w1","branch":"feat/vs-w1-semaforo","state":"parked"},
 {"session_id":"codex-mesh-03","worktree":"C:/Users/Paulo Loureiro/frugal-mesh-a","branch":"feat/mesh-phase-a","state":"closed"},
 {"session_id":"cc-registry-04","worktree":"C:/Users/Paulo Loureiro/frugal-registry","branch":"feat/session-registry","state":"working"}
]
dispatch-queue.json:
[
 {"severity":"high","id":"vs-w1-registry-20260719","lane":"registry","destino":{"agente":"claude-code","sessao_id":"cc-registry-04"},"created_at":"2026-07-19T12:00:00.000Z","corpo":"Colar o GO VS-W1 na sessao de registry.","estado":"pending"},
 {"severity":"critical","id":"blocker-mesh-20260719","lane":"mesh","destino":{"agente":"codex","sessao_id":"codex-mesh-03"},"created_at":"2026-07-19T12:05:00.000Z","corpo":"Conflito de rebase em fleet-orchestrator.mjs — para e reporta.","estado":"pending"}
]
