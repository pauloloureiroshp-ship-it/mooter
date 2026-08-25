🖥️🧾 VS-W0+W2 CONTRATO+RECIBOS · vs-seam-codex-20260719
---
type: MASTERPROMPT
id: vs-seam-codex-20260719
from: cowork (brain)
to: codex (corrida única, worktree própria — papel: executor determinístico/instrumentação)
severity: high
generated_at: 2026-07-19
---
⇄ COWORK → CODEX · MASTERPROMPT · VS-W0 (contrato dispatch-queue) + VS-W2 (recibos de terminal)

⇄ ACK OBRIGATÓRIO (≤5 linhas): ENTENDI nas TUAS palavras + GUARDS + NÃO FAREI. Sem ACK = não corre.

🎯 GOAL  Duas entregas DETERMINÍSTICAS, zero LLM em runtime, zero UI:
  **VS-W0 — contrato de dados da fila de dispatch** (pré-condição de toda a frente):
  1. `tools/agent-sync/dispatch-queue.schema.json` — JSON Schema: `{id, lane, destino{agente,
     sessao_id}, severity, created_at, corpo_path|corpo, estado: pending|pasted|done}`; alinhado
     ao schema v1.1 (severity primeiro) e ao registry (destino por session_id, nunca por título).
  2. `tools/agent-sync/dispatch-queue-validate.js` — validador CLI (`node … <file>` → exit 0/1,
     erros por campo) + 4 fixtures (válida cheia · vazia · inválida-campo · inválida-destino).
  **VS-W2 — recibos de execução de terminal** (o fim do sendText cego):
  3. `packages/vscode-extension/src/terminal-receipts.js` — módulo standalone que expõe
     `runWithReceipt(terminalOpts, cmd) → Promise<{exitCode, durationMs, output?}>` usando
     `Terminal.shellIntegration.executeCommand` + `onDidEndTerminalShellExecution` (VS Code ≥1.93);
     fallback documentado: se `shellIntegration === undefined` após ~3s → `sendText` e devolve
     `{exitCode: null, receipt: 'n/d — shell integration indisponível'}` — NUNCA exit code inventado.
  4. `…/src/terminal-receipts.test.js` — unit com mock do namespace vscode (padrão dos testes
     existentes do pacote): sucesso, falha, timeout de shell integration, fallback n/d.
📍 WHERE  Worktree própria. Brief UTF-8 (gotcha conhecido). Sandbox codex bloqueia spawn → correr
  `npm test` no verificador/harness fora do sandbox se necessário e declarar ONDE correu.
🛠 DO  Day-0 recon: sha classify intacta · engines `vscode ^1.98` confirma shellIntegration stable ·
  ler 2-3 testes existentes do pacote p/ herdar o padrão de mock · confirmar que NENHUM arquivo teu
  existe já (se existir → PARA, reporta). Depois: implementar, testes, validador roda nas 4 fixtures.
🛡 GUARD  classify.js FROZEN (sha `427d8c0b…364bc48f`) · allowlist EXATA: os 6 arquivos acima e
  NADA MAIS — **PROIBIDO tocar `extension.js`** (wiring é do CC, VS-W1) · git add seletivo · sem .md
  novos na raiz · EN identifiers · engine packages intocados.
♻️ REUSE  (1) interna: padrão validador de `tools/handoff-preflight.js` (validateProjectionFrontmatter);
  padrão collector `sync-collector.js`; mocks dos `*.test.js` vizinhos. (2) pública: JSON Schema puro,
  sem dependência nova (zero-dep como o resto do repo; ajv PROIBIDO sem aprovação). (3) arquivo:
  `_handoff/SEMAFORO_MOO_UX_SPEC_2026-07-19.md` §5.2 define os campos da fila; schema v1.1 em
  `_handoff/HANDOFF_SCHEMA_V1.1_2026-07-19.md` (severity/ordem).
⚡ SE-ENTÃO  Se shellIntegration não disparar no teu ambiente de teste → mock only + marca
  `PENDING: validação manual em terminal real` (não finjas execução). Se o schema da fila conflitar
  com sessions.json real → PARA e reporta o conflito (não "resolvas" mudando o registry). Se a suite
  do pacote já estiver vermelha no baseline → reporta e segue só com os TEUS testes verdes.
❌ DO-NOT  UI/webview/decorations (CC) · tocar registry/sessions.json (CC, outra wave) · auditar e
  implementar na mesma corrida (papéis separados — esta corrida é implementação) · push/merge (gate
  Paulo) · exit code/número fabricado (fallback é `n/d`, sempre).
✅ GATE  4 fixtures → validador exit codes corretos · testes novos verdes (e baseline declarado) ·
  sha frozen no fim · seam de `terminal-receipts` documentado no topo do arquivo (3 linhas de JSDoc)
  p/ o CC ligar sem te perguntar nada.
⛔ STOP  Fim da corrida = branch local + diff no HANDOFF. Push é do Paulo.
📋 BACK  HANDOFF tipado v1.1 (≤4k): branch@sha, diff completo (FC-8 — Cowork não tem teu worktree),
  evidência por path:linha, onde `npm test` correu, PENDING honesta, DO-NOT sobrevivente ("wiring
  pendente no CC"). 📮 DESTINO  Codex · corrida única → BACK à sessão brain do Cowork
  (moo-handoff-check) → gate Paulo → CC consome o seam na VS-W1.
