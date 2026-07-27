📥 COLAR EM: Codex · corrida FRESCA na branch feat/ledger-receipts (worktree própria ../frugal-receipts) — roda EM PARALELO ao CC (que está no webview/vs-w1; vocês NÃO se tocam)
🧾🔧 VS-RECEIPTS-BASE · vs-receipts-base-codex-20260719 · a RAIZ do savings honesto (D1) + base do P1-D
---
type: MASTERPROMPT
id: vs-receipts-base-codex-20260719
from: cowork (brain)
to: codex
severity: high
generated_at: 2026-07-19
socio_pack: v1@manual (tier M)
base_audit: _handoff/MOOTER_BOTAO_A_BOTAO_2026-07-19.md (D1) + auditoria V2
---
⇄ COWORK → CODEX · MASTERPROMPT · Recibos-base — consertar a FONTE do número que o cockpit mostra

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🧭 CONTEXTO (por que agora, em paralelo): a auditoria ao vivo achou o defeito de confiança nº1 (D1):
  o Cockpit mostra "$0.05 · 0 dispatches" e a aba Control mostra **"$-109.39"** — DUAS abas, um
  número, discordam, e um é NEGATIVO no lugar de "poupado". O CC está a corrigir a EXIBIÇÃO (webview).
  TU corriges a FONTE — determinístico, no ledger/tracker, teu perfil. Encontram-se no CONTRATO do
  número (o campo que a UI lê). Sem colisão: tu em `tools/router/`, o CC em `packages/vscode-extension/`.

🎯 GOAL (design→fix, determinístico, zero LLM em runtime):
  1. **Day-0 recon anti-stale:** confirma o conteúdo real de `feat/ledger-receipts @a2ff16b`
     (ledger-receipts.js + receipts.ts?) ANTES de escrever. Se divergir do esperado → PARA e reporta.
  2. **Diagnosticar a divergência D1:** por que Cockpit e Control produzem números diferentes? Provável
     raiz: DOIS cálculos de savings (um por sessão, um agregado) sem fonte única. Localiza os 2 e reporta
     path:linha (é forense — teu forte).
  3. **Fonte única de savings, honesta e NUNCA negativa:** um cálculo canônico que a UI toda lê.
     Regra de doutrina: savings = max(0, cloud_evitado − custo_real); se a base for suja (repo com custo
     afundado), o negativo NÃO vaza para "poupado hoje" — vira campo separado rotulado, ou n/d. Máquina
     escreve o fato; número sem fonte = n/d, nunca palpite.
  4. **Recibos-base do P1-D** (a instrumentação que faltava): por sessão, emitir wall-clock real +
     tokens (da fonte real; n/d se o evento não tem) + $ (cloud evitado vs real). Campo `ring:
     zero|curto|completo` fica como **TODO n/d** (a dimensão de anel espera o "P0-4: SIM" do Paulo —
     NÃO a inventes agora; deixa o slot preparado).
  5. `mooter receipts` (ou extensão do CLI existente) que imprime a fonte única — o CC e a aba Control
     passam a ler ISTO. Documenta o contrato (3 linhas JSDoc no topo) para o CC ligar sem te perguntar.
📍 WHERE  worktree própria `../frugal-receipts` · branch a partir de `feat/ledger-receipts @a2ff16b`
  (já no origin) · fetch antes.
🛡 GUARD  classify FROZEN `427d8c0b…` · packages engine intocados · **allowlist EXATA em `tools/`
  (ledger-receipts.js / receipts.ts / savings-tracker) — PROIBIDO tocar `packages/vscode-extension/**`
  (é do CC, colisão)** · git add seletivo · sem push · doutrina n/d.
♻️ REUSE  savings-tracker existente (unificar, não recriar) · ledger-receipts.js (base) · a dashboard
  de savings histórica ($25.95/47%/658 calls — o cálculo que funcionou) como referência do correto.
⚡ SE-ENTÃO  Se os 2 cálculos forem legítimos (métricas diferentes: cloud-cockpit vs fleet-control) →
  a solução é ROTULAR cada um, não fundir num só (reporta os dois nomes claros para o CC exibir). Se o
  negativo vier de dado real (custo afundado do repo) → clamp na fonte + campo bruto separado, documenta.
  Se tocar a lógica exigir mexer no webview → PARA (é do CC).
❌ DO-NOT  Tocar webview/UI (CC) · inventar `ring` antes do P0-4 · inventar número para tapar negativo ·
  auditar e implementar reescrevendo (é fix cirúrgico, não rewrite) · push/merge (Paulo).
✅ GATE  fonte única de savings provada (Cockpit e Control leriam o MESMO) · zero negativo na fonte
  "poupado" · recibos-base com wall/tokens/$ reais (ou n/d honesto) · slot `ring` preparado (TODO n/d) ·
  node:test verdes · 0 regressão · sha frozen · rodapé 🤝 SOCIO + council-mini.
📋 BACK  HANDOFF v1.1 ≤4k via handoff-preflight --out · diff completo (FC-8) · os 2 cálculos achados
  (path:linha) · o contrato do número para o CC · PENDING honesta (F5, ring pós-P0-4).
📮 DESTINO  Codex → BACK ao brain (moo-handoff-check) → coordeno com o CC o contrato do número →
  gate Paulo. Ataca a raiz do D1 (nota UX 6.5→8) e entrega a base do P1-D (score pilar 9: medição).
