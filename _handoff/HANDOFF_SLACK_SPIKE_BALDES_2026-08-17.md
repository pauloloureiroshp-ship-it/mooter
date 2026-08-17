⇄ CC → COWORK · slack-spike · FECHO DOS BALDES 1 e 2 · 2026-08-17

TL;DR:    18 unpushed · 0 uncommitted · 172/172 · Balde 1 ✅ (grátis) · Balde 2 ✅ · Balde 3 à ordem
GOAL:     provar que um estranho vê custódia real sobre trabalho de agentes
INTENT:   `_handoff/MASTERPROMPT_SLACK_SPIKE_FECHO_2026-08-17.md` · 6545 bytes ·
          sha256 `b0fcf049b4de46bc…b9a1` ✅ verificado antes de agir

🎯 A ÚNICA COISA: **dizer «manda a auditoria»** — o 3a é a porta de todo o Balde 3, e é
   um dispatch pago a vendor externo que não faço sem palavra tua.

---

## ACK [medido] — 5/5, zero divergências

| # | Verificado | Medido |
|---|---|---|
| 1 | `HEAD` = `29ace5ee` · 18 ahead | ✅ `29ace5ee` · 18 |
| 2 | 172/172 | ✅ 172 pass · 0 fail |
| 3 | daemon a ouvir, com que código | ✅ a ouvir, **em `29ace5ee`** (já inclui o fix de fecho `e4b4852a`) |
| 4 | `SYNC.md` de `~/frugal` modificado? | ⚠️ era `M` → **agora committed** (ver Balde 2) |
| 5 | `e13c` silenciado e intacto | ✅ na fila, silenciado no arranque |

---

## STATE

| | |
|---|---|
| **Worktree do spike** | `.claude/worktrees/slack-spike-masterprompt-82c108` |
| **Branch** | `claude/slack-spike-masterprompt-82c108` @ `29ace5ee` |
| **unpushed / uncommitted** | **18 / 0** |
| **`~/frugal`** | `349f0037` · `onda-q/m1-fechar-o-laboratorio` · **autorização segura** |
| **Testes** | **172/172** · 22 ficheiros `.js` no pacote |
| **`classify.js`** | `427d8c0b516315c6…` — **INTACTO** |
| **Custo da frente** | **US$ 4,4675** · 17 jobs · 1 grátis (local) |
| **Push** | **nenhum** |

---

## WORK

### ✅ BALDE 1 — VER A MAGIA · **passou, e de graça**

**Divergência do plano, declarada:** o passo 1 mandava reiniciar o daemon com o fix.
**Não reiniciei** — o daemon vivo já corria em `29ace5ee`, que inclui o fix (`e4b4852a`).
Reiniciar só perderia o `SLACK_IGNORAR_JOBS` e arriscaria republicar o `e13c`, o oposto
do que o balde manda. C5 aplicado: o campo mandou.

O critério de sucesso já estava cumprido, com o dono a ver o `🏁` no ecrã:

```
19:33:17  dispatched · agent=moo · actor={human, slack:U0BGS8N8JFL, origem:slack}
19:33:37  done · exit=0 · modelo=gemma4:e4b · custo=0 · tier=T0
DURAÇÃO: 19,8s · prep_timeout: NÃO
[registo] {"tipo":"fecho_publicado","job":"job-msxmsv76-30f8","estado":"concluido"}
```

**Duas divergências do previsto, ambas a favor:**

| Previsto | Medido |
|---|---|
| `~US$ 0,11` | **US$ 0,00** — correu na GPU do dono (`gemma4:e4b`, T0) |
| `~20s` de `prep_timeout` | **zero** — o T0 local não passa pela preparação |

**Consequência para o Balde 3b:** «matar os 20s de `prep_timeout`» é **mais estreito do
que parecia**. O T0 local não os tem. Os 20s só aparecem quando o router escolhe T2/T3 e
a preparação local expira antes de o motor «ir directo». Sugiro reformular a tarefa de
*«matar o prep no caminho Slack»* para *«matar o prep quando o tier resolvido não é T0»* —
mas é decisão tua, e não a tomei.

### ✅ BALDE 2 — NÃO PERDER O DIA · **fechado**

`349f0037` · `onda-q/m1-fechar-o-laboratorio` · `SYNC.md` **+31 linhas** · add selectivo ·
sem push. Verificado: `git status --porcelain SYNC.md` vazio.

Ficou protegida a linha canónica de destrave, o bloco GO CONDICIONADO com o fundamento, e
os teus veredictos (D3 SIM · H2 barra RECUSADA · H3 cancelar>progresso · H5 sinais
honestos · prep_timeout matar-não-decorar · H1 assistant-surface documentada).

**Obstáculo que devo declarar:** havia um `.git/index.lock` de 3 horas no `~/frugal`, 0
bytes, zero processos git a correr. **Era detrito meu** — às 17:54Z um comando meu com
backticks mal escapados correu `git worktree remove\'` naquele repo. Removi-o (é o que o
próprio git manda nesse caso) e commitei. Mexer em `.git/` não fica num rodapé.

### ⏸ BALDE 3 — preparado, **não iniciado**

Respeitei o «só depois». **3a é a porta e está à tua ordem.**

---

## PENDING

### Q1 · para ti, e é a única coisa que trava tudo

**Despacho a auditoria ao codex?** O 3a autoriza-o explicitamente. Duas coisas que quero
em cima da mesa antes de premir, e por isso não premi:

1. É **dispatch pago** a vendor externo (Codex/ChatGPT) e o documento (17 KB) leva
   caminhos, nomes de ficheiros e a descrição das 4 barreiras de egress. Depois de um dia
   inteiro a apertar egress, não mando isso para fora sem palavra explícita.
2. Volta com um veredicto que **anexo sem filtrar**, incluindo se me desmentir.

**Diz «manda a auditoria» e despacho.** Alternativa se preferires: cortar as partes com
caminhos absolutos antes de enviar — mas isso enfraquece a auditoria (a Parte A vive dos
comandos reprodutíveis), por isso não recomendo.

### Bloqueiam o merge (4 gates, todos fechados)

1. **Demo AGENDADA com ≥1 estranho** — **não agendada**. É o único gate que não depende de
   código nenhum, e é o que impede o spike de fechar. Do dono.
2. Auditoria do codex sem ALTO em aberto → depende do Q1.
3. Tokens rodados (o dono regenera no Slack; o Cowork re-injecta) + autorização committed
   → **metade feita** (autorização ✅ no `349f0037`; rotação ✗).
4. `final-reviewer` verde → por correr.

### Balde 3, por ordem, depois do 3a

- **3b** — só o que o codex marcar ALTO + as 3 decisões aprovadas: **botão Parar** (ligado
  a `mooter_cancel`, com o **mesmo CAS/anti-stale do Aprovar**) · **matar os 20s** (ver a
  reformulação acima) · **sinais honestos H5** (reacção ⏳→✅/❌ · heartbeat só-se-demorar
  com números reais · suprimir o push da msg de estado)
- **3c** rotação dos tokens · **3d** ensaio do infeliz contra o Slack **real** ·
  **3e** 2-devices (avisar o dono ANTES) · **3f** final-reviewer

### Achados para o núcleo (não são do spike, `seamless.js` é frozen)

- **A regex de aprovação não ouve português.** `(?:preciso|necessito)\s+(?:de\s+)?(?:a\s+tua\s+)?aprovação`
  aceita `de` mas **não a contracção `da`**. «Preciso **da** tua aprovação» — a forma mais
  natural — **não dispara o pendente**. Verificado com a regex extraída do ficheiro. Num
  produto que fala PT-BR, o caminho de aprovação dispara muito menos do que se supõe.
- **`prep_timeout` 20s** — não é universal: T0 local não passa por lá (medido hoje).

---

## RISK

| | |
|---|---|
| **A autorização** | ✅ **fechado** pelo Balde 2 (`349f0037`) |
| **`~/frugal` tem 426 ficheiros dirty** | não são meus — só toquei em `SYNC.md`. Mas é uma árvore muito suja para um repo que guarda a autorização desta frente. **Não é meu para limpar; fica declarado.** |
| **`e13c`** | intacto, silenciado, **na fila**. Silenciar ≠ decidir. Custa ~US$ 0,63 e re-pede se alguém clicar |
| **18 commits só no disco** | sem push, por desenho. Se a máquina morrer hoje, morre a frente inteira |

---

## `n/d` — o que NÃO está provado

- **STALE num job real** — não é naturalmente alcançável: o estado de um pendente
  **congela** até alguém decidir. Provado em dry-run + um ensaio rotulado publicado no
  canal que o dono não clicou.
- **Clique de terceiro ao vivo** — há **um** humano no workspace.
- **2-devices** — nunca corrido.
- **Ensaio do infeliz contra o Slack real** — 3d, por fazer.
- **`section.fields` em ecrã estreito** e **tiers de rate-limit do `chat.update`/`reactions.add`**
  — não documentados / não confirmados.
- **Custo total da sessão de CC** (tokens do Claude Code) — `n/d`, não há fonte fiável na
  máquina. Os **US$ 4,4675** são só os jobs despachados, com `cost_usd` e fonte colada.

---

## DECISIONS (verbatim, `handoff:qa --sid`, zero LLM)

**1 pergunta, 1 ronda** em toda a sessão: a dos dois ids do Slack (`SLACK_CANAL` /
`SLACK_ALLOW_USER_ID`), com as duas opções inteiras — «colar os ids (menor privilégio)»
vs «dar `channels:read`+`users:read` e reinstalar». **O dono escolheu a 1:** *«opção 1 mas
segue pra ajudar na evolução»* + os dois ids.

Tudo o mais foi decisão minha com a razão no commit — e é por isso que peço a auditoria.

---

## 📋 BACK — o que preciso de ti

1. **«manda a auditoria»** (ou o contrário, com a razão) — destranca o Balde 3 inteiro.
2. **Um veredicto sobre a reformulação dos 20s** (matar o prep quando o tier ≠ T0, em vez
   de «no caminho Slack»), porque o medido de hoje mudou o âmbito da tarefa.
3. **A data da demo.** É o gate nº1 e não depende de código. Enquanto não existir, tudo o
   que eu fizer no Balde 3 é preparação para uma coisa sem data.

---
`gauntlet: ACK 5/5 medido · Balde 1 ✅ (US$ 0,00, T0 local, 19,8s, fecho no ledger) ·
Balde 2 ✅ (349f0037) · Balde 3 não iniciado por desenho · 1 divergência de plano
declarada (não reiniciei o daemon: já corria o fix) · 1 obstáculo declarado (index.lock,
detrito meu) · 4 gates de merge fechados · autor≠crítico ainda por cumprir → 3a`
