# F2 pré-stage — mapa de integração da cascata

Estado: **pré-stage apenas**. A F2 continua `NOT_STARTED`; este artefacto não a fecha nem prova o DoD do Bloco C.

Fontes pinadas e confirmadas neste worktree:

- base: `168f598d19d7fe459191647f075cb3dd7c35d614`
- brief VANTAGEM v1.1: `_handoff/SUPERMASTER_VANTAGEM_2026-08-07_v1.1.md`, sha256 `1ad0fe297aa35272b4c9ddabe2fe9f02dadb8846550837d7c479f837627c6c0b`
- maestro v1.1: `_handoff/MAESTRO_POKEMOO_2026-08-08.md`, sha256 `ff4ae3efe924ad0afdfbea96d38066e5eb4ab012207bf1d9211aaf21575c727b`

## 1. Oráculo existente e enxerto do retry/escalada

O gate não tem de ser reconstruído:

| Peça existente | Evidência real | Consequência para F2 |
|---|---|---|
| Descoberta determinística dos checks declarados | `packages/mooter-bridge/oraculo.js:55-93` | Reutilizar `scripts.test/typecheck/lint/build`; ausência continua `n/d`, nunca verde. |
| Medição determinística | `packages/mooter-bridge/oraculo.js:175-215` | Já distingue verde, vermelho e check que nem arrancou. |
| Comparação causal antes/depois | `packages/mooter-bridge/oraculo.js:218-321` | `followup_quality` é `0`, `1` ou `null`; só `0` pode disparar escalada. |
| Evento de qualidade consumível pelo learner | `packages/mooter-bridge/oraculo.js:324-345` | Já produz `quality_feedback` com `porque`, `tier`, categoria e `job_id`. |
| Prova de entrega de jobs de escrita | `packages/mooter-bridge/oraculo.js:383-469` | A impressão Git impede premiar um job que não escreveu nada. |

O bridge mede **antes** apenas quando `canWrite` é verdadeiro (`packages/mooter-bridge/seamless.js:1902-1905`, `:2175-2183`), mede **depois**, compara e escreve o sinal em `:2331-2358`, e só depois persiste o terminal com `tier_pedido` e `tier_motor` em `:2366-2400`.

**Enxerto exacto:** a decisão mecânica nasce depois de `packages/mooter-bridge/seamless.js:2358`. O retry deve ser agendado a partir daí, mas o terminal pai tem de ser persistido em `:2366-2400` antes de se depender dele como fonte. Quando `toolDispatch` do child devolver, `job_id`, agente e modelo estão disponíveis em `:2437-2458`; o evento `escalated` é então anexado como sideband. Nunca escalar em `followup_quality:null`, em T3 sem braço superior, ou sem `reason` verificável.

### Tarefas sem escrita hoje descobertas

`mooter_work` é análise apenas por omissão (`seamless.js:2984-2986`, `:3365-3378`, schema em `:3677-3687`) e o Oráculo só arranca sob `canWrite` (`:2177`). Ficam fora do gate:

- leitura, resumo, explicação, comparação e extracção (`packages/mooter-bridge/aprender.js:19-26`);
- auditoria/review sem escrita (`packages/mooter-bridge/aprender.js:22`);
- validações pedidas como execução — testes, lint, build ou comandos — quando o job permanece `write:false` (`packages/mooter-bridge/seamless.js:1371-1430`);
- qualquer trabalho `outro` sem mutação e sem check declarativo.

Limite honesto: o Oráculo de regressão prova o estado do repositório, não a correcção semântica de um resumo. F2 pode cobrir mecanicamente tarefas sem escrita que tenham saída verificável (valor exacto, comando/exit code, check declarado). Análises livres sem especificação mecânica ficam `mechanical_score:null`/`n/d`; escalá-las automaticamente fingiria um gate que não existe. Um juiz-LLM continua excluído.

## 2. Os dois pontos da cascata

### 2.1 Política pré-dispatch no hook — depois do safety floor

Ponto de enxerto: entre `tools/router/inject_context.js:1180` e `:1182`.

Dados já disponíveis nesse ponto:

- `prompt`, `sessionId` e a decisão do classifier (`inject_context.js:647-691`, `:974-980`);
- tier, categoria, risco, confiança, backend/modelo/subagent e regra de escalada (`:981-1022`);
- override do utilizador e arbiter já resolvidos (`:730-948`);
- safety boost (`:950-972`), budget cap (`:1069-1086`), modo activo (`:1088-1156`) e safety floor final (`:1159-1180`);
- hardware e perfil de subscrição (`:1010-1016`).

Dados em falta: `job_id`, worktree, capacidade efectiva do motor, modelo realmente executado, resultado do Oráculo, custo/latência terminal e `tier_motor`. O hook decide política antes de existir execução; não pode fabricar esses campos.

Drift confirmado: o evento `classified` é escrito em `inject_context.js:981-1022`, **antes** de budget cap, modo activo e safety floor (`:1069-1180`). Logo esse evento não é recibo do tier pré-dispatch final. F2 precisa de um evento posterior, ligado por ID estável, ou de mover apenas a telemetria final — sem tocar em `classify.js`.

### 2.2 Política pré-dispatch no bridge

Ponto inicial: `packages/mooter-bridge/seamless.js:2997-3014`. Aqui já existem goal, categoria, wave, decisão do classifier, tier e agente inicial. `classifyOrNull()` chama directamente o classifier congelado em `:1695-1719`; o floor HIGH_RISK vem do próprio classifier.

Depois desse ponto ainda mudam dados materiais:

- indisponibilidade local pode trocar `moo` por `cc` (`:3155-3164`);
- quota pode mudar modelo e proveniência (`:3180-3208`);
- local-first e o learner actual podem trocar o agente (`:3210-3257`);
- capacidade de execução pode reenviar para `cc` (`:3286-3315`);
- o dispatch final só ocorre em `:3533-3539`.

Além disso, `toolDispatch` volta a classificar o masterprompt expandido (`:1936-1946`) e reaplica o tecto de quota antes do spawn (`:1947-1959`). O tier persistido nesse caminho é dessa segunda classificação (`:2000-2028`, `:2384-2386`), enquanto o modelo explícito vindo de `toolWork` pode ganhar. Para não colapsar verdades, F2 deve propagar explicitamente o tier final da política de `toolWork` e continuar a calcular o efectivo por `tierDoMotor(agent, model)` (`:1134-1151`).

### 2.3 Escalada pós-Oráculo

Depois de `seamless.js:2358` existem `job_id`, tier pedido, agente/modelo, `oraculoVeredicto`, `followup_quality`, `porque`, falhas novas e prova de entrega (`:2331-2358`). Depois de ler o resultado do processo existem ainda `model_used`, custo, duração e telemetria (`:2303-2325`, `:2380-2399`).

Faltam hoje: ID do evento fonte, política/cap de retry, child job, razão formal não vazia, persistência do `escalated` e ligação ao `attempt_id`. `appendLedgerRecord` só acrescenta timestamp/dimensões e não cria `event_id` (`:231-288`). O `child_job_id` só nasce após `toolDispatch` aceitar o retry (`:2437-2444`).

## 3. `escalated` é sideband NÃO-STATE

Contrato do evento:

| Campo | Fonte correcta | Gap actual |
|---|---|---|
| `source_event_id` | ID estável do `quality_feedback`/resultado mecânico que causou o retry | Nem o evento de qualidade (`oraculo.js:332-345`) nem o ledger (`seamless.js:231-288`) criam ID. |
| `from_tier` | `tier_motor` do pai, não o tier classificado | O terminal já calcula `tier_motor` em `seamless.js:2384-2386`. |
| `to_tier` | `tierDoMotor(child.agent, child.model)` | O retorno do dispatch também traz `tier` pedido em `:2437-2445`; não o reutilizar como efectivo. |
| `reason` | `oraculoVeredicto.porque`, trimado e obrigatório | Existe em `:2353-2358`, mas não é persistido num evento de escalada. |
| `mechanical_score` | `followup_quality` `0|1`; escalada automática apenas em `0` | Existe em `oraculo.js:227-321`. `null` significa abstenção. |
| `child_job_id` | `toolDispatch(...).job_id` | Só existe depois de o child ser aceite (`seamless.js:2437-2444`). |

O perigo é real: `NON_STATE_EVENTS` não contém `escalated` (`seamless.js:346`), e `lastStateRecord()` devolve o último evento que não esteja nesse Set (`:347-355`). Um sideband anexado depois de `done` substitui o terminal.

Consumidores obrigatórios:

1. `toolStatus`: replica a lógica de estado e hoje atribui qualquer evento não listado a `last` (`seamless.js:2462-2517`). Também não projecta os seis campos novos em `j.events` (`:2480-2492`). **Vermelho actual.**
2. `fleet.foldJobs`: só muda state em `dispatched`, `started` ou terminal (`packages/mooter-bridge/fleet.js:98-124`); tier só muda em campos explícitos (`:128-135`). **Já verde com o evento sintético.**
3. `recibo`: deriva os jobs por `fleet.foldJobs` (`packages/mooter-bridge/recibo.js:256-294`) e só fecha pulse quando os jobs continuam terminais (`:297-335`). **Já verde com o evento sintético.**

A bateria está em `packages/mooter-bridge/f2-prestage.test.js:123-207`. O controlo simula o comportamento-alvo antes de cada assert vermelho. Resultado medido: 6 testes, 2 passaram e 4 falharam pela ausência funcional esperada; comando: `node --test --test-isolation=none packages/mooter-bridge/f2-prestage.test.js`.

## 4. UM learner, UM escritor — decisão do dono

Há mais drift que o brief: `preferences.json` **existe** no runtime e no código (`packages/synthesis/src/config.ts:44-49`; exemplos de consumo em `packages/mooter-bridge/quota.js:367-378` e `tools/router/adapter_selection.js:47-72`). Continua excluído para thresholds aprendidos, mas pela doutrina de não criar uma terceira verdade — não por inexistência.

Também já há uma política adaptativa no bridge: cada terminal escreve projecções de aprendizagem (`seamless.js:251-273`) e `aprender.recomendarAgente()` pode trocar o agente no hot path (`:3244-3257`; implementação em `packages/mooter-bridge/aprender.js:397-472`). A decisão F2 tem de dizer se isto fica apenas como leitura/relatório ou é substituído; somar outro learner deixaria de cumprir “UM learner”.

| Opção | Reutilização | Custo de integração | Risco principal | Escritor único possível |
|---|---|---|---|---|
| A — ligar o bandit Thompson existente | `Bandit.decide/observe` e floor doutrinário já existem (`packages/validation/src/bandit/bandit.ts:39-87`; `doctrine-guardrail.ts:29-58`). Estado em `bandit-state.json` (`posterior-store.ts:81-102`). | Criar ponte do runtime CommonJS zero-deps para package ESM/TypeScript (`packages/mooter-bridge/package.json:1-10`; `packages/validation/package.json:1-17`), mapear arms/contexto, ligar outcomes e empacotar a ponte. | Thompson introduz exploração aleatória no hot path; sem coordenação, hook e bridge podem perder updates. O writer actual usa `writeFileSync`, sem rename/lock (`packages/synthesis/src/config.ts:32-35`). `Outcome` exige accepted/custo/latência, mas o Oráculo só dá qualidade mecânica e pode dar `n/d` (`reward-fn.ts:13-55`). | Um único serviço/host escreve `bandit-state.json`; hook e bridge apenas pedem decisão. |
| B — estender backtest + update-router | Já lê `quality_feedback` (`tools/router/backtest.js:126-171`), gera proposta (`:568-582`, `:1238-1243`), `update-router` é o único escritor de `tuning-state.json` (`tools/router/update-router.js:65-102`) e o classifier congelado já o lê (`classify.js:29-51`). | Acrescentar ID estável e tier final/efectivo aos eventos, impedir pairing ambíguo, tornar `router-tuning.json` proposta e manter `tuning-state.json` como único estado runtime. | Aprende por cadência e assinaturas grosseiras; o fallback actual por sessão/tempo pode atribuir feedback ao `classified` errado (`backtest.js:134-167`). A heurística de tuning continua menos contextual que o bandit. | Só `update-router.js` escreve `tuning-state.json`; `backtest.js` escreve uma proposta descartável/reconstruível. |

**Recomendação, não decisão:** opção B. É a única já ligada ponta-a-ponta ao `quality_feedback`, preserva o hot path determinístico, não cria exploração semelhante a A/B e mantém `classify.js` byte-identical. Condições para ser aceitável: (1) evento pós-safety-floor com ID; (2) pairing por ID, nunca apenas sessão/tempo; (3) `aprender.recomendarAgente` deixa de mutar routing ou passa a ser apenas uma entrada do mesmo ciclo offline; (4) `update-router.js` é o único escritor da verdade runtime; (5) `n/d` abstém.

**DECISÃO DO DONO: PENDENTE.** Não implementar A nem B até Paulo escolher. `preferences.json` não é terceira opção.

## 5. Gate de pré-dispatch — oito perguntas

1. **fonte de verdade:** execução e tier efectivo vêm do ledger/terminal (`seamless.js:2366-2400`); policy final precisa de evento após `inject_context.js:1180`; tuning runtime é `tuning-state.json` se B for escolhida.
2. **escritor único:** decisão pendente; recomendação B fixa `update-router.js` como único escritor do tuning e o bridge como único escritor do ledger.
3. **reversível vs irreversível:** estes testes/docs são reversíveis; F2 não faz deploy/push. A alteração de routing só entra após suite, bateria e gate do dono.
4. **script-first:** vermelho executável em `f2-prestage.test.js`; o plano exige comandos e critérios mecânicos antes de tocar política.
5. **projecção vs 2.ª verdade:** `router-tuning.json` é proposta reconstruível; `tuning-state.json` é estado runtime. `preferences.json` fica fora.
6. **degradação graciosa:** Oráculo `n/d`, reason vazio, child recusado ou tier efectivo desconhecido não escalam; preserva-se o terminal e o classifier base.
7. **frozen/allowlist/n-d:** `classify.js` fica intocado; pacotes congelados só entram se a opção do dono e o brief os autorizarem; desconhecido é `n/d`.
8. **custo de reverter:** remover a policy/emitter e restaurar o tuning anterior é local; eventos históricos `escalated` continuam legíveis porque são sideband. O custo maior da opção A é retirar a ponte/bandit state do hot path.

🔍 council 8/8 · objeção mais forte: o brief dizia “um learner”, mas o bridge já contém uma policy adaptativa activa e `preferences.json` existe · resolvida: ambos ficam expostos como drift; a escolha do dono tem de substituir/rebaixar a policy actual e nunca usar preferências como estado aprendido.
