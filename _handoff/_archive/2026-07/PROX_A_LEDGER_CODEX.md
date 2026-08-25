📮 DESTINO: Codex · corrida FRESCA, worktree própria (../frugal-ledger) — lado DADOS/medição
   QUANDO: APÓS `integ-g1-cc-v2-20260720` fechar E o brain confirmar o bus único no novo SHA de `feat/integ-g1`.
   (Autodefesa: o Ledger assenta SOBRE o bus único. Se `dispatch-queue.json` ainda não for o único writer na
   base, PARA e diz — não instrumentar sobre bus duplo.)
📊🔧 PRÓX-A · ledger-p1d-codex-20260720 · matar o `n/d`: instrumentar tokens/tempo/savings/Resume (o 1º dominó)
---
type: MASTERPROMPT
id: ledger-p1d-codex-20260720
from: cowork (brain)
to: codex (dono do lado dados/determinístico)
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier M)
contexto: _handoff/MOOTER_ESTUDO_POSICIONAMENTO_2026-07-20.md §8 (a convergência) + §10 wave A
---
⇄ COWORK → CODEX · MASTERPROMPT · instrumentar o Ledger (P1-D) — o movimento que avança produto+moat+nota ao mesmo tempo

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🧭 CONTEXTO (do estudo de posicionamento): o gap nº1 do produto E do Paulo é o MESMO — **medir**. Todo KPI de
  eficiência é `n/d` (Resume ≤60s nunca cronometrado, tokens/wave, savings por sessão). Sem Ledger medido, o
  moat é narrativa e a regra-mãe ("nenhuma claim de eficiência sem medição" — METR 39pts) bloqueia o pitch.
  Este é o primeiro dominó. Assenta SOBRE o bus único que o CC acabou de unificar.

🎯 GOAL — instrumentar medição HONESTA (zero fabricação):
  L1 · **Tokens/tempo por wave** — cada evento do bus (`agent-sync/dispatch-queue.json`) e cada rollup ganha
     `tokens_in/out` + `wall_clock_ms` reais quando disponíveis; ausente → `n/d`, NUNCA estimado sem rótulo.
  L2 · **Resume cronometrado** — instrumenta o tempo real de "retomar sessão" (o KPI ≤60s que nunca foi medido).
     Marca `estimated:false` só quando cronometrado de verdade.
  L3 · **Savings por sessão via `computeSavingsReceipt`** (clamp≥0, `estimated:true`, contrafactual rotulado) —
     consolidar no ledger `_handoff/agent-sync/{events.jsonl,snapshot.json}`. Zero "cloud avoided" cru.
  L4 · **Honest-copy** — o dashboard/statusline lê SÓ o que o ledger mediu; campo sem medição = `n/d` visível,
     não zero, não palpite.
📍 WHERE  worktree `../frugal-ledger` · branch a partir do `feat/integ-g1` pós-v2 (confirma o SHA no recon).
🛡 GUARD  classify FROZEN · **allowlist SÓ `tools/**` + `_handoff/**`** — PROIBIDO `packages/vscode-extension/**`
  (é do CC) · `computeSavingsReceipt@9ff1735` (não dupliques) · sem push · git add seletivo.
♻️ REUSE  `agent-sync-ledger.js` · `savings-tracker.js` · `fleet-contrib.js@5ddbb16` · `computeSavingsReceipt` ·
  o schema do bus (o id causal `source_event_id`).
⚡ SE-ENTÃO  Se um KPI não tiver fonte real de medição → `n/d` honesto + marca PENDING (não inventa). Se
  cronometrar Resume exigir hook que não existe → propõe o ponto de instrumentação e marca PENDING.
❌ DO-NOT  Tocar plugin/UI (CC) · fabricar métrica · publicar tokens locais como cloud evitado · estimar sem
  rótulo `estimated:true` · push (Paulo).
✅ GATE  ledger grava tokens/tempo reais (ou `n/d`) · Resume cronometrado ou PENDING honesto · savings via
  computeSavingsReceipt · node:test verde · 0 regressão · 🤝 SOCIO + council-mini.
📋 REGISTRO  Carimba `_handoff/agent-sync/events.jsonl` `{ts, from:"codex", to:"cowork",
  wave_id:"ledger-p1d-codex-20260720", type:"instrumentation", result}` + linha do ORCHESTRATION LOG.
📋 BACK  HANDOFF v1.1 ≤4k · diff · QUAIS KPIs saíram de `n/d` p/ medido vs ainda PENDING · a linha do tracking.
  📮 DESTINO  Codex → BACK ao brain → Gemini verifica que não fabricou (PRÓX-C) → gate Paulo.
