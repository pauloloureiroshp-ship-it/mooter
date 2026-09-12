# P7 · AMENDMENT-3 — a corrida 3 foi parada pela guarda do próprio executor; a causa é a minha sessão, e é corrigível fora da experiência

**Escrito e commitado ANTES da corrida 4 produzir qualquer número.** Nenhum valor do pré-registo muda: `n` = 23, limiar 16, α 0,05, TVA ≤ 0,8×, seed 42, mesma atribuição, mesmo executor congelado.

## O que aconteceu, e é diferente das duas primeiras

A corrida 3 arrancou às 2026-09-09T20:07:55Z e correu **bem**: 26 braços, **13 pares válidos, zero braços inválidos**, nenhuma mensagem do fornecedor. Às 21:22:03Z o executor **parou-se a si próprio**:

```
PÁRA a meio: estado_vivo_sha mudou (8bfb056f1f12 -> 8b5b88f63949)
o tratamento ou o terreno mudaram durante a corrida; as tarefas ja feitas
e as seguintes deixariam de ser comparaveis.
```

`--correr` saiu com **2** (não 1: é uma paragem, não uma corrida falhada) e o `--analisar` imprimiu `X=12 · n=23 · limiar=16 · pares válidos: 13 · inválidos: 0` e recusou o veredicto por `13 < 23`.

**Isto não é o limite do fornecedor.** É uma guarda de integridade a fazer exactamente o que devia. A Emenda 8 do pré-registo define o tratamento como «o router pinado **mais este ambiente e este estado**», e o executor grava a impressão digital desse estado em cada linha do ledger. Quando ela muda a meio, as tarefas já feitas e as seguintes deixam de ser comparáveis, e continuar seria misturar dois tratamentos no mesmo `X`.

## Qual dos ficheiros mudou, e quem o mudou

`estado_vivo_sha` é o sha de quatro ficheiros de `~/.claude/tools/router/`: `.mooter-mode.json`, `.pin-next.json`, `subscription-profile.json` e `.budget-cache.json`. Medido às 18:25 (hora do dono):

| Ficheiro | Última escrita |
|---|---|
| `.mooter-mode.json` | 2026-08-01 |
| `subscription-profile.json` | 2026-05-30 |
| `.pin-next.json` | ausente (e ausente é estável) |
| **`.budget-cache.json`** | **2026-09-09 18:19:43** — dois minutos e vinte segundos antes da paragem |

**Fui eu.** O `.budget-cache.json` é refrescado pelo `inject_context.js` — o hook `UserPromptSubmit` — quando o cache passa de **duas horas**. O hook corre a cada mensagem do dono **nesta sessão**, a que está a conduzir a experiência. A corrida dura ~2 h 30 min, portanto atravessa sempre a fronteira das 2 h; basta o dono escrever uma mensagem depois disso para o cache ser reescrito e a guarda disparar.

A corrida 1 durou 2 h 18 min e escapou por pouco. Não foi desenho: foi sorte.

**É o mesmo confundidor da `AMENDMENT-2.md` noutra roupa.** Lá, a sessão que mede partilhava a **quota** com o sujeito medido. Aqui, partilha o **estado**. A lição é a mesma e agora tem duas provas: *medir um sistema de dentro dele próprio contamina-o, e a única defesa é isolar explicitamente aquilo que ele toca.*

## A correcção, e porque não é afrouxar o critério

Congelar `.budget-cache.json` (só-leitura) enquanto a corrida 4 durar, e repor a seguir.

Três razões para isto ser legítimo:

1. **Não toca na experiência.** O executor continua congelado, a guarda continua activa, o pré-registo não muda uma vírgula. O que muda é a **máquina à volta**, que é onde o problema está.
2. **É o que a guarda pede.** A guarda exige que o estado seja **constante** durante a corrida — não que seja fresco. Congelar é obedecer-lhe, não contorná-la. Se eu tivesse desligado a guarda, seria fraude; congelar o ficheiro é a alternativa honesta.
3. **É seguro e reversível.** A escrita do refresco está dentro de `try { ... } catch { /* non-fatal */ }` (`refresh-budget.js:74-76`). Com o ficheiro só-leitura a escrita falha em silêncio e o hook segue. O único efeito é a sessão do dono mostrar dados de orçamento com até 5 h em vez de 2 h. Reposto no fim.

**O que fica declarado:** durante a corrida 4 o valor do orçamento visível ao router está congelado no que era às 18:19 (`five_hour` 29 % de utilização). O defeito **D1** já força T0 em tudo independentemente do orçamento, e as 13 linhas da corrida 3 confirmam-no (`hint_tier` T0 em todos os braços ON), portanto congelar este ficheiro não muda a decisão que o router toma. Fica dito na mesma.

## A corrida 3 fica preservada e publicada, inteira

`results/ledger-corrida-3-parada-por-guarda.jsonl` (26 braços) e `results/correr-corrida-3-parada-por-guarda.log`. Nada se apaga. **É a melhor das três até agora:** 13 pares válidos, zero braços inválidos, o controlo de manipulação a passar (hook em todos os ON, nenhum OFF) e nenhum braço a tocar no ficheiro de teste.

**O número que ela chegou a imprimir — `X=12` em 13 pares — não é o resultado**, pelas mesmas três razões da corrida 1: o controlador recusou-o; o limiar 16 foi calculado para 23 pares e 12 em 13 não é o mesmo teste; e os 10 pares em falta ninguém sabe como teriam caído. Fica escrito porque existe e qualquer pessoa o recalcula do ledger.

## O compromisso, escrito antes e sem margem

**A corrida 4 é a última.** Se ela não fechar os 23 pares, por que motivo for, o cartão P7 sai **INVÁLIDA**: com o bloqueio literal impresso, com as quatro corridas publicadas, sem número e sem veredicto. Não haverá quinta. Três causas distintas já é informação suficiente sobre a dificuldade de medir isto nesta máquina, e insistir passaria a ser escolher até sair o que convém.
