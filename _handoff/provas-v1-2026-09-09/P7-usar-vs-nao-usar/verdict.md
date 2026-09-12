# P7 · veredicto — R-24: o controlador imprimiu **GANHOU**, X = 18/23, p nominal 0,00531 — e o estatuto confirmatório caiu no exame adversarial

**Pré-registo congelado a 2026-09-04** (`r24-prereg.json`, sha `5ddd527ece9ac3a2…`). Corrida válida a 2026-09-09/10. Este veredicto foi reescrito depois da ronda 1 do adversário (`adversary.md`), que derrubou o enquadramento e apanhou **dois erros factuais meus**. O número sobreviveu; a moldura à volta dele não sobreviveu intacta.

## O número

| | |
|---|---|
| **X (tarefas com Z = 1)** | **18 de 23** · 78,3 % [58,1 · 90,3] (Wilson 95 %) |
| Limiar pré-registado | 16 (calculado para n = 23, α 0,05) |
| **p nominal do teste especificado** | **0,00531** — binomial exacta unilateral, cauda superior, p₀ = 0,5 |
| Pares válidos | **23 de 23** · braços inválidos **0 de 46** |
| Controlador | `R-24 · GANHOU`, `--correr` exit 0, `--analisar` exit 0 |
| Leitor independente | `GANHOU`, os mesmos 18 e o mesmo p, re-derivados do ledger cru |

`Z = 1` exige **duas** coisas na mesma tarefa: o braço ON produzir trabalho **aceite** pelo teste do repositório **e** demorar **≤ 0,8×** o tempo do braço OFF.

**Porque é «p nominal» e não «p».** A conta está certa e qualquer pessoa a repete. O que não está estabelecido é o modelo por baixo dela: independência entre 23 tarefas heterogéneas do mesmo repositório, que partilham estado e correm em sequência. Contrabalançar a ordem não estabelece independência, e o intervalo de Wilson não transforma um conjunto fixo de tarefas escolhidas numa amostra representativa. É o p do teste que foi especificado, não uma inferência calibrada sobre «tarefas em geral».

## O que a vitória é, em tempo

| | Braço ON (hook ligado) | Braço OFF (sem hook) |
|---|---|---|
| Tarefas aceites pelo teste congelado | **23 de 23** | **23 de 23** |
| Tempo até verde, mediana | **77 s** | 145 s |
| Tempo total nas 23 tarefas | **62 min** | 91 min |
| Rácio ON/OFF: min · p25 · mediana · p75 · max | 0,36 · 0,52 · **0,56** · 0,70 · **2,29** | — |
| ON foi mais rápido | **22 de 23** | — |

**Os dois braços resolveram tudo.** Pelo critério mecânico — o teste do repositório passa — a qualidade é idêntica: 23 em 23 dos dois lados. A diferença medida é **só tempo**. Isto não diz que o código seja igualmente bom: diz que um teste binário não distingue os dois, e um teste binário é tudo o que este desenho tem.

## As cinco tarefas em que o Mooter não atingiu o limiar

**Correcção de um erro meu.** A primeira versão deste veredicto dizia que as tarefas sem ganho eram três e que eram as três mais longas. **As duas afirmações eram falsas** e o adversário apanhou-as (P7-07). São **cinco**, e a tarefa mais longa que o Mooter ganhou (`t12`, T0, 519 s) é mais longa do que duas delas.

| Tarefa | Tier do hint | ON | OFF | Falhou o limiar por |
|---|---|---|---|---|
| `t05` | T0 | 68 s | 74 s | rácio 0,92 |
| `t16` | T0 | 128 s | 145 s | rácio 0,88 |
| `t21` | T2 | 330,85 s | 412,68 s | **0,703 s** — poupou 82 s e ficou a sete décimos do corte |
| `t22` | T2 | 541 s | 237 s | **2,29× mais lento**, a única em que o ON perdeu tempo |
| `t23` | T2 | 542 s | 617 s | 48,8 s — poupou 75 s |

**Em quatro das cinco o braço ON foi mais rápido**, só não pela margem pré-registada. A `t21` falhou por **sete décimos de segundo**. O limiar de 0,8× é uma linha dura e foi fixada antes de ver os dados, portanto conta; mas apresentar estas cinco como «o Mooter não ajudou» seria falso.

## Estratificação por tier — exploratória, e confundida

| Tier do hint | Tarefas | Z = 1 |
|---|---|---|
| T0 | 20 | **18** · 90,0 % [69,9 · 97,2] |
| T2 | 3 | **0** · 0 % [0 · 56,1] |

**Isto não localiza o efeito, e o adversário tem razão nas três objecções** (P7-06, P7-08). Primeira: o estrato é definido por uma **saída do próprio tratamento** — o tier que o hook recomendou — e não por uma medida independente de dificuldade. Segunda: as três tarefas T2 são também as **três últimas da sequência** e as três correram **OFF primeiro**, portanto tier, posição temporal e ordem estão sobrepostos e não se separam com n = 3. Terceira: «o ganho desaparece nas tarefas difíceis» é **falso** — em duas das três o ON foi mais rápido, uma delas por 82 segundos.

O que se pode dizer, e só isto: **nenhuma das três tarefas marcadas T2 atingiu Z = 1**. Porquê, este desenho não responde.

## Ordem de execução — exploratória, e menos dramática do que eu escrevi

A cache de prompt do fornecedor é partilhada entre braços e favorece quem corre em segundo. A ordem foi contrabalançada no pré-registo.

| Ordem | Todas as tarefas | **Só as 20 T0** | Rácio mediano (T0) |
|---|---|---|---|
| ON primeiro | 11/12 | **11/12 · 91,7 %** | 0,553 |
| OFF primeiro | 7/11 | **7/8 · 87,5 %** | 0,577 |

**O contraste 11/12 contra 7/11 era composição, não ordem** (P7-09): os três T2, todos com Z = 0, caem todos no grupo OFF-primeiro. Comparando tarefas do mesmo estrato, a diferença por ordem é de quatro pontos percentuais e os rácios medianos quase coincidem.

**E retiro a conclusão que tirei daí.** Eu escrevia que o padrão «contraria a explicação da cache, portanto a cache não é a causa». Não posso afirmá-lo (P7-10): não há telemetria de acertos de cache, os prompts ON e OFF são diferentes, três corridas anteriores já aqueceram componentes, e a cache de prompt do fornecedor não é a mesma coisa que a cache local de orçamento. **A comparação por ordem não permite excluir efeitos de cache.**

## O estatuto confirmatório caiu — e é a objecção mais séria de todas

O adversário classificou isto como **fatal**, e aceito (P7-01).

A `AMENDMENT-2.md`, escrita antes da corrida 3, dizia: «se a corrida 3 também não fechar, o cartão P7 sai INVÁLIDA … uma quarta tentativa seria o mesmo gesto outra vez.» **A corrida 3 não fechou, e eu corri uma quarta** — depois de ver que ela ia em 12 sucessos em 13 pares. A `AMENDMENT-3.md` foi escrita antes de a corrida 4 produzir um número, mas isso não a torna anterior à **decisão**, que foi tomada com resultados parciais favoráveis à vista.

**O limiar não mudou. A regra de paragem mudou.** Um plano pré-registado que se altera depois de ver resultados deixa de suportar a leitura confirmatória, e nenhuma forma de o escrever bem corrige isso.

**O que este resultado é, então:** um ensaio com critério pré-registado, executado com o executor, a seed, a atribuição e o limiar do pré-registo — e com a regra de paragem quebrada. O número é o que é; o estatuto de confirmação não se reclama.

**Uma coisa que joga contra a leitura de que fui à pesca** (P7-02, levantado pelo próprio adversário): a corrida 1 tinha **16 sucessos em 21 pares válidos**. Se esses 21 fossem preservados, mesmo dois insucessos nos dois pares em falta davam X = 16/23 — exactamente o limiar. **Abandonar a corrida 1 não era necessário para atingir o limiar; se alguma coisa, custou-me uma vitória mais fácil.** Isto não valida a corrida 1 nem repara a regra de paragem. Fica escrito porque é a evidência disponível e aponta para o outro lado.

## O tratamento da corrida 4 não é o mesmo das outras

Também aceite (P7-03, P7-04). Eu escrevi que congelar o `.budget-cache.json` era «fora da experiência». **É falso pela definição do próprio pré-registo:** a Emenda 8 define o tratamento como «o router pinado **mais este ambiente e este estado**», e esse ficheiro entra no `estado_vivo_sha`. Está dentro.

O tratamento da corrida 4 descreve-se, então, como **hook instalado, com o estado de orçamento congelado**. Não «hook instalado».

E a neutralidade do congelamento **não foi demonstrada**. Um `catch` não-fatal mostra que a falha de escrita é tolerada, não que nada mais muda — latência, releituras, valores antigos a alimentar decisões. A minha justificação de que «o D1 força T0 em tudo, portanto o orçamento é irrelevante» **foi desmentida por esta mesma corrida**: há três tarefas com hint T2. Não posso concluir que o congelamento causou isso — a corrida 3 parou antes de chegar às tarefas 21 a 23 — mas também não posso concluir que não causou.

## O que isto não prova

Generalização a outro repositório, máquina ou modelo: **n/d** — 23 tarefas, um repositório, uma máquina. Qualidade para além de o teste passar: o critério é binário. Obediência: o desenho é *intention-to-treat*; a obediência executada continua **0/20** (P3). Separar «o hint ajudou» de «o hint ocupou contexto»: são ~2,5 KB a mais por prompt e o efeito está dentro do número. Custo em dinheiro ou tokens: o pré-registo mede tempo. Independência entre tarefas: assumida pelo teste, não estabelecida. Ausência de efeitos de cache: não excluída. Neutralidade do congelamento do cache: não demonstrada. E, por causa da regra de paragem, **um estatuto confirmatório**.

## As quatro corridas

| Corrida | Braços | Pares válidos | Fim | Porque não conta |
|---|---|---|---|---|
| 1 · 14:51Z | 46 | 21 | `ENSAIO INVÁLIDO` | 3 braços com o limite de sessão do fornecedor; o controlador exige 23 pares. Chegou a imprimir `X=16 · p=0,04657` |
| 2 · 19:12Z | 46 | **0** | `ENSAIO INVÁLIDO` | 45 braços com o mesmo limite; lançada por erro meu dentro da janela que a 1 já esgotara |
| 3 · 20:07Z | 26 | 13 | `PÁRA a meio` (exit 2) | a guarda do executor: o `estado_vivo_sha` mudou porque o hook desta sessão refrescou o cache de orçamento (D15). Chegou a imprimir `X=12` |
| **4 · 21:39Z** | **46** | **23** | **`GANHOU`** (exit 0) | — |

As três ficam publicadas inteiras em `results/`, com os números que imprimiram. As emendas 1, 2 e 3 foram escritas antes de a corrida seguinte produzir um número — o que, como o adversário demonstrou, não basta.

## Reproduzir

```bash
cd ~/frugal
node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --correr
node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --analisar
node _handoff/provas-v1-2026-09-09/P7-usar-vs-nao-usar/analyse.mjs
```

Cerca de 2 h 22 min e 46 invocações completas do agente. Antes de arrancar, ver `AMENDMENT-3.md`: sem congelar `~/.claude/tools/router/.budget-cache.json`, a guarda de integridade pára a corrida a meio — e com ele congelado, o tratamento é «hook com estado de orçamento congelado».
