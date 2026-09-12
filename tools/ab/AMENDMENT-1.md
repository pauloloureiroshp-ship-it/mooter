# AMENDMENT-1 — custo-2026-09-10 («Teste besta custo»)

Emenda ao pré-registo `tools/ab/custo-prereg.json` (sha256
`079131b4712049225205a0f25edae2cff619e87e5767b86743fd0c6455b2a906`, main via #495),
escrita **antes da corrida**: não existe `tools/ab/custo-ledger.jsonl`, nenhum
`claude -p` nem `router-execute` do experimento foi chamado, e o sentinela D15
está ausente. Data: 2026-09-12 (a hora é a do commit que a põe em `origin/main` — a
âncora; não se escreve hora à mão). Decidido pelo dono (mensagem «sim, vai com a tua
recomendação nas 5 e escreve a emenda»), redigido por Claude Code (Opus 5), sessão e8d2b6d9.

O controlador (`tools/ab/correr-custo.mjs`, main via #508) só aceita overrides com
`--emenda <este ficheiro>`; exige (3b, no mesmo PR desta emenda) que este ficheiro esteja
em `origin/main` byte a byte (a mesma âncora do prereg e da análise) e sem alterações por
commitar; regista o sha256
dele no manifesto da corrida (`emenda.sha256`, com os overrides) e escreve `emenda:<sha12>`
no motivo da `tarefa_excluida` (#3). As outras decisões ficam no manifesto
(`runtime.router_execute_sha256`, `modelo_local.origem`) e nas linhas do ledger pelo que
são (`modelo_pedido` do passo local). Cinco decisões; tudo o resto do pré-registo fica como está.

## As 5 decisões

| # | Cláusula do prereg | Era | Passa a ser | Porquê |
|---|---|---|---|---|
| 1 | `pre_condicoes.router_execute_sha256` | `54d51c337c45e0bdbf480342e0676449431d6f9c131ab123df8662676f7a1817` | `d30ce17c737a6039dcd51dbcabf3e4b847d3fe85f6eeac715319818ac1b6915b` | A versão pinada tem o defeito D1: o pin de provider fixava `maxTokens` em 256, e um passo local cortado aos 256 tokens não é «o router como está», é um router partido. #498 (commit `e20e6142`, 2026-09-11 19:50 -03) subiu o tecto para 4096. É o ficheiro que está hoje em `~/.claude/tools/router/router-execute.js` E em `origin/main:tools/router/router-execute.js` (mesmo sha). Flag: `--router-execute-sha d30ce17c737a6039dcd51dbcabf3e4b847d3fe85f6eeac715319818ac1b6915b`. |
| 2 | `pre_condicoes.modelo_local` («resolvido em tempo de corrida: `OLLAMA_OPTION_A_MODEL`, senão `qwen2.5:3b`») | a seco → `qwen2.5:3b` (digest `357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b`) | `qwen2.5-coder:14b` (digest `9ec8897f747e246e970bc5cfdda85d22f1123dc2e3d34978a010a75968716849`), via `--pin-model` no `router-execute` | O `classify.js` congelado devolve `recommended_model: qwen2.5-coder:14b` para as 7 T0 do corpus (8 nas 25 com o suplente t13) nesta máquina — é o modelo que o hook do produto escolheria. Correr o 3b a seco mediria um default do provider que o produto não usa. Registado no manifesto: `modelo_local.origem = 'emenda (--modelo-local, --pin-model no router-execute)'`. Flag: `--modelo-local qwen2.5-coder:14b`. |
| 3 | `corpus.tarefas[ordem 17]` = `t23-1b929f35f1` (T3, `A-depois-B`, histórico 19) | em jogo | **excluída**; entra o 1.º suplente da lista pré-registada, `t02-7bb45751d8` (T3, histórico 9), no mesmo slot e com a mesma `ordem_dos_bracos` | Par morto por construção neste ambiente: no commit humano o teste `design/tools/moo-visual-audit.test.mjs` sai `3/19` com **16 skips** (Playwright ausente), abaixo do histórico 19 — nenhum braço pode ser aceite pela condição 3, e o controlador recusa gastar Opus nele sem exclusão (`--verificar`, 2026-09-12: «t23-1b929f35f1 T3 hist 19 · pai exit 1 2/19 skips 16 · filho exit 0 3/19 skips 16»). A exclusão é escrita no ledger como `tarefa_excluida` com motivo `emenda:<sha12> (--excluir)` no momento em que o slot seria corrido; a análise (interpretações 8, 15) consome o suplente pela ordem da lista. Flag: `--excluir t23-1b929f35f1`. |
| 4 | `aceitacao.tecto_e_criterio` («estourar o tecto = não aceite») × análise, interpretação 19 («`aceite: false` com todas as provas verdes é contraditório») | lacuna declarada no cabeçalho do controlador (NOTA DO TECTO): uma claude-p SEM JSON (`usage` e `modelUsage` null — morta aos 900 s, ou CLI a sair sem resultado) que deixou o worktree verde sai INVÁLIDA pela 19 | **interpretação 64** na análise (`custo-analise.mjs`, v25, mesmo PR desta emenda): `aceite: false` com todas as provas verdes NÃO é contraditório numa claude-p sem JSON nenhum **que chegou** (`arrancou: true` ou evidência) **e que é o tecto ou a morte que o protocolo produz** — tecto = a impressão digital do `spawnSync` aos 900 s (`cli_sinal 'SIGTERM'`, `cli_exit null`) com o relógio (`duration_ms`, que sem JSON é a parede, ou `ts_fim − ts_inicio`) ≥ 900 s − 1 s de tolerância; morte = o CLI saiu `≠ 0` sem sinal, abaixo do tecto + 1 s (aqui cai também o pipe segurado por um descendente até ao timer — `cli_erro ETIMEDOUT`, parede 900,0xx s; o `spawnSync` não mata um filho que já saiu). É a regra do prereg aplicada. A linha fica impressa com a marca `rejeicao_sem_json_verde` (R3: as perdas ficam visíveis), conta contra o braço, e a primária traz `sensibilidade_64` (o resultado sem esses pares, por braço) e o `AVISO_64` — sensibilidade, não limiar: não há número pré-registado para «quantos tectos são demais» e não se inventa um. «Morte» é confiança no `cli_exit` do controlador, não prova — fica dito. O que continua contraditório pela 19 (se verde): `aceite: true` sem JSON; sem JSON com `cli_exit 0` e sem sinal a qualquer hora (o CLI que sai 0 imprime o envelope); `SIGTERM` abaixo do tecto (kill precoce); uma linha que não chegou; JSON parcial (`usage` sem `modelUsage`). E a **65** (mesmo PR): numa claude-p sem JSON que chegou, a linha tem de ser possível neste protocolo, verde ou vermelha — `duration_ms` e os ts a divergir mais de 1 s, um sinal que não é `SIGTERM`, um sinal com `cli_exit` inteiro, `SIGTERM` abaixo do tecto, parede ≥ 901 s sem sinal, `num_turns`/`subtype`/`is_error` não-null, ou `tecto_estourado` a contradizer o sinal e o relógio → INVÁLIDA. O controlador passa a usar a mesma definição de «JSON» (`usage` OU `modelUsage`) para escrever os campos do envelope. `duration_ms ≥ tecto` com `aceite: true` continua contraditório (48). | Sem isto, um único tecto de 900 s num braço que acabou verde — o P7 mediu 872 s num braço em 46 — invalidava a corrida inteira, e «uma corrida, sem retoma» faria o experimento sair `n/d` por um caso que o prereg já decide. Não muda o critério: muda só o que a análise chama contradição, e só no que o protocolo produz. |
| 5 | subagentes do `claude -p` (brief 68/78/101: `--disallowedTools Task`) | não pré-registado | **permitidos** (sem `--sem-subagentes`; o executor de A fica byte a byte o do prereg) | O executor pré-registado é `claude -p … --model claude-opus-5 --permission-mode bypassPermissions --allow-dangerously-skip-permissions`, sem restrição de ferramentas — é assim que o produto corre. Restringir seria outro tratamento. A análise já marca o que um subagente deixa no JSON (`modelo_nao_opus_dominante`, 36; `abaixo_da_sonda`, 78/101) — fica como marca, não como invalidação. Sem flag. |

## O comando da corrida

Num terminal normal (fora de sessão Claude Code), **sem `ANTHROPIC_API_KEY`** no
ambiente (R7: o `claude -p` corre pela subscrição), a partir da raiz do repo com
`origin/main` a conter esta emenda, a v25 da análise e o prereg intactos:

```bash
node tools/ab/correr-custo.mjs --correr --emenda tools/ab/AMENDMENT-1.md --router-execute-sha d30ce17c737a6039dcd51dbcabf3e4b847d3fe85f6eeac715319818ac1b6915b --modelo-local qwen2.5-coder:14b --excluir t23-1b929f35f1
```

Fumo opcional antes (nunca fecha a corrida; `--so` ≤ 2 e exige um ledger novo):

```bash
node tools/ab/correr-custo.mjs --correr --so 2 --ledger tools/ab/custo-fumo.jsonl --emenda tools/ab/AMENDMENT-1.md --router-execute-sha d30ce17c737a6039dcd51dbcabf3e4b847d3fe85f6eeac715319818ac1b6915b --modelo-local qwen2.5-coder:14b --excluir t23-1b929f35f1
```

Pré-voo a $0, com as mesmas flags: `--verificar --sem-controlo` (ou sem `--sem-controlo`
para repetir o controlo dos 25 filhos).

## O que NÃO muda

- As 20 tarefas (menos a exclusão de #3), a seed, a ordem dos slots, a
  `ordem_dos_bracos`, o tecto de 900 s, a definição de aceitação (3 condições), a
  regra de paragem («UMA corrida, sem retoma»), as métricas, os preços de lista
  datados, o ledger (6 eventos, 31 chaves).
- O `classify.js` (`427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) e o
  `patterns.js` (`daf8270869f374a0be61c620f48224163d4f0433548a5d959a99097e728f18e5`), congelados.
- O executor de A e o de B na escalação/T2/T3 (byte a byte o do prereg, mais `--session-id`).
- A análise que julga é a de `origin/main` no momento da corrida: o pré-voo do
  controlador confronta o sha em disco com `origin/main` (168) e recusa-se a arrancar
  se divergirem.

## O que fica declarado

- A emenda é escrita depois do pré-registo e antes de qualquer número: o commit que a
  põe em `origin/main` é a âncora (a data acima é a do dia; não se escreve hora à mão). Se alguma destas 5 decisões
  vier a ser revista depois de ver parciais, a corrida perde o estatuto confirmatório
  (a regra do P7).
- #2 mede o router com o modelo que o produto escolheria, não o default a seco do
  provider: as conclusões sobre o passo local aplicam-se ao `qwen2.5-coder:14b` nesta
  máquina e a mais nenhum modelo.
- #3 não altera a mistura de tiers (t23 e t02 são ambas T3; o corpus fica 7 T0 · 13 T3)
  e reduz o histórico de testes do slot (19 → 9); a `DECLARACAO_DE_DEGENERESCENCIA` do
  prereg mantém-se.
- #4 não repara o caso irmão da mesma classe (aceitação de A morta pelo tecto de
  600 s da suite → 27c): fica INVÁLIDA se acontecer, e visível na linha.
- Riscos residuais da 64/65, aceites e não cobertos: um passo do relógio de parede > 1 s
  para trás durante um tecto honesto lê-se como kill precoce e INVALIDA a corrida; um passo
  > 1 s para a frente (ou uma pausa do controlador) numa linha sem sinal que acabe em
  [899, 901) s lê-se como «parede ≥ 901 s sem sinal» e INVALIDA (o `w32tm` desta máquina
  diz «free-running»; o pré-voo não o verifica); a parede leva 11–20 ms sobre o timer do
  `spawnSync` (medido), coberto pela tolerância de 1 s. Com `cli_erro ETIMEDOUT` sem sinal
  o controlador mata a árvore de um pid que pode ter saído há até 900 s (pid reutilizável
  em win32) — não toca a validade, toca a máquina; decisão do dono se o script filtra por
  `CreationDate`. «Morte»
  (64) é confiança no `cli_exit` do controlador, não prova — um controlador que deixasse
  cair o envelope de um exit `≠ 0` transformava um aceite em rejeição válida; a primária
  imprime tectos e mortes por braço para isso ficar à vista.
