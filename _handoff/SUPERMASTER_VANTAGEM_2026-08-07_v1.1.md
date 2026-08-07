# SUPERMASTER — WAVE "VANTAGEM" v1.1 (pós-G4)

**Data:** 2026-08-07 · **Executor:** CC orquestrando a frota Mooter NO TALO
**Estado:** 🟡 aguarda o `resultado.md` do piloto · **G4 FEITO** (Bloco A fechado)
**Supersede:** `SUPERMASTER_VANTAGEM_2026-08-07_v1.md` (não apagar — é o alvo do G4)

**G4 em motor diferente:** codex, read-only, `job-msiyxad6-7dd2`, 448 s, 3,92 M tokens lidos →
**12 achados, 8 de severidade ALTA**, todos incorporados abaixo. Cada mudança traz `[G4 #n]`.
Onde o brief v1 mandava construir, o código já tinha — e isso mudou o âmbito do Bloco C.

## REGRA 0 — o piloto manda

NADA dos blocos C-E corre antes de o `resultado.md` do piloto existir (T1 → julgamento → mapa →
resultado). Se a T1 estiver a correr, zero dispatches concorrentes pela GPU/quota.

**[G4 #11] Excepção acrescentada:** o **B.1** (push de commits já feitos) sai da Regra 0. Esperar
não protege o piloto nem poupa GPU/quota — só adia uma operação independente. Corre com
aprovação explícita do Paulo e com os SHAs exactos à vista, como qualquer push.

## Regras invioláveis

`classify.js` intocado (sha `427d8c0b…48f`) · commits selectivos · push só com payload explícito ·
teste vermelho antes de cada fix · campo ausente = `null` nunca zero · **accuracy nunca sem
baseline + recall da classe minoritária** (VERIFICADOR-0) · Mooter no talo (`wave:"vantagem"`,
codex p/ código, moo p/ verificação mecânica a $0, `pre_digest:false` até P1-D#2 fechar).

**[G4 #12] Acrescentada:** **escritor único do vault.** `paulo-vault/00-core/mooter-constituicao.md:20,26`
proíbe Solistas de escrever na árvore do vault. Nada nesta wave escreve lá directamente.

---

## Bloco A — G4 ✅ FEITO

Fechado. 12 achados incorporados. O v1 fica em disco como alvo auditável.

### Caso de estudo: as duas verdades do `mooter-v1490.mcpb`

Vale registar porque é exactamente a classe de defeito que esta wave persegue.

| | O que disse | Como chegou lá |
|---|---|---|
| **codex (G4 #8)** | "o bundle existe e **está na versão correcta**" | leu `packages/mooter-bridge/manifest.json:5` → `1.49.0` |
| **CC** | "o bundle tem **duas verdades**" | **abriu o zip**: `manifest.version` = `1.49.0`, `server/version.json` = `1.48.1` |

**Ambos estão certos, e nenhum está completo.** O manifesto declara 1.49.0 — verdade. O zip
carrega dois números diferentes sobre a mesma versão — também verdade. A diferença não é de
rigor: é de **superfície inspeccionada**. Quem lê o manifesto vê o que a instalação *diz*; quem
abre o zip vê o que lá *está*. É o mesmo princípio do P0-C ("nunca um manifest") aplicado a um
artefacto diferente.

Causa: o commit `874364d2` subiu `packages/mooter-bridge/manifest.json` para 1.49.0 e não
`tools/router/version.json`, que ficou em 1.48.1 — e o packer mete os dois no zip
(`pack-mcpb.mjs`, `../../tools/router/version.json` → `server/version.json`).

**Regra que fica:** afirmações sobre um artefacto empacotado exigem o artefacto aberto. Um
`manifest.json` no repo não é prova sobre o zip. E o G4 do codex também acrescentou razão
independente para não empacotar já: **o bridge tem 3 ficheiros tracked modificados sem commit**
— árvore suja nunca é empacotada.

---

## Bloco B — CASA EM ORDEM

1. **Push** dos locais pendentes com payload explícito (`ed95c383` .gitignore · `3ebbb692`
   pré-registo · `5ae49188` veredicto + o que a tarde produzir). **[G4 #11]** fora da Regra 0.

2. **[G4 #9] Auditoria de worktrees — a premissa do v1 era falsa.**
   O v1 dizia "~50 marcadas prunable". Medido: **53 entradas, ZERO marcadas prunable, 21 dirty**,
   uma locked/missing. Limpar pelo total teria destruído trabalho.
   **Inventário dinâmico por estado**, nunca contagem fixa: `clean` · `dirty` · `locked` ·
   `missing` · `realmente prunable`. Relatório ANTES de tocar, com branch, merged-em-main?,
   uncommitted? e idade por worktree. Prune só das **merged E clean**. Branches nunca se apagam.
   As 21 dirty vão para decisão do Paulo, uma a uma.

3. **[G4 #8 + CC] `mooter-v1490.mcpb` NÃO se aplica como está.**
   Sequência obrigatória: subir `tools/router/version.json` a **1.49.0** → **árvore limpa**
   (commitar ou stashar os 3 ficheiros do bridge) → worktree limpa no sha → **re-empacotar** →
   **prova byte-a-byte zip vs worktree** (`prova-mcpb`, md5 + sha256) → gate humano do restart →
   smoke test P0-B em runtime (os 9 campos no ledger).
   **Critério de rebuild corrigido:** decide-se por **comparação de bytes e árvore limpa**, não
   por "há commits novos?". Uma árvore suja diverge do bundle sem existir um único commit.

---

## Bloco C — CASCATA-APRENDE · **ÂMBITO MUDADO: integrar, não construir**

O v1 mandava construir um gate mecânico, um learner e um estado novos. **Os três já existem.**
O G4 apanhou-o (achados #1, #2, #3) e o G5 proíbe reexecutar o que já está feito.

1. **[G4 #2] O gate mecânico já existe: é o Oráculo.**
   `packages/mooter-bridge/oraculo.js:1-33,62-90,175-259` faz verificação determinística;
   `seamless.js:2177-2180,2332-2358` já mede antes/depois e regista qualidade.
   **C.1 passa a ser:** ligar o Oráculo a **retry/escalada** e cobrir as tarefas **sem escrita**
   (hoje descobertas). Nada de gate novo.
   **LLM-juiz continua fora do gate** — medido: um dos dois modelos colapsou em constante
   (297/297 "S") e o outro em ruído (19,2% de consistência). Só entra em desempate depois de
   aferição por domínio provar recall > baseline.

2. **[G4 #1] A cascata tem DOIS pontos, não um.**
   O v1 punha-a "por cima da classificação". O código diz outra coisa: `inject_context.js:670-1180`
   só opera **antes** da geração, e o `classified` é registado em `:974-1022` **antes** das
   mutações finais de tier; no bridge a decisão inicial é `seamless.js:3010-3012` mas o resultado
   mecânico só existe **depois** do Oráculo (`:2332-2358`).
   **Separar:** *política pré-dispatch* após o safety floor (`:1180` e `:3010`) · *escalada
   pós-Oráculo* depois de `:2358`, com recibo do **tier efectivo**. `classify.js` intocado.

3. **[G4 #4] `escalated` nasce como sideband NÃO-STATE.**
   Não há enum de eventos (`seamless.js:231-288` aceita arbitrários) e `lastStateRecord()`
   (`:347-355`) trata tudo o que não esteja em `NON_STATE_EVENTS` (`:346`) como estado actual —
   um `escalated` ingénuo **substituiria o `done`/`failed`** e corromperia o recibo.
   Campos: `source_event_id`, `from_tier`, `to_tier`, `reason`, `mechanical_score`, `child_job_id`.
   **Teste obrigatório dos consumidores:** `toolStatus`, `fleet.foldJobs`, `recibo`.

4. **[G4 #3] UM learner, UM escritor. `preferences.json` NÃO é o sítio.**
   Não existe no runtime nem no git. E já há **bandit Thompson** em
   `packages/validation/src/bandit/bandit.ts:39-87` com `posterior-store.ts:3-12,81-102`, e um
   **learner offline activo** em `backtest.js:3-10` + `update-router.js:3-20` — só falta o bandit
   estar ligado ao hot path.
   **Decisão:** escolher **um** (integrar o bandit existente **ou** estender o ciclo
   backtest/tuning) e **um único escritor** do estado. Thresholds aprendidos **não** vivem em
   preferências de UI — isso seria a terceira verdade que o P0-C existe para matar.

5. **[G4 #12] Rotina semanal de aferição — escreve LOCAL.**
   Mede aceitação por tier + **recall do verificador com baseline publicado** + ajusta thresholds
   + escreve **recibo local/ledger**. A projecção para o vault é feita depois pelo Maestro/Curador,
   pelo protocolo de escritor único. A rotina **não** escreve na árvore do vault.

**DoD do bloco (medido, nunca declarado):** bateria interna (≠ teste A/B): 10 tarefas fáceis
fecham em T0/T2 com gate verde e só escalam quando o mecânico falha · o padrão "T3 100%" morre
**medido no ledger** · consumidores do ledger verdes com o evento novo · suite verde · teste
vermelho antes de cada fix.

---

## Bloco D — UX POR PROMPT

1. **[G4 #5] Detector de execução — corpus corrigido e linha corrigida.**
   O v1 dizia "7 falsos positivos" e `seamless.js:1318`. Medido: **6 inputs únicos / 7
   ocorrências** (o ghost conta duas vezes), e o detector vive em **`seamless.js:1381-1420`**.
   A contagem sai do corpus, não da memória: o corpus é o que o grep encontrar documentado.
   Melhorar o detector existente, **não** substituir. Nenhuma regex prescrita à partida.
   **DoD:** 0 falsos positivos no corpus, 0 falsos negativos nos casos reais de execução.

2. **[G4 #6] Recusa legível — o defeito é mais estreito do que o v1 dizia.**
   Recusas específicas **já são legíveis** (`seamless.js:3293-3305,3320-3328`). O buraco está só
   no wrapper genérico do `toolWork`, `:3540-3546`, cujo `resumo` omite `r.reasons[0]`/`r.error`.
   **Âmbito reduzido a esse caminho** — incluir a primeira razão no resumo, mantendo os campos
   estruturados. (Foi este buraco que me deu `⛔ não despachei o job · em Paulo Loureiro` sem
   motivo, na 4ª reprodução documentada.)

3. **[G4 #7] `chain_scheduled` — continua aberto e o recibo é factualmente falso.**
   `seamless.js:3495-3506` devolve `chained:true` **antes de existir filho**; `dispatchChain()`
   (`:2204-2217`) pode recusar ou falhar deixando só um log, sem evento auditável.
   **Devolver `chain_scheduled:true, chained:false`** e emitir depois `chain_started` ou
   `chain_refused`, ligados ao job de origem (e sideband, pela mesma razão do #4).
   **DoD:** teste vermelho por caso; os 3 na suite.

---

## Bloco E — PREP TESTE A/B Nº2 (desenhar, NÃO correr)

Headline: **DELTA DA CASCATA** — mesmos T1/T2 + braço **B′** (Mooter+cascata) vs **B** (pré-cascata)
vs **A** vs **C**.

**[G4 #10] O Aider Polyglot não é um bloco executável — é uma suite por nascer.**
`packages/mooter-bench` **classifica** 50 prompts com gold labels autorais
(`README.md:15-26,90-105`, `src/run.ts:51-83`); **não executa patches nem testes**. O Aider
aparece só como plano em `_handoff/BENCH_AB_PLANO_2026-07-28.md:72-76`.
**Suite separada, com:** revisão do dataset **pinada**, licença/proveniência, fixtures,
toolchains, testes objectivos, **pass@1**, limites de retry/tempo/custo, formato de resultados
congelado. Não se trata isto como "alargar o corpus".

Pré-commitment novo assinado antes (X/N + **recall-régua**, com baseline publicado ao lado de
qualquer accuracy). Rotina quinzenal desenhada com o MOO RANCH VIEW como saída de conteúdo.
**Entregável:** protocolo v2 em `_handoff/piloto2/`, congelado por sha, à espera de GO.

---

## Fecho da wave

`SYNC.md` · recibo local + projecção ao vault **pelo Maestro** (G15 + constituição) ·
`gauntlet:` grep-ável · push final com payload · BOARD para o Paulo: o que mudou `[medido]`, o
que ficou por fazer, e o delta vs concorrência com fonte.

---

gauntlet: alto-risco · **G4 CORRIDO** em motor diferente (codex, 448 s, 3,92 M tokens, 12
achados / 8 ALTA, todos incorporados — `job-msiyxad6-7dd2`) · G5: o Bloco C mudou de "construir"
para "integrar" porque o Oráculo, o bandit e o learner offline já existem · G3: Regra 0 mantida,
com B.1 excluído por não proteger nada · G17: esforço no eixo fluxo+recibo+aprendizagem, zero no
classify commodity · G18: DoD de cada bloco é medido · G11: "~50 prunable" era generalização —
medido deu 53 entradas, 0 prunable, 21 dirty

🔍 council 8/8 · objecção mais forte do G4: **o Bloco C do v1 mandava construir três coisas que
já existiam** (gate mecânico = `oraculo.js`; bandit = `packages/validation`; learner =
`backtest.js`/`update-router.js`), e o `preferences.json` proposto criava uma terceira verdade
sobre thresholds · resolvida: âmbito reduzido a integração, um learner, um escritor, e o estado
aprendido fora das preferências de UI
