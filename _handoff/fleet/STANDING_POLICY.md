# Standing Policy (decisoes pre-autorizadas pelo Paulo, 2026-06-22)

O avaliador (cowork-loop-evaluator) e os loops aplicam isto automaticamente. Cobre as decisoes previsiveis para o Cowork poder responder enquanto o Paulo dorme. O que NAO estiver coberto aqui, ou for irreversivel, vai para MORNING_DECISIONS.md (nao se decide sozinho).

## P1 — Modo noturno: Headless + responder por politica
De noite corre SO o loop headless (1 escritor). O avaliador responde sozinho ao operacional (continuar / reverter o que nao melhora / proxima wave / feed Notion+vault). So o irreversivel/novo espera o Paulo.

## P2 — classify.js: SEMPRE frozen (auto-NO a descongelar)
Se um loop/gate pedir para descongelar o tools/router/classify.js: NEGAR automaticamente. Instruir a procurar ganho por via ADITIVA (ficheiros novos no pipeline: decide-agent, adaptive-learner, overrides, safety-floor). Nunca tocar no ficheiro CI-enforced. Sha 427d8c0b...364bc48f re-verificada a cada fecho.

## P3 — Funcao-objetivo: eval honesto do pipeline completo, mirado no NICHO
O objetivo deixa de ser "OOD geral cost-quality" (a tese diz que o Mooter perde ai, e o eval frozen nem o mede). Passa a ser: provar Pareto-best no NICHO onde o Mooter ganha — coding-workflow + latencia (<50ms classify) + risco/seguranca — com um eval honesto do RUNTIME COMPLETO (classify->arbiter/decide-agent->overrides->safety-floor), classify.js frozen. Sealed-holdout respeitado (nada de casos que se auto-elogiam). Bench-watch real vs RouteLLM/Martian no nicho.

## Gates que SEMPRE esperam o Paulo (MORNING_DECISIONS.md, nunca auto)
merge/push/tag para main; deploy; secrets/credenciais; apagar pacote com dependentes; publicar numeros de benchmark; QUALQUER decisao estrategica nova nao coberta por P1-P3 (ex.: pivot de produto, mudar lambda_cost/lambda_lat, rodar o holdout).

## P4 — Human-ON-the-loop (default = avancar na recomendacao do Cowork)
NAO escalar o reversivel. O avaliador DECIDE pela rubrica+politica e avanca: objetivo, revert, proxima wave, refactors, ficheiros novos, evals, commits locais, branches, dynamic-workflow, moo agents. Sem perguntar.
DIGEST (nao-bloqueante) so para DESTRUTIVO: push remoto, PR open/merge, deploy, secrets, apagar dados/pacotes, dinheiro, descongelar classify.js (auto-NO), pivot, lambdas/holdout. Vao para _handoff/loop/DECISIONS.md + notificacao; o loop CONTINUA noutras waves entretanto (nunca fica bloqueado). Two-factor (minha recomendacao + OK do Paulo) so no merge para main.
