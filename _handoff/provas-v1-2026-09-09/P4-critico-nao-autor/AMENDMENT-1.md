# P4 · AMENDMENT-1 — depois do adversário e da auditoria numérica: uma moldura retirada, n = 28, quatro mutantes sintácticos, uma ressalva falsa retirada

**Gatilho.** Ronda 1 do adversário (`adversary-codex-round1.md`, Codex gpt-6-astra, 10 ataques) e a auditoria numérica independente que se seguiu ao veredicto v2. O protocolo (`protocol.json`, `CONGELADO`) **não muda**: as correcções vivem aqui, no veredicto (v3) e no slide. Nenhum ficheiro em `results/` foi tocado.

**Cronologia (só horas de ficheiros e do git; nenhuma escrita à mão):** protocolo commitado em `030374b1` (`%cI` 2026-09-09T10:54:58-03:00 = 13:54:58Z, `protocol.json → congelado_em`) → `mutants.json → _generated` 2026-09-09T13:56:30.058Z → `results/B.json → at` 2026-09-09T14:27:27.181Z → `results/A.json → at` 2026-09-09T14:29:25.162Z → `results/analysis.json → at` 2026-09-09T14:29:42.900Z → resultados commitados em `1035fc71` (2026-09-09T11:31:03-03:00) → veredicto v2 + resposta ao adversário em `36ce31b1` (2026-09-09T11:36:37-03:00) → esta emenda (a hora é a do commit que a introduz: `git log -1 --format=%cI -- AMENDMENT-1.md`).

## (i) A moldura de autoria sai; os nomes nos ficheiros ficam

O braço A do protocolo está escrito como «AUTO-REVISAO: o mesmo motor que 'escreveu'». O adversário (P4-04, **fatal**) mostrou que nenhum dos dois motores escreveu o código revisto — mooter, fastify e hono nos commits pinados são código de terceiros para os dois braços. A moldura «auto-revisão vs crítico ≠ autor» **é retirada**: o que se mediu foi **revisor Opus** (A) vs **revisor Codex** (B) sobre as mesmas janelas.

O texto do braço A no `protocol.json` **fica como está** (o protocolo é congelado). A chave `A_self_review_opus` em `results/analysis.json` e a string `engine: "claude.exe -p --model opus (auto-revisao)"` em `results/A.json` **ficam inalteradas** por estabilidade dos ficheiros de resultados — leiam-se como «revisor Opus». A experiência de autoria real fica em `10-NAO-PROVADO.md`.

## (ii) n = 28, não 30

O protocolo pedia «os PRIMEIROS 10 mutantes mortos por repo = 30». `mutate.log`: `== fastify: 5 pares fonte/teste` … `== fastify: 8 mutantes mortos em 55s`. O gerador **esgotou os 5 pares fonte/teste elegíveis** do fastify (`lib/X.js` ↔ `test/X.test.js`) com 8 mortos; não foi o tecto de 60 min. Aplica-se a `regra_de_paragem` do protocolo («fica com os que tiver e o n imprime-se»): **28 mutantes** (mooter 10, fastify 8, hono 10) e **28 janelas originais** = 56 (`mutants.json → n`, `results/analysis.json → n_mutants`, `n_windows`). Os denominadores «/30» das métricas do protocolo lêem-se «/28». O veredicto v1 dizia «fastify no tecto»; a v2 já corrigiu.

## (iii) Quatro dos 28 mutantes são erros de compilação

Os 4 mutantes do operador `< → <=` acertaram, todos, no `<` de **parâmetros de tipo TypeScript** — a regex do operador em `mutate.mjs`, `/(?<![<=!])<(?![<=])/`, não distingue o `<` de comparação do `<` de `Record<…>` / `<T>`:

| id | ficheiro:linha | antes → depois (`mutants.json`) | `test_ms` |
|---|---|---|---|
| `hono-01` | `src/utils/accept.ts:3` | `params: Record<string, string>` → `params: Record<=string, string>` | 1746 |
| `hono-05` | `src/utils/body.ts:16` | `type SimplifyBodyData<T> = {` → `type SimplifyBodyData<=T> = {` | 1727 |
| `hono-06` | `src/utils/body.ts:26` | `type BodyDataValueComponent<T> =` → `type BodyDataValueComponent<=T> =` | 1670 |
| `hono-09` | `src/utils/concurrent.ts:9` | `run<T>(fn: () => T): Promise<T>` → `run<=T>(fn: () => T): Promise<T>` | 1873 |

**Separação pela `fail_tail`** (últimos 300 caracteres da saída do teste, guardados por mutante em `mutants.json`): nestes 4 a cauda acaba em `loadAndTransform` do vite — o ficheiro não fez parse e **o teste nunca executou**. Nos outros **24** o teste correu: 22 têm `ERR_ASSERTION` / `expect` / `FST_ERR` na cauda; em 2 (`fastify-06`, `hono-10`) a cauda só mostra a pilha do runner com o teste a correr (`server.test.js:222 … Test.run`; «This error originated in "src/utils/concurrent.test.ts" … while it was running»). O veredicto v2 dizia «não se separou falha de asserção de falha de carregamento»; agora está separado: **24 executadas, 4 de carregamento/parse**.

Os dois revisores marcaram os 4 e descreveram-nos como sintaxe TypeScript inválida (`results/A.json` e `results/B.json`, linhas `hono-01-M`, `hono-05-M`, `hono-06-M`, `hono-09-M`: «`Record<=string, string>` é sintaxe TypeScript inválida», «erro de sintaxe em `Record<=string, string>`», «`<=T>` em vez de `<T>`», …). Contam como acertos pela regra pré-registada (ACHADO com PROVA na linha), mas são acertos sobre um erro que o compilador apanharia sozinho.

**Recall excluindo os 4** (24 mutantes; Wilson 95 % por `lib/stats.mjs → wilson`):

| | A · revisor Opus | B · revisor Codex |
|---|---|---|
| 28 mutantes (como no veredicto) | 27/28 · 96,4 % [82,3; 99,4] | 26/28 · 92,9 % [77,4; 98,0] |
| **24 mutantes, sem os 4 sintácticos** | **23/24 · 95,8 % [79,8; 99,3]** (falha `fastify-05-M`) | **22/24 · 91,7 % [74,2; 97,7]** (falha `mooter-02-M`, `fastify-05-M`) |

**Pares discordantes e p não mudam:** os 4 são TP/TP nos dois braços (`results/analysis.json → per_window`), logo os discordantes continuam B-só 0 · A-só 1 (`mooter-02-M`) nos mutantes e B-só 2 · A-só 0 nos originais; McNemar exacto direccional p = 1,0 nas duas hipóteses pré-registadas, como antes (`mcnemar_mutants_B_catches_more.p_B_gt_A`, `mcnemar_controls_B_fewer_FP.p_B_fewer`). As 28 janelas originais não são afectadas (o controlo `hono-09-C` continua a contar: FP de B, TN de A).

**Operadores:** 8 dos 12 da lista foram exercitados; **7 semânticos** — o `<` só acertou em parâmetros de tipo (`=== → !==` 12, `!== → ===` 4, `if (!x) → if (x)` 3, `return true → false` 2, `Math.max → min` 1, `&& → ||` 1, guarda removida 1, `< → <=` 4 sintácticos). `<= → <`, `+ 1 → - 1`, `length - 1 → length`, `> 0 → >= 0` não chegaram a ser exercitados.

## (iv) A ressalva da numeração era falsa

O veredicto v2 dizia: «Para o mutante de linha apagada a numeração da árvore original e da janela diferem de 1 — absorvido pela tolerância». **Retirado.** `mutate.mjs` não apaga a linha — para «guarda removida» faz `const mutated = op.to === '' ? '' : line.replace(op.re, op.to)` e `copy[i] = mutated` (`mutate.mjs:63,65`) (a linha fica vazia) e a numeração mantém-se. Em `results/A.json`, `mooter-02-M` (`tools/router/_model-resolver.js`, alvo 44) tem `PROVA … :44`, desvio 0 e `citation_valid: true`. Os 27 acertos de A e os 26 de B têm todos desvio 0; a tolerância de ±2 não absorveu nada. A linha correspondente de `adversary.md` (P4-07) foi corrigida.

## (v) Reprodutibilidade — só nos scripts, depois da corrida

`mutate.mjs` e `review.mjs` tinham a pasta dos sujeitos cravada (`W = 'C:/Users/Paulo Loureiro/AppData/Local/Temp/provas-p4'`). Passam a ler `P4_REPOS` (a omissão é a mesma pasta; zero mudança de lógica; `node --check` nos dois). Foi acrescentado `setup.mjs`, que clona os três sujeitos nos commits do `protocol.json → sujeitos` (mooter `97ad846b`, fastify `1beaf7e7`, hono `06880c4a`; URLs lidos do `.git/config` dos clones da corrida) e corre `npm install --ignore-scripts` em cada um. **Não foi corrido**: os clones da corrida foram feitos à mão e os ficheiros de resultados são os de 2026-09-09.

## O que NÃO mudou

`protocol.json` (`030374b1`), `mutants.json`, `windows.json`, `results/A.json`, `results/B.json`, `results/analysis.json`, os 27/28 e 26/28, os 2/28 e 4/28 nos originais, os 59/59 de referências que resolvem, os dois p = 1,0. Nenhuma corrida foi repetida.
