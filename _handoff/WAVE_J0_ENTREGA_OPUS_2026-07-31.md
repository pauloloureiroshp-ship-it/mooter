# WAVE J-0d + J-5 — ENTREGA MEDIDA (implementada por Opus 5, validada com node --test)

**Data:** 2026-07-31 · **Onde:** `~/frugal` (main, working tree) · **Por:** Opus 5 directamente, sem despachar
**Estado:** implementado e testado · **NÃO comitado** (o mount não escreve `.git` — o commit é teu, nativo)

---

## O que mudou, e quanto vale

| Superfície | Antes | Depois | Redução |
|---|---:|---:|---:|
| **Recibo** (7 cargos parados, 4 excepções abertas, 5 jobs) | 8 555 B | 4 808 B | **−43,8%** |
| **Bloco de um cargo sem trabalho** | 935 B | 300 B | **−67,9%** |
| **Goal repetido 4× no `view=jobs`** | 11 848 B | 784 B | **−93,4%** |

Medições reprodutíveis: `node /tmp/final.js` (script no fim deste documento).

---

## Ficheiros alterados

| Ficheiro | O quê |
|---|---|
| `packages/mooter-bridge/recibo.js` | `buildEmptyCargoRecord()` — bloco compacto para cargo sem trabalho; `verbose` propagado |
| `packages/mooter-bridge/fleet.js` | `resumoGoal()` + `GOAL_RESUMO_CHARS`; `waveSummary`, `waveFocus` e `publicJob` passam a cortar o goal; exportado `_resumoGoal` |
| `packages/mooter-bridge/tools6.js` | `verbose` no schema do `mooter_fleet`; **`id`** no `mooter_setup`; **`handoff_from`** no `mooter_work` |
| `packages/mooter-bridge/dieta.test.js` | **novo** — 15 testes |

---

## O erro que cometi, e porque o conto

A primeira implementação **suprimiu** os blocos de cargo vazios. Parecia óbvio: 7 blocos a dizer
"nenhum trabalho" são ruído.

**Partiu 5 testes.** Entre eles `S2 — cargo sem trabalho aparece com zero e porquê`, que defende uma
garantia conquistada na v1.22: *nenhum agregado nasce a zero sem explicação*. E pior — a supressão
teria deitado fora as **excepções abertas** de cargos parados. Hoje MOO, MTO, MFO e MEO estão todos
fora da faixa **e** sem trabalho na janela. Suprimir teria escondido as quatro.

Corrigi para **comprimir em vez de suprimir**. O bloco continua a existir, continua a dizer zero,
continua a dizer porquê, e as excepções continuam lá. O que desapareceu foi só a repetição de
estruturas vazias — a frase "nenhum trabalho deste cargo na janela" aparecia 4× dentro do mesmo bloco.

Registo isto porque o baseline (15/15 verdes antes de eu tocar) foi o que me apanhou. **Sem medir o
baseline primeiro, teria entregue uma regressão com ar de melhoria** — exactamente o padrão que
diagnosticámos hoje três vezes (A4, G.3, J0-A).

---

## As duas linhas de schema que estavam a travar o produto

Nenhuma destas exigiu lógica nova. **O código já suportava as duas** — o schema é que as recusava,
porque é `additionalProperties: false`.

| Linha | Consequência medida antes |
|---|---|
| `id` em `mooter_setup` | `sessao.js:78,120` já guardava por id, mas o id era sempre `'actual'`. **Slot único** ⇒ sem estado por projecto, e `sessao:"listar"` nunca poderia devolver mais de uma entrada |
| `handoff_from` em `mooter_work` | `seamless.js:1450` já o aceitava e o painel já desenhava a seta. Mas só nascia em `if (chain && agent === 'moo')` ⇒ **handoff só moo→nuvem**. Agora abre nuvem→moo (verificar a $0 o que a nuvem produziu — coisa que o Maestro não consegue, por não ter GPU) e nuvem→nuvem (segunda opinião) |

---

## Prova — testes corridos com `node --test` (Node v22.22.3)

| Suite | Resultado |
|---|---|
| `dieta.test.js` (novo) | **15/15** |
| `recibo.test.js` | **15/15** |
| `fleet.test.js` | **40/40** |
| `entrega.test.js` | **145/145** |
| `seamless.test.js` | **29/29** |
| `a4.test.js` | **27/27** |
| `board.test.js` | **16/16** |
| `bundle.test.js` | **8/8** |
| `tools6.test.js` · `audit.test.js` | **1/1** · **1/1** |
| **Total nas suites afectadas** | **297 passa · 0 falha** |

**Baseline antes de tocar:** `recibo.test.js` 15/15. Confirmado com `git show HEAD:...` antes de editar.
**Ressalva honesta:** `arvore.test.js` não devolveu resultado dentro de 40 s. Não toquei em `arvore.js`,
mas **não posso afirmar que passa** — fica por verificar.

---

## O que os 15 testes novos defendem

| # | Garante |
|---|---|
| D1 | Um cargo sem trabalho continua a dizer zero **e porquê** |
| D2 | Uma excepção aberta **nunca** desaparece por o cargo estar parado |
| D3 | Nenhum cargo desaparece da lista — continuam os 7 |
| D4 | `verbose:true` devolve o bloco por extenso |
| D5 | A dieta corta ≥40% (falha o teste se a compressão regredir) |
| D6 | Quem trabalhou **não** é compactado |
| D7-D11 | Goal: cortado, `goal_chars` preservado, curto passa intacto, prefere a 1.ª linha, nulo continua nulo |
| D12-D14 | Os 3 parâmetros de schema existem mesmo |
| D15 | Os schemas continuam **fechados** — a dieta não abriu buracos |

---

## O que NÃO fiz — e é preciso dizer

| Item | Estado |
|---|---|
| **J-0a libertar a GPU** | **Não feito.** É a causa-raiz de 3 loop holes (16,2 GB residentes, 1 653 MB livres). Próximo da fila |
| **J-0b arrumar o repo** | Não feito. SYNC.md com 3 438 linhas, 216 `.md` no topo de `_handoff/`, snapshot duplicado |
| **J-0c prep em paralelo** | Não feito. 20 s por job, 43 caracteres, `tokens_poupados: 0` |
| **Commit** | Não feito, e não pode ser feito daqui — o mount não escreve `.git` |
| **Merge do trabalho do Codex** | J-1 e J-2+J-3 entregaram em worktrees que este sandbox não vê. O J-1 calculou o custo do kimi em **US$ 0,065091** — bate com a estimativa independente de ≈$0,065 |
| **Bateria no conector real** | Só depois de instalares. O que corre aqui é o código-fonte, não o bundle instalado |

---

## Script de medição (reprodutível)

```js
const recibo = require('./recibo.js'), fleet = require('./fleet.js');
const T0 = Date.parse('2026-07-31T09:00:00.000Z');
const ev = (id,e,x,m) => Object.assign({job_id:id,event:e,ts:new Date(T0+m*60000).toISOString()},x);
const led = []; for (let i=0;i<5;i++){ led.push(ev('j'+i,'dispatched',{wave:'w',cargo:null,local:i<3},i));
  led.push(ev('j'+i,'done',{wave:'w',cargo:null,local:i<3,cost_usd:i<3?0:null,tokens_in:400,tokens_out:300},i+1)); }
const exc = [{metrica:'taxa_falha_pct',dono:'MTO'},{metrica:'interrupcoes_por_dia',dono:'MEO'},
             {metrica:'trabalho_zero_pct',dono:'MOO'},{metrica:'pressao_quota',dono:'MFO'}];
const o = {periodo:'dia', agora:'2026-07-31T10:00:00.000Z', excepcoes:exc};
console.log('recibo:', JSON.stringify(recibo.project(led,o)).length,
            'vs', JSON.stringify(recibo.project(led,{...o,verbose:true})).length);
```

---

## Próximo bloco proposto

1. **J-0a** — verify escolhe o maior modelo que **cabe** na VRAM livre. Destrava a verificação a $0,
   que é o único diferencial que o Maestro não consegue copiar.
2. **J-0c** — prep em paralelo com o job pago, não em série. −20 s por job, medido 3/3 vezes hoje.
3. **J-0b** — arrumação com **teste de CI que falhe** se o SYNC.md voltar a passar das 200 linhas.
   Sem enforcement, a regra volta a ser ignorada — já foi 4 vezes.
