# ⇄ COWORK → CODEX · SESSION REGISTRY — check-in/check-out mecânico no Ledger (mini-wave)

> Cowork · 2026-07-17 · Budget ≤8k · Origem: exigência do Paulo (harmonia total entre TODAS as
> sessões: nunca agir sem status, tracking ts de tudo, nunca atrapalhar o trabalho do outro).
> A regra constitucional já está no vault (`00-core/como-trabalhamos.md` §BOOT GATE). Esta wave
> entrega o ENFORCEMENT mecânico. Casa: `_handoff/`.

🎯 GOAL   Eventos `session-start`/`session-end` no Ledger (agente · ts · worktree reclamada ·
          intent) + BOARD mostra sessões vivas e claims + preflight avisa handoff sem check-in.
          Zero infraestrutura nova: é extensão do agent-sync-ledger + preflight que JÁ existem.
📍 WHERE  Worktree `../frugal-session-registry` · branch `feat/session-registry` · from origin/main.
⏱️ QUANDO  APÓS o merge batch completo (#251/#254/#255 precisam estar em main — esta wave estende
          ficheiros que vivem neles). Confrontar merges via gh antes de criar worktree; se faltar
          algum → ⛔ STOP e reportar.
🔒 GUARD  classify.js FROZEN · git add seletivo · allowlist abaixo, nada além · escrita no Ledger
          SÓ pela rota agent-sync/reducer (single-writer F1) · NUNCA ~/.claude · HOME temp nos
          testes · claim é DECLARATIVO nesta wave (aviso no BOARD), o bloqueio duro de git já
          existe no conductor-guard — NÃO duplicar lock.

▶ DO
1. `agent-sync-ledger`: kinds novos `session-start` / `session-end` com payload
   `{agent, ts, workspace, claim: <worktree|pasta|n/d>, intent: <1 linha>}` — validação de
   schema, idempotência por (agent+workspace+dia) no start duplicado.
2. `handoff-preflight` BOARD: seção "SESSÕES VIVAS" — session-start sem session-end
   correspondente, com idade (ts) e claim; ⚠️ CLAIM-CONFLICT quando 2 sessões vivas reclamam
   o mesmo recurso; ⚠️ sessão viva >24h sem eventos (candidata a órfã — alinhado ao orphan-watch,
   sem duplicá-lo: o preflight LÊ, quem alerta agendado é a mesh).
3. `--lint`: handoff cujo front-matter não referencia um session-start vivo do mesmo agente →
   warning "handoff sem check-in" (nunca erro — degradação honesta, agentes legados existem).
4. Templates: 1 linha no HANDOFF.template.md documentando o campo/passo de check-in.
5. Fixture real: reconstruir a timeline desta semana (os eventos existentes do events.jsonl)
   como teste de que o BOARD projeta sessões corretamente.
♻️ REUSE: appendEvent/reduce (F1) · preflight BOARD (#254) · canon templates (#255) ·
conductor-guard (#251) é quem BLOQUEIA — este registry só declara e projeta.

ALLOWLIST: tools/router/agent-sync-ledger.js + .test.js · tools/handoff-preflight.js + .test.js ·
_handoff/templates/HANDOFF.template.md + fixture correspondente. NADA MAIS.

✅ GATE  node --test dos 2 test files (output cru) · BOARD real mostrando ≥1 sessão viva desta
        própria execução · lint warning provado com fixture sem check-in · sha classify ·
        zero regressão nas suites já verdes.
⛔ STOPs STOP 1: staged + diff crítico + gates → YES p/ commit · commit/push/PR/merge separados.
📋 BACK  Handoff canônico com rodapé `CCA: n/5` (council vai no CORPO, não no rodapé — o
        rodapé visível de council é só para MASTERPROMPT/DECISION CONTRACT, conforme o
        template canônico do #255); este próprio handoff nasce com check-in/out registrados
        (dogfood: a wave prova a si mesma).
