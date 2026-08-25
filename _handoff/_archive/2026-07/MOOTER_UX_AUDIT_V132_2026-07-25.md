# ⇄ MOOTER — AUDITORIA DE PRODUTO PELA EXPERIÊNCIA · v1.3.2

**Data:** 2026-07-25 · **Auditor:** Cowork (papel: utilizador novo + auditor UX + advogado do diabo)
**Superfície testada:** conector MCP local `Mooter`, 14 tools, painel MCP Apps
**Método:** 4 jobs reais em 3 motores (moo/cc/codex), 2 waves, 21 chamadas de tools
**Custo medido:** `$1.1086` (sessão `ef2609b8`, única fonte que reporta custo) — dentro do alvo de $6

---

## VEREDICTO — 3 linhas

**Não instalava isto num amigo hoje.** Não porque o motor seja fraco — é bom, e a análise que o Claude Code produziu do `telemetry.js` foi de qualidade real — mas porque **o conector disse-me que esse trabalho tinha falhado**.
Um produto cujo pitch é *"o vibe coder não estuda"* e *"nunca fabricar métricas"* falhou nas duas coisas na mesma sessão: exigiu-me `worktree`/`wave`/`agent` à mão, e devolveu-me `cost_usd: 0` para uma wave que gastou mais de um dólar.
A distância para "instalável" é curta e é toda de honestidade de relatório, não de arquitectura: quatro dos oito achados são bugs de *reporting*, não de execução.

**NOTA GLOBAL: 3.8/10** (UX; o motor não é o que está a ser avaliado)

---

## NOTA POR EIXO (Fase 4)

| eixo | Mooter | porquê |
|---|---|---|
| Nomes | **4/10** | `work` vs `run` vs `dispatch` vs `route` — quatro portas plausíveis para "fazer trabalho". "Session" significa duas coisas diferentes (`session_bind` = sessão Cowork; `sessions_list` = sessões Claude Code) |
| Parâmetros obrigatórios | **2/10** | `worktree`, `wave`, `masterprompt` com `⇄ header`, `allowedTools` com sintaxe própria. **E o schema mente**: `dispatch` declara só `agent` obrigatório, o runtime exige mais dois |
| Descrições | **5/10** | A do `work` é boa e diz quando usar. As outras contam bugs internos ao utilizador ("ghosts que bloqueiam o WIP guard para sempre", "com shell:true um plain kill só reapa o cmd.exe") |
| Erros | **3/10** | Zod cru com `path/expected/received`. E o pior erro do produto — `empty-output` — apareceu **com output presente** |
| Saída | **3/10** | JSON cru em 100% das 21 chamadas. O único texto legível da sessão foi escrito pelo agente, não pelo conector. A única excepção limpa foi o `mooter_journal` |

**Média dos eixos: 3.4** · global arredondado para 3.8 pelo bloco `gpu` e pelo array `coherence`, que são melhores do que qualquer conector da Fase 4.

---

## TABELA DOS GATES G1–G7

| # | gate | veredicto | evidência literal |
|---|---|---|---|
| **G1** | modelo do vendor errado? esperado NÃO | ❌ **FALHA, 2×** | `{"agent":"moo","model":"sonnet","routed":"forçado pelo chamador"}` → Ollama recebeu `sonnet`. E antes: `"model_used":"nomic-embed-text:latest"` — um modelo de **embeddings** para gerar prosa, host `127.0.0.1:11434` |
| **G2** | `exit 0` sem output? esperado NÃO | ⚠️ **FALHA INVERTIDA** | Não houve exit-0-vazio, houve o oposto: `job-ms0glfj2-53db` → `state:"failed"`, `exit_code:"empty-output"`, **e `result` com 1.8 KB de análise correcta**. O detector tem falsos positivos |
| **G3** | Codex pendurou em stdin? | 🟡 **PARCIAL** | Não pendurou (terminou em 106s / 62s), mas o comportamento de origem persiste: `stderr_tail[0] = "Reading additional input from stdin..."` |
| **G4** | `tok_s` estável depois de acabar? esperado SIM | ❌ **FALHA** | Mesmo job `job-ms0fggh8-d0ce`, terminado 13:53. `mooter_fleet` 14:22 → `"tok_s":34,"tok_s_basis":"duração final do job"`. `mooter_status` 14:24 → `"tok_s":2`. `mooter_status` 14:26 → `"tok_s":2` |
| **G5** | uma só fonte de custo? | ❌ **FALHA** | Mesmo trabalho, três respostas: `mooter_await → "cost_usd":0` · `mooter_collect → "cost_usd":null` · `sessions_list → "session_cost_usd":1.108648`. Há uma `cost_note` a explicar a diferença — mas **`0` não é `null`**, é uma afirmação falsa |
| **G6** | títulos úteis, zero `needs_you` falsos? | ❌ **FALHA** | 10 sessões: **9 com o título `"Lê o ficheiro C:\Users\Paulo Loureiro\.mooter\jobs\j"`** (o prompt do harness, não o trabalho). E a única com título útil está `"status":"needs_you"` — sendo um job **headless já terminado e coletado** |
| **G7** | 1-2 painéis na thread? | 🚫 **NÃO AVALIÁVEL POR MIM** | Não vejo o render. Mas 4× `mooter_work` × "returns a live panel" + 17 outras chamadas = risco estrutural. Só o Paulo pode fechar este gate |

**Placar: 0 gates passados limpos, 1 parcial, 5 falhados, 1 não-avaliável.**

---

## TABELA DE ACHADOS

| # | achado | sev | evidência | fix numa linha |
|---|---|---|---|---|
| 1 | **Trabalho entregue é reportado como falhado.** O CC produziu 5 bullets correctos sobre o `telemetry.js` e o conector disse "3 job(s) falharam" | 🔴 **BLOQUEANTE** | `job-ms0glfj2-53db`: `state:"failed"` + `exit_code:"empty-output"` + `result` de 1.8 KB começando `"Li o ficheiro completo — packages/mooter-bridge/telemetry.js, 281 linhas."` | Só marcar `empty-output` se `result.trim().length === 0`; senão `done` |
| 2 | **Modelo cruzado com o vendor errado** — o gate central da v1.3.2 não passa | 🔴 **BLOQUEANTE** | `agent:"moo"` + `model:"sonnet"`; e `model_used:"nomic-embed-text:latest"` (embedder) para uma tarefa de prosa | Validar contra `ollama list` antes de despachar `moo`; rejeitar embedders para geração |
| 3 | **`cost_usd: 0` para uma wave que gastou ≥$1** | 🔴 **ALTA** | `mooter_await → "cost_usd":0`, sessão paralela `$1.108648` | `0` só quando medido zero; desconhecido é `null` |
| 4 | **`mooter_work` sobrescreve o plano da wave** — 2 dos 3 jobs desapareceram | 🔴 **ALTA** | 3 jobs em `audit-v132`; `mooter_plan get` → `"total":1`, e o `goal` da wave é o do último job | `work` faz `plan update` (append de passo), nunca `plan set` |
| 5 | **`tok_s` muda sozinho entre tools** (34 → 2) num job morto há 30 min | 🟠 **MÉDIA** | `fleet:34` vs `status:2`, mesmo `job_id` | `withRate` no ledger, uma vez, no evento `done` — as tools só lêem |
| 6 | **Job morto aparece como "a pensar"** | 🟠 **MÉDIA** | `job-ms0gjstd-1525`: `last:"collected"`, `alive:false`, e `now.activity:"a pensar"` | Se `alive:false`, `now` é `null` |
| 7 | **O `work` truncou o goal no masterprompt** e o agente ficou à espera de continuação | 🟠 **MÉDIA** | Resposta literal do CC: *"⚠️ A tua mensagem chegou **truncada** em '(281 linha...'. Colas o resto do S1?"* | Não cortar o goal ao montar o header |
| 8 | **Falhas reais só existem no `stderr_tail`, nunca no painel** | 🟠 **MÉDIA** | Job `done exit 0` com `ERROR ... failed to load skill ... missing YAML frontmatter` e `ERROR ... AuthRequired ... mcp.vercel.com` | Promover linhas `ERROR` do stderr a entradas de `coherence` |
| 9 | **Roteamento manda ler ficheiros para um motor sem filesystem** | 🟠 **MÉDIA** | `work` sem `agent` → `tier:T0, agent:moo` para "lê o packages/mooter-bridge/telemetry.js"; `moo` fala HTTP com `127.0.0.1:11434` | Se o goal referir um caminho, o tier mínimo é o do primeiro motor com filesystem |
| 10 | **`tier` do mesmo job muda entre tools** | 🟠 **MÉDIA** | `work` devolveu `tier:"T2"` (moo) e `"T0"` (cc); `collect` devolveu `"T3"` em ambos | Tier gravado uma vez no `dispatched`, lido daí |
| 11 | **Dois jobs simultâneos na mesma worktree**, contra o que o `dispatch` promete garantir | 🟠 **MÉDIA** | `job-ms0glefs-90ab` e `job-ms0glfj2-53db`, ambos `worktree:"C:\Users\Paulo Loureiro\frugal"`, sobrepostos no tempo | O caminho do `work` tem de passar pelo mesmo guard do `dispatch` |
| 12 | **O schema do `dispatch` mente sobre o contrato** | 🟡 **BAIXA** | Schema: `required:["agent"]`. Runtime: `worktree` e `wave` obrigatórios (erro Zod) | Pôr os três em `required` |
| 13 | **Erros não são accionáveis** | 🟡 **BAIXA** | `MCP error -32602 ... {"expected":"string","code":"invalid_type","path":["worktree"]}` | Uma frase: *"Falta a worktree. Se não souberes qual, usa `mooter_work` que escolhe por ti."* |
| 14 | **9 de 10 sessões com o mesmo título genérico** | 🟡 **BAIXA** | `"Lê o ficheiro C:\Users\Paulo Loureiro\.mooter\jobs\j"` ×9 | Título = goal do job no ledger, não a 1ª linha do prompt do harness |
| 15 | **Não há forma de auditar se `allowedTools` foi aplicado** | 🟡 **BAIXA** (segurança por opacidade) | Nenhuma tool devolve o comando construído nem os tools efectivos; `tools_used:null` em todos os jobs | `collect` devolve `allowed_tools_effective` e `tools_used` |
| 16 | **`local:[]` mas `local_available:true`** — não sei que modelos tenho na GPU | 🟡 **BAIXA** | `mooter_fleet` com `includeLocal:true` → `"local":[]` | Se a lista vier vazia com host vivo, é erro — reportar, não devolver `[]` |

---

## MÉTRICAS DE FRICÇÃO

| métrica | valor |
|---|---|
| Tool calls até ao **primeiro resultado** | **3** (`work` → `await` → `collect`) — e o resultado foi uma falha |
| Tool calls até ao primeiro **conteúdo útil** | **9** — e veio rotulado `failed` |
| Segundos até saber que **algo estava a acontecer** | **< 1s** ✅ (o `work` devolve `job_id` imediatamente; isto é bom) |
| Segundos até saber **o que aconteceu** | 62s (cc/codex), 0.1s (moo, falha instantânea) |
| Parâmetros que tive de **inventar** | **3 classes**: `agent` (3×, porque a escolha automática errou o motor), `worktree` (caminho absoluto que só descobri por arqueologia numa wave antiga), `wave` (id livre, sem convenção) |
| Vezes que precisei do **terminal** | **2** — para descobrir que `packages/mooter-bridge/telemetry.js` existia e que `frugal-integ` está noutra branch. **Nenhuma tool do conector me deixa ver a árvore nem a branch de uma worktree** |
| Vezes que usei `sleep` | **0** ✅ — o `mooter_await` cobriu o caso, e bem |
| Jobs lançados / jobs reportados como bem-sucedidos | **4 / 0** |
| Jobs que **realmente** produziram trabalho útil | **2** (cc e codex) |

⚠️ **A frase que o produto tem de ouvir:** tive de passar `worktree` e `agent` à mão. A tese é *"o vibe coder não estuda"* — e eu tive de saber o que é uma worktree, onde ela vive, e qual dos quatro motores serve para ler um ficheiro. **Isso é um achado grave contra a tese, não contra a implementação.**

---

## AS 3 COISAS QUE MAIS IMPRESSIONAM

1. **O bloco `gpu` é o melhor pedaço de honestidade que vi num conector.** Não dá só números — dá o veredicto *e o método*: `"verdict":"com folga","why":"só 28% e 19 GB livres"` mais uma nota a explicar que a decisão pesa VRAM livre primeiro *"porque um modelo tem de caber"* e só depois utilização, *"porque inferência serial faz a utilização oscilar entre tokens"*. Bate certo com os números crus (28% util, 19334 MB livres).
2. **O array `coherence` — o conector acusa-se a si próprio.** `"job terminou sem custo registado — o CLI não reportou total_cost_usd"`. Um produto que reporta as suas próprias lacunas é raro.
3. **O `saved_note` recusa mostrar poupança:** *"oculto: baseline contrafactual all-Opus dava negativo em 8/8 — volta quando houver medição A/B real"*. Isto é exactamente a doutrina "nunca fabricar métricas", aplicada contra o interesse comercial do próprio produto.

**Porque não estão em destaque:** as três chegam **enterradas** — a `gpu` é o penúltimo bloco de um JSON de ~200 linhas, o `coherence` é um array de uma linha no meio, e o `saved_note` está repetido 10× dentro de `sessions_list`. O que o produto tem de melhor está escondido atrás do que ele tem de pior (JSON cru). Nenhuma das três aparece se o utilizador só chamar `work` + `await` + `collect` — o caminho recomendado.

---

## AS 3 COISAS QUE MAIS ATRAPALHAM

1. **Ser informado de que o meu trabalho falhou quando ele está feito.** Custa dinheiro duas vezes: paga-se o job e paga-se a repetição.
2. **Modelos trocados entre vendors.** `sonnet` para o Ollama e um *embedder* para escrever prosa não são bugs de polimento — são a prova de que a camada que escolhe o modelo não sabe o que cada motor aceita.
3. **Números que mudam sozinhos e um custo que diz `0`.** Num produto cujo diferencial declarado é *custo honesto*, um `cost_usd: 0` falso destrói mais valor do que qualquer feature em falta acrescenta.

---

## O QUE COPIAR (Fase 4 — os 3 melhores conectores desta máquina)

Escolhi **Stripe**, **Supabase** e **Context7** — pelos schemas e descrições, sem os executar.

| conector | o que o Mooter copia | porquê |
|---|---|---|
| **Stripe** | `confirm_cost` como passo obrigatório antes de gastar; e nomes que separam leitura de escrita (`stripe_api_read` vs `stripe_api_write`) | O Mooter tem `write:true` escondido num booleano do `work`. O Stripe faz da despesa um **passo do fluxo**, não um parâmetro. É o fix do achado #3 e da Fase 5.7 |
| **Supabase** | `get_advisors` — o conector diz-te o que está mal **sem tu perguntares**; e `get_cost` + `confirm_cost` antes de criar recursos | O Mooter já tem a matéria-prima disto no array `coherence`. Falta promovê-lo de campo escondido a **tool própria** (`mooter_advisors`) e devolvê-lo no `await` |
| **Context7** | Duas tools e um fluxo óbvio: `resolve-library-id` → `query-docs`. O conector **resolve o identificador por ti** | É o antídoto exacto para o achado #9 e para o `worktree` obrigatório: o Mooter precisa de um `mooter_worktrees` (lista: caminho, branch, livre/ocupada) ou, melhor, de resolver a worktree sozinho e **dizer qual escolheu e porquê** |

**Em quantos eixos o Mooter perde para os três?** Em **quatro de cinco** (nomes, parâmetros, erros, saída). Ganha em **descrições** contra o Supabase e o Stripe, que descrevem sem ensinar quando usar — e ganha nos três em algo que não está na tabela: **nenhum deles admite não saber**. O Mooter é o único que diz `null` em vez de inventar. É por isso que a nota é 3.8 e não 2.

---

## FASE 5 — LOOPHOLES

| # | classe | resultado |
|---|---|---|
| 5.1 | **Contradição** | ✅ Reproduzida 4×: `tok_s` 34 vs 2 (fleet vs status) · `tier` T2 vs T3 (work vs collect) · `cost` 0 vs null vs 1.11 · `plan.total:1` vs `fleet` com 3 jobs na mesma wave |
| 5.2 | **Número instável** | ✅ Reproduzido: `tok_s` do `job-ms0fggh8-d0ce` lido 3× (34 → 2 → 2) sem nada ter mudado; job terminado há 30 min |
| 5.3 | **Silêncio** | ✅ Reproduzido: dois `ERROR` no `stderr_tail` (skill sem frontmatter YAML; OAuth do MCP Vercel recusado) num job marcado `done exit 0`. Não aparecem no `fleet`, nem no `plan`, nem no `coherence` |
| 5.4 | **Permissão** | ⚠️ **Não verificável** — pedi `allowedTools:"Read"` e o dispatch foi recusado por validação antes de construir o comando. **Nenhuma tool do conector devolve o comando construído nem os tools efectivamente concedidos** (`tools_used:null` em 4/4 jobs). Um pedido de permissão que não pode ser auditado é, na prática, um pedido não verificado |
| 5.5 | **Bloqueio** | 🟡 Parcial: consegui pôr **dois jobs simultâneos na mesma worktree** via `work` (achado #11) — o que o `dispatch` diz impedir. Não tentei levar até à corrupção (regra: nada destrutivo). Saída sem terminal: **existe** — `mooter_cancel sweep:true`. Isto está bem resolvido |
| 5.6 | **Cegueira** — 3 coisas concretas que o painel não mostra e devia | **(a)** a **branch** de cada worktree — o Codex foi para `frugal-integ`, que não tem o ficheiro pedido, e nada me avisou; **(b)** os **modelos disponíveis** na GPU (`local:[]` com host vivo) — não sei o que posso pedir; **(c)** o **erro real** de um job: `empty-output` não distingue "o modelo não existe" de "o ficheiro não existe" de "o CLI morreu". Três causas, uma etiqueta |
| 5.7 | **Custo** | ✅ **Sim, gasta-se sem perceber.** O `work` não anuncia tier nem custo estimado *antes* de despachar; anuncia depois, no retorno. E o `await` fechou uma wave de >$1 com `cost_usd:0`. **Onde devia avisar e não avisa:** no momento do `work`, com o tier escolhido e uma estimativa; e no `await`, nunca reportando `0` sem medição |

---

## PRÓXIMA WAVE — 5 fixes por ordem de impacto sentido pelo utilizador

1. **`empty-output` só quando o output está mesmo vazio.** Um utilizador que perde trabalho bom não volta. Fix de uma condição.
2. **Validar modelo↔motor antes de despachar.** `moo` só aceita nomes de `ollama list` (e nunca um embedder); `cc` só aceita nomes Anthropic. Falhar cedo com mensagem clara em vez de queimar 62s.
3. **Uma só fonte de custo, e `null` quando não se sabe.** O ledger manda; `await`, `collect` e `fleet` só lêem. Nunca `0` por omissão.
4. **`mooter_work` acrescenta ao plano, não substitui.** Sem isto o painel de progresso mente sobre o trabalho feito — e o painel é o produto.
5. **Resolver a worktree por mim e dizer qual escolheu.** Mais um `mooter_worktrees` (caminho · branch · livre/ocupada). Enquanto eu tiver de escrever `C:\Users\Paulo Loureiro\frugal-integ` à mão, a tese "o vibe coder não estuda" é falsa.

*(Deliberadamente fora do top-5: o truncamento do goal (#7) e os títulos das sessões (#14) — doem, mas doem menos do que perder trabalho.)*

---

## BOARD

| item | estado | próxima acção |
|---|---|---|
| Auditoria UX v1.3.2 | ✅ feito | este relatório |
| Nota no vault | ✅ feito | `30-learnings/2026-07-25-auditoria-ux-v1-3-2-o-conector-marca-como-falhado-o-trabalho.md` |
| Gates G1–G7 | ⚠️ 5 falhados, 1 parcial, 1 por avaliar | G7 (nº de painéis) só o Paulo pode fechar — eu não vejo o render |
| Fix #1 `empty-output` | 🔜 próximo | 1 condição em `collect`/`fold`; é o único fix que sozinho muda o veredicto |
| Fixes #2–#5 | 🔜 fila | ordenados por impacto acima |
| Permissão `allowedTools` (5.4) | ⚠️ atenção | não é auditável pelas tools — decidir se se expõe `allowed_tools_effective` |
| `packages/mooter-bridge/telemetry.js` | 🛠 manutenção | o CC não encontrou bug óbvio; código descrito como cuidado, com as armadilhas comentadas |

## SOCIO

- **Receita:** nula neste ciclo. Mas o achado #1 é directamente comercial: **um conector que diz "falhou" sobre trabalho entregue não sobrevive ao primeiro utilizador externo**. É o gate de instalabilidade, não um polimento.
- **Despesa ↓:** os fixes #2 e #9 poupam dinheiro real — despachar Opus 62s para uma tarefa que o motor errado nunca podia executar custou-nos ~$1 hoje, e custa sempre que se repete. Falhar em 50ms na validação é grátis.
- **Risco ↓:** o achado #3 (custo `0` falso) é o risco reputacional maior do projecto, porque contradiz o **único** diferencial declarado que os concorrentes não podem copiar por incentivo comercial. O achado #15 (permissão não auditável) é risco de segurança por opacidade, não por falha provada.
- **Reversível:** sim, integralmente. Todos os 5 fixes são de camada de *reporting* e validação; nenhum toca `classify.js` (congelado, sha intacta), nenhum toca `packages/*` congelados.
- **Escopo:** contido. Esta auditoria não escreveu fora de `_handoff/` e do vault, não correu git, e gastou `$1.1086` dos $6 autorizados.

---

## A PERGUNTA

O achado #1 e o achado #3 apontam para a mesma decisão de fundo, e é tua, não minha:

**Quando o Mooter não sabe um número, o que é que ele diz ao utilizador?**

Hoje ele responde as três coisas ao mesmo tempo — `0` no `await`, `null` no `collect`, `$1.11` no `sessions_list` — e cada uma tem uma justificação defensável isoladamente. A escolha não é técnica: é se o produto prefere **parecer completo** (preencher com `0` e com um `tok_s` recalculado) ou **parecer honesto** (`null` em toda a parte, e o painel com buracos visíveis). Não posso decidir isto sozinha porque é a tua tese comercial que está em jogo — e um painel cheio de `n/d` é mais difícil de vender do que um painel bonito que mente.

---

*Elogio, uma linha, como combinado: o `mooter_await` resolveu o problema do polling melhor do que qualquer conector desta máquina — zero `sleep`, zero ruído no chat, uma chamada.*
