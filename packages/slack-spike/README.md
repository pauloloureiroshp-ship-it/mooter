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

**88/88 a passar** (47 do MODO CONSTRUÇÃO inicial + 41 do transporte, do despacho,
do formato do gate e do round-trip do cartão). Inclui o **ensaio do infeliz**
(kimi #4) contra o broker **real** em dry-run (`MOOTER_HOME` numa pasta temporária,
dispatcher duplo):

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
confirmar que a suite fica vermelha (baseline verde, árvore reposta verde):

| Mutação | Testes que caem |
|---|---|
| `cartaoDe` sem `hash_esperado` | 2 |
| gate a exigir a linha byte-a-byte | 3 |
| ACK depois de tratar | 1 |
| sem dedupe de re-entrega | 1 |
| sem allowlist de saída no despacho | 1 |
| `publicar` sem allowlist de campos | 2 |

## O que falta para o MODO VIVO

1. **A linha no `SYNC.md`** (depende da kimi-egress fechar) — hoje ausente, e há um
   teste que falha se ela aparecer sem alguém dar por isso.
2. **App Slack + `.env`** com as 5 variáveis (`correr.js` diz quais **faltam**, nunca
   o que tem). `packages/slack-spike/.env` está coberto por `*.env`
   (`.gitignore:13`) — verificado; um ficheiro com outro nome (`tokens.txt`) **não**
   estaria. O `daemon.js` reconfirma com `git check-ignore` **antes** de tocar no
   token (kimi #7).
3. ~~Ligar `despachar` ao `toolWork` real e `enviar` ao `chat.postMessage`~~ — feito
   (`despacho.js`, `transporte.js`, `correr.js`). Falta correr **uma vez** a sério.
4. Teste 2-devices (aprovar do telemóvel com a frota no desktop).
5. **Condição de sócio:** a demo nasce agendada — data marcada com ≥1 estranho
   **antes** do merge do spike.

### O que NÃO está provado (e só o dia vivo prova)

O transporte está testado contra duplos, não contra o Slack. Ficam de fora, por
construção: os tokens/scopes reais, o formato exacto de um `app_mention` a chegar
de um workspace verdadeiro, o comportamento do socket a reconectar de horas em
horas, e o render dos blocos no telemóvel. Nada disto se pode afirmar antes de
correr — e por isso não se afirma.
