📥 COLAR EM: CC · sessão EXISTENTE da VS-W1 (worktree frugal-vs-w1) — lado PLUGIN da reconciliação
🚌🖥️ E2E-RECONCILE-PLUGIN · reconcile-cc-20260720 · unificar o bus no plugin + ligar fleet à strip
---
type: MASTERPROMPT
id: reconcile-cc-20260720
from: cowork (brain)
to: claude-code (sessão VS-W1)
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier M)
contrato: _handoff/BUS_CANONICO_E_ORCHESTRATION_2026-07-20.md (a fonte única — LER §A antes)
---
⇄ COWORK → CC · MASTERPROMPT · reconciliar o lado PLUGIN (bus único · fleet na strip)

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🧭 CONTEXTO: a E2E-INTEGRAÇÃO (Codex) provou que o dispatch e o semáforo usam BUSES incompatíveis — a
  "fila viva" nunca acenderia. Este doc unifica o bus no lado plugin. Trabalhas em paralelo ao Codex (lado
  dados) — áreas disjuntas, ambos contra o contrato do bus.

🎯 GOAL — contra o BUS_CANONICO §A:
  G1 · **Bus único no dispatch.js** — `dispatch.js` PARA de escrever `dispatch/dispatch.jsonl` próprio;
     passa a escrever no BUS ÚNICO `_handoff/agent-sync/dispatch-queue.json` com o shape completo
     `{id, lane, destino{agente,sessao_id}, severity, corpo, estado}` (schema VS-W0, validado). O semáforo
     já lê daí (@5599b55) → a fila viva passa a LIGAR (dispatch escreve → beacon acende → semáforo reflete).
  G3 · **Fleet na strip** — o slot `fleet` do chip (já existe, @5599b55, hoje n/d) passa a LER a projeção
     `fleet-contrib` por sessão (o contrato que o Codex produz do lado dados). Ausente → n/d honesto (não zero).
  G5-plugin · **Resolver o conflito de `extension.js`** (vs-w1 ↔ dispatch) + `webview-syntax.test.js`
     (conflito de base do dispatch) — reconciliar os hunks para o bus único conviver com o wiring do semáforo.
📍 WHERE  worktree frugal-vs-w1 · branch feat/vs-w1-semaforo (ou feat/e2e-reconcile se o brain criar a base —
  confirma no recon). Fetch antes.
🛡 GUARD  classify FROZEN · **allowlist SÓ `packages/vscode-extension/**`** — PROIBIDO `tools/**` (é do
  Codex) · reusa o schema do bus (não dupliques o writer — se o Codex fez a lib, consome-a) · git add
  seletivo · sem push · concat-only no webview (invariante WCOCKPIT).
♻️ REUSE  dispatch.js (@41b3ae2 — mudar só o destino de escrita) · semaforo-decorations (já lê o bus) ·
  paste-beacon · o contrato fleet-contrib do Codex (G3) · dispatch-queue.schema (validar o que escreves).
⚡ SE-ENTÃO  Se escrever no bus exigir um writer partilhado → coordena com o lado Codex (o writer é dados);
  se n/d, escreve JSON validado direto e marca PENDING. Se o conflito de extension.js for grande → PARA e
  reporta a estratégia antes de resolver. Se fleet-contrib ainda não existir → slot n/d, marca PENDING.
❌ DO-NOT  Tocar tools/router (Codex) · manter o bus duplo (o `.jsonl` próprio MORRE) · inventar fleet ·
  push/merge (Paulo) · redesign · features novas.
✅ GATE  dispatch.js escreve NO BUS ÚNICO (validado pelo validador do Codex) · o beacon acende quando o
  dispatch escreve (teste do loop) · slot fleet lê a projeção real (ou n/d) · extension.js/webview-syntax
  resolvidos · suite verde · 0 regressão · sha frozen · screenshot (tu ou Cowork via computer-use) ·
  🤝 SOCIO + council-mini.
📋 REGISTRO (tracking — obrigatório)  Carimba `_handoff/agent-sync/events.jsonl` com
  `{ts, from:"claude-code", to:"cowork", wave_id:"reconcile-cc-20260720", type:"reconcile", result}` e
  reporta no handoff: nº da linha do ORCHESTRATION LOG, ts BRT, resultado, gaps G1/G3/G5 fechados vs
  pendentes. Isto alimenta o tracking do Paulo.
📋 BACK  HANDOFF v1.1 ≤4k · diff · antes/depois do bus (o loop dispatch→beacon liga?) · a linha do tracking ·
  PENDING honesta. 📮 DESTINO  CC → BACK ao brain (moo-handoff-check) → costuro com o lado Codex →
  **Cowork valida VISUALMENTE via computer-use** (o beacon acende quando um dispatch entra) → gate Paulo.
