# Mooter - World-Class Auto-Improvement Loop (rubrica canonica do loop)

A funcao do loop: tornar o Mooter PROVADAMENTE o melhor LLM router do mundo, medido contra o best-in-class externo, NAO por contagem de features. Otimiza PROVA, nao volume. Um ciclo que nao prova melhoria e' um ciclo REVERTIDO.

## 0. Missao (uma frase)
Tornar o Mooter o Pareto-best em qualidade x custo x latencia, sobretudo OOD - e prova-lo todo ciclo contra a barra best-in-class atual.

## 1. Funcao-objetivo (a unica coisa que o loop maximiza)
ROUTER_SCORE = quality_vs_oracle - lambda_cost * normalized_cost - lambda_lat * normalized_p99_latency
- quality_vs_oracle = qualidade de routing como fracao do teto Oracle (routing perfeito).
- lambda_cost, lambda_lat CONGELADOS no inicio do run (mudar = decisao humana).
- O que conta e' o ROUTER_SCORE no split OOD selado, NAO in-distribution.
Um ciclo so "conta" se o ROUTER_SCORE melhora ESTRITAMENTE no holdout OOD selado. O resto e' motion, e motion reverte-se.

## 2. Invariantes nao-negociaveis
1. classify.js FROZEN (sha CI). Nunca modificar.
2. Engine packages frozen intocados salvo allowlist de ficheiros NOVOS.
3. git add seletivo (nunca -A). 4. Sem novos .md na root.
5. **CHANGE != IMPROVEMENT GATE** - nunca mergear mudanca que nao bate o ROUTER_SCORE anterior no holdout OOD. Se nao bate: REVERTE e regista o resultado negativo. Resultados negativos sao o produto, nao falhas.
6. **DELETE BIAS** - todo ciclo considera o que remover. Track LOC_delta/files_delta. Adicoes liquidas so se sobem o score. Ciclo que so apaga e mantem o score = SUCESSO (menos superficie = mais world-class).
7. **SEALED HOLDOUT** - agentes NAO treinam/afinam/pattern-match no holdout OOD, NAO adicionam casos que favorecem o comportamento atual. So o humano roda o holdout.

## 3. O ciclo (8 fases)
0. BENCH-WATCH: web_search dos numeros best-in-class atuais (LLMRouterBench, RouterBench, Martian, Not Diamond, Unify, OpenRouter, LiteLLM). Citar "web today <data>: <competidor>=<numero>". Subir a barra se eles mexeram.
1. MEASURE: correr o eval FROZEN (in-dist + OOD). Registar ROUTER_SCORE, oracle gap, custo/query, p50/p99, % local. Sem codigo.
2. DIAGNOSE: onde o Mooter mais perde vs Oracle E vs best-in-class? A maior categoria de erro, com exemplos a falhar. Nomeia o inimigo antes de corrigir.
3. HYPOTHESIZE (falsificavel): UMA mudanca minima; prediz "ROUTER_SCORE +X em OOD porque <mecanismo>". Se nao consegues prever magnitude+razao, nao percebes - volta ao 2.
4. IMPLEMENT: menor diff que testa a hipotese. Sem drive-by edits.
5. RE-EVAL: re-correr o eval frozen incl. OOD. Delta real.
6. DECIDE: estritamente melhor em OOD -> keep+commit (selective add). Nao melhor -> REVERTE + log "previu +X, deu Y, errado porque...".
7. LEDGER: 1 linha: ciclo#, foco, hipotese, delta previsto, delta real, kept/reverted, LOC_delta, files_delta, leaderboard vs best-in-class.

## 4. Weak-point targeting (treina o operador, nao spam de features)
- 1 em cada 3 ciclos TEM de ser MEASURE ou DELETE (eval mais honesto / OOD mais dificil / Oracle melhor / instrumentar latencia, OU remover codigo/pacotes mortos). Nao feature.
- Todo ciclo gera um artefacto de COMPREENSAO: o ledger explica porque o codigo funciona, em linguagem simples. Nao mergear codigo que nao se consegue explicar.
- Real-user weighting: se existir um trace real (um utilizador que nao o Paulo), pesa o eval para ele. Um trace real > cem casos sinteticos.

## 5. Gates humanos (parar e perguntar ao Paulo)
- Irreversivel: publicar numeros de benchmark, release npm / git tag, apagar pacote com dependentes externos, tocar ficheiro frozen, secrets/deploy/migrations.
- THESIS-RISK: se um resultado OOD honesto sugerir que a tese-nucleo (local-first routing vence) e' FALSA fora do nicho, ESCALA imediatamente com a evidencia. Nao tapar com feature. E' o sinal mais valioso que o loop pode produzir.

## 6. Hipotese de diferenciacao (a aposta a testar sempre)
Gap de mercado (LLMRouterBench 2026): nenhum router otimiza qualidade-custo-LATENCIA em conjunto. Edge do Mooter: classify deterministico <50ms + local-first tier-0. North star: ser a fronteira de Pareto provada nos tres eixos ao mesmo tempo, OOD. Se um competidor bate o Mooter na fronteira conjunta, esse metodo vira o proximo alvo de DIAGNOSE.

## 7. Stop conditions
Parar apos N ciclos, OU quando ROUTER_SCORE estabiliza por K ciclos. No fim, veredicto HONESTO: onde o Mooter e' best-in-class, onde nao e', e a aposta de maior alavanca a seguir. Sem hype. So numeros.

## 8. Template de output por ciclo
CYCLE <n> . <data> . focus=<measure|delete|feature|comprehension>
bench-watch: <competidor=numero; ...> (web today <data>)
score: ROUTER_SCORE <prev>-><new> | oracle_gap <prev>-><new> | cost <> | p99 <> | %local <>
biggest miss: <categoria + exemplo>
hypothesis: <mudanca> -> previu <D> porque <mecanismo>
result: real <D> -> <KEPT|REVERTED>  | why: <uma linha>
surface: LOC <+/-> | files <+/->
leaderboard: Mooter <score> vs Martian/NotDiamond/Unify/Oracle <>
