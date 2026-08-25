📥 **COLAR EM:** n/a — documento de saída. Destino real: `_handoff/MOOTER_V131_UX_RUN_HANDOFF_2026-07-25.md` no repo `frugal` (EXISTENTE, árvore principal). Os masterprompts do §8 são para colar em sessões CC novas, um por wave.

```yaml
type: RUN REPORT + UX CRITIQUE + PLAN
id: MOOTER-V131-UXRUN-2026-07-25
gerado_por: Cowork/Opus 5 — sessão de execução do conector v1.3.1 (a sessão que RODOU o prompt)
para: Cowork/Opus 5 — sessão que ESCREVEU o prompt (autora de _handoff/CONECTOR_MOOTER_CRITICA_2026-07-25.md)
método: 22 chamadas reais ao conector + leitura do código do bundle (fleet-ui.html, server-apps.js, seamless.js, telemetry.js, moo.js)
veredicto: ✅ os 3 motores CORREM — W1/W2/W3 aterraram; ❌ mas cada correcção criou um defeito novo, e a thread ficou ilegível
```

# 🐮 v1.3.1 ao vivo — os três motores provaram-se, e o painel multiplicou-se por 22

Este documento responde ao teu `CONECTOR_MOOTER_CRITICA_2026-07-25.md`. Tu escreveste o diagnóstico e o
plano W1→W4; eu fui a sessão que correu o prompt resultante. **Confirmo que W1, W2 e W3 aterraram** — e
trago a factura: cada fix produziu um defeito adjacente, e o Paulo abriu a thread, não percebeu nada, e
disse *"achei que tinha muita informação e acabei ficando perdido"*. Essa frase é o achado principal.

---

## 0. Veredicto por wave que tu planeaste

| Wave | O que pedias | Estado medido hoje | Nota |
|---|---|---|---|
| **W1.1** modelo só dentro da janela | `attachModels` sem timestamp | ✅ **FEITO e melhor** — o modelo já vem do stream do próprio job (`model_source:"stream do job"`), não de sessão vizinha | mentira do Opus fantasma: morta |
| **W1.2** estado `stale` | não existia | ✅ **FEITO** — `stale:false` em todas as leituras | |
| **W1.3** sweeper no boot | não existia | ❌ **NÃO FEITO** — `sweepOrphans()` definido em `seamless.js:115`, chamado **só** em `:627` (via `cancel sweep:true`). O comentário `:93` continua a prometer boot-sweep | o CC apanhou isto sozinho na auditoria |
| **W1.4** `mooter_cancel` com `taskkill /T` | não existia | ✅ **FEITO** — corri `sweep:true`, devolveu 0 órfãos, ledger coerente | |
| **W2.1/2.2** router → `--model` no spawn | desligado | ✅ **FEITO** (`seamless.js:201`) — **e é aqui que nasce o pior bug novo** (§2.1) | |
| **W2.3** Codex ressuscitado | morto por stdin | ✅ **CORRE** — 106 s, exit 0, resultado colhido. `Reading additional input from stdin...` ainda aparece no stderr mas já não pendura | |
| **W2.4** `model_recommended` + `model_used` | não existia | ✅ **FEITO** — e a divergência já é métrica: o `coherence` disse *"router pediu opus e correu qwen2.5:3b"* | exactamente o que pediste |
| **W2 · gate** recibo de poupança medido | "repetir o job em Sonnet e comparar" | ❌ **NÃO ALCANÇADO** — tudo continuou Opus, o Codex devolveu custo `null`, e o `savedUsd` continua negativo em **8/8** sessões | o fosso liga, mas ainda não emite recibo |
| **W3.1/3.2** a vaca | não existia asset | ✅ **FEITO** — SVG inline no `fleet-ui.html:110-124`, com a justificação certa no comentário (CSP default só permite `self` e `data:`) | |
| **W3.3** repaint via `resourceUri` | painel não repintava | ⚠️ **FEITO E EXAGERADO** → 22 painéis empilhados numa thread (§3) | a queixa nova do Paulo nasce daqui |
| **W3.4** cabeçalho com modelo real + tier + custo | não existia | ✅ **FEITO** no código (`fleet-ui.html:245-260`) | |
| **W4** `mooter_work` — uma porta | não existia | ✅ **A TOOL EXISTE** — mas **o prompt não a usou** e eu pilotei à mão com 22 chamadas (§4) | construíste a porta e ninguém entrou por ela |

**Resumo honesto:** subiste de 6/10 para **7.5/10**. O que falta para 9 não é código novo — é **subtrair**.

---

## 1. O que correu, em factos (ledger, não impressão)

Wave `teste-3-motores`, 13:49→13:53Z, 5 jobs despachados, 3 etapas fechadas.

| # | agente | modelo real | estado | dur | tokens in/out | custo |
|---|---|---|---|---|---|---|
| 1 | moo | `opus` ← **mentira** | done, **vazio** | 0 s | n/d | $0 |
| 2 | moo | `qwen2.5:3b` | ✅ done | 2 s | 119 / 231 | $0 |
| 3 | cc | `claude-opus-4-8` | ✅ done | 67 s | 32 256 / 3 846 | $0.9247 |
| 4 | codex | — | ❌ **failed** | 10 s | n/d | n/d |
| 5 | codex | GPT-5 (Codex) | ✅ done | 106 s | 236 871 / 3 640 | **n/d** |

**Prova de valor que funcionou:** o `handoffs[]` registou `qwen2.5:3b (local, $0) → claude-opus-4-8`
com a nota *"preparado localmente ($0) antes de gastar tokens de subscrição"*. **Este é o único momento
da sessão em que o produto se explicou sozinho.** Guarda esta frase — é o núcleo do pitch.

**Plano fechou com `by` real:** `Ollama · local · qwen2.5:3b` · `cc · claude-opus-4-8` · `codex`.

---

## 2. Os defeitos novos — todos com ficheiro:linha

### 2.1 🔴 O router injecta nomes de modelo Anthropic em motores que não são Anthropic

**Este é o bug que W2 criou ao resolver W2.** Antes, o `recommended_model` não chegava ao spawn e o
problema era "o router não decide". Agora chega — **sem tradução por vendor** — e mata o job.

Duas falhas provocadas, ambas na primeira tentativa:

```
moo   → classify.js recomendou "opus"  → Ollama devolveu só a linha de init, 0 s, 0 tokens, exit 0
codex → classify.js recomendou "sonnet" → HTTP 400:
        "The 'sonnet' model is not supported when using Codex with a ChatGPT account."
```

Origem: `seamless.js:196-210` (`buildCommand`) passa `--model <alias>` a **qualquer** binário. O
`classify.js` é FROZEN e só conhece o vocabulário Anthropic — correctamente, não é culpa dele. **Falta a
camada de tradução entre o router e o spawn.**

Agravante de honestidade: o job #1 do `moo` devolveu **exit_code 0** com resultado vazio. Um agente
que não corre e diz "done" é pior que um que falha. O `coherence` marcou-o só como `info`
(*"sem tokens medidos — bundle antigo ou saída não-stream"*), quando devia ser `aviso`.

**Fix:** `cliModelFor(agent, tier)` — um mapa por vendor. `cc → claude-*` · `codex → gpt-*` ·
`moo → o modelo residente que o `/api/ps` reportar` · `gemini → gemini-*`. Sem entrada no mapa →
**não passar `--model` de todo** e deixar o default do CLI, nunca improvisar. E: `exit 0` + `tokens_out
null` num agente local ⇒ marcar `failed`, não `done`.

### 2.2 🔴 `tok/s` é um número que decai a cada leitura

Mesmo job (`job-ms0fegr1-e38c`), quatro leituras seguidas: **116 → 33 → 8 → 3 → 2 tok/s**.

Causa: `telemetry.js:240-246` (`withRate`) faz `tokens_out / elapsedSeconds`, e o `elapsedSeconds` que
lhe chega continua a ser **wall-clock desde o arranque**, mesmo depois do job fechar. Quanto mais tarde
lês, mais lento o job parece ter sido.

**Fix:** congelar `tok_s` no evento `done` usando `duration_s`, e nunca recalcular. Se o job está vivo,
calcular sobre a janela desde o primeiro token, não desde o spawn (o carregamento do modelo não é
geração). Alternativa defensável: **remover `tok/s` do painel** — não é uma decisão que o vibe coder
tome, e um número instável destrói a confiança em todos os outros.

### 2.3 🔴 Dois custos diferentes para o mesmo job

| Fonte | Valor |
|---|---|
| ledger / `mooter_collect` (job `job-ms0feulk-4fa6`) | **$0.9247** |
| `mooter_sessions_list` (sessão `b46186f8`, a mesma) | **$1.3909** |

Ambos apresentados pelo mesmo conector, no mesmo minuto. Um deles está errado e o painel não diz qual.
**Fix:** uma só fonte de verdade (o ledger), e `sessions_list` deixa de reportar `costUsd` ou reporta-o
etiquetado como *"acumulado da sessão CC, inclui turnos fora do job"*.

### 2.4 🟠 `savedUsd` negativo em 8 de 8 sessões

`-0.876` · `-1.668` · `-2.369` · `-1.547` · `-2.403` · `-4.514` · `-1.457` · `-2.862`.

Tu já documentaste a causa (`moo.js:8`, `seamless.js:183`): a baseline é all-Opus e tudo *é* Opus.
Mas o número **continua exposto** na saída do conector. Um produto cujo argumento é poupança a mostrar
poupança negativa em 100% dos casos é pior que não mostrar nada.

**Fix:** esconder `savedUsd` até a baseline ser real. Quando W2 emitir o primeiro recibo medido
(mesmo masterprompt em dois tiers), aí sim.

### 2.5 🟠 `sessions_list` está poluída na origem

8 sessões, **todas com o mesmo título**: `"Lê o ficheiro C:\Users\Paulo Loureiro\.mooter\jobs\j"`.

Causa exacta: `seamless.js:173-175`, `bootstrapPrompt()` — o CLI é apontado ao ficheiro do masterprompt,
e o CC deriva o título da sessão da primeira linha do prompt. Toda a frota fica indistinguível.

Pior: **3 estão marcadas `needs_you`** quando são jobs headless já terminados. Se o painel destacar
"3 sessões precisam de ti", o Paulo vai procurar três coisas que não existem.

**Fix:** injectar `# <wave> · <step> · <objetivo em 6 palavras>` como primeira linha do bootstrap; e
`needs_you` nunca se aplica a sessões cujo `job_id` esteja em estado terminal no ledger.

### 2.6 🔴 `allowedTools` é silenciosamente ignorado no Codex

Eu passei `allowedTools:"Read"`. O conector aceitou sem aviso. Mas `seamless.js:204-207` constrói:

```js
['exec', boot, '--json', '--sandbox', 'workspace-write', '--output-last-message', outFile]
```

`allowedTools` **não é lido** no ramo do Codex, e o sandbox é `workspace-write`. A única coisa que
impediu uma escrita foi a **prosa** do masterprompt (`❌ NÃO escrevas`). Isso não é um guard, é um pedido.

**Fix (P0 de segurança):** se `allowedTools` não for honrável pelo motor, **recusar o dispatch** com a
razão — a constituição do Mooter diz que o guard valida primeiro. E mapear `allowedTools:"Read"` →
`--sandbox read-only` no Codex.

### 2.7 🟡 Ruído de ambiente disfarçado de erro do Mooter

O `stderr_tail` de todos os jobs Codex traz:

```
failed to load skill ...\systematic-debugging\SKILL.md: missing YAML frontmatter delimited by ---
worker quit with fatal: ... AuthRequired ... mcp.vercel.com
```

Nenhum dos dois tem que ver com o Mooter (skill do Paulo mal formada; MCP Vercel sem OAuth). Mas
aparecem no relatório do job e fazem o conector parecer partido. **Fix:** filtrar do `stderr_tail`
linhas cuja origem não seja o processo do job, ou agrupá-las sob `ambiente (não é do job)`.

---

## 3. 🔴 A queixa do Paulo — causa raiz encontrada, e é irónica

> *"me parece que rodou muitos prompts e várias threads do mooter e me parece meio poluído e coisas
> demais… acabei ficando perdido"*

**Não foram várias threads. Foi uma thread com 22 instâncias do mesmo painel.**

`server-apps.js:183`:

```js
const REPAINT_TOOLS = new Set(['mooter_dispatch','mooter_status','mooter_collect',
                               'mooter_work','mooter_cancel','mooter_plan','mooter_journal']);
```

`server-apps.js:269` cola `_meta.ui.resourceUri` ao resultado de **cada** uma. O comentário `:258-264`
explica a intenção — que é a tua W3.3, e era correcta:

> *"In v1.1 only mooter_fleet carried the UI resource, so during a dispatch → status → collect loop the
> panel simply never refreshed: the user watched a static card while an agent worked for three minutes."*

O problema: no host, **cada `tools/call` com `resourceUri` gera um widget novo na conversa**, não um
repaint do anterior. Contagem desta sessão:

| tool | chamadas | painéis |
|---|---|---|
| `mooter_cancel` | 1 | 1 |
| `mooter_fleet` | 2 | 2 |
| `mooter_plan` | 2 | 2 |
| `mooter_dispatch` | 5 | 5 |
| `mooter_status` | 7 | 7 |
| `mooter_collect` | 4 | 4 |
| `mooter_journal` | 1 | 1 |
| | | **22** |

**E o mais importante: o repaint nunca foi necessário.** O `fleet-ui.html:495-510` já faz polling
sozinho — `schedule(liveNow() ? 2000 : 4000)`. O painel actualiza-se de 2 em 2 segundos enquanto houver
job vivo. A W3.3 resolveu um problema que o polling já resolvia, e pagou com 21 painéis fantasma.

Isto encaixa exactamente no que tu própria escreveste no §5 do teu doc: *"o padrão dispatch devolve
job_id + painel polla de 3 s é, por acidente, a decisão de arquitectura correcta. Não mexer nisso."*
**Tinhas razão. A W3.3 mexeu.**

### Fix — 3 linhas, reversível

```js
// ÂNCORA: só a PRIMEIRA tool call de uma wave carrega o painel. O painel vive e polla.
const ANCHOR_TOOLS = new Set(['mooter_work', 'mooter_fleet']);
// e, para o loop: apenas se ainda não houver painel ancorado nesta wave
```

Regra de produto a escrever no `AGENTS.md`: **um painel por wave, não um painel por chamada.** O painel
é um *lugar*, não uma *mensagem*.

---

## 4. 🎯 O que faltou para o vibe coder ficar impressionado

Esta é a parte que o Paulo pediu explicitamente. Vou ser directo: **a sessão provou a engenharia e
falhou a experiência.**

### 4.1 A porta certa existe e ninguém a usou

Tu construíste `mooter_work` — *"ONE DOOR: give it a goal in plain language and it does the rest"*. O
prompt desta sessão não lhe tocou. Em vez disso mandou-me escrever, à mão:

`mooter_plan(set)` → `mooter_dispatch(agent, wave, step, worktree, allowedTools, handoff_from,
masterprompt)` × 5 → `mooter_status` × 7 → `mooter_collect` × 4 → `mooter_plan(get)`.

Um vibe coder não sabe o que é `worktree`, `wave`, `step`, `allowedTools` nem `handoff_from`. **Sete
parâmetros para pedir uma auditoria de um ficheiro.** A demo que devia impressionar mostrou o painel
de controlo de um avião a alguém que só queria chegar ao Porto.

**A demo certa é uma linha:**

```
mooter_work goal:"audita o seamless.js e diz-me o que está mais frágil"
```

…e o conector escolhe tier, motor, worktree, escreve o cabeçalho ⇄, prepara o briefing na GPU local
a $0, passa a bola ao Opus, e mostra **um** painel a andar. Tudo o resto que eu fiz foi trabalho que
a máquina devia ter feito.

### 4.2 Faltou o `mooter_await` — eu dormi 3 minutos em `bash sleep`

Para acompanhar a wave tive de fazer `sleep 40` no shell, quatro vezes, porque o `mooter_status` é
pontual. Isso é uma coreografia ridícula para um produto cuja tese é *"o vibe coder não estuda"*.

**Falta:** `mooter_await(wave, timeout_s)` — bloqueia até a wave fechar (ou até ao timeout) e devolve
o sumário final. Uma chamada em vez de sete. E como o host não manda `progressToken` (issue #58687,
que tu documentaste), o `await` do lado do servidor é **exactamente** o contorno certo: o servidor
espera, o painel polla, o chat fica limpo.

### 4.3 O chat devia ler-se como prosa, o painel é que é o cockpit

O `humanLine()` (`server-apps.js:189`) já existe e é bom — *"🐮 despachado job-x → opus (T3, pelo
classify.js)"*. Mas é **prefixado ao JSON**, não substitui o JSON. Resultado: o Paulo vê a frase bonita
e a seguir 4 KB de estrutura.

**Fix:** `content[0].text` = só a `humanLine`. O JSON vive em `structuredContent`, que é para o modelo
e para o painel, não para os olhos dele.

### 4.4 A evolução deve ler-se como uma fita, não como cartões repetidos

O Paulo pediu *"algo de uma thread que fica mais estática e mostrando a evolução de forma mais elegante"*.
O `planBlock()` (`fleet-ui.html:283-302`) **já é isso** — etapas, ✓/✕/○, quem fez, risco, custo. É a
melhor peça de UI do bundle. Só que está enterrada debaixo de `Handoffs`, `A trabalhar`, `Concluídas`,
GPU, VRAM, modelos residentes, rodapé e `coherence` — **oito secções** num painel de chat.

**Fix de hierarquia (inline vs fullscreen):**

| Modo | Mostra |
|---|---|
| **inline** (default) | cabeçalho 🐮 + wave + **a fita de etapas** + 1 linha de rodapé (`$ · local% · ⚠ n`) |
| **fullscreen** (clique) | tudo o resto: jobs, GPU, VRAM, modelos, handoffs, coerência |

O `appCapabilities.availableDisplayModes` já declara `['inline','fullscreen']` (`fleet-ui.html:132`).
A capacidade está lá; falta usá-la para **esconder**, que é o trabalho difícil do design.

### 4.5 Os três momentos "wow" que o produto já tem e não destaca

1. **`qwen2.5:3b → claude-opus-4-8` · $0 de preparação.** É o fosso, visível, numa linha. Devia ser a
   coisa mais gorda do painel; hoje é uma linha de 11.5px entre duas secções.
2. **O painel a auto-auditar-se** — *"router pediu opus e correu qwen2.5:3b"*. Nenhum concorrente faz
   isto. É a prova viva do *"never fabricating metrics"* do CLAUDE.md.
3. **A GPU com folga a oferecer trabalho** — o botão *"Aproveitar a folga"* (`fleet-ui.html:412`) é
   genuinamente bom: o produto vê 17 GB parados e propõe usá-los.

Nenhum dos três apareceu na resposta que o Paulo leu, porque estavam afogados em 22 painéis.

---

## 5. Crítica ao prompt que me deste (para a próxima)

Justiça primeiro — **isto funcionou muito bem** e deve manter-se:

- ❌ negativos explícitos (`não despaches`, `zero git`, `não toques em classify.js`) — respeitei todos
- `"se algo falhar 2× seguidas, PARA e diz o erro literal"` — foi o que me deu licença para recuperar
  uma vez e reportar em vez de insistir. Regra excelente, manter.
- `"n/d — não contornes"` — impediu-me de inventar. Manter, sempre.
- gates numerados e uma tabela final obrigatória — deu-lhe algo para ler no fim.

O que o tornou pesado:

| Problema | Efeito medido | Regra nova |
|---|---|---|
| pediu-me para **olhar ao painel** (3 das 7 perguntas) | 3 respostas `n/d` **por desenho** — eu não vejo o render | nunca pedir ao Cowork para descrever a UI; pedir os **dados que a alimentam** (`totals`, `handoffs[]`, `coherence`) |
| 5 secções + 7 perguntas + tabela + 2 perguntas de painel | 22 chamadas, ~7 min, resposta longa demais | **um objectivo por prompt**; a bateria de verificação é outra sessão |
| ditou as chamadas exactas (`mooter_plan action:"set"…`) | não usou `mooter_work`, a tool que o produto quer provar | pedir o **resultado**, não o percurso — e deixar o conector escolher a porta |
| pediu polling de 60 s | `bash sleep` × 4 | esperar por `mooter_await` (§4.2) |

---

## 6. ❌ O que NÃO fazer a seguir

| ❌ | Razão |
|---|---|
| adicionar mais dados ao painel | o problema é **excesso**, não falta. A próxima wave é de subtracção |
| implementar `notifications/progress` | continua verdade — issue #58687 aberto, host não manda `progressToken` |
| tocar em `classify.js` | FROZEN, sha `427d8c0b…364bc48f`. **Nada aqui precisa** — a tradução de modelo é *depois* do router, não dentro |
| tirar o polling do painel | é a arquitectura certa para este host (tu provaste-o no §5 do teu doc) |
| corrigir o `savedUsd` com nova fórmula contrafactual | não se corrige uma baseline inventada com outra. **Esconder** até haver medição A/B real |
| repetir a bateria de 7 perguntas | metade não é respondível pelo Cowork por construção |

---

## 7. BOARD

| Item | Estado | Próxima acção |
|---|---|---|
| 3 motores end-to-end | ✅ **provado** — moo + cc + codex, exit 0 | — |
| Handoff local→cloud com prova | ✅ registado com nota de $0 | destacar no painel (W5.2) |
| Modelo real por job | ✅ resolvido (`stream do job`) | — |
| Codex | ✅ **vivo**, 106 s, exit 0 | ainda sem custo → W6.3 |
| Tradução de modelo por vendor | 🔴 **causa dos 2 falhanços de hoje** | 🔥 W5.1 |
| `allowedTools` no Codex | 🔴 ignorado, sandbox `workspace-write` | 🔥 W5.4 — segurança |
| 22 painéis por thread | 🔴 **queixa nº1 do Paulo** | 🔥 W5.3 — 3 linhas |
| `tok/s` decrescente | 🟠 número que mente | W6.1 |
| Custo em duplicado ($0.92 vs $1.39) | 🟠 duas fontes | W6.2 |
| `savedUsd` negativo 8/8 | 🟠 exposto | W6.4 — esconder |
| Sweeper no boot | 🔴 **W1.3 nunca aterrou** | W5.5 |
| Títulos de sessão idênticos | 🟡 8/8 iguais | W6.5 |
| `mooter_work` como porta única | 🟡 existe, **por usar** | W7 — a demo |
| `mooter_await` | ❌ não existe | W7.2 |
| Hierarquia inline vs fullscreen | ❌ 8 secções inline | W7.3 |

🤝 **SOCIO:** receita? **S** — a W7 (uma porta + uma fita + um painel) é o que se demonstra a alguém;
o resto é higiene · despesa↓? **S** — a W5.1 impede jobs que morrem depois de pagar tokens de arranque ·
risco↓? **S** — a W5.4 é uma falha de segurança real: eu pedi read-only e corri com permissão de escrita ·
reversível? **S** — nada aqui é destrutivo · escopo? **S** — zero toques em `classify.js` e em `packages/*` frozen.

⚠️ **Dívida herdada do teu doc, ainda por confirmar:** *"`fleet.js`, `fleet-ui.html`, `server-apps.js` e
`manifest.json` NÃO estão em git"*. Eu li estes ficheiros na árvore principal e estão lá com mtime de
hoje 09:57-10:41 — mas **não verifiquei o estado git** (proibição de git nesta sessão). Confirmar
nativamente antes de qualquer wave: se o bundle que corre continua a divergir do repo, os testes
continuam a não cobrir o código que corre.

---

## 8. Ordem recomendada

**W5 · PARAR DE MAGOAR (1-2 h)** — os 3 fixes que o Paulo sente hoje
1. `cliModelFor(agent, tier)` — tradução de modelo por vendor; sem entrada no mapa ⇒ não passar `--model`.
2. `exit 0` + `tokens_out null` num agente local ⇒ `failed`, e `coherence` a nível `aviso`.
3. `ANCHOR_TOOLS` — um painel por wave, não por chamada.
4. `allowedTools:"Read"` ⇒ `--sandbox read-only` no Codex; se não for honrável, **recusar o dispatch**.
5. `sweepOrphans()` chamado no boot (a W1.3 que ficou por fazer).
**Gate:** repetir *exactamente* a wave `teste-3-motores` — 3 dispatches, **zero** falhas de modelo,
**um** painel na thread.

**W6 · UM SÓ NÚMERO POR FACTO (1-2 h)**
1. `tok_s` congelado no `done`, calculado sobre `duration_s`.
2. custo só do ledger; `sessions_list` deixa de reportar `costUsd`.
3. custo do Codex extraído do stream (hoje `null` ⇒ totais da wave subestimados).
4. `savedUsd` escondido até haver medição A/B.
5. título de sessão = `# <wave> · <step> · <objetivo>`; `needs_you` nunca para job terminal.
**Gate:** o mesmo job lido 5× seguidas devolve os **mesmos** números.

**W7 · A DEMO (2-3 h)** — a wave que se mostra a alguém
1. `mooter_work` como caminho único documentado; `dispatch` passa a ser a porta de serviço.
2. `mooter_await(wave, timeout_s)` — uma chamada em vez de sete.
3. painel inline = 🐮 + wave + **fita de etapas** + rodapé de 1 linha; tudo o resto em fullscreen.
4. `content[0].text` = só a `humanLine`; JSON só em `structuredContent`.
5. o handoff `$0 → cloud` promovido a elemento de destaque.
**Gate do amigo:** alguém que nunca viu o Mooter escreve *uma* frase, e ao fim de 2 minutos consegue
dizer em voz alta o que correu, quem fez, quanto custou e o que a GPU poupou — **sem fazer scroll**.

📮 **DESTINO:** sessão Cowork que escreveu o prompt (alinhar W5→W7 com o teu W1→W4) → depois Paulo
(escolher a ordem) → sessões CC, **uma wave por sessão**.
