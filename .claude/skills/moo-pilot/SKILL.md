---
name: moo-pilot
description: Moo Pilot — o cockpit por device do Mooter. Levanta o motor local, o endpoint e o loop desta máquina, e abre o painel ao vivo em 127.0.0.1:4290/panel com GPU medida, os 10 pilares, os recibos por veredicto e a frota. Tudo da GPU e do ledger local, $0. Usar quando o Paulo disser "/moo-pilot", "abre o pilot", "cockpit do device", "o que a GPU está a fazer?", ou ao configurar um device novo.
---

# /moo-pilot — cada device é um funcionário com cockpit próprio

> **Nome oficial:** Moo Pilot. **Um cockpit por device**, nunca um agregador central.
> Código canónico: `tools/cockpit/runner/` (com testes: `npm run test:cockpit-runner`).
> Shell: `tools/cockpit/moo-pilot-shell.html`. Nada disto vive numa skill — a skill
> só sabe conduzir o que já está no repo.

## O gesto

```bash
cd ~/frugal && npm run pilot
```

Levanta o que estiver em baixo (endpoint F10, loop dos pilares), identifica o device
pelo hostname e abre o painel. `npm run pilot:status` reporta sem arrancar nada.

**O lançamento NUNCA levanta o STOP.** Lançar é "mostra-me os controlos"; trabalhar é o
▶ do dono. Se o STOP estiver activo, o cockpit abre com a máquina parada e o botão pronto.

## Ladder de dados — e a regra que a governa

1. **Ao vivo** — `GET http://127.0.0.1:4290/fleet.json`, poll 3s. É o único modo que
   **conduz**: ▶/⏸ e o foco por pilar precisam do endpoint.
2. **Instantâneo** — `node tools/cockpit/runner/build-shell-snapshot.mjs` injecta
   `window.__MOOTER_SNAPSHOT__` num HTML autónomo. Abre em qualquer lado, **não controla
   nada**, e diz isso num banner permanente.
3. **Silêncio honesto** — sem endpoint e sem snapshot, a página mostra o endereço vivo e o
   comando que o levanta. Nunca um número inventado, nunca um botão morto.

> **Não mandes o snapshot quando o Paulo pediu o cockpit.** Um snapshot num painel lateral
> sandboxed não alcança o `127.0.0.1` — os controlos ficam inertes e parece que o produto
> está partido. Custou-nos exactamente isso uma vez. Snapshot é para arquivar ou partilhar,
> nunca para conduzir.

## O que fazes, por ordem

1. **Estado real primeiro:** `npm run pilot:status`. Reporta o que está vivo e o que não está,
   com os PIDs e o estado do STOP. Sem inventar.
2. **Levanta e abre:** `npm run pilot`. Se o Ollama estiver em baixo, PÁRA e diz `ollama serve` —
   um cockpit apontado a uma GPU morta é pior que nenhum.
3. **Confirma que o painel é o canónico:** a resposta do `/panel` traz
   `X-Moo-Panel-Source: tools/cockpit/moo-pilot-shell.html`. Se vier outro ficheiro, diz qual.
4. **Lê o que o painel diz** e resume ao Paulo em linguagem dele: quantas rondas, quantas com
   citação conferida, GPU medida, alinhamento do repo, quem está na frota e com que idade.
5. **Device novo:** confirma `nvidia-smi` (Windows/Linux) ou `ioreg` (macOS) e o vault montado —
   sem vault partilhado a frota é um device só, e o painel diz isso.
6. **Arranque automático**, se o Paulo pedir: `node tools/cockpit/runner/autostart.mjs --install`.
   Corre o runner directamente, nunca o shim, e nunca com `--play`.
7. **Registo:** `mooter_setup({sessao:'registar', ...})` no fecho.

## Vocabulário — não o suavizes

| No painel | Quer dizer |
|---|---|
| `citação-ok` | a linha citada **existe** e foi lida do disco. **Não** que o achado esteja certo. |
| `refutado` | o modelo citou algo que não existe. |
| `sem citação` | resposta sem `ficheiro:linha` — não verificável. |
| `sem achado` | a ronda declarou nada a reportar. É honesto uma vez; em série é alarme — o painel conta as vazias seguidas, porque GPU ocupada sem produzir não é trabalho. |
| `nada por rever` | a ronda **nunca chegou ao modelo**: o pilar já tinha revisto tudo o que tem. Não é uma falha do modelo — é o poço seco, e a resposta é alargar o âmbito do pilar, não apertar a pergunta. Até 2026-08-19 isto contava como `sem citação` e fazia-o parecer quatro vezes maior do que é (209 de 275, medidos). |
| `sem veredicto` | recibos anteriores ao verificador. Contam como volume, nunca como trabalho. |
| `fora da janela` | citou uma linha real que nunca lhe foi mostrada. |

## Descartar exige uma razão

O botão `dismiss` já não descarta num clique: abre cinco razões fechadas, e o motor
**recusa** um descarte sem uma delas (`400` no endpoint, com a lista).

| Razão | O que ela diz sobre o produto |
|---|---|
| `nao-e-um-problema` | o defeito está na **pergunta** do pilar |
| `fora-do-que-estou-a-fazer` | o defeito está na **relevância**, não na qualidade |
| `ja-sabido` | o achado é certo e velho — falta memória, não precisão |
| `citacao-certa-conclusao-errada` | a linha existe, o raciocínio em cima dela não |
| `trivial` | certo e verdadeiro, mas não paga o clique |

**Aceitar e abrir issue não exigem razão.** A assimetria é deliberada: o valor está em
saber porque se deita fora. Foram 74 decisões com 72 descartes anónimos — a taxa mais
importante do produto era também a que não ensinava nada.

Os descartes anteriores a esta regra contam à parte, em `sem_motivo`, e o painel diz que
existem. Não se reescrevem e não se disfarçam de dado que nunca foram.

## O que mais está no painel

- **`machine lease`** — se a máquina foi cedida a outro trabalho. Um device que se afastou
  de propósito era indistinguível de um loop morto: os dois liam "sem recibos há 20 minutos".
- **Custo por modelo** (`GET /custo.json`) — o que os turnos do Claude Code desta máquina
  custariam **ao preço de tabela da API**. Não é dinheiro gasto: quem trabalha por
  subscrição não paga por token. Está lá para ser lido contra o `$0` do loop, e nunca
  somado a ele. Um modelo sem entrada em `tools/router/pricing.js` sai com a célula vazia.
- **P9 e P10** não procuram defeitos: procuram repetição que devia ter um nome só, e
  trabalho manual que um script podia fazer. Exigem a mesma prova — linha citada ou nada.

## Regras

- **$0 duro.** O runner só fala com `127.0.0.1:11434`. `assertLocalEngine` recusa tudo o resto,
  e `redirect: 'error'` impede que um 307 o leve para fora. Se algo aqui custar um token de
  subscrição, é bug — pára e reporta.
- **Um device por cockpit.** A frota é lida de beacons no vault, nunca sondando outras
  máquinas: um endpoint de controlo alcançável da rede seria um kill-switch remoto.
- **A frescura de outros devices vale o que o sync valer** — e isso vai escrito no painel.
- **GPU% é utilização, nunca valor entregue.** O valor mede-se em recibos com citação
  conferida. As duas coisas aparecem lado a lado, e nenhuma substitui a outra.
- Nada de prompts, segredos ou caminhos com username no payload.
- Fecho: ≤3 acções, ≤1 pergunta.

## Quando esta skill está a mentir

Se algum comando ou caminho aqui não existir, `tools/cockpit/runner/skill-moo-pilot.test.mjs`
falha. Uma skill que promete o que o código não faz é o pilar P3 a falhar em casa.
