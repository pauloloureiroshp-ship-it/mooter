📥 **COLAR EM:** sessão **FRESCA** do Cowork, pasta `C:\Users\Paulo Loureiro\frugal` (a mesma que gerou o prompt da auditoria v1.3.2). Destinatário: **agente**. Não colar no Claude Code — os fixes são de 1-5 linhas cada e o gate é visual (painel no chat), que só o Cowork vê.

# ⇄ HANDOFF — Conector Mooter no Cowork · pós-auditoria v1.3.2

**De:** Cowork · sessão de auditoria UX (2026-07-25, 14:21→14:35)
**Para:** próxima sessão Cowork · wave `mooter-v1.3.3`
**Base factual:** 4 jobs reais em 3 motores + leitura de 2.400 linhas de `packages/mooter-bridge/`
**Custo da auditoria:** $1.1086 · **Relatório-irmão:** `_handoff/MOOTER_UX_AUDIT_V132_2026-07-25.md` (achados de experiência)
**Este documento:** as **causas-raiz no código**, com ficheiro:linha. O outro descreve o sintoma; este diz onde bater.

---

## 0 · O QUE PRECISAS SABER ANTES DE TOCAR EM NADA

| facto | valor |
|---|---|
| Código do conector | `packages/mooter-bridge/` — 5.188 linhas, 9 módulos |
| Núcleo | `seamless.js` (1.125 l) · `fleet.js` (641 l) · `fleet-ui.html` (512 l) · `server-apps.js` (383 l) |
| Testes | 57 asserts em 6 ficheiros · **verdes** · e **não apanharam nenhum dos 4 bugs bloqueantes** (ver §5) |
| Congelado | `tools/router/classify.js` — sha CI-enforced. **Nenhum fix abaixo lhe toca** |
| Instalado | `mooter.mcpb` v1.3.2, enabled, 14 tools. Não repetir o diagnóstico do `claude_desktop_config.json` — fechado em 07-24 |
| Ollama | `127.0.0.1:11434` vivo · `/api/ps` devolveu **lista vazia** durante toda a auditoria |

⚠️ **A descoberta que reorganiza tudo:** a v1.3.2 **corrigiu** o bug do modelo cruzado (`seamless.js:350-393`, com comentário de 14 linhas a explicar), escreveu **6 asserts** a provar o fix (`v12.test.js:70-86`), e o bug **continua a acontecer em produção**. Não é um fix incompleto. É um fix **que o caminho principal não percorre**. Isso é o tema deste handoff.

---

## 1 · BACKEND — advogado do diabo

### 1.1 🔴 O fix da v1.3.2 existe e o `mooter_work` passa ao lado dele

```js
// seamless.js:376 — a assinatura NOVA, correcta, por vendor
function cliModelFor(agent, tier, recommended) {
  if (agent && !['cc','codex','gemini','moo'].includes(String(agent))) {
    recommended = tier; tier = agent; agent = 'cc';        // ← :378-380 back-compat
  }
  ...
}

// seamless.js:905 — o caminho principal, com a assinatura ANTIGA (2 args)
const model = a.model ? String(a.model) : (d ? cliModelFor(tier, d.recommended_model) : null);
```

`cliModelFor('T2', 'sonnet')` → o 1º argumento não é um agente → o back-compat **assume `agent='cc'`** → devolve `'sonnet'`. **Independentemente de o agente real ser `moo`.** É por isso que o Ollama recebeu `sonnet` na minha Fase 2, com o VENDOR_MODELS a dizer `moo: null` três linhas acima.

**Fix (1 linha):** `cliModelFor(agent, tier, d.recommended_model)` — o `agent` já está calculado na linha imediatamente anterior (:904).

**A pergunta desconfortável:** porque é que o back-compat existe? `git grep cliModelFor` dá **2 chamadas de produção**. Uma delas é este bug. O back-compat protege um chamador que não existe e **cria** o chamador que falha. Candidato a apagar, não a manter.

### 1.2 🔴 `pickModel` escolhe pelo tamanho, não pela capacidade

```js
// moo.js:71
if (Array.isArray(residentList) && residentList.length && residentList[0].model) return residentList[0].model;
// moo.js:75
if (sized.length) { sized.sort((a,b) => a.size_bytes - b.size_bytes); return sized[0].model; }
```

Primeiro residente, senão **o menor instalado**. Nenhum dos dois pergunta se o modelo **sabe gerar texto**. O meu primeiro job recebeu `nomic-embed-text:latest` — um *embedder* — e morreu em 102 ms com só a linha `init` no log.

**E não é azar: é enviesamento duplo.**
1. Embedders são quase sempre **os mais pequenos** instalados → ganham o `sort` por tamanho.
2. O teu **3rd-brain do vault** usa embeddings → o `nomic-embed-text` está **residente por design** → ganha o `residentList[0]`.

Quanto melhor o teu RAG funciona, mais garantido é o Mooter escolher o modelo errado. 

**Fix:** filtrar por capacidade antes de escolher. O Ollama expõe `details.family` e, nas versões recentes, `capabilities` em `/api/show`. Mínimo defensável sem chamada extra: rejeitar `family` de embedding e nomes com `embed`/`bge`/`gte`/`minilm`, e **preferir o maior que caiba na VRAM livre** — não o menor. `gpu.js` já dá `free_mb`; a informação está lá e não é usada.

### 1.3 🔴 O detector de "não produziu nada" mede o cano errado

```js
// seamless.js:577
const producedNothing = !r.telemetry || (r.telemetry.tokens_out == null && !r.telemetry.finished);
```

Isto pergunta *"a telemetria trouxe tokens?"*, não *"há resultado?"*. O job `job-ms0glfj2-53db` entregou **1,8 KB de análise correcta** do `telemetry.js` e foi marcado `failed / empty-output` porque o parser não extraiu `tokens_out`.

**O produto disse-me que o trabalho falhou enquanto o trabalho estava na minha frente.** Isto é o achado nº1 da auditoria e a razão única do "não instalava num amigo".

**Fix:** `const producedNothing = !r.result || !String(r.result).trim();` — e a telemetria em falta vira um `coherence` (*"job entregou resultado mas sem telemetria — tokens n/d"*), que é exactamente o que esse array existe para fazer.

**A crítica de fundo:** há **duas fontes de verdade** sobre o mesmo job (`r.result` e `r.telemetry`) e a decisão de vida-ou-morte usa a mais frágil. A robusta é o texto; a frágil é o parse de NDJSON de três CLIs diferentes.

### 1.4 🟠 Cada `mooter_work` apaga o plano da wave anterior

```js
// seamless.js:939
else { try { plan.setPlan(wave, [{ title: goal, agent, state: 'a-correr' }], goal); } catch {} }
```

`setPlan` **substitui**. Despachei 3 jobs para `audit-v132`; `mooter_plan get` devolveu `total: 1` e o `goal` da wave passou a ser o do último. O trabalho do Claude Code — o melhor da sessão — **não existe no plano**.

**Fix:** se a wave já tem plano, `plan.addStep` (o `plan.js` já tem `updateStep`; falta o `append`). O painel renderiza o plano como checklist — é literalmente o produto a mentir sobre si próprio.

### 1.5 🟠 A funcionalidade-estrela falha em silêncio

```js
// seamless.js:946-949
const wantsPrepare = a.prepare !== false && agent !== 'moo';
const resident = await require('./fleet.js').probeOllama(700).catch(() => null);
const localModel = resident && resident.length ? await moo.pickModel(...) : null;
// :986  // preparation refused (busy worktree, no model): fall through, never block
```

`probeOllama` lê `/api/ps` = **modelos residentes em memória**, não instalados. Com a GPU em idle a lista vem vazia → `localModel = null` → **o "carregar o piano" nunca acontece**, e o utilizador recebe `prepared: false` sem uma palavra sobre porquê.

Nos meus 4 jobs: **0 handoffs, 0 chained**. A prova de valor do produto — *"a GPU local prepara de graça o trabalho do agente pago"* — **não correu uma única vez** e nada me avisou.

**Fix:** fallback para `/api/tags` (instalados, não residentes) — o Ollama carrega on-demand em segundos, e "modelo frio" é um custo de latência, não um impedimento. E quando mesmo assim não der: devolver `prepared: false, prepare_skipped: "nenhum modelo local disponível em 127.0.0.1:11434"`. **Silêncio nunca; `n/d` sempre.**

### 1.6 🟠 A proveniência mente sobre quem escolheu o modelo

```js
// seamless.js:618
routed: model && model === model_recommended ? 'pelo classify.js (FROZEN)'
      : (args && args.model ? 'forçado pelo chamador' : 'default do CLI'),
```

Quando o `work` despacha (`:971` passa `model`), o `dispatch` vê `args.model` preenchido e reporta **"forçado pelo chamador"**. Eu não forcei modelo nenhum — passei `agent`. O campo que existe para dar rasto **aponta para o utilizador um acto do próprio produto**.

**Fix:** propagar a origem real (`routed_by: 'work'|'classify'|'user'|'cli-default'`) em vez de a inferir da forma dos argumentos.

### 1.7 🟠 `tok_s` é calculado em dois sítios e dá dois valores

Mesmo job terminado há 30 min: `mooter_fleet` → **34**, `mooter_status` → **2**. O `fleet.js:366-376` congela a taxa na `duration_s` final (`tok_s_basis: "duração final do job"`); o `status` devolve `now.tok_s` sem esse congelamento. Duas tools do mesmo conector, duas respostas para um facto imutável.

**Fix:** `withRate(..., {finished:true})` no `status`, ou — melhor — gravar `tok_s` **uma vez** no evento `done` do ledger e todas as tools passarem a ler. Um número derivado calculado em N sítios diverge sempre; é só uma questão de quando.

### 1.8 🟠 `cost_usd: 0` quando o custo é desconhecido

`mooter_await` fechou uma wave que gastou Opus 62 s com `cost_usd: 0`. Somar `null`s dá 0 em JS e ninguém verificou. **`0` é uma afirmação; `null` é uma abstenção.** Num produto cujo único diferencial não-copiável é *custo honesto*, esta é a linha que destrói mais valor por carácter.

**Fix:** somar só o que é numérico e devolver `{cost_usd: <soma|null>, cost_jobs_medidos: n, cost_jobs_sem_medicao: m}`.

### 1.9 🟡 Erros reais só existem no `stderr_tail`

Um job `done exit 0` tinha no stderr: `failed to load skill ... missing YAML frontmatter` e `AuthRequired ... mcp.vercel.com`. Nada disso aparece no `fleet`, no `plan` ou no `coherence`. **Fix:** promover linhas `ERROR`/`FATAL` do stderr a entradas de `coherence` com `level:"aviso"`.

---

## 2 · FRONTEND — advogado do diabo (`fleet-ui.html`)

Contexto justo antes de bater: este ficheiro é **bom**. Usa as ~80 variáveis de tema do host, `color-mix`, `color-scheme`, SVG inline por causa do CSP, descoberta do nome da tool sob 5 aliases, polling adaptativo 2 s/4 s. Não é código de rascunho. Os problemas abaixo são de **contrato com o utilizador**, não de artesanato.

### 2.1 🔴 O resultado de um job `failed` é inalcançável

```js
// fleet-ui.html:283
} else if (j.state === 'done') {
  a2.appendChild(btn('Ver resultado', ...));
}
```

O botão só existe em `done`. Com o bug §1.3 a marcar trabalho bom como `failed`, **o painel esconde exactamente o resultado que o utilizador precisa de ver**. Backend e frontend erram na mesma direcção — o pior tipo de bug composto.

**Fix:** mostrar "Ver resultado" sempre que o job terminou, seja qual for o estado. Um job falhado com output é o caso em que *mais* se quer ler o output.

### 2.2 🔴 O ✕ é mudo

```js
// fleet-ui.html:250
var mark = done ? (j.state === 'failed' ? '✕' : '✓') : '';
```

Só `orphaned-by-restart` (`:256`) tem texto próprio. `empty-output`, `proc-error:*` e exit codes numéricos aparecem como **um ✕ sem uma palavra**. O utilizador vê que falhou e não tem como saber porquê sem sair para o chat.

**Fix:** dicionário `exit_code → frase humana + acção`. `empty-output` → *"terminou sem produzir texto — provável modelo incompatível"* + botão **"Tentar noutro motor"**.

### 2.3 🔴 O custo desaparece quando é zero

```js
// fleet-ui.html:457
if (t && (t.cloud_out || t.local_out || t.cost_usd)) { ...
// :462
if (t.cost_usd) f.appendChild(node('span', null, '$' + Number(t.cost_usd).toFixed(4)));
```

`0` é falsy. **Um job local que custou $0 — o argumento comercial inteiro do produto — não mostra `$0`. Mostra nada.** E, por causa de §1.8, um custo desconhecido também vira `0` e também desaparece. O único cenário em que o rodapé aparece é quando já gastaste dinheiro.

**Fix:** `!= null` em vez de truthy, e `$0 · local` com destaque positivo. Isto é grátis e é a melhor peça de marketing que o painel pode ter.

### 2.4 🔴 `postMessage('*')` sem validação de origem

```js
// :133   function post(m) { parent.postMessage(m, '*'); }
// :204   window.addEventListener('message', function (ev) {   // ← sem ev.origin, sem ev.source
// :216   if (nm && TOOL_NAMES.indexOf(nm) < 0) TOOL_NAMES.unshift(nm);
// :217   if (nm) toolName = nm;
```

O listener aceita qualquer mensagem de qualquer origem e, na linha 216-217, **deixa essa mensagem escolher o nome da tool que o painel passará a chamar**. Um frame vizinho hostil pode: (a) injectar `tool-result` e pintar custos falsos; (b) fixar um `toolName` arbitrário.

O impacto prático hoje é baixo (o host controla o iframe), mas o padrão é indefensável num painel que mostra dinheiro e cujos botões **enviam prompts em nome do utilizador** (`say()`, `:180`).

**Fix:** guardar `ev.origin` da resposta ao `ui/initialize` e rejeitar tudo o que não venha dela; nunca aceitar nomes de tool vindos de mensagens — só da lista fixa.

### 2.5 🟠 Re-render total a cada 2 segundos

```js
// :317   secs.textContent = '';
```

Tudo é destruído e reconstruído a cada tick. Consequências: **scroll salta**, foco perde-se, e um clique iniciado antes do tick pode terminar sobre um botão novo — ou nenhum. Com jobs órfãos presos em `dispatched` (a razão de existir do `cancel sweep:true`), o painel martela **de 2 em 2 segundos para sempre**.

**Fix mínimo:** só reconstruir se o payload mudou (`JSON.stringify(d) !== last_hash`) — resolve 90% do problema em 3 linhas, sem introduzir um framework.

### 2.6 🟠 Acessibilidade

| problema | evidência | fix |
|---|---|---|
| Contraste abaixo de AA | `--fg3: #9b9a92` sobre fundo claro ≈ **2.8:1**, usado em `.met`, `.sby`, `.chip`, `.foot` a **10.5 px** (mínimo AA: 4.5:1) | escurecer `--fg3` para ~`#6b6a63` ou subir para 12 px |
| Animação sem escape | `.bar i` e `.sp` animam infinitamente; **zero** `@media (prefers-reduced-motion)` em todo o CSS | 4 linhas de media query |
| SVG sem role | `:108` tem `aria-label` sem `role="img"` | 1 atributo |
| Estado só por cor | ✓/✕ dependem de `--ok`/`--bad` | já há glifo — só falta `title`/`aria-label` |

### 2.7 🟠 Zero onboarding

Sem jobs, o painel mostra: "frota parada", a GPU, e nada. **Não há um estado vazio que ensine.** O melhor momento para dizer *"pede-me: analisa o ficheiro X"* é exactamente quando não há nada a acontecer — e é o único momento em que o painel fica calado.

**Fix:** estado vazio com 3 exemplos clicáveis via `say()`. O mecanismo já existe (`:180`), só não é usado para ensinar.

### 2.8 🟡 Outros

- `:393` — planos renderizados **sem limite** (jobs têm `slice(0,6)`); N waves = painel infinito.
- `:174` — `callTool` com timeout de 20 s; `mooter_await` pode bloquear 300 s. Se algum dia o painel o chamar, falha garantida.
- `:264` — job pago sem custo medido não mostra **nada** sobre custo. Devia dizer `custo n/d`.

---

## 3 · UX — o contrato com o utilizador

### 3.1 🔴 A prosa existe e não sobrevive ao transporte

`server-apps.js:206-212` tem `humanLine()` — *"One sentence a person can read, before the JSON"* — e `fleet.formatFleetText()`. Ambas escrevem português legível. **Eu nunca vi uma única frase delas.** Recebi JSON cru em 21/21 chamadas.

Causa: `:302` substitui `content[0].text` pela frase e deixa o objecto em `structuredContent` — e **este host mostra o `structuredContent`**. A prosa é escrita e descartada.

**Fix (grande impacto, custo baixo):** a frase tem de viver **dentro** do objecto. Primeira chave, sempre:
```js
{ resumo: '🐮 GPU local a trabalhar em "lê o telemetry.js" · só leitura · job job-xyz', ok: true, ... }
```
Isto sozinho muda a nota do eixo *Saída* de 3 para 7. É o melhor rácio impacto/esforço de toda a lista.

### 3.2 🔴 O paralelismo — a razão de existir — está trancado atrás do `git worktree`

```js
// seamless.js:913-919
if (busy.length) return { error: 'a worktree ... já tem job activo',
  hint: 'usa mooter_cancel(job_id) ou ... ou passa outra worktree' };
```

O guard está **certo** (dois agentes na mesma árvore corrompem-se). Mas a consequência para quem não sabe git é: **a segunda tarefa é recusada e a saída oferecida é um conceito que ele não tem.** Para correr CC e Codex ao mesmo tempo eu tive de descobrir, por arqueologia numa wave antiga, que existia `C:\Users\Paulo Loureiro\frugal-integ` — e essa árvore estava noutra branch, sem o ficheiro que pedi.

Um produto que vende *frota* não pode exigir que o utilizador saiba criar worktrees para ter frota.

**Fix, por ordem de ambição:**
1. `mooter_worktrees` — lista: caminho · branch · livre/ocupada. (o mínimo)
2. O `work`, ao encontrar a árvore ocupada, **oferece** as livres no erro, com a branch de cada.
3. O `work` **cria** a worktree sozinho quando não há livre — é `git worktree add`, reversível, e é literalmente a promessa "pilota um projecto multi-agente".

### 3.3 🟠 Não há aviso antes de gastar

O `work` classifica, escolhe Opus e despacha **na mesma chamada**. O tier só aparece na resposta, depois de o dinheiro estar comprometido. O **Stripe** e o **Supabase** — os dois conectores mais bem desenhados desta máquina — têm ambos um `confirm_cost` **como passo do fluxo**.

**Fix:** `work` devolve estimativa no retorno e, acima de um limiar (`~$0.50`), exige `confirm:true`. Guardrail que já existe em espírito no `high_risk_open` do plano — falta aplicá-lo ao dinheiro, não só ao `git push`.

### 3.4 🟠 14 tools, 7 incompreensíveis

`work` vs `run` vs `dispatch` vs `route` = quatro portas plausíveis para "fazer trabalho". "Session" significa duas coisas (`session_bind` = Cowork; `sessions_list` = Claude Code). As descrições contam **bugs internos** ao utilizador (*"ghosts que bloqueiam o WIP guard para sempre"*, *"com shell:true um plain kill só reapa o cmd.exe"*) — isso é changelog, não ajuda.

**Fix:** `run` e `route` deixam de ser tools e passam a modos do `work`. Descrições reescritas em 2 linhas: o que faz · quando usar. Alvo: **8 tools**, todas explicáveis a quem nunca viu o produto.

---

## 4 · UI — o que eu mudava se fosse desenhar de novo

Não vejo o render (só o Paulo julga o visual), mas o **modelo de informação** do painel está legível no código, e tem um problema de hierarquia:

| hoje (ordem no DOM) | problema | proposta |
|---|---|---|
| 1. wave · 2. a trabalhar · 3. handoffs · 4. planos · 5. GPU · 6. concluídas · 7. totais · 8. coerência | O **custo** e a **coerência** — as duas coisas que provam a tese — estão em **último**. A GPU, que é uma métrica de máquina, está a meio e ocupa 4 blocos | **1. uma frase de estado · 2. o que está a correr · 3. custo + % local (topo, sempre visível) · 4. plano · 5. incoerências · 6. GPU (colapsada) · 7. histórico** |
| `.met` com 5-6 métricas em `--fg3` a 10.5 px | tudo tem o mesmo peso visual → nada se lê | 1 número em destaque por card (**tokens out**), o resto atrás de hover/expand |
| `.chip` de GPU sempre presente | ocupa espaço permanente para informação que só importa quando há job local | mostrar só quando `live_local > 0` ou quando há folga **e** trabalho parado |

**A coisa que mais mudaria a percepção, e é gratuita:** o painel já tem o `coherence` — o produto a **auditar-se a si próprio**. Está na última linha, a 10.5 px, cinzento. Isso devia ser a assinatura visual do produto, não uma nota de rodapé. Nenhum concorrente vai pôr no ecrã "detectei 1 incoerência nos meus próprios números", porque nenhum tem incentivo comercial para isso. **É o teu fosso e está escondido.**

---

## 5 · A LIÇÃO DE ENGENHARIA (a parte mais importante deste handoff)

**57 asserts verdes. 4 bugs bloqueantes em produção. Zero apanhados.**

```js
// v12.test.js:85 — o teste do bug, a passar
assert.strictEqual(seam.cliModelFor('moo','T0'), null, 'moo recebeu "opus" e devolveu 0 tokens em 0s');
// v12.test.js:76 — e o teste que protege o buraco por onde o bug passa
assert.strictEqual(seam.cliModelFor('T1'), 'haiku', 'assinatura antiga (tier) tem de continuar a funcionar');
```

O teste chama a função com a assinatura **nova**. A produção chama com a **antiga** (`seamless.js:905`). O teste que blinda o back-compat está a **certificar a porta de trás** por onde o bug entra. A suite testa a peça e nunca testa a **passagem** — nenhum teste percorre `toolWork → cliModelFor → spawn`.

O mesmo padrão em `moo.test.js:70`: `pickModel(null, HOST, [{model:'llama3.1:70b'}])` → devolve o primeiro residente. O teste **codifica o comportamento errado como correcto** — nunca há um embedder na lista de teste.

**Regra para a v1.3.3:** todo o bug que a auditoria encontrou ganha um teste **do caminho observável**, não da função. Concretamente:

| # | teste que falta | asserção |
|---|---|---|
| T1 | `toolWork({goal, agent:'moo'})` | o `model` despachado **nunca** é um alias Anthropic |
| T2 | `pickModel` com `[{model:'nomic-embed-text'},{model:'qwen2.5:7b'}]` | devolve o `qwen`, não o embedder |
| T3 | `finish()` com `result` não-vazio e `telemetry:null` | evento é `done`, não `failed` |
| T4 | dois `toolWork` na mesma wave | `plan.get(wave).total === 2` |
| T5 | `await` sobre jobs com `cost_usd:null` | devolve `null`, **nunca** `0` |
| T6 | `status` e `fleet` sobre o mesmo job terminado | `tok_s` idêntico |

---

## 6 · PRÓXIMA WAVE — ordem de execução

**Onda A · "não mentir" (todos os fixes ≤5 linhas, sem risco arquitectural)**

| ordem | fix | ficheiro:linha | porquê primeiro |
|---|---|---|---|
| A1 | `producedNothing` mede `result` | `seamless.js:577` | é o único que sozinho muda o veredicto de "não instalava" |
| A2 | `cliModelFor(agent, tier, rec)` | `seamless.js:905` | fecha o gate G1, que a v1.3.2 alega ter fechado |
| A3 | custo `null` nunca `0` | `seamless.js` (await) + `fleet-ui.html:457,462` | o diferencial declarado do produto |
| A4 | `resumo:` como 1ª chave de toda a saída | `server-apps.js:299-303` | melhor rácio impacto/esforço da lista |
| A5 | "Ver resultado" também em `failed` | `fleet-ui.html:283` | sem isto, o A1 ainda deixa trabalho inalcançável |

**Onda B · "não adivinhar"** — B1 `pickModel` filtra embedders e prefere o maior que cabe (`moo.js:67-77`) · B2 `plan` faz append (`seamless.js:939`) · B3 `prepare` explica porque não correu (`seamless.js:986`) · B4 `tok_s` gravado uma vez no ledger.

**Onda C · "não exigir git"** — C1 `mooter_worktrees` · C2 erro de worktree ocupada oferece as livres · C3 `work` cria worktree sozinho.

**Onda D · painel** — D1 estado vazio que ensina · D2 `exit_code` → frase + acção · D3 re-render só com mudança · D4 acessibilidade (contraste + reduced-motion) · D5 hierarquia: custo e coerência ao topo.

**Onda E · segurança** — E1 validar `ev.origin` e nunca aceitar `toolName` de mensagens (`fleet-ui.html:204-217`) · E2 expor `allowed_tools_effective` no `collect` (hoje **não há forma de auditar** se o `allowedTools:"Read"` que pediste foi aplicado).

---

## 7 · O QUE NÃO FAZER

| ❌ | porquê |
|---|---|
| Tocar em `tools/router/classify.js` | congelado, sha CI-enforced. **Nenhum achado desta auditoria é do classificador** — todos são da camada entre ele e o spawn |
| Reescrever o `fleet-ui.html` | é bom código; os problemas são de contrato, não de artesanato. Reescrever perde o tema do host, o CSP-safe SVG e a descoberta de tool sob 5 aliases |
| Voltar a anexar o `_meta.ui` a todas as tools | já custou **22 painéis empilhados** e um "fiquei perdido" (`server-apps.js:183-198`). `ANCHOR_TOOLS = {fleet, work}` está certo — **não mexer** |
| Repetir o diagnóstico do `claude_desktop_config.json` | fechado em 07-24; o `.mcpb` está instalado e enabled |
| Mudar o back-compat de `cliModelFor` sem apagar as 2 chamadas antigas | manter os dois caminhos é o que produziu o bug |

---

## BOARD

| item | estado | próxima acção |
|---|---|---|
| Auditoria UX v1.3.2 | ✅ feito | `_handoff/MOOTER_UX_AUDIT_V132_2026-07-25.md` |
| Causa-raiz dos 4 bloqueantes | ✅ feito | este documento, §1.1-§1.3 e §1.4 |
| Nota no vault | ✅ feito | `30-learnings/2026-07-25-auditoria-ux-v1-3-2-…md` |
| Onda A (5 fixes ≤5 linhas) | 🔥 **foco** | colar este handoff numa sessão Cowork fresca e executar A1→A5 |
| Testes T1-T6 do **caminho** | 🔜 próximo | mesma wave que a Onda A — sem eles, a v1.3.3 repete a v1.3.2 |
| Ondas B/C/D/E | 🔜 fila | ordem em §6 |
| Gate G7 (nº de painéis) | ⚠️ atenção | resolvido no código; **só tu podes confirmar visualmente** |
| `allowedTools` auditável | ⚠️ atenção | hoje não é verificável por tool nenhuma (E2) |
| `classify.js` | ❄️ não tocar | congelado |

## SOCIO

- **Receita:** a Onda A é o gate de instalabilidade. Um conector que diz "falhou" sobre trabalho entregue não passa do primeiro utilizador externo — e são **5 fixes de ≤5 linhas**, não uma refactorização. O rácio esforço/desbloqueio é o melhor que vi neste projecto.
- **Despesa ↓:** A2 e B1 poupam dinheiro medido. Despachar Opus 62 s para um motor que nunca podia executar a tarefa custou **~$1 hoje**; falhar na validação custa 50 ms e $0. §1.5 é o outro lado: a preparação local a $0 **nunca correu**, logo a poupança prometida é hoje **zero real**.
- **Risco ↓:** §1.8 (custo `0` falso) é o maior risco reputacional do projecto, porque contradiz o único diferencial que os concorrentes **não têm incentivo comercial para copiar**. E2 é risco de segurança por opacidade — não provei abuso, provei que **não é auditável**.
- **Reversível:** sim, integralmente. Ondas A e B são camada de reporting e validação; nenhuma toca `classify.js` nem `packages/*` congelados. A Onda C (criar worktrees) é a primeira que escreve estado fora do job dir — merece o teu gate.
- **Escopo:** contido. Esta sessão não correu git, não escreveu fora de `_handoff/` e do vault, e gastou $1.1086.

---

## A PERGUNTA

Os fixes A1 e A3 apontam para a mesma decisão, e é tua:

**O painel deve parecer completo ou deve parecer honesto?**

Hoje ele escolhe as duas coisas em sítios diferentes — soma `null`s e mostra `0`, recalcula `tok_s` para não ter buracos, esconde o custo quando é zero — e ao mesmo tempo tem um array `coherence` que se auto-denuncia e um `saved_note` que **recusa** mostrar poupança porque a baseline dava negativo em 8/8. Essas duas almas não podem coexistir no mesmo produto: a primeira torna a segunda incrível.

Se a resposta for **honesto**, o painel vai ficar visivelmente mais cheio de `n/d` — e isso é mais difícil de demonstrar a alguém em 30 segundos. Não posso decidir por ti porque é a tua tese comercial, não uma escolha técnica.
