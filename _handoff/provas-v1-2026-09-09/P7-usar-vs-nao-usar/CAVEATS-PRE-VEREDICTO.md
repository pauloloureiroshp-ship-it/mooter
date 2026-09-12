# P7 · o que o cartão vai dizer, seja qual for o número

**Escrito e commitado a 2026-09-09, com a corrida 3 a meio (22 dos 46 braços) e sem veredicto.** Nada aqui depende do resultado: são factos sobre o **tratamento** e sobre a **integridade** da corrida, lidos do ledger, e valem impressos quer o R-24 dê GANHOU, PERDEU ou INVÁLIDA. Escrevem-se agora precisamente porque escritos depois teriam outra cor.

## O controlo de manipulação passa: o tratamento foi mesmo aplicado

| Verificação | Braço ON | Braço OFF |
|---|---|---|
| O hook disparou | **todos** | **nenhum** |
| Um `<router-hint>` foi injectado | sim, mediana ~2 479 bytes por prompt | — |

Isto é o que impede a leitura preguiçosa «os dois braços eram iguais e a diferença é ruído». Eram diferentes, e a diferença é exactamente a que o pré-registo define.

## O que o tratamento **é**, e é mais estreito do que «usar o Mooter»

**O hint disse `T0` em todos os braços ON, e o tecto (`hint_max_tier`) também.** Não é o router a escolher um tier adequado a cada tarefa: é o defeito vivo **D1** (`applyBudgetCap` compara um objecto com números) a limitar tudo a T0, exactamente como o P1 e o P2 já mediram noutros corpora. Portanto, ganhe ou perca, este cartão mede:

> «uma sessão com o hook ligado, que recebe ~2,5 KB de texto de hint e a recomendação T0, contra uma sessão sem hook nenhum»

e **não** «uma sessão bem roteada contra uma mal roteada». Quem quiser o segundo tem de esperar pelo D1 corrigido e por uma corrida nova.

**A pré-resposta local (Option A) não entrou.** `hint_opcao_a` é falso em todos os braços ON, portanto o custo de 256 tokens locais que o P3 mediu **não** faz parte deste tratamento. Uma coisa a menos a confundir.

## Integridade da corrida

- **Nenhum braço tocou no ficheiro de teste** (`tocou_no_teste` falso em todos). O oráculo é externo e ficou externo — é a defesa contra a solução mais fácil, que seria mexer no teste.
- **`effort` fixo em `xhigh`** nos dois braços, como o pré-registo manda.
- **O `router_sha` de cada braço** fica gravado linha a linha, e bate com o pré-registado.

## O que este cartão não prova, decidido antes de saber o número

Generalização a outro repositório, outra máquina ou outro modelo. Qualidade do trabalho para além do teste mecânico passar — o critério é binário e não julga o código. Obediência: o desenho é *intention-to-treat*, mede-se ter o hook ligado, não a recomendação ser seguida. E não separa «o hint ajudou» de «o hint ocupou contexto»: são 2,5 KB a mais no prompt e o efeito disso, bom ou mau, está dentro do número e não ao lado dele.

## O número parcial que existe neste momento, e que não é o resultado

Com 11 dos 23 pares fechados, o leitor independente imprime `X = 10 · pares válidos 11 · p = 0,798 · INCOMPLETA (pares válidos < n)` e **recusa-se a dar veredicto**, que é o comportamento certo. Fica escrito aqui pelo mesmo motivo que o número da corrida 1 ficou escrito na `AMENDMENT-1.md`: existe, qualquer pessoa o recalcula do ledger, e esconder um número que existe é pior do que o problema que resolve. **O limiar 16 foi calculado para 23 pares. 10 em 11 não é o mesmo teste, e aceitá-lo seria exactamente a «correcção honesta» que o pré-registo bloqueia por escrito.**

---

## Correcção escrita depois do veredicto: um destes avisos estava errado

Este ficheiro foi escrito com a corrida 3 a meio e diz, na secção «o que o tratamento é», que **o hint disse T0 em todos os braços ON**. Era verdade nos 13 pares da corrida 3. **Não é verdade na corrida 4**, que é a que conta: `hint_tier` foi **T0 em 20 tarefas e T2 em 3** (`t21`, `t22`, `t23`).

A conclusão que eu tirava daí — «isto mede o hook a recomendar T0, não o router a escolher tier» — fica **mais fraca e mais interessante**: em 3 das 23 tarefas o router escolheu mesmo um tier acima, e são exactamente as 3 em que o Mooter **não ganhou** (Z = 0 nas três). Ver o veredicto.

Deixo o erro à vista em vez de o editar para trás. Um aviso pré-escrito só vale se se aceitar que os dados o podem desmentir, e este desmentiu.
