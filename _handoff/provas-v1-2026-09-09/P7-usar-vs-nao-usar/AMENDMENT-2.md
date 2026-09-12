# P7 · AMENDMENT-2 — a corrida 2 saiu INVÁLIDA nos 46 braços; a corrida 3 arranca depois do reset, e a sonda de pré-voo fica desacreditada

**Escrito e commitado ANTES da corrida 3 produzir qualquer número.** Nenhum valor do pré-registo muda: `n` = 23, limiar = 16, α = 0,05, TVA ≤ 0,8×, seed 42, mesma atribuição, mesmo executor congelado.

## O que aconteceu

A corrida 2 arrancou às 2026-09-09T19:12:29Z (16:12 na hora do dono) e escreveu **46 braços** entre 19:25:29Z e 19:34:00Z. **45 dos 46** vieram com `is_error` do CLI e a mesma mensagem literal da corrida 1:

```
You've hit your session limit · resets 5pm (America/Sao_Paulo)
```

O único braço válido foi `t01-2e7599e021 OFF`. Como o Z do pré-registo é definido **por par** (ON e OFF da mesma tarefa), um braço solitário não forma par: **pares válidos 0 · inválidos 23**. O controlador imprimiu `X=0 · n=23 · limiar=16 · p=1.00000` seguido de `pares válidos 0 < 23 — subpotenciado, diferença não demonstrada` e **`R-24 · ENSAIO INVALIDO`**, saindo com 1 no `--correr` e no `--analisar` às 19:34:00Z.

O `p = 1,00000` e o `X = 0` **não são um resultado**. São o que a fórmula devolve quando não há medição nenhuma: zero sucessos em zero pares. Ficam impressos aqui porque estão no log preservado, e esconder um número que existe seria pior do que o problema.

Preservada inteira, como a corrida 1: `results/ledger-corrida-2-invalida.jsonl` (46 braços) e `results/correr-corrida-2-invalida.log`. Nada se apaga.

## Porque é que a corrida 2 nunca teve hipótese — e porque é que isso é culpa do desenho, não do azar

A mensagem do fornecedor nomeia a hora do reset: **17:00 na hora do dono**. A corrida 1 morreu às 14:09 com essa mesma mensagem. A corrida 2 arrancou às **16:12** — quarenta e oito minutos antes do reset, **dentro da mesma janela de sessão que a corrida 1 já tinha esgotado**. Não era uma janela nova. Era a mesma janela, com a mesma conta já gasta.

Isto não se descobriu depois: estava escrito na própria mensagem que eu li e citei na `AMENDMENT-1`. Lancei na mesma. É um erro meu de leitura, não uma falha do fornecedor.

## D11 — a sonda de pré-voo não testa o que o diagnóstico diz que testa

O `r24-diagnostico.mjs` correu às 16:12 e imprimiu:

```
ok  a sonda chega ao modelo  2136 ms · 2 tokens de entrada
VEREDICTO: --correr pode arrancar.
```

Treze minutos depois, **todos** os braços bateram no limite de sessão. A sonda passou com a janela esgotada. Uma sonda de 2 tokens não é um controlo positivo para o limite de sessão: mede que o executável arranca e fala, não que há orçamento para 46 invocações completas. O verde dela deu-me confiança que os dados não sustentavam, e foi essa confiança que gastou a corrida 2.

Entra em `09-DEFEITOS-APANHADOS.md` como **D11**. A correcção honesta não é tornar a sonda maior — é o diagnóstico deixar de afirmar «pode arrancar» com base nela, e passar a imprimir a hora do reset conhecida quando existe. Não altero o executor congelado nesta corrida: fica **declarado**, não corrigido.

## Um confundidor que declaro sem quantificar

A sessão que **mede** partilha a quota do fornecedor com o sujeito **medido**: o R-24 lança `claude.exe` com as mesmas credenciais da sessão que o observa. Enquanto a corrida 2 corria, esta sessão tinha um exame adversarial de dezenas de agentes em curso, e 18 desses agentes falharam com a mesma mensagem de limite. Não sei separar quanto da janela foi consumido pela corrida 1, quanto por mim e quanto pelo trabalho normal do dia — não há contador por origem. **Fica declarado como confundidor não quantificado**, e como regra para a corrida 3: enquanto ela correr, esta sessão não lança sub-agentes nem workflows.

## O que se faz na corrida 3

A mesma coisa que a `AMENDMENT-1` mandou fazer na corrida 2, com a diferença que agora a pré-condição que faltava está verificada pelo relógio e não pela sonda:

1. **Ledger novo.** As corridas 1 e 2 ficam preservadas nos ficheiros acima; o caminho do pré-registo arranca vazio. Os 23 pares voltam todos a correr — `jaFeitos()` trata qualquer braço já escrito como feito, válido ou inválido, por isso repetir só os que faltam está mecanicamente bloqueado, e seria escolher medições.
2. **Arranque depois do reset.** Lançada às **2026-09-09T20:04:44Z (17:04:44 na hora do dono)**, quatro minutos depois do reset das 17:00 nomeado pelo fornecedor, em janela nova. Diagnóstico às 17:03: tudo `ok`, sonda 4664 ms.
3. **O veredicto vem só da corrida 3.** Os 21 pares válidos da corrida 1 e o braço solitário da corrida 2 **não** entram no número publicado. Ficam disponíveis, rotulados como exploratórios.

O que isto **não** é: não é afrouxar o critério. `n` continua 23 e o limiar 16 — o executor recusa correr se o limiar recalculado não bater com o pré-registado, exactamente para impedir que «só faltaram 3 pares» vire um `n` mais pequeno e uma derrota vire vitória.

## O que fica dito no cartão, seja qual for o resultado da corrida 3

Que foram precisas três tentativas; que a primeira morreu às 46/46 linhas com 21/23 pares válidos e a segunda inteira com 0/23, ambas no limite de sessão do fornecedor; que ambas ficam publicadas; e que a segunda foi lançada por erro meu dentro da janela que a primeira já tinha esgotado, com um pré-voo verde que não sabia testar isso.

E se a corrida 3 também não fechar: o cartão P7 sai **INVÁLIDA**, com o bloqueio literal impresso e sem número. Uma quarta tentativa dentro do prazo das 72 h seria o mesmo gesto outra vez.

## Adenda escrita 20 minutos depois: dois arranques falhados da corrida 3, nenhum deles mediu nada

O ponto 2 acima diz «lançada às 20:04:44Z». Dessa tentativa e da anterior não saiu braço nenhum, e ambas ficam escritas porque um arranque que falha também é história.

- **Arranque A, 20:03:56Z.** O `Start-Process` do PowerShell não cita o argumento de `-File`, e o caminho do lançador tem espaços. O processo morreu antes da primeira linha do log. Zero braços.
- **Arranque B, 20:04:44Z.** Chegou ao `--correr`, sonda 2076 ms, e caiu no primeiro snapshot: `EPERM ... rm '…\Temp\r24-snapshots\t01-2e7599e021-OFF'`. Um processo que não consegui identificar mantinha aberto o `tools\router` do snapshot da corrida 2 (nenhum `claude.exe` do R-24 vivo, nada à escuta na porta 7821). Zero braços. Log preservado como `correr-corrida-3-arranque-falhado-EPERM.log`.
- **Arranque C, 20:07:55Z — o que conta.** Mesmo executor, mesmo pré-registo, mesma seed, com `--snapshots` a apontar para uma raiz nova (`…\Temp\r24-snapshots-c3`), que é um argumento que o controlador já suportava. Router pinado reconstruído na raiz nova: sha `b39c7da4aaa6…`, **igual** ao pré-registado — é o próprio executor a confirmar que a mudança de raiz não mudou o tratamento.

**Nenhum destes arranques escreveu um braço**, e a verificação não é a minha palavra: o ledger não existia no disco quando o arranque C começou, e o próprio C imprimiu `0 braços já no ledger`. Não há medição escolhida nem medição descartada — por isso isto são arranques da corrida 3, não corridas 3, 4 e 5.

**Uma diferença declarada:** a impressão digital do ambiente traz `cache 1baddb4b` na corrida 3 contra `1a0d60e3` nas anteriores, porque o `node_modules` foi copiado de novo para a raiz nova. É o mesmo repositório e as mesmas versões; o que muda é o caminho. Não ameaça o desenho, porque a comparação é ON contra OFF **dentro** da mesma corrida e os dois braços partilham a mesma cache — mas fica dito, para ninguém tropeçar no campo ao comparar ledgers.
