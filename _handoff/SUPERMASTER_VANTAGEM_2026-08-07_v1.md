# SUPERMASTER — WAVE "VANTAGEM" (pós-`resultado.md` · o Mooter à frente da concorrência)

**Data:** 2026-08-07 · **Executor:** CC orquestrando a frota Mooter NO TALO
**Estado:** 🟡 aguarda G4 (Bloco A) e o `resultado.md` do piloto
**Missão:** metodologia, roteamento e UX por prompt acima de qualquer concorrente medido
(survey arXiv 2603.04445 · OmniRoute · RouteLLM) — construído sobre os números do piloto,
nunca sobre opinião.

## REGRA 0 — o piloto manda

NADA dos blocos B-E corre antes de o `resultado.md` do piloto existir (T1 desta tarde →
julgamento → mapa → resultado). Excepção única: o **Bloco A** (G4 deste brief) pode correr em
paralelo por ser só-leitura. Se a T1 estiver a correr, zero dispatches concorrentes pela
GPU/quota.

## Regras invioláveis

`classify.js` intocado (sha `427d8c0b…48f`) · commits selectivos · push só com payload
explícito · teste vermelho antes de cada fix · campo ausente = `null` nunca zero · **accuracy
nunca sem baseline + recall da classe minoritária** (regra nova, VERIFICADOR-0) · Mooter no
talo: blocos despachados via `mooter_work` `wave:"vantagem"`, codex p/ código, moo p/
verificação mecânica a $0, `pre_digest:false` nas cadeias até P1-D#2 fechar.

## Bloco A — G4 DESTE BRIEF (motor diferente, antes de executar B-E)

`mooter_work` → codex, read-only, wave `vantagem-g4`: ataque adversarial a este ficheiro contra
o código real (como no `pista-limpa-g4`, que devolveu 10 achados). Incorporar achados,
re-commitar como v1.1, e só então B.

## Bloco B — CASA EM ORDEM (30-60 min)

1. Push dos locais pendentes com payload (`ed95c383` .gitignore · `3ebbb692` pré-registo ·
   `5ae49188` veredicto + o que a tarde produzir).
2. Auditoria de worktrees: ~50 marcadas prunable. **Relatório ANTES de tocar**: por worktree —
   branch, merged-em-main?, uncommitted?, idade. Prune SÓ das merged E limpas; branches nunca se
   apagam; worktrees com uncommitted ficam listadas para decisão do Paulo. Saída: repo com
   worktrees vivas contadas nos dedos.
3. Última versão: aplicar `mooter-v1490.mcpb` (ou empacotar 1.50.0 se o bridge tiver commits
   novos desde o build) → gate humano do restart → prova byte-a-byte mcpb vs repo → smoke test
   P0-B em runtime (os 9 campos no ledger). Só DEPOIS do `resultado.md`, nunca antes.

## Bloco C — CASCATA-APRENDE (o roteamento à frente de todos)

Implementar a forma final da memória `cascata-aprende` (pós-VERIFICADOR-0):

1. **Gate mecânico-primeiro:** T0/T2 gera → checks determinísticos ($0: TEST_CMD, DoD-style,
   lint/parse) → aceita ou escala. **LLM-juiz NUNCA no gate** (função constante, medido) — só
   desempate futuro, após aferição provar recall > baseline no domínio.
2. Evento `escalated` no ledger com motivo + score mecânico — cada escalada auditável.
3. **Aprendizagem online sem humano:** outcomes do ledger → estatística de aceitação por
   categoria → thresholds em `preferences.json` (bandit explorar/aproveitar). `classify.js`
   intocado — a cascata é camada host-side por cima da classificação.
4. **Rotina semanal de aferição** (scheduled task): mede aceitação por tier + recall do
   verificador (com baseline publicado) + ajusta thresholds + journal no vault. É isto que faz
   o Mooter crescer sem o Paulo.

**DoD do bloco:** bateria interna (não é o teste A/B): 10 tarefas fáceis fecham em T0/T2 com
gate verde e só escalam quando o mecânico falha; o padrão "T3 100%" morre MEDIDO no ledger;
suite verde; tudo com teste vermelho primeiro.

## Bloco D — UX POR PROMPT (os 3 gaps medidos, nenhum inventado)

1. **Detector de execução (P1-D#4):** corpus de regressão com os 7 falsos positivos documentados
   (08-04→08-07, incl. "run" descritivo e ficheiro-fantasma) → melhorar `seamless.js:1318`, não
   substituir. **DoD:** 0 falsos positivos no corpus, 0 falsos negativos nos casos reais de
   execução.
2. **A1 — recusa legível:** o motivo da recusa sai no `resumo`, não só no `structuredContent`
   ("não despachei o job" sem porquê = utilizador às cegas, reproduzido 3×).
3. **`chain_scheduled` (P1-D#2):** promessa de job pago só vira `chained:true` com `job_id` filho
   nascido; recusa do filho persistida no ledger. **DoD:** teste vermelho por caso; os 3 na suite.

## Bloco E — PREP TESTE A/B Nº2 (desenhar, NÃO correr)

O headline do próximo teste é o **DELTA DA CASCATA**: mesmos T1/T2 + braço **B′**
(Mooter+cascata) vs **B** (Mooter pré-cascata) vs **A** vs **C**. Corpus alarga com F1 público
(subset Aider Polyglot) para comparabilidade mundial. Pré-commitment novo assinado antes (X/N +
recall-régua). Rotina de testes recorrentes (quinzenal) desenhada com o MOO RANCH VIEW como
saída de conteúdo — ver memória. **Entregável:** protocolo v2 em `_handoff/piloto2/`, congelado
por sha, à espera de GO.

## Fecho da wave

`SYNC.md` · journal no vault (G15) · `gauntlet:` grep-ável · push final com payload · BOARD para
o Paulo com: o que mudou `[medido]`, o que ficou por fazer, e o delta vs concorrência com fonte.

---

gauntlet: alto-risco · G4 embutido como Bloco A (codex via frota ANTES de executar) · G5:
cascata/métricas vêm do survey+VERIFICADOR-0, não de opinião · G3: Regra 0 força a ordem
(resultado primeiro) · G17: todo o esforço no eixo fluxo+recibo+aprendizagem, zero no classify
commodity · G18: DoD de cada bloco é medido, nunca declarado
