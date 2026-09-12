# MATRIZ 12 · veredicto

**Corrida:** 2026-09-10 · worktree `claude/matriz-12-mooter-comparison-3c2b8e` · HEAD `f66813e9` +
14 linhas em `tools/router/router-execute.js` (D1) · `classify.js` `427d8c0b…` e `patterns.js`
`daf82708…` intactos, verificados antes da primeira chamada · pré-registo `protocol.json` escrito
antes da corrida (`congelado_em` gerado por `new Date()`, não à mão) · `prompts.json` sha
`f51e1993…` (também a semente do sorteio) · **uma corrida**, 56 respostas, 0 falhas · juízes J1
(Codex) e J2 (Sonnet 5), 24/24 pontuações, ordem sorteada · J3 (humano) por preencher —
`PACOTE-CEGO.md` sha `71da6910…`, chave selada.

## Veredicto em uma linha

**O Mooter perdeu.** Não para o Opus 5 — para o **Haiku 4.5**, que teve mais qualidade (80,5 contra
56,5 em 128) **e** custou menos ($0,1527 contra $0,1620 de preço de lista imputado). A tese «poupa
sem perder qualidade» não sobrevive a esta matriz: existe uma alternativa mais barata que ele e melhor
que ele, e é a mais simples de todas — mandar tudo para o modelo pequeno de nuvem.

## Os números

| braço | n | pontos | máximo | custo faturado $ | pontos por $ | tempo s |
|---|---|---|---|---|---|---|
| D · Codex (agente com harness) | 12 | **109,0** | 128 | n/d | n/d | 290 |
| A · Opus 5 | 12 | 100,5 | 128 | 1,2045 | 83 | 595 |
| C · Haiku 4.5 | 12 | 80,5 | 128 | 0,1527 | 527 | 149 |
| **B · Mooter** | 12 | **56,5** | 128 | 0,1620 | 349 | 138 |
| B2 · Mooter, T0 em `qwen3:30b` | 10 | 33,5 | 104 | $0 fornecedor | — | 123 |

Pontos = média de J1 e J2 · máximo 10 por prompt, 12 nos 4 de risco · custo = preço de lista da
página oficial lida a 2026-09-10, cache incluído, **$0 reais** (os dois motores de nuvem correm por
subscrição) · tempo = relógio de parede, cold-start do CLI incluído.

**Ruído do instrumento: 2 pontos.** Nos dois prompts que caíram em T3, A e B correram o mesmo Opus 5
com a mesma linha de comando; a maior diferença que os juízes lhes deram foi 2. A distância de B a C
é 24. Não é ruído.

### Por degrau

| degrau | n | máx | A | **B** | C | D | faturado B | faturado C |
|---|---|---|---|---|---|---|---|---|
| T0 → local `qwen2.5-coder:14b` | 10 | 104 | 81,5 | **36,5** | 65,5 | 92,5 | $0 | $0,1273 |
| T3 → Opus 5 | 2 | 24 | 19,0 | **20,0** | 15,0 | 16,5 | $0,1620 | $0,0254 |

Onde o Mooter escolhe local, faz **metade** dos pontos do Haiku. Onde escolhe Opus, empata com o
Opus — como tinha de ser, é o mesmo motor. Não houve um único T1 nem T2 em 12 prompts: o
classificador saltou do degrau de baixo para o de cima sem pisar o meio.

### Nos 4 prompts de risco (RISCO a dobrar, máximo 48)

A 39,5 · D 36,0 · C 33,0 · **B 29,0**. O pior caso é o **OPS-3** — «onde guardo a chave da API no
Next.js para não ficar exposta no browser»: o classificador leu `ambiguous_short`, risco `minimal`,
e mandou-o para local. A resposta local diz `.env.local` e `.gitignore` e **não menciona
`NEXT_PUBLIC_`** — que é exactamente a forma de a chave ir parar ao browser. J2 deu 4 em 12 ao Mooter
e 12 em 12 ao Haiku nesse prompt.

## As previsões, contra o que aconteceu

| o MP previu | prompts | B − A | resultado |
|---|---|---|---|
| ganha em custo com qualidade equivalente (≤ 1 ponto) | DATA-1 · LEGAL-1 · MKT-2 · LEGAL-3 · DEV-2 | −3,0 a −5,5 | **falhou** |
| idem | MKT-3 | −1,0 | ≤ 1, mas ≤ ruído (2): **não é vitória** |
| empata (mesmo modelo) | DATA-4 · OPS-4 | +1,0 · 0,0 | **acertou** |
| empata (mesmo modelo) | P5 | −5,5 | **falhou** — foi a local, não a Opus |
| perde | OPS-3 · MKT-4 · DATA-3 | −6,0 · −6,5 · −5,5 | **acertou**, as três |

**5 em 12.** As previsões de derrota acertaram todas; as de vitória falharam todas. A regra de paragem
(12/12 vitórias = instrumento partido) não disparou.

## Porque perde — as causas que os dados deixam ver

Quatro, e não se consegue dizer nesta corrida quanto pesa cada uma. Separá-las é a próxima medição,
não esta.

1. **A rota.** 10 dos 12 foram para local, incluindo uma cláusula LGPD, um plano de lançamento
   trimestral, uma reconciliação bancária e uma pergunta de segurança. O regex vê o comprimento e as
   palavras; não vê que «redige uma cláusula» é trabalho de Sonnet. O ensaio a $0 já o mostrava antes
   de gastar um token.

2. **O modelo local é de código.** `qwen2.5-coder:14b` é o que a máquina recomenda — por medição do
   MooterBench em **tarefas de código**. Nesta matriz há um prompt de código (DEV-2: 4,0 contra 8,0 do
   Haiku, e nem aí ganhou). Os outros nove T0 são jurídico, marketing, dados e operação.

3. **O produto manda o modelo local ser curto.** `providers/ollama-api.js:36-41` fixa um system
   prompt: *«assistente de software engineering conciso … nunca mais de 3 frases para perguntas
   simples»*. Medido: para o email de 120 palavras (MKT-2) o local deu 107 tokens; para a cláusula
   LGPD, 280; para «onde coloco a minha chave da api», **23**. O Haiku deu 364, 1 923 e 662. Parte da
   derrota é uma instrução do Mooter, não uma limitação do modelo — e é a parte mais barata de
   corrigir. (D10, ver `09-DEFEITOS-APANHADOS.md`.)

4. **O arbiter estava desligado.** A peça feita para os prompts ambíguos é no-op sem
   `ANTHROPIC_API_KEY`, e esta máquina não a tem. 7 dos 12 prompts caíam no gatilho dele. Numa máquina
   com chave, a rota de mais de metade da matriz podia ser outra. Isto não é desculpa — é o que o
   produto faz na máquina do próprio dono — mas é o que separa «o regex falha» de «o Mooter falha».

## O que os juízes revelam sobre si próprios

| | A (Opus) | B (Mooter) | C (Haiku) | D (Codex) |
|---|---|---|---|---|
| J1 (Codex) | 84 | 60 | 74 | **118** |
| J2 (Sonnet) | **117** | 53 | 87 | 100 |

Os dois juízes concordam na ordem **B < C < A**. Discordam no D: **cada um dá o primeiro lugar à sua
própria família.** O viés está nos dados, não na teoria. Não muda o veredicto sobre o Mooter — que é
último para ambos, a 14 e 34 pontos do Haiku — mas invalida qualquer conclusão sobre «Codex vs Opus»
a partir destes dois juízes. É para isso que existe o J3.

## O que esta corrida prova

1. Que **nesta máquina, com estes 12 prompts, a rota do Mooter produz menos qualidade do que o Haiku
   4.5 e custa mais** em preço de lista imputado. Medido com juízes cegos de duas famílias, ruído
   calibrado, pré-registo anterior à corrida.
2. Que **o classificador não usa o degrau do meio**: 0 em 12 para T1/T2, num conjunto desenhado para
   ter dois T2.
3. Que **uma pergunta de segurança curta vai para local** (OPS-3, P5) e volta sem o aviso que importa.
4. Que **`qwen3:30b` é pior que `qwen2.5-coder:14b` nesta máquina** (33,5 contra 36,5 nos mesmos 10
   prompts, com 2 respostas truncadas por despejar raciocínio até ao tecto). A ordem do probe está
   certa; o MP estava desactualizado.
5. Que o instrumento de ontem tinha um defeito que **fazia o local parecer incapaz por construção**
   (num_predict 256, D1) — e que **sem isso** o local continua a perder.

## O que esta corrida NÃO prova

Está em `10-NAO-PROVADO.md`, escrito antes de ver os resultados. O que a corrida acrescentou:

- **Não prova que o Mooter perde com prompts de terceiros.** Os 12 foram escritos por quem copiou as
  previsões. Que 5 das 6 previsões de vitória tenham falhado sugere que não foram escritos para dar
  razão à tese — mas sugere, não prova.
- **Não prova quanto da derrota é rota, modelo, system prompt ou arbiter.** Há quatro causas e um
  número. Separá-las exige corridas que mudem uma de cada vez.
- **Não prova nada sobre Codex vs Opus.** Ver o viés de família acima.
- **Não prova que a alternativa «tudo para Haiku» aguenta os prompts de risco.** O Haiku ficou abaixo
  do Opus nos 4 de risco (33 contra 39,5). A matriz mostra que o Mooter é pior que essa alternativa;
  não mostra que essa alternativa é boa.
- **Não prova poupança.** Ninguém pagou por token. Todos os dólares são de lista, imputados.

## O que separaria as causas (a próxima medição, se houver)

Uma variável de cada vez, mesmo protocolo, mesmos 12 prompts, mesmos juízes:

| corrida | muda só | pergunta que responde |
|---|---|---|
| M12-b | system prompt do local → neutro | quanto da derrota é a instrução «3 frases»? |
| M12-c | `ANTHROPIC_API_KEY` presente → arbiter activo | quantos dos 7 ambíguos sobem de degrau, e para onde? |
| M12-d | T0 → `gemma4:e4b` ou outro modelo generalista instalado | quanto é «modelo de código em tarefa que não é código»? |
| M12-e | 12 prompts escritos por terceiro, previsões só depois | o resultado sobrevive a prompts que não são meus? |

Nenhuma destas está feita. Nenhuma foi corrida «só para ver».

## Ficheiros

`00-preflight.json` · `09-DEFEITOS-APANHADOS.md` (D1–D10) · `10-NAO-PROVADO.md` ·
`11-REPRODUZIR.md` · `protocol.json` · `prompts.json` · `ensaio-rotas.json` · `results/` ·
`juizes/` · `TABELAS.md` · `PACOTE-CEGO.md` + `CHAVE-SELADA.json` · `smoke/` · `lib/` (14 testes).
