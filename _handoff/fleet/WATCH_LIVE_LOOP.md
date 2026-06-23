# Mooter — Loop de auto-melhoria AO VIVO (cola numa sessao CC nova: plugin Mooter, pasta ~/frugal)

Es o Claude Code nesta sessao. Vais melhorar o Mooter em CICLOS CONTINUOS, SEM PARAR, mostrando-me tudo em tempo real (raciocinio, diffs, tool calls), ate eu dizer STOP ou bateres num gate irreversivel.

## Missao
Tornar o Mooter o Pareto-best LLM router (qualidade x custo x latencia), sobretudo OOD — e PROVAR cada ciclo contra o best-in-class. Le e segue a rubrica-lei: _handoff/fleet/WORLD_CLASS_LOOP.md.

## O ciclo (repete sem parar)
0. BENCH-WATCH: web_search dos numeros best-in-class ATUAIS (LLMRouterBench, RouterBench, Martian, Not Diamond, Unify, OpenRouter, LiteLLM). Cita "web today <data>: X=Y". Sobe a barra se mexeram.
1. MEASURE: corre o eval frozen (in-dist + OOD holdout). Regista ROUTER_SCORE, oracle gap, custo/query, p50/p99, %local. Sem codigo nesta fase.
2. DIAGNOSE: a MAIOR categoria de erro vs Oracle E vs best-in-class, com exemplos concretos a falhar. Nomeia o inimigo antes de corrigir.
3. HYPOTHESIZE (falsificavel): UMA mudanca minima; prediz "+X em OOD porque <mecanismo>".
4. IMPLEMENT: o menor diff que testa a hipotese. Sem drive-by edits.
5. RE-EVAL: corre de novo o eval frozen incl. OOD; delta real.
6. DECIDE: melhor em OOD -> keep + commit (git add seletivo). Nao melhor -> REVERTE + loga "previu +X, deu Y, errado porque...". Resultado negativo e PRODUTO.
7. LEDGER: 1 linha (ciclo#, foco, hipotese, previsto, real, kept/reverted, LOC+/-, files+/-, leaderboard vs Martian/NotDiamond/Unify/Oracle).
Depois COMECA O PROXIMO CICLO imediatamente. 1 em cada 3 ciclos TEM de ser measure ou delete (nao feature). Todo ciclo explica em linguagem simples porque o codigo funciona.

## Regras duras (nao quebrar)
- tools/router/classify.js FROZEN (sha 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f) — prova a cada ciclo; nunca tocar/importar.
- 100% ADITIVO (packages/* frozen waves 28-34.5 — so ficheiros novos). git add SELETIVO (nunca -A). Sem novos .md na root.
- Branch propria off main: live-loop. NUNCA merge/push/tag para main, deploy, secrets, migrations, apagar pacote com dependentes — PARA e PERGUNTA-ME.
- SEALED HOLDOUT: nao treinar/afinar/pattern-match no holdout OOD; nao adicionar casos que favorecem o comportamento atual.
- THESIS-RISK: se um resultado OOD honesto sugerir que a tese local-first e FALSA fora do nicho, ESCALA com a evidencia — nao tapar com feature.

Mostra-me o raciocinio e os diffs ao vivo. NAO paras entre ciclos. Comeca AGORA pelo BENCH-WATCH + MEASURE (mostra-me o scoreboard antes de mexeres em codigo).
