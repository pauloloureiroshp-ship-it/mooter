# BEACHHEAD — as 10 primeiras pessoas reais

> Casa deste ficheiro: `_handoff/` (efémero — arquivar em `_handoff/_archive/2026-08/` quando as 10
> tiverem respondido). Preparado 2026-08-02 pela wave P1. **Enviar é gesto do Paulo.**

## O que este ficheiro NÃO tem, e porquê

**A lista de nomes está vazia.** Não conheço os amigos e a família do Paulo, e inventar 10 nomes
plausíveis seria exactamente a fabricação que a G18 existe para apanhar. As colunas estão prontas;
o preenchimento é dele, em 5 minutos, e é a parte que ninguém pode fazer por ele.

## O critério de escolha (usa isto antes de escrever o primeiro nome)

Uma pessoa só entra na lista se cumprir as três:

1. **Tem uma ideia a sério** — algo que já disse em voz alta mais do que uma vez. Não "gostava de
   aprender a programar": *"queria um sítio onde a minha equipa registasse X"*.
2. **Não sabe programar, ou sabe pouco.** Se souber, testa outra coisa — testa se a ferramenta é
   melhor que o que ela já usa, o que é uma pergunta diferente e mais difícil.
3. **Diz-te a verdade.** Se é alguém que te vai dizer que está óptimo para não te chatear, o sinal
   que dela vem vale zero — e pior, dá-te a sensação de que vale.

**Guarda 2-3 lugares para estranhos verdadeiros.** Amigos e família são sinal MACIO: dizem sim por
educação. O `sinal-valor.js` conta-os em separado por causa disto — `pagaria_estranhos` é o número
duro, `pagaria` é o número gentil.

## A lista (preenche tu)

| # | Quem | A ideia dela, na linguagem dela | Amigo / família / estranho | Convidado a | Instalou a | Respondeu? |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |
| 8 | | | | | | |
| 9 | | | | | | |
| 10 | | | | | | |

## A mensagem de convite (pronta a copiar)

Curta de propósito. Um convite longo lê-se como um pedido de favor grande, e um pedido grande é
adiado. Este pede 15 minutos e diz o que a pessoa recebe.

> Olá [NOME],
>
> Andei a construir uma coisa e preciso de alguém que não seja eu a experimentá-la.
>
> Lembras-te de me falares de [A IDEIA DELA]? É exactamente para isso.
>
> Instalas num duplo clique, apontas à pasta do teu projecto, e ele diz-te o que já lá tens e o que
> te falta para trabalhares com IA a sério. Não escreve nada no teu computador nesse primeiro passo
> — é só leitura.
>
> 15 minutos. E depois quero que me digas a verdade, mesmo que seja "não percebi nada" — sobretudo
> se for isso.
>
> [LINK DA RELEASE]
>
> Obrigado,
> Paulo

**O que muda por pessoa:** `[NOME]`, `[A IDEIA DELA]`. Mais nada. Se te apanhares a escrever um
parágrafo a explicar o que é o Mooter, o produto ainda não está pronto — e isso é informação.

## O que fazer quando ela responder

O sinal de valor não é uma conversa. São **duas perguntas**, feitas depois de ela ver alguma coisa
a funcionar (o `mooter_setup({primeira_vez:true})` mostra-as sozinho a quem já correu um trabalho):

1. *Usarias isto outra vez amanhã?*
2. *Pagarias $19/mês por isto, hoje, como está?*

Registas assim, na máquina dela ou na tua:

```bash
node packages/mooter-bridge/sinal-valor.js estranho sim nao "achei confuso o painel"
```

`<origem> <usaria> <pagaria> [comentário]` · origem = `autor|amigo|estranho` · resposta = `sim|nao|-`

O agregado sai com `node packages/mooter-bridge/sinal-valor.js`. **Zero respostas dá `n/d`, nunca
0%** — a diferença entre "perguntámos e ninguém quer" e "nunca perguntámos", que hoje é a verdade.
Nada disto sai da máquina: o ficheiro é `~/.mooter/sinal-valor.jsonl`, sem nome nem email.

## O número que fecha esta fase

Não é "10 convites enviados". É **quantas pessoas tocaram no que já está construído** — hoje, com a
release v1.45.3 publicada a 2026-08-02, o contador de downloads do asset está em **0**.

Enquanto esse número for 0, qualquer wave técnica seguinte tem de responder à G16 antes de começar:
*isto serve o juiz ou os estranhos? Se nenhum, é conforto disfarçado.*
