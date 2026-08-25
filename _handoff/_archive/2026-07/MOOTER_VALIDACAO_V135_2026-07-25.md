# Validação Mooter v1.3.5 — utilizador novo · auditor · advogado do diabo

**Data:** 2026-07-25 · **Máquina:** Windows, RTX 4090 (driver 610.62) · **Conector:** Mooter v1.3.5 (.mcpb instalado)
**Árvore:** `C:\Users\Paulo Loureiro\frugal` @ `chore/mooter-20-h0`
**Custo medido:** $4.15 · **custo perdido (não medido):** ≥1 job Opus com `cost_usd: null` · **alvo:** ≤$8 ✅

---

## VEREDICTO (3 linhas)

**Não instalava isto num amigo — ainda.** O transporte está resolvido (o bug do argumento multi-linha morreu, provado 3× com âncoras), os três motores correm em paralelo, a permissão `read-only` é respeitada pelos três, e a Fase 7 entregou trabalho real: 8 suites corridas em Windows pela primeira vez e um commit de 15 ficheiros sem um único intruso.

Mas o conector **matou um job com a sua própria ferramenta documentada** (`mooter_await(timeout_s:600)` → `orphaned-by-restart`), e o commit que ficou na árvore do Paulo **não tem dono no ledger** — o `job-ms0ik779-57b6` que o WIP guard viu a segurar a worktree responde `⚠ nada no ledger`.

Um produto cujo pitch é *ledger append-only, visibilidade total, nunca fabricar métricas* escreveu 1279 linhas na árvore principal e não sabe dizer quem escreveu.

**NOTA GLOBAL: 5.4/10** — motor bom, contabilidade partida.

---

## NOTA POR EIXO (Fase 6)

| Eixo | Mooter | Linear | Supabase | Stripe | O que o Mooter copiava |
|---|---|---|---|---|---|
| **Nomes** | 5 | 9 | 8 | 8 | Linear: **um verbo por intenção**. `save_issue` faz create+update. O Mooter tem `work`/`run`/`dispatch` para correr e `status`/`await`/`collect`/`fleet` para ler. 7 tools onde bastavam 3. |
| **Parâmetros obrigatórios** | 3 | 8 | 9 | 8 | Supabase: **o schema é a verdade**. No Mooter `dispatch` tem `required:["agent"]` e mais nada, mas a prosa exige `masterprompt`+`worktree`+`wave`; `mooter_work()` sem argumentos é schema-válido. A validação vive toda num guard invisível. |
| **Descrições** | 6 | 8 | 8 | 9 | Stripe: **diz o que devolve, não como funciona**. `mooter_work` vende *"returns a live panel"* e `mooter_run` vende *"return its result"* — a tool errada vende-se melhor (ver Fase 0.2). |
| **Erros accionáveis** | 4 | 8 | 9 | 9 | Supabase: **o erro traz o próximo passo**. O `await` estourado devolveu `MCP error -32001` cru — sem job id, sem "o teu job continua vivo", sem "usa mooter_status". E foi o erro que matou o job. |
| **Saída legível** | 5 | 8 | 7 | 8 | Linear: **payload proporcional**. `mooter_worktrees` devolve as mesmas 37 entradas **três vezes** (`worktrees[]`, `livres[]`, e outra vez em texto no `resumo`) ≈ 9k tokens por chamada. |

---

## TABELA DOS GATES

| # | Gate | Resultado | Evidência literal |
|---|---|---|---|
| **G1** | Prompt chega inteiro | ✅ **PASSA** | Prompt de ~950 chars → resposta trata as 3 perguntas e termina com `ANCORA-7391-FIM-DO-PROMPT`. Repetido com prompt de ~2000 chars → `FASE7-CONCLUIDA-8821`. **O bug do `cmd.exe` está morto.** |
| **G2** | Job que entrega texto é `done` | ✅ **PASSA** | 10 jobs, 0 `failed` por `empty-output`. Nenhum trabalho bom foi marcado falhado. ⚠️ Efeito colateral: também marca `done` um job que **inventou** o ficheiro (ver Achado #2). |
| **G3** | Nome de modelo do vendor errado | ✅ **PASSA** | `moo` → `qwen2.5:3b` · `cc` → `claude-opus-4-8` / `claude-sonnet-5` · `codex` → `model_used: null` (honesto, não fabrica). Zero cruzamento. |
| **G4** | `tok_s` igual em `status` e `fleet`, estável | ✅ **PASSA** | job `…62f4`: `status.tok_s: 46` = `fleet.tok_s: 46`. Relido 4min depois: `46`, `tokens_in: 4`, `cost 0.5101038` — idênticos. `tok_s_basis` distingue `"duração final do job"` de `"estimativa, job a correr"`. |
| **G5** | Wave sem custo medido → `null` + `cost_jobs_sem_medicao` | ✅ **PASSA** | Job codex: `cost_usd: null` (não `0`). Wave: `cost_jobs_sem_medicao: 1`, `cost_note: "1 job(s) sem custo reportado pelo CLI — o total é parcial"`. |
| **G6** | `allowed_tools_effective` + `read-only` no codex | ✅ **PASSA (segurança OK)** | Pedi `allowedTools:"Read"` → codex devolveu `{"sandbox":"read-only","read_only":true,"fonte":"flag --sandbox no comando executado"}`. **Não** `workspace-write`. |
| **G7** | Nº de painéis | ⚪ **n/d** | Não vejo render. Por declaração: só `mooter_work` anuncia painel → 8 chamadas = 8 painéis declarados nesta thread, **acima do esperado (1-2)**. |
| **G8** | `resumo` como 1.ª chave, em PT | ❌ **FALHA (1 de 6)** | ✅ `work`, `worktrees`. ❌ `cancel`→`swept` · `await`→`settled` · `collect`→`job_id` · `status`→`jobs` · `fleet`→`ok`. `status` e `fleet` **não têm uma palavra de português**. |
| **G9** | Títulos distintos · `needs_you` correcto · `savedUsd` oculto | ❌ **FALHA** | 5 de 10 títulos são `"Lê o ficheiro C:\Users\Paulo Loureiro\.mooter\jobs\j"` — **idênticos e truncados no meio do path**. Sessão `2787f932` está `needs_you` sendo um job headless com `collected` no ledger; idem `7224c745`, `964082f3`, `8f807653`. ✅ `savedUsd: null` + nota honesta. |
| **G10** | 2 `work` na mesma wave → 2 etapas | ⚠️ **METADE** | ✅ 5 chamadas → 5 passos S1..S5. ❌ Estado partido: `running: 4` com **0 jobs vivos**; `current: S2` que acabou há 5 min; **S1 tem o `job_id` e o custo do S5** (`by:"cc · claude-opus-4-8"`, `job-ms0ie3os-4f4d`, `$0.4867`) num passo cujo `agent` é `moo`. |
| **G11** | `coherence` acusa · stderr marcado "ambiente" | ⚠️ **METADE** | ✅ Apanhou o certo: `{"level":"aviso","msg":"router pediu opus e correu claude-sonnet-5"}` — faz todo o sentido. ❌ Não apanhou: tier invertido, `tokens_in: 4`, 4 passos `a-correr` mortos. Zero linhas de stderr marcadas "ambiente" apareceram. |
| **G12** | `$0 · tudo local` vs custo desaparecido | ✅ **PASSA** | Wave só-local: `totals.cost_usd: 0` — **presente e `0`**, não ausente, não `null`. `local_share: 100`, `jobs_cloud: 0`. Derivável sem ambiguidade. |

**Placar: 7 ✅ · 2 ⚠️ · 2 ❌ · 1 n/d**

---

## ACHADOS

| # | Achado | Sev | Evidência | Fix numa linha |
|---|---|---|---|---|
| **1** | **`mooter_await` mata o job que está a esperar.** `timeout_s:600` estoirou o timeout do transporte → servidor reiniciou → job morreu. E a nota do próprio `await` recomenda *"aumenta o timeout_s"*. | 🔴 **P0** | `job-ms0iggqi-882b`: `{"event":"failed","exit_code":"orphaned-by-restart"}` aos 79s, `steps_done: 7`, `cost_usd: null`. Nota literal do await: `"volta com mooter_status ou aumenta o timeout_s"` | Capar `timeout_s` no schema (`maximum: 45`) e trocar a nota para "volta a chamar `mooter_await` com o mesmo timeout". |
| **2** | **O `work` manda "lê o ficheiro X" para um motor sem ferramentas, e o resultado inventado é marcado `done`.** | 🔴 **P0** | Goal: *"lê o packages/mooter-bridge/worktrees.js"* → `agent: moo`, `state: done`. Resultado inventou `createWorktree`, `removeWorktree`, `updateWorktree`. **Reais:** `list, firstFree, create, mainRepo`. O próprio `collect` sabia: `"o moo só gera texto, não lê nem escreve ficheiros"` — mas só na 3ª chamada. | Se o goal exigir leitura e o motor não tiver ferramentas → recusar no `work`, não despachar. |
| **3** | **Um commit de 15 ficheiros na árvore principal sem dono no ledger.** | 🔴 **P0** | `git log -1` → `589a9ee` (15 ficheiros, 1279 inserções). O WIP guard viu `job-ms0ik779-57b6`; `mooter_status` desse id → `⚠ nada no ledger para job-ms0ik779-57b6`. | Escrever `dispatched` no ledger **antes** de spawn, sempre — nenhum processo nasce sem linha. |
| **4** | **Tier invertido e instável.** O `moo` local ($0) recebe T2 e T3; o `cc` pago recebe T0. | 🔴 **P0** | `moo` → `tier:"T0"`, depois `"T2"`, depois `"T3"` em 3 chamadas. `cc` (Opus) → `tier:"T0"`. Mesmo job `…62f4`: `work` disse T2, `collect`/`status`/`fleet` dizem T3. | Separar dois campos: `tier_texto` (classificação do pedido) e `tier_motor` (o que correu). Hoje partilham nome. |
| **5** | **`tokens_in` é ficção.** | 🟠 P1 | Job `…62f4`: `tokens_in: 4` para um prompt de ~950 chars que usou `Read` sobre `masterprompt.md`. Comparáveis: `32425`, `100398`, `19334`. `totals.cloud_in: 4` propaga para `local_share: 19%`. | Se o stream não der `input_tokens`, escrever `null` — nunca um número. |
| **6** | **`work` relocou a worktree em silêncio, e para a pior.** | 🟠 P1 | Pedi `frugal-fleet` (ocupada) → correu em `C:/Users/.../AppData/Local/Temp/mooter-pr251-main-…` (**detached HEAD, temp**), com 35 worktrees limpas livres. Nenhum campo diz que mudou. | Devolver `worktree_pedida` + `relocated: true` no `resumo`, e nunca escolher `detached` ou `%TEMP%`. |
| **7** | **O picker escolhe worktree sem olhar se o código está lá.** | 🟠 P1 | `worktrees.js` só existe na árvore principal (não rastreado). `git cat-file -e <branch>:packages/mooter-bridge/worktrees.js` → **NAO TEM** em `chore/mooter-20-h0`, `feat/fleet-metrics`, `feat/integ-g1`, `feat/ledger-p1d`. cc e codex responderam correctamente `NAO CONSEGUI LER`. | Se o goal citar um path, verificar que existe na worktree candidata antes de despachar. |
| **8** | **O plano (a experiência "Watch") mostra jobs mortos a correr e o custo no passo errado.** | 🟠 P1 | `plan get valida-v135`: `running: 4` com `live: 0`. S1 (`agent: moo`) tem `job_id: job-ms0ie3os-4f4d` que é do S5. | Casar job↔passo pelo `job_id` devolvido no dispatch, não por ordem de chegada. |
| **9** | **`needs_you` em jobs headless já terminados.** | 🟠 P1 | `2787f932` → `status: "needs_you"`; o mesmo id tem `collected` no ledger. 4 de 10 sessões assim. | Se a sessão tem job no ledger com estado terminal → `idle`, nunca `needs_you`. |
| **10** | **`tokPerSec` fisicamente impossível.** | 🟡 P2 | `964082f3`: `tokPerSec: 6710` em `claude-opus-4-8`. Também `2408`, `2006`, `1979`. Opus na nuvem faz ~40-80. E o mesmo job dá `46` no ledger e `126` no `sessions_list`. | Usar sempre wall-clock do stream; se não houver, `null`. |
| **11** | **`sessions_list` contradiz o ledger no mesmo job.** | 🟡 P2 | `2787f932`: ledger `tokens_in 4 / out 910 / $0.5101`; sessions `tokensIn 10 / out 2184 / $0.9611`. Nenhum dos dois pares é reconciliável. | Uma fonte só por facto; a outra mostra `↗ ver ledger`. |
| **12** | **`mooter_worktrees` devolve os mesmos 37 registos 3×.** | 🟡 P2 | `worktrees[]` + `livres[]` + string no `resumo` ≈ 9k tokens por chamada. | `livres` passa a array de nomes; tirar a lista do `resumo`. |
| **13** | **Os testes não são herméticos — despacham jobs reais.** | 🟡 P2 | `path.test.js` T3: `FAIL ["posse: worktree já tem job ativo (job-ms0ik779-57b6) — WIP guard"]`; T3b: `Cannot read properties of undefined (reading '0')`. | Ledger e worktrees em tmpdir nos testes. |
| **14** | **Schema mente sobre o que é obrigatório.** | 🟡 P2 | `dispatch`: `required:["agent"]`. `work`: sem `required`. `mooter_work()` vazio é válido. | Pôr `required` a sério nos dois. |
| **15** | **Sem marcador "Avançado"; descrições em inglês.** | 🟡 P2 | Nenhuma das 15 descrições contém "Avançado"/"Advanced". Todas em EN; saída em PT. | Prefixar `[avançado]` em `dispatch`/`route`/`run` e traduzir. |

---

## FASE 7 — O TRABALHO ÚTIL (feito ✅)

**Primeira corrida das 8 suites em Windows nesta versão. 6 passam, 2 falham.**

| Ficheiro | Exit | Passa | Falha |
|---|---|---|---|
| `v12.test.js` | 0 | 20 | 0 |
| `moo.test.js` | 0 | 6 | 0 |
| `audit.test.js` | 0 | 11 | 0 |
| **`path.test.js`** | **1** | 6 | **4** |
| **`worktrees.test.js`** | **1** | 4 | **2** |
| `seamless.test.js` | 0 | 8 | 0 |
| `fleet.test.js` | 0 | 18 | 0 |
| `server.test.js` | 0 | 16 | 0 |

**O mais importante desta secção: as suites já codificam os meus achados.** Não descobri nada novo — descobri o que os teus próprios testes já diziam e ninguém tinha corrido:

```
FAIL T1  degradou em silêncio — o utilizador tem de saber que não foi para a GPU   ← Achado #2/#6
FAIL T7  sem prepare_skipped                                                        ← Achado #6
FAIL     uma worktree ocupada deixa de contar como livre  (1 !== 0)                 ← Achado #6
FAIL     lista a worktree principal com a sua branch — assert.ok(r.worktrees[0].is_main)
```

**Commit:** `589a9ee` · 15 ficheiros · +1279/−117 · **intrusos: NENHUM** (verificado nativamente:
`git show --name-only HEAD | grep -v '^packages/mooter-bridge/'` → vazio). Índice limpo. Zero push.
Os 3 artefactos (`.pre-cw0/`, `README.bundle.md`, `README.md.bundle-src`) ficaram de fora, correctamente.

---

## FRICÇÃO (medida)

| Métrica | Valor |
|---|---|
| Tool calls até ao 1.º resultado | **4** (`cancel` → `work` → `await` → `collect`). Mínimo viável: 3. |
| Segundos até saber que algo acontece | **<2s** — o `work` devolve job id de imediato. ✅ Isto está bom. |
| Segundos até ao resultado (job local) | **2s** |
| Parâmetros que inventei | **5**: `worktree` (paths absolutos Windows decorados), `wave` (nomes livres), `prepare`, `allowedTools` (formato não documentado), `write` |
| Vezes que precisei do terminal | **3** — e as três foram para **verificar se o conector estava a mentir**. Nas três, valeu a pena. |
| Job id devolvido pelo `work` ≠ job que dá a resposta | **sim**, quando há chain. `work` deu `…785b` (o prep moo); a resposta estava em `…62f4`, que só descobri no `await`. |

---

## AS 3 QUE MAIS IMPRESSIONAM (e não estão em destaque)

1. **O guard de argumentos é excelente e ninguém saberia.** `"aspas"`, `'aspas'`, `|`, `&`, `<`, `>`, `;`, `$VAR`, `%PATH%`, crases, `^`, acentos e 🐮🔥 voltaram **literais** — `%PATH%` não expandiu, prova de que o `cmd.exe` nunca lhe tocou. Isto é a parte difícil e está resolvida. Não há um campo, uma nota, nada que o diga.
2. **`allowed_tools_effective` com `fonte`.** Dizer *"flag --sandbox no comando executado"* em vez de *"read-only"* é a diferença entre uma alegação e um recibo. É a melhor ideia do conector inteiro e está escondida na 3ª chamada.
3. **A honestidade quando funciona.** `cost_usd: null` em vez de `0`; `savedUsd` oculto com *"baseline contrafactual all-Opus dava negativo em 8/8"*; `tok_s_basis: "estimativa, job a correr"`; GPU real do `nvidia-smi` (4090, 27%, 48°C, 35W). Quando o Mooter é honesto, é melhor que o Stripe.

## AS 3 QUE MAIS ATRAPALHAM

1. **A ferramenta de esperar destrói trabalho** (#1) — e a mensagem de erro empurra-te para o precipício.
2. **Quatro números para o mesmo facto, todos diferentes** (#4, #5, #10, #11). Não sei o que custou, nem que tier correu, nem quantos tokens entraram. Para um produto cujo fosso é a contabilidade, é fatal.
3. **Três portas para correr, quatro para ler** (Fase 0.1). Não sei qual é a canónica e a errada vende-se melhor.

---

## PRÓXIMA WAVE — 5 fixes por impacto SENTIDO

| # | Fix | Porquê primeiro |
|---|---|---|
| 1 | **Capar `timeout_s` ≤45 e reescrever a nota do `await`** | É o único achado que **destrói trabalho**. Uma linha de schema. |
| 2 | **Ledger antes do spawn, sempre** | Sem isto não há produto: houve um commit sem dono. |
| 3 | **Recusar goal-de-leitura em motor sem ferramentas** | Mata a fabricação na origem. Já tens o campo (`allowed_tools_effective`), falta só ler antes de despachar. |
| 4 | **`tier_texto` vs `tier_motor` + `tokens_in: null` quando não medido** | Faz o painel parar de mentir. Zero trabalho de UI. |
| 5 | **Fundir `run`+`dispatch` sob `[avançado]` e pôr `resumo` como 1.ª chave nas 6 tools** | É a diferença entre 15 tools confusas e 3 óbvias + 4 avançadas. |

Os 4 testes vermelhos em `path.test.js`/`worktrees.test.js` cobrem os fixes 3 e 4 — **verdes = feito**.

---

## BOARD

| Estado | Item |
|---|---|
| ✅ | 8 suites corridas em Windows pela 1.ª vez — 6/8 verdes, 2 vermelhas com causa conhecida |
| ✅ | Commit `589a9ee` local, 15 ficheiros, 0 intrusos, sem push |
| ✅ | G1 morto e enterrado (3 âncoras) · G3 · G4 · G5 · G6 · G12 |
| 🔥 | 3 P0: `await` mata jobs · commit sem dono · fabricação marcada `done` |
| 🟡 | 2 gates falhados (G8, G9) e 2 a meio (G10, G11) |
| ⚠️ | `job-ms0ik779-57b6` visto pelo WIP guard, ausente do ledger — origem por explicar |
| ❄️ | `create_worktree:true` não testado — pedi autorização, não a tenho |

## SOCIO

O motor está bom e tu não estás a ser pago por isso. Em 10 jobs, três motores, Windows, com prompts hostis: **zero corrupções de argumento, zero fugas de permissão, zero jobs pendurados**. Isso é o difícil. O que está partido é a *contabilidade* — e a contabilidade é literalmente o que declaraste como fosso.

O padrão dos 15 achados é um só: **o conector sabe a verdade e mostra outra coisa**. Sabe que o moo não lê ficheiros (`fonte` di-lo) e manda-lhe um "lê o ficheiro". Sabe que relocou a worktree e não diz. Sabe que o job morreu e o processo não morreu. Não é um problema de engenharia difícil — é um problema de **um campo estar no sítio errado**. Cinco fixes pequenos e isto salta de 5.4 para 8.

E o mais barato de tudo: **corre as tuas próprias suites**. Os 4 testes vermelhos descreviam os meus P0 com as minhas palavras antes de eu os encontrar. Pagaste $2.37 a um Opus para descobrir o que `node path.test.js` te dizia de graça.

---

## A PERGUNTA QUE PRECISO DE DECIDIR CONTIGO

O `job-ms0ik779-57b6` segurou a worktree principal, apareceu no WIP guard, coincidiu com o commit `589a9ee` — e **não existe no ledger**. As duas hipóteses são muito diferentes:

**(A)** o `path.test.js` despacha jobs reais no ledger real (achado #13) e este é um deles, mal registado — chato, mas contido nos testes; ou
**(B)** o `orphaned-by-restart` marca o job morto no ledger **sem matar o processo**, e um agente Opus com `write:true` continuou a correr contra a tua árvore principal depois de o sistema o declarar morto — o que significa que **o `mooter_cancel` também não mata nada**, e que qualquer job "cancelado" pode ainda estar a escrever.

**Paro tudo e isolo isto antes de qualquer outra wave, ou aceitas a hipótese (A) e seguimos?**
Se quiseres que eu decida: isolo. Um zombie com escrita na árvore principal é a única coisa aqui que te pode custar trabalho a sério — e é testável em 10 minutos com um job longo, um `mooter_cancel`, e um `Get-Process claude` a seguir.
