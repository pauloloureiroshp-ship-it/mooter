📥 COLAR EM: Codex · corrida FRESCA — SOMENTE APÓS: "P0-4: SIM" do Paulo + script VSSEAM-1 rodado (branch feat/ledger-receipts existe)
🧾📥 BLOCO 3 v2 · vs-bloco3-recibos-anel-20260719 · SUPERSEDE o BLOCO 3 do WAVES_DISPATCH_2026-07-18 (estava stale: recibos base JÁ EXISTEM)
---
type: MASTERPROMPT
id: vs-bloco3-recibos-anel-20260719
from: cowork (brain)
to: codex
severity: high
generated_at: 2026-07-19
socio_pack: v1@manual (tier M)
---
⇄ COWORK → CODEX · MASTERPROMPT · Recibos POR ANEL — a medição que transforma claim em tabela (P1-D)

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🎯 GOAL  INSTRUMENTAR (não construir do zero) os recibos por anel de processo sobre a base existente:
  1. Day-0 recon ANTI-STALE: `feat/ledger-receipts` existe e aponta 101ddee ("honest Ledger receipt
     projection": ledger-receipts.js 468 linhas + receipts.ts + testes)? Confirma conteúdo real
     ANTES de escrever 1 linha. Se divergir do esperado → PARA e reporta.
  2. Estender `tools/router/ledger-receipts.js`: campo `ring: zero|curto|completo` por evento +
     agregação wall-clock e tokens POR ANEL + contador drift-catches (consome eventos da Mesh A).
  3. `mooter receipts --by-ring` no CLI (receipts.ts): tabela anel × wall × tokens × $ × n eventos.
  4. Testes: fixtures com eventos dos 3 anéis; agregação correta; anel ausente = n/d (nunca zero
     fabricado); suite existente 0 regressão.
  5. Amostra REAL: rodar contra o ledger real da máquina e colar a primeira tabela verdadeira no
     HANDOFF (é o primeiro número da Vista C e do pilar 9 do score do Paulo).
📍 WHERE  worktree própria `../frugal-receipts-anel` · branch `feat/receipts-by-ring` a partir de
  `feat/ledger-receipts` (base = o resgate 101ddee) · fetch antes.
🛡 GUARD  classify FROZEN `427d8c0b…` · allowlist: ledger-receipts.js/.test.js · receipts.ts +
  teste · fixtures novas — NADA MAIS (não tocar mesh-*, agent-sync, extension) · git add seletivo ·
  zero push · doutrina: máquina escreve fatos, nunca estimar tokens sem fonte (n/d se o evento não tem).
♻️ REUSE  ledger-receipts.js (base) · mesh-cycle/eventos jsonl (drift-catches) · handoff-preflight
  (envelope) · doutrina anéis recém-escrita (BLOCO 1/P1-A do CC — se ainda não merged, usa a
  definição do P0-4_DECISION_BRIEF §"decisão em 1 frase" e marca dependência).
⚡ SE-ENTÃO  Se eventos do ledger não tiverem marcador de anel (provável — anéis são novos) →
  implementa o campo + backfill `ring: n/d` para eventos antigos (NUNCA inferir anel retroativo).
  Se a base 101ddee tiver testes vermelhos → reporta baseline e segue só com os teus verdes.
✅ GATE  node:test verdes · 0 regressão · amostra real no handoff (ou n/d honesto com motivo) ·
  rodapé 🤝 SOCIO + council-mini.
📋 BACK  HANDOFF v1.1 ≤4k via handoff-preflight --out · diff completo (FC-8) · PENDING honesta.
📮 DESTINO  Codex → BACK ao brain (moo-handoff-check) → gate Paulo (push/PR).
