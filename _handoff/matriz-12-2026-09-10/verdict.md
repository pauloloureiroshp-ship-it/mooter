# MATRIZ 12 · veredicto (v3: v2 depois do adversário + o M12-b corrido)

**Corrida:** 2026-09-10 · worktree `claude/matriz-12-mooter-comparison-3c2b8e` · HEAD `f66813e9` +
14 linhas em `tools/router/router-execute.js` (D1; diff em `preflight/D1.diff`, sha do executor
modificado `7be3e990…` — o mesmo fix entrou em main como **#498** durante o julgamento; a pasta
foi rebaseada para cima dele e o hunk local descartado, equivalência provada em `11-REPRODUZIR.md`) · `classify.js` `427d8c0b…` e `patterns.js` `daf82708…` intactos,
verificados antes da primeira chamada · **pré-registo declarado no pacote, não ancorado**:
`protocol.json` foi escrito antes da corrida, mas não foi commitado antes dela — a anterioridade
assenta na ordem do transcript e no mtime, não num commit (ontem, a partir do P3, os protocolos eram
commitados primeiro; aqui não foi feito, e é uma falha de processo do autor) · `prompts.json` sha
`f51e1993…` (também a semente do sorteio) · **uma corrida**, 58 respostas (4 braços × 12 + B2 × 10),
0 falhas de execução, 2 truncagens (B2), 2 falhas de transporte no julgamento corrigidas e
re-julgadas (D11) · juízes J1 (Codex) e J2 (Sonnet 5), 24/24 pontuações, ordem sorteada · J3
(humano) por preencher — `PACOTE-CEGO.md` sha `71da6910…`; **a chave está em claro neste pacote**
(`CHAVE-SELADA.json` e `juizes/*.json`), e este verdict já imprime o OPS-3 com o braço nomeado: o
J3 cego **já não é possível para o autor** (o Paulo) depois de ler isto — fica como opção para um
terceiro que receba só o `PACOTE-CEGO.md` · adversário: Codex,
17 ataques, resposta íntegra em `adversary-codex-round1.md`, o que foi aceite em `adversary.md` ·
v1 deste ficheiro em `verdict.v1.md`.

## Veredicto em uma linha

**Nestes 12 prompts, nesta máquina, a rota do Mooter recebeu 56,5 pontos em 128 dos dois juízes;
o Opus 5 — a escolha real do utilizador — recebeu 100,5; o Haiku 4.5 recebeu 80,5 com um custo de
lista imputado (cache incluído) inferior ao do Mooter ($0,1527 contra $0,1620).** O Mooter perdeu
para o comparador primário por 44 pontos e para o comparador secundário por 24, e o secundário
custou-lhe menos. A tese «poupa sem perder qualidade» não sobrevive a esta corrida.

Isto é descritivo. Não é uma recomendação de mandar tudo para o Haiku: o Haiku ficou abaixo do Opus
nos 4 prompts de risco (33,0 contra 39,5) e esta corrida não mediu se essa alternativa é boa — mediu
que a rota do Mooter é pior do que ela.

## Os números

| braço | n | pontos | máximo | custo imputado incl. cache $ | tempo s |
|---|---|---|---|---|---|
| D · Codex (agente com harness) | 12 | 109,0 | 128 | n/d | 290 |
| A · Opus 5 — **comparador primário** | 12 | 100,5 | 128 | 1,2045 | 595 |
| C · Haiku 4.5 — comparador secundário | 12 | 80,5 | 128 | 0,1527 | 149 |
| **B · Mooter** | 12 | **56,5** | 128 | 0,1620 | 138 |
| B2 · Mooter, T0 em `qwen3:30b` | 10 | 33,5 | 104 | $0 de fornecedor | 123 |

Pontos = média de J1 e J2 · máximo 10 por prompt, 12 nos 4 de risco · custo = preço de lista da
página oficial lida a 2026-09-10, cache write/read incluídos, **imputado**: os dois motores de nuvem
correm por subscrição e nenhum token foi cobrado à parte — a subscrição, a GPU e a energia existem e
não estão aqui · `n/d` no D: não há preço de lista publicado para o id de modelo que ele usa ·
tempo = relógio de parede com cold-start do CLI · a coluna «pontos por $» existe em `TABELAS.md`
como razão técnica entre uma soma ordinal e um preço imputado, e não deve ser lida como retorno
económico.

**Sobre a cache:** retirar a cache **aumenta** a distância contra o Mooter — só na resposta, B custa
$0,1140 e C $0,0521. As duas chamadas Opus do B são escolhas do router e pertencem-lhe.

**Sobre o ruído:** nos dois prompts que caíram em T3, A e B correram o mesmo Opus 5 com a mesma linha
de comando. Entre eles os juízes deram diferenças de 0, 1, 1 e 2 pontos. **Isto não é uma calibração
do ruído** — são 2 prompts, 4 pares, e mistura variação do modelo com variação do juiz. É a única
referência disponível nesta corrida. O que se pode dizer: os dois juízes, de famílias diferentes,
puseram C acima de B (J1 por 14, J2 por 34) e A acima de B (J1 por 24, J2 por 64).

### Por degrau

| degrau | n | máx | A | **B** | C | D | imputado B | imputado C |
|---|---|---|---|---|---|---|---|---|
| T0 → local `qwen2.5-coder:14b` | 10 | 104 | 81,5 | **36,5** | 65,5 | 92,5 | $0 | $0,1273 |
| T3 → Opus 5 | 2 | 24 | 19,0 | **20,0** | 15,0 | 16,5 | $0,1620 | $0,0254 |

Nos 10 prompts em que o Mooter escolheu local, recebeu 36,5 pontos contra 65,5 do Haiku e 81,5 do
Opus. Nos 2 em que escolheu Opus, 20,0 contra 19,0 do Opus — o mesmo motor. **Nenhum destes 12
prompts foi encaminhado para T1 ou T2**, num conjunto desenhado para ter dois T2.

### Nos 4 prompts de risco (RISCO a dobrar, máximo 48)

A 39,5 · D 36,0 · C 33,0 · **B 29,0**. O pior caso é o **OPS-3** — «Onde é que eu guardo a chave da
API no meu projecto Next.js para não ficar exposta no browser?». O classificador leu
`ambiguous_short`, risco `minimal`, e mandou-o para local. A resposta local, **integral**:

> Guarde a chave da API em um ficheiro `.env.local` na raiz do seu projeto Next.js. Acesse-a usando
> `process.env.YOUR_API_KEY`. Certifique-se de adicionar `.env.local` ao `.gitignore` para evitar
> commits acidentais.

Três frases. Não diz que a chave só pode ser lida em código de servidor, e não menciona o prefixo
`NEXT_PUBLIC_` — que é o que, num projecto Next.js, faz uma variável de ambiente ir parar ao browser.
A pergunta era exactamente sobre isso. J1 deu 6 em 12; J2 deu 4, e 12 ao Haiku. (Este é o único
prompt em que se afirma uma omissão técnica concreta; o P5, «onde coloco a minha chave da api», não
nomeia Next.js e recebe só a nota dos juízes.)

## As previsões, contra o que aconteceu

Critério registado: «ganha em custo com qualidade equivalente» = custo menor **e** B − A ≥ −1.

| o MP previu | prompts | B − A | pelo critério registado |
|---|---|---|---|
| ganha | DATA-1 · LEGAL-1 · MKT-2 · LEGAL-3 · DEV-2 | −4,0 · −4,5 · −3,0 · −5,5 · −3,5 | **falhou** |
| ganha | MKT-3 | −1,0, custo menor | **acertou** — e está dentro da referência de ruído (2) |
| empata (mesmo modelo) | DATA-4 · OPS-4 | +1,0 · 0,0 | **acertou** |
| empata (mesmo modelo) | P5 | −5,5 | **falhou** — foi a local, não a Opus |
| perde | OPS-3 · MKT-4 · DATA-3 | −6,0 · −6,5 · −5,5 | **acertou**, as três |

**6 em 12.** A v1 deste ficheiro contava 5, por retirar o MKT-3 com o argumento de que −1 «não é
vitória» por estar dentro do ruído. O adversário apontou (M12-04) que isso é mudar o critério depois
de ver o resultado. Tem razão: o critério registado é ≤ 1, o MKT-3 cumpre-o, conta. Que esteja dentro
da única referência de ruído disponível fica escrito ao lado, não substitui a regra. A regra de
paragem (12/12 vitórias = instrumento partido) não disparou.

## Porque perde — cinco hipóteses, nenhuma isolada

Esta corrida observou **uma configuração**. Não separou efeitos. O que se segue são hipóteses
compatíveis com os dados, não causas demonstradas; qualquer uma pode ter efeito nulo, e podem
interagir.

1. **A rota.** 10 dos 12 foram para local, incluindo uma cláusula LGPD, um plano trimestral, uma
   reconciliação bancária e uma pergunta de segurança. O ensaio a $0 mostrava-o antes da corrida. O que
   não se sabe: quanto ganhariam esses prompts em Sonnet — nenhum correu lá.

2. **O modelo local é de código.** `qwen2.5-coder:14b` é o que a máquina recomenda, por medição do
   MooterBench em tarefas de código. Nesta matriz há um prompt de código (DEV-2: B 5,0 contra 8,0 do
   Haiku). Os outros nove T0 não são código. É uma hipótese; não há aqui um modelo generalista no
   mesmo lugar para a testar — o B2 não serve para isso, porque muda raciocínio e truncagem ao mesmo
   tempo.

3. **O produto manda o modelo local ser curto.** `providers/ollama-api.js:36-41` fixa um system prompt
   em toda a chamada local: *«assistente de software engineering conciso … nunca mais de 3 frases para
   perguntas simples»*. Medido: para o email de 120 palavras (MKT-2) o local devolveu **55 palavras**;
   para a cláusula LGPD, 280 tokens; para «onde coloco a minha chave da api», 23. Instrução e brevidade
   coexistem nos dados; não foi corrido o mesmo modelo sem a instrução. (D10.)

4. **O arbiter não correu.** É no-op sem `ANTHROPIC_API_KEY`, e esta máquina não a tem. 7 dos 12
   prompts caíam no gatilho. **Correcção à v1:** o braço B desta corrida chama `classify.js`
   directamente, não o hook `inject_context.js` onde o arbiter vive — por isso pôr a chave e repetir
   **não** activaria o arbiter neste instrumento; uma corrida que o queira medir tem de passar pelo
   hook, com registo da invocação (M12-10).

5. **O desenho da experiência.** Os 12 prompts foram escritos pelo autor, que também copiou as
   previsões. Dois prompts de risco são a mesma pergunta em duas redacções. O braço D leva um harness
   que os outros não levam. Os juízes lêem texto, não verificam factos. Nada disto prova que a derrota
   é artefacto; impede fechar a lista nas quatro hipóteses sobre o produto. A v1 omitia esta.

## M12-b — corrido: a linha das 3 frases não era a causa

Depois do adversário, a hipótese mais barata de testar foi testada. Uma variável: a linha 3 do
system prompt local («nunca mais de 3 frases») passou a pedir tamanho proporcional ao pedido.
Tudo o resto igual — mesmos 10 prompts T0, mesmo modelo, mesmo tecto, mesmos juízes, mesma ordem
sorteada, e as respostas de A, C e D **byte a byte as originais**. Pré-registo em `m12b/protocol.json`
(escrito antes de correr, com duas previsões de sinal contrário); tabela gerada em
`m12b/COMPARACAO.md`.

| | B com «3 frases» | **B sem a linha** | Δ | C | A |
|---|---|---|---|---|---|
| 10 prompts T0, máx 104 | 36,5 | **38,0** | **+1,5** | 65,5 → 67,5 | 81,5 → 82,0 |

**+1,5 pontos.** As respostas ficaram 2 a 6× mais longas (LEGAL-3 280 → 637 tokens, DATA-3 84 → 508,
MKT-4 251 → 465) e os juízes deram quase os mesmos pontos. A distância ao Haiku ficou em 29,5.

O que apareceu com o espaço a mais:

- **OPS-3 caiu de 5,0 para 0,0.** Com 3 frases, a resposta omitia o `NEXT_PUBLIC_`. Com espaço,
  passou a **recomendá-lo**: «adicione a chave ao `.env.local` com o formato
  `NEXT_PUBLIC_API_KEY=…` … disponíveis para o código do lado do cliente». É a instrução exacta para
  expor a chave no browser — o contrário do pedido. Os dois juízes: RISCO 0. Nesta amostra — uma
  geração de um prompt — **a linha das 3 frases estava a funcionar como um tecto acidental que
  limitava o dano**; é compatível com os dados, não demonstrado.
- **DATA-1 entrou em loop** (`SE.ERRO.SE(FILTRAR(cliente, SE(…` repetido até aos 2048 tokens):
  4,0 → 1,0. O tecto de frases escondia a degeneração.
- **P5 subiu de 4,0 para 8,0** e **MKT-4 de 1,0 para 5,0** — os dois casos em que a brevidade era
  mesmo o problema.

**Ruído do juiz, medido desta vez:** A, C e D foram pontuados duas vezes com o mesmo texto,
mudando só o vizinho B. Na escala que interessa — o **agregado dos 10 prompts** — os braços que não
mudaram deslocaram-se **A +0,5 · C +2,0 · D +1,0 · B2 −1,5** (o B2 também foi re-pontuado; 33,5 → 32,0).
O +1,5 do B é do mesmo tamanho que a deriva de quem não mudou nada. Por (resposta, juiz): máximo 2,
média 0,42 em 60 pares (80 com o B2). Isto é ruído **do juiz** — texto idêntico, nota diferente —
não o ruído de geração+juiz que o adversário pediu (M12-03); é a parte que se consegue medir sem
gerar outra vez.

**O que isto faz às cinco hipóteses:** a nº 3 (system prompt) fica **refutada como causa
dominante** — o seu efeito não se distingue de ruído nesta amostra (uma geração por prompt, sem
repetições). A nº 2 (modelo de código em tarefa que não é código) fica mais
pesada: mais tokens do mesmo modelo não deram mais correcção, e em segurança deram menos. As nº 1
(rota) e nº 4 (arbiter) continuam por testar. A nº 5 (desenho) não muda.

**O que isto faz à correcção D10:** a linha é errada em qualquer caso — um pedido de documento não
cabe em 3 frases — e vai no PR como commit separado. Mas **não é uma melhoria sozinha**: sem um
piso que impeça este modelo de receber perguntas de segurança, tirar-lhe o tecto de frases dá +1,5
(ruído) num sítio e um 0 em RISCO noutro. A correcção que a matriz pede é a **rota**, não o prompt.
Por isso **não vai neste PR**: «não mergear isolado» não se garante dentro de um PR que o mergeia.
O diff fica em `m12b/D10.diff`; a correcção vai num PR rascunho separado, à espera do piso.

## O que os juízes revelam sobre si próprios

| | A (Opus) | B (Mooter) | C (Haiku) | D (Codex) |
|---|---|---|---|---|
| J1 (Codex) | 84 | 60 | 74 | **118** |
| J2 (Sonnet) | **117** | 53 | 87 | 100 |

Os dois concordam na ordem B < C < A. Cada um põe em primeiro o candidato da sua própria família —
um padrão **compatível com** viés de família; os dados não mostram o mecanismo. **Correcção à v1:** o
braço B **não** é Anthropic em 10 dos 12 prompts — é Qwen. Nesses dez, C é Anthropic. Um viés do J2 a
favor da família pode, portanto, pesar directamente contra B e a favor de C; a v1 dizia o contrário.
O que resta: o J1, que não é Anthropic, também põe C 14 pontos acima de B. Qualquer conclusão sobre
Codex vs Opus a partir destes dois juízes é inválida; é para isso que existe o J3.

## O que esta corrida prova

1. **Que nesta execução, com estes 12 prompts, nesta máquina, com o patch D1 e o arbiter inactivo,
   a rota do Mooter recebeu 56,5 pontos dos juízes contra 100,5 do Opus 5 e 80,5 do Haiku 4.5, e
   teve custo de lista imputado (cache incluído) de $0,1620 contra $0,1527 do Haiku.** Não foi
   estimada incerteza.
2. **Que nenhum destes 12 prompts foi encaminhado para T1 ou T2.**
3. **Que OPS-3 e P5 foram encaminhados para T0**, e que a resposta local ao OPS-3, transcrita acima,
   não trata o mecanismo pelo qual a chave chega ao browser.
4. **Que, com esta configuração e este tecto (2048), o B2 (`qwen3:30b`) recebeu 33,5 contra 36,5 do
   B (`qwen2.5-coder:14b`) nos mesmos 10 prompts, com 2 respostas truncadas** por despejar raciocínio
   até ao tecto. Sem essas duas, 31,5 contra 31,0 — a ordem inverte. Isto não estabelece qual dos dois
   modelos é melhor, e não valida o probe. A v1 dizia que sim; estava errada.
5. **Que o instrumento de ontem cortava toda a resposta local aos 256 tokens** (D1), e que **com o
   tecto corrigido** o local continuou abaixo de A e de C. Não se mediu o efeito do D1 na matriz em
   si.
6. **Que a instrução «nunca mais de 3 frases» não explica a derrota** (M12-b: +1,5 em 104, do
   tamanho da deriva dos braços que não mudaram: A +0,5, C +2,0, D +1,0) — e que, sem ela, o mesmo modelo recomendou expor a chave no
   browser no OPS-3 (0 em 12).

## O que esta corrida NÃO prova

`10-NAO-PROVADO.md`, escrito antes de ver os resultados, mais o que a corrida e o adversário
acrescentaram:

- **Não prova que o Mooter perde com prompts de terceiros.** A v1 argumentava que, se os prompts
  tivessem sido feitos para dar razão à tese, as previsões de vitória não teriam falhado. O
  adversário derrubou isso (M12-07): previsões falham por muitas razões, e uma amostra pode estar
  enviesada sem intenção. O argumento saiu. Fica só o facto: os prompts são do autor.
- **Não prova quanto pesa cada hipótese.** Cinco hipóteses, um número.
- **Não prova nada sobre Codex vs Opus.**
- **Não prova que «tudo para Haiku» é uma boa política.** Prova que a rota do Mooter é pior do que
  isso nestes 12.
- **Não prova que o 14b é melhor que o 30b** — só que esta configuração do 14b ficou à frente desta
  configuração do 30b, e que a ordem depende de duas respostas truncadas.
- **Não prova poupança.** Nenhum token foi cobrado à parte. Todos os dólares são de lista, imputados.
- **Não prova o pré-registo por commit.** O `protocol.json` existia antes da corrida, mas não há
  âncora externa que o demonstre.

## O que separaria as hipóteses (a próxima medição, se houver)

Uma variável de cada vez, mesmo protocolo, mesmos 12 prompts, mesmos juízes, protocolo **commitado
antes**:

| corrida | muda só | pergunta que responde |
|---|---|---|
| ~~M12-b~~ | **feita** — ver secção acima | +1,5 (ruído); a linha não era a causa |
| M12-c | braço B passa pelo `inject_context.js` com `ANTHROPIC_API_KEY` presente, com registo da invocação do arbiter | quantos dos 7 ambíguos sobem de degrau, e para onde? |
| M12-d | T0 → modelo generalista instalado, mesmo tecto, raciocínio desligado de facto | quanto é «modelo de código em tarefa que não é código»? |
| M12-e | 12 prompts escritos por terceiro, previsões só depois, sem o autor ver as rotas antes | o resultado sobrevive a prompts que não são meus? |
| M12-f | 3 repetições de geração e de julgamento em 4 prompts | qual é o ruído, de facto? |

Da lista, só a M12-b está feita. Nenhuma foi corrida «só para ver».

## Ficheiros

`00-preflight.json` · `preflight/D1.diff` · `09-DEFEITOS-APANHADOS.md` (D1–D11) ·
`10-NAO-PROVADO.md` · `11-REPRODUZIR.md` · `protocol.json` · `prompts.json` · `ensaio-rotas.json` ·
`results/` · `juizes/` · `TABELAS.md` · `PACOTE-CEGO.md` + `CHAVE-SELADA.json` ·
`adversary-prompt-sent.txt` · `adversary-codex-round1.md` · `adversary.md` · `verdict.v1.md` ·
`m12b/` (protocol · results · juizes · COMPARACAO.md) · `smoke/` · `lib/` (15 testes).
