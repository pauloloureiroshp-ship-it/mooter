# P4 · Dois revisores em motores diferentes sobre defeitos plantados — veredicto (v3, depois do adversário e da auditoria numérica — `AMENDMENT-1.md`)

**Corrida:** 2026-09-09 · protocolo `030374b1` commitado 13:54:58Z, antes de gerar mutantes (13:56:30Z) e de qualquer revisão · **28 mutantes** mortos pelo teste emparelhado do próprio repo (mooter 10, hono 10, **fastify 8 — o gerador esgotou os 5 pares fonte/teste elegíveis em 55 s**; não foi o tecto de 60 min; a v1 deste veredicto dizia «no tecto» e estava errada) + 28 janelas **originais, sem mutação** = 56 · `mutants.json`, `windows.json`, `results/A.json`, `results/B.json`, `results/analysis.json` · adversário: `adversary-codex-round1.md` → `adversary.md` · emendas: `AMENDMENT-1.md`.

## Veredicto em uma linha

**Em 28 mutantes seleccionados e mortos por teste, o revisor Opus marcou 27/28 e o revisor Codex 26/28; nenhuma hipótese de superioridade ficou estabelecida.** **4 dos 28 mutantes são erros de compilação** (o operador `<` só acertou em parâmetros de tipo TypeScript; o teste nunca chegou a correr); excluindo-os, **23/24 e 22/24** — os pares discordantes e os dois p não mudam. A hipótese do protocolo («o crítico em motor diferente apanha mais e alarma menos») **não foi suportada** (p = 1,0 nas duas direcções pré-registadas). O que este desenho **não** mede é autoria: nenhum dos dois motores escreveu o código revisto — a ronda do adversário apanhou a moldura «auto-revisão» como indevida e ela sai.

## Os números (mesmas 56 janelas de ±25 linhas, mesmo `DIFF_SYSTEM_PROMPT` verbatim, revisor sem acesso ao repo, linha-alvo marcada `*` nos dois grupos)

| | **A · revisor Opus** — `claude -p`, hooks e tools desligados, 1 turno | **B · revisor Codex** — gpt-6-astra, read-only, cwd vazio |
|---|---|---|
| Achados na linha plantada, 28 mutantes (Wilson 95 %) | **27/28 · 96,4 % [82,3; 99,4]** | 26/28 · 92,9 % [77,4; 98,0] |
| Achados na linha plantada, **excluindo os 4 mutantes de erro de compilação** (`hono-01`, `-05`, `-06`, `-09`; ficam 24) | 23/24 · 95,8 % [79,8; 99,3] | 22/24 · 91,7 % [74,2; 97,7] |
| Achados **fora** da tolerância de ±2 linhas | 0 (com tolerância 0 dá o mesmo: todos os 27 têm desvio 0) | 0 (idem: 26 com desvio 0) |
| Achados nas 28 janelas originais («FP» pela pontuação; não adjudicados) | 2/28 · 7,1 % [2,0; 22,6] | 4/28 · 14,3 % [5,7; 31,5] |
| Referências `PROVA: ficheiro:linha` que resolvem para uma linha **existente** na árvore | 29/29 | 30/30 |
| Por repo (na linha / mutantes · achados / originais) | mooter 10/10 · 1/10 — fastify 7/8 · 1/8 — hono 10/10 · 0/10 | mooter 9/10 · 1/10 — fastify 7/8 · 2/8 — hono 10/10 · 1/10 |
| Tempo médio por janela | 19,3 s | 17,3 s |
| Recursos | 50 469 tokens de saída; 1,03 M cache lida; 2,68 M cache escrita; estimativa de lista do CLI US$ 28,61 (subscrição, não factura) | tokens **n/d** (não reportados no formato esperado) |
| Exits | 56/56 = 0 | 56/56 = 0 |

**Testes pré-registados (McNemar exacto direccional, α 0,05):**

| H1 | Discordantes | p | Leitura |
|---|---|---|---|
| B apanha mais mutantes | B-só 0 · A-só 1 (`mooter-02-M`, o único mutante de «guarda removida») | 1,0 | não suportada — **não** é prova de igualdade: 1 discordante quase não informa |
| B tem menos alarmes nos originais | B-só 2 (`fastify-07-C`, `hono-09-C`) · A-só 0 | 1,0 | idem |

Excluindo os 4 mutantes de erro de compilação (os dois revisores marcaram os 4), os discordantes são os mesmos (B-só 0 · A-só 1 nos mutantes; B-só 2 · A-só 0 nos originais) e os dois p = 1,0 não mudam.

**Concordância:** 53/56. Os dois motores alarmaram nas **mesmas** duas janelas originais (`mooter-05-C`, `fastify-05-C`) e falharam o mesmo mutante (`fastify-05-M`) — dois alarmes partilhados, **não adjudicados**; podem ser leitura partilhada errada do contrato tanto como defeito real. Contam como alarmes.

## O que a amostra é (declarado, sem retoque)

- **Selecção determinística, não aleatória:** ficheiros por ordem alfabética, linhas por ordem, operadores pela lista; os primeiros mortos ficam. 28 mutantes em **15 ficheiros**; janelas de ficheiros vizinhos sobrepõem-se. Operadores efectivamente usados: `=== → !==` 12, `!== → ===` 4, `< → <=` 4 — **os 4 em parâmetros de tipo TypeScript** (`Record<string, string>` → `Record<=string, string>`, `<T>` → `<=T>`: `hono-01` `accept.ts:3`, `hono-05` `body.ts:16`, `hono-06` `body.ts:26`, `hono-09` `concurrent.ts:9`), isto é, erros de sintaxe e não defeitos semânticos — a regex do operador em `mutate.mjs`, `/(?<![<=!])<(?![<=])/`, não exclui o `<` de parâmetros de tipo —, `if (!x) → if (x)` 3, `return true → false` 2, `Math.max → min` 1, `&& → ||` 1, guarda removida 1. **8 dos 12 operadores da lista exercitados, 7 semânticos** (o `<` só acertou em parâmetros de tipo); os outros 4 não chegaram a ser exercitados.
- **Oráculo:** «morto pelo teste» = o teste emparelhado passa no original (verificado uma vez por ficheiro) e falha com a mutação, em ≤ 120 s. É divergência do comportamento testado. Separação pela `fail_tail` de `mutants.json`: **24 mortes com o teste executado** (22 com `ERR_ASSERTION`/`expect`/`FST_ERR` na cauda; em 2 — `fastify-06`, `hono-10` — a cauda de 300 caracteres só mostra a pilha do runner com o teste a correr) e **4 mortes de carregamento/parse** (a cauda acaba em `loadAndTransform` do vite; o teste nunca executou) — precisamente os 4 mutantes `< → <=`. Os dois revisores descreveram esses 4 como sintaxe TypeScript inválida (`results/A.json`, `results/B.json`, linhas `hono-01-M`, `-05-M`, `-06-M`, `-09-M`).
- **A linha-alvo está marcada nos dois grupos** — o revisor sabe **onde** olhar, não se é mutante ou original. Isto pode inflacionar `ACHADO` nos dois braços por igual. Sem ablação sem marcador.
- **Pontuação por localização:** TP = `ACHADO` com `PROVA` a ±2 da linha plantada; a explicação **não** foi adjudicada. Neste conjunto a tolerância não mudou nada (todos os desvios são 0). Parser: `ACHADO:` com dois-pontos, e `SEM ACHADO` tem precedência (`review.mjs:32-35`).
- **`checkCitation`** verifica que ficheiro:linha existe na árvore (corrigido em D2 para recusar a linha N+1); **não** avalia relevância. O mutante de guarda removida (`mooter-02`) **não** desloca a numeração: `mutate.mjs` deixa a linha vazia (`const mutated = op.to === '' ? '' : line.replace(op.re, op.to)` e `copy[i] = mutated` (`mutate.mjs:63,65`)), não a apaga; o desvio em `results/A.json` (`mooter-02-M`, `tools/router/_model-resolver.js:44`, alvo 44) é 0. A v2 dizia que diferiam de 1 e estava errada — retirado em `AMENDMENT-1.md`.
- **1 corrida por janela por braço;** temperatura não controlável no `claude -p`.

## Leitura honesta

1. **A hipótese perdeu e imprime-se assim.** Com mutações sintácticas de uma linha e a linha marcada, os dois motores estão perto do tecto. Não se afirma equivalência (não há margem pré-definida); afirma-se que a superioridade de B não ficou estabelecida. Sem os 4 mutantes de erro de compilação a leitura é a mesma: 23/24 vs 22/24, mesmos discordantes, mesmos p.
2. **Autoria não foi testada.** «Crítico ≠ autor» exige um braço em que o autor **produz** o código e o revê; não existe neste pacote. Fica em `10-NAO-PROVADO.md` como a experiência que falta.
3. **Sobre a citação:** 59/59 referências resolvem para uma linha existente. É descritivo. **Não** demonstra valor incremental do verificador (não houve referência inválida cuja rejeição mudasse um resultado) nem que a linha suporta a acusação.
4. **Custo:** o revisor Opus consumiu o equivalente a US$ 0,51 de lista por janela em subscrição; o Codex `n/d`. Nenhum dos dois é o crítico **local** ($0) que o roadmap quer; mediu-se em 2026-08-21 que esse tem zero discriminação e não foi repetido aqui.

## O que isto NÃO prova

- Auto-revisão real. Defeitos reais de produção. Que os alarmes partilhados são defeitos reais. Valor incremental do verificador. Tempo humano. O crítico local. Revisão multi-ficheiro. Estabilidade run-a-run.

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P4-critico-nao-autor/setup.mjs     # clona os 3 sujeitos nos commits de protocol.json e faz npm install --ignore-scripts
node _handoff/provas-v1-2026-09-09/P4-critico-nao-autor/mutate.mjs
node _handoff/provas-v1-2026-09-09/P4-critico-nao-autor/review.mjs --arm A
node _handoff/provas-v1-2026-09-09/P4-critico-nao-autor/review.mjs --arm B
node _handoff/provas-v1-2026-09-09/P4-critico-nao-autor/review.mjs --analyse
```

Os três scripts lêem a pasta dos sujeitos de `P4_REPOS` (por omissão `C:/Users/Paulo Loureiro/AppData/Local/Temp/provas-p4`, a que a corrida usou). `setup.mjs` foi escrito depois da corrida e **não** foi corrido aqui: os clones da corrida foram feitos à mão (`protocol.json → sujeitos.clonados_em`); `mutants.json`, `windows.json` e `results/*.json` são os da corrida de 2026-09-09.
