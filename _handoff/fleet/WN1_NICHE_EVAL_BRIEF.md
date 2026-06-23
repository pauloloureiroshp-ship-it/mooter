# Wave WN1 — Eval honesto do pipeline completo, mirado no nicho

Objetivo (P3 da STANDING_POLICY): construir um eval NOVO (aditivo) que mede o RUNTIME COMPLETO do router — classify(frozen) -> arbiter/decide-agent -> overrides -> safety-floor — para que as melhorias aditivas movam o numero de forma legitima, com classify.js FROZEN.

Criterios (DONE):
1. eval novo em packages/mooter-bench (ou packages/<novo>) que corre o pipeline completo, nao so classify.js. Honesto: split OOD real, sem casos auto-elogiosos (sealed-holdout).
2. Eixos do nicho: qualidade in-domain (coding) + latencia (p50/p99, classify <50ms) + risco/seguranca. Bench-watch real vs RouteLLM/Martian (web, cita).
3. Baseline medido + 1 melhoria aditiva (decide-agent/adaptive-learner/override) que SOBE o score do pipeline -> keep; senao REVERTE + loga negativo.
4. classify.js sha intacta; 100% aditivo; git add seletivo; branch propria off main.
5. Ledger por ciclo + feed Notion+vault.

Regras: WORLD_CLASS_LOOP.md + STANDING_POLICY.md. NUNCA descongelar classify.js (P2). NUNCA merge/push para main (MORNING_DECISIONS).
