# ⇄ CC → COWORK · slack-spike · sessão completa de 2026-08-17

**TL;DR** — O spike está **vivo e a funcionar ponta-a-ponta**: menção no Slack →
agente despachado no PC do Paulo → cartão de aprovação → clique → trabalho retomado →
thread fecha. Custou **US$ 4,4675** em 17 jobs, dos quais **~US$ 3,8 foram um ciclo que
eu criei com um goal patológico**. O último pedido correu na GPU local por **US$ 0,00**.
Descobri no fim uma pergunta que **parte o produto em dois** e recusei-me a decidi-la
sozinho. Há um masterprompt de auditoria adversarial à espera de ti.

- **GOAL:** provar que um estranho vê custódia real sobre trabalho de agentes.
- **INTENT:** `_handoff/MASTERPROMPT_SLACK_SPIKE_2026-08-17.md` v1.1 · 4400 bytes ·
  sha256 `7a608ed297070ea6…2447` ✅ verificado antes de executar. *(Vive **untracked**
  em `~/frugal/_handoff/`.)*

## 🎯 A ÚNICA COISA

**Decidir se a resposta do agente pode sair para o Slack** (Parte I da auditoria).
Hoje não pode — e isso torna o Slack inútil para metade dos pedidos. Tudo o resto
(progresso, cancelar, latência) é secundário a essa decisão, porque ela define o que o
produto **é**.

---

## STATE

| | |
|---|---|
| **Worktree (onde o trabalho aconteceu)** | `.claude/worktrees/slack-spike-masterprompt-82c108` |
| **Branch** | `claude/slack-spike-masterprompt-82c108` @ `29ace5ee` |
| **vs `origin/main`** | **18 commits ahead** · `origin/main` = `b3642a03` (ancestral) |
| **unpushed / uncommitted** | **18 / 0** — árvore limpa |
| **Testes** | **172/172** (`cd packages/slack-spike && node --test`) |
| **`classify.js`** | `427d8c0b516315c6a858…` — **INTACTO** |
| **Fora de `packages/slack-spike/`** | só `SYNC.md` (espelho do destrave) |
| **Custo real medido** | **US$ 4,4675** · 17 jobs nascidos no Slack · 12 com custo |
| **Daemon** | **a ouvir agora** (`node correr.js`, socket aberto) |

---

## DECISIONS (recuperado verbatim, `handoff:qa`, zero LLM)

**Q1.** «Faltam 2 ids (`SLACK_CANAL` e `SLACK_ALLOW_USER_ID`). O teu passo 3 assumia
que eu os derivava — mas a app só tem `app_mentions:read` e `chat:write`, e derivar
exige dar-lhe leitura de TODO o workspace. Como queres fechar isto?»

1. **Colas-me os 2 ids (menor privilégio)** — não dás scope novo a uma app throwaway.
2. **Adiciono os scopes e reinstalo** — `channels:read` + `users:read`; dá a um spike
   com data de morte leitura da lista de canais e de todos os membros.

**→ Paulo escolheu: «opção 1 mas segue pra ajudar na evolução»** + os dois ids.

*Foi a única pergunta formal da sessão. Todas as outras decisões foram minhas, com a
razão escrita no commit — e é precisamente por isso que peço auditoria.*

---

## WORK — o que estava, o que foi feito

### Ponto de partida (herdado)

Uma sessão anterior tinha executado o masterprompt em MODO CONSTRUÇÃO
(`de4634ad`, 15 ficheiros, 47 testes, unpushed) mas **cortada de main velha**. Não
reiniciei: confrontei, cherry-picked para main actual, e continuei. O branch antigo
`claude/slack-spike-masterprompt-3fd4e2` ficou **superseded**.

### O que construí (18 commits)

| Ficheiro | O que é |
|---|---|
| `transporte.js` | o **único** que fala com o Slack · Socket Mode à mão, **zero deps** |
| `despacho.js` | porta do `toolWork` · allowlist de **saída** + allowlist de **motores** |
| `descobrir.js` | deriva canal/bot/humano do próprio Slack (fail-closed em cada) |
| `cartao.js` | a **apresentação**: puro, dados → Block Kit, vocabulário fechado |
| `correr.js` | raiz de composição · `--seco` = ensaio offline |
| + 5 suites | 47 → **172** testes |

### O que foi PROVADO ao vivo (não afirmado)

1. **Menção → despacho real** · `actor: slack:U0BGS8N8JFL` gravado no ledger
2. **Cartão de aprovação** com custo, modelo, autor, impressão e botões
3. **Recusa** → `approval_rejected · REJECTED · autorizacao=single_user`
4. **Aprovação** → `approval_granted` + `job_novo` + re-despacho · **6 vezes**
5. **Daemon offline** → o pendente sobrevive e o cartão reaparece · **3 vezes**
6. **Fecho do thread** → `🏁 Trabalho concluído · US$ 0,00 · gemma4:e4b · 19,8s`
7. **Local-first a funcionar** → o último pedido correu na GPU, **custo zero**

### A condição dura do GO CONDICIONADO — cumprida

`despacho.js` exclui o **kimi por construção**: allowlist de motores
(`cc`,`codex`,`gemini`,`moo`), exclusão declarada com razão datada, motor obrigatório
(um `agent` ausente herdaria o default do `seamless.js`). **Provado por mutação:** pôr
kimi na allowlist, remover a barreira, ou esvaziar a exclusão ⇒ suite vermelha nas três.

---

## 🚨 RISK

### R1 — A autorização desta frente está por commitar (o único trabalho que se perde)

A linha `kimi-egress FECHADA — slack-spike destravado` e o bloco **GO CONDICIONADO**
vivem **só no working copy** de `~/frugal`, branch `onda-q/m1-fechar-o-laboratorio`,
**uncommitted**. Não estão no HEAD desse branch, nem no `main` local, nem no
`origin/main`. Espelhei-os no `SYNC.md` desta worktree para o gate refletir a decisão,
mas o original continua exposto a um `git checkout` distraído.

### R2 — O ciclo que custou US$ 3,8

O goal de demo que **eu** mandei escrever (`termina a dizer "Aguardo a tua aprovação"`)
faz o agente pedir aprovação; o re-despacho corre o **mesmo goal**, logo pede outra vez.
Seis voltas a ~US$ 0,63. **O mecanismo está certo; o goal era patológico.** O pendente
`job-msximo00-e13c` ficou na fila, **silenciado** via `SLACK_IGNORAR_JOBS` (silenciar
≠ decidir: continua na fila e decidível).

### R3 — Tokens com exposição declarada

O ficheiro original chamava-se `SLACK_BOT_TOKEN=xoxb-<dígitos>.txt` e estava em
`OneDrive/Desktop` — **o segredo no NOME, sincronizado para a cloud**. Movi-o para
`.env` (gitignored, verificado com `git check-ignore`), mas o nome já sincronizou e eu
próprio o imprimi num transcript. **Recomendei rodar os dois tokens; ainda não foi feito.**

---

## O PADRÃO QUE ME APANHOU 4 VEZES (o achado mais importante para o produto)

Quatro bugs desta sessão, **todos da mesma família**: o código estava certo, o teste
exercitava outra coisa. Nenhum foi encontrado por revisão minha.

1. `publicar()` construía o cartão e `correr.js` chamava `enviar(texto, p)` **sem o 3.º
   argumento** → o Slack recebia **uma linha**. 168 testes verdes. Descoberto **no
   telemóvel do Paulo**.
2. O teste que escrevi *para esse bug* **replicava** a ligação em vez de a importar →
   repor o bug deixava-o verde. Descoberto por mutação.
3. O fecho do thread olhava para `listPending()`, mas o job que acaba **bem** nunca
   aparece lá → **o caminho feliz era o único não coberto**. Descoberto pelo Paulo a usar.
4. O cartão de decisão publicava sem custo/modelo/impressão → mostrava `n/d` com o
   número **no ledger**. Descoberto no screenshot do Paulo.

**A lição, generalizável:** *uma ligação sem nome é uma ligação sem teste.* O que vivia
inline dentro de `montar()` era intestável por construção — e era exactamente aí que os
bugs estavam. O nº1 é o mais caro de encontrar porque **nada falha; só fica pobre**.

*(Isto merece uma entrada no `LOOP.md`. Não a escrevi — não crio ficheiros sem pedido.)*

---

## 🔀 A PERGUNTA QUE PARTE O PRODUTO EM DOIS (Parte I da auditoria)

O último pedido — «lê o README e **resume em 5 linhas**» — correu, custou **zero**, e o
agente escreveu **1 438 caracteres de resposta**. O Paulo **nunca os viu**. O Slack
disse «Trabalho concluído» e mais nada.

**Não é bug. É a regra a funcionar:** o `publicar.js` só deixa sair campos **derivados**;
a resposta do agente é **conteúdo**. Por construção, este desenho nunca mostra ao dono
aquilo que ele pediu.

| Pedido | Valor está em | O Slack serve? |
|---|---|---|
| «resume / explica / escreve» | no **output** | **Não.** Recebe «concluído» e vai ao PC |
| «arruma os testes / aplica a migração» | na **acção** | **Sim.** Aprova do telemóvel, resultado no repo |

**Isto responde à pergunta que o Paulo fez três vezes («como isso pode ser produtivo?»):**
o Slack é a **cabine de custódia**, não a **janela de trabalho**. Eu dei-lhe goals do
tipo errado para testar — duas vezes — e por isso pareceu vazio.

**Recusei-me a decidir sozinho** se a resposta deve poder sair: é alargar a superfície
de egress que este spike passou o dia a apertar, e já errei 4× no mesmo padrão. As
cinco variantes (I2a–I2e) estão na auditoria.

---

## PENDING

### Bloqueiam o merge (Paulo)

1. **Condição de sócio nº1 do masterprompt: a demo nasce AGENDADA** — data marcada com
   ≥1 estranho **antes** do merge. **Não agendada.** Sem isto o spike não fecha.
2. **Commitar** a linha do destrave (R1).
3. **Rodar os tokens** (R3).
4. **`final-reviewer`** + push/merge — nunca faço sem autorização.

### Decisões de produto (Cowork)

5. **Parte I** — a resposta pode sair? (a única coisa que importa)
6. **Parte H** — progresso vs **cancelar** vs matar os 20s de `prep_timeout`. A minha
   ordenação: cancelar > resposta > latência > progresso. **O Paulo pediu progresso e eu
   estou a responder outra coisa — desmonta-me se achares que estou a fugir ao pedido.**
7. **Demo vs uso diário** — o cartão está optimizado para um estranho; para uso diário
   são 4-5 mensagens por pedido e ruído repetido. Ninguém escolheu qual ganha.

### Achados para o núcleo (não são do spike)

8. **A regex de aprovação do `seamless.js` não ouve português.**
   `(?:preciso|necessito)\s+(?:de\s+)?(?:a\s+tua\s+)?aprovação` aceita `de` mas **não a
   contracção `da`**. «Preciso **da** tua aprovação» — a formulação mais natural — **não
   dispara o pendente**. Verificado com a regex extraída do ficheiro. `seamless.js` é
   núcleo (frozen), não lhe toquei. **Num produto que fala PT-BR, o caminho de aprovação
   dispara muito menos do que se supõe.**
9. **`prep_timeout` de 20s** — expirou em todos os despachos T2/T3 do dia (não no T0).
   São 20 segundos mortos por pedido. `MOOTER_PREP_TIMEOUT_MS` é configurável.

### Higiene (git = Paulo)

10. Worktree `slack-demo` + branch `slack-spike/demo-sandbox` (criei para isolar onde o
    agente escreve).
11. Branch superseded `claude/slack-spike-masterprompt-3fd4e2`.
12. O masterprompt original continua **untracked** em `~/frugal/_handoff/`.

---

## O QUE NÃO ESTÁ PROVADO (`n/d` honesto)

- **STALE num job real** — não é naturalmente alcançável: o estado de um pendente
  **congela** até alguém decidir. Provado contra o broker em dry-run + um ensaio
  rotulado publicado no canal (que o Paulo não chegou a clicar).
- **Clique de terceiro ao vivo** — há **um** humano no workspace. Provado só com duplos.
- **`section.fields` em ecrã estreito** — não documentado pelo Slack.
- **A ordem «varrer antes de formatar»** — não é provável por mutação hoje (nenhum
  formatador cola um caractere de palavra a um valor). Mantida como arquitectura.
- **Tiers de rate limit do `chat.update`/`reactions.add`** — não confirmados nos docs.
- **Teste 2-devices** — nunca corrido. O Paulo pediu aviso prévio e nunca chegámos lá.

---

## 📋 BACK — o que preciso de ti

**Cola no Cowork:** `_handoff/AUDITORIA_SLACK_SPIKE_2026-08-17.md` (426 linhas, 9 partes
A→I). Está escrito para **partir os dentes ao meu trabalho**, não para o confirmar:

- **A** — as 8 afirmações que fiz ao Paulo, cada uma com o comando que a produz
- **B** — o viés que me apanhou 4×; peço que procurem a 5.ª
- **C** — 6 ataques à privacidade, incluindo o risco real dos tokens
- **D** — os números da produtividade (US$ 0,115 vs US$ 0,66 para a mesma tarefa)
- **E** — os `n/d` que declarei, para confirmar ou desmentir
- **F/G** — invariantes do repo e o risco de perda do R1
- **H** — UX: progresso, cancelar, e os 20 segundos
- **I** — **a pergunta que parte o produto em dois**

**A resposta que mais quero:** a Parte I. Se a resposta do agente nunca pode sair, então
o posicionamento do Slack está decidido — e a UI tem de o **dizer**, e os goals de demo
têm de ser do tipo certo. Hoje não diz, e eu escolhi mal duas vezes.

---

`gauntlet: 172/172 · classify.js intacto · 18 commits, 0 uncommitted · US$ 4,4675
medidos · 4 bugs do mesmo padrão declarados · council: n/d (auto-corrido; auditoria
adversarial pedida e por correr)`
