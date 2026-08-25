📥 COLAR EM: Codex · corrida FRESCA, worktree própria (../frugal-reconcile) — lado DADOS da reconciliação
🚌🔧 E2E-RECONCILE-DADOS · reconcile-codex-20260720 · unificar fleet/savings + resolver conflitos de dados
---
type: MASTERPROMPT
id: reconcile-codex-20260720
from: cowork (brain)
to: codex
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier M)
contrato: _handoff/BUS_CANONICO_E_ORCHESTRATION_2026-07-20.md (a fonte única — LER §A antes)
---
⇄ COWORK → CODEX · MASTERPROMPT · reconciliar o lado DADOS (fleet · savings · conflitos)

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🧭 CONTEXTO: a E2E-INTEGRAÇÃO (tua) provou 4 gaps. Este doc resolve os do lado DADOS (o teu perfil).
  Trabalhas em paralelo ao CC (que faz o lado plugin) — áreas disjuntas, ambos contra o contrato do bus.

🎯 GOAL — na branch de integração, contra o BUS_CANONICO §A:
  G2 · **Fleet: produtor grava o id causal** — `local-pillar.mjs` carimba cada rollup com `source_event_id`
     (o mesmo id do bus dispatch-queue); `fleet-contrib` atribui por esse id (não timestamp). Sem id → n/d.
     Remove o produtor fake do teste (o gap que a auditoria apanhou) — teste com produtor REAL.
  G4 · **Savings honesto único** — landing/cronista deixam de publicar "cloud tokens avoided" cru; passam a
     usar `computeSavingsReceipt` (clamp≥0, `estimated:true`, contrafactual rotulado). Zero número fabricado.
  G5-dados · **Resolver os conflitos de dados** — `tools/router/package.json` (unificar o script `test`
     monolítico entre receipts+mesh+metrics) e `_handoff/fleet/fleet-orchestrator.mjs` (merge dos hunks
     mesh+metrics+landing). Prova com merge-sim limpo desses ficheiros.
📍 WHERE  worktree `../frugal-reconcile` · branch `feat/e2e-reconcile` (base = a ordem receipts→landing→mesh
  do BUS §A5; ou parte dela se o brain criar a base — confirma no recon). Fetch antes.
🛡 GUARD  classify FROZEN · **allowlist SÓ `tools/**` + `_handoff/fleet/**`** — PROIBIDO `packages/vscode-extension/**`
  (é do CC) · a métrica só carimba/lê, não muda routing · git add seletivo · sem push · `ring:null` até P0-4.
♻️ REUSE  fleet-orchestrator/local-pillar (carimbar, não recriar) · fleet-contrib.js (@5ddbb16 — a tua base) ·
  computeSavingsReceipt (@9ff1735 — não dupliques) · o schema do bus (dispatch-queue) para o id causal.
⚡ SE-ENTÃO  Se local-pillar não expuser ponto de carimbo → adiciona-o (é o gap #2). Se resolver package.json
  exigir decisão de qual script test fica → propõe e marca PENDING (não inventes). Se o contrafactual de
  savings não tiver pricing → n/d honesto, não fabrica.
❌ DO-NOT  Tocar plugin/UI (CC) · atribuir fleet por timestamp · publicar tokens locais como cloud evitado ·
  push/merge (Paulo) · features novas (é reconciliação).
✅ GATE  produtor real grava id (teste sem fake) · savings via computeSavingsReceipt · package.json+orchestrator
  resolvidos (merge-sim limpo prova) · node:test verde · 0 regressão · sha frozen · 🤝 SOCIO + council-mini.
📋 REGISTRO (tracking — obrigatório)  Carimba `_handoff/agent-sync/events.jsonl` com
  `{ts, from:"codex", to:"cowork", wave_id:"reconcile-codex-20260720", type:"reconcile", result}` e reporta
  no handoff: nº da linha do ORCHESTRATION LOG, ts BRT, resultado, e QUAIS gaps (G2/G4/G5) ficaram fechados
  vs pendentes. Isto alimenta o tracking do Paulo.
📋 BACK  HANDOFF v1.1 ≤4k via handoff-preflight --out · diff (FC-8) · gaps fechados/pendentes · a linha do
  tracking. 📮 DESTINO  Codex → BACK ao brain (moo-handoff-check) → costuro com o lado CC → gate Paulo.
