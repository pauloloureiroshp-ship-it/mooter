# P4 · adversário (crítico ≠ autor) — Codex CLI gpt-6-astra, ronda 1, e a resposta

**Prompt:** `adversary-prompt-sent.txt` · **Saída íntegra:** `adversary-codex-round1.md` (10 ataques, 123 s, sem acesso ao repo). Nota de conflito declarada: o adversário é o mesmo motor do braço B; atacou o braço B e o desenho com a mesma dureza que o braço A (derrubou o «crítico ≠ autor» que lhe daria o papel principal).

| # | Ataque | Gravidade (dele) | Resposta | Estado |
|---|---|---|---|---|
| P4-01 | selecção determinística, «primeiros mortos», 15 ficheiros, janelas sobrepostas, operadores não todos exercitados → efeito de tecto | serious | **Aceite.** Secção «O que a amostra é» no veredicto v2: selecção declarada, 15 ficheiros, distribuição real dos operadores (8 de 12 usados; `=== → !==` é 12/28). Amostra aleatória/estratificada: não feita | declarado |
| P4-02 | «morto pelo teste» não distingue asserção de falha de carregamento | serious | **Aceite em parte.** O oráculo é «o teste emparelhado passa no original e falha com a mutação»; `mutants.json` guarda `fail_tail` por mutante, mas não se classificou a causa. Declarado como divergência do comportamento testado | declarado |
| P4-03 | «fastify no tecto de 60 min» contradiz «8 mortos em 55 s» | serious | **Aceite — erro meu.** O gerador esgotou os **5 pares fonte/teste elegíveis**; corrigido no veredicto e no slide, com a nota de que a v1 dizia outra coisa | corrigido |
| P4-04 | o braço «auto-revisão» não existe: nenhum motor escreveu o código | **fatal** | **Aceite.** A moldura sai: «revisor Opus» vs «revisor Codex». O título do slide passou a ser o que o adversário propôs. A experiência de autoria fica em `10-NAO-PROVADO.md` | reformulado |
| P4-05 | o marcador `*` revela o alvo e pode induzir `ACHADO`; «limpo» é excessivo | serious | **Aceite.** Declarado: o revisor sabe onde olhar, não qual é qual; sem ablação sem marcador. «Controlos limpos» → «janelas originais, sem mutação» | declarado / reformulado |
| P4-06 | TP por proximidade ≠ diagnóstico correcto; parser `SEM ACHADO`/`ACHADO` | serious | **Aceite em parte.** Sensibilidade com tolerância 0 calculada: **igual** (todos os desvios são 0). O parser dá precedência a `SEM ACHADO` e exige `ACHADO:` (`review.mjs:32-35`). A explicação **não** foi adjudicada — «0 fora da tolerância» substitui «0 wrong-reason» | corrigido / declarado |
| P4-07 | 59/59 é existência de coordenadas, não proveniência; sem valor incremental demonstrado | fatal (para o valor alegado) | **Aceite.** «Ganhou a proveniência» saiu. Fica «59/59 referências resolvem para uma linha existente; relevância não avaliada; valor incremental do verificador não demonstrado». A diferença de numeração no mutante de linha apagada foi declarada | reformulado |
| P4-08 | p = 1 não é ruído nem equivalência | serious | **Aceite.** «Nenhuma hipótese de superioridade foi suportada; equivalência não se afirma». Dependência entre janelas vizinhas: declarada, não modelada | reformulado |
| P4-09 | FP partilhados como «candidatos a defeito real» é sugestão sem validação | serious | **Aceite.** «Dois alarmes partilhados, não adjudicados»; contam como alarmes; `fastify-05` (ambos acusam o original e ambos deixam passar o mutante) citado como o caso incómodo | reformulado |
| P4-10 | o slide vende autoria e valor do produto; palavras proibidas ausentes mas implicadas | serious | **Aceite.** Slide v2 reescrito com as edições propostas | reformulado |

**Rejeitado:** nada. **Não resolvido:** braço de autoria real; ablação sem marcador; adjudicação semântica das explicações; amostra aleatória; causa exacta das mortes (asserção vs carregamento).

**Ronda 2:** não corrida — a quota do Codex foi reservada para as rondas do P5 (2), P3 e P7/P8. Declarado.
