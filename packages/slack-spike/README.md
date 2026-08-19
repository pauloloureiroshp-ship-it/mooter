# ⚠️ `@mooter/slack-spike` — THROWAWAY, com data de morte

**Isto não é produto.** É uma demo de bolso: app Slack custom, Socket Mode, **um**
workspace (o do Paulo), canal `#mooter-demo`, **um** id na allowlist.

- **Morre em:** `2026-09-16` (ver `morte.js` — o daemon lê a data e recusa arrancar
  depois dela). Passado o prazo sem piloto pago, o branch arquiva-se.
- **Nunca será:** marketplace · HTTP · multi-tenant · segundo workspace.
- **Não copiar para o produto** sem frente própria com G4. Todos os ficheiros levam
  o aviso no topo.

Origem: `_handoff/MASTERPROMPT_SLACK_SPIKE_2026-08-17.md` (v1.1, 4400 bytes,
sha256 `7a608ed2…`). G4 pré-entrega: kimi-k3 (job-msx255a9-cd52, $0,088) — 4 ALTO
+ 5 BAIXO incorporados.

## Dois modos

| Modo | Quando | O que corre |
|---|---|---|
| **CONSTRUÇÃO** | já, em paralelo com a kimi-egress | adapter + suite em dry-run. **Zero dispatch real.** |
| **VIVO** | só quando o `SYNC.md` tiver a linha `kimi-egress FECHADA — slack-spike destravado` | 1º dispatch real, 1º pendente real, teste 2-devices |

> **Estado em 2026-08-17:** a linha **está** no `SYNC.md` (decisão do Cowork,
> **GO CONDICIONADO**) e o gate destrava. O que falta para o MODO VIVO é o `.env`
> com os tokens. Ver **A condição dura do GO** abaixo — o destrave veio com uma
> obrigação, não em branco.

## A condição dura do GO CONDICIONADO — o kimi fora por construção

A frente `kimi-egress` fechou **por congelamento**, com um ALTO de CÓDIGO em aberto:
na recusa por `agent:"kimi"`, fica um plano no disco que o recibo não declara. Esse
ALTO vive **exclusivamente** no caminho kimi/Moonshot. A decisão do Cowork foi GO
**com** a condição de o spike guardar o vendor fora da rota — com prova, antes do
1º dispatch vivo. Com o vendor fora, o ALTO não é alcançável pelo caminho vivo.

`despacho.js` tem uma **allowlist de motores** (`cc`, `codex`, `gemini`, `moo`) e
uma exclusão declarada **com a razão datada**. Três decisões que importam:

- **Allowlist, não denylist.** Com denylist, um vendor novo entrava por omissão e
  ninguém dava por isso.
- **O motor tem de vir declarado.** `agent` ausente era herdar o default do
  `seamless.js` — hoje `moo`/`cc`, mas um default é um sítio onde um vendor pode
  aparecer amanhã sem passar por esta porta.
- **Morre na porta, não no núcleo.** O `agent:"kimi"` é recusado antes de o
  `toolWork` ser chamado — precisamente porque o ALTO está lá dentro.

Provado por mutação: adicionar `kimi` à allowlist, remover a barreira, ou esvaziar
a exclusão ⇒ **suite vermelha** nas três. Para o estranho, isto declara-se como
feature: *«Moonshot desligado até o veto de egress entrar em main»* — custódia por
enforcement, não por promessa. O kimi volta quando a `kimi-egress` mergear em
`main`, **por decisão explícita, nunca por default**.

O gate é um `if` real, não uma nota: `gate.js` lê o `SYNC.md` e `daemon.js` recusa
arrancar sem a linha exacta. Fail-closed em todos os ramos (ficheiro ausente,
ilegível, ou frase apenas parecida ⇒ trancado).

### A linha que destrava — copiar tal e qual

```
kimi-egress FECHADA — slack-spike destravado
```

Tem de ser a **linha inteira**. Tolera-se o acidente de formatação com que uma
linha nasce num markdown — bullet (`- `), citação (`> `), negrito, crases,
espaços a mais, travessão escrito a hífen, maiúsculas — porque exigi-la
byte-a-byte tinha um footgun com data marcada: no dia do destrave o gate ficava
trancado e a pessoa sob pressão ia "arranjar" o `gate.js` em vez do texto, isto
é, desligar a guarda para passar. **Não** se tolera a frase dentro de prosa
(`quando a kimi-egress FECHADA — … , então`) nem com sufixos (`(ainda não)`,
`?`): a tolerância só anda para o lado seguro. Há testes para os dois lados.

O gate separa **rede** de **local**:

| | trancado | destravado |
|---|---|---|
| `correr()` — abrir o socket, falar com o Slack | recusa **sempre** | corre |
| `enviar()` real (`chat.postMessage`) | recusa, e nem toca na rede | envia |
| `enviar()` em dry-run (nada sai da máquina) | **corre** — é o MODO CONSTRUÇÃO | corre |
| `despachar()` real (`toolWork`) | recusa, por despacho e não por processo | despacha |

O `despacho.js` reverifica por despacho: um daemon vive horas, e entre o arranque
e o despacho alguém pode reabrir a frente.

## Dia 0 — o que o ledger REALMENTE dá (kimi #3)

Auditoria de **2026-08-17** sobre o ledger real: 4766 eventos, **12 pendentes**
(`exit_code=agent-awaiting-approval`). A regra do masterprompt é campo em falta ⇒
cortar ou rotular, **nunca** tocar no núcleo para o obter.

*(Medido duas vezes no mesmo dia, com 9 eventos de diferença — o ledger cresceu
entre as duas leituras. Todas as proporções abaixo aguentaram.)*

| Campo do cartão | Presença real | Decisão |
|---|---|---|
| `cost_usd` | 12/12 presente · **6/12 não-nulo** | mostra-se **só com fonte**; sem fonte ⇒ `n/d`, nunca um número |
| `cost_usd_fonte` | 12/12 preenchido | o ledger **já se auto-rotula** — **3** valores distintos nos 12 pendentes (`"reportado pelo CLI"` 1 · `"inferência local sem custo de API"` 5 · `"n/d"` 6) |
| `model_used` | 6/12 | `n/d` quando falta. **O tier nunca vira modelo.** |
| `files_touched` | 6/12 presente · **0/12 não-nulo** | **CORTADO do cartão.** Nunca esteve preenchido num pendente. |
| `actor` | 9/12 · **sempre `system`** | o autor humano é **`n/d` hoje**. O Slack é quem passa a declará-lo (`slack:U…`). O `agent` mostra-se à parte, rotulado **motor**, nunca disfarçado de autor. |

Uma correcção ao que este README dizia antes: `cost_usd_fonte` tem **4** valores
distintos no ledger **todo**, mas só **3** nos 12 pendentes. O quarto —
`"calculado a partir de tokens e tabela de precos"`, o único que faz o
`leitura.js` marcar **ESTIMATIVA** — aparece 3× no ledger e **nunca** num
pendente. O ramo existe e está testado, mas hoje nenhum cartão real o exercita.
Dizer «4 valores» a falar dos pendentes era passar por medido o que não estava.

## A objecção ao masterprompt (levantada no Dia 0, com números)

O kimi #6 pede uma `publicar()` que «REJEITA payload com `visibilidade: local_only`».
**Lido à letra, isso é fail-open.** No ledger de 08-17:

```
visibilidade:"local_only"  ->   118 eventos
visibilidade:"shareable"   ->     0 eventos
SEM o campo                ->  4640 eventos   <-- inclui `dispatched`, que carrega `goal`
```

`actor.js` só etiqueta `EVENTOS_RESULTADO` — e faz bem, porque só esses carregam
resultado. Mas um gate que apenas recusa `local_only` **bloqueia 100% do que está
etiquetado e deixa passar 100% do que não está**, incluindo texto do utilizador.

Por isso `publicar.js` tem **duas** barreiras: (1) a recusa de `local_only` que o MP
pede, e (2) uma **allowlist de campos** — só saem valores derivados; `goal`, `prompt`,
`worktree`, `mp_hash` e `files_touched` não estão nela. A ausência de rótulo não é
permissão. O cartão não herda o `local_only` do evento porque **o cartão não é o
evento**: é um artefacto novo feito só de campos que atravessaram a allowlist.
Se isto virar produto, a decisão de publicar tem de passar a ser um `shareable`
explícito gravado no ledger — não esta allowlist. Fica dito.

## Ficheiros

| Ficheiro | Papel |
|---|---|
| `morte.js` | a data de morte, lida pelo daemon |
| `gate.js` | o `if` do MODO VIVO (linha no `SYNC.md`) |
| `allowlist.js` | **um** id, usado nos **dois** caminhos (kimi #1) |
| `denylist.js` | o nome de um segredo nunca sai (kimi #5) |
| `leitura.js` | o Dia 0 em código: `{valor, rótulo, fonte, porquê}` |
| `publicar.js` | **a única** porta de saída (kimi #6) |
| `adapter.js` | menção → despacho → cartão → clique → decisão + auditoria (kimi #8) |
| `daemon.js` | as 4 razões para não arrancar (prazo · gate · `.env` · token) |
| `despacho.js` | a porta de despacho **real** (`toolWork`) + allowlist de **saída** |
| `transporte.js` | o **único** ficheiro que fala com o Slack (Socket Mode à mão, 0 deps) |
| `correr.js` | a raiz de composição: quem liga a quem. `--seco` = ensaio offline |
| `descobrir.js` | deriva canal + id do bot + id do humano do **próprio** Slack |
| `cartao.js` | a **apresentação**: puro, dados → Block Kit. Vocabulário fechado |
| `poller.js` | o pendente nasce no **ledger**, não no socket. Extraído por ser indemonstrável inline |
| `cadeia.js` | quanto custou a **conversa**, não o pedido. Só aritmética — não formata nada |
| `cancelar.js` | o botão **Parar**. Leva o hash mas **não recusa** por divergência: um STOP não se bloqueia |

**Nada aqui altera o núcleo.** `broker.js`, `actor.js` e `seamless.js` são importados
como qualquer consumidor; a porta de despacho é **injectada** (duplo em construção,
`toolWork` em vivo).

### As duas allowlists, simétricas

O `publicar.js` decide o que **sai** para o Slack; o `despacho.js` decide o que
**entra** no motor. Só passam `goal`, `agent`, `wave`, `actor` — se um dia alguém
juntar `thread_context` ao objecto da menção (a tentação óbvia: «dá mais contexto
ao modelo»), morre na porta em vez de chegar a um prompt. A regra do masterprompt
passa a ser uma barreira, não um comentário.

O erro do `toolWork` sai em **`porque_local`** — um nome que **não** está em
`CAMPOS_PERMITIDOS`. As mensagens de erro do motor citam o goal; assim, se alguém
tentar publicá-las, a porta recusa por construção e não por lembrança.

### As duas guardas do transporte que custam dinheiro se faltarem

1. **ACK antes de tratar.** O Slack re-entrega o que não foi confirmado, e uma
   re-entrega de `app_mention` é um **segundo job, pago**. Preço aceite: se o
   processo morrer entre o ack e o tratamento, aquele evento perde-se — perder um
   pedido é recuperável (a pessoa repete), pagar dois não.
2. **Dedupe por `event_id`.** O ack não cobre re-entregas por razões do Slack.

O **CAS fica intacto**: o botão carrega o `hash_esperado` que estava no cartão, não
um hash fresco lido no clique — ler fresco fazia o clique atrasado passar por
válido e a demo perdia a cena que o masterprompt manda gravar (kimi #4).

### Ensaio offline (corre HOJE, com o MODO VIVO trancado)

```bash
cd packages/slack-spike && node correr.js --seco
```

Passa uma menção sintética pelo loop inteiro e imprime o que **sairia**. Não abre
socket, não despacha (nem atrás do gate: em `--seco` o `toolWork` não entra), não
paga. `node correr.js` sem `--seco` recusa arrancar e diz qual dos quatro passos
falhou.

## Testes

```bash
cd packages/slack-spike && node --test
```

**286/286 a passar.** Inclui o **ensaio do infeliz** (kimi #4) contra o broker **real**
em dry-run (`MOOTER_HOME` numa pasta temporária, dispatcher duplo):

1. **recusa** → `REJECTED` gravado e dito no thread;
2. **clique atrasado** → `STALE` com **os dois hashes à vista** (o CAS a trabalhar) e o
   pendente **continua** na fila;
3. **daemon offline** → instância nova, mesmo ledger: o pendente **sobrevive e reaparece**.

Mais: clique de terceiro é ignorado, registado e **não chega ao broker**; pendente já
decidido responde efémero; e o thread-context **nunca** entra no prompt.

E o **round-trip** que faltava: o cartão de um pendente real gera os botões, e o
botão decide o **mesmo** pedido — com um cartão velho a dar `STALE`, não decisão.
Era aqui que estava o buraco: `cartaoDe` não punha o `state_hash` no cartão, e sem
ele o botão nascia sem CAS (ou seja, não nascia). Provava-se o cartão, provava-se o
clique, nunca o cartão a **alimentar** o clique.

### Vermelho→verde, provado por mutação

Cada guarda nova tem um teste que a guarda — verificado a mutar o código e a
confirmar que a suite fica vermelha. **9 mutações, 9 vermelhas**, baseline verde,
árvore reposta verde. *(À primeira, o medidor deu falso-verde: `node --test` usa `✖`
e eu procurava o `not ok` do TAP. O medidor estava errado, não a guarda — mas um
medidor que diz `OK` sem medir é pior que nenhum.)*

| Mutação | Testes que caem |
|---|---|
| `cartaoDe` sem `hash_esperado` | 2 |
| gate a exigir a linha byte-a-byte | 3 |
| ACK depois de tratar | 1 |
| sem dedupe de re-entrega | 1 |
| sem allowlist de saída no despacho | 1 |
| `publicar` sem allowlist de campos | 2 |
| `kimi` adicionado à allowlist de motores | 1 |
| barreira de motores removida da porta | 5 |
| exclusão do `kimi` esvaziada | 3 |

## Só 2 das 5 variáveis se pedem — as outras 3 derivam-se

O dono dá os **tokens**; o canal e os dois ids o próprio bot sabe perguntar.
`descobrir.js` corre no arranque vivo (depois do daemon, logo só com o gate aberto)
e escreve o que faltava no `.env`:

| Variável | Origem | Fail-closed |
|---|---|---|
| `SLACK_APP_TOKEN` | **o dono** (`xapp-…`) | — |
| `SLACK_BOT_TOKEN` | **o dono** (`xoxb-…`) | — |
| `SLACK_BOT_USER_ID` | `auth.test` | sem `user_id` ⇒ pára |
| `SLACK_CANAL` | `conversations.list`, nome **exacto** `mooter-demo` | 0 resultados ⇒ pára e diz o nome que procurou; **nunca** devolve o parecido mais próximo |
| `SLACK_ALLOW_USER_ID` | `users.list`, o único humano | 0 ou 2+ humanos ⇒ **recusa** e lista os ids |

O caso do humano é o que mais importa: a allowlist aceita **um** id. Se o workspace
tiver dois humanos, escolher um era escolher **quem pode aprovar gastos** — e isso
não se adivinha, pergunta-se. O dono disse «sou o único humano do workspace»; isto
**verifica** a afirmação em vez de a assumir.

A escrita no `.env` nunca faz round-trip de parser: as linhas que não são destas 3
chaves ficam **byte-a-byte** como estavam, comentários incluídos — um ficheiro com
tokens dentro não é sítio para reescrever a partir de um objecto. É idempotente, e
uma chave que o dono já tenha posto à mão **manda** sobre a derivada.

As chamadas passam todas pelo `chamarSlack` do `transporte.js`: `descobrir.js` não
abre um segundo caminho para fora, e a afirmação «um único ficheiro fala com o
Slack» continua verdadeira.

## O que falta para o MODO VIVO

1. ~~A linha no `SYNC.md`~~ — **está lá** (Cowork, GO CONDICIONADO, 2026-08-17). O
   tripwire que garantia que ninguém destravava às escondidas ficou vermelho no
   momento exacto em que a linha entrou, e passou a guardar a verdade nova: a linha
   **nunca pode estar sozinha** sem a decisão escrita ao lado.
2. ~~A exclusão do kimi por construção~~ — **feita e provada** (condição dura do GO).
3. **App Slack + os 2 tokens no `.env`** — o único bloqueador que resta.
   `packages/slack-spike/.env` está coberto por `*.env` (`.gitignore:13`) —
   verificado; um ficheiro com outro nome (`tokens.txt`) **não** estaria. O
   `daemon.js` reconfirma com `git check-ignore` **antes** de tocar no token (kimi #7).
4. ~~Ligar `despachar` ao `toolWork` real e `enviar` ao `chat.postMessage`~~ — feito.
   Falta correr **uma vez** a sério.
5. Teste 2-devices (aprovar do telemóvel com a frota no desktop) — **o dono pediu
   para ser avisado ANTES**, para estar com o telemóvel na mão.
6. **Condição de sócio:** a demo nasce agendada — data marcada com ≥1 estranho
   **antes** do merge do spike.

### O que NÃO está provado (e só o dia vivo prova)

O transporte está testado contra duplos, não contra o Slack. Ficam de fora, por
construção: os tokens/scopes reais, o formato exacto de um `app_mention` a chegar
de um workspace verdadeiro, o comportamento do socket a reconectar de horas em
horas, e o render dos blocos no telemóvel. Nada disto se pode afirmar antes de
correr — e por isso não se afirma.

## Silenciar um pedido — `SLACK_IGNORAR_JOBS`

Um cartão já publicado **continua com os botões vivos**. Se um pedido entrou num ciclo
mau — aprovar re-despacha, o filho volta a pedir aprovação, e a conta sobe — silenciá-lo
é a forma de o parar sem lhe tocar:

```bash
SLACK_IGNORAR_JOBS=job-abc-1234,job-def-5678 node correr.js
```

Ou no `.env`, ao lado das outras `SLACK_*`:

```
SLACK_IGNORAR_JOBS=job-abc-1234,job-def-5678
```

**Os dois sítios funcionam.** Nem sempre foi assim: a lista era lida no topo do módulo,
*antes* de o `.env` existir em `process.env` — punha-se lá e não acontecia nada, com o
`[Aprovar]` a continuar quente. Um guarda que se desliga em silêncio quando o pomos no
sítio óbvio dá a sensação de protecção sem a dar.

O silêncio vale nos **dois** caminhos — o que publica e o que recebe cliques:

| Acção | Num job silenciado |
|---|---|
| **Anunciar-se** | não. O cartão não volta a aparecer |
| **Aprovar** | **bloqueado** — devolve `SILENCIADO`, efémero, e não chega ao broker |
| **Recusar** · **Parar** | continuam a funcionar |

Aprovar é a única acção bloqueada de propósito: `Recusar` e `Parar` são as que **mandam
parar**, e bloqueá-las prendia o dono dentro do próprio cartão que quer travar. O job
continua na fila do motor — silenciar não é cancelar.

## Custo: o do pedido e o da conversa

Cada aprovação gera um pedido **novo**. Um cartão que só saiba de si diz a verdade e
mente na mesma: `US$ 1,24` num thread que já queimou `US$ 2,88`. Por isso o cartão leva
duas linhas quando há cadeia:

```
Já gasto até agora neste pedido: US$ 1,24
Nesta conversa, 3 pedidos encadeados: US$ 2,88
valores informados pelo próprio motor · não verificados por nós
```

Regras, todas testadas:

- **um só pedido** ⇒ não há linha de cadeia (seria ruído a repetir o número de cima);
- **procedência desconhecida** ⇒ o número **não sai** — a mesma regra do pedido;
- **um job da cadeia sem custo ainda** ⇒ diz **«pelo menos»**, porque é um piso e não um total;
- **cadeia mista** ⇒ manda a afirmação mais fraca: se há uma estimativa lá dentro, o
  total diz `inclui ESTIMATIVA`;
- **procedências diferentes** entre o pedido e a cadeia ⇒ **cada número leva a sua**.

⚠️ **O que isto NÃO resolve:** aprovar não herda o tier do pai. O re-despacho
re-classifica um prompt inflado e sobe de T1 para T3 — medido: **12,7×** o custo do job
original. O fix é no `broker.decide`, no motor, fora do alcance deste spike. O sintoma
vê-se; a causa fica.
