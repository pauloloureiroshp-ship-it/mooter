# 🔍 MASTERPROMPT · AUDITORIA ADVERSARIAL do `slack-spike`

**Para:** Cowork (ou qualquer agente com acesso ao PC do Paulo)
**De:** Claude Code, que foi autor E revisor do dia inteiro — e é exactamente por isso
que este documento existe.
**Data:** 2026-08-17 · **Alvo:** branch `claude/slack-spike-masterprompt-82c108`

---

## Porque estás a ler isto

Escrevi ~2 000 linhas de código hoje, corri 171 testes, provei guardas por mutação, e
**auto-avaliei-me em todos os passos**. O `AGENTS.md` deste repo diz *«adversarial
verification (critic ≠ author)»* e eu violei-o o dia inteiro por falta de alternativa.

Mais grave que isso: **o mesmo erro apanhou-me três vezes seguidas** — escrevi testes
que exercitavam uma *cópia* do padrão em vez do código real, e por isso passavam
verdes sobre bugs vivos. Um erro repetido três vezes não é um lapso, é um viés. Não
confio na minha própria varredura para o encontrar outra vez.

**A tua função não é confirmar o meu trabalho. É partir-lhe os dentes.**

---

## Regras da auditoria

1. **Não acredites em nenhum número deste documento.** Cada afirmação abaixo traz o
   comando que a produz. Corre-o. Se não bater, isso é um achado — e dos graves,
   porque significa que eu reportei ao dono coisas que não medi.
2. **Prioriza o que custa dinheiro ou queima confiança** sobre elegância de código.
   Isto é um spike throwaway com data de morte (`2026-09-16`); não me venhas com
   arquitectura ideal.
3. **`n/d` é resposta válida.** Se não conseguires verificar, diz que não conseguiste.
   Um `PASS` fabricado é pior que um `n/d`.
4. **Não corrijas nada.** Reporta. As escritas em git são do Paulo.
5. **Não gastes dinheiro.** Não despaches jobs, não cliques em nada no Slack. Tudo o
   que precisas está no disco.

---

## Contexto mínimo (verifica, não confies)

```bash
cd "C:/Users/Paulo Loureiro/frugal/.claude/worktrees/slack-spike-masterprompt-82c108"
git log --oneline origin/main..HEAD          # devem ser ~18 commits, todos de hoje
ls packages/slack-spike/                      # o pacote inteiro vive aqui
cd packages/slack-spike && node --test        # eu afirmo 171/171
```

O spike liga o Slack ao motor do Mooter: menção → despacho de agente → se o agente
parar a pedir aprovação, aparece um cartão com botões → o clique decide → o trabalho
retoma. Tudo no workspace do Paulo, um canal, um utilizador, com data de morte.

---

## PARTE A — as afirmações que fiz ao dono. Confirma ou desmente cada uma.

| # | Afirmei | Como verificar |
|---|---|---|
| A1 | 171 testes, 0 falhas | `cd packages/slack-spike && node --test` |
| A2 | `classify.js` intacto, sha `427d8c0b…4bc48f` | `sha256sum tools/router/classify.js` |
| A3 | Nada tocado fora de `packages/slack-spike/` (excepto `SYNC.md`) | `git diff --stat origin/main..HEAD` |
| A4 | A frente gastou **US$ 4,2302** em 9 jobs hoje | soma `cost_usd` no `~/.mooter/ledger.jsonl` dos jobs com `actor.id = slack:U0BGS8N8JFL` e dos encadeados por `prep_from` |
| A5 | 6 desses jobs foram um **ciclo** causado pelo goal da demo | segue a cadeia `approval_granted → job_novo` no ledger |
| A6 | O pedido normal (README) custou US$ 0,1154 e **não** pediu aprovação | procura `job-msxituae-76f9` no ledger |
| A7 | O `.env` está gitignored e nunca foi commitado | `git log --all --name-only \| grep -i "\.env"` e `git check-ignore -v packages/slack-spike/.env` |
| A8 | Guardas provadas por mutação (12 mutações, 11 vermelhas) | corre tu as tuas próprias mutações; não uses o meu script |

**A8 é o mais importante.** Escolhe 5 guardas ao acaso, muta-as tu, e vê se a suite
grita. Se alguma ficar verde, encontraste um teste decorativo — e eu tenho um
historial de os escrever.

---

## PARTE B — o viés que já se manifestou 3× hoje. Procura a 4ª.

**O padrão:** o código estava certo; o teste exercitava outra coisa. Três instâncias
reais, todas encontradas por acaso e não por revisão:

1. `publicar()` construía o cartão inteiro e `correr.js` chamava `enviar(texto, p)` sem
   o 3.º argumento → **o Slack recebia uma linha**. 168 testes verdes. Descoberto no
   telemóvel do dono.
2. O teste que escrevi *para esse bug* **replicava** a ligação em vez de a importar →
   repor o bug deixava-o verde. Descoberto por mutação.
3. O fecho do thread olhava para `listPending()`, mas o job que acaba bem **nunca**
   aparece lá → o caminho feliz era o único não coberto. Descoberto pelo dono a usar.

**A tua tarefa:** encontra a 4.ª. Procura especificamente:

- testes que **reconstroem** um objecto em vez de importar a função que o constrói
- testes que passam listas/estado à mão onde o código real as **deriva**
  (foi exactamente isto na instância 3)
- ligações entre módulos que só existem dentro de `montar()` em `correr.js` e que
  nenhum teste chama
- `try/catch` que engolem e continuam
- qualquer sítio onde eu tenha escrito «provado» sem um comando ao lado

Grep útil para começar:
```bash
grep -n "criarPublicador\|criarTransporte\|criarAdaptador\|criarDespachador" packages/slack-spike/*.test.js
```
Cada sítio onde um teste **constrói** o que `correr.js` também constrói é um sítio
onde as duas construções podem divergir sem ninguém dar por isso.

---

## PARTE C — segurança. É aqui que um erro sai caro de verdade.

O spike promete que **conteúdo do utilizador nunca sai da máquina**: nem o `goal`,
nem prompts, nem nomes de ficheiros, nem worktrees. O que sai é derivado (custo,
modelo, autor, impressão).

**Ataca isso.** Perguntas concretas:

- **C1** — `publicar.js` tem 4 barreiras (`local_only` · allowlist de campos ·
  denylist de nomes · limite de prosa). Constrói um payload que atravesse as 4 e
  leve conteúdo. Consegues?
- **C2** — a allowlist é de **profundidade 1** (valida nomes de campo, não folhas).
  Eu fechei isso com vocabulário fechado + limite de comprimento. É suficiente?
  Onde é que uma folha ainda escapa?
- **C3** — o `valorDoBotao` põe `job_id` + acção + impressão no payload do botão, que
  o cliente vê. Há risco?
- **C4** — o `despacho.js` tem allowlist de saída (4 campos) e allowlist de motores
  (kimi excluído por construção, condição do GO). Encontra uma via de contornar
  qualquer uma.
- **C5** — o `.env` tem tokens reais. Verifica que nenhum caminho os pode imprimir
  (logs, mensagens de erro, o `porque_local`, o cartão). Eu afirmo que não; prova o
  contrário se conseguires.
- **C6** — **CONTEXTO IMPORTANTE:** o ficheiro original dos tokens chamava-se
  `SLACK_BOT_TOKEN=xoxb-<dígitos>.txt` e estava em `OneDrive/Desktop` — sincronizado
  para a cloud, com o segredo no NOME. Eu movi-o para `.env` (gitignored) mas o nome
  já sincronizou, e eu próprio o imprimi num transcript. **Avalia o risco real e diz
  ao Paulo se deve rodar os tokens.** Eu recomendei rodar; quero uma segunda opinião.

---

## PARTE D — a pergunta que o dono fez e eu não respondi bem

> *«não sei como isso pode ser produtivo»*

Ele tem razão em duvidar. Os números medidos:

- pedido simples (resumir um README): **US$ 0,115**, ~45 segundos
- 20 segundos desses são a preparação local a expirar **sempre** (`MOOTER_PREP_TIMEOUT_MS`, default 20s) antes de o motor «ir directo»
- um ciclo de aprovação custou **US$ 0,63 por volta**

**Responde a isto com números, não com opinião:**

- **D1** — a preparação local (Ollama) expira em **todos** os despachos que vi hoje.
  Vê no ledger quantos `prep_timeout` há contra quantos `prep` bem-sucedidos, em toda
  a história. Se a preparação nunca funciona, são 20s mortos por pedido — vale a pena
  ligar? aumentar o timeout? desligar para este caminho?
- **D2** — o custo por pedido vem de `claude-opus-5` / `claude-haiku-4-5` conforme o
  tier. Um resumo de README a US$ 0,66 (opus) contra US$ 0,115 (haiku) é 5,7×. O
  router escolheu bem? Vê o `tier_pedido`/`tier_motor`/`classify_porque` no ledger.
- **D3** — **a pergunta de fundo:** para que serve o Slack aqui? A minha tese é que
  não é velocidade (escrever tu é mais rápido), é **autorizar do telemóvel trabalho
  que já corre, com recibo**. Concordas? Se não, qual é o caso de uso real, ou não
  há nenhum e isto devia morrer na data marcada?

---

## PARTE E — o que eu declarei como `n/d`. Confirma que são honestos, ou desmente.

1. **STALE ao vivo num job real** não é alcançável: o estado de um pendente congela
   até alguém decidir. Provado só contra o broker em dry-run + um ensaio rotulado.
   *É mesmo inalcançável, ou não procurei o suficiente?*
2. **`section.fields` em ecrã estreito** — não documentado pelo Slack. Verifica nos
   docs; se estiver documentado, eu falhei a pesquisa.
3. **A ordem «varrer antes de formatar»** não é provável por mutação hoje, porque
   nenhum formatador cola um caractere de palavra a um valor. *Confirma que é verdade
   ou encontra o formatador que o faz.*
4. **A regex de aprovação do `seamless.js` não apanha «preciso DA tua aprovação»** —
   só «de». Isto é do núcleo (frozen), não do spike. *Confirma o impacto: quantos
   `agent-awaiting-approval` existem no ledger histórico? Se forem poucos, é porque a
   regex quase nunca dispara em PT — e isso é um bug de produto, não de spike.*

---

## PARTE F — invariantes do repo

- `tools/router/classify.js` **FROZEN**, sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- `packages/*` das waves 28-34.5 **não tocados**
- adds selectivos, nunca `git add -A`
- sem novos `.md` na raiz

Verifica os quatro. E verifica se eu criei coisas que o Paulo tem de limpar:
worktree `slack-demo`, branch `slack-spike/demo-sandbox`, branch superseded
`claude/slack-spike-masterprompt-3fd4e2`.

---

## PARTE G — o que está por commitar noutro sítio (risco de perda)

A autorização inteira desta frente — a linha `kimi-egress FECHADA — slack-spike
destravado` e o bloco `GO CONDICIONADO` — vive **uncommitted** no working copy de
`~/frugal`, no branch `onda-q/m1-fechar-o-laboratorio`. Não está no HEAD desse branch,
nem no `main` local, nem no `origin/main`.

**Confirma isto e diz ao Paulo o tamanho do risco.** É o único trabalho desta frente
que se pode perder com um `git checkout` distraído.

---

## O que quero de volta

Um relatório com:

1. **Achados por severidade** (ALTO / MÉDIO / BAIXO), cada um com o comando que o
   reproduz. Sem reprodução, é opinião.
2. **A 4.ª instância do viés da Parte B** — se não a encontrares, diz que procuraste
   e onde, para eu saber que o espaço foi coberto.
3. **Veredicto sobre a Parte D**: isto é produtivo, é uma demo de custódia, ou é para
   morrer a 2026-09-16?
4. **As afirmações da Parte A que NÃO bateram.** Essas são as piores: significam que
   eu disse ao dono coisas que não medi.
5. Um `n/d` explícito para tudo o que não conseguiste verificar.

**Não me poupes.** O trabalho de hoje só vale se sobreviver a alguém que queira
prová-lo errado — e eu já provei que não consigo ser essa pessoa sobre o meu próprio
código.

---

`gauntlet: auditoria pedida pelo dono · autor≠crítico por construção · o autor
declara 3 instâncias do mesmo viés e pede a 4ª · council: n/d (não corrido)`

---

# PARTE H — UX/UI: o silêncio, o progresso, e o botão que falta

*(acrescentado a pedido do dono, que reportou a sensação de «não sei se está a fazer
alguma coisa» depois de mandar um pedido)*

## H0 — O contexto medido, antes de qualquer opinião

Um pedido normal (`lê o README e resume`) hoje:

```
17:41:44  dispatched              ← o thread diz "⚙️ Recebido"
17:41:44  local_model_chosen
17:42:04  prep_timeout            ← 20 SEGUNDOS DE NADA
17:42:04  dispatched (encadeado)  ← só agora começa o trabalho a sério
17:42:13  step
17:42:16  step
17:42:18  step
17:42:25  done · exit=0 · US$ 0,1154
```

**45 segundos totais, dos quais os primeiros 20 são um timeout.** Durante esses 20s o
sistema não está a trabalhar — está à espera de desistir. O utilizador vê silêncio.

## H1 — O que o Slack permite (VERIFICA, não confies em mim)

Só consegui confirmar duas coisas nos docs: **«apps may post no more than one message
per second per channel»** e que exceder devolve **429 com `Retry-After`**. O resto
abaixo é o que **acredito** e não verifiquei — trata cada linha como hipótese:

- `chat.update` na mesma mensagem: qual é o tier real e o limite por minuto?
- `reactions.add` / `reactions.remove`: existem, que scope pedem (`reactions:write`?),
  que tier?
- **`assistant.threads.setStatus`** — o Slack tem um indicador nativo de *«a pensar…»*
  para apps de assistente. **Isto é o que resolveria o problema de raiz.** Mas exige a
  superfície de *Agents & AI Apps*, que o masterprompt original deste spike excluiu
  («assistant-surface não usada»). **Pergunta central: essa exclusão ainda faz sentido,
  ou foi uma decisão tomada sem saber que era isto que dava o indicador nativo?**
- Existe algum elemento **animado** no Block Kit? (eu acredito que não — confirma)

## H2 — Advogado do diabo contra a ideia do dono (progress bar)

O dono pediu «progress bar ou qualquer coisa». Antes de a construir, ataca a ideia:

- **Não há denominador.** O ledger emite `step` sem total. Uma barra a 60% seria um
  número inventado — e este produto vende-se por **não** inventar números (mostra `n/d`
  no custo sem fonte). Uma barra falsa ao lado de um `n/d` honesto destrói o argumento
  todo. **Concordas, ou existe um denominador que eu não vi?** (histórico de steps por
  tipo de tarefa? `eta.js` no `mooter-bridge`? investiga — pode haver base real para
  uma estimativa ROTULADA como estimativa.)
- **Uma animação sobre os 20s de `prep_timeout` é um álibi para um bug.** O utilizador
  passaria a ver «a trabalhar» durante 20s em que nada trabalha. Isso é pior que
  silêncio. **A correcção certa é matar os 20s, não decorá-los.** Concordas?
- **Custo de cada update:** cada `chat.update` é uma chamada. Um heartbeat de 10 em 10
  segundos num job de 5 minutos são 30 chamadas por pedido. Vale?

## H3 — O achado que eu acho MAIOR que o progresso

**Não há botão de CANCELAR.** Um agente a correr mal no PC, visto do telemóvel, não
tem stop — só se pode ver.

Progresso é conforto; cancelar é controlo. Para um produto cujo argumento é *custódia*,
custódia sem botão de parar é meia custódia. Um utilizador ansioso por não ver progresso
é um problema; um utilizador a ver o agente fazer o que não quer, sem poder parar, é
uma perda de confiança irrecuperável.

**Avalia:**
- O `mooter-bridge` tem `mooter_cancel` / `toolCancel`. Dá para o ligar a um botão?
- Um `Parar` na mensagem de estado tem os mesmos problemas de CAS que o Aprovar
  (clique atrasado sobre um job já terminado)?
- **Concordas com a minha priorização (cancelar > progresso), ou estou a fugir do que o
  dono pediu?** Se discordas, diz porquê — o dono pediu progresso e eu estou a
  responder outra coisa.

## H4 — A tensão que ninguém decidiu: demo vs uso diário

O cartão actual está optimizado para **um estranho ver custódia**. Para o dono, em uso
diário, o mesmo cartão é ruído:

- **4-5 mensagens por pedido** (menção → Recebido → cartão → decisão → fecho)
- o push do «Recebido» toca no telemóvel para dizer que **ainda não aconteceu nada**
- `ficheiros alterados: não declarados — este motor nunca os reporta` em **todos** os
  cartões; explicado uma vez, é ruído para sempre
- a impressão de 64 chars: ouro para um cético, ruído para quem já confia

**Pergunta:** dois modos (demo / diário)? Um só, e qual perde? Ou é sinal de que a UI
está a servir dois donos e nenhum bem?

## H5 — Desenho que proponho, para atacares

Não uma barra. **Sinais honestos, todos com dados reais:**

1. **Reacção emoji na mensagem do utilizador** — ⏳ ao aceitar, ✅/❌ ao terminar.
   Nativo, zero mensagens novas, honesto (estado binário, sem percentagem).
2. **Heartbeat só se demorar** — passados N segundos, `chat.update` **na mesma**
   mensagem de estado: `⚙️ A trabalhar · 4 passos · 1m12s`. Números reais do ledger.
   Sem barra, sem ETA, sem percentagem.
3. **Botão `Parar`** enquanto o job corre.
4. **Suprimir o push** da mensagem de estado (o `text` de notificação pode ser mínimo).

**Ataca cada um.** Especificamente:
- a reacção resolve mesmo a ansiedade, ou é subtil de mais para quem está no telemóvel?
- «4 passos» diz alguma coisa a um humano, ou é jargão de máquina disfarçado de progresso?
- o heartbeat com `chat.update` colide com o rate limit de 1 msg/s por canal quando há
  dois jobs a correr ao mesmo tempo?

## H6 — O que quero de volta desta parte

1. **Os factos do H1 confirmados ou desmentidos**, com link para o doc.
2. **Veredicto sobre H2:** barra de progresso — construir, ou recusar por não haver
   denominador honesto? Se recusar, qual é a alternativa que dá ao dono o que ele
   pediu (saber que está a trabalhar) sem inventar nada?
3. **Veredicto sobre H3:** cancelar antes de progresso, ou estou a desviar-me do pedido?
4. **Uma decisão sobre H4** — demo e uso diário são a mesma UI ou não.
5. **O que fazer aos 20 segundos de `prep_timeout`.** Nenhuma UX o resolve; é latência
   real. Ligar a preparação a funcionar, aumentar o timeout, ou desligá-la neste
   caminho? Vê no ledger a taxa histórica de sucesso da preparação local antes de
   responder.

---

# PARTE I — a pergunta que parte o produto em dois

*(acrescentada depois de o primeiro pedido verdadeiramente normal correr bem)*

## I0 — O que aconteceu, medido

```
19:33:17  dispatched · agent=moo
19:33:37  done · exit=0 · modelo=gemma4:e4b · custo=0 · tier=T0 · 19,8s
```

Sem `prep_timeout`. **Correu na GPU do dono, custou US$ 0,00**, e o thread fechou com
`🏁 Trabalho concluído`. A tese local-first do Mooter funcionou: a mesma classe de
tarefa que noutra volta custou US$ 0,66 no opus custou **zero**.

**E o dono nunca viu o resultado.**

O pedido era «lê o README do slack-spike e **resume em 5 linhas** o que faz». O agente
escreveu 1 438 caracteres de resposta (`~/.mooter/jobs/job-msxmsv76-30f8/out.log`). O
Slack disse «Trabalho concluído. Não foi preciso decidir nada.» e mais nada.

## I1 — Não é um bug. É a regra a funcionar, e a matar o caso de uso.

O `publicar.js` tem uma allowlist fechada: só saem campos **derivados** (custo, modelo,
autor, impressão). **A resposta do agente é conteúdo.** Por construção, este desenho
nunca pode mostrar ao dono aquilo que ele pediu.

Isto parte o produto em dois casos de uso com valor oposto:

| Pedido | Valor está em | O Slack serve? |
|---|---|---|
| «resume / explica / escreve / compara» | no **output** | **Não.** Recebe «concluído» e vai ao PC |
| «arruma os testes / aplica a migração / corrige o bug» | na **acção** | **Sim.** Aprova do telemóvel, acontece, resultado no repo |

## I2 — A decisão que eu NÃO tomei, e porquê

Mostrar a resposta no Slack é **alargar a superfície de egress** — exactamente o que
este spike passou o dia a apertar (4 barreiras, vocabulário fechado, varrimento de
árvore, limite de prosa). Não a alargo sozinho no fim de um dia em que já errei três
vezes no mesmo padrão.

**O argumento a favor:** o goal foi escrito pelo dono, num canal dele, e a resposta a
uma pergunta que ele fez ali não é «conteúdo vazado» — é o que ele pediu. Recusá-la é
o sistema a ser paranóico contra o seu próprio utilizador.

**O argumento contra:** a resposta do agente pode citar nomes de ficheiros, caminhos,
excertos de código, ou coisas que ele leu pelo caminho e que o dono não pediu. O
`goal` é do dono; **a resposta é do agente**, e o agente leu o disco.

**Decide tu:**

- **I2a** — a resposta deve poder sair? Sob que condições?
- **I2b** — se sim, atravessa a denylist + um limite de tamanho, ou precisa de mais?
  (nota: a denylist apanha *nomes de ficheiros de segredo*, não caminhos genéricos nem
  excertos de código)
- **I2c** — ou a resposta **nunca** sai, e o Slack assume-se explicitamente como
  superfície de **acção e não de leitura** — com a UI a dizê-lo («o resultado está no
  teu PC», com o caminho)?
- **I2d** — ou há um meio-termo: as primeiras N linhas, com um «ver tudo no PC»?
- **I2e** — **a pergunta de fundo:** se a resposta nunca sai, o `@Mooter` num canal
  vale a pena para alguma coisa além de aprovar/recusar? Se a resposta for «não», isso
  não é um defeito — é o **posicionamento**: o Slack é a *cabine de custódia*, não a
  *janela de trabalho*. Mas então a UI tem de o dizer, e os goals de demo têm de ser
  do tipo certo. **Hoje não diz, e eu dei ao dono um goal do tipo errado para testar.**

## I3 — O que isto faz à Parte H (progresso)

Reordena. Para um job de 19,8s com resposta no fim, **uma barra de progresso é o
problema errado**: o que faltou não foi movimento, foi conteúdo.

O progresso volta a importar nos jobs longos (o de opus levou 45s, 20 dos quais de
timeout). Mas se tiveres de escolher uma coisa para construir a seguir, **avalia se é
mesmo o progresso** — ou se é (a) mostrar o resultado, (b) o botão de cancelar, ou
(c) matar os 20 segundos de `prep_timeout`.

**Ordena as quatro por valor para o dono, com justificação.** Não aceito «todas».
