# ⇄ CC → COWORK · slack-spike (MODO CONSTRUÇÃO) · 2026-08-17

**TL;DR:** o MODO CONSTRUÇÃO está **feito e ligado** (88/88, vermelho→verde provado por
mutação). O MODO VIVO continua **trancado**, e descobri que a premissa do destrave é mais
fraca do que o masterprompt assume: a `kimi-egress` fechou **por congelamento com 4 ALTO em
aberto**, sem nada em `main`. Falta-me **uma resposta do Paulo** (caminho do ficheiro de
tokens) e **uma decisão tua/dele** (o que conta como destrave).

- **GOAL:** provar, numa demo de bolso, que um estranho vê custódia real — aprovar/recusar
  trabalho de agente pelo Slack com recibo auditável.
- **INTENT (masterprompt):** `_handoff/MASTERPROMPT_SLACK_SPIKE_2026-08-17.md` v1.1 ·
  4400 bytes · sha256 `7a608ed297070ea6fc609d4dea5066d58c9b72600e153b05691089f82fed2447` ✅
  verificado antes de executar. *(Vive **untracked** em `~/frugal/_handoff/` — não está em
  git, em nenhum branch.)*

## 🎯 A ÚNICA COISA

**Decidir se «kimi-egress FECHADA por congelamento, com 1 ALTO de CÓDIGO em aberto e nada em
`main`» conta como destrave do slack-spike.** Tudo o resto está pronto a correr atrás dessa
decisão. Não a tomei por ti: é a fronteira entre duas frentes e não me pertence reinterpretar
a declaração da outra.

## STATE

| | |
|---|---|
| **Worktree (onde o trabalho aconteceu)** | `C:\Users\Paulo Loureiro\frugal\.claude\worktrees\slack-spike-masterprompt-82c108` |
| **Branch** | `claude/slack-spike-masterprompt-82c108` @ `fd84703c` |
| **vs `origin/main`** | 2 commits ahead · `origin/main` = `b3642a03` (ancestral, sem divergência) |
| **unpushed / uncommitted** | **2 / 0** — árvore limpa |
| **Testes** | **88/88 pass · 0 fail** (`cd packages/slack-spike && node --test`) |
| **`classify.js`** | sha256 `427d8c0b…4bc48f` — **INTACTO** |
| **Fora de `packages/slack-spike/`** | **nada tocado** — zero mudanças no núcleo, zero em `packages/*` congelados |
| **Dispatch real / tokens / workspace** | **nenhum** — não se pagou nada nesta sessão |
| **Custo medido da sessão** | `n/d` — não há fonte fiável na máquina para o custo de uma sessão de Claude Code; não invento um número |

## WORK — o que foi feito

**Antes de construir, confrontei.** Já existia uma sessão anterior com este mesmo masterprompt
executado: branch `claude/slack-spike-masterprompt-3fd4e2`, commit `de4634ad`, 15 ficheiros,
47 testes, unpushed. **Não reiniciei — iterei.** Estava cortada de `main` velha (`5f0836be`),
por isso trouxe-a por cherry-pick para `main` actual (`cb284f85`, conteúdo idêntico verificado
por diff) e continuei em cima.

### 1 · Dia 0 remedido (kimi #3), não herdado

Corri a auditoria eu mesmo contra o ledger de hoje em vez de confiar no README anterior:
**4766 eventos, 12 pendentes**. Todas as proporções aguentaram (`cost_usd` 6/12 não-nulo ·
`model_used` 6/12 · `files_touched` **0/12** não-nulo ⇒ cortado · `actor` sempre `system`).
O ledger cresceu 9 eventos entre a medição anterior e a minha, no mesmo dia.

**Uma afirmação não aguentou e corrigi-a:** o README dizia «4 valores» de `cost_usd_fonte` nos
pendentes. São **4 no ledger todo e 3 nos pendentes**; o quarto — `"calculado a partir de
tokens e tabela de precos"`, o único que faz o `leitura.js` marcar **ESTIMATIVA** — aparece 3×
no ledger e **nunca** num pendente. O ramo existe e está testado, mas **hoje nenhum cartão
real o exercita**. Dizer «4» a falar de pendentes era passar por medido o que não estava.

### 2 · O que faltava: as portas estavam injectadas e ninguém as injectava

O README anterior listava como falta nº3 «ligar `despachar` ao `toolWork` e `enviar` ao
`chat.postMessage`». Sem isso o spike eram 47 testes verdes e **nenhuma demo possível**.

| Ficheiro novo | O que é |
|---|---|
| `packages/slack-spike/transporte.js` | o **único** ficheiro que fala com o Slack · Socket Mode à mão, **zero deps** (o Node 24 traz `fetch` e `WebSocket`) · contrato verificado nos docs do Slack, não de memória |
| `packages/slack-spike/despacho.js` | a porta do `toolWork` com **allowlist de saída** |
| `packages/slack-spike/correr.js` | a raiz de composição · `--seco` = ensaio offline |
| `+ transporte.test.js`, `despacho.test.js` | 41 testes novos |

**Duas guardas no transporte que custam dinheiro se faltarem:**

1. **ACK antes de tratar.** O Slack re-entrega o que não foi confirmado, e uma re-entrega de
   `app_mention` é um **segundo job, pago**. Preço aceite e escrito: se o processo morrer entre
   o ack e o tratamento, aquele evento perde-se — perder um pedido é recuperável (a pessoa
   repete), pagar dois não.
2. **Dedupe por `event_id`**, para as re-entregas que o ack não cobre.

**A allowlist de saída é a simétrica da de publicação:** só `goal`/`agent`/`wave`/`actor`
entram no motor. Se alguém juntar `thread_context` ao objecto da menção (a tentação óbvia:
«dá mais contexto ao modelo»), morre na porta em vez de chegar a um prompt — a regra do
masterprompt passa a barreira, não comentário. E o erro do `toolWork` sai em **`porque_local`**,
nome que **não** está em `CAMPOS_PERMITIDOS`: as mensagens de erro do motor citam o goal, logo
se alguém as tentar publicar a porta recusa **por construção**, não por lembrança.

### 3 · Dois bugs reais, encontrados a ligar as peças

1. **`cartaoDe` não punha o `state_hash` no cartão.** Como é o cartão que o botão carrega de
   volta, o botão nascia **sem CAS** — ou seja, não nascia, e a cena do STALE que o kimi #4
   manda gravar era impossível de mostrar. Havia teste do cartão e teste do clique, **nunca do
   cartão a alimentar o clique**. Agora há round-trip com broker real.
2. **O gate exigia a linha byte-a-byte.** Num `SYNC.md` a frase nasce como bullet e o travessão
   escreve-se a hífen: no dia do destrave o gate ficava trancado e a pessoa sob pressão ia
   *«arranjar» o gate em vez do texto*. Passou a tolerar o acidente de formatação (bullet,
   citação, negrito, crases, hífen, maiúsculas, espaços) e a **continuar a recusar a frase
   dentro de prosa** ou com sufixos. Testes dos dois lados. **Esta previsão concretizou-se —
   ver RISK.**

### 4 · Vermelho→verde provado, não afirmado

Mutei as 6 guardas novas e confirmei que a suite fica vermelha em cada uma (baseline verde,
árvore reposta verde):

| Mutação | Testes que caem |
|---|---|
| `cartaoDe` sem `hash_esperado` | 2 |
| gate a exigir a linha byte-a-byte | 3 |
| ACK depois de tratar | 1 |
| sem dedupe de re-entrega | 1 |
| sem allowlist de saída no despacho | 1 |
| `publicar` sem allowlist de campos | 2 |

Sem isto, «88 testes» não diz se algum guarda alguma coisa.

### 5 · Corre hoje, com o MODO VIVO trancado

```bash
cd packages/slack-spike && node correr.js --seco
```

Passa uma menção sintética pelo loop inteiro e imprime o que **sairia**. Não abre socket, não
despacha (**em `--seco` o `toolWork` não entra nem atrás do gate** — um `--seco` com o motor
real despacharia a sério com mensagens falsas, o pior dos dois mundos, do género que se
descobre pela factura), não paga.

O gate separa **rede** de **local**: o socket fica sempre do lado do MODO VIVO; o dry-run corre
hoje porque nada sai da máquina. *(Isto apanhou um bug meu a meio: o dry-run estava em duas
camadas em série e a de dentro curto-circuitava, imprimindo «0 mensagens» com o loop todo a
funcionar.)*

### Commits

```
fd84703c  slack-spike: o transporte real, a raiz de composicao, e o buraco do CAS
cb284f85  slack-spike: MODO CONSTRUCAO — o adapter, o Dia 0 medido, e a objeccao ao gate
          (cherry-pick de de4634ad, cortado de main velha)
```

## DECISIONS

**Nenhuma.** Mecanicamente verificado: `node tools/handoff-preflight.js --qa --sid
62a34f94-…` ⇒ **0 perguntas · 0 rondas**. Não usei `AskUserQuestion` nesta sessão. As decisões
de engenharia acima foram **minhas**, com a razão escrita no código, e não escolhas do Paulo —
registo-as como tal em vez de as vestir de decisão dele.

## 🚨 RISK — a premissa do destrave é mais fraca do que o masterprompt assume

O masterprompt diz: MODO VIVO quando o `SYNC.md` disser `kimi-egress FECHADA — slack-spike
destravado`. Fui ver a frente. **Ela já escreveu a frase — e ainda assim o destrave não é
válido, por duas razões independentes.**

**(a) Mecânica.** Está escrita como *heading com data* no branch dela:

```
## [2026-08-17] kimi-egress FECHADA — slack-spike destravado
```

O meu gate **recusa** (não é a linha inteira). Confirmei a correr o gate contra esse ficheiro:
`vivo: false`. **É exactamente o footgun que documentei no `gate.js` horas antes de o
encontrar.** E está no branch `kimi-egress/fail-closed` — **13 commits unpushed**; o `SYNC.md`
de `main` não tem uma única menção a `kimi-egress`.

**(b) Substantiva, e mais séria.** O que essa entrada declara:

> «**Fechada por CONGELAMENTO, não por merge. Nada entrou em `main`.**» · `G4-egress-9b`
> devolveu **NO-SHIP com 4 ALTO** (1 CÓDIGO + 3 PROVA) · o bloqueador de CÓDIGO em aberto é
> *«a recusa por `agent:"kimi"` deixa um plano no disco que o recibo não declara»* · e
> «**⏭ Slack-spike destravado**» aparece a significar «a `kimi-egress` deixa de ocupar a
> fila» — **desbloqueio de agenda, não autorização de segurança.**

Ou seja: a frente que devia fechar antes de o slack-spike ir vivo fechou **com um ALTO de
honestidade de recibo em aberto** — e o slack-spike existe precisamente para mostrar recibos
a um estranho. **Não toquei no gate para o fazer passar**, e não editei o `SYNC.md` da outra
frente. É a tua/do Paulo a decisão.

**Recomendação (não executada):** quem detém a decisão escreve, no `SYNC.md` de **`main`**, a
linha canónica sozinha numa linha —

```
kimi-egress FECHADA — slack-spike destravado
```

— em vez de eu alargar o gate para aceitar headings. Um `if` alargado para caber no que outra
frente escreveu é o gate a ceder; uma linha escrita de propósito é a decisão a ser tomada. O
`README.md` do pacote tem a forma canónica para copiar. **Mas isso só depois de (b) estar
resolvido** — e vale a pena decidir explicitamente se um ALTO de recibo em aberto permite uma
demo cujo argumento é o recibo.

## PENDING — o que está à espera de resposta

1. **[Paulo · bloqueante para o `.env`]** *Qual é o caminho do ficheiro onde capturaste os
   tokens do Slack?* Pediste-me para perguntar quando chegasse a este passo. Já verifiquei o
   destino **antes** de pedir (kimi #7): `packages/slack-spike/.env` está coberto por `*.env`
   (`.gitignore:13`) ✅ — mas um nome como `tokens.txt` **não** estaria, por isso o destino
   será `.env` seja qual for o nome de origem, movido sem nunca abrir nem ecoar o conteúdo. O
   `correr.js` espera 5 variáveis (`SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_CANAL`,
   `SLACK_BOT_USER_ID`, `SLACK_ALLOW_USER_ID`) e diz quais **faltam**, nunca o que tem.
2. **[Cowork/Paulo · bloqueante para o MODO VIVO]** a decisão do RISK acima.
3. **[Paulo · condição de sócio nº1 do masterprompt, bloqueante para o merge]** a demo nasce
   **agendada**: data marcada com ≥1 estranho **antes** do merge do spike. Sem data, o spike
   não fecha — fecha-se a agenda primeiro. **Não agendada.**

## NEXT — por ordem, e o que cada passo destranca

1. Paulo responde o caminho do ficheiro de tokens → movo para `packages/slack-spike/.env`,
   confirmo com `git check-ignore` e digo quais das 5 variáveis faltam (sem valores).
2. Decisão do RISK → se for GO, a linha canónica entra no `SYNC.md` de `main`.
3. Aí, e só aí, MODO VIVO: 1º dispatch real, 1º pendente real, **teste 2-devices** (aprovar do
   telemóvel com a frota no desktop — a cena da demo).
4. Gravar o **ensaio do infeliz contra o Slack real**: recusa · clique atrasado (STALE com o
   hash à vista) · daemon offline. Estão provados contra o broker real em dry-run; contra o
   Slack, `n/d`.
5. `final-reviewer` **antes** de qualquer push/merge — agendado, não corrido (não há push).
6. No fecho: registo no `SYNC.md` + `MASTERPROMPTS_INDEX` com custo medido, e arquivar o
   masterprompt para `_handoff/_archive/2026-08/` **no mesmo PR** que o faz shipar.

## O que NÃO está provado (e só o dia vivo prova)

O transporte está testado contra **duplos**, não contra o Slack. Ficam de fora por construção:
tokens/scopes reais · o formato exacto de um `app_mention` de um workspace verdadeiro · a
reconexão do socket de horas em horas · o render dos blocos no telemóvel. Nada disto se afirma
antes de correr.

## Higiene pendente (baixo risco, não feita)

- `claude/slack-spike-masterprompt-3fd4e2` @ `de4634ad` ficou **superseded** (não é ancestral
  de `main`; conteúdo vive em `cb284f85`). Worktree `.claude/worktrees/kind-lewin-5e4dcd`.
  Candidato a remoção — **é git write, logo é do Paulo**.
- O masterprompt está untracked em `~/frugal/_handoff/`. Se quiseres rasto, tem de ser
  commitado por alguém.

## Pre-Dispatch Red-Team Gate

**Council: auto-corrido por mim (1 agente), não painel multi-agente verificado ⇒ `n/d`, não
`8/8`.** As 8 perguntas, respondidas com evidência:

1. **fonte de verdade** — o ledger (`~/.mooter/ledger.jsonl`) para os campos do cartão; o
   `SYNC.md` para o gate. Nenhum campo do cartão é inventado: o que não se deriva é `n/d`.
2. **escritor único** — o spike **nunca** escreve no ledger; quem escreve é o `broker`. O
   spike só lê. Uma única porta de saída (`publicar()`), um único ficheiro que fala com o Slack.
3. **reversível vs irreversível** — tudo reversível hoje: 2 commits locais, 0 pushed, pacote
   novo isolado. O irreversível (dispatch pago, mensagem publicada) está atrás do gate.
4. **script-first** — o Dia 0 e a prova vermelho→verde são **scripts** que corri, não
   afirmações; o ensaio seco é um comando.
5. **projeção vs 2ª verdade** — o cartão é **projecção derivada** do ledger, não uma segunda
   verdade: não herda rótulos do evento e não guarda estado próprio (o `threads` Map é cache
   de sessão, não fonte).
6. **degradação graciosa** — fail-closed em todos os ramos: `SYNC.md` ausente/ilegível ⇒
   trancado; botão sem hash ⇒ ignorado; campo do ledger em falta ⇒ `n/d`; `toolWork` a
   rebentar ⇒ handler sobrevive; erro do Slack ⇒ registado, sem matar o processo.
7. **frozen/allowlist/n-d** — `classify.js` sha ✓; `packages/*` congelados **não tocados**;
   duas allowlists explícitas; `n/d` usado onde não medi (custo da sessão, provas contra o
   Slack real).
8. **custo de reverter** — `git branch -D` + apagar `packages/slack-spike/`. Zero blast radius
   fora do pacote.

**Objecções reais produzidas (o gate que só aprova não correu):** (i) o `publicar()` do kimi #6
lido à letra é **fail-open** — 118 `local_only` contra 4648 sem campo, 313 deles com `goal`
(objecção herdada da sessão anterior, **remedida** por mim hoje); (ii) o gate byte-a-byte era um
footgun com data marcada — **concretizou-se**; (iii) a afirmação «4 valores» era mais forte que
a medição; (iv) o `--seco` com `toolWork` real despacharia a sério; (v) o dry-run em duas
camadas mentia sobre o que sairia; (vi) **a premissa do destrave não se sustenta** (RISK).

---

`gauntlet: MODO CONSTRUÇÃO · 88/88 · mutação 6/6 vermelhas · classify.js intacto ·
council n/d (auto-corrido, 6 objecções reais) · MODO VIVO trancado por mecânica E por
substância · 0 dispatch, 0 tokens, 0 pago`
