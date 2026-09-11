#!/usr/bin/env node
/**
 * custo-analise.mjs — a análise congelada do teste de custo (custo-2026-09-10).
 *
 *   node tools/ab/custo-analise.mjs [--prereg f] [--ledger f] [--out f]
 *
 * Escrito e commitado ANTES da corrida, como o pré-registo exige (CUSTO-17).
 * Lê SÓ o pré-registo e o ledger. Produz SEMPRE todos os campos do resultado,
 * independentemente da direcção. Nunca imputa: ausente é `null` e propaga-se —
 * uma razão com null no numerador é null; um braço com 0 aceites tem
 * «por aceite» INDEFINIDO, nunca zero nem infinito.
 *
 * O que é uma tentativa: um evento `tentativa_fim` do ledger. Este ficheiro
 * não relê worktrees nem corre testes. Confia no `aceite` do ledger SÓ
 * quando a prova está TODA registada e é coerente com ele (19); confia no
 * `arrancou` SÓ quando não contradiz a evidência da própria linha (22);
 * confia nos tokens SÓ quando `modelUsage` tem a forma e o modelo esperados
 * (18, 20). Se o ledger não tem, o resultado não tem.
 *
 * Tokens de Opus: SÓ de `modelUsage` cujas chaves comecem por `claude-opus`.
 * `usage` é o total da invocação (todos os modelos) e serve de reconciliação:
 * se `usage.output_tokens` for menor do que a soma dos `outputTokens` de todos
 * os modelos, a extracção está errada e o par é marcado.
 *
 * INTERPRETAÇÕES CONGELADAS COM ESTE FICHEIRO. Cinco revisores pré-push
 * construíram ledgers de controlador defeituoso ou morto a meio que saíam
 * com alegação favorável. O 5.º leu o `correr-r24.mjs`/`mooter-use-ab.mjs`
 * que o controlador vai reutilizar e mostrou que três dessas classes são o
 * CAMINHO POR OMISSÃO desse reuso: `validarCorrida().invalido` (max turns,
 * is_error) escrito como `arrancou:false` numa invocação que chegou ao Opus;
 * `correrAceitacao()` que não devolve contagens de testes; retoma que
 * reescreve a mesma tentativa até verde. O que se segue é o que o código
 * faz, escrito para que a corrida não o descubra depois:
 *
 *  1. Passo local (`executor: 'router-execute'`): tokens de Opus ZERO POR
 *     CONSTRUÇÃO. `usage`/`modelUsage`/`total_cost_usd`/`session_id` são null
 *     e isso NÃO marca. Se trouxer `modelUsage`, marca `local_com_modelUsage`,
 *     os tokens continuam zero. ARRANCOU se `arrancou === true`, ou se
 *     `arrancou` é null e existe `texto_local_sha256`. Sem `tokens_locais` ou
 *     `modelo_reportado`: marca `campo_em_falta`.
 *  2. `arrancou` de um BRAÇO = a última tentativa arrancou. Um passo local
 *     que não arrancou e foi escalado é marca `local_nao_arrancou` — não
 *     invalida o par. Uma tentativa não-local com `arrancou !== true` marca
 *     `tentativa_nao_arrancou` (e `campo_em_falta` se for null).
 *  3. Consumo ZERO por construção SÓ para uma tentativa com `arrancou ===
 *     false`, sem NENHUMA evidência de arranque (22), `motivo_se_nao` a
 *     começar por `spawn:` e SEM «timeout»/«ETIMEDOUT» no motivo (o
 *     `spawnSync` deste Node devolve `error.code=ETIMEDOUT` E
 *     `signal=SIGTERM` no mesmo timeout; a grafia depende da ordem dos `if`),
 *     e CURTA (28) — a definição do pré-registo («spawn:* sem JSON nem
 *     transcript»). Qualquer outro
 *     não-arrancou sem JSON tem consumo
 *     DESCONHECIDO. Uma tentativa que arrancou e ficou SEM JSON NENHUM
 *     (nem `usage` nem `modelUsage`): se o ledger trouxer `tokens_transcript`
 *     ≥ `TRANSCRIPT_MINIMO`, é essa a fonte (categorias null, valorização
 *     null, marca `consumo_do_transcript`); senão null e marca
 *     `consumo_desconhecido`. `tokens_transcript: 0` é «não encontrado». Um
 *     JSON que chegou parcial nunca cai no transcript (35). Um passo local com
 *     evidência de CLI: consumo null e corrida INVÁLIDA (30 —
 *     `local_com_evidencia_de_cli`; o texto antigo desta interpretação dizia
 *     «tokens continuam zero» e estava desactualizado).
 *  4. «Corrida fechou» = TODAS as tarefas em jogo têm tentativa nos DOIS
 *     braços (ou um evento `par_invalido` que feche o par) E não há evento
 *     `paragem`. Tarefa sem tentativa nem evento vai para `nao_corridas`;
 *     tarefa com um braço só e sem `par_invalido` é par inválido «sem
 *     tentativa registada»; `par_invalido` sem tentativa é par inválido com o
 *     motivo do evento. Tarefa excluída SEM suplente fica em jogo e não
 *     corrida: o denominador é sempre o do pré-registo.
 *  5. «Corrida válida» (`corrida_valida`: true | false | null; um `null` em
 *     `estado_vivo_sha` ou no `modelo_reportado` de um passo local → n/d,
 *     porque um null não prova que não houve mudança — 30):
 *     FALSE se alguma condição INVALIDANTE se verificar — as do pré-registo
 *     (`estado_vivo_sha` a mudar; digest do modelo local a mudar;
 *     `sentinela_presente === false`) e as que denunciam controlador
 *     partido (8, 14, 15, 18, 19, 20, 21, 22, 23, 26); NULL (n/d) se nenhuma
 *     violação mas a prova não existe — alguma tentativa sem
 *     `sentinela_presente === true`, ou nenhuma com `estado_vivo_sha`, ou
 *     sem tentativas; TRUE só com a prova completa. As órfãs contam. Cada
 *     violação em `corrida_invalida_por`.
 *  6. O VEREDICTO (`limiar_descritivo_cumprido`, global e por tier) só existe
 *     com corrida fechada E `corrida_valida === true` E ≥ 1 par válido no
 *     estrato; senão é null e o CLI diz porquê. Tabela 2x2, Wilson e Tango
 *     são publicados sempre como descritivos do que correu, com `AVISO`.
 *     `veredicto_vacuo: true` quando `aceites_A − 2 ≤ 0` (o critério é
 *     verdadeiro por aritmética, seja qual for B) e `AVISO_N` quando há
 *     menos pares válidos do que tarefas no pré-registo.
 *  7. Pré-voo: evento `pre_voo`, UM por tarefa — o PRIMEIRO decide; repetido
 *     marca `pre_voo_repetido` e invalida (29). `falhou` booleano manda, senão
 *     `exit_code !== 0`. Fica o ÚLTIMO por tarefa. Tarefa que correu (com
 *     tentativa OU `par_invalido`) sem `pre_voo` → marca `pre_voo_ausente` e
 *     par INVÁLIDO; com pré-voo que não falhou → `pre_voo_nao_falhou`, par
 *     INVÁLIDO. As marcas de pré-voo são emitidas SEMPRE. Tarefa excluída
 *     cujo pré-voo FALHOU (era executável) marca `exclusao_com_pre_voo_falhado`
 *     — a única razão que resta é o worktree, que este ficheiro não verifica.
 *  8. Suplentes: cadeia transitiva com guarda de ciclo. Os 5 do pré-registo
 *     têm meta PINADA (`SUPLENTES_ESPERADOS`, 32); um suplente fora da
 *     tabela: tier
 *     do `tier_classificado` das suas tentativas, se unânime (senão
 *     `tier_inconsistente`; sem nenhum, `tier_desconhecido`; estrato `n/d`).
 *     Ordem dos braços por `ts_inicio`. `tier_classificado` no ledger
 *     diferente do pré-registo numa tarefa do corpus → marca `tier_divergente`
 *     e corrida INVÁLIDA: com `classify.js` e o template do prompt congelados,
 *     divergir é tratar a tarefa de forma diferente da pré-registada.
 *  9. Totais da secundária sobre pares VÁLIDOS (null se não há nenhum), MAIS
 *     `…_incluindo_pares_invalidos` e `…_todas_as_tentativas` (órfãs e
 *     duplicadas incluídas). `por_tarefa_atribuida` = total/n válidos;
 *     `por_tarefa_atribuida_sobre_prereg` = total/N do pré-registo.
 * 10. `custo_cli_opus_usd` = Σ `modelUsage[claude-opus-*].costUSD`;
 *     `custo_cli_total_usd` = Σ `total_cost_usd` (a invocação inteira).
 * 11. Órfãs (`task_id` fora do jogo ou `braco` ∉ {A,B}) vão para
 *     `fiabilidade` com consumo, e marcam. Duplicadas (mesmo
 *     task/braço/tentativa): se forem RÉPLICAS byte-idênticas fica uma e
 *     marca `tentativa_duplicada`; se diferirem, é uma tentativa a mais
 *     escrita por cima (retoma a tentar até verde): marca
 *     `tentativa_repetida`, par INVÁLIDO, corrida INVÁLIDA (23); fica a última
 *     para contabilidade e a anterior vai para `fiabilidade`.
 * 12. `ledger.regra` («campo em falta é null e o par é marcado; nunca se
 *     omite a chave»): chave omitida de `CHAVES_OBRIGATORIAS` marca
 *     `chave_omitida`. Nulls que a análise LÊ marcam `campo_em_falta`:
 *     `aceite`, `arrancou` (não-local), `estado_vivo_sha`,
 *     `sentinela_presente`, sub-campos de `modelUsage`, no passo local
 *     `tokens_locais`/`modelo_reportado`, e — numa tentativa claude-p que
 *     chegou ao CLI — as PROVAS da aceitação (`exit_code`,
 *     `test_file_sha_antes`, `test_file_sha_depois`, `tests_corridos`,
 *     `tests_passados`, `skips`; um valor de tipo errado conta como em falta).
 *     `aceite: null` e `aceite: true` sem prova completa → corrida INVÁLIDA
 *     (27c); `aceite: false` sem prova completa conta como registado SÓ em B
 *     (27b) — em A baixa A✓ e favorece B: corrida INVÁLIDA (27c; δ do 9.º).
 * 13. Arredondamento SÓ à saída: USD 4 casas, proporções 3, tokens e razões
 *     de tokens inteiros.
 * 14. Passo local com `aceite === true` é IMPOSSÍVEL POR CONSTRUÇÃO
 *     (`DECLARACAO_DE_DEGENERESCENCIA`). Marca `local_aceite`, par INVÁLIDO,
 *     corrida INVÁLIDA.
 * 15. Suplentes fora do protocolo: `suplente_usado` tem de estar em
 *     `corpus.suplentes`, não ser id do corpus, ser usado uma só vez, ser o
 *     PRIMEIRO da lista ainda não usado nem excluído (um salto regista-se
 *     como `tarefa_excluida` do próprio suplente; η do 9.º), e a tarefa
 *     excluída NÃO pode ter nenhuma `tentativa_fim` («suplentes nunca por
 *     resultado»). Violação → marca `suplente_fora_do_protocolo`, corrida
 *     INVÁLIDA; `idsEmJogo` nunca tem repetidos.
 * 16. Tentativas fora do protocolo (`desenho`): A com > 1 tentativa ou com
 *     executor ≠ `claude-p`; B com > 2; B em T0/T1 sem passo local na 1.ª;
 *     B em T0/T1 com passo local não aceite e SEM escalação
 *     (`escalacao_em_falta`); B em T2/T3 com > 1 ou com passo local. Marca
 *     `tentativas_fora_do_protocolo`, par INVÁLIDO e corrida INVÁLIDA (27c):
 *     o tratamento não foi aplicado como pré-registado.
 * 17. `skips` de uma tentativa acima do `skips` do `pre_voo` da tarefa marca
 *     `skips_acima_do_pre_voo` (numa rejeição, só marca; numa aceitação é
 *     contraditório — 19/29). NÃO verificado (declarado): ordem de execução
 *     das TAREFAS; os SUPLENTES não têm `tier_classificado` nem
 *     `tests_total_historico` no pré-registo (só ids), logo o tier vem do
 *     ledger e a condição 3 não se lhes aplica (X6/D2 do 10.º — FECHADO
 *     na 32 com `SUPLENTES_ESPERADOS`); uma linha de B copiada de outra
 *     tarefa com `session_id` novo (C2) só é apanhada se o
 *     `test_file_sha_antes` divergir; a ORDEM DOS BRAÇOS de um suplente
 *     (o pré-registo não a define; b1 do 14.º); TAREFAS sobrepostas no
 *     tempo (só os inícios se comparam; g2 do 14.º); um clone de A em B
 *     com `duration_ms` ± 1 ms (e1b do 14.º — a marca exige os 3 campos
 *     iguais); a deduplicação é O(n²) em `tentativas` (irrelevante para
 *     67 linhas, declarado; i do 14.º); «skips/todo
 *     não aumentaram face ao histórico» (o pré-registo não tem baseline de
 *     skips por tarefa); coerências por tentativa (19, 20, 22) em tentativas
 *     órfãs — só as verificações globais as apanham; `modelo_reportado` vs
 *     chave de `modelUsage`; `worktree_listagem_sha` (semântica desconhecida:
 *     editar um ficheiro existente não a muda); `usage`/`modelUsage`
 *     byte-iguais entre `session_id` distintos (duas invocações curtas podem
 *     coincidir); `tentativa_inicio` quando o ledger não traz nenhum (26);
 *     `test_file_sha_antes` contra o blob do commit (o pré-registo não traz
 *     o sha por tarefa — é do controlador). Ver também a lista «só no
 *     controlador» no brief do controlador.
 * 18. CONTRATO DE TIPO (`TIPOS_OBRIGATORIOS`): cada chave tem um tipo, e
 *     null só onde declarado. Violação → marca `tipo_invalido` e par
 *     INVÁLIDO; em `aceite` ou `arrancou` → corrida INVÁLIDA. `tier` ∈
 *     {T0..T3}; `executor` ∈ {claude-p, router-execute}; `tentativa` ∈
 *     {1,2}; números nunca negativos. `ts_fim < ts_inicio` ou `duration_ms
 *     === 0` numa tentativa que chegou ao CLI marca `tempo_incoerente`.
 * 19. COERÊNCIA DA ACEITAÇÃO (`aceitacao.definicao`): `aceite: true` numa
 *     tentativa com `arrancou !== true` e sem evidência é contraditório (com
 *     pré-voo falhado é impossível; κ do 9.º). A segunda metade da condição
 *     3 («skip/todo não aumentou») lê-se contra o `skips` do `pre_voo`:
 *     `aceite: true` com `skips` acima é contraditório; `aceite: false` com
 *     `skips` acima é uma rejeição legítima (E3/E4 do 10.º); e `passados +
 *     skips > corridos` é aritmética impossível do sumário (E5). Sem `skips`
 *     no `pre_voo` a base falta: `campo_em_falta` e corrida INVÁLIDA quando
 *     a tarefa correu em claude-p. Numa tentativa claude-p,
 *     `aceite: true` exige `exit_code === 0`, `test_file_sha_antes ===
 *     depois`, `tests_corridos > 0`, `tests_passados ≤ tests_corridos`, e —
 *     para tarefas do corpus — `tests_corridos` e `tests_passados` ≥
 *     `tests_total_historico`; e exige JSON: uma claude-p que chegou SEM
 *     `modelUsage` nenhum estourou o tecto ou morreu, e «estourar o tecto
 *     = não aceite» (`aceitacao.tecto_e_criterio`) — `aceite: true` aí é
 *     contraditório (B1 do 6.º revisor: o `correr-r24.mjs` corre a
 *     aceitação DEPOIS do timeout). `aceite: false` com TODAS as provas
 *     satisfeitas é o inverso. Qualquer dos dois → marca
 *     `aceite_contraditorio`, par INVÁLIDO, corrida INVÁLIDA. Prova em falta
 *     → 12. `ts_fim − ts_inicio ≥ tecto_por_tentativa_s` com `aceite: true`
 *     marca `tecto_aparente` (só marca: o intervalo pode incluir a aceitação).
 * 20. Tentativa `claude-p` que chegou ao CLI com `modelUsage` sem NENHUMA
 *     chave `claude-opus` (inclui `{}`) → marca `sem_opus_no_modelUsage`,
 *     consumo DESCONHECIDO, par INVÁLIDO, corrida INVÁLIDA. Sub-campo de
 *     tokens null/não-numérico → `campo_em_falta`, consumo DESCONHECIDO.
 *     Tokens de Opus TODOS a zero numa claude-p → `tokens_zero_com_arrancou`,
 *     consumo DESCONHECIDO (uma invocação que chegou ao Opus consome; o
 *     próprio `validarCorrida` do R-24 rejeita `input_tokens ≤ 0`).
 * 21. `par_invalido` numa tarefa cujos dois braços CHEGARAM — pela flag ou
 *     pela evidência (22) — → marca `par_invalido_contraditorio`, corrida
 *     INVÁLIDA (selecção sobre resultados).
 * 22. ARRANCOU POR EVIDÊNCIA: uma tentativa claude-p com `session_id` string,
 *     `modelUsage` objecto, `usage` objecto ou `total_cost_usd > 0`
 *     (`pecasDeEvidencia`) CHEGOU ao CLI, digam o que disserem
 *     `arrancou`/`motivo_se_nao` (é o caso `is_error:true` / «max turns» que
 *     `validarCorrida()` do R-24 devolve como `invalido`). `arrancou !==
 *     true` com evidência → marca `arrancou_contraditorio`, par INVÁLIDO,
 *     corrida INVÁLIDA. `session_id` repetido entre tentativas → marca
 *     `session_id_repetido`, corrida INVÁLIDA (a mesma invocação contada 2×).
 *     `arrancou !== true` (false OU null) numa claude-p com `motivo_se_nao`
 *     que NÃO começa por `spawn:` (ex. `cli_is_error:…`, `timeout`), OU sem
 *     JSON e com `ts_fim − ts_inicio ≥ tecto_por_tentativa_s` ou
 *     `duration_ms ≥ tecto × 1000` (um spawn falhado não demora 900 s), OU
 *     que NÃO foi curta (28), está fora da definição do pré-registo — um
 *     timeout tem transcript, um `is_error` tem JSON —: marca
 *     `nao_arrancou_fora_da_definicao`, par INVÁLIDO, corrida INVÁLIDA (o
 *     controlador classifica falhas como não-arranques: R5-2 do 5.º e B2 do
 *     7.º — o timeout escrito com `arrancou:null` tirava a falha de B do
 *     denominador). «Estourar o tecto = não aceite» conta CONTRA o braço;
 *     nunca é par inválido. `tecto_aparente` marca independentemente de
 *     `aceite`.
 * 23. Ver 11: `tentativa_repetida` invalida a corrida — «não é retomado» e
 *     «sem terceira tentativa» são do pré-registo.
 * 24. ORDEM DOS BRAÇOS OBSERVADA (divergente → corrida INVÁLIDA, 29): para as
 *     tarefas do corpus, a ordem vem do
 *     `ts_inicio` das tentativas (`ordem_observada`); se diferir da
 *     pré-registada marca `ordem_divergente` (o contrabalanço é do
 *     pré-registo; o loop «A; B» ingénuo enviesa cache e custo). Publicam-se
 *     as duas. `tier_classificado: null` numa tarefa do corpus marca
 *     `campo_em_falta` (o runtime não confirmou o tier).
 * 25. Coerências baratas, só marca: `pre_voo` com `falhou: true` e
 *     `exit_code: 0` (`pre_voo_incoerente`); `e_escalacao` ≠ (`tentativa ===
 *     2`) (`escalacao_incoerente`); `arrancou: true` com `motivo_se_nao`
 *     preenchido (`motivo_com_arrancou`); braço com `tentativa: 2` sem
 *     `tentativa: 1` (`tentativas_fora_do_protocolo`). `fontes` por braço na
 *     secundária (`{json, transcript, local, nao_arrancou, desconhecido}`)
 *     para o título não misturar fontes em silêncio.
 * 26. `tentativa_inicio`: se o ledger trouxer algum, cada (task, braço,
 *     tentativa) com mais de um `inicio` é `tentativa_reiniciada` → corrida
 *     INVÁLIDA (retoma com outra pegada); `inicio` sem `fim` marca
 *     `tentativa_sem_fim`. Sem nenhum `inicio` no ledger, não se verifica.
 * 27. A REGRA DA ESCADA (o 8.º revisor mostrou que sete rondas fecharam sete
 *     instâncias sem a codificar): num teste emparelhado de não-inferioridade
 *     (B ≥ A − 2), retirar um par (A✓, B✗) do denominador FAVORECE B, e
 *     baixar um A✓ também. Logo um defeito numa linha que CHEGOU ao CLI
 *     NUNCA retira o par. Só há três saídas para um par que correu:
 *     (a) PAR INVÁLIDO (sai da primária, consumo em `fiabilidade`) — SÓ para
 *         as saídas que o pré-registo define E que a linha PROVA (28):
 *         evento `par_invalido` legítimo (verificável na linha do braço
 *         nomeado), braço sem tentativa registada SÓ numa corrida com
 *         `paragem`, ou última tentativa que é não-arrancou PURO
 *         (`arrancou:false`, `spawn:*` sem timeout, sem evidência, curta) —
 *         o «residual» (`arrancou:null` sem motivo) DEIXOU de ser saída (a)
 *         na 29: não prova nada, e o brief obriga `motivo_se_nao`;
 *     (b) CONTA COMO REGISTADO, com marca — `aceite:false` numa claude-p que
 *         chegou, com prova incompleta (`campo_em_falta`): a falha conta
 *         contra o braço; a análise não a pode converter em «par inválido»
 *         (classe (ii) do 8.º: `correrAceitacao` devolve `status:null` quando
 *         a aceitação é morta por timeout);
 *     (c) CORRIDA INVÁLIDA — qualquer outro defeito numa linha que chegou:
 *         tipo inválido em qualquer chave, `aceite:null`, `aceite:true` sem
 *         prova completa, passo local aceite, aceite contraditório, sem
 *         Opus, TODAS as violações do protocolo de tentativas (incl.
 *         `escalacao_em_falta`, classe (i) do 8.º), tentativa repetida,
 *         arrancou contraditório, não-arrancou fora da definição, pré-voo
 *         ausente ou não falhado numa tarefa que correu. O par fica também
 *         marcado inválido para contabilidade.
 *     O CONTRATO tem um controlo de DIRECÇÃO: para cada ataque, o veredicto
 *     nunca pode ser «cumprido» quando o ledger honesto dá «não cumprido» —
 *     nas falhas de B E, em espelho, nos sucessos de A.
 * 28. A SAÍDA (a) TEM DE SER VERIFICÁVEL (o 9.º revisor mostrou que a
 *     escada tinha a saída (a) aberta a quem soubesse a grafia): um evento
 *     `par_invalido` só é legítimo se `braco` ∈ {A,B}, `motivo` é uma string
 *     `spawn:*` sem timeout, o braço nomeado TEM linha `tentativa_fim` e a
 *     última é um não-arrancou PURO, e não há `tentativa_inicio` órfão desse
 *     braço; senão marca `par_invalido_ilegitimo`, par INVÁLIDO, corrida
 *     INVÁLIDA (ν: `motivo:null` era o sentinela de par VÁLIDO e deixava A
 *     sem linha a contar como ✗; ι: qualquer motivo sem linha retirava o
 *     par). «CURTO» é `CURTO_S` = 30 s nas duas medidas — `duration_ms`
 *     presente e < 30 000, e `ts_fim − ts_inicio` < 30 s quando os dois ts
 *     existem (`foiCurta`); um spawn que falha devolve em milissegundos, e
 *     600 s com `arrancou:null` não é «não arrancou» (α/β). Numa corrida SEM
 *     evento `paragem`, um braço sem linha numa tarefa que correu é omissão
 *     do controlador (`braco_sem_linha`), corrida INVÁLIDA — a linha é
 *     obrigatória mesmo quando o spawn falha.
 * 29. O QUE O 10.º REVISOR MOSTROU FORA DA LINHA DA TENTATIVA: (X1) uma
 *     `tarefa_excluida` cujo `pre_voo` correu e FALHOU refuta as duas saídas
 *     do pré-registo para suplentes (o worktree existiu — o pré-voo corre
 *     nele — e a tarefa não estava «já verde») → `suplente_fora_do_protocolo`
 *     via `exclusao_com_pre_voo_falhado`, corrida INVÁLIDA; (X3) excluída
 *     depois de um `tentativa_inicio` de qualquer braço é substituição por
 *     resultado (um braço lançado e retirado) → idem; (X2) excluída SEM
 *     pré-voo é a saída (a) do pré-registo e não é verificável aqui: marca
 *     `tarefa_substituida` e `AVISO_SUPLENTES` na primária — «cumprido ·
 *     marcas 0» com o corpus trocado não pode acontecer. (E4/E6) `skips`
 *     entra nas provas da aceitação (12) e na coerência (19). (Y1)
 *     `test_file_sha_antes` tem de ser UNÂNIME entre todas as tentativas da
 *     tarefa — os dois braços viram o mesmo ficheiro congelado —, senão
 *     `test_file_sha_divergente`, corrida INVÁLIDA (e apanha uma linha
 *     copiada de outra tarefa). (S1b) `ordem_divergente` passa a corrida
 *     INVÁLIDA: em T3 os dois braços são o mesmo tratamento e só a ordem os
 *     distingue — trocar o rótulo é indetectável de outra forma; (S1)
 *     `ts_inicio` igual entre A e B marca `ts_iguais_entre_bracos`. (V1)
 *     `pre_voo` repetido invalida, o primeiro decide (7). (R1) o residual
 *     deixa de ser (a) (28). Marcas baratas, só marca: `custo_zero_com_tokens`
 *     (F2), `pre_voo_sem_vermelho` (G1: `skips ≥ historico`),
 *     `rasto_do_passo_local` (H1: listagem do worktree mudou no passo local;
 *     em `fiabilidade.rastos_do_passo_local`), `tentativa_sem_inicio` (W1:
 *     num ledger que regista inícios).
 * 30. O QUE O 11.º REVISOR MOSTROU: (K1b/K2b) a ordem observada comparava
 *     `ts_inicio` como STRINGS — um offset «-03:00» ou «.500Z» vs «Z»
 *     trocava a ordem e passava o rótulo trocado por «cumprido · marcas 0».
 *     Agora tudo por INSTANTE (`Date.parse`), e os braços não se
 *     intercalam: o intervalo [min `ts_inicio`, max `ts_fim`] de cada braço
 *     é disjunto do outro, senão `bracos_intercalados`, corrida INVÁLIDA
 *     (fecha também K3: a escalação de B a correr depois de A). (K4) o
 *     `pre_voo` tem contrato (`problemasDoPreVoo`: `exit_code` numérico,
 *     `falhou` booleano, contagens numéricas) → `pre_voo_incompleto`,
 *     INVÁLIDA numa tarefa que correu em claude-p; `falhou:true` com
 *     `exit_code:0` deixa de ser só marca (25) — é a classe do
 *     `aceite_contraditorio`, INVÁLIDA; `pre_voo_sem_vermelho` também
 *     quando falhou com 0 testes corridos ou passados = corridos (runner
 *     morto, não teste vermelho). (B4b) um `null` em `estado_vivo_sha` numa
 *     linha que seja → validade n/d, não true (o teste «um null não é uma
 *     mudança» era a porta: sha mudado a meio com null em 46/47 linhas dava
 *     «cumprido»); idem `modelo_reportado` null num passo local (C2). (E1)
 *     um passo local com evidência de CLI (`pecasDeEvidenciaBruta`:
 *     session_id, modelUsage, usage, custo > 0) correu em claude-p rotulado
 *     router-execute → `local_com_evidencia_de_cli`, consumo de Opus
 *     DESCONHECIDO (null, não zero), corrida INVÁLIDA. (J1) o
 *     `tecto_do_orcamento` é o mesmo em todas as tentativas claude-p da
 *     corrida → `tecto_divergente`, INVÁLIDA. (K8) mais do que um
 *     `par_invalido` por tarefa → `par_invalido_repetido`, INVÁLIDA.
 *     `PREREG_SHA256_ESPERADO` pina o `custo-prereg.json` congelado: um
 *     prereg com outro sha → INVÁLIDA (a análise não é a pré-registada).
 *     `lerLedger` conta linhas JSON válidas que não são objectos; eventos
 *     fora dos 6 do pré-registo vão para `fiabilidade.eventos_desconhecidos`
 *     e marcam `evento_desconhecido`; `paragem` com todos os pares fechados
 *     marca `paragem_contraditoria` (continua «não fechou»: uma paragem é
 *     uma paragem); `AVISO_N` dispara também com n > n do pré-registo (um
 *     suplente noutro tier). NÃO fechado (declarado): um A que MENTE de
 *     forma coerente (rejeitado com prova coerente) é indetectável por
 *     ledger — só o worktree o refuta.
 * 31. A FORMA É PROVA (o 12.º revisor mostrou que a 30 lia instantes mas
 *     não exigia que fossem legíveis): `ts_inicio`/`ts_fim` só contam na
 *     forma canónica de `toISOString()` (`tsCanonico`: UTC, `Z`, com ou sem
 *     ms) — um espaço, um «ZZ», uma vírgula ou uma zona omitida davam NaN em
 *     SILÊNCIO (bloco de ordem saltado, «cumprido · marcas 0»), e sem zona o
 *     `Date.parse` lê a hora LOCAL de quem analisa (o veredicto dependia da
 *     máquina). Violação → `tipo_invalido` (18) e `timestamp ilegivel`,
 *     corrida INVÁLIDA, (c) no par. OMISSÃO = NULL: uma chave de
 *     `CHAVES_OBRIGATORIAS` omitida invalida como o null invalidaria (era
 *     mais barato omitir `ts_inicio` do que escrever null). `aceite: null`
 *     invalida em QUALQUER linha, passo local incluído (o local corre a
 *     aceitação e escreve false; com null o par saía sem invalidar). Tempo
 *     por INSTANTE e, numa linha que CHEGOU, um tempo impossível é (c):
 *     `ts_fim` antes de `ts_inicio`, `ts_fim === ts_inicio` (nenhuma chamada
 *     ao CLI dura 0 ms), `duration_ms: 0`; `duracao_incoerente` (> 60 s entre
 *     `duration_ms` e os ts) só marca. `ts_inicio` igual entre A e B numa
 *     tarefa do corpus invalida (a ordem pré-registada não é verificável).
 *     `e_escalacao` incoerente com a tentativa invalida (25). VALORIZAÇÃO:
 *     `usage.cache_creation` só reparte se cobrir a criação do `modelUsage`
 *     e não for negativo — `{0,0}` com criação > 0 já não é «sem criação» a
 *     valorizar a cache a zero (5 000× a favor de B, invisível): repartição
 *     n/d, valorização null, marca `reparticao_cache_nd`. `tokens_transcript`
 *     tem tipo (número ≥ 0 ou null) e piso `TRANSCRIPT_MINIMO` = 1000:
 *     abaixo é desconhecido, não consumo. `reconciliar` falha nos dois
 *     sentidos (`usage` > 1 % + 10 acima do `modelUsage` é consumo que o
 *     `modelUsage` não explica).
 * 32. O PROTOCOLO DE B NÃO DEPENDE DO TIER (o 13.º revisor: com `tier`
 *     null — suplente sem tier, ou `tier_inconsistente` — todos os ramos do
 *     protocolo de B ficavam desligados e B com DUAS tentativas claude-p
 *     passava: «cumprido · A 20 B 18 · válida» onde o honesto dá «NÃO»).
 *     Regras independentes do tier: B nunca tem mais de 1 claude-p; a
 *     tentativa 2 só existe depois de um passo local na 1; a escalação
 *     começa DEPOIS de o passo local acabar (S3). `tier_inconsistente` numa
 *     tarefa que correu invalida (o classify é determinístico); uma tarefa
 *     sem tier em nenhuma linha e sem meta invalida (o protocolo não é
 *     verificável). Os 5 SUPLENTES estão pinados em `SUPLENTES_ESPERADOS`
 *     — tier do `classify.js` congelado sobre o prompt do
 *     `r24-manifest.json` (sem `ANTHROPIC_API_KEY`, como as 20 do corpus,
 *     que batem 20/20) e histórico = `proof.passes_at_child.tests_total`
 *     (o teste afirma-o contra o manifesto): `tier_divergente` e a condição
 *     3 aplicam-se aos suplentes como ao corpus (S1e/S1g fechados; a
 *     lacuna da 17 deixa de existir). Marcas baratas, só marca:
 *     `ordem_das_tarefas_divergente` (S2: a coluna `ordem` do pré-registo —
 *     não é alavanca da primária), `envelope_clonado_entre_bracos` (S4:
 *     `usage` + `modelUsage` + `duration_ms` byte-iguais entre linhas
 *     claude-p de A e B da mesma tarefa — duas invocações reais não
 *     coincidem ao ms; só o worktree o refuta), `modelo_nao_opus_dominante`
 *     (S9: mais tokens fora de `claude-opus*` do que de Opus — o trabalho
 *     correu noutro modelo). CLI: um flag sem valor é erro (exit 2), nunca o
 *     default em silêncio; o resumo imprime as linhas de ledger inválidas e
 *     os eventos desconhecidos. AMBIENTE (declarado, não é da análise): as
 *     7 «T0» do corpus e o t13 são T1 rebaixadas a T0 por
 *     `haiku_unavailable_no_provider_degraded_to_local` — o controlador
 *     corre SEM `ANTHROPIC_API_KEY` (R7), senão o tier muda e a corrida é
 *     INVÁLIDA por `tier_divergente`.
 * 33. O MODELO É TRATAMENTO (o 14.º revisor: `modelo_pedido` e
 *     `modelo_reportado` são chaves obrigatórias e nunca eram lidas — B em
 *     `claude-opus-4-1` nas 5 falhas, com `modelUsage` só dessa chave e
 *     prova coerente, dava «cumprido · A 20 B 20 · marcas 0»; em espelho,
 *     A noutro Opus rejeitado baixava A sem marca). O modelo pré-registado
 *     lê-se do `bracos.A.executor` («--model claude-opus-5»); numa claude-p
 *     que chegou, `modelo_pedido` ≠ esse → `modelo_pedido_divergente`,
 *     corrida INVÁLIDA, (c) no par; null → `campo_em_falta` e INVÁLIDA;
 *     qualquer chave `claude-opus*` do `modelUsage` que não seja o
 *     pré-registado → `opus_fora_do_pedido`, INVÁLIDA (os aliases da 20
 *     contam tokens, não autorizam outro Opus); `modelo_reportado` que não
 *     é chave do `modelUsage` marca. `tarefa_excluida` com `task_id` fora
 *     do corpus ∪ suplentes → `suplente_fora_do_protocolo`, INVÁLIDA (d3).
 *     O CLI aceita SÓ `--prereg`/`--ledger`/`--out` com valor separado por
 *     espaço; `--flag=valor`, flags desconhecidas e argumentos soltos são
 *     exit 2. O teste afirma a coluna `tier_classificado` de
 *     `SUPLENTES_ESPERADOS` (e das 20 do corpus) correndo o `classify.js`
 *     congelado sobre os prompts do manifesto, sem `ANTHROPIC_API_KEY`.
 * 34. FORA DO PROTOCOLO É RETOMA (o 15.º revisor: a tentativa falhada de B
 *     escrita com `braco:"X"` — ou como evento `tentativa_fim_descartada` —
 *     e a 2.ª corrida como B «oficial» dava «cumprido · A 20 B 20 · válida»
 *     com 5 órfãs/5 eventos desconhecidos só em marca; em espelho, A
 *     retomada 3× baixava A). Uma `tentativa_fim` com `braco` ∉ {A,B} ou
 *     `task_id` fora das tarefas em jogo, um `tentativa_inicio` órfão, e um
 *     evento fora dos 6 do pré-registo invalidam a corrida (a órfã continua
 *     visível em `fiabilidade`, o consumo continua contado); quando o
 *     `task_id` é de uma tarefa em jogo, o par leva (c). A 30 dizia
 *     «contado, não engolido» e chegava para a visibilidade, não para a
 *     direcção. CLI: `--out` igual ao `--prereg` ou ao `--ledger` é exit 2
 *     (sobrescrever o ledger destruía a única prova da corrida); pré-registo
 *     que não é JSON ou sem `metricas.yardstick_custo`/`corpus.tarefas` é
 *     exit 2 com mensagem, não stack trace.
 * 35. A CACHE TAMBÉM SE RECONCILIA. `reconciliar` compara as QUATRO
 *     categorias (`input`, `output`, `cache_creation`, `cache_read`) nos dois
 *     sentidos, com a mesma folga (1 % + 10): a cache é ~98 % dos tokens de
 *     uma claude-p (a sonda: 58 964 de 58 970), e só input/output deixava B
 *     declarar cache zero no `modelUsage` com o `usage` a dizer 309 k —
 *     «B 92 000 tokens · marcas 0». Uma tentativa que não reconcilia tem
 *     consumo DESCONHECIDO (null; a marca `reconciliacao` diz «não se
 *     imputa») — nunca se escolhe uma das duas fontes. `usage` presente com
 *     `modelUsage` ausente (ou o inverso) numa claude-p que chegou é JSON
 *     PARCIAL (marca `json_parcial`, consumo null): o transcript só é fonte
 *     quando não chegou JSON nenhum (`secundaria.timeout_sem_json`), nunca
 *     por baixo de um `usage` de 300 k.
 * 36. PISO DE PLAUSIBILIDADE NO JSON. Total de Opus do `modelUsage` abaixo
 *     de `TRANSCRIPT_MINIMO` numa claude-p que chegou → `tokens_implausiveis`,
 *     consumo DESCONHECIDO (a mesma classe do `tokens_zero_com_arrancou`: a
 *     sonda custa 58 970 tokens só para responder «OK»; «B 120 tokens ·
 *     8 por aceite · 0,0022 USD» não é medida). Com outro modelo a consumir
 *     MAIS e o Opus abaixo do piso, o Opus não fez o trabalho —
 *     `outro_modelo_fez_o_trabalho`, corrida INVÁLIDA, (c) no par (é outro
 *     tratamento, 33). Acima do piso, `modelo_nao_opus_dominante` continua só
 *     marca: subagentes noutro modelo são plausíveis num run honesto e o
 *     ledger não os distingue de um trabalho desviado.
 * 37. UM INÍCIO A MAIS É RETOMA (o 16.º revisor: um `tentativa_inicio` B t3
 *     — ou t9 — sem fim, ao lado do B «oficial» aceite, dava «cumprido ·
 *     A 20 B 20 · válida» só com `tentativa_sem_fim` em marca; em espelho,
 *     A t2 sem fim). Contrato mínimo do `tentativa_inicio`: `task_id` e
 *     `braco` strings, `tentativa` inteiro em {1,2} (A só tem a 1) — fora
 *     disto `inicio_fora_do_protocolo`, INVÁLIDA, (c) no par. Um inicio SEM
 *     fim só é legítimo como o ÚLTIMO inicio do ledger numa corrida com
 *     `paragem` (morte a meio); qualquer outro é um braço lançado a mais
 *     (a 28 já exige a linha mesmo no spawn falhado) — INVÁLIDA, (c).
 * 38. NEGATIVOS E NÃO-NÚMEROS DENTRO DO JSON (o 16.º: `cacheReadInputTokens:
 *     -900` coerente em `usage` E `modelUsage` reconciliava, passava o piso
 *     e dava «B 74 000 · marcas 0» com `por_categoria.cache_read` −18 000).
 *     Qualquer sub-campo de tokens ou `costUSD` do `modelUsage` (TODAS as
 *     chaves) ou das 4 categorias do `usage` (e da divisão 1h/5m) negativo é
 *     `tipo_invalido` → INVÁLIDA, (c); uma categoria do `usage` presente que
 *     não é número finito idem (uma string reconcilia por coerção). E a
 *     forja COERENTE (cache zero nos dois lados: «B 92 000 · marcas 0») é a
 *     classe «mente de forma coerente» da 30 — não se invalida, mas marca-se
 *     `abaixo_da_sonda`: total de Opus do JSON < `SONDA_TOTAL_OPUS` (58 970,
 *     a sonda real desta máquina para «Responde apenas: OK»; se a sonda for
 *     refeita noutra configuração, esta constante muda por AMENDMENT).
 * 39. CUSTO DO CLI NUNCA É ZERO POR OMISSÃO (o 16.º: `costUSD` omitido ou
 *     null dava `custo_cli_opus_usd: 0`; `total_cost_usd: 0` com tokens dava
 *     `custo_cli_total_usd: 0`, ambos sem marca). `costUSD` ausente/null
 *     numa chave Opus de uma claude-p que chegou → `campo_em_falta`,
 *     `custo_cli_usd` da tentativa null (propaga, nunca 0); `total_cost_usd`
 *     null, 0, ou abaixo da Σ `costUSD` de todas as chaves →
 *     `custo_cli_incoerente`, `custo_cli_total_usd` null. Só a valorização a
 *     preço de lista fica. A `custo_zero_com_tokens` (29) continua.
 * 40. `session_id` null numa claude-p cujo JSON chegou (`usage` ou
 *     `modelUsage`) → `campo_em_falta` (marca): o JSON do CLI traz sempre
 *     um, e sem ele a 22 (`session_id_repetido`) fica cega; um tecto sem
 *     JSON não tem `session_id` por definição. CLI (5 do 16.º): o guarda do `--out` compara o caminho REAL
 *     (`fs.realpathSync.native`; nome curto 8.3, junction, symlink apontam
 *     para o mesmo ficheiro), case-insensitive no win32. E a saída (a) do
 *     pré-registo com RESULTADO no outro braço (6 do 16.º): a análise não a
 *     invalida — é a saída pré-registada e o ledger não a refuta — mas marca
 *     `par_invalido_com_resultado_no_outro_braco` com o sentido («retirar
 *     este par favorece A/B», e se o braço que não arrancou era o SEGUNDO da
 *     ordem), conta-as em `fiabilidade.saidas_a_com_resultado_no_outro_braco`
 *     e imprime-as no resumo. Um spawn puro exactamente nas 5 falhas de B
 *     dá «cumprido» sobre 15 pares COM 5 marcas a dizer «favorece B».
 * 41. O SUMÁRIO DE TESTES TEM ARITMÉTICA (o 17.º revisor: A rejeitada com
 *     `exit_code 0`, sha intacto e `tests_passados = histórico + 1 >
 *     tests_corridos` nas 5 tarefas em que B falha dava «cumprido · A 15
 *     B 15 · marcas 0» — o `aceiteContraditorio` só lia a aritmética no
 *     ramo `aceite:true`, e a rejeição «legítima» de A favorece B).
 *     `passados ≤ corridos` e `passados + skips ≤ corridos` valem seja
 *     qual for `aceite`: um sumário impossível é a mesma testemunha a
 *     contradizer-se (31) → `aceite_contraditorio`, INVÁLIDA, (c).
 * 42. CONTAGENS E CÓDIGOS DE SAÍDA SÃO INTEIROS (`exit_code`,
 *     `tests_corridos`, `tests_passados`, `skips`, `tentativa`,
 *     `tokens_locais`): `exit_code: 1.5` não é «≠ 0», é impossível →
 *     `tipo_invalido`, INVÁLIDA, (c). SEM range no `exit_code`: um crash do
 *     runner em Windows escreve NTSTATUS assinados (−1073741819) e é honesto.
 * 43. `total_cost_usd` reconcilia com a Σ `costUSD` NOS DOIS SENTIDOS (a
 *     sonda: iguais a 1e-16): acima de 1 % (com todos os `costUSD`
 *     presentes) também é `custo_cli_incoerente`, `custo_cli_total_usd`
 *     null — um total inflado em A favorece B na leitura de custo.
 * 44. O `costUSD` do CLI coincide com a valorização a preço de lista na
 *     sonda (0,58975 exactos); mais de 5 % de diferença numa linha `json`
 *     marca `custo_cli_diverge_da_lista` (só marca: uma tabela de preços
 *     diferente no CLI é plausível; o número publicado continua, com a
 *     marca ao lado). Fixtures sintéticas com `costUSD` inventado marcam.
 * 45. O TRATAMENTO B TEM DE TER SIDO APLICADO: se TODOS os passos locais da
 *     corrida não arrancaram (Ollama em baixo a corrida inteira), B escalou
 *     directo para Opus nas 7 T0 e «B ≡ A» — a 2 cobre o transitório
 *     (marca `local_nao_arrancou`), a totalidade é outra corrida → INVÁLIDA.
 *     CLI (6 do 17.º): o resumo imprime `marcas por tipo` — «marcas 20» sem
 *     tipo era indistinguível de «marcas 20 e mais nada».
 * 46. UM PASSO LOCAL SEM SAÍDA NÃO ARRANCOU (o 18.º revisor: 7 locais com
 *     `arrancou: null`, `texto_local_sha256` = sha256("") e `tokens_locais:
 *     0` contavam como «arrancou» pela 1, B escalava nas 7 e «B ≡ A» dava
 *     «cumprido · A 20 B 20 · marcas 0» — a 45 contornada). `tokens_locais
 *     === 0` ou sha do texto vazio → `local_sem_saida` (marca, como o
 *     transitório da 2); `arrancou: null` num local só vale como arrancou
 *     com sha ≠ vazio E `tokens_locais > 0`; para a 45, «arrancou com
 *     saída» é o que conta — a totalidade sem saída é INVÁLIDA.
 * 47. O MODELO DO PASSO LOCAL É TRATAMENTO (a 33 só corria em claude-p): um
 *     `router-execute` com `modelo_pedido`/`modelo_reportado` `claude-*` é
 *     Opus (ou outro cloud) rotulado local, com consumo ZERO por construção
 *     numa linha que declara Opus → `local_em_modelo_cloud`, INVÁLIDA, (c).
 *     `modelo_reportado` sem `@sha256:` marca `modelo_local_sem_digest` (o
 *     prereg pede nome+digest do ollama).
 * 48. O `duration_ms` DE UMA CLAUDE-P É O DO JSON DO CLI — não inclui a
 *     aceitação (a 19 só o dizia dos ts). `duration_ms ≥ tecto` com
 *     `aceite: true` é «estourou o tecto e foi aceite» → `aceite_contraditorio`
 *     (o tecto é critério), INVÁLIDA, (c). `tecto_aparente` fica só para o
 *     intervalo dos ts.
 * 49. `exit_code === 0` COM `passados + skips ≠ corridos` É IMPOSSÍVEL: no
 *     `node --test`, exit 0 ⇔ fail 0 ∧ cancelled 0 ⇒ pass + skipped + todo =
 *     tests; com `skips` = skipped + todo (a condição 3 do prereg), uma
 *     rejeição de A com exit 0 e `passados + skips < corridos` era «rejeição
 *     legítima» sem marca → agora é sumário impossível (41), INVÁLIDA, (c).
 * 50. Uma REJEIÇÃO COM ZERO TESTES CORRIDOS (runner morto, módulo partido)
 *     não é um teste vermelho — é a classe do Z16 (legítima por decisão do
 *     17.º) mas marca `rejeicao_sem_testes` com o braço que baixa, como a
 *     saída (a) marca o sentido.
 * 51. O PRÉ-VOO É ANTES DE QUALQUER BRAÇO (7): com `pre_voo.ts` canónico,
 *     `ts` > primeiro início da tarefa (ts_inicio ou tentativa_inicio) →
 *     `pre_voo_fora_de_ordem`, INVÁLIDA, (c); `ts` ilegível numa tarefa que
 *     correu idem; sem `ts` marca `pre_voo_sem_ts` (o contrato do prereg não
 *     o exige; o brief 63 pede-o).
 * 52. SAÍDA PROVADA, NÃO DECLARADA (o 19.º revisor: `arrancou: true` com
 *     `texto_local_sha256: null` e/ou `tokens_locais: null` nos 7 locais
 *     contava como «arrancou com saída» e «B ≡ A» dava «cumprido · marcas
 *     0»). «Com saída» = sha string ≠ sha("") E `tokens_locais > 0`,
 *     independentemente da flag (30: um null não prova); `texto_local_sha256`
 *     null num local é `campo_em_falta`; a 45 conta só a saída provada.
 * 53. CLOUD É CLOUD: a 47 lia `/^claude-/`; `gpt-5`, `gemini-2.5-pro`,
 *     `anthropic/claude-opus-5`, `opus` no passo local passavam com consumo
 *     zero (R7!). Agora `/claude|opus|sonnet|haiku|gpt|gemini|anthropic|
 *     openai|google/i` em `modelo_pedido`/`modelo_reportado` do local →
 *     `local_em_modelo_cloud`, INVÁLIDA, (c). E `modelo_reportado` sem
 *     `@sha256:` deixa a validade em n/d (o prereg define a forma
 *     «nome+digest ollama»; sem digest o modelo local não é verificável).
 * 54. `duration_ms` NULL COM JSON É CAMPO EM FALTA (o JSON do CLI traz
 *     sempre um — a mesma classe do `session_id` na 40): a 48 não se
 *     contorna apagando o campo; com `aceite: true` a prova do tecto está em
 *     falta → `aceite_contraditorio`, INVÁLIDA, (c).
 * 55. O INVERSO DA 49: `exit_code` inteiro ≠ 0 com `corridos > 0` e
 *     `passados + skips === corridos` — nada falhou e o runner saiu ≠ 0 —
 *     é sumário impossível (verificado no Node 24: after-hook a falhar,
 *     rejeição fora dos testes e `process.exitCode` dão sempre `fail ≥ 1`);
 *     INVÁLIDA, (c). `corridos === 0` fica fora (Z16, crash sem sumário).
 *     Baratos do 19.º: `ehOpus` é case-insensitive (uma chave
 *     `Claude-Opus-5` é Opus e cai na 33); `tempo_incoerente` e
 *     `motivo_com_arrancou` também no passo local (só marca); o JSON de
 *     saída traz `marcas_por_tipo`.
 * 56. O INVERSO DA 22 (o 20.º revisor: uma claude-p com `arrancou: true`,
 *     `session_id`/`usage`/`modelUsage`/`total_cost_usd` null, sem
 *     `tokens_transcript`, `aceite: false` com sumário coerente, contava
 *     como «A rejeitada» com uma só marca `consumo_desconhecido` — «cumprido
 *     · A 15 B 15 · válida» onde o honesto dá «A 20 · NÃO»). O prereg define
 *     ARRANCOU por `session_id` no JSON ou por transcript: `arrancou: true`
 *     sem nenhuma peça de evidência E sem `tokens_transcript ≥
 *     TRANSCRIPT_MINIMO` é uma afirmação sem prova → `arrancou_sem_evidencia`,
 *     INVÁLIDA, (c). A 40 lê-se: um tecto sem JSON tem `session_id` pelo
 *     transcript (brief 98: pré-gerar o `--session-id`), ou é `arrancou:
 *     false` com o motivo.
 * 57. A SONDA PINADA TAMBÉM PELA CACHE: 58 964 dos 58 970 tokens da sonda
 *     são cache (o system prompt é criado ou lido em TODA a invocação); a
 *     38 media o piso pelo total e uma forja coerente com cache 0/0 acima
 *     de 58 970 («B 1 180 000 · 65 556 por aceite · 7,5 USD») passava com
 *     `marcas 0`. `cache_creation + cache_read < SONDA_CACHE_OPUS` (58 964,
 *     pinado contra a fixture) → `abaixo_da_sonda` (só marca, como a 38;
 *     brief 101). Marcas baratas do 20.º, só marca: `pre_voo_verde_sem_testes`
 *     (o espelho de `pre_voo_sem_vermelho`: «não falhou» com 0 testes é
 *     runner morto, não «já verde»), `corridos_abaixo_do_pre_voo` (testes
 *     que desapareceram numa linha aceite — CUSTO-14),
 *     `modelo_local_divergente_do_pedido` (o router trocou de modelo),
 *     `local_velocidade_implausivel` (> 10 tok/ms), `aceite_sem_output`
 *     (Opus aceite com `outputTokens` 0), `paragem_incoerente`
 *     (`ultima_tarefa`/`n` ≠ o prefixo executado).
 * 58. SEM JSON, A ÚNICA EVIDÊNCIA É O TRANSCRIPT (o 21.º revisor: a 56
 *     aceitava `session_id` string ou `total_cost_usd > 0` como evidência
 *     sem JSON — com o brief 98 o `session_id` é pré-gerado pelo
 *     controlador (uma afirmação, não evidência) e o `total_cost_usd` é um
 *     campo do JSON; A «rejeitada» nas 5 falhas de B com `session_id`
 *     string e `tokens_transcript: 0` dava «cumprido · A 15 B 15 ·
 *     válida»). `arrancou: true` sem `usage`/`modelUsage` e sem
 *     `tokens_transcript ≥ TRANSCRIPT_MINIMO` → `arrancou_sem_evidencia`,
 *     INVÁLIDA, (c); `total_cost_usd` ≠ 0 sem JSON → `custo_sem_json`,
 *     INVÁLIDA, (c). A 22 (evidência para «não arrancou» ser puro) fica
 *     como está: um `session_id` numa linha `arrancou: false` continua a
 *     torná-la contraditória — o controlador escreve null num spawn falhado
 *     (brief 102). Decisão sobre o hang/OOM sem resposta: INVÁLIDA em
 *     qualquer grafia — sem consumo mensurável não se conta em A nem em B; o
 *     prereg diz «não é retomado» (brief 104).
 * 59. UM SÓ TURNO NÃO EDITA (o 21.º: B aceite com um turno — cache
 *     exactamente a sonda, output 20 — passava a 38, a 57 e
 *     `aceite_sem_output`). Com `num_turns` do JSON registado na linha
 *     (brief 106), `aceite: true` com `num_turns ≤ 1` → `aceite_num_so_turno`
 *     (só marca); sem `num_turns` a análise não o vê — declarado. Marcas
 *     baratas do 21.º, só marca: `output_velocidade_implausivel` (Opus
 *     > 1 tok/ms), `local_verde_rejeitado` (local com exit 0 e tudo
 *     passado, `aceite: false` — contradiz o pré-voo), `pre_voo_sem_vermelho`
 *     também para exit ≠ 0 com `passados + skips == corridos` (a 55 no
 *     pré-voo); `suplente_fora_do_protocolo` (INVÁLIDA) para a mesma tarefa
 *     excluída duas vezes; `tipo_invalido` para um token em STRING em
 *     qualquer chave do `modelUsage` (coagia na reconciliação e escapava ao
 *     `modelo_nao_opus_dominante`).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { wilson, tangoIC, arred } from './custo-stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** As chaves que o pré-registo (`ledger.campos_obrigatorios_por_tentativa`) obriga em CADA tentativa_fim. */
export const CHAVES_OBRIGATORIAS = [
  'ts_inicio', 'ts_fim', 'task_id', 'braco', 'tentativa', 'e_escalacao',
  'tier_classificado', 'executor', 'modelo_pedido', 'modelo_reportado',
  'arrancou', 'motivo_se_nao',
  'aceite', 'exit_code', 'tests_corridos', 'tests_passados', 'skips', 'test_file_sha_antes', 'test_file_sha_depois',
  'usage', 'modelUsage', 'total_cost_usd', 'duration_ms', 'session_id',
  'tokens_locais', 'texto_local_sha256',
  'estado_vivo_sha', 'tecto_do_orcamento', 'sentinela_presente',
  'worktree_listagem_sha_antes', 'worktree_listagem_sha_depois',
];

/** Contrato de tipo por chave (interpretação 18). `nulo: true` = null aceite; `nao_negativo` para números. */
export const TIPOS_OBRIGATORIOS = {
  ts_inicio: { tipo: 'string', forma: 'ts' }, ts_fim: { tipo: 'string', forma: 'ts' },
  task_id: { tipo: 'string' }, braco: { tipo: 'string' },
  tentativa: { tipo: 'number', valores: [1, 2] }, e_escalacao: { tipo: 'boolean' },
  tier_classificado: { tipo: 'string', nulo: true, valores: ['T0', 'T1', 'T2', 'T3'] },
  executor: { tipo: 'string', valores: ['claude-p', 'router-execute'] },
  modelo_pedido: { tipo: 'string', nulo: true }, modelo_reportado: { tipo: 'string', nulo: true },
  arrancou: { tipo: 'boolean', nulo: true }, motivo_se_nao: { tipo: 'string', nulo: true },
  aceite: { tipo: 'boolean', nulo: true },
  exit_code: { tipo: 'number', nulo: true, inteiro: true },   // 42: sem range — o Windows devolve NTSTATUS assinados (-1073741819)
  tests_corridos: { tipo: 'number', nulo: true, nao_negativo: true, inteiro: true }, tests_passados: { tipo: 'number', nulo: true, nao_negativo: true, inteiro: true }, skips: { tipo: 'number', nulo: true, nao_negativo: true, inteiro: true },
  test_file_sha_antes: { tipo: 'string', nulo: true }, test_file_sha_depois: { tipo: 'string', nulo: true },
  usage: { tipo: 'object', nulo: true }, modelUsage: { tipo: 'object', nulo: true },
  total_cost_usd: { tipo: 'number', nulo: true, nao_negativo: true }, duration_ms: { tipo: 'number', nulo: true, nao_negativo: true },
  session_id: { tipo: 'string', nulo: true },
  tokens_locais: { tipo: 'number', nulo: true, nao_negativo: true, inteiro: true }, texto_local_sha256: { tipo: 'string', nulo: true },
  estado_vivo_sha: { tipo: 'string', nulo: true }, tecto_do_orcamento: { tipo: ['string', 'number'], nulo: true }, sentinela_presente: { tipo: 'boolean', nulo: true },
  worktree_listagem_sha_antes: { tipo: 'string', nulo: true }, worktree_listagem_sha_depois: { tipo: 'string', nulo: true },
};

/** As provas que `aceite` exige numa tentativa claude-p que chegou ao CLI (interpretações 12 e 19). */
export const PROVAS_DA_ACEITACAO = ['exit_code', 'test_file_sha_antes', 'test_file_sha_depois', 'tests_corridos', 'tests_passados', 'skips'];

/** Violações de tipo de uma tentativa: lista de `chave: motivo`. Chaves omitidas não entram (são `chave_omitida`). */
export function violacoesDeTipo(t) {
  const out = [];
  for (const [k, c] of Object.entries(TIPOS_OBRIGATORIOS)) {
    if (!(k in t)) continue;
    const v = t[k];
    if (v === null) { if (!c.nulo) out.push(`${k}: null nao permitido`); continue; }
    const tipos = Array.isArray(c.tipo) ? c.tipo : [c.tipo];
    const tv = typeof v;
    if (!tipos.includes(tv) || (tv === 'object' && Array.isArray(v))) { out.push(`${k}: ${Array.isArray(v) ? 'array' : tv} em vez de ${tipos.join('|')}`); continue; }
    if (tv === 'number' && !Number.isFinite(v)) { out.push(`${k}: nao finito`); continue; }
    if (c.nao_negativo && v < 0) out.push(`${k}: negativo (${v})`);
    if (c.inteiro && !Number.isInteger(v)) out.push(`${k}: ${v} nao e inteiro`);   // 42: um exit_code 1.5 nao e «!= 0», e impossivel
    if (c.valores && !c.valores.includes(v)) out.push(`${k}: ${JSON.stringify(v)} fora de {${c.valores.join(',')}}`);
    // 31: um timestamp so conta se tiver a forma canonica de toISOString() (UTC, Z, com ou sem ms) — sem zona e a hora LOCAL de quem analisa; um espaco ou um «ZZ» da NaN em silencio
    if (c.forma === 'ts' && !tsCanonico(v)) out.push(`${k}: ${JSON.stringify(v)} nao e um timestamp canonico (YYYY-MM-DDTHH:MM:SS[.mmm]Z)`);
  }
  // tokens_transcript nao e obrigatoria, mas quando existe tem tipo: numero finito >= 0, ou null
  if ('tokens_transcript' in t && t.tokens_transcript !== null && (typeof t.tokens_transcript !== 'number' || !Number.isFinite(t.tokens_transcript) || t.tokens_transcript < 0)) out.push(`tokens_transcript: ${JSON.stringify(t.tokens_transcript)} nao e um numero >= 0`);
  // 38: tokens e custos nunca negativos DENTRO do usage e do modelUsage (TODAS as chaves, nao so Opus) — um negativo coerente nos dois lados reconcilia e passa o piso; e as 4 categorias do usage, quando presentes, sao numeros finitos (uma string reconcilia por coercao)
  if (t.modelUsage && typeof t.modelUsage === 'object' && !Array.isArray(t.modelUsage)) for (const [k, v] of Object.entries(t.modelUsage)) if (v && typeof v === 'object') for (const c of [...CAMPOS_TOKENS, 'costUSD']) {
    if (typeof v[c] === 'number' && v[c] < 0) out.push(`modelUsage.${k}.${c}: negativo (${v[c]})`);
    // 21.o (7): um token em STRING numa chave nao-Opus coage na reconciliacao e escapa ao modelo_nao_opus_dominante — presente e nao-null tem de ser numero finito (null fica para o campo_em_falta)
    else if (c !== 'costUSD' && c in v && v[c] !== null && (typeof v[c] !== 'number' || !Number.isFinite(v[c]))) out.push(`modelUsage.${k}.${c}: ${JSON.stringify(v[c])} nao e um numero`);
  }
  if (t.usage && typeof t.usage === 'object' && !Array.isArray(t.usage)) {
    for (const c of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) if (c in t.usage && t.usage[c] !== null && (typeof t.usage[c] !== 'number' || !Number.isFinite(t.usage[c]) || t.usage[c] < 0)) out.push(`usage.${c}: ${JSON.stringify(t.usage[c])} nao e um numero >= 0`);
    const cc = t.usage.cache_creation;
    if (cc && typeof cc === 'object') for (const c of ['ephemeral_1h_input_tokens', 'ephemeral_5m_input_tokens']) if (typeof cc[c] === 'number' && cc[c] < 0) out.push(`usage.cache_creation.${c}: negativo (${cc[c]})`);
  }
  return out;
}
/** O total de Opus da sonda real desta maquina (`custo-fixture-sonda.json`: «Responde apenas: OK» = 2 + 4 + 58 964 + 0). Abaixo disto uma claude-p e coerente mas implausivel (38); o teste afirma-o contra a fixture. */
export const SONDA_TOTAL_OPUS = 58970;
/** A CACHE da sonda (criacao + leitura = 58 964 de 58 970): o system prompt e criado ou lido em toda a invocacao; uma claude-p com cache 0/0 e implausivel mesmo acima do total (57). */
export const SONDA_CACHE_OPUS = 58964;
/** Forma canonica de um instante: a que `new Date().toISOString()` escreve, com Z obrigatorio. Sem isto, `Date.parse` le a hora local de quem analisa (31). */
export const tsCanonico = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(s) && Number.isFinite(Date.parse(s));
/** Piso de plausibilidade para um total de tokens vindo do transcript: uma invocacao claude-p que chegou ao Opus carrega milhares de tokens de sistema (31). */
export const TRANSCRIPT_MINIMO = 1000;

// ── leitura ────────────────────────────────────────────────────────────────

export function lerLedger(texto) {
  const eventos = [];
  const linhasInvalidas = [];
  texto.split('\n').forEach((l, i) => {
    if (!l.trim()) return;
    try {
      const v = JSON.parse(l);
      if (v === null || typeof v !== 'object' || Array.isArray(v)) { linhasInvalidas.push({ linha: i + 1, erro: `linha JSON valida mas nao e um objecto (${Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v})` }); return; }
      eventos.push(v);
    } catch (e) { linhasInvalidas.push({ linha: i + 1, erro: e.message }); }
  });
  return { eventos, linhasInvalidas };
}

// ── tokens ─────────────────────────────────────────────────────────────────

const ehOpus = (chave) => typeof chave === 'string' && chave.toLowerCase().startsWith('claude-opus');   // 96 do 19.o: `Claude-Opus-5` e Opus (e cai na 33 por nao ser o literal pre-registado)
const ehLocal = (t) => !!t && t.executor === 'router-execute';
const ehTierLocal = (tier) => tier === 'T0' || tier === 'T1';
const CAMPOS_TOKENS = ['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'];
const ZEROS = (fonte) => ({ input: 0, output: 0, cache_creation: 0, cache_read: 0, cache_creation_1h: 0, cache_creation_5m: 0,
  reparticao_cache: fonte, total: 0, modelos: [], custo_cli_usd: 0, fonte });

/** Problemas do `modelUsage` de uma tentativa claude-p (interpretação 20): sub-campos em falta/não-numéricos, ou nenhum Opus. */
export function problemasDoModelUsage(mu) {
  if (!mu || typeof mu !== 'object') return { sem_opus: false, campos: [] };
  const campos = [];
  let opus = 0;
  for (const [k, v] of Object.entries(mu)) {
    if (!ehOpus(k)) continue;
    opus++;
    if (!v || typeof v !== 'object') { campos.push(`${k}: entrada nao e objecto`); continue; }
    for (const c of CAMPOS_TOKENS) if (!Number.isFinite(v[c])) campos.push(`${k}.${c}`);
  }
  return { sem_opus: opus === 0, campos };
}

/** As peças de evidência de que uma tentativa claude-p CHEGOU ao CLI (interpretação 22): qualquer uma chega. */
export const pecasDeEvidenciaBruta = (t) => (!t ? [] : [
  typeof t.session_id === 'string' ? 'session_id' : null,
  !!t.modelUsage && typeof t.modelUsage === 'object' ? 'modelUsage' : null,
  !!t.usage && typeof t.usage === 'object' ? 'usage' : null,
  Number.isFinite(t.total_cost_usd) && t.total_cost_usd > 0 ? 'total_cost_usd>0' : null,
].filter(Boolean));
export const pecasDeEvidencia = (t) => (!t || ehLocal(t) ? [] : pecasDeEvidenciaBruta(t));
export const evidenciaDeArranque = (t) => pecasDeEvidencia(t).length > 0;

/** Um spawn que falha devolve em milissegundos; 30 s deixa folga a um disco lento. Acima disto não é «não arrancou» (interpretação 28). */
export const CURTO_S = 30;
/** sha256 do `custo-prereg.json` congelado (main via #495). A analise so e a pre-registada se ler ESTE ficheiro (30). */
export const PREREG_SHA256_ESPERADO = '079131b4712049225205a0f25edae2cff619e87e5767b86743fd0c6455b2a906';
/**
 * Os 5 suplentes do pre-registo, com o tier do `classify.js` congelado sobre o prompt do `r24-manifest.json`
 * (sha d79957ccbfa51ced…, sem ANTHROPIC_API_KEY no ambiente — como as 20 do corpus, que batem 20/20) e o
 * `tests_total_historico` = `proof.passes_at_child.tests_total` do mesmo manifesto (32). O prereg so traz os ids;
 * sem isto um suplente escrito com outro tier, ou aceite com 1 teste, passava («cumprido · valida»).
 */
export const SUPLENTES_ESPERADOS = {
  't02-7bb45751d8': { tier_classificado: 'T3', tests_total_historico: 9 },
  't09-07bdf37783': { tier_classificado: 'T3', tests_total_historico: 16 },
  't16-057bfc121a': { tier_classificado: 'T3', tests_total_historico: 22 },
  't13-ddb0cf50e1': { tier_classificado: 'T0', tests_total_historico: 15 },
  't08-1f5a793294': { tier_classificado: 'T3', tests_total_historico: 24 },
};
/** Os 6 eventos que o pre-registo define. Qualquer outro e contado, nunca engolido (30). */
export const EVENTOS_DO_PREREG = ['pre_voo', 'tentativa_inicio', 'tentativa_fim', 'par_invalido', 'tarefa_excluida', 'paragem'];
/** `spawn:*` sem timeout — a única grafia de não-arrancou que o pré-registo define. */
export const motivoSpawnPuro = (m) => typeof m === 'string' && m.startsWith('spawn:') && !/timeout|ETIMEDOUT/i.test(m);
/** A linha foi CURTA nas duas medidas: `duration_ms` presente e < CURTO_S, e os ts (quando os dois existem) coerentes com isso. */
export const foiCurta = (t) => {
  if (!t || !Number.isFinite(t.duration_ms) || t.duration_ms >= CURTO_S * 1000) return false;
  if (typeof t.ts_inicio === 'string' && typeof t.ts_fim === 'string') {
    const s = (Date.parse(t.ts_fim) - Date.parse(t.ts_inicio)) / 1000;
    if (!Number.isFinite(s) || s < 0 || s >= CURTO_S) return false;
  }
  return true;
};

/** Não-arrancou «puro» do pré-registo: spawn falhou, sem evidência nenhuma, com motivo `spawn:*` e CURTO (interpretações 3 e 28). */
export const naoArrancouPuro = (t) => !!t && t.arrancou === false && !evidenciaDeArranque(t) && motivoSpawnPuro(t.motivo_se_nao) && foiCurta(t);

/**
 * Tokens de Opus de UMA tentativa, por categoria (interpretações 1, 3 e 20).
 *   fonte: 'json' | 'local' | 'nao arrancou' | 'transcript'
 *   null  = consumo DESCONHECIDO (arrancou, sem JSON utilizável, sem transcript)
 */
export function tokensOpusDaTentativa(t) {
  if (ehLocal(t)) return pecasDeEvidenciaBruta(t).length > 0 ? null : ZEROS('local');   // 30: um «local» com evidencia de CLI nao tem consumo zero
  const mu = t && t.modelUsage;
  const prob = problemasDoModelUsage(mu);
  const jsonUtil = mu && typeof mu === 'object' && !prob.sem_opus && prob.campos.length === 0;
  if (!jsonUtil) {
    if (naoArrancouPuro(t)) return ZEROS('nao arrancou');
    // 35: o transcript so e fonte quando NAO chegou JSON nenhum (prereg: timeout_sem_json); um `usage` objecto e um JSON que chegou PARCIAL — desconhecido, nunca o transcript por baixo
    if (t && t.usage && typeof t.usage === 'object') return null;
    if (t && Number.isFinite(t.tokens_transcript) && t.tokens_transcript >= TRANSCRIPT_MINIMO) {
      return { input: null, output: null, cache_creation: null, cache_read: null, cache_creation_1h: null, cache_creation_5m: null,
        reparticao_cache: 'n/d', total: t.tokens_transcript, modelos: [], custo_cli_usd: null, fonte: 'transcript' };
    }
    return null;
  }
  if (!(t.usage && typeof t.usage === 'object')) return null;   // 35: modelUsage sem usage e o mesmo JSON parcial — nao se reconcilia, nao se imputa
  if (reconciliar(t).ok === false) return null;                 // 35: usage e modelUsage em desacordo — consumo contestado, nao se imputa
  const cats = { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
  const modelos = [];
  let custoCli = 0, custoDesconhecido = false;
  for (const [k, v] of Object.entries(mu)) {
    if (!ehOpus(k)) continue;
    modelos.push(k);
    cats.input += v.inputTokens;
    cats.output += v.outputTokens;
    cats.cache_creation += v.cacheCreationInputTokens;
    cats.cache_read += v.cacheReadInputTokens;
    if (Number.isFinite(v.costUSD)) custoCli += v.costUSD; else custoDesconhecido = true;   // 39: costUSD ausente/null nao e 0 — o custo do CLI fica desconhecido
  }
  const total = cats.input + cats.output + cats.cache_creation + cats.cache_read;
  if (total === 0) return null;   // interpretacao 20: uma claude-p que chegou ao Opus consome; zero e desconhecido
  if (total < TRANSCRIPT_MINIMO) return null;   // 36: abaixo do piso de plausibilidade (a sonda custa 58 970 so para «OK») e desconhecido, nao consumo
  // A divisao 1h/5m da criacao de cache so existe ao nivel da invocacao
  // (`usage.cache_creation`), nao por modelo. Reparte-se PROPORCIONALMENTE e
  // diz-se que foi assim; se `usage` nao trouxer a divisao, fica null.
  const cc = t.usage && t.usage.cache_creation;
  let cache_1h = null, cache_5m = null, reparticao = 'n/d';
  if (cc && Number.isFinite(cc.ephemeral_1h_input_tokens) && Number.isFinite(cc.ephemeral_5m_input_tokens) && cc.ephemeral_1h_input_tokens >= 0 && cc.ephemeral_5m_input_tokens >= 0) {
    const tot = cc.ephemeral_1h_input_tokens + cc.ephemeral_5m_input_tokens;
    // 31: a divisao do usage tem de cobrir a criacao do modelUsage; abaixo disso (incl. {0,0} com criacao > 0) a reparticao e n/d — nunca «sem criacao» a valorizar a zero
    if (tot < cats.cache_creation) { cache_1h = null; cache_5m = null; reparticao = 'n/d (usage.cache_creation abaixo do modelUsage)'; }
    else if (tot === 0) { cache_1h = 0; cache_5m = 0; reparticao = 'sem criacao'; }
    else if (cc.ephemeral_5m_input_tokens === 0) { cache_1h = cats.cache_creation; cache_5m = 0; reparticao = 'toda 1h'; }
    else if (cc.ephemeral_1h_input_tokens === 0) { cache_1h = 0; cache_5m = cats.cache_creation; reparticao = 'toda 5m'; }
    else {
      const f = cc.ephemeral_1h_input_tokens / tot;
      cache_1h = Math.round(cats.cache_creation * f); cache_5m = cats.cache_creation - cache_1h; reparticao = 'proporcional';
    }
  }
  return { ...cats, cache_creation_1h: cache_1h, cache_creation_5m: cache_5m, reparticao_cache: reparticao, total, modelos, custo_cli_usd: custoDesconhecido ? null : custoCli, fonte: 'json' };
}

/** Reconciliacao `usage` vs soma de `modelUsage`. Passo local: nao se aplica. */
export function reconciliar(t) {
  if (ehLocal(t)) return { ok: null, motivo: 'passo local — nao se aplica' };
  const mu = t && t.modelUsage, u = t && t.usage;
  if (!mu || !u) return { ok: null, motivo: 'sem usage ou modelUsage' };
  // 35: as QUATRO categorias — a criacao e a leitura de cache sao ~98 % dos tokens de uma claude-p (a sonda: 58 964 de 58 970); so input/output deixava a cache fabricavel
  const soma = (c) => Object.values(mu).reduce((s, v) => s + (Number(v && v[c]) || 0), 0);
  const cats = [['output_tokens', 'outputTokens', 'output'], ['input_tokens', 'inputTokens', 'input'], ['cache_creation_input_tokens', 'cacheCreationInputTokens', 'cache_creation'], ['cache_read_input_tokens', 'cacheReadInputTokens', 'cache_read']];
  for (const [ku, km, nome] of cats) { const s = soma(km); if ((Number(u[ku]) || 0) < s) return { ok: false, motivo: `usage.${nome} ${u[ku]} < soma modelUsage ${s}` }; }
  // 31: e no outro sentido — um usage muito acima do modelUsage e consumo que o modelUsage nao explica (f1 do 12.o)
  const acima = (a, s) => a > s * 1.01 + 10;
  for (const [ku, km, nome] of cats) { const s = soma(km); if (acima(Number(u[ku]) || 0, s)) return { ok: false, motivo: `usage.${nome} ${u[ku]} > soma modelUsage ${s} — consumo que o modelUsage nao explica` }; }
  return { ok: true, motivo: null };
}

/** ARRANCOU de uma tentativa pela flag (interpretacao 1 para o passo local). */
export function arrancouDaTentativa(t) {
  if (!t) return false;
  // 46: `arrancou: null` num local so vale como arrancou com SAIDA provada
  if (ehLocal(t)) return t.arrancou === true || (t.arrancou == null && localComSaida(t));
  return t.arrancou === true;
}
/** sha256 de "" — um `texto_local_sha256` igual a isto e um passo local que nao produziu nada (46). */
export const SHA256_VAZIO = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
/** Passo local COM SAIDA PROVADA (52): sha do texto string e != sha("") E tokens_locais > 0 — independentemente da flag `arrancou` (30: um null nao prova). */
export const localComSaida = (t) => !!t && ehLocal(t) && typeof t.texto_local_sha256 === 'string' && t.texto_local_sha256 !== SHA256_VAZIO && Number.isFinite(t.tokens_locais) && t.tokens_locais > 0;
/** Passo local SEM SAIDA (46/52): «arrancou» (pela flag ou pela evidencia) mas sem saida provada — nao e o tratamento B. */
export const localSemSaida = (t) => !!t && ehLocal(t) && arrancouDaTentativa(t) && !localComSaida(t);
/** Modelo CLOUD no passo local (53): claude/opus/sonnet/haiku/gpt/gemini/anthropic/openai/google — pago e rotulado local, com consumo zero por construcao. */
export const ehModeloCloud = (m) => typeof m === 'string' && /claude|opus|sonnet|haiku|gpt|gemini|anthropic|openai|google/i.test(m);

/** ARRANCOU pela flag OU pela evidencia (interpretacao 22). */
export const arrancouOuEvidencia = (t) => arrancouDaTentativa(t) || evidenciaDeArranque(t);

/**
 * Coerência da aceitação (interpretação 19). Devolve null se coerente (ou
 * indecidível), senão o motivo. `historico` = tests_total_historico da tarefa
 * do corpus, ou null para suplentes.
 */
export function aceiteContraditorio(t, historico, skipsBase = null) {
  if (ehLocal(t) || typeof t.aceite !== 'boolean') return null;
  // interpretacao 19 (B1): uma claude-p que chegou SEM JSON nenhum estourou o tecto ou morreu — nao aceite.
  // (JSON presente mas sem Opus e a interpretacao 20, nao esta.)
  const mu = t.modelUsage;
  const temJson = !!mu && typeof mu === 'object';
  if (t.aceite === true && t.arrancou !== true && !evidenciaDeArranque(t)) return `aceite=true numa tentativa que nao arrancou (arrancou=${JSON.stringify(t.arrancou ?? null)}, sem evidencia) — com pre-voo falhado e impossivel`;
  if (t.aceite === true && !temJson && (t.arrancou === true || typeof t.session_id === 'string')) return 'aceite=true sem JSON — tecto ou morte sem resultado; «estourar o tecto = nao aceite»';
  const provas = [];
  if (Number.isFinite(t.exit_code)) provas.push({ ok: t.exit_code === 0, nome: `exit_code=${t.exit_code}` });
  if (typeof t.test_file_sha_antes === 'string' && typeof t.test_file_sha_depois === 'string') provas.push({ ok: t.test_file_sha_antes === t.test_file_sha_depois, nome: 'test_file_sha antes!=depois' });
  if (Number.isFinite(t.tests_corridos)) provas.push({ ok: t.tests_corridos > 0, nome: `tests_corridos ${t.tests_corridos} (zero testes)` });
  if (Number.isFinite(t.tests_passados) && Number.isFinite(t.tests_corridos)) provas.push({ ok: t.tests_passados <= t.tests_corridos, nome: `tests_passados ${t.tests_passados} > tests_corridos ${t.tests_corridos}` });
  if (Number.isFinite(historico) && Number.isFinite(t.tests_corridos)) provas.push({ ok: t.tests_corridos >= historico, nome: `tests_corridos ${t.tests_corridos} < historico ${historico}` });
  if (Number.isFinite(historico) && Number.isFinite(t.tests_passados)) provas.push({ ok: t.tests_passados >= historico, nome: `tests_passados ${t.tests_passados} < historico ${historico}` });
  // condicao 3, segunda metade: «o numero de skip/todo nao aumentou» — a base e o skips do pre-voo da tarefa (29)
  if (Number.isFinite(skipsBase) && Number.isFinite(t.skips)) provas.push({ ok: t.skips <= skipsBase, nome: `skips ${t.skips} > ${skipsBase} do pre-voo` });
  if (Number.isFinite(t.skips) && Number.isFinite(t.tests_passados) && Number.isFinite(t.tests_corridos)) provas.push({ ok: t.tests_passados + t.skips <= t.tests_corridos, nome: `tests_passados ${t.tests_passados} + skips ${t.skips} > tests_corridos ${t.tests_corridos}` });
  // 41: a aritmetica do sumario vale seja qual for `aceite` — uma rejeicao de A com passados > corridos baixa A e favorece B; e a mesma testemunha a contradizer-se (31)
  const impossiveis = provas.filter((p) => !p.ok && /^tests_passados .* > tests_corridos/.test(p.nome)).map((p) => p.nome);
  // 49: no node --test, exit 0 <=> fail 0 e cancelled 0 => pass + skipped + todo = tests; com `skips` = skipped + todo, exit 0 com passados + skips != corridos e impossivel
  if (t.exit_code === 0 && Number.isFinite(t.tests_passados) && Number.isFinite(t.skips) && Number.isFinite(t.tests_corridos) && t.tests_passados + t.skips !== t.tests_corridos) impossiveis.push(`exit_code 0 com tests_passados ${t.tests_passados} + skips ${t.skips} != tests_corridos ${t.tests_corridos} (49)`);
  // 55: o inverso — exit != 0 => fail + cancelled > 0 => pass + skipped + todo < tests; com corridos > 0 (o crash sem sumario, corridos 0, e o Z16)
  if (Number.isInteger(t.exit_code) && t.exit_code !== 0 && Number.isFinite(t.tests_corridos) && t.tests_corridos > 0 && Number.isFinite(t.tests_passados) && Number.isFinite(t.skips) && t.tests_passados + t.skips === t.tests_corridos) impossiveis.push(`exit_code ${t.exit_code} com tests_passados ${t.tests_passados} + skips ${t.skips} == tests_corridos ${t.tests_corridos} — nada falhou e o runner saiu != 0 (55)`);
  if (impossiveis.length) return `sumario de testes impossivel: ${impossiveis.join(', ')} (41)`;
  if (provas.length === 0) return null;
  const falhas = provas.filter((p) => !p.ok).map((p) => p.nome);
  if (t.aceite === true && falhas.length > 0) return `aceite=true com ${falhas.join(', ')}`;
  // aceite=false so e contraditorio se TODAS as provas estao ok E as tres do prereg estao presentes (skips incluido, com base no pre-voo)
  const completo = Number.isFinite(t.exit_code) && typeof t.test_file_sha_antes === 'string' && typeof t.test_file_sha_depois === 'string' && Number.isFinite(t.tests_passados) && Number.isFinite(t.tests_corridos) && Number.isFinite(historico) && Number.isFinite(t.skips) && Number.isFinite(skipsBase);
  if (t.aceite === false && completo && falhas.length === 0) return 'aceite=false com exit_code 0, test_file intacto e testes >= historico';
  return null;
}

// ── valorizacao ────────────────────────────────────────────────────────────

/** Valorizacao teorica de uma tentativa aos precos e multiplicadores do prereg. null se tokens null. */
export function valorizar(tok, precos) {
  if (!tok) return null;
  const { input, output } = precos.opus_usd_por_Mtok;
  const m = precos.cache_multiplicadores;
  const cc1h = tok.cache_creation_1h === null ? null : tok.cache_creation_1h;
  const cc5m = tok.cache_creation_5m === null ? null : tok.cache_creation_5m;
  if (cc1h === null || cc5m === null || tok.input === null || tok.output === null || tok.cache_read === null) return null;   // sem categorias nao se valoriza
  const usd = (tok.input * input + tok.output * output + cc1h * input * m.cache_creation_1h
    + cc5m * input * m.cache_creation_5m + tok.cache_read * input * m.cache_read) / 1e6;
  return usd;
}

// ── agregacao ──────────────────────────────────────────────────────────────

const somaOuNull = (xs) => (xs.some((x) => x === null || x === undefined) ? null : xs.reduce((a, b) => a + b, 0));
const razaoOuIndef = (num, den) => (num === null ? null : den === 0 ? 'INDEFINIDO' : num / den);
const arredRazao = (x) => (x === null || x === 'INDEFINIDO' ? x : arred.tok(x));
const arredWilson = (w) => (w === null ? null : { p: arred.prop(w.p), lo: arred.prop(w.lo), hi: arred.prop(w.hi) });
const MARGEM = 2;   // 'LIMIAR DESCRITIVO: aceites_B >= aceites_A - 2' — o prereg so tem o criterio como texto

/** A primaria de UMA lista de pares validos. Usada para o global e para cada tier (interpretacao 6). */
function primariaDe(validos, criterio, { fechou, valida }, nPrereg) {
  const n = validos.length;
  const aceitesA = validos.filter((t) => t.A.aceite).length;
  const aceitesB = validos.filter((t) => t.B.aceite).length;
  const celula = (fa, fb) => validos.filter((t) => t.A.aceite === fa && t.B.aceite === fb).map((t) => t.task_id);
  const tabela = { ambos: celula(true, true), so_A: celula(true, false), so_B: celula(false, true), nenhum: celula(false, false) };
  const ic = n > 0 ? tangoIC(tabela.so_A.length, tabela.so_B.length, n) : tangoIC(0, 0, 0);
  const haVeredicto = fechou && valida === true && n > 0;
  const vacuo = haVeredicto && aceitesA - MARGEM <= 0;
  return {
    n_pares_validos: n,
    aceites_A: aceitesA, aceites_B: aceitesB,
    wilson_A: n > 0 ? arredWilson(wilson(aceitesA, n)) : null,
    wilson_B: n > 0 ? arredWilson(wilson(aceitesB, n)) : null,
    tabela_2x2: tabela,
    diferenca_emparelhada_A_menos_B: ic.diferenca === null ? null : arred.prop(ic.diferenca),
    ic95_tango: ic.lo === null ? null : { lo: arred.prop(ic.lo), hi: arred.prop(ic.hi) },
    criterio,
    limiar_descritivo_cumprido: haVeredicto ? aceitesB >= aceitesA - MARGEM : null,
    veredicto_vacuo: vacuo,
    veredicto_ausente_porque: haVeredicto ? null
      : !fechou ? 'corrida nao fechou — prefixo, sem veredicto (CUSTO-11)'
      : valida === false ? 'corrida INVALIDA — ver corrida_invalida_por'
      : valida === null ? 'validade da corrida n/d — ver validade_nd_porque'
      : 'sem pares validos',
    AVISO: fechou && valida === true
      ? 'limiar descritivo, nao inferencia. Ver prereg.metricas.primaria.o_que_o_nome_NAO_e.'
      : 'DESCRITIVO DO QUE CORREU. A corrida nao fechou, e invalida ou a validade e n/d: tabela, Wilson e intervalo descrevem o prefixo; nao ha veredicto.',
    AVISO_VACUO: vacuo ? `aceites_A - 2 = ${aceitesA - MARGEM} <= 0: o criterio e verdadeiro por aritmetica, seja qual for B. Nao diz nada sobre o router.` : null,
    AVISO_N: Number.isFinite(nPrereg) && n !== nPrereg ? `primaria sobre ${n} pares validos, nao sobre os ${nPrereg} do pre-registo` : null,
  };
}

/** Resolve a cadeia de suplentes t2 -> s1 -> s2 ... com guarda de ciclo. */
function resolverSuplente(id, substituicoes) {
  const vistos = new Set([id]);
  let actual = id;
  while (substituicoes[actual] && !vistos.has(substituicoes[actual])) {
    actual = substituicoes[actual];
    vistos.add(actual);
  }
  return actual;
}

const preVooFalhou = (p) => (typeof p.falhou === 'boolean' ? p.falhou : Number.isFinite(p.exit_code) && p.exit_code !== 0);
/** Contrato do pre_voo (30): exit_code numerico, falhou booleano, contagens numericas (skips ja e exigido pela 29). */
export const problemasDoPreVoo = (p) => [
  Number.isFinite(p.exit_code) ? null : `exit_code ${JSON.stringify(p.exit_code ?? null)} nao e numero`,
  typeof p.falhou === 'boolean' ? null : `falhou ${JSON.stringify(p.falhou ?? null)} nao e booleano`,
  Number.isFinite(p.tests_corridos) ? null : `tests_corridos ${JSON.stringify(p.tests_corridos ?? null)} nao e numero`,
  Number.isFinite(p.tests_passados) ? null : `tests_passados ${JSON.stringify(p.tests_passados ?? null)} nao e numero`,
].filter(Boolean);

export function analisar(prereg, eventos, { agora = null } = {}) {
  const precos = prereg.metricas.yardstick_custo;
  const tarefasPrereg = prereg.corpus.tarefas;
  const ordemIds = tarefasPrereg.map((t) => t.task_id);
  const suplentesPrereg = Array.isArray(prereg.corpus.suplentes) ? prereg.corpus.suplentes : [];
  eventos = eventos.filter((e) => e && typeof e === 'object' && !Array.isArray(e));   // linhas nao-objecto ja foram contadas por lerLedger; aqui nunca rebentam
  const porTipo = (tipo) => eventos.filter((e) => e.evento === tipo);
  const eventosDesconhecidos = eventos.filter((e) => !EVENTOS_DO_PREREG.includes(e.evento)).map((e) => ({ evento: e.evento === undefined ? null : e.evento, task_id: e.task_id ?? null }));
  const excluidas = porTipo('tarefa_excluida');
  const invalidos = porTipo('par_invalido');
  const paragens = porTipo('paragem');
  const preVoos = porTipo('pre_voo');

  const tectoS = prereg.aceitacao && Number.isFinite(prereg.aceitacao.tecto_por_tentativa_s) ? prereg.aceitacao.tecto_por_tentativa_s : NaN;
  // 33: o modelo pre-registado vem do executor do braco A («--model claude-opus-5»); a escalacao usa «o executor do braco A»
  const modeloPrereg = (() => { const m = /--model\s+(\S+)/.exec((prereg.bracos && prereg.bracos.A && prereg.bracos.A.executor) || ''); return m ? m[1] : null; })();
  const marcas = [];   // pares/tentativas marcados, com motivo — nunca escondidos
  const semDigestDe = new Set();   // 53: passos locais sem digest -> validade n/d
  const marca = (m) => marcas.push(m);
  const corridaInvalidaPor = [];
  const invalida = (motivo, valor) => {
    const j = corridaInvalidaPor.findIndex((x) => x.motivo === motivo);
    if (j >= 0) { corridaInvalidaPor[j].valores.push(valor); return; }
    corridaInvalidaPor.push({ motivo, valores: [valor] });
  };
  for (const e of eventosDesconhecidos) { marca({ task_id: e.task_id, tipo: 'evento_desconhecido', motivo: `evento ${JSON.stringify(e.evento)} fora dos 6 do pre-registo — contado, nao engolido (30); uma retoma pode esconder-se num evento que a analise nao le (34)` }); invalida('evento fora dos 6 do pre-registo — o ledger nao e o do protocolo; uma tentativa a mais pode esconder-se num evento que a analise nao le (interpretacao 34)', `${JSON.stringify(e.evento)}${e.task_id ? ' @ ' + e.task_id : ''}`); }
  // 30: a analise so e a pre-registada se leu o prereg congelado
  if (typeof prereg.__sha256 === 'string' && prereg.__sha256 !== PREREG_SHA256_ESPERADO) invalida('pre-registo lido nao e o congelado (sha256 diferente do esperado) — a analise nao e a pre-registada (interpretacao 30)', `${prereg.__sha256} != ${PREREG_SHA256_ESPERADO}`);
  const ref = (t) => `${t.task_id}/${t.braco}/${t.tentativa ?? 1}`;

  // tentativas: duplicadas (mesmo task/braco/tentativa) — replica identica fica uma; diferente e tentativa a mais (11, 23)
  const duplicadas = [];
  const tentativas = [];
  const repetidas = new Set();
  for (const t of porTipo('tentativa_fim')) {
    const i = tentativas.findIndex((x) => x.task_id === t.task_id && x.braco === t.braco && (x.tentativa ?? 1) === (t.tentativa ?? 1));
    if (i >= 0) {
      const identica = JSON.stringify(tentativas[i]) === JSON.stringify(t);
      duplicadas.push(tentativas[i]); tentativas[i] = t;
      if (identica) marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'tentativa_duplicada', motivo: 'replica byte-identica — fica uma' });
      else {
        repetidas.add(t);
        marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'tentativa_repetida', motivo: 'mesmo task/braco/tentativa escrito 2x com conteudo diferente — tentativa a mais por cima (retoma ate verde)' });
        invalida('tentativa repetida por cima — «nao e retomado», «sem terceira tentativa» (interpretacao 23)', ref(t));
      }
    } else tentativas.push(t);
  }
  // chaves omitidas (12) e contrato de tipo (18) — sobre TODAS, orfas incluidas
  const tipoInvalidoDe = new Map();
  const omitidasDe = new Set();   // 31: chave omitida = null — o par fica marcado invalido para contabilidade
  for (const t of tentativas) {
    const omitidas = CHAVES_OBRIGATORIAS.filter((c) => !(c in t));
    if (omitidas.length) { omitidasDe.add(t); marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'chave_omitida', motivo: omitidas.join(', ') }); invalida('chave obrigatoria omitida — a ledger.regra manda escrever null; omitir e mais barato do que null e nao pode valer menos (interpretacao 31)', `${ref(t)}: ${omitidas.join(', ')}`); }
    const viol = violacoesDeTipo(t);
    if (viol.length) {
      tipoInvalidoDe.set(t, viol);
      marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'tipo_invalido', motivo: viol.join('; ') });
      if (viol.some((v) => v.startsWith('aceite:') || v.startsWith('arrancou:'))) invalida('tipo invalido em aceite/arrancou — a aceitacao do controlador esta partida (interpretacao 18)', `${ref(t)}: ${viol.filter((v) => /^(aceite|arrancou):/.test(v)).join('; ')}`);
      else invalida('tipo invalido numa chave obrigatoria — o par nao pode sair do denominador por isto (27c)', `${ref(t)}: ${viol.join('; ')}`);
    }
  }
  // tentativa_inicio (26): reinicio da mesma tentativa = retoma com outra pegada
  const inicios = porTipo('tentativa_inicio');
  const semFim = new Set();   // `${task_id}/${braco}` com tentativa_inicio sem tentativa_fim (28: o braco ARRANCOU a tentar)
  const iniciosForaDoProtocolo = [];   // 37: inicios que sao «um braco lancado a mais» — (c) no par da tarefa
  if (inicios.length > 0) {
    const chave = (t) => `${t.task_id}|${t.braco}|${t.tentativa ?? 1}`;
    // 37: contrato minimo do tentativa_inicio — task_id e braco strings, tentativa inteiro em {1,2} (A so tem a 1)
    for (const i of inicios) {
      const problemas = [];
      if (typeof i.task_id !== 'string') problemas.push(`task_id ${JSON.stringify(i.task_id ?? null)} nao e string`);
      if (typeof i.braco !== 'string') problemas.push(`braco ${JSON.stringify(i.braco ?? null)} nao e string`);
      const n = i.tentativa ?? 1;
      if (!Number.isInteger(n) || n < 1 || n > 2) problemas.push(`tentativa ${JSON.stringify(i.tentativa)} fora de {1,2}`);
      else if (i.braco === 'A' && n !== 1) problemas.push('o braco A so tem a tentativa 1');
      if (problemas.length) { iniciosForaDoProtocolo.push(i); marca({ task_id: i.task_id, braco: i.braco, tentativa: i.tentativa, tipo: 'inicio_fora_do_protocolo', motivo: problemas.join('; ') }); invalida('tentativa_inicio fora do protocolo — um braco lancado numa tentativa que o pre-registo nao tem (interpretacao 37)', `${i.task_id}/${i.braco}/${i.tentativa ?? 1}: ${problemas.join('; ')}`); }
    }
    const contagem = new Map();
    for (const i of inicios) contagem.set(chave(i), (contagem.get(chave(i)) || 0) + 1);
    const fins = new Set(tentativas.map(chave));
    const chaveDoUltimoInicio = chave(inicios[inicios.length - 1]);   // 37: so o ULTIMO inicio do ledger pode ficar sem fim, e so numa corrida parada (morte a meio)
    for (const [k, n] of contagem) {
      const [task_id, braco, tentativa] = k.split('|');
      if (n > 1) { marca({ task_id, braco, tentativa: Number(tentativa), tipo: 'tentativa_reiniciada', motivo: `${n} eventos tentativa_inicio para a mesma tentativa (interpretacao 26)` }); invalida('tentativa reiniciada — retoma com outra pegada (interpretacao 26)', k.replace(/\|/g, '/')); }
      if (!fins.has(k)) {
        semFim.add(`${task_id}/${braco}`);
        const morteAMeio = paragens.length > 0 && k === chaveDoUltimoInicio;
        marca({ task_id, braco, tentativa: Number(tentativa), tipo: 'tentativa_sem_fim', motivo: morteAMeio ? 'tentativa_inicio sem tentativa_fim — o ultimo inicio do ledger numa corrida parada (morte a meio)' : 'tentativa_inicio sem tentativa_fim — a linha e obrigatoria mesmo no spawn falhado (28); sem paragem, ou fora do ultimo inicio, e um braco lancado a mais (37)' });
        if (!morteAMeio) { iniciosForaDoProtocolo.push({ task_id, braco, tentativa: Number(tentativa) }); invalida('tentativa_inicio sem tentativa_fim numa corrida sem paragem (ou fora do ultimo inicio) — um braco lancado a mais, «sem terceira tentativa» (interpretacao 37)', k.replace(/\|/g, '/')); }
      }
    }
    for (const t of tentativas) if (!contagem.has(chave(t))) marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'tentativa_sem_inicio', motivo: 'tentativa_fim sem tentativa_inicio num ledger que os regista (29)' });
  }
  // session_id repetido (22) — a mesma invocacao contada 2x
  const porSessao = new Map();
  for (const t of tentativas) if (typeof t.session_id === 'string') porSessao.set(t.session_id, [...(porSessao.get(t.session_id) || []), t]);
  for (const [sid, ts] of porSessao) if (ts.length > 1) {
    for (const t of ts) marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'session_id_repetido', motivo: `session_id ${sid} em ${ts.map(ref).join(', ')}` });
    invalida('session_id repetido entre tentativas — a mesma invocacao contada 2x (interpretacao 22)', `${sid}: ${ts.map(ref).join(', ')}`);
  }

  // suplentes (interpretacoes 8 e 15)
  const substituicoes = {};
  const usos = {};
  const excluidasVistas = new Set();
  for (const e of excluidas) {
    // 21.o (6): a mesma tarefa excluida DUAS vezes consome dois suplentes sem correr nenhum — fora do protocolo
    if (excluidasVistas.has(e.task_id)) { marca({ task_id: e.task_id, tipo: 'suplente_fora_do_protocolo', motivo: `tarefa_excluida repetida para ${e.task_id}${e.suplente_usado ? ` — consome ${e.suplente_usado} sem a tarefa ter corrido` : ''} (21.o)` }); invalida('suplente fora do protocolo', `${e.task_id}: excluida duas vezes`); continue; }
    excluidasVistas.add(e.task_id);
    // 33 (d3 do 14.o): a tarefa excluida e do corpus ou da lista de suplentes; outro id consome um suplente sem registo
    if (!ordemIds.includes(e.task_id) && !suplentesPrereg.includes(e.task_id)) { marca({ task_id: e.task_id, tipo: 'suplente_fora_do_protocolo', motivo: `tarefa_excluida com task_id fora do corpus e da lista de suplentes${e.suplente_usado ? ` — consome ${e.suplente_usado} sem registo` : ''}` }); invalida('suplente fora do protocolo', `${e.task_id}: excluida sem ser do corpus nem suplente`); }
    // «suplentes nunca por resultado»: nem depois de uma tentativa_fim, nem depois de um tentativa_inicio (um braco LANCADO e depois retirado; X3 do 10.o)
    if (tentativas.some((t) => t.task_id === e.task_id) || inicios.some((i) => i.task_id === e.task_id)) {
      marca({ task_id: e.task_id, tipo: 'suplente_fora_do_protocolo', motivo: 'tarefa excluida DEPOIS de um braco ter sido lancado (tentativa_inicio ou tentativa_fim) — substituicao por resultado' });
      invalida('suplente fora do protocolo', `${e.task_id}: excluida depois de correr`);
    }
    // um pre-voo que CORREU e FALHOU refuta as duas saidas do prereg: o worktree existiu (o pre-voo corre nele) e a tarefa nao estava «ja verde» (29)
    const pvsEx = preVoos.filter((p) => p.task_id === e.task_id);
    if (pvsEx.length && preVooFalhou(pvsEx[0])) {
      marca({ task_id: e.task_id, tipo: 'exclusao_com_pre_voo_falhado', motivo: `excluida («${e.motivo}») com pre-voo que correu e FALHOU — o worktree existiu e a tarefa nao estava ja verde; nenhuma das duas saidas do prereg se aplica` });
      invalida('tarefa excluida com pre-voo falhado — fora das duas saidas do prereg para suplentes (interpretacao 15, 29)', e.task_id);
    }
    // 20.o (3): a saida (b) «ja verde» apoiada num pre-voo que «nao falhou» com 0 testes corridos e um runner morto, nao uma tarefa verde — so marca
    if (pvsEx.length && preVooFalhou(pvsEx[0]) === false && pvsEx[0].tests_corridos === 0) marca({ task_id: e.task_id, tipo: 'pre_voo_verde_sem_testes', motivo: `excluida («${e.motivo}») com pre-voo «nao falhou» e tests_corridos 0 — runner morto ou modulo partido, nao «ja verde» (20.o)` });
    if (!e.suplente_usado) continue;
    marca({ task_id: e.task_id, tipo: 'tarefa_substituida', motivo: `substituida por ${e.suplente_usado} («${e.motivo}») — a primaria passa a incluir um suplente` });
    substituicoes[e.task_id] = e.suplente_usado;
    usos[e.suplente_usado] = (usos[e.suplente_usado] || 0) + 1;
    const problemas = [];
    if (!suplentesPrereg.includes(e.suplente_usado)) problemas.push('nao esta em corpus.suplentes');
    // «pela ordem da lista de suplentes, o primeiro disponivel»: o esperado e o primeiro ainda nao usado nem excluido (um salto registado como tarefa_excluida do proprio suplente conta como indisponivel)
    const jaExcluidos = new Set(excluidas.slice(0, excluidas.indexOf(e) + 1).map((x) => x.task_id));
    const esperado = suplentesPrereg.find((s) => !(usos[s] > 0 && s !== e.suplente_usado) && !jaExcluidos.has(s)) || null;
    if (esperado && e.suplente_usado !== esperado) problemas.push(`fora de ordem: o primeiro disponivel era ${esperado} (regra_de_paragem.ordem_obrigatoria)`);
    if (ordemIds.includes(e.suplente_usado)) problemas.push('e id do corpus');
    if (usos[e.suplente_usado] > 1) problemas.push('usado mais de uma vez');
    if (problemas.length) {
      marca({ task_id: e.task_id, tipo: 'suplente_fora_do_protocolo', motivo: `${e.suplente_usado}: ${problemas.join('; ')}` });
      invalida('suplente fora do protocolo', `${e.task_id} -> ${e.suplente_usado}: ${problemas.join('; ')}`);
    }
  }
  const idsEmJogo = [...new Set(ordemIds.map((id) => resolverSuplente(id, substituicoes)))];
  if (idsEmJogo.length !== ordemIds.length) invalida('tarefas em jogo repetidas apos suplentes', `${idsEmJogo.length} distintas de ${ordemIds.length}`);

  // tentativas orfas: task_id fora do jogo ou braco fora de {A,B} — nao se descartam (interpretacao 11)
  const orfas = tentativas.filter((t) => !idsEmJogo.includes(t.task_id) || (t.braco !== 'A' && t.braco !== 'B'));
  for (const t of orfas) { marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'tentativa_orfa', motivo: !idsEmJogo.includes(t.task_id) ? 'task_id fora das tarefas em jogo' : `braco ${JSON.stringify(t.braco)} fora de {A,B}` }); invalida('tentativa orfa — uma tentativa a mais fora de {A,B} ou fora das tarefas em jogo e uma retoma escondida; «sem terceira tentativa» (interpretacao 34)', ref(t)); }
  // 34: um tentativa_inicio orfao e um braco LANCADO fora do protocolo (a retoma morta antes do fim)
  const iniciosOrfaos = inicios.filter((i) => !idsEmJogo.includes(i.task_id) || (i.braco !== 'A' && i.braco !== 'B'));
  for (const i of iniciosOrfaos) { marca({ task_id: i.task_id, braco: i.braco, tentativa: i.tentativa, tipo: 'inicio_orfao', motivo: !idsEmJogo.includes(i.task_id) ? 'tentativa_inicio com task_id fora das tarefas em jogo' : `tentativa_inicio com braco ${JSON.stringify(i.braco)} fora de {A,B}` }); invalida('tentativa_inicio orfao — um braco lancado fora do protocolo (interpretacao 34)', `${i.task_id}/${i.braco}/${i.tentativa ?? 1}`); }
  const retomaEscondidaEm = (id) => orfas.some((t) => t.task_id === id) || iniciosOrfaos.some((i) => i.task_id === id) || iniciosForaDoProtocolo.some((i) => i.task_id === id) || eventosDesconhecidos.some((e) => e.task_id === id);

  const porTarefa = [];
  for (const id of idsEmJogo) {
    const metaCorpus = tarefasPrereg.find((t) => t.task_id === id) || null;
    // 32: um suplente tem meta pinada (tier do classify congelado + historico do manifesto); `suplente` continua true para a contabilidade
    const metaSuplente = !metaCorpus && suplentesPrereg.includes(id) && SUPLENTES_ESPERADOS[id] ? { task_id: id, ...SUPLENTES_ESPERADOS[id], ordem_dos_bracos: null } : null;
    const meta = metaCorpus || metaSuplente;
    const historico = meta && Number.isFinite(meta.tests_total_historico) ? meta.tests_total_historico : null;
    const ts = tentativas.filter((t) => t.task_id === id && (t.braco === 'A' || t.braco === 'B'));
    // tier: do prereg; para suplentes, do ledger se unanime (interpretacao 8)
    const tiersLedger = [...new Set(ts.map((t) => t.tier_classificado).filter((x) => x != null))];
    let tier = meta ? meta.tier_classificado : null;
    if (meta && ts.length > 0 && tiersLedger.some((x) => x !== meta.tier_classificado)) {
      marca({ task_id: id, tipo: 'tier_divergente', motivo: `prereg ${meta.tier_classificado}, ledger ${tiersLedger.join(', ')}` });
      invalida('tier no ledger diferente do pre-registado — classify.js e o template estao congelados (interpretacao 8)', `${id}: prereg ${meta.tier_classificado}, ledger ${tiersLedger.join(', ')}`);
    }
    if (!meta && ts.length > 0) {
      if (tiersLedger.length === 1) tier = tiersLedger[0];
      else if (tiersLedger.length > 1) { marca({ task_id: id, tipo: 'tier_inconsistente', motivo: `tiers no ledger: ${tiersLedger.join(', ')}` }); invalida('tier inconsistente entre as linhas da mesma tarefa — o classify.js e deterministico, duas respostas e um controlador partido (interpretacoes 8, 32)', `${id}: ${tiersLedger.join(', ')}`); }
      else { marca({ task_id: id, tipo: 'tier_desconhecido', motivo: 'suplente sem tier_classificado em nenhuma tentativa' }); invalida('tarefa sem tier_classificado em nenhuma linha e sem meta pinada — o protocolo de B nao e verificavel (interpretacao 32)', id); }
    }
    if (metaCorpus && ts.length > 0 && tiersLedger.length > 1) { marca({ task_id: id, tipo: 'tier_inconsistente', motivo: `tiers no ledger: ${tiersLedger.join(', ')}` }); }
    let ordemDosBracos = meta ? meta.ordem_dos_bracos : null;
    let ordemObservada = null;
    let bracosIntercalados = false;
    let tsIlegivel = false;
    for (const x of ts) for (const k of ['ts_inicio', 'ts_fim']) if (!tsCanonico(x[k])) { tsIlegivel = true; }
    if (tsIlegivel) invalida('timestamp ilegivel ou fora da forma canonica numa tentativa — a ordem e a intercalacao nao sao verificaveis (interpretacao 31)', id);
    if (ts.length > 0 && ts.every((t) => typeof t.ts_inicio === 'string')) {
      // 30: por INSTANTE (Date.parse), nunca por string — um offset «-03:00» ou «.500Z» vs «Z» trocava a ordem lexica
      const instante = (s) => (typeof s === 'string' ? Date.parse(s) : NaN);
      const primeiroDe = (bb) => Math.min(...ts.filter((t) => t.braco === bb).map((t) => instante(t.ts_inicio)));
      const a0 = primeiroDe('A'), b0 = primeiroDe('B');
      if (Number.isFinite(a0) && Number.isFinite(b0) && a0 !== b0) ordemObservada = b0 < a0 ? 'A-depois-B' : 'B-depois-A';
      else if (Number.isFinite(a0) && Number.isFinite(b0)) { marca({ task_id: id, tipo: 'ts_iguais_entre_bracos', motivo: `ts_inicio no mesmo instante em A e B — dois spawns sequenciais nao partilham o instante (29)` }); if (meta) invalida('ts_inicio no mesmo instante em A e B numa tarefa do corpus — a ordem pre-registada nao e verificavel (interpretacoes 29, 31)', id); }
      // 30: os bracos nao se intercalam — o intervalo [min ts_inicio, max ts_fim] de cada braco e disjunto do outro (K3: a escalacao de B a correr DEPOIS de A)
      const intervalo = (bb) => { const xs = ts.filter((t) => t.braco === bb); return xs.length ? [Math.min(...xs.map((t) => instante(t.ts_inicio))), Math.max(...xs.map((t) => instante(t.ts_fim)))] : null; };
      const iA = intervalo('A'), iB = intervalo('B');
      if (iA && iB && [...iA, ...iB].every(Number.isFinite) && !(iA[1] <= iB[0] || iB[1] <= iA[0])) { bracosIntercalados = true; marca({ task_id: id, tipo: 'bracos_intercalados', motivo: `A [${new Date(iA[0]).toISOString()}, ${new Date(iA[1]).toISOString()}] e B [${new Date(iB[0]).toISOString()}, ${new Date(iB[1]).toISOString()}] sobrepoem-se — os bracos correm um inteiro antes do outro (30)` }); invalida('bracos intercalados na mesma tarefa — o intervalo de um braco sobrepoe-se ao do outro (interpretacao 30)', id); }
    }
    let ordemDivergente = false;
    if (!metaCorpus) ordemDosBracos = ordemObservada;
    else if (ordemObservada && meta.ordem_dos_bracos && ordemObservada !== meta.ordem_dos_bracos) { ordemDivergente = true; marca({ task_id: id, tipo: 'ordem_divergente', motivo: `prereg ${meta.ordem_dos_bracos}, observado ${ordemObservada} (interpretacao 24)` }); invalida('ordem dos bracos divergente do pre-registo — o contrabalanco e protocolo (CUSTO-12; interpretacoes 24, 27c)', `${id}: prereg ${meta.ordem_dos_bracos}, observado ${ordemObservada}`); }
    // test_file_sha_antes unanime na tarefa: os dois bracos (e todas as tentativas) viram o mesmo ficheiro congelado (29)
    const shasAntes = [...new Set(ts.map((x) => x.test_file_sha_antes).filter((x) => typeof x === 'string'))];
    const shaDivergente = shasAntes.length > 1;
    if (shaDivergente) { marca({ task_id: id, tipo: 'test_file_sha_divergente', motivo: `test_file_sha_antes ${shasAntes.join(' vs ')} — os bracos nao viram o mesmo ficheiro congelado; o par nao e um par` }); invalida('test_file_sha_antes divergente entre os bracos da mesma tarefa (interpretacao 29)', `${id}: ${shasAntes.join(' vs ')}`); }
    const braco = (b) => {
      const xs = ts.filter((t) => t.braco === b).sort((p, q) => (p.tentativa ?? 0) - (q.tentativa ?? 0));
      if (xs.length === 0) return { tentativas: 0, aceite: null, aceite_indecidivel: false, prova_em_falta: null, arrancou_motivo_c: null, tokens: null, valorizacao_usd: null, custo_cli_usd: null, custo_cli_total_usd: null, duration_ms: null, duracoes_ms: [], ate_verde_ms: null, arrancou: null, arrancou_evidencia: null, arrancou_valor_ultima: null, motivo_se_nao: null, escalou: false, tecto: [], tokens_locais: null, modelo_local: [], modelos_opus: [], fontes: [], local_aceite: false, fora_do_protocolo: null, contraditorio: null, arrancou_contraditorio: false, tipo_invalido: false, chave_omitida: false, modelo_divergente: false, outro_modelo: false, local_cloud: false, sem_opus: false, repetida: false, ultima_puro: false, ultima_curta: false };
      const toks = xs.map(tokensOpusDaTentativa);
      let contraditorio = null;
      let semOpus = false;
      let outroModelo = false;   // 36
      let localCloud = false;    // 47
      const custoTotalIncoerenteDe = new Set();   // 39
      let arrancouContraditorio = false;
      let arrancouMotivoC = null;
      let provaEmFalta = null;
      for (const [i, t] of xs.entries()) {
        const rec = reconciliar(t);
        const naoReconcilia = rec.ok === false;
        if (naoReconcilia) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'reconciliacao', motivo: `${rec.motivo} — consumo contestado, nao se imputa (35)` });
        const prob = ehLocal(t) ? { sem_opus: false, campos: [] } : problemasDoModelUsage(t.modelUsage);
        const chegou = arrancouOuEvidencia(t);
        // 35: usage sem modelUsage (ou o inverso) numa claude-p que chegou e um JSON parcial — nem JSON nem transcript
        const jsonParcial = !ehLocal(t) && chegou && (!!(t.usage && typeof t.usage === 'object') !== !!(t.modelUsage && typeof t.modelUsage === 'object'));
        if (jsonParcial) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'json_parcial', motivo: t.usage && typeof t.usage === 'object' ? 'usage presente e modelUsage ausente — JSON parcial; o transcript nao substitui um JSON que chegou (35)' : 'modelUsage presente e usage ausente — JSON parcial; nao se reconcilia (35)' });
        if (!ehLocal(t) && t.modelUsage && typeof t.modelUsage === 'object' && prob.sem_opus) {
          semOpus = true;
          marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'sem_opus_no_modelUsage', motivo: `modelUsage sem chave claude-opus*: {${Object.keys(t.modelUsage).join(', ')}} — a flag --model perdeu-se (interpretacao 20)` });
          invalida('tentativa claude-p sem Opus no modelUsage — executor mal configurado (interpretacao 20)', ref(t));
        }
        if (prob.campos.length > 0) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: prob.campos.join(', ') });
        // 33 (f do 14.o): o modelo pedido e o pre-registado, em TODAS as claude-p (A e escalacao); outro modelo e outro tratamento
        if (!ehLocal(t) && modeloPrereg) {
          if (t.modelo_pedido == null) { marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'modelo_pedido' }); if (chegou) invalida('modelo_pedido null numa claude-p que chegou — o tratamento nao e verificavel (interpretacao 33)', ref(t)); }
          else if (t.modelo_pedido !== modeloPrereg) { marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'modelo_pedido_divergente', motivo: `modelo_pedido ${JSON.stringify(t.modelo_pedido)} != ${modeloPrereg} do pre-registo` }); invalida('modelo_pedido diferente do pre-registado — o tratamento nao foi aplicado como pre-registado (interpretacao 33)', `${ref(t)}: ${t.modelo_pedido}`); }
          if (t.modelUsage && typeof t.modelUsage === 'object') {
            const opusFora = Object.keys(t.modelUsage).filter((k) => ehOpus(k) && k !== modeloPrereg);
            if (opusFora.length) { marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'opus_fora_do_pedido', motivo: `modelUsage com ${opusFora.join(', ')} — outro Opus que nao o pre-registado (${modeloPrereg}) conta tokens mas e outro tratamento` }); invalida('modelUsage com um Opus diferente do pre-registado (interpretacao 33)', `${ref(t)}: ${opusFora.join(', ')}`); }
            if (typeof t.modelo_reportado === 'string' && !(t.modelo_reportado in t.modelUsage)) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'modelo_reportado_divergente', motivo: `modelo_reportado ${JSON.stringify(t.modelo_reportado)} nao e uma chave do modelUsage {${Object.keys(t.modelUsage).join(', ')}}` });
            if (t.modelo_reportado == null && chegou) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'modelo_reportado' });
          }
        }
        if (!ehLocal(t) && t.modelUsage && typeof t.modelUsage === 'object') {
          const tok = (v) => ['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'].reduce((s, c) => s + (Number.isFinite(v && v[c]) ? v[c] : 0), 0);
          const opus = Object.entries(t.modelUsage).filter(([k]) => ehOpus(k)).reduce((s, [, v]) => s + tok(v), 0);
          const outros = Object.entries(t.modelUsage).filter(([k]) => !ehOpus(k)).reduce((s, [, v]) => s + tok(v), 0);
          // 36: com o Opus abaixo do piso e outro modelo a consumir mais, o Opus nao fez o trabalho — outro tratamento (33), (c) no par
          if (outros > opus && opus < TRANSCRIPT_MINIMO) { outroModelo = true; marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'outro_modelo_fez_o_trabalho', motivo: `${outros} tokens fora de claude-opus* contra ${opus} de Opus (abaixo do piso ${TRANSCRIPT_MINIMO}) — o Opus nao fez o trabalho; outro tratamento (36)` }); invalida('claude-p em que o Opus ficou abaixo do piso e outro modelo consumiu mais — o trabalho correu noutro modelo (interpretacao 36)', `${ref(t)}: opus ${opus}, outros ${outros}`); }
          else if (outros > opus) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'modelo_nao_opus_dominante', motivo: `${outros} tokens fora de claude-opus* contra ${opus} de Opus — o trabalho correu noutro modelo; tokens_opus subestima o consumo (S9 do 13.o)` });
        }
        if (!ehLocal(t) && t.modelUsage && typeof t.modelUsage === 'object') for (const [k, v] of Object.entries(t.modelUsage)) if (k.startsWith('claude-opus') && v && v.costUSD === 0 && ['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'].some((c) => Number.isFinite(v[c]) && v[c] > 0)) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'custo_zero_com_tokens', motivo: `${k} com costUSD 0 e tokens > 0 — o custo_cli_opus_usd fica subestimado (29)` });
        // 39: costUSD ausente/null numa chave Opus e campo em falta (o custo do CLI fica null, nunca 0); total_cost_usd a 0/null ou abaixo da soma dos costUSD e incoerente (custo_cli_total_usd null)
        if (!ehLocal(t) && chegou && t.modelUsage && typeof t.modelUsage === 'object') {
          for (const [k, v] of Object.entries(t.modelUsage)) if (ehOpus(k) && v && typeof v === 'object' && !Number.isFinite(v.costUSD)) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: `${k}.costUSD — custo_cli_opus_usd desconhecido, nunca 0 (39)` });
          const somaCost = Object.values(t.modelUsage).reduce((s, v) => s + (v && Number.isFinite(v.costUSD) ? v.costUSD : 0), 0);
          const todosCustos = Object.values(t.modelUsage).every((v) => v && Number.isFinite(v.costUSD));
          // 43: e no outro sentido — um total acima da soma (com todos os costUSD presentes) infla o custo do CLI de um braco (a sonda: iguais a 1e-16)
          if (t.total_cost_usd == null || t.total_cost_usd === 0 || t.total_cost_usd < somaCost - 1e-6 || (todosCustos && t.total_cost_usd > somaCost * 1.01 + 1e-6)) { custoTotalIncoerenteDe.add(t); marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'custo_cli_incoerente', motivo: `total_cost_usd ${JSON.stringify(t.total_cost_usd ?? null)} com a soma dos costUSD a ${somaCost} — custo_cli_total_usd desconhecido, nunca 0 (39)` }); }
        }
        // 44: o costUSD do CLI e a valorizacao a preco de lista coincidem na sonda (0.58975 exactos); mais de 5 % de diferenca marca (so marca — uma tabela de precos diferente no CLI e plausivel)
        if (toks[i] && toks[i].fonte === 'json' && Number.isFinite(toks[i].custo_cli_usd)) {
          const lista = valorizar(toks[i], precos);
          if (lista !== null && lista > 0 && Math.abs(toks[i].custo_cli_usd - lista) > 0.05 * lista) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'custo_cli_diverge_da_lista', motivo: `costUSD ${toks[i].custo_cli_usd} vs ${arred.usd(lista)} a preco de lista (${((toks[i].custo_cli_usd / lista - 1) * 100).toFixed(1)} %) — o custo do CLI nao bate com os tokens (44)` });
        }
        // 40: session_id null numa claude-p cujo JSON CHEGOU (usage ou modelUsage) — o JSON do CLI traz sempre um; sem ele a 22 (session_id repetido) fica cega. Um tecto sem JSON nao tem session_id por definicao.
        if (!ehLocal(t) && t.session_id == null && ((t.usage && typeof t.usage === 'object') || (t.modelUsage && typeof t.modelUsage === 'object'))) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'session_id — o JSON do CLI traz sempre um; a 22 fica cega (40)' });
        // 38: coerente mas implausivel — abaixo do que a sonda desta maquina gasta so para responder «OK»
        if (toks[i] && toks[i].fonte === 'json' && toks[i].total < SONDA_TOTAL_OPUS) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'abaixo_da_sonda', motivo: `Opus com ${toks[i].total} tokens — abaixo dos ${SONDA_TOTAL_OPUS} da sonda («Responde apenas: OK», custo-fixture-sonda.json); coerente mas implausivel (38)` });
        // 57: o eixo implausivel e a CACHE — o system prompt e criado ou lido em toda a invocacao (58 964 dos 58 970 da sonda); uma forja com cache 0/0 acima do total passava a 38
        else if (toks[i] && toks[i].fonte === 'json' && toks[i].cache_creation + toks[i].cache_read < SONDA_CACHE_OPUS) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'abaixo_da_sonda', motivo: `Opus com cache_creation ${toks[i].cache_creation} + cache_read ${toks[i].cache_read} = ${toks[i].cache_creation + toks[i].cache_read} — abaixo dos ${SONDA_CACHE_OPUS} de cache da sonda (o system prompt e criado ou lido em toda a invocacao); coerente mas implausivel (57)` });
        // 20.o (7): uma claude-p ACEITE com 0 tokens de saida do Opus nao editou nada — so marca (efeito na valorizacao ~3 %)
        if (toks[i] && toks[i].fonte === 'json' && t.aceite === true && toks[i].output === 0) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'aceite_sem_output', motivo: 'aceite=true com outputTokens 0 do Opus — uma invocacao que editou ficheiros com 0 tokens de saida e impossivel (20.o)' });
        if (ehLocal(t) && typeof t.worktree_listagem_sha_antes === 'string' && typeof t.worktree_listagem_sha_depois === 'string' && t.worktree_listagem_sha_antes !== t.worktree_listagem_sha_depois) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'rasto_do_passo_local', motivo: `listagem do worktree mudou no passo local (${t.worktree_listagem_sha_antes} -> ${t.worktree_listagem_sha_depois}) — a escalacao nao parte do mesmo estado que A (CUSTO-02; so reportado)` });
        if (!ehLocal(t) && toks[i] === null && !naoReconcilia && !jsonParcial && t.modelUsage && typeof t.modelUsage === 'object' && !prob.sem_opus && prob.campos.length === 0) {
          const opusTot = Object.entries(t.modelUsage).filter(([k]) => ehOpus(k)).reduce((s, [, v]) => s + ['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'].reduce((a, c) => a + (Number.isFinite(v && v[c]) ? v[c] : 0), 0), 0);
          if (opusTot === 0) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'tokens_zero_com_arrancou', motivo: 'modelUsage Opus com todos os tokens a zero numa claude-p que chegou ao CLI — impossivel; consumo desconhecido (interpretacao 20)' });
          else marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'tokens_implausiveis', motivo: `Opus com ${opusTot} tokens numa claude-p que chegou — abaixo do piso ${TRANSCRIPT_MINIMO} (a sonda custa 58 970 so para «OK»); consumo desconhecido (36)` });
        }
        if (toks[i] === null) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'consumo_desconhecido', motivo: naoReconcilia ? 'usage e modelUsage nao reconciliam — consumo contestado, nao se imputa (35)' : jsonParcial ? 'JSON parcial (usage sem modelUsage ou o inverso) — nem JSON nem transcript (35)' : prob.sem_opus || prob.campos.length ? 'modelUsage sem Opus utilizavel e sem tokens_transcript > 0' : t.arrancou === false ? `nao arrancou sem ser spawn:* (motivo_se_nao=${JSON.stringify(t.motivo_se_nao ?? null)}) — nao se zera (interpretacao 3)` : 'arrancou, sem modelUsage e sem tokens_transcript > 0 — tecto ou morte sem JSON', transcript: Number.isFinite(t.tokens_transcript) ? t.tokens_transcript : null });
        if (toks[i] && toks[i].fonte === 'json' && typeof toks[i].reparticao_cache === 'string' && toks[i].reparticao_cache.startsWith('n/d') && toks[i].cache_creation > 0) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'reparticao_cache_nd', motivo: `cache_creation ${toks[i].cache_creation} sem divisao 1h/5m utilizavel (${toks[i].reparticao_cache}) — valorizacao null, nunca zero (31)` });
        if (toks[i] && toks[i].fonte === 'transcript') marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'consumo_do_transcript', motivo: 'sem JSON; total do transcript e a unica fonte (prereg secundaria.timeout_sem_json)', transcript: t.tokens_transcript });
        if (ehLocal(t)) {
          const pecasCli = pecasDeEvidenciaBruta(t);
          if (pecasCli.length) { marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_com_evidencia_de_cli', motivo: `passo local com ${pecasCli.join('+')} — correu em claude-p rotulado router-execute; consumo de Opus DESCONHECIDO, nao zero (30)` }); invalida('passo local com evidencia de CLI — executor mal rotulado, o tratamento nao foi aplicado como pre-registado (interpretacoes 16, 30)', ref(t)); }
          const faltam = ['tokens_locais', 'modelo_reportado', 'texto_local_sha256'].filter((c) => t[c] == null);   // 52: o sha do texto e obrigatorio no router-execute
          if (faltam.length) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: faltam.join(', ') });
          if (!arrancouDaTentativa(t)) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_nao_arrancou', motivo: `arrancou=${JSON.stringify(t.arrancou ?? null)}${t.motivo_se_nao ? ' · ' + t.motivo_se_nao : ''}` });
          // 46: um local que «arrancou» sem produzir nada (tokens 0 ou sha de "") nao e o tratamento B — marca; a totalidade e a 45
          if (localSemSaida(t)) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_sem_saida', motivo: `passo local sem saida provada (tokens_locais=${JSON.stringify(t.tokens_locais ?? null)}, texto_local_sha256=${t.texto_local_sha256 === SHA256_VAZIO ? 'sha256("")' : JSON.stringify(t.texto_local_sha256 ?? null)}) — «arrancou» sem produzir nada, ou sem o provar; escalar daqui nao e o protocolo (46, 52)` });
          // 47: o modelo do passo local e tratamento — um router-execute em `claude-*` e Opus (ou outro cloud) rotulado local, com consumo ZERO por construcao (33 estendida ao local)
          const modelosDoLocal = [t.modelo_pedido, t.modelo_reportado].filter((m) => typeof m === 'string');
          if (modelosDoLocal.some(ehModeloCloud)) { localCloud = true; marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_em_modelo_cloud', motivo: `router-execute com modelo ${modelosDoLocal.filter(ehModeloCloud).join('/')} — o passo local correu num modelo cloud (o dono decidiu «so local (ollama)»); consumo zero por construcao numa linha que nao e local (47, 53)` }); invalida('passo local num modelo cloud — o tratamento B nao foi aplicado; outro tratamento (interpretacoes 47, 53)', ref(t)); }
          else if (typeof t.modelo_reportado === 'string' && !/@sha256:/.test(t.modelo_reportado)) { marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'modelo_local_sem_digest', motivo: `modelo_reportado ${JSON.stringify(t.modelo_reportado)} sem «@sha256:» — o prereg pede nome+digest do ollama; sem digest o modelo local nao e verificavel (47, 53)` }); semDigestDe.add(t); }
          // 20.o (5): o modelo reportado (nome antes do digest) tem de ser o pedido — o router trocou de modelo; so marca (a 5 exige unanimidade entre passos)
          if (typeof t.modelo_pedido === 'string' && typeof t.modelo_reportado === 'string' && t.modelo_reportado.split('@')[0] !== t.modelo_pedido) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'modelo_local_divergente_do_pedido', motivo: `modelo_reportado ${JSON.stringify(t.modelo_reportado)} nao e o modelo_pedido ${JSON.stringify(t.modelo_pedido)} (20.o)` });
          // 20.o (6): plausibilidade do local — mais de 10 tokens por ms (10 000 tok/s) nao e um modelo local; so marca (velocidade fora do criterio)
          if (Number.isFinite(t.tokens_locais) && Number.isFinite(t.duration_ms) && t.tokens_locais / Math.max(t.duration_ms, 1) > 10) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_velocidade_implausivel', motivo: `tokens_locais ${t.tokens_locais} em ${t.duration_ms} ms (${Math.round(t.tokens_locais / Math.max(t.duration_ms, 1) * 1000)} tok/s) — nenhum modelo local faz isto (20.o)` });
          if (t.aceite === true) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_aceite', motivo: 'passo local ACEITE — impossivel por construcao (DECLARACAO_DE_DEGENERESCENCIA); a aceitacao do controlador esta partida' });
          // 21.o (4): um local com a aceitacao VERDE (exit 0, passados = corridos > 0) e aceite=false contradiz o pre-voo falhado e a DECLARACAO — so marca (a escalacao dai e o protocolo a letra)
          if (t.aceite === false && t.exit_code === 0 && Number.isFinite(t.tests_corridos) && t.tests_corridos > 0 && t.tests_passados === t.tests_corridos) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_verde_rejeitado', motivo: `passo local com exit_code 0 e ${t.tests_passados}/${t.tests_corridos} passados, aceite=false — a aceitacao local estava verde e escalou na mesma (21.o)` });
          // 97 do 19.o: o tempo do passo local tambem tem de fazer sentido (so marca — nao e direccional)
          const segundosL = typeof t.ts_inicio === 'string' && typeof t.ts_fim === 'string' ? (Date.parse(t.ts_fim) - Date.parse(t.ts_inicio)) / 1000 : NaN;
          if (Number.isFinite(segundosL) && segundosL < 0) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'tempo_incoerente', motivo: `ts_fim ${t.ts_fim} antes de ts_inicio ${t.ts_inicio} (passo local)` });
          if (t.arrancou === true && typeof t.motivo_se_nao === 'string' && t.motivo_se_nao.length > 0) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'motivo_com_arrancou', motivo: `arrancou=true com motivo_se_nao=${JSON.stringify(t.motivo_se_nao)} (passo local; interpretacao 25)` });
        } else {
          if (!arrancouDaTentativa(t)) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'tentativa_nao_arrancou', motivo: `arrancou=${JSON.stringify(t.arrancou ?? null)}${t.motivo_se_nao ? ' · ' + t.motivo_se_nao : ''}` });
          if (t.arrancou == null) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'arrancou' });
          // 56/58: o inverso da 22 — `arrancou: true` SEM JSON e sem transcript e uma afirmacao sem prova. Sem JSON, a UNICA evidencia e o transcript (58):
          // o session_id pode ser pre-gerado pelo controlador (brief 98) e o total_cost_usd e um campo do JSON — nenhum dos dois prova que o modelo respondeu
          const temJsonCli56 = !!((t.usage && typeof t.usage === 'object') || (t.modelUsage && typeof t.modelUsage === 'object'));
          if (t.arrancou === true && !temJsonCli56 && !(Number.isFinite(t.tokens_transcript) && t.tokens_transcript >= TRANSCRIPT_MINIMO)) {
            marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'arrancou_sem_evidencia', motivo: `arrancou=true sem usage/modelUsage e sem tokens_transcript >= ${TRANSCRIPT_MINIMO} (session_id=${JSON.stringify(t.session_id ?? null)} nao prova: pode ser pre-gerado) — sem JSON a unica evidencia e o transcript; uma rejeicao assim baixa o braco sem prova (56, 58)` });
            arrancouContraditorio = true; arrancouMotivoC = arrancouMotivoC || 'arrancou=true sem JSON nem transcript (interpretacoes 56, 58)';
            invalida('arrancou=true numa claude-p sem JSON nem transcript — afirmacao sem prova (interpretacoes 56, 58)', ref(t));
          }
          // 58: total_cost_usd e um campo do JSON — um custo sem usage/modelUsage e uma linha que se contradiz
          if (!temJsonCli56 && Number.isFinite(t.total_cost_usd) && t.total_cost_usd !== 0) {
            marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'custo_sem_json', motivo: `total_cost_usd ${t.total_cost_usd} sem usage nem modelUsage — o custo vem do JSON que nao chegou (58)` });
            arrancouContraditorio = true; arrancouMotivoC = arrancouMotivoC || 'total_cost_usd sem JSON (interpretacao 58)';
            invalida('total_cost_usd numa claude-p sem usage nem modelUsage — o custo vem do JSON que nao chegou (interpretacao 58)', ref(t));
          }
          // 21.o (3): Opus com mais de 1 token de saida por ms (1 000 tok/s) — so marca (velocidade fora do criterio)
          if (toks[i] && toks[i].fonte === 'json' && Number.isFinite(t.duration_ms) && t.duration_ms > 0 && toks[i].output / t.duration_ms > 1) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'output_velocidade_implausivel', motivo: `outputTokens ${toks[i].output} em ${t.duration_ms} ms (${Math.round(toks[i].output / t.duration_ms * 1000)} tok/s) — o Opus nao escreve a esta velocidade (21.o)` });
          // 59: um so turno nao edita ficheiros (a tool call exige um 2.o turno) — com `num_turns` registado (brief 106) marca; so marca
          if (t.aceite === true && Number.isInteger(t.num_turns) && t.num_turns <= 1) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'aceite_num_so_turno', motivo: `aceite=true com num_turns ${t.num_turns} — um so turno nao chama ferramentas nem edita ficheiros (59)` });
          // interpretacao 22: nao-arrancou so e o que o prereg define (spawn:*, sem JSON, sem 900 s) — null incluido (B2 do 7.o)
          const segundosT = typeof t.ts_inicio === 'string' && typeof t.ts_fim === 'string' ? (Date.parse(t.ts_fim) - Date.parse(t.ts_inicio)) / 1000 : NaN;
          const motivoSpawn = motivoSpawnPuro(t.motivo_se_nao);
          const durouComoTecto = Number.isFinite(tectoS) && ((Number.isFinite(segundosT) && segundosT >= tectoS) || (Number.isFinite(t.duration_ms) && t.duration_ms >= tectoS * 1000));
          const curta = foiCurta(t);
          // 22/28: nao-arrancou e SO o puro (arrancou=false, spawn:* sem timeout, curto, sem evidencia); null, outro motivo, longo — tudo fora da definicao
          if (t.arrancou !== true && !evidenciaDeArranque(t) && !naoArrancouPuro(t)) {
            arrancouContraditorio = true; arrancouMotivoC = arrancouMotivoC || 'nao-arrancou fora da definicao do pre-registo (interpretacao 22)';
            const porque = (t.arrancou !== false ? ` e arrancou=${JSON.stringify(t.arrancou ?? null)} nao e false` : '') + (!motivoSpawn ? ' e o motivo nao e spawn:* (sem timeout)' : '') + (durouComoTecto ? ` e ${segundosT}s/${t.duration_ms}ms >= tecto ${tectoS}s` : !curta ? ` e nao foi curta (duration_ms=${JSON.stringify(t.duration_ms ?? null)}, ts ${Number.isFinite(segundosT) ? segundosT + 's' : 'n/d'}; limite ${CURTO_S}s, interpretacao 28)` : '');
            marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'nao_arrancou_fora_da_definicao', motivo: `arrancou=${JSON.stringify(t.arrancou ?? null)} com motivo_se_nao=${JSON.stringify(t.motivo_se_nao ?? null)}${porque} — nao-arrancou e SO spawn:* sem JSON, curto e sem tecto; «estourar o tecto = nao aceite» conta contra o braco (interpretacao 22)` });
            invalida('nao-arrancou fora da definicao do pre-registo — o controlador classifica falhas como nao-arranques (interpretacao 22)', ref(t));
          }
          // interpretacao 22: a flag nao pode contradizer a evidencia da propria linha
          if (t.arrancou !== true && evidenciaDeArranque(t)) {
            arrancouContraditorio = true; arrancouMotivoC = arrancouMotivoC || 'arrancou contradiz a evidencia da linha (interpretacao 22)';
            const ev = pecasDeEvidencia(t).join('+');
            marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'arrancou_contraditorio', motivo: `arrancou=${JSON.stringify(t.arrancou ?? null)} (${t.motivo_se_nao ?? 'sem motivo'}) mas a linha tem ${ev}: a invocacao CHEGOU ao CLI (interpretacao 22)` });
            invalida('arrancou contradiz a evidencia da linha — o controlador escreve nao-arrancou em invocacoes que chegaram ao Opus (interpretacao 22)', ref(t));
          }
          // interpretacao 12/19: numa claude-p que chegou, as provas da aceitacao sao obrigatorias
          if (chegou && typeof t.aceite === 'boolean') {
            const tipoErrado = new Set((tipoInvalidoDe.get(t) || []).map((v) => v.split(':')[0]));
            const faltam = PROVAS_DA_ACEITACAO.filter((c) => t[c] == null || tipoErrado.has(c));
            if (faltam.length) {
              const contaEmB = t.aceite === false && b === 'B';
              marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: `provas da aceitacao: ${faltam.join(', ')}${contaEmB ? ' — aceite=false em B conta como registado (27b)' : t.aceite === false ? ' — aceite=false em A sem prova: baixar A favorece B (27c)' : ''}` });
              if (!contaEmB) { provaEmFalta = provaEmFalta || faltam.join(', '); invalida(t.aceite === true ? 'aceite=true sem prova completa — nao verificavel; retirar o par favorece um braco (27c)' : 'aceite=false em A sem prova completa — nao verificavel; baixar A favorece B (27c)', `${ref(t)}: ${faltam.join(', ')}`); }
            }
          }
          // 31: tempo por INSTANTE; numa linha que chegou, um tempo impossivel e (c) — a linha e uma testemunha que se contradiz
          const tempoIncoerente = (Number.isFinite(segundosT) && segundosT === 0 && Number.isFinite(t.duration_ms) && t.duration_ms > 0) ? `ts_fim === ts_inicio com duration_ms ${t.duration_ms} — os dois ts no momento da escrita`
            : chegou && Number.isFinite(segundosT) && segundosT < 0 ? `ts_fim ${t.ts_fim} antes de ts_inicio ${t.ts_inicio}`
            : chegou && Number.isFinite(segundosT) && segundosT === 0 ? 'ts_fim === ts_inicio numa invocacao que chegou — nenhuma chamada ao CLI dura 0 ms'
            : chegou && t.duration_ms === 0 ? 'duration_ms 0 numa invocacao que chegou' : null;
          if (tempoIncoerente) { marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'tempo_incoerente', motivo: tempoIncoerente }); if (chegou) { arrancouContraditorio = true; arrancouMotivoC = arrancouMotivoC || 'tempo incoerente numa linha que chegou (interpretacao 31)'; invalida('tempo incoerente numa linha que chegou ao CLI — a testemunha contradiz-se (interpretacao 31)', `${ref(t)}: ${tempoIncoerente}`); } }
          if (chegou && Number.isFinite(segundosT) && Number.isFinite(t.duration_ms) && Math.abs(segundosT * 1000 - t.duration_ms) > 60000) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'duracao_incoerente', motivo: `duration_ms ${t.duration_ms} vs ts_fim - ts_inicio ${segundosT}s — mais de 60 s de diferenca (so velocidade)` });
          if (durouComoTecto) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'tecto_aparente', motivo: `ts_fim - ts_inicio = ${segundosT}s >= tecto ${tectoS}s (aceite=${JSON.stringify(t.aceite ?? null)}) — so marca, o intervalo pode incluir a aceitacao (interpretacao 19)` });
          if (t.arrancou === true && typeof t.motivo_se_nao === 'string' && t.motivo_se_nao.length > 0) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'motivo_com_arrancou', motivo: `arrancou=true com motivo_se_nao=${JSON.stringify(t.motivo_se_nao)} (interpretacao 25)` });
        }
        if (t.aceite == null) { marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'aceite' }); invalida(ehLocal(t) ? 'aceite null num passo local — o local corre a aceitacao e escreve false; retirar o par favorece um braco (27c, 31)' : 'aceite null numa claude-p — o input da primaria em falta; retirar o par favorece um braco (27c)', ref(t)); }
        if (meta && t.tier_classificado == null) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'tier_classificado (o runtime nao confirmou o tier pre-registado)' });
        if (typeof t.e_escalacao === 'boolean' && Number.isFinite(t.tentativa) && t.e_escalacao !== (t.tentativa === 2)) { marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'escalacao_incoerente', motivo: `e_escalacao=${t.e_escalacao} com tentativa=${t.tentativa} (interpretacao 25)` }); invalida('e_escalacao incoerente com a tentativa — a linha contradiz-se (interpretacoes 25, 31)', ref(t)); }
        let contra = aceiteContraditorio(t, historico, pv && Number.isFinite(pv.skips) ? pv.skips : null);
        // 48: o duration_ms de uma claude-p e o do JSON do CLI (nao inclui a aceitacao): >= tecto com aceite=true e «estourou o tecto e foi aceite» — o tecto e criterio (19)
        if (!contra && !ehLocal(t) && t.aceite === true && Number.isFinite(tectoS) && Number.isFinite(t.duration_ms) && t.duration_ms >= tectoS * 1000) contra = `aceite=true com duration_ms ${t.duration_ms} >= tecto ${tectoS}s — o tecto e criterio, «estourar o tecto = nao aceite» (48)`;
        // 54: o JSON do CLI traz sempre duration_ms — null com JSON e campo em falta; com aceite=true a prova do tecto esta em falta (a 48 nao se contorna apagando o campo)
        const temJsonCli = !ehLocal(t) && ((t.usage && typeof t.usage === 'object') || (t.modelUsage && typeof t.modelUsage === 'object'));
        if (temJsonCli && t.duration_ms == null) {
          marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'duration_ms — o JSON do CLI traz sempre um; sem ele o tecto nao e verificavel (54)' });
          if (!contra && t.aceite === true) contra = 'aceite=true sem duration_ms numa claude-p com JSON — a prova do tecto esta em falta (54)';
        }
        // 50: uma rejeicao com ZERO testes corridos (runner morto, modulo partido) nao e um teste vermelho — so marca, com o sentido
        if (!ehLocal(t) && t.aceite === false && t.tests_corridos === 0) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'rejeicao_sem_testes', motivo: `aceite=false com tests_corridos 0 (exit_code=${JSON.stringify(t.exit_code ?? null)}) — runner morto ou modulo partido, nao um teste vermelho; a rejeicao baixa o braco ${b} (50)` });
        if (contra) {
          contraditorio = contraditorio || contra;
          marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'aceite_contraditorio', motivo: contra });
          invalida('aceite contraditorio com a prova registada — a aceitacao do controlador esta partida (interpretacao 19)', `${ref(t)}: ${contra}`);
        }
        if (t.estado_vivo_sha == null) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'estado_vivo_sha' });
        if (t.sentinela_presente !== true && t.sentinela_presente !== false) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'sentinela_presente' });
        if (t.tokens_transcript && toks[i] && toks[i].fonte === 'json' && toks[i].total > 0) {
          const d = Math.abs(t.tokens_transcript - toks[i].total) / toks[i].total;
          if (d > 0.01) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'divergencia_json_vs_transcript', motivo: `${(d * 100).toFixed(1)}%`, json: toks[i].total, transcript: t.tokens_transcript });
        }
      }
      // protocolo de tentativas (interpretacao 16)
      let foraDoProtocolo = null;
      if (b === 'A') {
        if (xs.length > 1) foraDoProtocolo = `A com ${xs.length} tentativas (prereg: 1)`;
        else if (xs.some((t) => t.executor !== 'claude-p')) foraDoProtocolo = `A com executor ${JSON.stringify(xs[0].executor)} (prereg: claude-p)`;
      }
      if (xs.length > 0 && !xs.some((t) => (t.tentativa ?? 1) === 1)) foraDoProtocolo = `${b} com tentativa 2 sem tentativa 1`;
      if (b === 'B' && !foraDoProtocolo) {
        const locais = xs.filter(ehLocal).length;
        const clis = xs.length - locais;
        if (xs.length > 2) foraDoProtocolo = `B com ${xs.length} tentativas (prereg: <= 2)`;
        else if (clis > 1) foraDoProtocolo = `B com ${clis} tentativas claude-p (prereg: no maximo 1, e so depois de um passo local) — independente do tier`;   // 32: S1 do 13.o
        else if (xs.length === 2 && !ehLocal(xs[0])) foraDoProtocolo = 'B com tentativa 2 sem passo local na tentativa 1 — a escalacao so existe depois do local';
        else if (xs.length === 2 && ehLocal(xs[0]) && !ehLocal(xs[1]) && tsCanonico(xs[0].ts_fim) && tsCanonico(xs[1].ts_inicio) && Date.parse(xs[1].ts_inicio) < Date.parse(xs[0].ts_fim)) foraDoProtocolo = `escalacao a comecar (${xs[1].ts_inicio}) antes de o passo local acabar (${xs[0].ts_fim}) — no mesmo worktree, depois do local (S3 do 13.o)`;
        else if (ehTierLocal(tier) && !ehLocal(xs[0])) foraDoProtocolo = `B em ${tier} sem passo local na 1.a tentativa`;
        else if (ehTierLocal(tier) && xs.length === 1 && xs[0].aceite !== true) foraDoProtocolo = `B em ${tier} com passo local nao aceite e sem escalacao (escalacao_em_falta)`;
        else if (tier != null && !ehTierLocal(tier) && (xs.length > 1 || locais > 0)) foraDoProtocolo = `B em ${tier} com ${xs.length} tentativas e ${locais} passo(s) local(is) (prereg: 1, sem local)`;
        else if (locais > 1) foraDoProtocolo = `B com ${locais} passos locais`;
      }
      if (foraDoProtocolo) { marca({ task_id: id, braco: b, tipo: 'tentativas_fora_do_protocolo', motivo: foraDoProtocolo }); invalida('tentativas fora do protocolo — o tratamento nao foi aplicado como pre-registado (interpretacao 16, 27c)', `${id}/${b}: ${foraDoProtocolo}`); }
      const soma = (campo) => somaOuNull(toks.map((k) => (k === null ? null : k[campo])));
      const tokens = toks.some((k) => k === null) ? null : {
        input: soma('input'), output: soma('output'), cache_creation: soma('cache_creation'),
        cache_creation_1h: soma('cache_creation_1h'), cache_creation_5m: soma('cache_creation_5m'),
        cache_read: soma('cache_read'), total: soma('total'),
      };
      const duracoes = xs.map((t) => (Number.isFinite(t.duration_ms) ? t.duration_ms : null));
      // tempo-ate-verde: soma das duracoes ate a primeira tentativa aceite, inclusive; null se nunca aceitou
      const iVerde = xs.findIndex((t) => t.aceite === true);
      const ateVerde = iVerde < 0 ? null : somaOuNull(duracoes.slice(0, iVerde + 1));
      const ultima = xs[xs.length - 1];
      return {
        tentativas: xs.length,
        aceite: xs.some((t) => t.aceite === true),
        aceite_indecidivel: xs.some((t) => typeof t.aceite !== 'boolean'),
        prova_em_falta: provaEmFalta,
        local_aceite: xs.some((t) => ehLocal(t) && t.aceite === true),
        fora_do_protocolo: foraDoProtocolo,
        contraditorio,
        arrancou_contraditorio: arrancouContraditorio,
        arrancou_motivo_c: arrancouMotivoC,
        tipo_invalido: xs.some((t) => tipoInvalidoDe.has(t)),
        chave_omitida: xs.some((t) => omitidasDe.has(t)),
        modelo_divergente: xs.some((t) => !ehLocal(t) && modeloPrereg && ((typeof t.modelo_pedido === 'string' && t.modelo_pedido !== modeloPrereg) || (t.modelUsage && typeof t.modelUsage === 'object' && Object.keys(t.modelUsage).some((k) => ehOpus(k) && k !== modeloPrereg)))),
        outro_modelo: outroModelo,
        local_cloud: localCloud,
        sem_opus: semOpus,
        repetida: xs.some((t) => repetidas.has(t)),
        arrancou: arrancouDaTentativa(ultima),                         // interpretacao 2: a ultima tentativa, pela flag
        arrancou_evidencia: arrancouOuEvidencia(ultima),               // interpretacao 22
        arrancou_valor_ultima: ultima.arrancou === undefined ? null : ultima.arrancou,
        ultima_puro: !ehLocal(ultima) && naoArrancouPuro(ultima),      // interpretacao 28: a unica forma de nao-arrancou que um evento par_invalido pode invocar
        ultima_curta: foiCurta(ultima),
        motivo_se_nao: ultima.motivo_se_nao || null,
        escalou: xs.some((t) => t.e_escalacao === true),
        tokens,
        valorizacao_usd: somaOuNull(toks.map((k) => valorizar(k, precos))),
        custo_cli_usd: somaOuNull(toks.map((k) => (k === null ? null : k.custo_cli_usd))),
        custo_cli_total_usd: somaOuNull(xs.map((t, i) => (ehLocal(t) || (toks[i] && toks[i].fonte === 'nao arrancou') ? 0 : custoTotalIncoerenteDe.has(t) ? null : Number.isFinite(t.total_cost_usd) ? t.total_cost_usd : null))),
        duration_ms: somaOuNull(duracoes),
        duracoes_ms: duracoes,
        ate_verde_ms: ateVerde,
        tecto: xs.map((t) => (t.tecto_do_orcamento === undefined ? null : t.tecto_do_orcamento)),
        tokens_locais: somaOuNull(xs.map((t) => (ehLocal(t) ? (Number.isFinite(t.tokens_locais) ? t.tokens_locais : null) : 0))),
        modelo_local: xs.filter(ehLocal).map((t) => t.modelo_reportado || null),
        modelos_opus: [...new Set(toks.flatMap((k) => (k === null ? [] : k.modelos)))].sort(),
        fontes: toks.map((k) => (k === null ? 'desconhecido' : k.fonte)),
      };
    };
    // pre-voo (interpretacao 7): UM por tarefa, o PRIMEIRO decide; repetido e uma tarefa corrida duas vezes (29)
    const pvs = preVoos.filter((e) => e.task_id === id);
    const pv = pvs.length ? pvs[0] : null;
    const preVooOk = pv ? preVooFalhou(pv) : null;
    // 51: o pre-voo e ANTES de qualquer braco (7) — com `ts` canonico tem de ser <= o primeiro inicio da tarefa; sem `ts` marca (o contrato do prereg nao o exige; o brief 63 pede-o)
    let preVooForaDeOrdem = false;
    if (pv) {
      const primeiroInicio = Math.min(...[...ts.map((x) => x.ts_inicio), ...inicios.filter((i) => i.task_id === id).map((i) => i.ts_inicio ?? i.ts)].filter(tsCanonico).map((s) => Date.parse(s)));
      if (pv.ts == null) marca({ task_id: id, tipo: 'pre_voo_sem_ts', motivo: 'pre_voo sem `ts` — a analise nao consegue ver se correu ANTES dos bracos (51; brief 63)' });
      else if (!tsCanonico(pv.ts)) { marca({ task_id: id, tipo: 'pre_voo_fora_de_ordem', motivo: `pre_voo.ts ${JSON.stringify(pv.ts)} nao e um timestamp canonico (51)` }); if (ts.length) { preVooForaDeOrdem = true; invalida('pre_voo com ts ilegivel numa tarefa que correu — a ordem pre-voo -> bracos nao e verificavel (interpretacao 51)', id); } }
      else if (Number.isFinite(primeiroInicio) && Date.parse(pv.ts) > primeiroInicio) { preVooForaDeOrdem = true; marca({ task_id: id, tipo: 'pre_voo_fora_de_ordem', motivo: `pre_voo.ts ${pv.ts} depois do primeiro inicio da tarefa (${new Date(primeiroInicio).toISOString()}) — o pre-voo e ANTES de qualquer braco (7, 51)` }); invalida('pre_voo depois de um braco ter comecado — a tarefa nao estava provadamente vermelha quando os bracos correram (interpretacao 51)', id); }
    }
    if (pvs.length > 1) { marca({ task_id: id, tipo: 'pre_voo_repetido', motivo: `${pvs.length} eventos pre_voo (resultados: ${pvs.map((x) => preVooFalhou(x)).join(', ')}) — fica o primeiro` }); invalida('pre_voo repetido — a tarefa foi preparada mais do que uma vez (interpretacao 7, 29)', id); }
    // 30: o pre_voo tem contrato; e as contagens dizem se «falhou» foi teste vermelho ou runner morto
    const problemasPv = pv ? problemasDoPreVoo(pv) : [];
    if (pv && problemasPv.length && ts.some((x) => !ehLocal(x))) { marca({ task_id: id, tipo: 'pre_voo_incompleto', motivo: problemasPv.join('; ') }); invalida('pre_voo sem contrato (exit_code/falhou/contagens) numa tarefa que correu em claude-p — o pre-voo nao e verificavel (interpretacao 30)', `${id}: ${problemasPv.join('; ')}`); }
    if (pv && pv.falhou === true && pv.exit_code === 0 && ts.some((x) => !ehLocal(x))) invalida('pre_voo com falhou=true e exit_code=0 — o controlador contradiz a propria evidencia (interpretacoes 25, 30)', id);
    if (pv && preVooFalhou(pv) && Number.isFinite(pv.tests_corridos) && (pv.tests_corridos === 0 || (Number.isFinite(pv.tests_passados) && pv.tests_passados === pv.tests_corridos))) marca({ task_id: id, tipo: 'pre_voo_sem_vermelho', motivo: `pre-voo falhou com tests_corridos ${pv.tests_corridos} e tests_passados ${JSON.stringify(pv.tests_passados ?? null)} — runner morto ou nenhum teste vermelho, nao uma tarefa vermelha` });
    if (pv && !Number.isFinite(pv.skips) && ts.some((x) => !ehLocal(x))) { marca({ task_id: id, tipo: 'campo_em_falta', motivo: 'pre_voo.skips — a base da condicao 3 («skip/todo nao aumentou») esta em falta' }); invalida('pre_voo sem skips numa tarefa que correu em claude-p — a condicao 3 da aceitacao nao e verificavel (interpretacao 29)', id); }
    if (pv && Number.isFinite(pv.skips) && Number.isFinite(historico) && pv.skips >= historico) marca({ task_id: id, tipo: 'pre_voo_sem_vermelho', motivo: `pre-voo com skips ${pv.skips} >= historico ${historico} — pode ter falhado por skip, nao por teste vermelho` });
    // 21.o (5): a 55 no pre-voo — exit != 0 com passados + skips == corridos e «nada falhou»; so marca (o pre-voo nao e alavanca da primaria)
    if (pv && preVooFalhou(pv) && Number.isInteger(pv.exit_code) && pv.exit_code !== 0 && Number.isFinite(pv.tests_corridos) && pv.tests_corridos > 0 && Number.isFinite(pv.tests_passados) && Number.isFinite(pv.skips) && pv.tests_passados + pv.skips === pv.tests_corridos) marca({ task_id: id, tipo: 'pre_voo_sem_vermelho', motivo: `pre-voo com exit_code ${pv.exit_code} e tests_passados ${pv.tests_passados} + skips ${pv.skips} == tests_corridos ${pv.tests_corridos} — nada falhou e o runner saiu != 0 (21.o, 55)` });
    const A = braco('A'), B = braco('B');
    const invalidosDaTarefa = invalidos.filter((e) => e.task_id === id);
    const invalido = invalidosDaTarefa[0] || null;
    if (invalidosDaTarefa.length > 1) { marca({ task_id: id, tipo: 'par_invalido_repetido', motivo: `${invalidosDaTarefa.length} eventos par_invalido (${invalidosDaTarefa.map((e) => `${e.braco}:${e.motivo}`).join('; ')}) — so pode haver um, e todos tem de ser verificaveis (30)` }); invalida('par_invalido repetido na mesma tarefa (interpretacao 30)', `${id}: ${invalidosDaTarefa.map((e) => `${e.braco}:${e.motivo}`).join('; ')}`); }
    const temTentativas = A.tentativas + B.tentativas > 0;
    const correu = temTentativas || !!invalido;
    // par_invalido contraditorio (interpretacao 21): os dois bracos chegaram, pela flag ou pela evidencia
    if (invalido && A.tentativas > 0 && B.tentativas > 0 && A.arrancou_evidencia === true && B.arrancou_evidencia === true) {
      marca({ task_id: id, tipo: 'par_invalido_contraditorio', motivo: `evento par_invalido (${invalido.motivo}) numa tarefa em que os dois bracos chegaram ao CLI` });
      invalida('par_invalido contraditorio — seleccao sobre resultados (interpretacao 21)', id);
    }
    // interpretacao 28: um evento par_invalido so e legitimo se for VERIFICAVEL na linha do braco nomeado
    let eventoLegitimo = null;
    if (invalido) {
      const bn = invalido.braco;
      const X = bn === 'A' ? A : bn === 'B' ? B : null;
      const problemas = [];
      if (!X) problemas.push(`braco ${JSON.stringify(bn ?? null)} fora de {A,B}`);
      if (typeof invalido.motivo !== 'string' || invalido.motivo.length === 0) problemas.push(`motivo ${JSON.stringify(invalido.motivo ?? null)} nao e uma string`);
      else if (!motivoSpawnPuro(invalido.motivo)) problemas.push(`motivo ${JSON.stringify(invalido.motivo)} fora da definicao (so spawn:* sem timeout)`);
      if (X && X.tentativas === 0) problemas.push(`sem linha tentativa_fim do braco ${bn} — o nao-arrancou tem de estar registado na linha`);
      if (X && X.tentativas > 0 && !X.ultima_puro) problemas.push(`a ultima tentativa do braco ${bn} nao e um nao-arrancou puro (arrancou=${JSON.stringify(X.arrancou_valor_ultima)}, motivo=${JSON.stringify(X.motivo_se_nao)}, evidencia=${X.arrancou_evidencia}, curta=${X.ultima_curta})`);
      if (X && semFim.has(`${id}/${bn}`)) problemas.push(`tentativa_inicio do braco ${bn} sem tentativa_fim — o braco arrancou a tentar`);
      if (problemas.length) {
        marca({ task_id: id, tipo: 'par_invalido_ilegitimo', motivo: problemas.join('; ') });
        invalida('evento par_invalido nao verificavel na linha do braco nomeado — retirar o par sem prova favorece um braco (interpretacao 28)', `${id}: ${problemas.join('; ')}`);
        eventoLegitimo = false;
      } else eventoLegitimo = true;
    }
    // 32 (S4 do 13.o): o envelope de A copiado para B — usage + modelUsage + duration_ms byte-iguais entre linhas claude-p de bracos diferentes (duas invocacoes reais nao coincidem ao ms)
    {
      const env = (x) => JSON.stringify([x.usage ?? null, x.modelUsage ?? null, x.duration_ms ?? null]);
      const clisA = ts.filter((x) => x.braco === 'A' && !ehLocal(x) && x.modelUsage && typeof x.modelUsage === 'object');
      const clisB = ts.filter((x) => x.braco === 'B' && !ehLocal(x) && x.modelUsage && typeof x.modelUsage === 'object');
      for (const xa of clisA) for (const xb of clisB) if (env(xa) === env(xb)) marca({ task_id: id, tipo: 'envelope_clonado_entre_bracos', motivo: `usage, modelUsage e duration_ms byte-iguais em ${ref(xa)} e ${ref(xb)} — duas invocacoes reais nao coincidem ao ms; so o worktree o refuta (17)` });
    }
    // interpretacao 28: numa corrida sem paragem, um braco sem linha numa tarefa que correu e uma omissao do controlador, nao uma saida (a)
    const bracoSemLinha = temTentativas ? (A.tentativas === 0 ? 'A' : B.tentativas === 0 ? 'B' : null) : null;
    if (bracoSemLinha && !(invalido && invalido.braco === bracoSemLinha) && paragens.length === 0) {   // o braco nomeado sem linha ja e problema do evento
      marca({ task_id: id, braco: bracoSemLinha, tipo: 'braco_sem_linha', motivo: `sem tentativa_fim no braco ${bracoSemLinha} numa corrida sem evento paragem — a linha e obrigatoria mesmo quando o spawn falha` });
      invalida('braco sem tentativa registada numa tarefa que correu, sem paragem — retirar o par sem prova favorece um braco (interpretacao 28)', `${id}/${bracoSemLinha}`);
    }
    if (pv && Number.isFinite(pv.skips)) for (const s of ts) if (Number.isFinite(s.skips) && s.skips > pv.skips) marca({ task_id: id, braco: s.braco, tentativa: s.tentativa, tipo: 'skips_acima_do_pre_voo', motivo: `skips ${s.skips} > ${pv.skips} do pre-voo — testes saltados a mais` });
    // 20.o (4): testes que DESAPARECERAM entre o pre-voo e uma linha aceite (sha igual, corridos abaixo) — so marca (CUSTO-14: a analise nao le o ficheiro)
    if (pv && Number.isFinite(pv.tests_corridos)) for (const s of ts) if (s.aceite === true && Number.isFinite(s.tests_corridos) && s.tests_corridos < pv.tests_corridos) marca({ task_id: id, braco: s.braco, tentativa: s.tentativa, tipo: 'corridos_abaixo_do_pre_voo', motivo: `aceite com tests_corridos ${s.tests_corridos} < ${pv.tests_corridos} do pre-voo — ${pv.tests_corridos - s.tests_corridos} teste(s) desapareceram (20.o)` });
    // 20.o (3): o espelho do pre_voo_sem_vermelho — um pre-voo que «nao falhou» com 0 testes corridos e um runner morto, nao uma tarefa ja verde (a saida (b) para suplente nao se aplica)
    if (pv && preVooOk === false && Number.isFinite(pv.tests_corridos) && pv.tests_corridos === 0) marca({ task_id: id, tipo: 'pre_voo_verde_sem_testes', motivo: 'pre-voo «nao falhou» com tests_corridos 0 — runner morto ou modulo partido, nao «ja verde»; a exclusao para suplente nao se apoia nisto (20.o)' });
    if (pv && pv.falhou === true && pv.exit_code === 0) marca({ task_id: id, tipo: 'pre_voo_incoerente', motivo: 'pre_voo com falhou=true e exit_code=0 (interpretacao 25)' });
    if (correu) {
      if (!pv) { marca({ task_id: id, tipo: 'pre_voo_ausente', motivo: 'tarefa correu sem evento pre_voo' }); if (temTentativas) invalida('pre-voo ausente numa tarefa que correu — retirar o par favorece um braco (interpretacao 7, 27c)', id); }
      else if (!preVooOk) { marca({ task_id: id, tipo: 'pre_voo_nao_falhou', motivo: `pre-voo nao falhou (exit_code=${JSON.stringify(pv.exit_code ?? null)}, falhou=${JSON.stringify(pv.falhou ?? null)}) — tarefa ja verde, aceitacao nao mede nada` }); if (temTentativas) invalida('pre-voo nao falhou numa tarefa que correu — o controlador correu uma tarefa ja verde (interpretacao 7, 27c)', id); }
    }
    // validade do par: por ordem de gravidade, o primeiro motivo fica
    // ── A ESCADA (interpretacao 27) ─────────────────────────────────────
    // (a) par invalido: SO as saidas do prereg. (c) tudo o resto: a corrida ja foi invalidada pelos `invalida(...)` acima;
    // o par fica marcado invalido so para contabilidade, e o motivo diz que a corrida e invalida por ele.
    const valor = (x) => JSON.stringify(x.arrancou_valor_ultima);
    let bracoQueNaoArrancou = null, motivoInvalido = null;
    const c = (m) => `${m} — CORRIDA INVALIDA por isto (27c)`;
    const semLinha = (b) => (paragens.length === 0 ? c(`sem tentativa registada no braco ${b} numa corrida sem paragem (interpretacao 28)`) : `sem tentativa registada no braco ${b} (corrida parada)`);
    if (invalido) { bracoQueNaoArrancou = invalido.braco; motivoInvalido = eventoLegitimo ? String(invalido.motivo) : c(`evento par_invalido ilegitimo: ${marcas.filter((m) => m.task_id === id && m.tipo === 'par_invalido_ilegitimo').map((m) => m.motivo).join('; ')} (interpretacao 28)`); }   // (a) so se verificavel; senao (c)
    else if (temTentativas && A.tentativas === 0) { bracoQueNaoArrancou = 'A'; motivoInvalido = semLinha('A'); }          // (a) so com paragem; senao (c)
    else if (temTentativas && B.tentativas === 0) { bracoQueNaoArrancou = 'B'; motivoInvalido = semLinha('B'); }          // (a) so com paragem; senao (c)
    else if (temTentativas && (A.arrancou_contraditorio || B.arrancou_contraditorio)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c((A.arrancou_contraditorio ? A : B).arrancou_motivo_c); }   // (c)
    else if (temTentativas && retomaEscondidaEm(id)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('tentativa ou evento fora do protocolo nesta tarefa — retoma escondida (interpretacao 34)'); }   // (c)
    else if (temTentativas && A.arrancou !== true) { bracoQueNaoArrancou = 'A'; motivoInvalido = A.ultima_puro ? `nao arrancou (spawn puro: ${A.motivo_se_nao}) sem evento par_invalido` : c(`ultima tentativa com arrancou=${valor(A)} que nao e um nao-arrancou puro`); }   // (a) so puro (28)
    else if (temTentativas && B.arrancou !== true) { bracoQueNaoArrancou = 'B'; motivoInvalido = B.ultima_puro ? `nao arrancou (spawn puro: ${B.motivo_se_nao}) sem evento par_invalido` : c(`ultima tentativa com arrancou=${valor(B)} que nao e um nao-arrancou puro`); }   // (a) so puro (28)
    else if (temTentativas && ordemDivergente) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('ordem dos bracos divergente do pre-registo (interpretacao 24)'); }
    else if (temTentativas && bracosIntercalados) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('bracos intercalados (interpretacao 30)'); }
    else if (temTentativas && shaDivergente) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('test_file_sha_antes divergente entre os bracos (interpretacao 29)'); }
    else if (temTentativas && (A.tipo_invalido || B.tipo_invalido)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('tipo invalido em campo obrigatorio (interpretacao 18)'); }
    else if (temTentativas && (A.chave_omitida || B.chave_omitida)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('chave obrigatoria omitida (interpretacao 31)'); }
    else if (temTentativas && (A.repetida || B.repetida)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('tentativa repetida por cima (interpretacao 23)'); }
    else if (temTentativas && (A.aceite_indecidivel || B.aceite_indecidivel)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('aceite null — o input da primaria esta em falta (interpretacao 12)'); }
    else if (temTentativas && (A.prova_em_falta || B.prova_em_falta)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c(`aceite=true sem prova completa: ${A.prova_em_falta || B.prova_em_falta} (interpretacao 12)`); }
    else if (temTentativas && (A.local_aceite || B.local_aceite)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('passo local aceite — impossivel por construcao (interpretacao 14)'); }
    else if (temTentativas && (A.contraditorio || B.contraditorio)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c(`aceite contraditorio: ${A.contraditorio || B.contraditorio} (interpretacao 19)`); }
    else if (temTentativas && (A.sem_opus || B.sem_opus)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('tentativa claude-p sem Opus no modelUsage (interpretacao 20)'); }
    else if (temTentativas && (A.modelo_divergente || B.modelo_divergente)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('modelo pedido ou Opus diferente do pre-registado (interpretacao 33)'); }
    else if (temTentativas && (A.outro_modelo || B.outro_modelo)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('o Opus ficou abaixo do piso e outro modelo fez o trabalho (interpretacao 36)'); }
    else if (temTentativas && (A.local_cloud || B.local_cloud)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('passo local num modelo cloud — outro tratamento (interpretacoes 47, 53)'); }
    else if (temTentativas && preVooForaDeOrdem) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('pre_voo depois de um braco ter comecado (interpretacao 51)'); }
    else if (temTentativas && (A.fora_do_protocolo || B.fora_do_protocolo)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c(`tentativas fora do protocolo: ${A.fora_do_protocolo || B.fora_do_protocolo}`); }
    else if (temTentativas && !pv) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('pre-voo ausente'); }
    else if (temTentativas && !preVooOk) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = c('pre-voo nao falhou (tarefa ja verde)'); }
    const parValido = correu && motivoInvalido === null;
    // 16.o (6): uma saida (a) num par em que o OUTRO braco tem resultado — a analise diz o sentido da remocao, nunca o cala (a saida e a do pre-registo; o ledger nao a refuta)
    if (motivoInvalido !== null && (bracoQueNaoArrancou === 'A' || bracoQueNaoArrancou === 'B') && !motivoInvalido.includes('(27c)')) {
      const outroNome = bracoQueNaoArrancou === 'A' ? 'B' : 'A';
      const outro = outroNome === 'A' ? A : B;
      if (outro.tentativas > 0 && typeof outro.aceite === 'boolean') {
        const favorece = (bracoQueNaoArrancou === 'A' && outro.aceite === false) || (bracoQueNaoArrancou === 'B' && outro.aceite === true) ? 'B' : 'A';
        const segundo = (ordemDosBracos === 'B-depois-A' && bracoQueNaoArrancou === 'B') || (ordemDosBracos === 'A-depois-B' && bracoQueNaoArrancou === 'A');
        marca({ task_id: id, braco: bracoQueNaoArrancou, tipo: 'par_invalido_com_resultado_no_outro_braco', sentido: `favorece ${favorece}`, motivo: `saida (a) no braco ${bracoQueNaoArrancou} com o braco ${outroNome} ${outro.aceite ? 'aceite' : 'rejeitado'} — retirar este par favorece ${favorece}${segundo ? '; o braco que nao arrancou era o SEGUNDO da ordem (o resultado do primeiro ja era conhecido)' : ''}` });
      }
    }
    // par fechado: os dois bracos tem tentativa, ou um evento par_invalido fechou-o (interpretacao 4)
    const parFechado = !!invalido || (A.tentativas > 0 && B.tentativas > 0);
    porTarefa.push({
      task_id: id, tier, ordem_dos_bracos: ordemDosBracos, ordem_observada: ordemObservada,
      suplente: !metaCorpus,
      pre_voo_falhou: preVooOk,
      correu, par_valido: parValido, par_fechado: parFechado,
      invalido: !parValido && correu ? { braco_que_nao_arrancou: bracoQueNaoArrancou, motivo: motivoInvalido } : null,
      A, B,
    });
  }

  const validos = porTarefa.filter((t) => t.par_valido);
  const invalidosComConsumo = porTarefa.filter((t) => !t.par_valido && t.correu);
  const naoCorridas = porTarefa.filter((t) => !t.correu);

  // 32 (S2 do 13.o): a ordem das TAREFAS vs a coluna `ordem` do prereg — so marca (nao e alavanca da primaria; a cache do CLI aquece dentro da tarefa, nao entre tarefas)
  {
    const inicioDe = (id) => { const xs = tentativas.filter((x) => x.task_id === id && tsCanonico(x.ts_inicio)).map((x) => Date.parse(x.ts_inicio)); return xs.length ? Math.min(...xs) : null; };
    const seq = tarefasPrereg.map((x) => ({ id: resolverSuplente(x.task_id, substituicoes), ordem: x.ordem })).map((x) => ({ ...x, t: inicioDe(x.id) })).filter((x) => x.t !== null).sort((p, q) => p.ordem - q.ordem);
    for (let i = 1; i < seq.length; i++) if (seq[i].t < seq[i - 1].t) marca({ task_id: seq[i].id, tipo: 'ordem_das_tarefas_divergente', motivo: `ordem ${seq[i].ordem} comecou antes da ordem ${seq[i - 1].ordem} (${seq[i - 1].id}) — regra_de_paragem.ordem_obrigatoria; so marca` });
  }
  // ── validade da corrida (interpretacao 5) — sobre TODAS as tentativas, orfas incluidas ──
  const shasEstadoVivo = [...new Set(tentativas.map((t) => t.estado_vivo_sha).filter((x) => x != null))];
  if (shasEstadoVivo.length > 1) corridaInvalidaPor.push({ motivo: 'estado_vivo_sha mudou entre tentativas', valores: shasEstadoVivo });
  const modelosLocais = [...new Set(tentativas.filter(ehLocal).map((t) => t.modelo_reportado).filter((x) => x != null))];
  if (modelosLocais.length > 1) corridaInvalidaPor.push({ motivo: 'modelo local (nome+digest) mudou entre passos locais', valores: modelosLocais });
  // 30: o tecto de orcamento e o mesmo para toda a corrida — «sem tecto» num braco e tecto no outro e tratamento desigual
  const tectos = [...new Set(tentativas.filter((t) => !ehLocal(t)).map((t) => JSON.stringify(t.tecto_do_orcamento === undefined ? null : t.tecto_do_orcamento)))];
  if (tectos.length > 1) {
    corridaInvalidaPor.push({ motivo: 'tecto_do_orcamento divergente entre tentativas claude-p — tratamento desigual (interpretacao 30)', valores: tectos });
    for (const t of tentativas) if (!ehLocal(t)) marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'tecto_divergente', motivo: `tecto_do_orcamento ${JSON.stringify(t.tecto_do_orcamento ?? null)} numa corrida com ${tectos.length} tectos distintos (${tectos.join(', ')})` });
  }
  const semSentinela = tentativas.filter((t) => t.sentinela_presente === false).map(ref);
  if (semSentinela.length > 0) corridaInvalidaPor.push({ motivo: 'sentinela D15 ausente em tentativas', valores: semSentinela });
  const locaisAceites = tentativas.filter((t) => ehLocal(t) && t.aceite === true).map(ref);
  if (locaisAceites.length > 0) corridaInvalidaPor.push({ motivo: 'passo local aceite — a aceitacao do controlador esta partida (interpretacao 14)', valores: locaisAceites });
  const validadeNdPorque = [];
  if (tentativas.length > 0 && tentativas.some((t) => t.sentinela_presente !== true)) validadeNdPorque.push('tentativas sem sentinela_presente === true');
  if (tentativas.length > 0 && tentativas.some((t) => t.estado_vivo_sha == null)) validadeNdPorque.push('tentativas sem estado_vivo_sha — um null nao prova que o estado vivo nao mudou (30)');
  if (tentativas.some((t) => ehLocal(t) && t.modelo_reportado == null)) validadeNdPorque.push('passos locais sem modelo_reportado — um null nao prova que o modelo local nao mudou (30)');
  if (semDigestDe.size) validadeNdPorque.push(`passos locais com modelo_reportado sem «@sha256:» (${semDigestDe.size}) — sem digest o modelo local nao e verificavel; o prereg pede nome+digest (53)`);
  if (tentativas.length === 0) validadeNdPorque.push('sem tentativas');
  // 45: o tratamento B nunca aplicado — TODOS os passos locais da corrida sem arrancar (um transitorio e marca, 2; a totalidade e outra corrida: Opus contra Opus)
  const locaisDaCorrida = tentativas.filter((t) => ehLocal(t) && t.braco === 'B' && idsEmJogo.includes(t.task_id));
  if (locaisDaCorrida.length >= 1 && locaisDaCorrida.every((t) => !arrancouDaTentativa(t) || localSemSaida(t))) invalida('nenhum passo local arrancou COM SAIDA em toda a corrida — o tratamento B (router-execute) nunca foi aplicado; B comparou Opus com Opus (interpretacoes 45, 46)', `${locaisDaCorrida.length} passo(s) local(is), ${locaisDaCorrida.filter((t) => !arrancouDaTentativa(t)).length} nao arrancaram, ${locaisDaCorrida.filter((t) => arrancouDaTentativa(t) && localSemSaida(t)).length} sem saida`);
  const corridaValida = corridaInvalidaPor.length > 0 ? false : validadeNdPorque.length > 0 ? null : true;

  // ── paragem / prefixo ────────────────────────────────────────────────────
  const fechou = porTarefa.every((t) => t.par_fechado) && paragens.length === 0;
  const paragem = paragens.length > 0 ? paragens[paragens.length - 1] : null;
  // 20.o (8): `paragem.ultima_tarefa`/`n` tem de bater com o prefixo executado — so marca (o veredicto ja nao sai com paragem)
  if (paragem) {
    const comTentativa = porTarefa.filter((x) => x.correu).map((x) => x.task_id);
    const ultimaReal = comTentativa.length ? comTentativa[comTentativa.length - 1] : null;
    if (typeof paragem.ultima_tarefa === 'string' && paragem.ultima_tarefa !== ultimaReal) marca({ tipo: 'paragem_incoerente', motivo: `paragem.ultima_tarefa ${JSON.stringify(paragem.ultima_tarefa)} != ultima tarefa com tentativa ${JSON.stringify(ultimaReal)} (20.o)` });
    if (Number.isFinite(paragem.n) && paragem.n !== comTentativa.length) marca({ tipo: 'paragem_incoerente', motivo: `paragem.n ${paragem.n} != ${comTentativa.length} tarefas com tentativa (20.o)` });
  }
  if (paragem && porTarefa.every((t) => t.par_fechado)) marca({ tipo: 'paragem_contraditoria', motivo: `evento paragem («${paragem.motivo}») com todos os pares fechados — uma paragem e «nao fechou»; num fim normal nao se escreve (30)` });
  const estado = { fechou, valida: corridaValida };

  // ── primaria ─────────────────────────────────────────────────────────────
  const criterio = prereg.metricas.primaria.criterio;
  const primaria = primariaDe(validos, criterio, estado, ordemIds.length);
  const suplentesValidos = validos.filter((t) => t.suplente).map((t) => t.task_id);
  primaria.AVISO_SUPLENTES = suplentesValidos.length ? `primaria inclui ${suplentesValidos.length} suplente(s) (${suplentesValidos.join(', ')}) no lugar de tarefas do corpus (${excluidas.filter((e) => e.suplente_usado).map((e) => e.task_id).join(', ')}) — substituicao antes do resultado, mas o corpus nao e o pre-registado` : null;

  // ── secundaria ───────────────────────────────────────────────────────────
  const totalDe = (lista, b) => {
    const toks = lista.map((t) => t[b].tokens);
    return lista.length === 0 ? null : toks.some((k) => k === null) ? null : toks.reduce((s, k) => s + k.total, 0);
  };
  const tokensDeSoltas = (lista, b) => somaOuNull(lista.filter((t) => t.braco === b).map((t) => { const k = tokensOpusDaTentativa(t); return k ? k.total : null; }));
  const vistas = (lista, label, listaInvalidos, soltas) => {
    const porBraco = (b) => {
      const toks = lista.map((t) => t[b].tokens);
      const total = totalDe(lista, b);
      const cats = (campo) => (lista.length === 0 || toks.some((k) => k === null || k[campo] === null) ? null : toks.reduce((s, k) => s + k[campo], 0));
      const aceites = lista.filter((t) => t[b].aceite).length;
      const ambos = lista.filter((t) => t.A.aceite && t.B.aceite);
      const totalAmbos = totalDe(ambos, b);
      // interpretacao 9: as outras leituras do total (0 valido e 0 invalido = 0, nao null: nao ha nada desconhecido)
      const totalInvalidos = listaInvalidos.length === 0 ? 0 : somaOuNull(listaInvalidos.map((t) => (t[b].tentativas === 0 ? 0 : t[b].tokens ? t[b].tokens.total : null)));
      const totalSoltas = tokensDeSoltas(soltas, b);
      const base = lista.length === 0 ? 0 : total;
      const comInvalidos = base === null || totalInvalidos === null ? null : base + totalInvalidos;
      return {
        tokens_opus_total: total,
        tokens_opus_total_incluindo_pares_invalidos: comInvalidos,
        tokens_opus_total_todas_as_tentativas: comInvalidos === null || totalSoltas === null ? null : comInvalidos + totalSoltas,
        por_tarefa_atribuida: lista.length === 0 ? null : (total === null ? null : arred.tok(total / lista.length)),
        por_tarefa_atribuida_sobre_prereg: total === null ? null : arred.tok(total / ordemIds.length),
        por_aceite: arredRazao(razaoOuIndef(total, aceites)),
        so_aceites_por_ambos: { n: ambos.length, tokens_total: totalAmbos, por_tarefa: ambos.length === 0 ? null : (totalAmbos === null ? null : arred.tok(totalAmbos / ambos.length)) },
        por_categoria: { input: cats('input'), output: cats('output'), cache_creation_1h: cats('cache_creation_1h'), cache_creation_5m: cats('cache_creation_5m'), cache_read: cats('cache_read') },
        aceites,
        escalacoes: lista.filter((t) => t[b].escalou).length,
        tokens_locais_a_parte: lista.length === 0 ? null : somaOuNull(lista.map((t) => t[b].tokens_locais)),
        modelos_opus_vistos: [...new Set(lista.flatMap((t) => t[b].modelos_opus))].sort(),
        fontes: lista.flatMap((t) => t[b].fontes).reduce((acc, f) => ({ ...acc, [f === 'nao arrancou' ? 'nao_arrancou' : f]: (acc[f === 'nao arrancou' ? 'nao_arrancou' : f] || 0) + 1 }), { json: 0, transcript: 0, local: 0, nao_arrancou: 0, desconhecido: 0 }),
      };
    };
    return { estrato: label, n: lista.length, A: porBraco('A'), B: porBraco('B') };
  };
  const soltas = [...orfas, ...duplicadas];
  const tierDe = (t) => (t.tier == null ? 'n/d' : t.tier);
  const secundaria = { global: vistas(validos, 'todos', invalidosComConsumo, soltas), por_tier: {} };
  for (const tier of [...new Set(porTarefa.map(tierDe))].sort()) {
    const v = validos.filter((t) => tierDe(t) === tier);
    const idsDoTier = new Set(porTarefa.filter((t) => tierDe(t) === tier).map((t) => t.task_id));
    const nTierPrereg = tarefasPrereg.filter((t) => (t.tier_classificado == null ? 'n/d' : t.tier_classificado) === tier).length;
    secundaria.por_tier[tier] = { ...vistas(v, tier, invalidosComConsumo.filter((t) => tierDe(t) === tier), soltas.filter((t) => idsDoTier.has(t.task_id))), primaria: primariaDe(v, criterio, estado, nTierPrereg) };
  }

  // ── valorizacao ──────────────────────────────────────────────────────────
  const valor = (b) => ({
    valorizacao_teorica_usd: validos.length === 0 ? null : arred.usd(somaOuNull(validos.map((t) => t[b].valorizacao_usd))),
    custo_cli_opus_usd: validos.length === 0 ? null : arred.usd(somaOuNull(validos.map((t) => t[b].custo_cli_usd))),
    custo_cli_total_usd: validos.length === 0 ? null : arred.usd(somaOuNull(validos.map((t) => t[b].custo_cli_total_usd))),
  });
  const valorizacao = {
    ROTULO_OBRIGATORIO: precos.rotulo_obrigatorio_em_qualquer_visualizacao,
    precos_de_lista: { fonte: precos.fonte, sha256: precos.pricing_sha256, opus_usd_por_Mtok: precos.opus_usd_por_Mtok, cache_multiplicadores: precos.cache_multiplicadores },
    A: valor('A'), B: valor('B'),
    NOTA: 'custo_cli_opus_usd = so modelUsage[claude-opus-*].costUSD; custo_cli_total_usd = total_cost_usd da invocacao inteira (subagentes incluidos). Divergem quando ha subagentes. Sobre pares validos; os invalidos estao em fiabilidade.',
    NAO_E: precos.O_QUE_NAO_E,
  };

  // ── velocidade (fora do criterio) ────────────────────────────────────────
  const velocidade = {
    AVISO: 'reportada, fora do criterio',
    A: { tempo_total_ms: validos.length === 0 ? null : somaOuNull(validos.map((t) => t.A.duration_ms)) },
    B: { tempo_total_ms: validos.length === 0 ? null : somaOuNull(validos.map((t) => t.B.duration_ms)) },
    por_tarefa: validos.map((t) => ({
      task_id: t.task_id, A_ms: t.A.duration_ms, B_ms: t.B.duration_ms,
      A_duracoes_ms: t.A.duracoes_ms, B_duracoes_ms: t.B.duracoes_ms,
      A_ate_verde_ms: t.A.ate_verde_ms, B_ate_verde_ms: t.B.ate_verde_ms,
    })),
  };

  // ── fiabilidade: pares invalidos com o consumo que ficou ─────────────────
  const consumoDe = (t) => ({
    consumo_A_tokens: t.A.tokens ? t.A.tokens.total : null, consumo_B_tokens: t.B.tokens ? t.B.tokens.total : null,
    valorizacao_A_usd: arred.usd(t.A.valorizacao_usd), valorizacao_B_usd: arred.usd(t.B.valorizacao_usd),
    custo_cli_A_usd: arred.usd(t.A.custo_cli_usd), custo_cli_B_usd: arred.usd(t.B.custo_cli_usd),
    custo_cli_total_A_usd: arred.usd(t.A.custo_cli_total_usd), custo_cli_total_B_usd: arred.usd(t.B.custo_cli_total_usd),
  });
  const resumoSolta = (t) => { const k = tokensOpusDaTentativa(t); return { task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tokens_opus: k ? k.total : null, custo_cli_usd: k ? arred.usd(k.custo_cli_usd) : null }; };
  const fiabilidade = {
    pares_invalidos: invalidosComConsumo.map((t) => ({
      task_id: t.task_id, tier: t.tier,
      braco_que_nao_arrancou: t.invalido.braco_que_nao_arrancou,
      motivo: t.invalido.motivo,
      ...consumoDe(t),
    })),
    nao_corridas: naoCorridas.map((t) => t.task_id),
    tentativas_orfas: orfas.map(resumoSolta),
    inicios_orfaos: iniciosOrfaos.map((i) => ({ task_id: i.task_id, braco: i.braco, tentativa: i.tentativa ?? null })),
    tentativas_duplicadas: duplicadas.map(resumoSolta),
    tarefas_excluidas_antes_de_correr: excluidas.map((e) => ({ task_id: e.task_id, motivo: e.motivo, suplente_usado: e.suplente_usado || null })),
    rastos_do_passo_local: marcas.filter((m) => m.tipo === 'rasto_do_passo_local').map((m) => ({ task_id: m.task_id, motivo: m.motivo })),
    eventos_desconhecidos: eventosDesconhecidos,
    estado_vivo_shas_vistos: shasEstadoVivo,
    saidas_a_com_resultado_no_outro_braco: { favorece_A: marcas.filter((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco' && m.sentido === 'favorece A').length, favorece_B: marcas.filter((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco' && m.sentido === 'favorece B').length },
    modelos_locais_vistos: modelosLocais,
    AVISO: 'CUSTO-10: o consumo dos pares invalidos NAO e apagado; esta aqui.',
  };

  const resultado = {
    schema: 'mooter/custo-analysis/1',
    experiment_id: prereg.experiment_id,
    gerado_em: agora || new Date().toISOString(),
    prereg_sha256: prereg.__sha256 || null,
    corrida_fechou_os_pares: fechou,
    corrida_valida: corridaValida,
    corrida_invalida_por: corridaInvalidaPor,
    validade_nd_porque: validadeNdPorque,
    motivo_de_paragem: paragem ? { ts: paragem.ts, motivo: paragem.motivo, ultima_tarefa: paragem.ultima_tarefa || null } : null,
    prefixo_executado: { tarefas_com_alguma_tentativa: porTarefa.filter((t) => t.A.tentativas + t.B.tentativas > 0).length, de: idsEmJogo.length, de_prereg: ordemIds.length },
    primaria,
    secundaria,
    valorizacao,
    velocidade,
    fiabilidade,
    por_tarefa: porTarefa.map((t) => ({
      task_id: t.task_id, tier: t.tier, suplente: t.suplente, ordem_dos_bracos: t.ordem_dos_bracos, ordem_observada: t.ordem_observada, pre_voo_falhou: t.pre_voo_falhou, par_valido: t.par_valido, par_fechado: t.par_fechado,
      A: { tentativas: t.A.tentativas, aceite: t.A.aceite, arrancou: t.A.arrancou, tokens_opus: t.A.tokens ? t.A.tokens.total : null, custo_cli_usd: arred.usd(t.A.custo_cli_usd), custo_cli_total_usd: arred.usd(t.A.custo_cli_total_usd), fontes: t.A.fontes, duration_ms: t.A.duration_ms, tecto_do_orcamento: t.A.tecto, escalou: t.A.escalou, modelos_opus: t.A.modelos_opus },
      B: { tentativas: t.B.tentativas, aceite: t.B.aceite, arrancou: t.B.arrancou, tokens_opus: t.B.tokens ? t.B.tokens.total : null, custo_cli_usd: arred.usd(t.B.custo_cli_usd), custo_cli_total_usd: arred.usd(t.B.custo_cli_total_usd), fontes: t.B.fontes, duration_ms: t.B.duration_ms, tecto_do_orcamento: t.B.tecto, escalou: t.B.escalou, tokens_locais: t.B.tokens_locais, modelo_local: t.B.modelo_local, modelos_opus: t.B.modelos_opus },
    })),
    marcas,
    marcas_por_tipo: Object.fromEntries(Object.entries(marcas.reduce((acc, m) => ({ ...acc, [m.tipo]: (acc[m.tipo] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),   // 95 do 19.o
    linhas_de_ledger_invalidas: null,   // preenchido pelo main
    O_QUE_ISTO_NAO_CONCLUI: prereg.o_que_este_protocolo_NAO_promete,
  };
  return resultado;
}

// ── main ───────────────────────────────────────────────────────────────────

function arg(nome, defeito) {
  const i = process.argv.indexOf(nome);
  if (i < 0) return defeito;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) { console.error(`${nome} sem valor`); process.exit(2); }   // 32: nunca cair no default em silencio
  return v;
}

const invocadoDirectamente = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invocadoDirectamente) {
  // 33: so `--prereg`, `--ledger`, `--out`, cada um com valor separado por espaco; tudo o resto e erro (nunca o default em silencio)
  const permitidos = new Set(['--prereg', '--ledger', '--out']);
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) { if (!permitidos.has(a)) { console.error(`argumento desconhecido: ${a} (aceites: ${[...permitidos].join(', ')}, cada um com valor separado por espaco)`); process.exit(2); } i++; }
    else { console.error(`argumento solto: ${a}`); process.exit(2); }
  }
  const preregPath = path.resolve(arg('--prereg', path.join(HERE, 'custo-prereg.json')));
  const ledgerPath = path.resolve(arg('--ledger', path.join(HERE, 'custo-ledger.jsonl')));
  const outPath = path.resolve(arg('--out', path.join(HERE, 'custo-analysis.json')));
  // 34 (CLI, d4 do 15.o): o --out nunca e uma entrada — sobrescrever o ledger destruia a unica prova da corrida
  // 16.o (5): o alias de caminho (nome curto 8.3, junction, symlink) aponta para o mesmo ficheiro — compara-se o caminho REAL; para um --out que ainda nao existe, o real da pasta + o nome
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { try { return path.join(fs.realpathSync.native(path.dirname(p)), path.basename(p)); } catch { return p; } } };
  const mesmoCaminho = (a, b) => { const x = real(a), y = real(b); return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y; };
  if (mesmoCaminho(outPath, preregPath) || mesmoCaminho(outPath, ledgerPath)) { console.error(`--out ${outPath} e o pre-registo ou o ledger — destruiria a entrada`); process.exit(2); }
  if (!fs.existsSync(preregPath)) { console.error(`falta o pre-registo: ${preregPath}`); process.exit(2); }
  if (!fs.existsSync(ledgerPath)) { console.error(`falta o ledger: ${ledgerPath}\nEsta analise nao inventa dados: sem ledger nao ha resultado.`); process.exit(2); }
  const preregTxt = fs.readFileSync(preregPath, 'utf8');
  let prereg;
  try { prereg = JSON.parse(preregTxt); } catch (e) { console.error(`pre-registo nao e JSON: ${preregPath} (${e.message})`); process.exit(2); }
  if (!prereg || typeof prereg !== 'object' || !prereg.metricas || !prereg.metricas.yardstick_custo || !prereg.corpus || !Array.isArray(prereg.corpus.tarefas)) { console.error(`pre-registo sem a forma esperada (metricas.yardstick_custo, corpus.tarefas): ${preregPath}`); process.exit(2); }
  prereg.__sha256 = crypto.createHash('sha256').update(preregTxt).digest('hex');
  const { eventos, linhasInvalidas } = lerLedger(fs.readFileSync(ledgerPath, 'utf8'));
  const r = analisar(prereg, eventos);
  r.linhas_de_ledger_invalidas = linhasInvalidas;
  fs.writeFileSync(outPath, JSON.stringify(r, null, 2) + '\n');
  const p = r.primaria, f = r.fiabilidade;
  const estado = r.corrida_fechou_os_pares ? 'corrida FECHADA' : `corrida NAO fechou — prefixo ${r.prefixo_executado.tarefas_com_alguma_tentativa}/${r.prefixo_executado.de}`;
  const validade = r.corrida_valida === false ? ` · INVALIDA: ${r.corrida_invalida_por.map((x) => x.motivo).join('; ')}` : r.corrida_valida === null ? ` · validade n/d: ${r.validade_nd_porque.join('; ')}` : '';
  console.log(`custo-analise: ${estado}${validade} · nao corridas ${f.nao_corridas.length}`);
  const veredicto = p.limiar_descritivo_cumprido === null ? `n/d (${p.veredicto_ausente_porque})` : (p.limiar_descritivo_cumprido ? 'cumprido' : 'NAO cumprido') + (p.veredicto_vacuo ? ' (VACUO: ' + p.AVISO_VACUO + ')' : '') + (p.AVISO_N ? ' · ' + p.AVISO_N : '') + (p.AVISO_SUPLENTES ? ' · ' + p.AVISO_SUPLENTES : '');
  console.log(`  pares validos ${p.n_pares_validos} · aceites A ${p.aceites_A} B ${p.aceites_B} · limiar descritivo ${veredicto}`);
  console.log(`  tokens Opus total A ${r.secundaria.global.A.tokens_opus_total ?? 'n/d'} B ${r.secundaria.global.B.tokens_opus_total ?? 'n/d'} · marcas ${r.marcas.length} · invalidos ${f.pares_invalidos.length} (saidas (a) com resultado no outro braco: favorece A ${f.saidas_a_com_resultado_no_outro_braco.favorece_A}, favorece B ${f.saidas_a_com_resultado_no_outro_braco.favorece_B}) · orfas ${f.tentativas_orfas.length} · duplicadas ${f.tentativas_duplicadas.length} · linhas de ledger invalidas ${linhasInvalidas.length} · eventos desconhecidos ${f.eventos_desconhecidos.length}`);
  // 17.o (6): «marcas 20» sem tipo e indistinguivel de «marcas 20 e mais nada» — a contagem por tipo sai na consola
  const porTipo = Object.entries(r.marcas_por_tipo);
  console.log(`  marcas por tipo: ${porTipo.length ? porTipo.map(([k, n]) => `${k} ${n}`).join(' · ') : 'nenhuma'}`);
  console.log(`  escrito: ${outPath}`);
}
