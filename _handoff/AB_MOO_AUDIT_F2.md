# F2 — a corrida: as cinco métricas por braço por sujeito, e o veredicto pré-registado

- **Escrito em:** `2026-09-12T09:51:06Z` (UTC; `date -u`)
- **Revisto em:** `2026-09-12T10:13:15Z` (UTC; `date -u`) — fecho de 6 objecções do adversário (ronda 3): Métrica 2 coluna B, §2/§6 `head_da_raiz`, §7 proveniência de 3,34/2,89, §9 `--json`, linha «total A»; ressalvas em §10 pontos 8-16. Amostragem e veredicto não tocados.
- **Revisto em:** `2026-09-12T10:21:12Z` (UTC; `date -u`) — ronda 4: coluna B da Métrica 2 passa a célula `n/d` com o por-construção na razão (§10.10 do pré-registo, mesmo formato que o custo da Métrica 4); §5 e §6 ponto 10 acertados com isso; avaliação da condição de volume do §7 para B retirada de §3 e registada em §10 ponto 18 como leitura do autor. Amostragem e veredicto não tocados.
- **Revisto em:** `2026-09-12T10:31:28Z` (UTC; `date -u`) — ronda 5: S2 e S3 re-corridos a 12/09 (`2026-09-12T10:22:20Z` a `10:24:30Z`, 3 modos cada, script de `e09a830f`) nos checkouts do sha pré-registado; decisão tomada a 12/09 depois de conhecer os números de 26/08; conjunto `{results, errors, paths}` das corridas `--limpo` byte-idêntico ao de 26/08 nos dois sujeitos; recibos de 26/08 movidos para `_handoff/ab-audit/_anteriores-2026-08-26/` (7 ficheiros por sujeito). Fechou: §2 `head_da_raiz` de S2/S3 (medido nos recibos de 12/09); Métrica 4 parede de S2/S3 (corrida de 12/09 contada, a de 26/08 ao lado); Métrica 5 via (a) de S2/S3 (medida) e forma da célula de S1; §6 ponto 2, ponto 3 e linha «desvios ao procedimento declarados» (re-corrida de S2/S3; C não corrido); §10 ponto 4 (limitação fechada, previsão retirada) e notas de fecho nos pontos 9-13, 15, 16, 19, 21; §9 (`--json` escreve o RESUMO; forma de só leitura); §7 e §6 ponto 10 (onde 3,34 e 2,89 estão escritos); §1 (primeira linha diz 0 rótulos; frase do §7.3 verbatim e sem apêndice; «Fail-closed» citado do §7.3); vocabulário da lista das lentes (0 ocorrências fora de citações). Amostragem e veredicto não tocados.
- **Pré-registo que manda:** `_handoff/AB_MOO_AUDIT_PREREGISTO.md` no branch `ab-audit/preregisto` @ `5b82bb4bb98f5b26ed9030a73040d0a2c353cc5c` — blob sha256 `dc3bcebaa9f275a93a0aa1e17e39ecbd9054d26ee7c4b8f06089ffe27518e5e8` (verificado por `git show origin/ab-audit/preregisto:_handoff/AB_MOO_AUDIT_PREREGISTO.md | sha256sum` nesta escrita)
- **Masterprompt:** `_handoff/MP_AB_MOO_AUDIT_2026-08-26.md` (mesmo branch) — GATE da F2: «as cinco métricas por braço por repositório, com numerador e denominador; concordância entre rotuladores declarada»
- **Este branch:** `ab-audit/f2-braco-a`, HEAD `e09a830fa48c170e7d03f03a1cae54bcf193a434` (`git rev-parse HEAD`; commit datado `2026-09-11T23:03:12-03:00`), PR #505, não fundido. O HEAD citado é o dos artefactos versionados (recibos de S1 de 12/09, recibos de S2/S3 de 26/08, script, MANIFESTO, RESUMO com `gerado_em: 2026-09-12T01:57:11.556Z`); os recibos de S2/S3 de 12/09, o RESUMO regenerado (`gerado_em: 2026-09-12T10:25:11.033Z`), a pasta `_anteriores-2026-08-26/` e este relatório estão por commitar (`git status --short` a 12/09: 15 `M`, 2 `??`) e entram no commit seguinte
- **Decisão do dono (2026-09-12):** publicar o INCONCLUSIVO **sem emendar a amostragem**. Nenhum limiar, nenhuma regra de §3 ou §7 foi tocada.

---

## 1. Veredicto

**FALHA por INCONCLUSIVO nos três sujeitos; a rotulação primária não aconteceu (0 rótulos), e por isso as métricas 1, 3 e 3b são n/d (§6.1).** Com `n_de_avaliacao = 0` em S1, S2 e S3 (`braco-a-RESUMO.json` → `totais.n_de_avaliacao_por_sujeito = {S1:0, S2:0, S3:0}`), o §7.3 declara cada par braço×sujeito INCONCLUSIVO, e o §7.1 (unanimidade nos três sujeitos) converte um sujeito INCONCLUSIVO em FALHA de B.

B não passa o §7: FALHA por INCONCLUSIVO (§7.3 + §7.1). O pré-registo fixa a frase para esse caso (§7.3, «Se B não bater isto»): «o portão não acrescenta valor sobre Semgrep cru, e a tese da cunha cai.» E fixa a regra que converte a ausência de amostra em FALHA (§7.3): «Fail-closed: a ausência de prova nunca conta como prova.» A frase «Se B não bater isto» está no pré-registo desde `dfd07b20` (commit datado `2026-08-26T09:15:10-03:00`); o §7.3 e a regra «Fail-closed» entraram com as Emendas 1 e 2 em `6644c258` (`2026-08-26T09:36:59-03:00`, cabeçalho da Emenda 2: «ainda com zero achados»); a primeira corrida do braço A é de `2026-08-26T19:37:50Z` (`_anteriores-2026-08-26/braco-a-S2.meta.json`).

---

## 2. §3 aplicado a cada sujeito

Fonte de cada linha: `braco-a-RESUMO.json` → `sujeitos[].consequencia_mecanica_do_par_3` (calculado em `tools/cockpit/runner/braco-a-resumo.mjs`, não em prosa). Regra: calibração = `min(40, candidatos)` por classe; classes com < 5 candidatos juntam-se na `cauda` (§3); calibração e avaliação disjuntas (§3.1); amostra vazia depois da calibração ⇒ `n` declarado; `n = 0` ⇒ INCONCLUSIVO (§7.3).

| sujeito | candidatos | baldes (classe: n) | calibração consome | resta | `n_de_avaliacao` | regra do §7.3 que dispara |
|---|---|---|---|---|---|---|
| S1 mooter @ `97ad846b` | 22 | `javascript.lang.security.detect-child-process.detect-child-process`: 18 · `cauda`: 4 (2 `wildcard-postmessage-configuration`, 1 `cors-misconfiguration`, 1 `bypass-tls-verification`) | 22 (18 + 4) | 0 | 0 | «amostra vazia depois da calibração … se `n = 0`, INCONCLUSIVO» |
| S2 fastify @ `1beaf7e7` — sha pré-registado; `head_da_raiz` = `1beaf7e72d24b2fc63a02a7f5806772a00e45454` nos 3 recibos de 12/09 (`braco-a-S2.meta.json`, `.strace.meta.json`, `.semrede.meta.json`; corridos `2026-09-12T10:22:20Z`, `10:22:44Z`, `10:22:56Z`), igual ao sha pré-registado. Nota sobre a corrida de 26/08 (recibos em `_anteriores-2026-08-26/`, script `775fa3b2`, sem campo `head_da_raiz`): o que a sustentava era o reflog do clone (`C:/Users/Paulo Loureiro/ab-audit-subjects/fastify`: uma entrada, `clone` a `2026-08-26T12:09:44Z`, HEAD sem movimento; `git status --short` vazio a 12/09) e a igualdade do sha256 da lista de âmbito (`8eeb3421…`) entre o recibo de 26/08 e o MANIFESTO — evidência de HEAD e de lista de caminhos, não de conteúdo à hora da corrida (`19:37:50Z`); a corrida de 12/09 devolveu o mesmo conjunto `{results, errors, paths}` byte a byte | 2 | `cauda`: 2 (2 `direct-response-write`) | 2 | 0 | 0 | idem |
| S3 hono @ `06880c4a` — sha pré-registado; `head_da_raiz` = `06880c4a2b04de9dd74217f26dd831209b9c01f1` nos 3 recibos de 12/09 (`braco-a-S3.meta.json`, `.strace.meta.json`, `.semrede.meta.json`; corridos `2026-09-12T10:23:23Z`, `10:24:04Z`, `10:24:30Z`), igual ao sha pré-registado. Nota sobre a corrida de 26/08 (recibos em `_anteriores-2026-08-26/`, script `775fa3b2`, sem campo `head_da_raiz`): reflog do clone (`…/ab-audit-subjects/hono`: uma entrada, `clone` a `2026-08-26T12:09:44Z`, HEAD sem movimento; `git status --short` vazio a 12/09) e igualdade do sha256 da lista de âmbito (`0149fc86…`) entre o recibo de 26/08 e o MANIFESTO — evidência de HEAD e de lista de caminhos, não de conteúdo à hora da corrida (`19:38:11Z`); a corrida de 12/09 devolveu o mesmo conjunto `{results, errors, paths}` byte a byte | 4 | `cauda`: 4 (3 `react-insecure-request`, 1 `unknown-value-with-script-tag`) | 4 | 0 | 0 | idem |

Nenhum balde chegou a 40; cada balde foi consumido por inteiro (`calibracao_consome = candidatos` nas três linhas do JSON). O campo `porque` gravado no JSON tem o mesmo texto nos três sujeitos (`consequencia_mecanica_do_par_3.porque`): a calibração do §3 consome todos os candidatos; o §3.1 não deixa reutilizar os que a calibração usou; `n = 0` ⇒ §7.3 INCONCLUSIVO.

---

## 3. As cinco métricas por braço por sujeito

Convenção: cada célula traz `numerador/denominador` ou `n/d` com o porquê. Braço A = Semgrep CE 1.174.0 em WSL2 com os 4 conjuntos de regras vendorizados — `p/javascript`, `p/typescript`, `p/security-audit`, `p/nodejs` (`_handoff/ab-audit/regras-semgrep/MANIFESTO.json`: 292 ids distintos na união; `braco-a-COBERTURA.json`: 89 correm em JS/TS). Braço B = portão 0 sobre os candidatos de A. Braço C = `codex exec` (motor OpenAI). B e C não foram corridos — ver §5.

### Métrica 1 — precisão = `reais ÷ rotulados` (§4.1; rótulo do primário, §6.2)

| sujeito | A | B | C |
|---|---|---|---|
| S1 | n/d — 0 rotulados: `n_de_avaliacao = 0`, nenhuma amostra de avaliação foi gerada, nenhum rótulo primário existe (§6.1) | n/d — braço não corrido (§5) | n/d — braço não corrido (§5) |
| S2 | n/d — idem, `n_de_avaliacao = 0` | n/d — não corrido | n/d — não corrido |
| S3 | n/d — idem, `n_de_avaliacao = 0` | n/d — não corrido | n/d — não corrido |

`nao-sei` publicados à parte (§4.1): 0/0 nos três — não houve rotulação.

### Métrica 2 — volume entregue ao humano, no âmbito completo (§4.2)

| sujeito | A | B | C |
|---|---|---|---|
| S1 | **22** achados em 972 ficheiros do âmbito (`braco-a-RESUMO.json` → `volume_entregue_ao_humano`; `ambito-MANIFESTO.json` → `ficheiros_no_ambito`); 22 distintos após colapso exacto; 6 ficheiros com análise degradada (`PartialParsing`) | n/d — braço não corrido (§5); por construção ∈ {0, 18}: `cauda` (4) fecha por 4 < `REAIS_MINIMO` 10 com qualquer rótulo (`portao.mjs:43`, `71-92`); `detect-child-process` (18) entra sse ≥ 10 reais em 18 (10/18 = 0,56 ≥ `PRECISAO_MINIMA` 0,30), e há 0 rótulos (§6.1) | n/d — não corrido |
| S2 | **2** achados em 54 ficheiros; 0 ficheiros degradados | n/d — braço não corrido (§5); por construção 0: balde único `cauda` n = 2 < `REAIS_MINIMO` 10 (§3; `portao.mjs:43`), fecha com qualquer rótulo (`portao.mjs:71-92`) | n/d — não corrido |
| S3 | **4** achados em 221 ficheiros; 8 ficheiros degradados (2 `Syntax error`, 6 `PartialParsing`) | n/d — braço não corrido (§5); por construção 0: balde único `cauda` n = 4 < `REAIS_MINIMO` 10 (`portao.mjs:43`), fecha com qualquer rótulo (`portao.mjs:71-92`) | n/d — não corrido |

Total do braço A: 28 achados · 1247 ficheiros varridos · 14 erros · 7 classes (`totais` do RESUMO). Integridade do âmbito (`ambito_integro` no RESUMO): lista = varridos nos três (972/972, 54/54, 221/221; `so_na_lista = 0`, `so_nos_varridos = 0`).

Derivação da coluna B sem rótulos: B é um filtro sobre A (§2) e a `cauda` passa pelo mesmo portão (§3); `podeEntrar()` (`portao.mjs:71-92`) devolve `pode: false` quando `reais < REAIS_MINIMO` e, como `reais ≤ lidos ≤ candidatos`, um balde com menos de 10 candidatos fecha com qualquer rotulação. Em S2 (`cauda` n = 2) e S3 (`cauda` n = 4) nenhum balde pode abrir ⇒ `volume_B` seria 0. Em S1 só `detect-child-process` (18) depende de rótulos ⇒ `volume_B` seria ∈ {0, 18}. É dedução sobre o código do portão, não medição: B não correu, por isso a célula é n/d (§10.10 do pré-registo). O §7 não foi avaliado para B (§7.3: `n = 0` ⇒ INCONCLUSIVO; §10 ponto 18).

### Métrica 3 — achados reais por hora de atenção humana = `precisão × 3600 ÷ segundos_por_achado` (§4.3)

| sujeito | A | B | C |
|---|---|---|---|
| S1 | n/d — precisão n/d e `segundos_por_achado` n/d (0 carimbos de abertura/submissão; ferramenta de rotulação nunca correu) | n/d — não corrido | n/d — não corrido |
| S2 | n/d — idem | n/d — não corrido | n/d — não corrido |
| S3 | n/d — idem | n/d — não corrido | n/d — não corrido |

Intervalos > 120 s descartados: 0/0 — não houve intervalos.

### Métrica 3b — horas de atenção para esgotar a fila = `volume × segundos_por_achado ÷ 3600`; reais estimados = `precisão × volume` (§4.3b)

| sujeito | A | B | C |
|---|---|---|---|
| S1 | horas: n/d — `volume = 22` está contado mas `segundos_por_achado` é n/d · reais estimados: n/d — precisão n/d | n/d — não corrido | n/d — não corrido |
| S2 | horas: n/d — `volume = 2`, segundos n/d · reais estimados: n/d | n/d — não corrido | n/d — não corrido |
| S3 | horas: n/d — `volume = 4`, segundos n/d · reais estimados: n/d | n/d — não corrido | n/d — não corrido |

### Métrica 4 — custo em dólares e tempo de parede (§4.4)

| sujeito | A | B | C |
|---|---|---|---|
| S1 | custo: **n/d — não medido** (`custo_em_dolares.medido = false`; «nao e um recibo de custo»); por construção $0: nenhuma chamada a API paga existe no pipeline, corroborado por 0 `connect()` sob `strace` (Métrica 5, via (a)) · parede: **132,546 s** (`braco-a-S1.meta.json` → `parede_s`, modo `--limpo`, corrido em `2026-09-12T01:49:47Z`) | n/d — não corrido | n/d — não corrido; tokens e dólares imputados só existiriam com a corrida |
| S2 | custo: n/d — não medido (`medido = false`); por construção $0: nenhuma chamada a API paga existe no pipeline, corroborado por 0 `connect()` sob `strace` (Métrica 5, via (a)) · parede: **10,844 s** (`braco-a-S2.meta.json` → `parede_s`, modo `--limpo`, corrido em `2026-09-12T10:22:20Z`; corrida contada) · corrida anterior, 26/08: 10,082 s (`_anteriores-2026-08-26/braco-a-S2.meta.json`, `2026-08-26T19:37:50Z`), mesmo conjunto de achados (2 vs 2; `{results, errors, paths}` byte-idêntico) | n/d — não corrido | n/d — não corrido |
| S3 | custo: n/d — não medido (`medido = false`); por construção $0: nenhuma chamada a API paga existe no pipeline, corroborado por 0 `connect()` sob `strace` (Métrica 5, via (a)) · parede: **26,107 s** (`braco-a-S3.meta.json` → `parede_s`, modo `--limpo`, corrido em `2026-09-12T10:23:23Z`; corrida contada) · corrida anterior, 26/08: 20,325 s (`_anteriores-2026-08-26/braco-a-S3.meta.json`, `2026-08-26T19:38:11Z`), mesmo conjunto de achados (4 vs 4; `{results, errors, paths}` byte-idêntico) | n/d — não corrido | n/d — não corrido |

Modo `--limpo` = corrida sem tracer (`tracer: null` no `.meta.json`); é a corrida cujo tempo se reporta. Os tempos das corridas `--strace` (317,020 / 23,344 / 40,350 s) e `--sem-rede` (125,282 / 10,431 / 25,421 s) estão nos `.strace.meta.json` / `.semrede.meta.json` e não são o tempo reportado (`braco-a-semgrep.sh`, cabeçalho, sobre a corrida `--strace`: «O tempo de parede desta corrida nunca e o reportado»). Os de 26/08 para S2/S3 (`--strace` 21,398 / 37,616 s; `--sem-rede` 11,526 / 24,511 s) estão em `_anteriores-2026-08-26/`.

### Métrica 5 — o código saiu da máquina? (§4.5, medido por contagem de `connect()`, §5)

| sujeito | A | B | C |
|---|---|---|---|
| S1 | não — (a) sob `strace -f -qq -e trace=connect,execve` com `--timeout 0` (corrida `--strace`, `braco-a-S1.strace.meta.json`, `2026-09-12T01:55:11Z`): `total_connect = 0`, com a linha `execve` do semgrep no trace (`criterio_5_rede.prova_de_execucao`: pid 832, `/home/paulo/.local/bin/semgrep`; `braco-a-S1.connect.trace`: 125 linhas, 100 `execve(`, 10 com `semgrep` e retorno 0, 0 `connect(`), conjunto de achados igual ao da corrida `--limpo` (22 vs 22, `corrida_sob_strace.achados_identicos = true`); (b) `unshare -rn` (netns sem interface): 22 vs 22 (`controlo_sem_rede.achados_identicos = true`) | n/d — não corrido | n/d — não corrido; sai por construção (§5) |
| S2 | não — (a) sob `strace -f -qq -e trace=connect,execve` com `--timeout 0` (corrida `--strace` de 12/09, `braco-a-S2.strace.meta.json`, `2026-09-12T10:22:44Z`): `total_connect = 0`, com a linha `execve` do semgrep no trace (`prova_de_execucao`: pid 806, `/home/paulo/.local/bin/semgrep`; `braco-a-S2.connect.trace`: 125 linhas, 100 `execve(`, 10 com `semgrep` e retorno 0, 0 `connect(`), conjunto de achados igual ao da corrida `--limpo` (2 vs 2, `achados_identicos = true`); (b) `unshare -rn` (`2026-09-12T10:22:56Z`): 2 vs 2 (`controlo_sem_rede.achados_identicos = true`; essa corrida registou 1 erro `Timeout` em `lib/reply.js`, regra `express-open-redirect`, que a corrida `--limpo` não teve — `controlo_sem_rede.erros = 1`; o conjunto de achados não mudou). Trace de 26/08 (`_anteriores-2026-08-26/braco-a-S2.connect.trace`, script `775fa3b2` com `-e trace=connect`): 25 linhas, 0 `execve(`, 0 `connect(` — sem produtor observado, não contava como medição | n/d — não corrido | n/d — não corrido |
| S3 | não — (a) sob `strace -f -qq -e trace=connect,execve` com `--timeout 0` (corrida `--strace` de 12/09, `braco-a-S3.strace.meta.json`, `2026-09-12T10:24:04Z`): `total_connect = 0`, com a linha `execve` do semgrep no trace (`prova_de_execucao`: pid 1406, `/home/paulo/.local/bin/semgrep`; `braco-a-S3.connect.trace`: 125 linhas, 100 `execve(`, 10 com `semgrep` e retorno 0, 0 `connect(`), conjunto de achados igual ao da corrida `--limpo` (4 vs 4, `achados_identicos = true`; 8 erros em cada um dos três modos); (b) `unshare -rn` (`2026-09-12T10:24:30Z`): 4 vs 4 (`controlo_sem_rede.achados_identicos = true`). Trace de 26/08 (`_anteriores-2026-08-26/braco-a-S3.connect.trace`): 25 linhas, 0 `execve(`, 0 `connect(` — sem produtor observado, não contava como medição | n/d — não corrido | n/d — não corrido |

Alcance do instrumento: `strace -e trace=connect,execve` conta chamadas `connect()`; não vê `sendto()` em UDP sobre socket não ligado. O «não» desta métrica é o que as duas vias medem — 0 `connect()` com o semgrep observado no trace, e conjunto de achados igual em netns sem interface — e não mais do que isso.

> Nota (§7.2): as métricas 3 e 3b são reportadas e **não decidem**. O único critério de passa/falha é o §7. Nesta corrida, também não teriam o que reportar.

---

## 4. Concordância entre rotuladores

**n/d — 0 rótulos.** Acordo (proporção de pares iguais, o «acordo simples» do §6) e Cohen's κ exigem duas séries de rótulos sobre a mesma amostra; não existe amostra de avaliação (`n_de_avaliacao = 0` nos três sujeitos), logo a ferramenta de rotulação não correu, o rotulador primário (o dono) não rotulou nada, e o rotulador secundário (motor diferente) não foi convocado. Rótulos primários: 0. Rótulos secundários: 0. Taxa de abstenção (§6.4): n/d — sem denominador.

A dependência humana do §6.1 não foi contornada: ninguém rotulou no lugar do dono e nenhum rótulo de agente é apresentado como sendo dele.

---

## 5. O que não foi corrido e porquê

**Braço B (portão 0 sobre os candidatos de A) — não corrido.** `podeEntrar()` em `tools/cockpit/runner/portao.mjs` decide por `REAIS_MINIMO: 10` e `PRECISAO_MINIMA: 0.30` (linhas 43-44), e os dois precisam de contagens de `real`/`falso` numa amostra de calibração rotulada. Há 0 rótulos. Sem entrada rotulada o portão não tem o que filtrar. O volume de B é n/d nos três; em S2 e S3 o valor por construção é 0 (balde único `cauda` com 2 e 4 candidatos, abaixo de `REAIS_MINIMO` 10; Métrica 2), em S1 é n/d ∈ {0, 18} por rotulação não feita — precisa de 18 rótulos de calibração que não existem (§6.1). A precisão de B é n/d nos três (Métrica 1).

**Braço C (`codex exec`, motor OpenAI) — não corrido.** Com `n = 0` em A/B, a comparação pré-registada (§7: precisão de B ≥ 2× a de A, volume ≤ 1/5) não se faz. Correr C enviaria o código dos três sujeitos para fora da máquina (§5, «C sai da máquina por construção») para produzir um volume sem contraparte medida em A/B (`n = 0`). Fica n/d com este porquê. A decisão de não correr C foi tomada a 12/09, depois de saber `n_A = 0`; o pré-registo não a prevê (§3.3 trata `total_C ≤ k` sem cancelar C) — é um desvio ao §2, registado na linha «desvios ao procedimento declarados» de §6. Correr C é uma opção do dono, não parte desta publicação.

---

## 6. O que invalidaria isto (§10) e o que aconteceu

| # | ponto do §10 | o que aconteceu |
|---|---|---|
| 1 | mexer nos limiares de §3 ou §7 depois do primeiro achado | **não aconteceu.** `portao.mjs:43-44` mantém `REAIS_MINIMO: 10` / `PRECISAO_MINIMA: 0.30`; o blob do pré-registo tem o sha256 do cabeçalho; a decisão do dono foi publicar sem emendar |
| 2 | trocar os shas dos sujeitos de §1 | **aconteceu em S1 e foi invalidado e substituído.** A corrida de `2026-08-26T19:40:11Z` varreu a worktree `frugal-ab-audit` em `2d5fd762` (974 ficheiros, lista sha256 `4b8c0e5f…`). Registo: `braco-a-RESUMO.json` → `corridas_invalidadas[0]` (`conta: false`), `ambito-MANIFESTO.json` → `substituidos[0]` (`no_sha_preregistado: false`). Os 7 artefactos ficaram com o prefixo `braco-a-S1.INVALIDO-2d5fd762.{json,meta.json,connect.trace,strace.json,strace.meta.json,semrede.json,semrede.meta.json}`. A corrida que conta correu em `2026-09-12T01:49:47Z` sobre `C:/Users/Paulo Loureiro/ab-audit-subjects/mooter` @ `97ad846b` (972 ficheiros, lista sha256 `d1fe247d…`). **S2 e S3: não aconteceu.** `head_da_raiz` nos recibos de 12/09 = sha pré-registado (`1beaf7e72d24…` e `06880c4a2b04…`, nos 3 `.meta.json` de cada sujeito); os recibos de 26/08 (script `775fa3b2`, hoje em `_anteriores-2026-08-26/`) não gravavam `head_da_raiz` (0 ocorrências em `git show 775fa3b2:tools/cockpit/runner/braco-a-semgrep.sh`) — para essa corrida o que existia era o reflog dos dois clones (uma entrada, `clone` a `2026-08-26T12:09:44Z` em `1beaf7e7` / `06880c4a`, HEAD sem movimento; `git status --short` vazio a 12/09) e a igualdade do sha256 da lista de âmbito (`8eeb3421…`, `0149fc86…`), que prova a mesma lista de caminhos, não o mesmo conteúdo; a corrida de 12/09 devolveu o mesmo conjunto `{results, errors, paths}` byte a byte nos dois sujeitos |
| 3 | mudar o conjunto de regras de §2.1 ou o prompt de §2.3 | **não aconteceu.** Os 4 sha256 dos conjuntos de regras são os mesmos nos 9 `*.meta.json` que contam e nos 6 de `_anteriores-2026-08-26/` (`e65e8449…`, `63fbcca1…`, `b109a039…`, `eed00ab9…`); o prompt de C não foi usado porque C não correu |
| 4 | avaliar B em achados que serviram para o calibrar | **não aconteceu.** B não foi avaliado; `resta_para_avaliacao = 0` |
| 5 | rotular com o braço à vista | **não aconteceu.** 0 rótulos |
| 6 | publicar custo imputado de C como faturado | **não aconteceu.** C não correu; o `$0` de A é rotulado «por construção, não recibo» no JSON e aqui |
| 7 | trocar o rotulador que produz a precisão, ou excluir discordâncias | **não aconteceu.** 0 rótulos, 0 rotuladores |
| 8 | agregar por regra que não seja unanimidade, ou promover a métrica 3 a critério | **não aconteceu.** Três INCONCLUSIVO ⇒ FALHA por §7.1; a métrica 3 é n/d e fica reportada como n/d |
| 9 | avaliar C sem o saque cego equivalente | **não aconteceu.** C não correu |
| 10 | apresentar número não medido | **não aconteceu neste ficheiro.** Todos os n/d trazem o porquê (§3, §4, §5, §7 deste ficheiro). Os números por construção do ficheiro são o `$0` de custo (Métrica 4, três sujeitos) e o 0 de volume de B em S2/S3 (Métrica 2); todos em células n/d com a razão, não como medição: a célula de custo é n/d (`custo_em_dolares.medido = false`) e a de volume de B é n/d (braço não corrido, §5; o RESUMO não tem campo de B). Dois valores do índice do arnês (3,34 e 2,89) estão escritos no `SYNC.md` do branch `ab-audit/preregisto` (linha 63, tabela do bloco de 2026-09-11) e no vault (`10-projects/2026-09-11-ab-moo-audit-retoma-….md:26`; `40-strategy/pitch-deck-mooter/INBOX.md:270`), sem instantâneo do índice que os contenha; o instantâneo de 26/08 diz 3,20, não 3,34; ficam n/d como medição em §7 |
| — | desvios ao procedimento declarados (fora da numeração do §10; o pré-registo não tem ponto para eles) | (i) **S2 e S3 re-corridos a 12/09** (`2026-09-12T10:22:20Z` a `10:24:30Z`; 3 modos cada; script de `e09a830f`; raízes `ab-audit-subjects/fastify` @ `1beaf7e7` e `ab-audit-subjects/hono` @ `06880c4a`). A decisão foi tomada a 12/09 **depois de conhecer os números de 26/08** (2 e 4 achados; 10,082 s e 20,325 s). Motivo: o §10.2 tinha sido aplicado a S1 (corrida de 26/08 invalidada e repetida a 12/09 com recibo que grava `head_da_raiz` e trace com `execve`) e não a S2/S3 (recibos sem `head_da_raiz`; trace só de `connect`). Resultado: `head_da_raiz` = sha pré-registado nos 6 recibos; conjunto `{results, errors, paths}` byte-idêntico ao de 26/08 em `braco-a-S2.json`, `braco-a-S2.strace.json` e nos três `.json` de S3; em `braco-a-S2.semrede.json`, `results` e `paths` iguais e `errors` com 1 `Timeout` (`lib/reply.js`) que o de 26/08 não tinha (Métrica 5). Os recibos de 26/08 ficam em `_handoff/ab-audit/_anteriores-2026-08-26/` (7 ficheiros por sujeito). (ii) **Braço C não corrido**: decisão de 12/09, tomada depois de saber `n_A = 0`; razão em §5. O pré-registo não dispensa C (§3.3 prevê `total_C ≤ k` sem o cancelar) — é um desvio ao §2, não um ponto do §10 |

---

## 7. Percurso do utilizador (§8) e índice do arnês

**Percurso §8 (agente em motor diferente: instalar → apontar a S2/S3 → relatório, cronometrado):** não foi executado como protocolo. «Minutos até ao primeiro relatório útil» (§8): n/d — não há cronómetro. Nº de bloqueios: n/d — não contados. O que existe é a medição registada em PR #506 (`fix/fan-out-zero-fontes`, aberto, HEAD `03b8f7ed`, não fundido): a `2026-08-26` e outra vez a `2026-09-11` contra `origin/main` `a346230c`, `mooter audit fan-out` apontado a `fastify` e a `hono` leu 0 fontes nos 6 facets, chamou o worker Ollama na mesma, e o worker produziu achados que citavam ficheiros inexistentes nesses repositórios, com `exit 0` e relatório escrito (15,5 s). Com a correcção do PR #506: worker não chamado a 0 fontes, `exit 1`, 1,4 s. Cada sítio onde o agente teve de adivinhar: n/d — não registado por protocolo.

**Índice do arnês (F0.2, `tools/cockpit/runner/indice-do-harness.mjs`):**

| momento | valor | fonte |
|---|---|---|
| 2026-08-26 @ `97ad846b` | **3,20/10** (`pontos: 3.2`, `peso_nao_medido: 0`) | `~/.mooter/indice-do-harness.json` (`ts: 2026-08-26T13:18:46.470Z`); título do PR #413 |
| 2026-09-11 (HEAD `6c9abe4d` do #413, fundido com `a346230c`) | **3,04/10** com rede · 2,60 sem rede (4,0 pontos por medir) | corpo do PR #413, secção datada de 2026-09-11; comentário de fecho do adversário (`2026-09-12T02:50:59Z`) |
| valores intermédios «3,34» e «2,89 ao retomar» e a ancoragem a `d12908c0` | n/d como medição | estão escritos no `SYNC.md` do branch `ab-audit/preregisto` (linha 63, tabela do bloco de 2026-09-11: «**3,04/10** @ d12908c0 (2,89 ao retomar; 3,34 a 26/08)») e no vault (`10-projects/2026-09-11-ab-moo-audit-retoma-….md:26`; `40-strategy/pitch-deck-mooter/INBOX.md:270`, etiquetado `[measured]`) — sem instantâneo do índice que os contenha; o instantâneo de 26/08 (`~/.mooter/indice-do-harness.json`, `ts: 2026-08-26T13:18:46.470Z`) diz `pontos: 3.2`, não 3,34, e não tem campo de sha; o PR #413 diz 3,20 no título e 3,04 @ `6c9abe4d` no corpo; nenhum instantâneo cita `d12908c0` (o commit existe: merge em `ab-audit/f0-3-teste-fora-do-ci`) |

---

## 8. O que este resultado permite dizer, e o que não permite

Permite dizer que o braço A, tal como pré-registado (Semgrep 1.174.0, 4 conjuntos vendorizados, 89 regras em JS/TS), produz 22, 2 e 4 candidatos em S1, S2 e S3 — e que com esses volumes a regra de amostragem do §3 (`min(40, candidatos)` por balde, avaliação disjunta da calibração) consome tudo e deixa `n = 0`. Permite dizer que a varredura de A não precisou de rede em nenhum dos três (via (b), netns sem interface, conjuntos de achados iguais) e que nos três a corrida sob `strace` teve 0 `connect()` com a linha `execve` do semgrep no trace (via (a); S1 a 12/09 01:55Z, S2/S3 a 12/09 10:22Z-10:24Z). Não permite dizer nada sobre a precisão de A, de B ou de C, nem sobre a hipótese do §7; sobre a tese da cunha, o que se escreve é o que o §7.3 fixa para um não-passe, e está em §1. Uma via para um resultado que não seja INCONCLUSIVO existe — outra corrida com a amostragem emendada antes de correr, ou sujeitos com mais candidatos por balde — mas é outro pré-registo, com adversário, não uma emenda deste.

---

## 9. Reproduzir

Pré-requisitos: Windows com WSL2 (Ubuntu-22.04) e `semgrep` 1.174.0 dentro do WSL (§9 do pré-registo); os três sujeitos clonados em `C:/Users/Paulo Loureiro/ab-audit-subjects/{mooter,fastify,hono}` nos shas do §1.

```sh
# âmbito e regras (não escrevem nada; comparam com o versionado)
node tools/cockpit/runner/ambito-ab.mjs --verificar
node tools/cockpit/runner/ab-vendorizado.mjs

# braço A — uma corrida por sujeito e por modo (via WSL; --limpo = sem tracer, é o tempo reportado)
bash tools/cockpit/runner/braco-a-semgrep.sh S1 --limpo
bash tools/cockpit/runner/braco-a-semgrep.sh S1 --strace      # strace -f -qq -e trace=connect,execve, --timeout 0
bash tools/cockpit/runner/braco-a-semgrep.sh S1 --sem-rede    # unshare -rn
# idem para S2 e S3 (foi o que se correu a 12/09, 10:22Z-10:24Z). O script ESCREVE em $HOME/ab-braco-a/ dentro do WSL
# (--limpo: .json + .meta.json; --strace: .strace.json + .strace.meta.json + .connect.trace; --sem-rede: .semrede.json + .semrede.meta.json;
# mais um .stderr por modo); os 7 artefactos por sujeito são depois copiados para _handoff/ab-audit/ e versionados.

# resumo (recalcula consequencia_mecanica_do_par_3, criterio_5, ambito_integro)
# verificação, só leitura — imprime e não escreve nada:
node tools/cockpit/runner/braco-a-resumo.mjs _handoff/ab-audit
# com `--json` ESCREVE _handoff/ab-audit/braco-a-RESUMO.json (braco-a-resumo.mjs:379-382); é assim que o artefacto versionado é regenerado:
node tools/cockpit/runner/braco-a-resumo.mjs _handoff/ab-audit --json
# Se os recibos não mudaram, só `gerado_em` muda (verificado a 12/09 entre 01:57:11Z e 10:05:33Z, resto byte a byte igual);
# a regeneração de 2026-09-12T10:25:11.033Z trouxe os recibos de S2/S3 de 12/09 (git diff --stat: 41 inserções, 17 remoções).
# Para verificar sem tocar no artefacto: correr sem `--json`; se correu com `--json` por engano: git checkout -- _handoff/ab-audit/braco-a-RESUMO.json

# testes
node --test tools/cockpit/runner/braco-a-resumo.test.mjs tools/cockpit/runner/braco-a-adversario.test.mjs tools/cockpit/runner/ambito-ab.test.mjs tools/cockpit/runner/ab-vendorizado.test.mjs
```

Resultado dos testes registado no PR #505: 59/60 (1 skip: symlink sem permissão); re-corridos nesta revisão sobre os recibos de 12/09: `tests 60 · pass 59 · fail 0 · skipped 1`; `ambito-ab.mjs --verificar`: OK nos três sujeitos; `ab-vendorizado.mjs`: OK (4 ficheiros de regras e 3 listas de âmbito batem byte a byte). O adversário (codex, ronda 2) contou 49 testes, 48 pass, 0 fail, 1 skip no comando que lhe foi pedido. `classify.js`: `sha256sum tools/router/classify.js` = `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`, o valor do cabeçalho de `CLAUDE.md`.

---

## 10. Limitações assumidas (§12) que este resultado herda

Do pré-registo, §12:

1. A e B só podem entregar o que o Semgrep encontrou; C procura livremente — os ficheiros são os mesmos, o universo de oportunidades não é (adversário codex, 1.ª e 2.ª passagens; §2.4).
2. B recebe um orçamento de calibração que C não recebe (adversário codex, 2.ª passagem; §3.3 iguala tamanho, não afinação).
3. A rotulação primária depende de uma pessoa e não pode ser substituída por um agente (§6.1) — nesta corrida, é a razão de as métricas 1, 3 e 3b serem n/d e não um contorno.

Do adversário codex nas rondas 1-2 do PR #505 (comentários de `2026-09-12T01:26:27Z` e `2026-09-12T02:11:53Z`, fecho `2026-09-12T02:13:32Z`):

4. Levantado nas rondas 1-2: S2 e S3 sem linha `execve` do semgrep no trace da via (a) do critério 5 (traces de 26/08: 25 linhas, 0 `execve(`, 0 `connect(` em cada um; o script `775fa3b2` traçava `-e trace=connect` só), e recibos de 26/08 sem `head_da_raiz` — o §10.2 tinha sido aplicado a S1 (corrida de 26/08 invalidada e repetida a 12/09) e não a S2/S3. **Fechado a 12/09 pela re-corrida** (linha «desvios ao procedimento declarados» de §6): traces de 12/09 com 125 linhas, 100 `execve(`, 10 com `semgrep` e retorno 0, 0 `connect(`; `head_da_raiz` = sha pré-registado nos 6 recibos; conjunto de achados igual (2 vs 2, 4 vs 4). O comentário de fecho do adversário dizia «≈1 min», sem «por sujeito»; os tempos `--strace` de 26/08 (21,398 s e 37,616 s) somam ≈59 s e os de 12/09 (23,344 s e 40,350 s) somam ≈64 s.
5. `$0` é por construção, não recibo: «contar `connect()` não mede dólares» (ronda 1); os recibos não contêm medição de custo.
6. A coincidência dos 22 achados entre a corrida invalidada (`2d5fd762`, 974 ficheiros) e a que conta (`97ad846b`, 972) «demonstra consistência dos artefactos; não equivale a observar novamente a execução» (ronda 2, ataque (b)).
7. «89 consta dos recibos; reprodução da execução: n/d» (ronda 1) — o número de regras que correram é lido do recibo do semgrep, não reexecutado pelo adversário.

Do adversário na ronda 3 (2026-09-12, sobre esta versão; ressalvas sem efeito em número ou veredicto, registadas com o texto de quem as levantou, §12):

8. O GATE da F2 (cabeçalho) é citado e não é declarado passado. Não passou: as métricas 1, 3 e 3b são n/d nos três sujeitos e a concordância é n/d (§4).
9. Não correr C é um desvio ao procedimento do §2 decidido a 12/09, com a razão em §5 (privacidade; sem contraparte medida em A/B); o pré-registo não tem cláusula que dispense C quando `n_A = 0` — o §3.3 prevê o caso `total_C ≤ k` sem cancelar C. O §10 não tem ponto para este desvio. Os `k` do §3.3 (achados consumidos pela calibração: 22, 2, 4) não são publicados como `k` porque C não correu. — Ronda 5: a tabela de §6 regista-o na linha «desvios ao procedimento declarados», fora da numeração do §10.
10. §6.1 do pré-registo pede que a ausência de rotulação primária seja dita «na primeira linha». O título e §1 dizem `n = 0`; que existem 0 rótulos e que por isso as métricas 1, 3 e 3b são n/d só aparece na Métrica 1 e em §4. — Fechado na ronda 5: a primeira linha de §1 di-lo.
11. Existem 12 ficheiros `*.meta.json` em `_handoff/ab-audit/` (9 válidos + 3 `INVALIDO-2d5fd762`); os 12 têm os mesmos 4 sha256 de regras. O «9» de §6 ponto 3 conta os válidos. — Ronda 5: mais 6 em `_handoff/ab-audit/_anteriores-2026-08-26/` (S2/S3 de 26/08), com os mesmos 4 sha256; os 9 válidos passam a ser S1 de 12/09 e S2/S3 de 12/09.
12. A célula «não» da Métrica 5 em S1 refere-se à corrida `--strace`; o tempo de parede da Métrica 4 é o da corrida `--limpo`. São duas corridas (desenho do script), com o mesmo conjunto de achados (22 vs 22). — Ronda 5: o mesmo vale para S2 e S3 (2 vs 2, 4 vs 4, corridas de 12/09).
13. Em S2/S3 (Métrica 4) o «corroborado só por netns sem interface» afirma mais do que a via (b) mede: a via (b) prova que a varredura não precisou de rede, não que não saiu; é compatível com «nenhuma chamada a API paga», não a corrobora. Em S1 a via (a) está por trás da palavra. — Fechado na ronda 5: S2/S3 têm a via (a) medida a 12/09 e a frase «só por netns» saiu da Métrica 4.
14. As citações §4.1, §4.2, §4.3, §4.3b e §4.5 nas Métricas 1-5 não são títulos do pré-registo (o §4 tem um único subtítulo, §4.4, que é a nota sobre o custo imputado de C); as definições das cinco métricas estão no corpo do §4.
15. O apêndice à frase do §7.3 em §1 («nesta corrida tal como pré-registada, por `n = 0`») e o ponto 17 abaixo são leitura do autor; o §7.3 não admite «quase». O veredicto é a frase de §1 sem apêndice. A frase «B não bateu o §7» em §1 afirma um resultado de teste que não existe: B não correu; o que está medido é que a condição não pôde ser avaliada e o §7.3 converte isso em FALHA. — Fechado na ronda 5: apêndice retirado de §1; a frase passou a «B não passa o §7: FALHA por INCONCLUSIVO (§7.3 + §7.1)»; o ponto 17 fica como leitura do autor, fora do veredicto.
16. Proveniência: este ficheiro está por commitar (`?? _handoff/AB_MOO_AUDIT_F2.md`); o HEAD `e09a830f` do cabeçalho é o dos artefactos, não o deste relatório. O carimbo «Escrito em» é o da primeira versão; o ficheiro foi editado depois (mtime `2026-09-12T10:03:02Z`) e nesta revisão (ver «Revisto em» no cabeçalho). — Ronda 5: continua por commitar, e com ele os recibos de S2/S3 de 12/09, o RESUMO regenerado e `_anteriores-2026-08-26/` (`git status --short`: 15 `M`, 2 `??`); entram no commit seguinte, e o HEAD do cabeçalho passa a ser anterior a todos eles.

Do autor deste relatório (interpretação; não faz parte do veredicto nem do texto que o §7.3 fixa):

17. A FALHA de §1 resulta de `n = 0` (§7.3 → §7.1), não de uma precisão de B medida abaixo da de A. O pré-registo não distingue os dois casos e este relatório não os distingue no veredicto; a distinção fica aqui, como leitura do autor, e não altera o que §1 diz.
18. Retirado de §3 na ronda 4: com o volume por construção de B (0 em S2/S3, Métrica 2), a condição de volume do §7 (`≤ 1/5`) ficaria `0 ≤ 2/5` em S2 e `0 ≤ 4/5` em S3. Não é uma avaliação do §7: B não correu, o §7.3 fixa INCONCLUSIVO por `n = 0` e não prevê continuar a avaliar as condições restantes («não há sub-análise inventada depois para salvar o resultado»). Fica aqui, fora do §7, sem efeito no veredicto.
19. Ronda 4 (adversário): a Métrica 5 em S1 é «não» pela corrida `--strace` (317,020 s, `braco-a-S1.strace.meta.json`) e o tempo de parede da Métrica 4 vem da corrida `--limpo`, que não teve tracer (`tracer: null` no meta); a corrida cujo tempo se reporta não foi observada. A ponte entre as duas é o conjunto de achados idêntico (22 vs 22, `corrida_sob_strace.achados_identicos = true`). Desenho do script (ponto 12); a célula da Métrica 5 não diz de que corrida vem. — Fechado na ronda 5: cada célula da Métrica 5 cita o `.strace.meta.json` e o `corrido_em` da corrida traçada, e a Métrica 4 glosa o modo `--limpo`.
20. Ronda 4 (adversário): o «3,20/10 @ `97ad846b`» de §7 está ancorado ao sha só pelo corpo do PR #413 («O 3,20 abaixo é de 26/08 @ 97ad846b»); o instantâneo (`ts: 2026-08-26T13:18:46.470Z`, chaves `ts, pontos, total, pct, peso_nao_medido, nao_medidas, parcelas`) não tem campo de sha e o título do PR #413 não cita sha. E «HEAD `6c9abe4d` do #413» é o HEAD da secção datada de 2026-09-11 no corpo do PR, não o HEAD do PR a 12/09 (`0e13561b`, `gh pr view 413`, ainda OPEN).
21. Ronda 4 (adversário): a frase de §10 ponto 4 sobre repetir `--strace`/`--limpo` em S2/S3 («regeneraria … fecharia as duas células») é uma previsão sobre uma corrida não feita; os baldes só ficam iguais se a repetição reproduzir 2 e 4 candidatos, o que não está medido. — Medido na ronda 5 (12/09): a repetição reproduziu 2 e 4 candidatos, com `{results, errors, paths}` das corridas `--limpo` byte-idêntico ao de 26/08; a frase de previsão saiu do ponto 4, e a decisão de repetir foi tomada depois de conhecer os números de 26/08 (§6, «desvios»).
