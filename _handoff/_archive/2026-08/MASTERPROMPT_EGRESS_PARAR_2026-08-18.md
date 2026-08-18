# MASTERPROMPT — slack-spike: fechar o egress ao nível dos VALORES e pôr o Parar/heartbeat no caminho real

**Criado:** 2026-08-18 · **Origem:** COW · desenho por Fable 5 (leu o código e reproduziu as provas) · **Motivo:** auditoria adversarial do codex (`job-msyi3rky-bd37`) devolveu 4 ALTO.
**Para:** agente executor (codex) com permissão de escrita.
**Âmbito:** apenas `packages/slack-spike/` do worktree `slack-spike-masterprompt-82c108`.
**Língua do código e testes:** português de Portugal, no estilo já existente (comentários que dizem PORQUÊ, nunca só o quê).

## Contexto que não podes esquecer

`slack-spike` é uma cabine de custódia: o agente trabalha na máquina do dono; o Slack só AUTORIZA, PÁRA e MOSTRA O CUSTO. A promessa que vende o produto é **por construção**: o conteúdo do trabalho nunca sai da máquina — só decisões e metadados. Uma auditoria adversarial provou que hoje a promessa é falsa em dois sítios (ALTO 1 e ALTO 2 abaixo). É um spike throwaway (morre 2026-09-16), 1 workspace, 1 canal, **zero dependências** (Node nativo + `node --test`).

Este código já foi mordido **quatro vezes** pelo mesmo viés: testes que exercitam uma CÓPIA do padrão em vez do código real. O teu trabalho ataca o viés, não só os sintomas — a secção 4 é tão obrigatória como as correcções.

---

## 0 · BLOCO ACK — corre ANTES de tocar em qualquer ficheiro

Corre os cinco comandos a partir da **raiz do repo**. Se QUALQUER resultado divergir do esperado, escreve o que viste em `_handoff/ACK-DIVERGENCIA.md` e **PÁRA** — não implementes um plano cujo campo não bate.

```bash
# ACK-1 · Node >= 22
node --version

# ACK-2 · a prova do ALTO 1 (hoje: publicado=true e 7 canarios)
node -e 'const {criarPublicador}=require("./packages/slack-spike/publicar.js");const p={tipo:"pendente",job_id:"job-CANARY_PRIVATE",wave:"CANARY_PRIVATE_WAVE",autor:{valor:"CANARY_PRIVATE_AUTHOR"},motor:{valor:"cc"},modelo:{valor:"claude-haiku-4-5"},custo:{valor:0,fonte:"inferencia local sem custo de API"},hash_esperado:"CANARY_PRIVATE_HASH",accoes:["aprovar"]};const r=criarPublicador({dryRun:true}).publicar(p);console.log(r.publicado,JSON.stringify(r.blocos).match(/CANARY_[A-Z_]+/g))'
# esperado HOJE: `true [ 'CANARY_PRIVATE_WAVE', ... ]` (7 entradas).
# Se sair `false ...` ou `true null`, o ALTO 1 ja foi corrigido por outrem: escreve e para.

# ACK-3 · a prova do ALTO 2 (hoje: botao_parar:false e heartbeat recusado)
node -e '
const {criarPublicador}=require("./packages/slack-spike/publicar.js");
const {criarAdaptador}=require("./packages/slack-spike/adapter.js");
const {criarAllowlist}=require("./packages/slack-spike/allowlist.js");
const broker=require("./packages/mooter-bridge/broker.js");
const saidas=[];
const pub=criarPublicador({enviar:(t,p,b)=>{saidas.push({t,b});return{ok:true}}});
const ad=criarAdaptador({allowlist:criarAllowlist(["U_P"]),publicador:pub,broker,despachar:async()=>({job_id:"job-x"}),lerEventos:()=>[]});
ad.receberMencao({user_id:"U_P",texto:"faz uma coisa"}).then(()=>{
  console.log("botao_parar:", /mooter_parar/.test(JSON.stringify(saidas)));
  console.log("heartbeat:", JSON.stringify(pub.publicar({tipo:"estado",job_id:"job-x",passos:3,segundos:70}).porque));
});'
# esperado HOJE: `botao_parar: false` e `heartbeat: "campo(s) fora da allowlist de publicacao: passos, segundos ..."`

# ACK-4 · o nucleo da o que o plano precisa (NAO se toca no nucleo)
node -e 'const b=require("./packages/mooter-bridge/broker.js");console.log("estadoDoJob:",typeof b.estadoDoJob);console.log("JOB_ID_VALIDO:",b.JOB_ID_VALIDO)'
# esperado: `estadoDoJob: function` e `JOB_ID_VALIDO: /^(?!\.+$)[A-Za-z0-9._-]+$/`
node -e 'const p=require("./tools/router/ledger-prov.js");const h=p.provHash({a:1});console.log(/^[a-f0-9]{64}$/.test(h),h.length)'
# esperado: `true 64` — o state_hash e SHA-256 hex de 64 chars.

# ACK-5 · NAO CORRAS ISTO. Ler a nota abaixo.
```

### ⚠️ ACK-5 REVOGADO — o teu sandbox nao consegue correr testes

Uma primeira tentativa deste masterprompt (`job-msyizmqq-d78e`) parou aqui, correctamente: `node --test`
rebenta com `EPERM` no syscall `spawn` dentro do teu sandbox. **Isso nao e divergencia do campo — e um
limite teu.** Nao voltes a parar por causa disto, e nao registes ACK-DIVERGENCIA por este motivo.

A linha de base ja foi MEDIDA por quem te despacha, num clone limpo em Linux + Node 22.22.3
(o mesmo ambiente do `ubuntu-latest` do CI):

```
packages/slack-spike:  251 testes · 251 pass · 0 fail · 4,07s
```

E a prova RED do ALTO 1 tambem ja foi medida por quem te despacha, hoje, com o comando do ACK-2:
`publicado: true` e **7 canarios** a atravessar (`CANARY_PRIVATE_WAVE`, `CANARY_PRIVATE_AUTHOR`,
`CANARY_PRIVATE_HASH`, `CANARY_PRIVATE`, `CANARY_PRIVATE_HASH`, `CANARY_PRIVA`, `CANARY_PRIVATE`).

**A divisao de trabalho passa a ser esta, e e mais forte do que a anterior:**
- **Tu escreves** o codigo e os testes. Le, raciocina, implementa.
- **Quem te despacha corre** a suite num runner a serio e produz as provas vermelho->verde.
- **Tu NAO declaras nenhum teste como verde.** Onde o criterio de aceitacao pedir uma execucao,
  escreve `n/d — sandbox sem spawn; execucao delegada ao despachante`. Um PASS que nao viste
  e exactamente o viés que este masterprompt existe para matar. Declarar verde sem correr seria
  a QUINTA instancia.
- No fim, escreve `_handoff/O-QUE-FALTA-CORRER.md` com a lista exacta dos comandos que o
  despachante tem de correr para fechar cada prova.

Se o ACK-2 ou o ACK-3 divergirem do esperado, ai sim: escreve e para.

**Correcção registada à auditoria** (para não repetires o erro dela ao contrário): a barreira 4 de `publicar.js:185-204` **recusa** strings acima de `LIMITE_SECTION` (300), não as trunca. O efeito prático para canários curtos é o mesmo — passam — mas descreve-a correctamente nos comentários que escreveres. De resto, a auditoria está confirmada ponto por ponto por execução.

---

## 1 · ALTO 1 — a allowlist de VALORES (barreira 2b)

### O problema exacto
`publicar.js:149-155` valida só **nomes** de campo ao nível do topo. `publicar.js:80` permite `wave`, `autor`, `hash_esperado`, `texto`... cujos **valores** são texto livre. A barreira 4 só apanha prosa longa. Resultado: qualquer chamador (ou qualquer valor vindo do ledger) mete conteúdo curto num campo permitido e ele sai. Agrava: `cartao.js:174-178` (`mencaoDeActor`) ecoa o valor **cru** quando não casa com `slack:U...`, e `publicar.js:215` entrega o payload **original** (`p`, não normalizado) ao transporte.

### O desenho — três classes de campo, nenhuma delas "aperta o limite de chars"

Cria **um** ficheiro novo, `packages/slack-spike/esquema.js` (puro, zero deps, tudo `Object.freeze`), com um `validar(payload) -> { ok, payload, degradados, porque }`, chamado em `publicar.js` **entre a barreira 2 e a barreira 3** (nova barreira 2b). O `payload` devolvido é **reconstruído** campo a campo — nada do original atravessa por omissão. A partir daí, `cartao.construir`, o espelho `renderizar` e o `enviar` de `publicar.js:215` recebem o payload **normalizado**.

**Classe A — vocabulário fechado:**

| campo | vocabulário | fora dele |
|---|---|---|
| `tipo` | `pendente · estado · decisao · fecho` (corrige o comentário de `publicar.js:81`, que omite `fecho`) | **RECUSA** |
| `estado` | `APPROVED · REJECTED · STALE · EXPIRED · PARADO · JA_TERMINADO · concluido · falhou` | **RECUSA** (fail-closed; o motivo fica no `porque` do retorno, que o adapter regista localmente) |
| `accoes` | array subconjunto de `{aprovar, recusar, parar}` sem duplicados | **RECUSA** (acções viram botões; uma acção desconhecida é um chamador a inventar) |
| `motor.valor` | `cc · codex · gemini · moo` (as chaves de `MOTORES_LEGIVEIS`) | **DEGRADA** para `null` (o cartão diz n/d) |
| `texto` | catálogo `FRASES` (ver Classe C) | **RECUSA** |
| `custo.fonte` / `cadeia.fontes[i]` | tem de classificar em `classeDaFonte` de `cartao.js` (exporta-a) | `custo`: **DEGRADA** valor e fonte para `null`; `cadeia`: degrada a cadeia inteira para `null` |

**Classe B — forma verificável:**

| campo | gramática | fora dela |
|---|---|---|
| `job_id` | `FORMA_DE_JOB_ID = /^(?!\.+$)[A-Za-z0-9._-]{1,64}$/` — compatível com `broker.JOB_ID_VALIDO` mais tecto de comprimento; prova a compatibilidade num teste | **RECUSA** — o job_id viaja no botão de volta |
| `hash_esperado` / `hash_actual` | `null` ou `/^[a-f0-9]{64}$/` | **RECUSA** — um "hash" fora de forma é um canal de conteúdo com nome de prova |
| `autor.valor` | `null` ou `/^slack:U[A-Z0-9]{2,20}$/i` | **DEGRADA** para `null` |
| `modelo.valor` | `null` ou `FORMA_DE_MODELO` de `cartao.js` (sufixo `-\d{8}` opcional) — partilha a constante, não a copies | **DEGRADA** para `null` |
| `wave` | `null` ou `/^[a-z0-9][a-z0-9._-]{0,31}$/` (slug: sem espaços logo sem prosa) | **DEGRADA** para `null` |
| `custo.valor` / `cadeia.total` | `null` ou número finito >= 0 | **DEGRADA** para `null` |
| `passos` / `segundos` | inteiros finitos, `0 <= passos <= 10000`, `0 <= segundos <= 2592000` | **RECUSA** (só o nosso poller os produz) |
| `diff_stat.valor` | tem de ser `null` (cortado no Dia 0) | **DEGRADA** para `null` |

A regra que decide RECUSA vs DEGRADA, escreve-a no comentário do `esquema.js`: **campos de identidade e de prova recusam** (fazem ida-e-volta em botões — errados são perigosos); **campos de mostruário degradam para n/d** (recusar o cartão inteiro por um valor decorativo estranho seria um apagão de custódia — o dono deixava de ver o custo por causa de um `model_used` esquisito no ledger). `degradados` sai no retorno de `publicar()` e vai para o registo local: **degradar em silêncio não é degradar**.

**Classe C — texto genuinamente livre: DERIVA-SE, nunca se transporta.**

1. **`texto`** passa a pertencer a um catálogo fechado `FRASES` (congelado em `esquema.js`): enumera as frases literais hoje escritas pelo adapter. A composição `'sem decisao: ' + (r.motivo || ...)` morre: substitui por mapa fechado motivo->frase com fallback fixo `'sem decisão — motivo não reconhecido (ver registo local)'`. O adapter importa as frases de `esquema.js` — sem cópias.
2. **`auditoria`** deixa de ser string composta no adapter: o adapter passa um **objecto** `{request, veredicto|accao, estado, actor, hash, autorizacao, job_novo}`; o `esquema.js` valida cada elemento pela gramática respectiva e **compõe ele próprio** a linha legível (hash encurtado a 12). Elemento fora de forma degrada para `n/d` naquele elemento. No caminho do **parar**, `hash_visto` fora de forma degrada para `n/d` — **nada no caminho do stop pode recusar por validação**.
3. **`custo.porque`**: as duas variantes que `leitura.js` compõe viram constantes exportadas de `esquema.js`, importadas por `leitura.js`. Os `porque`/`fonte`/`rotulo` de `autor`, `motor`, `modelo`, `diff_stat` **não entram no payload normalizado**.
4. `cadeia`: confirma a forma real em `cadeia.js` antes de fixar o subesquema — subchaves esperadas `{pedidos, total, fontes, todosMedidos}`; **subchave desconhecida em QUALQUER campo-objecto ⇒ RECUSA** (a allowlist passa a ser profunda, não só de topo).

**Correcções cirúrgicas fora do esquema:**
- `cartao.js:177`: o fallback `(s || 'n/d')` de `mencaoDeActor` passa a `'n/d'` sempre que não casa a forma — nunca eco cru.
- `publicar.js:215`: `enviar(texto, pNormalizado, blocos)` — o payload cru nunca atravessa a porta, nem para routing.
- Exporta `classeDaFonte` de `cartao.js` (hoje é interna).

**Consequência assumida:** `leitura.test.js:141` e `segredo.test.js:101` publicam `texto` livre com nome de segredo. Com o catálogo passam a ser **recusados antes** (mais forte). Actualiza-os para esperarem a recusa por catálogo, e move a cobertura do denylist para testes de unidade directos de `varrerArvore`/`denylist.limpar`. A barreira 3 fica no código — não se remove.

---

## 2 · ALTO 2 — Parar e heartbeat NO CAMINHO REAL

### O problema exacto (confirmado por execução, ACK-3)
- `passos`/`segundos` não estão em `CAMPOS_PERMITIDOS` (`publicar.js:80`);
- `adapter.js:103` publica o estado inicial sem `hash_esperado` ⇒ `blocoDeParar` (`cartao.js:300-306`) devolve `null` ⇒ **não há botão Parar**;
- não existe emissor runtime de heartbeat;
- os únicos testes do estado (`ensaio.test.js:507` e `:521`) chamam `cartao.construir()` directamente.

### O desenho

**(a)** `CAMPOS_PERMITIDOS` ganha `'passos'` e `'segundos'`, com as regras de valor da secção 1.

**(b) O estado inicial ganha hash.** Em `adapter.js:103`, quando há `jobId`, lê `broker.estadoDoJob(jobId, lerEventos())` (**não** toques no broker) e inclui `hash_esperado: (estado && estado.state_hash) || null`. Se o `dispatched` ainda não estiver no ledger, o primeiro cartão sai sem botão e o primeiro heartbeat corrige — degradação, não falha. O `texto` vem do catálogo.

**(c) O emissor de heartbeat nasce no adapter, com nome, e liga-se no poller** (padrão da casa: «uma ligação sem nome é uma ligação sem teste»):
- Nova função exportada `adaptador.publicarBatimentos({ agora, limiarMs, jaBateu })`:
  - percorre os jobs nossos cujo estado corrente é `dispatched`/`started` — nem terminal, nem `agent-awaiting-approval`;
  - só publica se `agora - Date.parse(ts do primeiro 'dispatched')` >= `limiarMs` e `!jaBateu(job)` — **heartbeat só se demorar**;
  - payload `{ tipo:'estado', job_id, passos, segundos, hash_esperado }`, onde `passos` = contagem de eventos `event === 'step'` do job no ledger, `segundos` = `floor((agora - ts do dispatched)/1000)`, `hash_esperado` = `broker.estadoDoJob(job).state_hash`. **Números só do ledger** — nunca %, nunca ETA, nenhum denominador;
  - devolve `[{job_id, publicado, envio, porque}]`.
- `poller.tique()` chama-a com `limiarMs = Number(process.env.SLACK_HEARTBEAT_MS || 60000)`, relógio **injectável** (`d.agora || (() => Date.now())` em `criarPoller`), dedupe `batidos: Map(job -> ts do último batimento ENTREGUE)` marcado **só depois** de o `envio` confirmar, respeitando `ignorados`.

**(d) Cartão.** `blocosDeEstado` já renderiza tudo; único ajuste: com `passos === 0` e `segundos > 0`, mostra só `'⚙️ *A trabalhar* · 1m12s'` — zero passos não é medição, é ausência. `blocoDeParar` e o caminho do clique `parar` **não mudam** — o que faltava era o hash chegar-lhes.

**Não negociável:** sem barra de progresso; números só do ledger; heartbeat só se demorar. Os asserts `!/%/.test(...)` mantêm-se e ganham gémeos ponta-a-ponta.

---

## 3 · MÉDIO (entra — o fix é pequeno e espelha código existente)

`poller.js:77-85`: o loop dos **fechos** marca `fechados.add(f.job_id)` só com `f.publicado`, ignorando `f.envio` — um 429 do Slack perde a mensagem de conclusão para sempre. Espelha o tratamento dos pendentes de `poller.js:88-104`: aguarda `f.envio`; só fecha quando entregue; caso contrário regista `{tipo:'fecho_nao_entregue', job}` e retenta no tique seguinte.

---

## 4 · A REGRA ANTI-VIÉS

Esta frase fica, **verbatim**, no topo do bloco de testes novos em `ensaio.test.js`:

> **Um teste exercita o código real quando o único valor que ele fabrica é a ENTRADA do sistema (o ledger, a menção, o clique, o relógio) e a assert é sobre o que SAIU pela mesma função exportada que o binário usa; se o teste fabrica um payload intermédio e o entrega directamente à camada seguinte, está a exercitar uma cópia do padrão — e prova apenas a parte que nunca esteve partida.**

Todos os testes seguintes em `ensaio.test.js` (broker real + `MOOTER_HOME` temporário, padrão `bancada()`/`montar()` existente), **adapter -> publicador real -> captura do `enviar`**:

- **T1 · canário ponta-a-ponta (ALTO 1, vermelho->verde).** Canários em TODOS os campos livres que o ledger pode trazer: `wave`, `model_used`, `cost_usd_fonte`, `actor.id`, `actor_porque`, `agent`. Corre `publicarPendentes` pelo fluxo real e faz assert de duas coisas: (1) **nenhuma** string capturada contém `CANARY`; (2) o cartão **ainda sai** (`publicado:true`) com n/d nos degradados — custódia sem apagão.
- **T2 · o repro do auditor vira teste do chamador hostil.** O payload do ACK-2: `publicado:false`. Variante com `hash_esperado:'a'.repeat(64)` e canários em `wave`/`autor.valor`: `publicado:true` e `match(/CANARY/)===null`. **Hoje vermelho; depois verde.** Prova a regra dura: o fix não depende do chamador se portar bem.
- **T3 · Parar no fluxo real (ALTO 2, vermelho->verde).** Job nosso `dispatched` há mais do que o limiar; relógio injectado; um `tique()`; assert: existe bloco `actions` com `action_id:'mooter_parar'`, e `cartao.lerValorDoBotao(value)` devolve `{ok:true, job_id, accao:'parar', hash === broker.estadoDoJob(job).state_hash}`.
- **T4 · heartbeat só se demorar.** Antes do limiar ⇒ zero; depois ⇒ exactamente um, com `N passos` e a duração, e `!/%/` em tudo; segundo `tique` dentro do limiar ⇒ nada. Batimento cujo `envio` resolve `{enviado:false}` ⇒ não marcado, retenta.
- **T5 · fecho com Slack a recusar (MÉDIO, vermelho->verde).** `enviar` `{enviado:false}` no 1.º tique ⇒ `fechados` não contém o job; ok no 2.º ⇒ fecha.
- **T6 · frases fechadas.** `publicar({tipo:'estado', job_id:'job-x', texto:'frase inventada'})` ⇒ recusa.
- Os dois testes directos de `ensaio.test.js:507` e `:521` **podem ficar** como unidade do cartão, mas renomeia-os (`cartao (unidade) · ...`). Nenhum teste se apaga sem substituto mais forte.
- `esquema.js` ganha `esquema.test.js` de unidade (gramáticas, enums, degradação vs recusa, compatibilidade `FORMA_DE_JOB_ID` com `broker.JOB_ID_VALIDO`).

---

## 5 · NAO FAZER

- Nao tocar em `tools/router/classify.js` — FROZEN, sha `427d8c0b...4bc48f`.
- Nao tocar em `packages/mooter-bridge/` — pacote congelado, outra frente. Ler pode; importar pode; alterar nao.
- Zero dependencias novas. Node nativo + `node --test`. Sem npm.
- Nada de git. Nem commit, nem stage, nem branch.
- Sem barra de progresso, sem `%`, sem ETA.
- Sem assistant-surface nem superficie nova no Slack.
- Nao truncar valores para os fazer passar — truncar publica metade do vazamento; degrada para n/d ou recusa.
- Nao remover as barreiras 1-4 nem o denylist — a 2b acrescenta-se; nada se relaxa.
- Nao pedir dados novos ao nucleo — o heartbeat deriva so do que o ledger ja tem.

---

## 6 · CRITÉRIO DE ACEITAÇÃO (medível)

1. **ACK registado** (saídas dos comandos ACK-1 a ACK-4, antes de tocar em nada). O ACK-5 esta revogado — ver a nota na seccao 0.
2. **Prova A (ALTO 1):** o comando do ACK-2 passa a imprimir `false ...`; a variante com hash `'a'.repeat(64)` imprime `true null`.
3. **Prova B (ALTO 2):** o comando do ACK-3 adaptado imprime `botao_parar: true`, e o heartbeat `{passos:3, segundos:70}` com hash válido atravessa (`publicado:true`).
4. **Prova C (MÉDIO):** T5 vermelho antes do fix (guarda cópia do ficheiro — sem git), verde depois.
5. **Suite completa:** os 251 de base **mais** T1–T6 e `esquema.test.js` — `# fail 0`. Nenhum teste enfraquecido: onde um assert mudou, o novo é estritamente mais forte e o comentário diz porquê.
6. **Varredura final:** os canários só aparecem dentro dos ficheiros de teste, nunca em payload capturado marcado como enviado.
7. As frases obrigatórias no sítio: a frase do revisor (secção 4) verbatim em `ensaio.test.js`; a regra RECUSA-vs-DEGRADA comentada em `esquema.js`.

**Onde os pontos 2 a 6 exigirem execucao:** nao os corras nem os declares. Escreve o comando exacto em `_handoff/O-QUE-FALTA-CORRER.md` e marca `n/d — sandbox sem spawn`. A execucao e de quem te despacha, num runner a serio.

Se, ao implementar, encontrares um facto que contradiga este desenho, **não alargues a gramática em silêncio**: regista o facto em `_handoff/`, escolhe o lado fail-closed, e deixa o teste a documentar a decisão. É exactamente esse reflexo que distingue este fix dos quatro anteriores.
