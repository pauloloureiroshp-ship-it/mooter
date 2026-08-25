🖥️📥 VS-W1 SEMÁFORO C1 · vs-seam-cc-20260719
---
type: MASTERPROMPT
id: vs-seam-cc-20260719
from: cowork (brain)
to: claude-code (sessão FRESCA, worktree própria)
severity: high
generated_at: 2026-07-19
---
⇄ COWORK → CC · MASTERPROMPT · VS-W1 — Semáforo Camada 1 no cockpit (4 APIs, projeção pura)

⇄ ACK OBRIGATÓRIO antes de trabalhar (≤5 linhas, formato schema v1.1): ENTENDI nas TUAS palavras +
GUARDS QUE ME PRENDEM + NÃO FAREI. Silêncio ou eco do GOAL = dispatch não confirmado.

🎯 GOAL  Projetar o estado real das sessões (registry) na UI NATIVA do VS Code — zero webview nova:
  1. `src/semaforo-decorations.js` — FileDecorationProvider: pasta da worktree de cada sessão ganha
     badge emoji `<lane><estado>` (⚠ badge = string muito curta, ~2 chars é comportamento de runtime,
     não doc oficial — valida com teste) + ThemeColor por estado, `propagate:true`.
  2. `src/paste-beacon.js` — StatusBarItem persistente: `📥 próximo: colar 🔐 <id> [Copiar]`;
     clique copia o corpo do dispatch da fila; fila vazia → mostra gates (`🔒 N pushes te esperam`).
     backgroundColor SÓ `statusBarItem.warningBackground` (📥) e `errorBackground` (🚨) — issue
     #152053 é recusa explícita dos maintainers, NÃO tentar outras cores.
  3. `src/lane-terminal.js` — helper: `createTerminal` com `color` (terminal.ansi*) + `iconPath` por lane.
  4. ViewBadge no container `mooter`: nº de ações humanas pendentes (pastes na fila + gates).
  5. Wiring MÍNIMO em `extension.js` (≤30 linhas: requires + activate + dispose). Consome
     `dispatch-queue.json` + `sessions.json` via contrato/fixtures da VS-W0 (Codex).
📍 WHERE  Worktree própria a partir de main atualizado. 1 worktree = 1 sessão (lease).
🛠 DO  Day-0 recon PRIMEIRO (refuta premissas): (a) sha classify intacta; (b) VS-W0 entregue?
  (`tools/agent-sync/dispatch-queue.schema.json` + fixtures existem?); (c) registry merged?
  (`sessions.json` real com `worktree`+`state`?); (d) `npm test` baseline no pacote. Depois: módulos
  novos com teste unitário CADA (decorations map estado→cor; beacon estados fila-vazia/cheia/copiar;
  badge contagem), wiring, `vsce package`, screenshot real das 4 superfícies.
🛡 GUARD  `tools/router/classify.js` FROZEN (sha `427d8c0b…364bc48f`) · allowlist EXATA:
  `packages/vscode-extension/src/{semaforo-decorations,paste-beacon,lane-terminal}.js` + os
  `.test.js` respetivos + wiring ≤30 linhas em `extension.js` + `package.json` (contribuição de
  cores/menus se preciso) — NADA MAIS · git add seletivo (NUNCA -A) · sem .md novos na raiz ·
  PT-BR conversa / EN identifiers · packages engine intocados.
♻️ REUSE  (1) interna: fixtures VS-W0; padrão de item da status bar já existente (`createStatusBarItem`
  l.468); mode-registry/cowork-waiting p/ leitura de estado. (2) pública: nenhum pacote resolve
  (verificado 07-19 — Swarmify deprecado; nada de FileDecoration+queue pronto). (3) arquivo:
  `_handoff/SEMAFORO_MOO_UX_SPEC_2026-07-19.md` §4-§5 é a spec; segue-a, não a reinventes.
⚡ SE-ENTÃO  Se VS-W0 não entregue → PARA, reporta, NÃO inventes schema próprio. Se registry não
  merged → constrói contra fixture e marca o módulo `data: fixture` visível na UI (honest-copy).
  Se badge >2 chars falhar em runtime → 1 emoji só (estado), lane vai na cor+tooltip. Se wiring
  exigir >30 linhas em extension.js → PARA e reporta o porquê.
❌ DO-NOT  Tocar em `terminal-receipts.js`/`tools/agent-sync/` (são do Codex — colisão proibida) ·
  webview nova · proposed APIs (Agents window) · refactor do legado · push/merge/Marketplace (gate
  Paulo) · claim de eficiência sem recibo.
✅ GATE  Suite do pacote verde (baseline + novos) · sha frozen provada no fim · screenshot real
  (Explorer badge + beacon + ViewBadge + terminal colorido) · zero regressão nos testes existentes ·
  todo número/estado na UI com fonte (registry/fila) ou `n/d`.
⛔ STOP  Antes de push: gate Paulo (review diff + decisão PR). Irreversível nunca é teu.
📋 BACK  HANDOFF tipado v1.1 (≤4k) com: branch@sha, allowlist tocada vs declarada (diff), evidência
  por path:linha, screenshot, PENDING honesta, DO-NOT sobrevivente (ex.: "beacon em fixture até
  registry merge"). Rodapés council/CCA conforme template.
📮 DESTINO  CC · sessão FRESCA na worktree VS-W1 → BACK para sessão brain do Cowork (arbitragem
  moo-handoff-check) → gate Paulo.
