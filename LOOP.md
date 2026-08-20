# LOOP.md — Mooter Learning Loop

Canal de aprendizado contínuo entre os dois terminais. Terminal 2 (executor autônomo local) reporta observações; Terminal 1 (orquestrador estratégico com Opus) valida hipóteses e aprova experimentos. Paulo arbitra quando terminais discordam.

**Propósito:** garantir que Terminal 2 trabalhando sozinho não gere aprendizado que morre no próprio Terminal 2. Todo insight precisa subir para decisão humana (Terminal 1) e eventualmente para memória permanente (MEMORY.md).

**Protocolo:** append-only. Nunca edita entry antiga. Se contradição surge, abre nova entry citando a anterior via `REFUTES: YYYY-MM-DD-slug` ou `REFINES: YYYY-MM-DD-slug`.

**Ciclo de vida de uma entry:**
1. Terminal 2 cria `OBSERVADO` durante sessão autônoma
2. Terminal 1 (Paulo presente) adiciona `HIPÓTESE` — interpretação do que significa
3. Terminal 1 aprova `EXPERIMENTO` com critério de validação
4. Resultado preenchido após experimento executar
5. Se resultado estável e repetido em 3+ entries → Paulo destila para MEMORY.md na review semanal
6. Entry é marcada `ARCHIVED → MEMORY.md#slug`

**Versão do documento:** 1.0 · Abril 2026

---

## OBSERVADO

### 2026-08-20-o-guarda-que-anulou-aquilo-que-vinha-proteger

**Contexto:** reconciliação F0 do `mp-moo-pilot-total`. Nove PRs (#319-#327), e a meio deles um rebase do vault a resolver conflitos num índice gerado.

**Resultado observado:** escrevi um resolvedor automático de conflitos com uma regra por caminho de ficheiro — para `.claude/3rd-brain/index.json`, *regenerar com o `build-index.js` e `git add`*. Correu bem em três commits. No quarto, o commit que estava a ser replayed era exactamente aquele cujo **único propósito era apagar esse ficheiro** — e a minha regra ressuscitou-o. O `git ls-files` continuava a listá-lo depois de um commit chamado *"tirar o índice do git"*.

**O sinal de alarme, nomeado:** **um resolvedor automático que decide pelo CAMINHO do ficheiro e não pela INTENÇÃO do commit.** A mesma forma aparece em três sítios distintos desta sessão:

| onde | a regra | o que ela não via |
|---|---|---|
| rebase do vault | "index.json → regenerar + add" | o commit que o queria apagar |
| `guarda-home.mjs` v1 | "árvore igual antes/depois → OK" | o comando que nem chegou a arrancar |
| guarda da landing (#324) | "menciona `canonical-metrics` → perdoa" | a menção estar num **comentário** |

Nos três casos o guarda ficou **verde** e o defeito passou. Nos três, só se soube por eu tentar parti-lo de propósito depois de escrito.

**Porque importa:** a sessão produziu quatro guardas novos (#325 estático, #326 dinâmico + job Windows, #327 ratchet da higiene, e o `mooter-home.test.ts`). Três deles nasceram com o defeito que vinham caçar. O rigor foi aplicado ao artefacto e não ao instrumento — que é literalmente o achado de `2026-08-18-quatro-estados-neutros-lidos-como-fracasso`, outra vez, noutra forma.

**Fonte:** `git ls-files` do vault depois do rebase; output do `guarda-home` a imprimir OK com `npm` rebentado; suite da landing verde com o literal `'89%'` reposto à mão. Todos reproduzidos, nenhum deduzido.

**Status:** REGISTADO. Ver HIPÓTESE.

---

### 2026-08-20-uma-regra-em-dezanove-copias-nao-e-uma-regra

**Contexto:** as 13 falhas do `packages/cli` no Windows, sempre as mesmas, que mantinham o CLI fora do job de CI recém-criado.

**Resultado observado:** as 13 tinham **uma** causa. `join(homedir(), ".mooter")` existia em **19 ficheiros** de `src/commands/`, e nenhuma das cópias olhava para o `MOOTER_HOME`. No Windows o `os.homedir()` lê o `USERPROFILE` e ignora o `HOME` — portanto cada cópia apontava à casa **verdadeira** de quem corria a suite.

Consequências medidas, não estimadas:

- 13 testes vermelhos → **0**, depois de migrar 6 ficheiros para uma fonte única
- poluição de `npm test` no `~/.mooter` real: **7 artefactos → 2**
- entre os que desapareceram, o `effort.json` com `mode: "high"` — ou seja, **correr a suite mudava o modo de esforço da máquina de quem a corria**
- e é a mesma causa que apagou o `~/.mooter` vivo do dono duas vezes (2026-08-05, 232 eventos; 2026-08-20, o ledger do loop)

**O sinal de alarme, nomeado:** uma decisão que se repete literalmente em N sítios não é uma convenção — é **N oportunidades de divergir**, e o dia em que uma delas tiver de mudar só uma vai mudar. O `packages/cli` até já tinha um `mooterHomeDefault()` exportado; ninguém o usava, e ele próprio ignorava o `MOOTER_HOME`.

**Corolário prático:** meia migração é pior do que nenhuma. Ao migrar o `effort`, o `status` ficou a ler pela casa antiga enquanto o comando já escrevia na nova — e um teste que estava verde ficou vermelho. Duas verdades onde antes havia uma só, errada mas consistente.

**Fonte:** `grep -rln 'homedir(), ".mooter"' packages/cli/src` = 19; suite antes 660/646/13, depois 663/662/0; guarda de poluição com home virgem, antes 7 entradas, depois 2.

**Status:** REGISTADO. Ver HIPÓTESE.

---


### 2026-08-18-quatro-estados-neutros-lidos-como-fracasso

**Contexto:** aterrar dois PRs contra um `main` em movimento. Escrevi quatro vigias em `bash` para esperar pelo CI e mergear.

**Resultado observado:** as quatro falharam, e todas pela mesma razão — cada uma leu um estado **transitório ou neutro** como fracasso terminal:

| estado | li como | era |
|---|---|---|
| `BLOCKED` | recusado | os obrigatórios ainda a correr |
| `BEHIND` | terminal | recuperável com um merge |
| `UNKNOWN` | falhou | o GitHub a calcular (é assíncrono) |
| `cancel` | vermelho | run substituído por um push mais recente |

**Porque importa mais do que parece:** o código do spike levou 281 testes, disciplina de mutação e quatro revisores externos. As vigias que escrevi para o vigiar **não tinham teste nenhum** — e cada defeito só apareceu quando a realidade produziu o estado que eu não previra. A assimetria é o achado: aplicámos rigor ao artefacto e zero ao instrumento que o mede.

**O sinal de alarme, nomeado:** escrever um `case`/`if` sobre estados de um sistema externo sem enumerar o vocabulário **completo** dele. Se o ramo `else` significa «falhou», qualquer estado novo ou desconhecido passa a ser uma falha inventada.

**Fonte:** tarefas em fundo desta sessão; cada falha reproduzida no output do próprio watcher. Contagem medida, não estimada.

**Status:** REGISTADO. Ver HIPÓTESE.

---

### 2026-08-18-sete-vezes-o-codigo-certo-e-o-teste-a-exercitar-outra-coisa

**Contexto:** spike do Slack (`packages/slack-spike`), 41 commits em dois dias, 244 testes, disciplina de mutação aplicada desde o início.

**Resultado observado:** **sete** defeitos em que o código estava certo e o teste exercitava outra coisa. Não foram sete descuidos diferentes — foram a mesma forma sete vezes. Os exemplares mais claros:

- a ligação entre publicador e transporte vivia inline; o teste que escrevi para ela **replicou a ligação** em vez de a chamar, e ficou verde sob mutação;
- o poller vivia dentro de `principal()`, alcançável só com socket, tokens e gate abertos: um crítico externo mutou as suas quatro peças e a suite ficou verde nas quatro;
- `seguirCorrente` conhecia um elo (`prep_from`) dos dois que existem, e o teste construía **à mão** a lista que a produção deriva — provava a parte que nunca esteve partida;
- a última, e a mais cara em vergonha: `SILENCIADOS` movido para dentro de `montar()` (o que os testes chamam) enquanto `principal()` (o que o daemon corre) continuava a referi-lo. **243 testes verdes e o binário a rebentar na primeira linha.** O primeiro teste que escrevi para tapar isso — chamar `principal(--seco)` — **também ficou verde com o bug lá dentro**, porque o modo seco retorna antes de lá chegar.

**Quem encontrou o quê:** dois pelo Paulo a **usar** o produto, dois por mutação, dois por críticos externos (codex/final-reviewer), um por o daemon simplesmente não arrancar. **Zero** por leitura de código.

**Porque é que isto importa mais do que parece:** a suite verde não era falsa por descuido — era falsa por **forma**. Um teste só pode chamar o que tem nome. Enquanto a composição vive inline dentro de uma função grande que exige rede, credenciais e estado, ela é literalmente inalcançável, e o teste que se escreve para ela acaba por ser uma **cópia** dela — que passa sempre, porque testa a cópia.

**O sinal de alarme, agora nomeado:** escrever um teste que **reconstrói** o arranjo em vez de o invocar. Se o teste tem de repetir a ligação para a poder verificar, a ligação não tem nome — e o teste vai ficar verde com o bug lá dentro.

**Fonte:** `packages/slack-spike/poller.js` (cabeçalho documenta a 6ª), `correr.js:ligarPollerAoDaemon` e `ligarPublicadorAoTransporte`, SYNC 2026-08-18 (1)(2)(3). Contagem medida nesta wave, não estimada.

**Quem observou:** CC, ao fim da terceira repetição do mesmo padrão no mesmo ficheiro.

**Status:** REGISTADO. Correcção aplicada foi **estrutural, não remendo**: cada ligação da raiz de composição ganhou nome e export. Candidato a regra geral — ver HIPÓTESE.

---

### 2026-08-07-gap-de-jogabilidade-humana-o-dod-mede-mecanismo-nao-jogo

**Contexto:** fecho do piloto de convicção nº1. O `dod_harness.mjs` (Playwright, determinístico) aprovou 8-9 de 12 itens em cada um dos 9 artefactos da T1. O Paulo abriu os nove para responder ao item 8 (condição de vitória), o único que o harness não verifica.

**Resultado observado:** o humano conseguiu jogar **~1 de 9**. O único jogável foi **ART-1** (run `T1-C-e3`, braço C/ESTATICO): condição de vitória mecânica **genuína** — flood-fill topológico, validado por leitura do código-fonte pelo Cowork — e o Paulo venceu de facto: 58 blocos, cerco fechado, banner disparado.

**Porque é que isto importa mais do que parece:** quatro dos doze itens (2, 3, 4 e 7) são **heurísticos por declaração do próprio `dod_checks.mjs`** — pixel-diff no clique, ausência de input para o NPC, etc. Um artefacto pode passá-los e não ser jogável. Oito de nove foram exactamente isso. **O DoD mede presença de mecanismo, não jogabilidade.** Um score de 9/12 pode descrever um jogo que ninguém consegue jogar.

**Efeito no veredicto do piloto:** reforça a leitura desfavorável já registada — nenhum braço produziu algo jogável de forma fiável, e o único que produziu veio do **braço C**, o mais barato (20,9% do custo de A). **Não** altera os critérios (a), (b) e (c) do §0: esses são de qualidade julgada, custo-proxy e tier, e continuam como estão.

**Fonte:** Paulo (juiz humano, jogou) + Cowork (validação por código). **Não é medição do harness** e está declarado como tal no `dossier-data.json`.

**Quem observou:** Paulo, ao jogar para o item 8; registado por CC.

**Status:** REGISTADO como candidato a **DoD de testes de CONTEÚDO futuros** — **fora do piloto nº2**, cuja spec está congelada (R1: "a régua que chumbou o B é a que tem de aprovar o B′"; mexer no DoD a meio seria mexer na régua). Os veredictos por artefacto ainda **não entraram no pipeline**: o `jogar/JOGAR.md` continua com nove `?` e o item 8 permanece `n/d` nos nove `dod.json`.

---

### 2026-08-07-piloto-tres-defeitos-de-instrumento-numa-manha

**Contexto:** manhã do piloto de convicção (PILOTO_GO dado pelo Paulo). Bateria T1, 3 braços × 3 execuções.

**Resultado observado:** três defeitos no INSTRUMENTO, nenhum no produto, todos capazes de produzir um vencedor falso.

1. **`--settings` partido no espaço.** `driver.mjs` usa `spawnSync(..., {shell:true})` (obrigatório: o `claude` no Windows é um shim, `shell:false` dá ENOENT). Com shell:true o Node concatena args sem escapar (DEP0190). O caminho das settings tem um espaço em "Paulo Loureiro", partia-se, e o CLI respondia `Settings file not found: C:\Users\Paulo`. Só os braços A e C passam `--settings` — **só os controlos morriam**; o braço B (MOOTER) não usa a flag e corria. O piloto ia declarar MOOTER 3-0 contra dois braços que nunca arrancaram. Mesma família dos 18 falsos positivos do cross_check (caminho partido no espaço de "Paulo Loureiro").
2. **Braço vazio registado como "incompleto".** 0 bytes em 3/3 tentativas era gravado como `TECTO ATINGIDO — incompleto` e a bateria seguia. O P0-C prova que correu o código certo; nada provava que o braço correu de todo.
3. **Gate do artefacto inganhável por construção.** `done = existsSync(<wt>/moo-ranch/index.html)`, mas o prompt congelado **nunca diz onde** pôr o ficheiro (verificado: não contém "moo-ranch" nem "worktree"; o caminho vive só na secção *Artefacto esperado*, que o `tarefa()` não envia aos braços). Resultado: 9/9 `TECTO ATINGIDO` com os três braços a reportar `success` e jogos verificados (B: suite headless 23/23; C: página conduzida por CDP; A: screenshot do estado de vitória).

**Dados brutos:** destinos reais, extraídos por grep das transcrições —

- A (3/3): `<worktree>\index.html` (raiz da worktree)
- B e C (6/6): `<tmp>\claude\<chave>\<session-id>\scratchpad\[moo-ranch\]index.html`
- **fuga de isolamento:** B/e2 e B/e3 escreveram em `~\moo-ranch\` e `~\moo-ranch-b\` — HOME do Paulo, fora de qualquer worktree. A transcrição do B/e3 diz textualmente ter encontrado lá *"build anterior (não minha), intacta"*, ou seja **as execuções viram-se umas às outras**; a worktree opaca do §2.3 não isolou.
- `session_ids[0]` do meta.json é igual ao uuid no caminho do scratchpad (verificado no B/e1) — é isso que torna o scratchpad localizável sem reproduzir a derivação da chave-de-projecto.
- Custo da bateria inválida: 158 min de relógio; custo_proxy somado A 9,93 · B 6,67 · C 2,68.

**Quem observou:** CC, durante a execução. Bateria abortada à 2ª execução assim que o defeito 1 apareceu.

**Status:** 1 e 2 corrigidos com teste vermelho primeiro (`b62146cc`, `guardas.mjs` + `guardas.test.mjs`). 3 corrigido no kit v2.2. **Fuga de isolamento para a HOME por corrigir** — `~/moo-ranch` e `~/moo-ranch-b` ficam no disco como prova, à espera de decisão do Paulo.

---

### 2026-08-07-o-contexto-neutro-tem-um-limite-que-nao-se-contorna

**Contexto:** kit v2.2 item 2 (G17) — "a única variável entre braços é o Mooter on/off".

**Resultado observado:** a worktree é um checkout do `frugal`, portanto levava o `CLAUDE.md` e o `AGENTS.md` do Mooter (doutrina de routing, tiers, delegação, local-first) para dentro dos TRÊS braços, controlos incluídos. Isso era neutralizável, e ficou neutralizado.

Mas o `~/.claude/CLAUDE.md` do utilizador **não é removível**: `CLAUDE_CONFIG_DIR` leva as credenciais atrás e o CLI responde `Not logged in` (medido, status 1); `--exclude-dynamic-system-prompt-sections` só MOVE secções para a primeira mensagem, não as remove; não existe `--config-dir`.

**Implicação:** o ambiente do piloto não é livre de doutrina. É doutrina **constante nos três braços** — não variável entre eles. Serve o G17 (não medimos doutrina como diferenciador), mas o `resultado.md` tem de declarar o limite em vez de afirmar "contexto neutro".

**Quem observou:** CC, ao implementar o v2.2.

**Status:** implementado o alcançável (`CLAUDE.neutro.md` idêntico nos 3 braços; `AGENTS.md`, `CLAUDE.local.md` e `.claude/` removidos da worktree). Limite registado em cada `meta.json`, campo `contexto_neutralizado.limite`.

---

### 2026-08-07-baseline-cascata-aprende-b-routou-100-por-cento-t3

**Contexto:** bateria-1 da T1. A bateria está arquivada como inválida para comparar braços, mas o `mix_tiers` de cada run é medição própria e sobrevive à invalidação — não depende do gate do artefacto que falhou.

**Resultado observado:** `mix_tiers` da execução 1 —

- A (TECTO / fable-5): T5 99,1% · T1 0,9%
- **B (MOOTER): T3 100%** — 66 244 tokens, zero noutro tier
- C (ESTATICO / sonnet-5): T2 98,6% · T1 1,4%

O router "tier mínimo viável" mandou **tudo** para T3 numa tarefa de construção de front-end.

**Status:** REGISTADO como baseline oficial da wave pós-piloto **CASCATA-APRENDE** (decisão Paulo + Cowork, 2026-08-07). **Nada implementado agora.** O desenho completo vive na memória do Cowork (`cascata-aprende`). Forma acordada:

- cascata host-side com **verificador moo externo a $0** — nunca self-confidence ("low alignment" medido na literatura);
- thresholds **aprendidos do ledger** em `preferences.json` (bandit-style), com `classify.js` **intocado**;
- rotina semanal de aferição que valida **o verificador** antes do gate.

Métricas-alvo da régua pública: % de chamadas caras evitadas @ <5% de degradação · pick-consistency >90% · custo por tarefa resolvida · Pareto.

⚠️ Ressalva de honestidade: é **um** ponto de dados, de uma bateria arquivada como inválida, numa só tarefa. É baseline de partida para a wave, não evidência de que o router está mal calibrado.

---

### 2026-04-21-classifier-gastou-opus-em-tarefa-descritiva

**Contexto:** inventário descoberta do Mooter gerando `docs/CURRENT-STATE.md`. Tarefa envolvia ler filesystem, concatenar outputs, formatar markdown. Perfil de custo esperado: T0/T1 majoritário.

**Resultado observado:** 32 calls Opus, custo $2.89, economia $0.19 versus all-Opus (≈6% savings). HUD mostrou T3 99%.

**Dados brutos:**
- `Stop says: frugal turn end → 🔴 claude-opus-4-7 ×32 · ❓ unknown ×4 · actual ~$2.89 · saved $0.191 vs all-Opus`
- Ver `docs/CURRENT-STATE.md` para o próprio artefato gerado

**Quem observou:** Paulo (manualmente, olhando HUD pós-inventário)

**Status:** aceito como débito técnico conhecido por decisão explícita. Não investigar até depois da viagem / período de estabilização pós-Fase 0.

---

### 2026-04-21-side-finding-f1-1-mooter-mode-js-sync-manual

**Contexto:** `/mooter-auto` executado após inventário. Beast mode saiu com sucesso, mas revelou bug.

**Resultado observado:** runtime não tinha `~/.claude/tools/router/mooter-mode.js` — shim loader falhou com "Cannot find module './mooter-mode.js'". Sync manual do canônico `frugal/tools/router/mooter-mode.js` resolveu.

**Quem observou:** Terminal 1 durante sessão de `/mooter-auto`.

**Status:** fix aplicado localmente. Follow-up sugerido: incluir em install/sync-to-runtime para tornar runtime `/mooter-auto-capable` a partir de install fresca. Histórico: findings F1.1 original fechado em Sprint B (commit 0a9d05c) cobriu um ângulo, este é manifestação secundária.

---

### 2026-04-21-vram-retention-ollama-zombie-processes

**Contexto:** Durante H1 setup, investigação de VRAM livre após configurar OLLAMA_KEEP_ALIVE=5m.

**Resultado observado:** 5 processos ollama.exe tipo CUDA compute residentes na GPU consumindo ~19GB de 24GB VRAM, mesmo com `ollama ps` retornando vazio. Após taskkill force e novo `ollama serve`, 5 processos subiram novamente (comportamento esperado de Ollama parent+children). VRAM estabilizou em 5694 MiB livres, ainda longe dos 18GB+ esperados pós keep-alive expirar.

**Dados brutos:**
```
memory.free [MiB]
5694 MiB
(ollama ps: vazio)
5 ollama.exe ativos em nvidia-smi
```

**Quem observou:** Terminal 1 — H1 setup session

**Status:** novo

**Priority for Terminal 1:** medium (não bloqueia H1, mas afetará training de LoRA na Semana 4)

---

### 2026-04-21-shells-leaked-evidenciados

**Contexto:** CURRENT-STATE.md mencionou "~20 shells leaked Apr17-18". Durante investigação de Ollama, encontrei evidência concreta.

**Resultado observado:** 5 processos ollama.exe com StartTime de 17/04/2026 (4 dias atrás) continuavam rodando no Get-Process output. Isso valida a observação original do inventário. Processos foram terminados manualmente com Stop-Process + taskkill /F /T.

**Dados brutos:**
```
Name       Id    StartTime
ollama     10272 17/04/2026 10:14:10
ollama     21580 17/04/2026 09:42:21
ollama     47052 17/04/2026 10:14:16
ollama app 42616 17/04/2026 09:42:20
ollama     16500 21/04/2026 09:49:00 (único recente)
```

**Quem observou:** Terminal 1 — H1 setup session

**Status:** novo

**Priority for Terminal 1:** high (hygiene pattern, pode repetir). Sugestão: skill de cleanup automático em mooter-session-boundary fechamento.

---

### 2026-04-21-mooter-terminal-env-not-inherited

**Contexto:** Após configurar MOOTER_TERMINAL=1 via [System.Environment]::SetEnvironmentVariable com scope "User", skill mooter-session-boundary reportou MOOTER_TERMINAL=<unset> ao verificar a env var.

**Resultado observado:** Env vars setadas em User scope persistem no registry Windows, mas processo filho do Claude Code (que foi iniciado antes da var ser setada) não herda. Precisa fechar VS Code inteiro e reabrir para terminais filhos herdarem. Fallback gracioso do skill funcionou (default → Terminal 1).

**Dados brutos:**
```
[System.Environment]::GetEnvironmentVariable("MOOTER_TERMINAL", "User") → 1
$env:MOOTER_TERMINAL (novo PowerShell) → vazio
Claude Code env echo → <unset>
```

**Quem observou:** Terminal 1 — H1 setup session

**Status:** novo

**Priority for Terminal 1:** low (fallback funcionou, problema cosmético). Considerar incluir no mooter-session-boundary: se detectar <unset>, sugerir restart de VS Code.

---

### 2026-04-21-session-boundary-primeira-execucao-sucesso

**Contexto:** Primeira invocação real do skill mooter-session-boundary após instalação via bundle.

**Resultado observado:** Skill carregou (Successfully loaded skill), leu os 4 arquivos canônicos com tamanhos exatos (SYNC 50026, MEMORY 10492, LOOP 7608, TERMINAL-CONTRACT 13317), verificou EMERGENCY_STOP e gpu-lock (ausentes), confirmou branch main, detectou MOOTER_TERMINAL=<unset> com fallback correto, gerou resumo de 5 linhas incluindo referências a Audit 2026-04-19, entries pendentes em LOOP, e sugestão de próxima ação. Tempo: 45s. Custo: $0.257 em Opus.

**Dados brutos:** Ver output do session-boundary em docs/sessions/ (se criado) ou transcript.

**Quem observou:** Paulo (Terminal 1)

**Status:** novo

**Priority for Terminal 1:** validação positiva — protocolo entre terminais operacional.

---

### 2026-04-21-classifier-roteou-correto-duas-vezes

**Contexto:** Durante H1 setup, duas tarefas mecânicas descritivas foram roteadas pelo classifier.

**Resultado observado:**
1. Diff analysis de mooter-continuous-tester.js + mooter-review.js: T0 qwen2.5:3b local conf 85% est save $0.085
2. Configuração de env vars OLLAMA_KEEP_ALIVE + MOOTER_TERMINAL: T0 qwen3:30b local conf 55% est save $0.086

Ambas executaram localmente sem invocar Opus. Qualidade de output foi equivalente ao que Opus entregaria.

**Contraste com mesma sessão:**
- Inventário CURRENT-STATE.md: T3 32 Opus calls $2.89 (miscalibrated, já em LOOP)
- Final-reviewer 3 commits: T3 9 tool uses $0.77 (apropriado para review)
- Este prompt de adicionar entries: T3 Opus $0.171 (miscalibrated — era tarefa descritiva)

**Dados brutos:** outcomes.jsonl dessa sessão (timestamps entre ~17:30-18:00 local).

**Quem observou:** Paulo (Terminal 1) observando HUD

**Status:** novo

**Priority for Terminal 1:** low — quando classifier roteia correto, funciona bem. Casos de miscalibration são os interessantes para investigação futura (ver entry classifier-gastou-opus).

---

### 2026-04-21-drift-bidireccional-canonical-vs-runtime

**Contexto:** investigação a `sync-to-runtime.sh --diff` para fechar CRITICAL-2 do audit 2026-04-19 (triple-location file drift). Sprint A/B/D tinham sido aplicados ao canonical mas o runtime `~/.claude/tools/router/` não reflectia as fixes.

**Resultado observado:** o drift não é uni-direccional — é **bi-direccional** com dois fluxos que nunca se reconciliam. Aplicar `sync-to-runtime.sh --apply` cegamente destruiria trabalho não-versionado do runtime.

**Inventário dos 9 ficheiros divergentes:**

| Ficheiro | Canonical tem mais novo | Runtime tem mais novo |
|---|---|---|
| classify.js | `@ts-check` + JSDoc typedefs, `TUNED_COMPLEXITY_THRESHOLD=0.3` | tuning `generated_at=2026-04-21T10:29:19Z` sample=38364, `TUNED_COMPLEXITY_THRESHOLD=0.35`, TUNED_DEMOTE_* arrays |
| inject_context.js | `@ts-check` + JSDoc, Sprint A fixes | — |
| arbiter.js | `@ts-check` + JSDoc, Sprint A metrics seed from log | — |
| backtest.js | **B4 weight boost (+248 linhas)** | — |
| savings-tracker.js | `sanitizeJson`, `requireEnv`, `sentry-helper` imports (CCA Sprint 8.4) | — |
| shadow-mode.js, pricing.js, event-builder.js | `@ts-check` + JSDoc (CCA Sprint 1.x) | — |
| version.json | v0.9.9 / 2026-04-13 / landing-five-azure-16.vercel.app | **v0.10.0 / 2026-04-17 / mooter.ai** |

**Dois fluxos independentes:**
1. **Dev flow**: edits no repo → commit → mas **nunca chega ao runtime** (sync manual esquecido desde Apr 17).
2. **Tuning flow**: `update-router.js` corre diariamente 02:00 → reescreve `classify.js` do runtime com patches do backtest → **nunca propaga de volta ao repo**.

Resultado: canonical sempre desactualizado em tuning; runtime sempre desactualizado em dev fixes. Sprint A/B/D (fixes) no canonical; tuning 04-21 (38364 samples) no runtime. Ambas versões têm valor diferente.

**Por que isto importa agora:** `inject_context.js` do runtime é o hook que classifica cada prompt. Está sem a fix F5.1 (mode schema union). Se `.mooter-mode.json` for criado com `{beast_mode:true}`, o classifier runtime silenciosamente ignora — UI mente.

**Dados brutos:**
- Sprint commits no canonical: `0cdf73f` (Sprint A), `0a9d05c` (Sprint B), `4d60d9f` (Sprint D)
- `sync-to-runtime.sh --diff` output preservado no transcript desta sessão
- Tamanhos: canonical maior que runtime em 8 de 9 ficheiros (fixes são additive); só `version.json` tem runtime maior

**Quem observou:** Terminal 1 durante investigação pós-abertura em resposta a "faça sua melhor análise e siga em frente".

**Status:** novo — bloqueado em decisão de arquitectura.

**Priority for Terminal 1:** **HIGH**. Três fixes necessárias antes de qualquer sync cego:

1. **Exclude `version.json` do sync script** — runtime é source of truth para versão (actualizado por install/update).
2. **Separar tuning state de classify.js** — mover `TUNED_COMPLEXITY_THRESHOLD`, `TUNED_DEMOTE_*`, `generated_at`, `sample_size` para um `tuning-state.json` runtime-only, carregado dinamicamente. Isto resolve o conflito de fluxo permanentemente.
3. **Só então** propagar canonical → runtime. Preserva type safety + Sprint A/B/D + B4 + Sentry; preserva também tuning patches via nova separação.

Alternativa tática (sem refactor): antes do sync, extrair do runtime `classify.js` as linhas 23-28 (tuning header + threshold + TUNED_DEMOTE arrays), sync, re-injectar. Frágil — qualquer mudança de estrutura no canonical parte o patch.

**Recomendação arquitectónica:** opção 2. Tuning data não é código, não pertence a um ficheiro .js versionado.

---

### 2026-07-02-effectivecwd-heuristica-cwd-mais-recente

**Contexto:** Perfect Handoff LAND & PROVE — a captura (`effectiveCwd` em `tools/router/handoff-journal.js`) journala o worktree onde a sessão realmente commitou, derivado do transcript (Bash `cd` / `git -C`). Regra actual: escolhe o candidato git-context **mais RECENTE** que `gitInfo` resolve a um branch real.

**Resultado observado:** o final-reviewer (Opus) apontou que, se o ÚLTIMO comando git de um turno inspeccionar um worktree DIFERENTE (`git -C /outro/repo log`) DEPOIS de a sessão já ter commitado noutro, o journal pode registar um branch real-mas-errado. Continua *grounded* (nunca inventa um path — só devolve o que `gitInfo` resolve) e é estritamente melhor que o antigo `payload.cwd` fixo. Não re-introduz A Mentira (nunca vaza sha/contagem da árvore partilhada para um campo por-sessão).

**Quem observou:** final-reviewer subagent durante o gate de FASE 4 (verdict SHIP-WITH-NITS; este é um LOW não-bloqueante).

**Status:** aceite como débito técnico conhecido por decisão explícita do Paulo (Opção 1 do gate — não bloqueia o merge). Backlog: pesar candidatos por **proximidade ao commit** (o `cd` imediatamente antes do `git commit …`, não o último `git -C` de leitura) em vez de "mais recente ganha". Alternativa: exigir que o candidato tenha um `git commit`/`git add` no mesmo comando.

---

### 2026-07-03-low1-effectivecwd-work-aware-resolvido

REFINES: 2026-07-02-effectivecwd-heuristica-cwd-mais-recente

**Contexto:** Perfect Handoff v3 (work-aware). O LOW#1 (a "Alternativa" do backlog acima) foi implementado em `tools/router/handoff-journal.js` — só ADIÇÕES, `effectiveCwd` invertido para **work > navigation**.

**Resultado observado:** o LOW#1 morde no vivo — provado com os worktrees reais em disco. Cenário: sessão lançada de `~/frugal` (feat/overclock-moo-p1 @85e238a), turno `cd ../frugal-ph-v3 && git commit` (o TRABALHO) seguido de `cd ~/frugal && git branch -d …` (navegação/limpeza no tree partilhado).
- **ANTES (regra v2.5 "mais recente ganha"):** `Onde: feat/overclock-moo-p1 @85e238a` → o handoff CRUZA (a navegação venceu).
- **DEPOIS (v3 work-aware):** `Onde: feat/perfect-handoff-v3 @3a6d2fb` → o worktree do git-WRITE.

A cura: `_isGitWrite(cmd)` (commit|merge|rebase|cherry-pick|am|revert|worktree add|checkout/switch -b|-c|stash; `status|log|branch -d/-D|rev-parse|show|diff|fetch|remote` e `cd` nu NÃO contam) + `_workCwdCandidates(lines)` (cwd por comando git-write) + `effectiveCwd` na ordem `(a) git-write newest-first → (b) fallback navegação v2.5 → (c) payloadCwd`. Grounded, never-throws, back-compat total (a alínea (b) é byte-identical à v2.5 → zero regressão para sessões sem commit). +7 testes deterministas. `node --test` completo: 15 falhas env pré-existentes idênticas a main, todos os testes de handoff verdes.

**Quem observou:** Terminal 1 (Opus) na sessão PH v3, worktree `../frugal-ph-v3` @ `feat/perfect-handoff-v3` `3a6d2fb`.

**Status:** **RESOLVIDO** (não backlog). Falta apenas a propagação runtime (`/mooter-update` sincroniza `handoff-journal.js` para `~/.claude/tools/router/`) — post-merge; o hook wired `gsd-turn-end.js` já chama `effectiveCwd` (self-check `OK`), por isso o fix conta assim que o ficheiro aterrar em main.

---

### 2026-07-06-vscodeignore-estripava-babel-parser-do-vsix

**Contexto:** LP-3.2 empacotamento. O `.vscodeignore` com `node_modules/**` estripava o `@babel/parser` de TODOS os vsix gerados.

**Resultado observado:** a suite passava (646/646) porque os testes resolviam o parser por hoisting do node_modules do worktree — mas a instalação real do vsix morria com "não consegui interpretar o arquivo". Testes verdes não provaram nada sobre a instalação real.

**Fix aplicado (`2c1a492`):** allowlist no `.vscodeignore` + teste estático que pina o contrato (cruza `vsce ls` com todos os `require()`) + UI honesta (parser-unavailable ≠ parse-error).

**Quem observou:** Paulo + Cowork na prova viva de instalação (2026-07-06).

**Status:** RESOLVIDO. **Regra destilável: prova manual = vsix INSTALADO, nunca o worktree.** Fonte: vault `30-learnings/mooter-live-edit-dia-de-aterragens-2026-07-06`.

---

### 2026-07-06-fence-stale-assimetrica-no-motor-de-edicao

**Contexto:** auditoria total read-only do Live Preview (`_handoff/_archive/2026-07/LIVE_PREVIEW_AUDIT_FINDINGS.md`, 1×P0 · 6×P1 · 7×P2).

**Resultado observado:** o delete $0 é fail-closed (diff-before-write + sha256), mas as edições de texto/classe escrevem **incondicionalmente** — a proteção de staleness existe só num dos caminhos de escrita. P1 grave; fix-masterprompt pronto (FIX-MP da auditoria).

**Quem observou:** wave de auditoria (read-only), confirmado por Cowork.

**Status:** aberto — fix pendente de execução no comboio LP. Ver `docs/strategy/LIVE_EDIT_ROADMAP.md`.

---

### 2026-07-06-p0-arvore-do-preview-nao-e-a-arvore-de-edicao

**Contexto:** edição $0 ao vivo com workspace em `~/frugal` e dev server servindo o worktree `frugal-land-mp52a`.

**Resultado observado:** "✓ aplicado" e a tela não muda — o host resolve `data-insp-path` contra o workspace, mas nada amarra árvore de edição → árvore servida. O preview mente por omissão. Deixou rasto uncommitted em `landing/app/page.tsx` de outro worktree (incidente forense 06:49).

**Quem observou:** Paulo ao vivo (2026-07-06); triagem do rasto pendente.

**Status:** **P0 aberto** — FIX-MP-1 (amarrar edição à árvore servida) deve preceder o LP-6 publish. Lição de processo associada: **OK de merge é condicional** — se o veredicto adversarial mudar entre o OK e o merge, o CC para e re-pede.

---

### 2026-07-12-worktree-sprawl-esconde-wip-real

**Contexto:** consolidação do repositório após o PR #246. O Git nativo do Windows encontrou 40 worktrees:
28 limpos e 12 sujos. O diretório pretendido como canónico (`C:\Users\Paulo Loureiro\frugal`) sozinho tinha
25 alterações rastreadas e 1562 não rastreadas, misturando código, documentos, projeções e artefactos gerados.

**Resultado observado:** contar pastas ou apagar pelo nome não distingue uma branch histórica limpa de WIP real.
A unidade segura de consolidação é `worktree + branch + HEAD + dirty + ancestralidade em origin/main`. Branches
podem continuar preservadas no Git sem ocupar uma pasta; worktree sujo nunca é removido antes de classificar e
preservar cada alteração. Handoffs Guardian UUID são projeções regeneráveis do Ledger e não devem poluir `status`.

**Quem observou:** Codex, por auditoria mecânica local confrontada com GitHub (2026-07-12).

**Status:** em resolução — fix H2 preservado em branch própria; remoção física dos worktrees aguarda gate nominal
do Paulo. Regra destilável: **primeiro preservar a identidade e o WIP; só depois reduzir as pastas**.

---

### 2026-07-16-phase-a-gate-untracked-enganou-3-agentes

**Contexto:** ciclo de remediação F1–F3. `PHASE_A_GATE.md` foi criado a 10/07 e nunca commitado.

**Resultado observado:** o ficheiro não-commitado enganou 3 agentes em cadeia (auditoria → masterprompt
→ executor). Um `git add` faltando custou 6 dias de verdade divergente.

**Quem observou:** Cowork (2026-07-16), ao fechar o ciclo de remediação F1–F3.

**Status:** hipótese e experimento registados na secção HIPÓTESE. Relaciona-se com
`2026-07-12-worktree-sprawl-esconde-wip-real` (mesma raiz: trabalho não-durável).

---

### 2026-07-16-auditoria-d1-h8-citada-mas-inexistente

**Contexto:** o `MOOTER_20_TRUST_RELEASE_MASTERPROMPT.md:36` fundamentou a fase H1 (de-clutter do
Cockpit) numa "densidade N/V na auditoria **D1-h8**". O executor foi ler a auditoria antes de cortar.

**Resultado observado:** **a auditoria não existe.** A string `D1-h8` ocorre **exactamente uma vez em
todo o repo — dentro do próprio masterprompt que a cita como fonte**. Citação auto-referencial: o
documento é a única prova de si mesmo. O executor marcou a densidade como `UNVERIFIED` em vez de a
repetir como facto, e o inventário mediu o código directamente — foi assim que caíram mais 3 premissas
do mesmo masterprompt (`extension.js` 823.184 bytes ≠ ~332KB · 8 tabs ≠ 5 superfícies · 7 comandos ≠ 5).

**Quem observou:** CC (2026-07-16), ao executar o H1 do ciclo Mooter 2.0.

**Status:** registado pelo Paulo como o **7º ponteiro morto** do ciclo. Difere dos anteriores (FC-1..FC-8,
onde o alvo citado simplesmente não existia): aqui o ponteiro **aponta para si próprio**, o que o torna
invisível a um pointer-check ingénuo — o ficheiro citado existe, o conteúdo citado não. Reforça o job L0
`pointer-sentinel` da Harmony Mesh (ver HIPÓTESE de `2026-07-16-phase-a-gate-untracked-enganou-3-agentes`):
o check tem de validar **o conteúdo citado**, não só a existência do path. Regra destilável: **um
masterprompt não pode ser a única prova das suas próprias premissas.**

---

### 2026-07-16-allowlist-com-paths-errados-executor-parou

**Contexto:** masterprompt do ciclo de remediação emitido com allowlist inválida — o Cowork citou
`packages/vscode-extension` para ficheiros que vivem em `tools/router`.

**Resultado observado:** o executor bloqueou escopo corretamente em vez de improvisar.

**Quem observou:** Cowork (2026-07-16).

**Status:** learning aceite — o comportamento certo do executor diante de allowlist inválida é
STOP+confronto, e o autor do masterprompt deve rodar pointer-check antes de emitir (vira job L0).

---

### 2026-07-16-teste-de-copy-pinou-claim-publica

**Contexto:** teste de copy `lp-p1a-w2` a pinar claim pública durante alteração de copy.

**Resultado observado:** o teste falhou ao mudar a copy — funcionou como contrato.

**Quem observou:** Cowork (2026-07-16).

**Status:** learning aceite — testes que pinam claims públicas são o mecanismo certo
anti-marketing-drift; atualizar o pin junto da copy aprovada, nunca afrouxar para regex genérica.

---

### 2026-08-15-clone-raso-produziu-tres-premissas-falsas-em-canon

**Contexto:** arranque da fase F0 de GPU-por-pilar. O masterprompt e o bloco 📥 do `SYNC.md`
mandavam aterrar o `local-loop-runner` a partir de `feat/fleet-local-runner @ef51a37`, declarada
"ausente neste clone Mac", com instrução de reconstruir da spec §11 se o fetch não a trouxesse.

**Resultado observado:** as três premissas eram falsas, e a causa era a mesma. O clone
`~/frugal` estava `--depth` (raso) com refspec de um só ramo
(`+refs/heads/main:refs/remotes/origin/main`) e 135 commits atrás.
(1) A branch **existe** — `1c06e5ae`, uma de 175 no servidor; `git fetch` não a trazia porque o
refspec só pedia `main`. (2) O sha `ef51a37` **nunca existiu** — não é objecto git nem com o
repo completo. (3) O runner **já estava em main** desde `1c0c077a`: `main` é superconjunto da
branch, os 12 ficheiros lá estão, suite nativa 11/11 verde. O contador P8 idem — `board.js` já
calculava `interrupcoes_por_dia` do ledger, com `n/d` honesto.

**Porque é que isto importa mais do que parece:** o erro não estava no clone — estava no facto de
o diagnóstico do clone ter sido escrito em canon como se fosse o estado do repositório. Uma
sessão que confiasse no bloco teria reconstruído 1764 linhas que já existiam, e provavelmente
teria aberto um PR a duplicar `packages/fleet-commander/`.

**Regra mecânica que sai daqui:** `git branch -r` é a verdade do teu clone; `git ls-remote` é a
verdade do servidor. Antes de reconstruir seja o que for a partir de uma spec, confrontar o
segundo — e verificar `git rev-parse --is-shallow-repository` **antes** de concluir "não existe".
Aplicado já: o workflow novo `docs-hygiene.yml` faz checkout com `fetch-depth: 0` por esta razão,
com o porquê escrito no ficheiro.

**Quem observou:** CC (Claude Code, Mac mini), sessão de 2026-08-15.

**Status:** REGISTADO. Bloco do `SYNC.md` corrigido na mesma sessão.

---

### 2026-08-15-o-kill-switch-so-cumpria-a-meta-no-modelo-em-que-ninguem-trabalha

**Contexto:** F3 — construir o STOP (`~/.mooter/stop.json`), que não existia em código nenhum
(só citado nos masterprompts). Primeira implementação: gate verificado **entre turns** do loop,
com meta declarada de <5s da queda do switch até a GPU ficar livre.

**Resultado observado:** o drill com fila de 6 jobs deu **232ms com `qwen2.5:3b`** e
**6327ms com `gpt-oss:20b`** — contra uma meta de 5000ms. Ou seja: passava no modelo mais
pequeno e falhava exactamente no modelo em que um pilar corre de facto. O limite inferior nunca
foi o gate; era o *turn* já em voo, que o gate entre-turns espera até ao fim por construção.

**Correcção:** watcher a sondar o STOP **durante** a chamada (`peek()` sem efeitos colaterais +
`AbortController` propagado ao fetch do Ollama). O **mesmo** `gpt-oss:20b` passou a **117ms** —
54× melhor, meta cumprida com folga. Trancado num teste que falha se o loop voltar a esperar
pelo turn.

**Regra que sai daqui:** um kill-switch medido só com o modelo mais rápido é um kill-switch por
medir. E a métrica publicável não é a latência do mecanismo (`t_refuse`), é o tempo até a GPU
estar mesmo livre (`t_idle`) — o drill passou a reportar as duas em separado, precisamente para
não se poder citar a bonita.

**Quem observou:** CC, ao correr `_handoff/loop/stop-drill.mjs` (o drill é o artefacto, e fica
no repo para se repetir por device).

**Status:** REGISTADO e corrigido em `feat/f3-stop-killswitch`.

---

## HIPÓTESE

### Sobre 2026-08-18-quatro-estados-neutros-lidos-como-fracasso

**Hipótese:** «não sei ainda» e «correu mal» são estados diferentes, e o código que os confunde produz **falsos negativos silenciosos** — pára trabalho são e chama-lhe erro. É o irmão do defeito que o `LOOP` já regista: lá, silêncio a passar por sucesso; aqui, incerteza a passar por fracasso.

**Corolário testável:** qualquer poller sobre um sistema externo deve declarar três conjuntos disjuntos — **terminal-bom**, **terminal-mau**, **ainda-não-sei** — e o `else` cai no terceiro, nunca no segundo. Verificável por inspecção e barato.

**Experimento:** na próxima vigia, enumerar o vocabulário de estados a partir da documentação da API **antes** de escrever o `case`, e testar o ramo desconhecido com um estado inventado. Se o watcher o tratar como falha, está errado por construção.

**O que ainda não sabemos:** se vale a pena um helper partilhado para isto ou se o custo é só a disciplina de enumerar. Quatro instâncias numa sessão sugerem que a disciplina sozinha não chega.

---

### Sobre 2026-08-18-sete-vezes-o-codigo-certo-e-o-teste-a-exercitar-outra-coisa

**Hipótese:** numa raiz de composição, **cada ligação sem nome é uma ligação sem teste**. Não é uma tendência — é uma consequência: o que não tem nome não pode ser invocado, e o teste que se escreve para o verificar torna-se uma réplica que passa sempre.

**Corolário testável:** se um teste **reconstrói** o arranjo em vez de o chamar, mutar a produção deixa-o verde. Isto é verificável mecanicamente e barato.

**Experimento:** em toda a raiz de composição (`correr.js` e equivalentes), extrair cada ligação para função **nomeada e exportada**, e exigir que cada uma tenha um teste que a **invoque** (não que a replique). Medir com mutação: apagar a linha da ligação tem de dar vermelho. Neste spike a extracção foi feita três vezes (`ligarPublicadorAoTransporte`, `poller.js`, `ligarPollerAoDaemon`) e nas três a mutação passou a ser apanhada.

**O que ainda não sabemos:** se a regra se aguenta fora de raízes de composição, e qual o custo em legibilidade de nomear ligações triviais. Não extrapolar antes de a aplicar noutro pacote.

---

### Sobre 2026-07-16-phase-a-gate-untracked-enganou-3-agentes

**Hipótese:** trabalho não-durável (untracked/uncommitted/gitignored) é a fonte nº1 de falha de
comunicação multi-agente.

**Experimento:** checkers L0 da Harmony Mesh (orphan-watch, pointer-sentinel) — cada um mapeado a uma
falha FC real deste ciclo.

---

### Sobre 2026-04-21-classifier-gastou-opus-em-tarefa-descritiva

**Hipótese A — final-reviewer disparando em sub-steps** (probabilidade: média-alta)

Tarefa de inventário criou muitos arquivos e seções intermediárias. Se `final-reviewer` está sendo invocado após cada seção significativa em vez de só antes de push, os 32 calls Opus fazem sentido matematicamente. Investigação necessária: log de quando `final-reviewer` foi chamado versus quantas vezes ferramentas de filesystem foram usadas.

**Hipótese B — patterns de "audit" ou "inventário" classificam como T3 arquitetura** (probabilidade: média)

O classifier tem 167 regex patterns. Se palavras como "inventário", "canonical", "audit", "descobrir" caem em patterns que foram tunados para arquitetura crítica, todo prompt dessa família sobe para T3. Investigação: backtest do prompt inicial contra `patterns.js`.

**Hipótese C — beast mode residual em cache** (probabilidade: baixa)

`.mooter-mode.json` foi deletado por `/mooter-auto` antes da investigação começar, mas algum cache de sessão anterior pode ter persistido em `.mooter-review-state.json` ou similar. Investigação: grep por referências a `beast` ou `FORCED` em arquivos de estado.

**Hipótese D — três hipóteses juntas** (probabilidade: média)

Não são mutuamente exclusivas. Custo de $2.89 pode ser 40% hipótese A + 40% hipótese B + 20% outra coisa.

**Decisão de Paulo:** investigar depois da viagem / estabilização. Documentar como risco rastreado em SYNC.md seção "débitos técnicos conhecidos". Monitoring: toda sessão acima de $1 em Opus agora deve disparar entry nova em LOOP.md `OBSERVADO` automaticamente (skill a criar).

---

### Sobre 2026-04-21-side-finding-f1-1-mooter-mode-js-sync-manual

**Hipótese A — script de install não cobre runtime/canonical sync** (probabilidade: alta)

F1.1 original (fechado em Sprint B) provavelmente cobriu o bug específico de schema union no classifier, não o ciclo de vida dos arquivos runtime. Install atual pega canonical mas não espelha para runtime em `~/.claude/tools/router/`.

**Hipótese B — `/mooter-update` deveria incluir esse sync** (probabilidade: alta)

Output do próprio Claude Code disse: "o próximo /mooter-update já o sincroniza automaticamente, mas ficaste bloqueado sem este sync manual". Sugere que /mooter-update já tem a lógica — só precisa rodar pelo menos uma vez após install.

**Decisão pendente:** verificar se `/mooter-update` de fato sincroniza mooter-mode.js. Se sim, documentar em install.sh como passo obrigatório pós-install. Se não, implementar.

---

### Sobre 2026-04-21-drift-bidireccional-canonical-vs-runtime

**Hipótese única (probabilidade: alta)** — Opção 2 do OBSERVADO (separar `tuning-state.json` de `classify.js`) é a solução arquitectónica correcta, não apenas tratamento de sintoma.

**Por que é a solução e não um paliativo:**

1. A raiz do drift é estrutural: tuning state mutável e código executável vivem no mesmo ficheiro. Qualquer pipeline que escreva tuning precisa parsear e reinjectar blocos de código — frágil por natureza e invisível ao git (porque tanto código como tuning são `.js`).
2. Opção 1 (excluir `version.json` do sync script) trata apenas 1 de 9 ficheiros. O drift em 7 outros (classify.js código vs tuning, type safety vs TUNED_BLOCK) continua a acontecer em cada backtest nocturno.
3. A opção tática (patch runtime → canonical pré-sync) é anti-pattern: encoda stale tuning em ficheiros versionados, commits ruidosos diários, e a história do git fica poluída com mudanças semânticas zero.

**Critério de confirmação:** após refactor, `sync-to-runtime.sh --apply` preserva tuning em runtime + propaga code changes sem destruir estado. Testes 42+ green pós-refactor.

**Risco identificado + mitigação:** `loadTuningState()` em classify.js tem que ter fallback defensivo, caso contrário fresh install falha em tempo de `require()` do classifier, e o hook `inject_context.js` passa a devolver `claude_session` em todos os prompts (router inoperante). Mitigação: try/catch + `tuning-state.defaults.json` (canonical seed committed). Se ambos falharem (ENOENT em defaults committed é impossible), o hook é fail-safe por design — nunca bloqueia prompts.

---

## EXPERIMENTO

### 2026-04-21-externalize-tuning-state

**Hipótese-alvo:** `2026-04-21-drift-bidireccional-canonical-vs-runtime` — Opção 2 (separar `tuning-state.json` de `classify.js`)

**Critério de validação:**
- `sync-to-runtime.sh --diff` reporta `0 diverged` (era 9)
- classify.test.js 3/3 + classify-branches.test.js 20/20 + sanitize.test.js 19/19 green
- Smoke canonical + runtime classify.js retornam JSON válido com mesmo tier pré/pós-refactor
- Runtime tuning state preservado através do refactor (threshold 0.35, sample 39593, 3 demote patterns)

**Procedimento:**
1. Phase 1 scaffold non-destructive (commit `5c41888`): `tuning-state.defaults.json` canonical seed + `.gitignore` entry + `sync-to-runtime.sh` exclude comment + `docs/DRIFT-RESOLUTION-PLAN.md` plano completo
2. Phase 2 core refactor (commit `d118e55`): `classify.js` com `_loadTuningState()` fallback-safe + `update-router.js` escreve `tuning-state.json` (JSON) em vez de editar classify.js
3. Seed runtime `~/.claude/tools/router/tuning-state.json` a partir do estado live de runtime classify.js pré-refactor (evita perder tuning acumulado em 4 dias)
4. Sync canonical → runtime (9 ficheiros)
5. Smoke tests canonical + runtime + `sync-to-runtime.sh --diff`
6. Final-reviewer gate → push `main`

**Owner:** Terminal 1 (Opus 4.7, sessão #36, 2026-04-21)

**Cost ceiling:** ~80 tool calls + 3 final-reviewer gates (estimativa pré-execução). Atingido dentro do orçamento.

**Resultado:**
- `sync-to-runtime.sh --diff`: `0 synced, 23 identical, 0 diverged` ✅
- Testes: **42/42 green** (sanitize 19, classify 3, classify-branches 20). backtest.test.js + env.test.js + classify-retry.test.js não re-executados (não afectados pela refactor — nenhum testa TUNED_BLOCK nem fs.readFile em classify.js) ✅
- Smoke canonical `classify.js "hello world"` → T0 trivial_local, qwen2.5:3b ✅
- Smoke runtime `classify.js "hello world"` → T0 trivial_local, qwen2.5:3b (idêntico ao canonical) ✅
- Smoke runtime `classify.js "proxima vamos continuar"` → T0 com demote pattern `\\bproxima\\b` a disparar via runtime `tuning-state.json` (preservado) ✅
- Runtime `tuning-state.json` contém estado seeded `2026-04-21T15:37:26.739Z` (sample 39593, threshold 0.35, 3 demote patterns) ✅
- node --check em ambos ficheiros: OK ✅
- Final-reviewer gate (commit d118e55): PASS, zero blockers ✅

**Conclusão:** **CONFIRMA** — Opção 2 é a solução correcta. Drift resolvido definitivamente: pipeline de tuning agora é idempotente e não afecta código versionado.

**Próxima acção:**
- Aguardar próximo scheduled backtest (02:00 próximo ciclo) para validar que `update-router.js` refactored escreve `tuning-state.json` correctamente em runtime. Se OK → mais 2 ciclos estáveis → destilar em `MEMORY.md` como princípio geral ("externalizar mutable state de código executável sempre que o pipeline de escrita não está sob controlo do git"). Arquivar este entry quando destilado (`ARCHIVED → MEMORY.md#slug`).
- Phase 3 cleanup de artifacts legacy (`classify.js.bak`, `classify.js.sync-bak`, `backtest.js.bak`, `backtest.js.sync-bak`) opcional, pós-estabilização de 1-2 dias sem incidentes.

---

Template para entries futuras:

```
### YYYY-MM-DD-slug
**Hipótese-alvo:** link para hipótese sendo testada
**Critério de validação:** condição objetiva que determina resultado
**Procedimento:** passos mecânicos de execução
**Owner:** Terminal 1 ou Terminal 2
**Cost ceiling:** máximo de custo aceitável para o experimento
**Resultado:** preenchido após execução
**Conclusão:** CONFIRMA / REFUTA / INCONCLUSIVO
```

---

## PERGUNTA_URGENTE

Seção reservada para Terminal 2 levantar dúvidas que bloqueiam continuação da tarefa. Paulo verifica via iPhone dispatch ou Terminal 1.

Formato:
```
### YYYY-MM-DDTHH:MM — Terminal 2
Pergunta: [pergunta concreta]
Contexto: [o que o Terminal 2 estava fazendo]
Bloqueio: [o que o Terminal 2 fez — aguarda / executou cautelosamente / abortou]
```

(seção vazia inicialmente)

---

## ARCHIVED

Entries destiladas para MEMORY.md aparecem aqui com link. Não são deletadas de LOOP.md — só marcadas.

(seção vazia inicialmente)

---

## Protocolo de append por Terminal 2

Ao final de qualquer sessão autônoma, Terminal 2 executa skill `mooter-loop-append` que:

1. Coleta o que foi observado (nova info sobre o sistema, padrões inesperados, resultados surpreendentes)
2. Formata como entry `OBSERVADO` com slug `YYYY-MM-DD-descrição-curta-kebab`
3. Append em `LOOP.md` seção `OBSERVADO`
4. Se há pergunta bloqueante, adiciona entry em `PERGUNTA_URGENTE`
5. Commit: `loop: terminal-2 observation YYYY-MM-DD-slug`
6. Nunca edita entries antigas, nunca escreve em HIPÓTESE ou EXPERIMENTO, nunca destila para MEMORY.md

## Protocolo de escrita por Terminal 1

Terminal 1 pode:

- Adicionar HIPÓTESE a qualquer OBSERVADO
- Criar EXPERIMENTO para testar hipótese
- Preencher resultado de EXPERIMENTO
- Responder PERGUNTA_URGENTE (move para OBSERVADO com tag `[RESPONDIDA-PAULO]`)
- Marcar entries como ARCHIVED após distillation semanal

Terminal 1 não deve criar OBSERVADO diretamente — se observou algo novo, usa skill `mooter-loop-append` como Terminal 2 faria. Isso mantém consistência de formato.
