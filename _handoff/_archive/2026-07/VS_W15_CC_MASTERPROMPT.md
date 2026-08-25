📥 COLAR EM: CC · sessão EXISTENTE da VS-W1 (worktree frugal-vs-w1) — completa a feature ANTES do merge do #260
🖥️🎬 VS-W1.5 · vs-w15-cc-20260719 · o semáforo VIVO no cockpit (onde o Paulo olha) + fila
---
type: MASTERPROMPT
id: vs-w15-cc-20260719
from: cowork (brain)
to: claude-code (sessão VS-W1)
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier M)
base_audit: _handoff/MOOTER_SEMAFORO_GAP_2026-07-20.md (o gap: semáforo invisível na rotina do Paulo)
---
⇄ COWORK → CC · MASTERPROMPT · VS-W1.5 — pôr o semáforo ONDE O PAULO OLHA e ligá-lo à fila

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🧭 CONTEXTO (o achado que muda tudo): auditoria ao vivo no VS Code do Paulo — ele "não viu diferença"
  porque (a) abre o repo como PASTA ÚNICA, então os badges de worktree do FileDecoration não têm o que
  decorar; (b) o semáforo não vive no cockpit, que é onde ele OLHA; (c) o beacon/badge dependem de uma
  fila vazia. A VS-W1 está tecnicamente perfeita e experiencialmente invisível. Esta wave conserta ISSO —
  na MESMA branch vs-w1 (completa a feature; o #260 só mergeia quando o semáforo estiver VIVO).

🎯 GOAL — 2 partes, a Parte 1 é o impacto imediato:
  **P1 · LIVE SESSIONS STRIP no cockpit (semáforo ONDE o Paulo já olha):** no cockpit (a Live Sessions
     strip existente em mission-control-view/mc-snapshot), pintar CADA sessão com a cor+emoji do estado
     do semáforo — reusa `decorationSpec()`/STATES de `semaforo-decorations.js` (a MESMA fonte, sem 2ª
     verdade). Uma linha por sessão: `[lane-emoji] [estado-cor+emoji] [verbo 1 palavra] [tempo] [fleet
     tok/s $0]`. Regra anti-vanity A10: a linha só existe se muda decisão (cor diz colar/esperar/relay/
     decidir). Assim o Paulo VÊ o semáforo no painel que ele abre, sem depender de layout multi-root.
  **P2 · Beacon dentro do cockpit + consumo da fila:** ler `dispatch-queue.json` (contrato VS-W0); se
     houver item pending endereçado → mostrar no topo do cockpit "📥 próximo: colar 🔐 <id> [Copiar]"
     (além da status bar). Fila vazia → mostrar os gates (honest-copy). Degrada limpo se o ficheiro não
     existir (é o estado de hoje — não inventes fila).
  **P3 · Slot para a métrica de fleet do Codex:** cada linha da strip reserva um campo `fleet` que LÊ o
     contrato que o Codex vai produzir (VS-FLEET-METRICS) — quanto o local moo processou por aquela
     sessão. Se o contrato ainda não existe → `n/d` honesto no campo, não zero fabricado.
📍 WHERE  worktree frugal-vs-w1 · branch feat/vs-w1-semaforo (MESMA — completa a feature). Fetch antes.
🛡 GUARD  classify FROZEN `427d8c0b…` · **allowlist SÓ em `packages/vscode-extension/**`** (cockpit
  views/strip) — PROIBIDO tocar `tools/**` (é do Codex, colisão) · reusa semaforo-decorations (não
  duplica a lógica de estado) · git add seletivo · sem push · sem feature nova além destas 3.
🛠 DO  Day-0 recon: a Live Sessions strip atual está em que ficheiro? (mc-snapshot/mission-control-view)
  · decorationSpec exporta o que preciso? · dispatch-queue.json existe hoje? (provável não → degrada) ·
  teste para cada parte (data.test.js).
♻️ REUSE  `semaforo-decorations.js` (decorationSpec/STATES — a fonte única de estado) · a Live Sessions
  strip existente (recolorir, não reconstruir) · paste-beacon (a lógica de "próximo") · o contrato de
  fleet do Codex (P3, quando existir).
⚡ SE-ENTÃO  Se recolorir a strip exigir refactor grande → PARA e reporta (pode ser wave separada). Se
  dispatch-queue.json não existir → beacon mostra gates, honesto. Se a métrica de fleet não existir → n/d.
❌ DO-NOT  Tocar tools/router (Codex) · duplicar a lógica de estado (usa decorationSpec) · inventar fila
  ou fleet · push/merge (Paulo) · redesign do cockpit (é recolorir + 1 beacon, não rewrite).
✅ GATE  strip do cockpit mostra as sessões com as cores do semáforo (screenshot — tu ou Cowork via
  computer-use) · beacon aparece no cockpit quando há fila · campo fleet = n/d honesto até o contrato ·
  testes verdes · 0 regressão · sha frozen · 🤝 SOCIO + council-mini.
📋 BACK  HANDOFF v1.1 ≤4k · diff · antes/depois da strip · PENDING (fila viva P2 espera moo-dispatch;
  fleet P3 espera Codex).
📮 DESTINO  CC → BACK ao brain → **Cowork valida VISUALMENTE via computer-use** (abre o cockpit que o
  Paulo abre e confirma o semáforo aceso AÍ). Isto é a "grande diferença" que faltou.
