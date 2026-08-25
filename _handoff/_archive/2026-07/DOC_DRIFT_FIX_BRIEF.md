# ⇄ COWORK → CC · DOC-DRIFT-FIX · ARCHITECTURE.md §9 + nota FROZEN no AGENTS.md

Origem: 1º parecer do Gemini (gemini-roo) em 2026-07-16, **confirmado pelo Cowork
contra o código** (ver `docs/AGENT_HANDOFF.md § 2026-07-16`). Alimenta a thread
"mudar a régua escrita primeiro" (MEMORY 2026-07-13).

```
⇄ COWORK → CC · DOC-DRIFT-FIX
🎯 GOAL   Eliminar o drift confirmado doc-vs-código no learning loop, para que
          nenhum agente (humano ou IA) opere com modelo mental errado da
          arquitetura. Docs-only, pequeno, reversível.
📍 WHERE  worktree ../frugal-docfix · branch docs/learning-loop-drift · from main
          (NÃO usar o tree principal — está no meio do ciclo Mooter 2.0,
          PR #254/#255, 394 dirty)
▶  DO
   1. ARCHITECTURE.md §9 ("Auto-learning loop — backtest, tune, patch"):
      reescrever para a realidade — `update-router.js` escreve
      `tools/router/tuning-state.json` (runtime-only, gitignored; seed committed
      em `tuning-state.defaults.json`); `classify.js` carrega esse estado no
      arranque (evidência: classify.js:29-45, "update-router.js writes
      tuning-state.json, never this file"); o ficheiro classify.js NUNCA é
      modificado. Corrigir também a linha ~136 ("idempotent patcher for
      classify.js" → "idempotent writer of tuning-state.json"). Cross-ref
      docs/DRIFT-RESOLUTION-PLAN.md se ainda existir.
   2. AGENTS.md § Invariants, item 1: acrescentar 1 frase de nuance — o
      FICHEIRO é frozen (sha CI-enforced), mas o COMPORTAMENTO é tunável via
      tuning-state.json; a superfície mutável é tuning-state.json, nunca
      classify.js. (Achado A2 do Gemini.)
   3. (Opcional, A4/P2) Se o §9 tiver fluxograma: completar com user overrides
      (@opus), quality-intent e sub-tier T0 — SÓ depois de verificar cada um
      contra classify.js real. Se não couber, registrar como pendência no BACK.
🔒 GUARD  docs-only (ARCHITECTURE.md + AGENTS.md) · NÃO tocar em
          tools/router/classify.js nem em nenhum .js · git add seletivo ·
          sem push sem OK do Paulo · ATENÇÃO: o AGENTS.md do tree principal já
          carrega edições do Cowork de hoje (5 atores + governance layers) —
          trabalhar sobre main e não reverter nada ao mergear.
✅ GATE   grep-proofs no diff final:
          (a) ARCHITECTURE.md §9 contém "tuning-state.json";
          (b) zero ocorrências de "patcher for classify.js";
          (c) AGENTS.md contém a nuance FROZEN (ficheiro vs comportamento);
          (d) sha256 de tools/router/classify.js INTACTA
              (427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f);
          (e) npm run handoff:preflight + handoff:qa antes do BACK (regra do
              AGENTS.md § Communication protocol).
⏭  NEXT   gemini-roo revisa o diff (brief de review será emitido pelo Cowork
          quando o PR abrir) → Paulo merge.
📋 BACK   branch + commit + diffstat + output dos greps do GATE + evento no
          ledger (kind:outcome, target gemini-roo,cowork).
```
