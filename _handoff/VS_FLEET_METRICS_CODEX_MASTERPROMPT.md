📥 COLAR EM: Codex · corrida FRESCA, worktree própria (../frugal-fleet) — paralelo ao CC, disjunto (tu em tools/, CC em packages/)
🧾🐮 VS-FLEET-METRICS · vs-fleet-metrics-codex-20260719 · medir quanto o local moo impulsiona cada masterprompt
---
type: MASTERPROMPT
id: vs-fleet-metrics-codex-20260719
from: cowork (brain)
to: codex
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier M)
---
⇄ COWORK → CODEX · MASTERPROMPT · VS-FLEET-METRICS — o local moo, medido, atribuído a cada wave

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🧭 CONTEXTO (o pedido do Paulo): o cockpit mostra "8 MOOS LOCAIS · qwen3:30b · 206 tok/s · $0" mas é
  um agregado anónimo. O Paulo quer saber **quanto o local moo trabalhou para IMPULSIONAR cada
  masterprompt/wave** — atribuição, não só total. É instrumentação determinística $0, teu perfil. O CC
  (em paralelo, VS-W1.5) vai EXIBIR isto por sessão na strip do cockpit; tu produzes o NÚMERO.

🎯 GOAL — design→instrumentação, zero LLM em runtime:
  1. Day-0 recon: como o fleet regista trabalho hoje? (`_handoff/fleet/fleet-orchestrator.mjs` roda os
     rollups; onde grava tokens/tempo/modelo por rollup? há id de sessão/wave?). Confirma ANTES de escrever.
  2. **Atribuição por wave/sessão:** cada rollup do fleet (qwen3:30b/qwen2.5:3b) passa a carimbar:
     `{wave_id|session_id, model, tokens_in, tokens_out, wall_ms, tok_per_s, cost_usd:0, ts}`. O
     wave_id/session_id liga o trabalho do moo ao masterprompt que o originou (via o id do dispatch/
     sessão — o mesmo addressing do registry/dispatch-queue).
  3. **Agregação "fleet contribution por wave":** `mooter fleet-contrib [--by-wave|--by-session] --json`
     → por wave: nº rollups · tokens totais · wall total · tok/s médio · **$ cloud evitado estimado**
     (o que essas tokens custariam num tier cloud — via savings-tracker/computeSavingsReceipt, rotulado
     `estimated:true`). Isto responde "quanto o local moo impulsionou este masterprompt".
  4. **Contrato para o CC** (3 linhas JSDoc no topo): o shape que a strip do cockpit lê por sessão —
     `fleet: { rollups, tokens, wall_ms, tok_per_s, cloud_avoided_usd, estimated:true } | null(n/d)`.
  5. Teste: fixtures de rollups de 2 waves; atribuição correta; wave sem rollup = n/d (nunca zero
     fabricado); tok/s da fonte real (gpu-stream/medição), não inventado.
📍 WHERE  worktree própria `../frugal-fleet` · branch `feat/fleet-metrics` from origin/main (fetch antes).
🛡 GUARD  classify FROZEN `427d8c0b…` · packages engine intocados · **allowlist SÓ em `tools/**` +
  `_handoff/fleet/**`** — PROIBIDO tocar `packages/vscode-extension/**` (é do CC, colisão) · a métrica
  só LÊ o que o fleet já produz + carimba; NÃO muda o comportamento de routing (classify frozen) ·
  git add seletivo · sem push · `ring:null` até P0-4 (mesma doutrina dos recibos).
♻️ REUSE  fleet-orchestrator.mjs (já roda os moos — só instrumentar) · gpu-stream (tok/s real) ·
  ledger-receipts.js/computeSavingsReceipt (para o $ cloud evitado, rotulado estimated) · o addressing
  do registry (wave_id/session_id) — não inventes um id novo.
⚡ SE-ENTÃO  Se o fleet não gravar id de wave hoje → adiciona o carimbo (é o gap); backfill = n/d para
  rollups antigos (nunca atribuir retroativo por adivinhação). Se tok/s não vier da fonte real → n/d,
  não estimes. Se o $ cloud-evitado depender de pricing ausente → n/d honesto.
❌ DO-NOT  Tocar o cockpit/UI (CC) · mudar routing/classify · inventar tokens/tok/s/$ · atribuir
  trabalho a uma wave sem prova de id · push/merge (Paulo).
✅ GATE  atribuição por wave provada em fixtures · `mooter fleet-contrib --json` emite o contrato ·
  wave sem rollup = n/d · tok/s e $ da fonte real ou n/d · node:test verde · 0 regressão · sha frozen ·
  🤝 SOCIO + council-mini.
📋 BACK  HANDOFF v1.1 ≤4k via handoff-preflight --out · diff (FC-8) · o contrato para o CC · uma AMOSTRA
  REAL: roda `mooter fleet-contrib --by-wave` sobre o fleet real e cola a primeira tabela verdadeira
  (quanto o local moo processou por wave HOJE) · PENDING honesta.
📮 DESTINO  Codex → BACK ao brain (moo-handoff-check) → coordeno o contrato com o CC (VS-W1.5 P3) →
  gate Paulo. Responde "quanto o local moo impulsionou cada masterprompt" com número real, e alimenta o
  pilar 9 do score (medição) + a Vista C do fluxograma.
