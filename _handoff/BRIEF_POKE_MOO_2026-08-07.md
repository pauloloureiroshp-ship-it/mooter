# WAVE "POKE-MOO" — v1.1

> **Estado:** v1.1 — achados do G4 nº2 incorporados. **Bloco B+ continua NO-SHIP** até o §C
> ser reconstruído sobre `StepReceiptV1` e `runDecision()`, que ainda **não existem**.
>
> `gauntlet: alto-risco`
> · **G4 nº1** = painel-ultracode do Cowork (21 agentes, 4 lentes + verificação adversarial:
> 38 achados, 15 altas [12 substantivas + 3 meta-achados declarados], 2 refutadas — todas as
> substantivas dentro desde o v1, 2026-08-07). `evidence_ref: n/d` — o painel correu em
> conversa Cowork e **não deixou artefacto com sha**; a contagem fica como declaração do
> Paulo, não como medição citável (achado M4 do G4 nº2).
> · **G4 nº2** = `job-msjkgo7y-f72d`, wave `poke-moo-g4`, codex read-only sobre o v1
> (sha `8272c049`), 878 s, 52 passos, exit 0. **19 achados: 14 ALTO · 5 MÉDIO.**
> Verificação cruzada local **não correu** (`o modelo local excedeu o timeout`) — este gate
> teve **um** motor, não dois.
> · **Rótulo honesto:** revisão cruzada **INTERNA** — motor distinto, mesma casa. Não é
> auditoria independente e não será vendida como tal. Antes do 1º run público: 1 revisor
> humano externo ao §0.

## Missão

Montar a infra do A/B Pokémon — **braço A** (modelo fixo de topo em todos os passos) vs
**braço B′** (Mooter + cascata por passo) — com marcos verificados por RAM, execução
reproduzível e recibo por lance. **ZERO runs de medição.** Esta wave constrói a pista; a
corrida só existe pós-teste nº2, com §0 assinado pelo Paulo.

## REGRA 0 — a fila não se fura

1. Se o fecho do piloto-1 (`aplicar-item8` → `resultado.md` → `dossier-data.json`) não
   terminou, esta wave **ESPERA**. — ✅ **cumprido**: fechado em `86823d1e` (1 `S`, 8 `n/d`,
   manifest 28/28 no pacote e no espelho do vault).
2. Zero dispatches concorrentes pela GPU/quota com trabalho do piloto-1 ou da WAVE VANTAGEM vivo.
3. Runs A/B: **TRAVADOS** até pós-nº2 + gesto explícito do Paulo (ficheiro `POKE_GO`, padrão `PILOTO_GO`).

## Regras invioláveis

- `classify.js` intocado (sha `427d8c0b…48f`) — reverificado pelo G4 nº2, íntegro
- commits selectivos · push só com payload explícito (`push origin <sha>:branch`)
- teste vermelho antes de cada fix
- campo ausente = `null`, **nunca zero**
- Mooter no talo: blocos via `mooter_work` `wave:"poke-moo"`, **codex** para código, **moo**
  para verificação a $0, `pre_digest:false` + `agent` explícito nas cadeias.
  ⚠️ `worktree` **sempre em caminho absoluto** — `path.resolve()` resolve relativos contra o
  cwd do processo e o guard recusa em silêncio (custou 3 dispatches às cegas em 2026-08-07)
- **ROM:** nunca no repo, nunca commitada, nunca distribuída; instruções de dump **NUNCA**
  escritas em ficheiro nenhum (gesto verbal/privado do dono; o repo só regista `rom_sha256`)
- accuracy nunca sem baseline+recall
- propostas numéricas marcadas `[proposta]`, nunca no texto normativo

---

## Bloco A — G4 nº2 — ✅ CORRIDO (veredicto: NO-SHIP para B+)

Correu em `job-msjkgo7y-f72d`. O apêndice §A1 lista os 19 achados e onde cada um aterrou.

**A conclusão que reordena a wave:** *o bridge actual prova jobs, não decisões do jogo.*
Três coisas que o v1 dava por adquiridas **não existem**:

1. **Não há seam síncrono por lance.** `toolWork`/`toolDispatch` operam por tarefa/job
   (`packages/mooter-bridge/seamless.js:1844`). O `adaptiveRoute()` mais próximo vive num
   package privado e desligado do bridge (`packages/router/src/fable-5-routing.ts:434`,
   `packages/router/package.json:4`).
2. **O `step` do bridge não é um lance.** Mede tool calls internas do agente
   (`seamless.js:841`); custo e tokens só chegam no evento terminal do job
   (`seamless.js:2045`, `:2380`).
3. **`escalated`+motivo, `chained` e `request_id` não estão no ledger.** São, respectivamente,
   um booleano sem razão persistida (`fable-5-routing.ts:357`, `:515`), um campo de resposta
   emitido antes de o downstream nascer (`seamless.js:2028`, `:2204`, `:3495`), e um valor
   que os adapters descartam (`kimi-adapter.js:213`, `:230`, `seamless.js:2687`).

**Consequência normativa:** o Bloco C deixa de ser "wiring" e passa a ser **construção de duas
peças novas** — `StepReceiptV1` e `runDecision()` — antes de qualquer adapter. Ver §C0.

---

## Bloco B — FUNDAÇÃO (sem LLM; sem ROM da Nintendo até ao gesto humano)

**B0. Inventário do ambiente** `[medido]`: `python --version` · venv dedicado ·
`pip install pyboy` pinado + `import pyboy` ok · porta 8765 livre · `ffmpeg -version` · cada
resultado registado; qualquer falha → **abort com relatório**, nunca improvisar.

**B1. Casa própria:** repo novo `~/poke-lab` (fora do `frugal`). `.gitignore` cobrindo
`roms/`, `videos/`, `states/`, `runs/` desde o commit 1 + **teste que verifica o gitignore**.

**B2. Stack pinada:** PyBoy versão exata registada. `window="null"`, som desligado
(`sound=False`/equivalente na versão pinada). Smoke de boot headless com **ROM homebrew
open-source**.

**B3. Harness:** clone `NousResearch/pokemon-agent` — pin por **COMMIT SHA** (o repo tem zero
releases/tags — **declarar isso**) + snapshot congelado do schema de `GET /state` (as chaves
que o juiz usa; campo que sumir = `null`, nunca reinterpretar). Smoke da REST no Windows real.

**B4. Gesto humano (gate):** o Paulo fornece o caminho absoluto da ROM (dump do cartucho
dele). O CC verifica existência + calcula `rom_sha256` (o hash publica-se; a ROM nunca).
**Proibido baixar ROM de qualquer fonte.**
**Sem ROM prosseguem B0-B3 e B5 na variante homebrew. B6 fica BLOQUEADO** — precisa de um
save Pokémon conhecido, que só existe com ROM. *(achado M2: o v1 dizia que B6 prosseguia sem
ROM e contradizia-se a si próprio.)*

**B5. ⭐ TESTE VERMELHO DE DETERMINISMO** (a doc do PyBoy **NÃO** promete determinismo): mesmo
save-state inicial + mesma sequência de inputs **indexada por `frame_count`** (nunca por
relógio; "seed" não existe em Gen 1 — o RNG vem de DIV/timing) → hash da RAM idêntico em 2
execuções. Passa → o desenho por replay vale. Falha → declarar `determinismo: n/d`, e o §0
**NÃO** pode usar replay como selo. Entra na suite e re-corre a cada bump de versão.

**B6. Mapa de verdade da RAM** *(bloqueado até B4)*: endereços de badges/party/espécie
verificados contra o disassembly público `pret/pokered`, fonte citada em comentário + teste
que lê um save conhecido.

---

## Bloco C — OS DOIS BRAÇOS

> **C0 é pré-requisito duro de tudo o resto do §C.** O v1 chamava a isto "wiring"; o G4 nº2
> provou que as peças a que se ia ligar não existem.

### C0. ⭐ AS DUAS PEÇAS NOVAS (antes de qualquer adapter)

**C0.a — `StepReceiptV1`, schema único congelado ANTES de se escrever adapters.** É usado
**literalmente** por C2, C4, C6, C8, D1 e E3 — um só schema, não seis dialectos
*(achado M1: no v1, `action_parsed`/`invalid_count` desapareciam entre C4 e D1, e `passo`
alternava com `step_idx`)*. Campos obrigatórios:

| campo | regra |
|---|---|
| `run_id`, `game_step_idx`, `attempt_idx` | a **chave** de reconciliação |
| `agent_tool_call_idx` | a métrica antiga do bridge, renomeada — **não** é um lance |
| `seq`, `prev_hash`, `record_hash` | cadeia; sem isto não há monotonicidade |
| `escalated`, `escalation_reason`, `models_tried[]` | motivo persistido, nunca só o booleano |
| `chain_requested`, `chain_materialized`, `parent_receipt_id` | `materialized` só true **depois** de existir o recibo filho |
| `request_id` | `null` quando o transporte não o expõe — **nunca inventado** |
| `output_hash` | hash do output observável; substitui "raw provider response" quando esta não existe |
| `api_cost_usd`, `marginal_cost_usd`, `cost_basis` | três campos distintos; `marginal` fica `null` até kWh×tarifa medido |
| `known_cost_subtotal_usd`, `total_cost_usd`, `cost_complete` | subtotal pode ser 0; **o total fica `null` enquanto incompleto** |
| `action_raw`, `action_parsed`, `invalid_count`, `retries`, `retry_kind` | `retry_kind` distingue parsing · escalada · call do juiz |
| `t_infer_ms`, `t_emul_ms`, `t_transport_ms`, `t_total_ms` | latência decomposta desde a origem |

**C0.b — `runDecision(prompt_bytes, run_id, step_idx, budget)`**, API nova e síncrona por
lance. `mooter_work` **apenas orquestra a wave**; não é o motor do loop de jogo
*(achado A1)*. `budget` é parte da assinatura porque o tecto tem de ser admitido **antes** da
call — ver C5.

**C0.c — escritor único.** `steps.jsonl` é a **fonte canónica**, com um só escritor. O ledger
do bridge, o journal de escalada e o `recibo.js` (que é uma projecção job-level,
`recibo.js:256`) guardam **referências e hashes**, nunca uma segunda verdade *(achado A9)*.
Hoje não há lock nem sequência, e `fleet.js:689` escreve directamente no mesmo ledger que
`seamless.js:231` — por isso "append-only" era uma promessa, não uma prova *(achado A8)*.

### C1. Adapter A (braço de topo)

**Nomear provider, transporte e modelo exacto** — não "Fable 5" à solta. `adaptiveRoute()` é
uma **estratégia de escalada**, não o adapter de modelo fixo, e T5 não tem mapping automático
(`fable-5-routing.ts:5`, `seamless.js:1110`) *(achado A2)*. O algoritmo usado em B′ e o
modelo usado em A são coisas separadas e o brief tem de as escrever separadas.

**Base contabilística:** ambos os braços a **preço de lista da API** para tokens metered; T0
local = custo marginal **MEDIDO** (kWh×tarifa, declarado) ou `n/d` — **NUNCA "$0" apresentado
como facto**. Hoje o caminho local regista custo API zero e energia `n/d`, e essa ressalva
perde-se até o recibo dizer "moo a $0" (`moo.js:576`, `telemetry.js:299`, `recibo.js:317`)
*(achado A11)*.

### C2. Adapter B′ (Mooter por passo)

Construído sobre `runDecision()`, não sobre `mooter_work`. Recibo por lance conforme
`StepReceiptV1`.
**Dois claims separados, nunca fundidos:** o replay prova **execução**; a proveniência das
decisões prova-se com os **recibos brutos**. Quando o transporte não expõe `request_id` nem
resposta bruta, grava-se `request_id: null` + `output_hash` — e diz-se isso *(achado A7)*.
**A cascata subconta o juiz:** `Judge` devolve só um score, logo os tokens do juiz não entram
nas tentativas (`fable-5-routing.ts:96`, `:472`, `:591`). Executor e juiz são **calls
separadas**, ambas com recibo *(achado A12)*.

### C3. ⭐ Detector de substring — teste vermelho ANTES de tudo

Enviar 10 prompts REAIS do loop do agente ("press A", etc.) pelo Mooter e contar recusas
`[medido]`. Se >0: resolver por **mecanismo explícito no produto** (flag/allowlist de wave de
benchmark, registada no ledger) — **PROIBIDO resolver por eufemismo de vocabulário**; recusa a
meio de run pré-registrado invalidaria o run.

### C4. Política de ação inválida (congelar antes do §0)

Parser estrito · máx. retries por passo **IGUAL** nos dois braços · fallback determinístico
(no-op consome o passo). Log = os campos de `StepReceiptV1`, sem schema paralelo.

### C5. Tetos em DOIS níveis — com admissão pré-call

`step_timeout_s` · `max_steps_por_run` · `max_cost_usd_por_run`. **O tecto duro não é
mecanicamente garantível na API actual**: o dispatch não aceita orçamento nem
`max_output_tokens`, e o timeout é global ao job (`seamless.js:147`, `:2130`, `:3646`)
*(achado A13)*. Logo: **admissão pré-call pelo pior caso de preço** · `max_output_tokens`
obrigatório · **overshoot máximo explicitamente pré-registado** no §0.
Todo run regista causa de término (`completed|step_timeout|budget|crash|rom_ausente`).

### C6. Retoma

Checkpoint a cada K passos `[proposta: K=500]` (save-state + linha em `steps.jsonl` com
`game_step_idx`, `state_hash`, `seq`, `record_hash`); run retomado marca `resumed_from_step` e
**valida a cadeia de hashes antes de continuar**; run não-retomável limpo **DESCARTA-SE e
re-corre** — nunca se remenda.

### C7. Simetria provada, não declarada — sobre um payload canónico

**A simetria byte-a-byte é impossível na fronteira actual:** `mooter_work` acrescenta
cabeçalho, regras, contexto e prep (`seamless.js:1915`), `toolDispatch` pode acrescentar
mapa/handoff (`seamless.js:3367`), e cada provider tem envelope próprio (`moo.js:460`)
*(achado A3)*. Portanto o teste compara **os bytes UTF-8 de um payload canónico construído
uma só vez** e entregue aos dois braços; **routing e envelopes ficam fora dele**, cada um com
o seu próprio hash registado. Política única de retry/timeout; todo retry/reformatação com recibo.

### C8. Reconciliação recibo↔passo — por chave, não por contagem

**A igualdade "nº linhas = nº recibos" falha por construção:** um job produz
`dispatched → started → done` e o `collect` acrescenta outra linha (`seamless.test.js:668`,
`:709`) *(achado A10)*. Reconcilia-se por **chave `(run_id, game_step_idx, attempt_idx)`**:
todo passo tem recibo, todo recibo tem passo, custos somados batem, todo `chain_requested`
tem `chain_materialized` **ou** um motivo. Monotonicidade verificada por `seq`+`prev_hash` na
retoma.

### C9. Smoke E2E a $0 — matriz, não passeio

(a) 50 passos normais com moo local; (b) kill do processo + retoma do checkpoint com cadeia de
hashes contígua; (c) ação inválida forjada; (d) timeout forçado de um passo; (e) em B′,
mudança de tier a meio com `escalated`+`escalation_reason` no recibo. Teto duro; aborta e declara.

---

## Bloco D — TELEMETRIA + VÍDEO

**D1. `steps.jsonl`** = `StepReceiptV1`, literal. Sem campos inventados no D1 que não existam
no C0.a.

**D2. Métrica primária** = progresso por **passo de decisão** + custo por passo/marco.
Wall-clock é **SECUNDÁRIA** e reporta-se **decomposta** (inferência vs emulação vs
transporte) — as latências de A (API remota) e B′ (local/misto) são estruturalmente
diferentes; **wall-clock nunca decide vitória no §0**.

**D3. Vídeo:** protótipo com o smoke — timelapse lado-a-lado, HUD com custo acumulado e cor
por decisão (verde=T0 local `custo marginal n/d` até medir · amarelo=T2 · vermelho=T3), fator
de compressão temporal declarado no cartão final.
**Jurídico:** **NENHUM** frame do jogo em material de pitch/publicado sem parecer jurídico
prévio; **plano B construído JÁ**: vídeo só com HUD/telemetria/leaderboard abstrato, zero
áudio do jogo, disclaimer nominativo ("Pokémon/Mew são marcas Nintendo/Creatures/Game Freak;
sem afiliação"). Footage crua: só demo privada ao vivo. **Naming público = universo próprio**
(Moo, Moo Ranch); referência à estrutura, nunca aos assets.

**D4. Leaderboard** HTML estático dos jsonl. **Anti-cherry-pick:** todo run **INICIADO** é
publicado (incl. abortados), numerado **ANTES** de correr.
**A âncora externa é acção irreversível e leva gate próprio** *(achado M5)*: primeiro gera-se
o hash local e o run fica `anchor_status: "pending"`; commit público/OpenTimestamps só **após
aprovação explícita do Paulo**. O leaderboard aceita `pending`, e mostra-o como tal.

---

## Bloco E — §0 DO PILOTO-POKÉ (desenhar, NÃO correr)

**E1. `prereg.md`** — campos em branco para o dono: tetos por marco (incl. **overshoot
máximo** de C5), n de runs `[proposta: n=3 no M1; headline SEMPRE como intervalo min–max,
nunca ponto único]`, critério de vitória por métrica, base contabilística, régua imutável
entre edições (R1). Congela por sha **SÓ** após gesto do Paulo.

**E2. `judge.py` + testes** — o juiz mecânico (flags de RAM) com endereços citados do `pret/pokered`.

**E3. Schema do `steps.jsonl`** = `StepReceiptV1` versionado + regra campo-ausente=`null`.

**E4. Kit de reprodução por terceiros — os TRÊS hashes, nomeados** *(achado M3: o v1 exigia
três e enumerava dois)*: `rom_sha256` · `initial_state_sha256` · `runner_commit_sha`. Mais as
versões pinadas e o procedimento "traz a tua ROM com este hash e re-executa". **Teste que
FALHA se um run não registar exactamente esses três nomes.**

**E5. Estimativa de passos×custo** por braço **ANTES** de qualquer autorização de run.

**E6. Escada de marcos:** M1 badge Brock (recorrente) → M2 Misty → … → Liga → M3 "capturar o
Moo" (Mew via **glitch do treinador** — mecânica do jogo, nunca GameShark). **M3 condicionado**
à prova prévia de replay frame-indexado no M1; até lá, M3 fora de material público.

---

## Apêndice A1 — os 19 achados do G4 nº2 e onde aterraram

`job-msjkgo7y-f72d` · codex read-only · 878 s · exit 0 · verificação cruzada local **não
correu** (timeout do modelo local) — este gate teve **um** motor.

| # | sev | achado | aterrou em |
|---|---|---|---|
| A1 | ALTO | não existe seam síncrono por lance | C0.b `runDecision()` |
| A2 | ALTO | "Fable 5" ambíguo: estratégia ≠ adapter de modelo fixo | C1 |
| A3 | ALTO | simetria byte-a-byte impossível na fronteira actual | C7 (payload canónico) |
| A4 | ALTO | o `step` do bridge não é um lance | C0.a (`agent_tool_call_idx` vs `game_step_idx`) |
| A5 | ALTO | `escalated`+motivo não existe no ledger | C0.a (`escalation_reason`, `models_tried`) |
| A6 | ALTO | `chained` emitido antes de o filho nascer | C0.a (`chain_requested`/`chain_materialized`) |
| A7 | ALTO | `request_id` e resposta bruta não preservados | C2 (`request_id: null` + `output_hash`) |
| A8 | ALTO | append-only sem lock, seq ou hash encadeado | C0.a + C0.c |
| A9 | ALTO | quatro "ledgers" tratados como um | C0.c (escritor único) |
| A10 | ALTO | C8 "linhas = recibos" falha por construção | C8 (reconciliação por chave) |
| A11 | ALTO | contabilidade local vira "$0" no recibo | C1 (3 campos de custo) |
| A12 | ALTO | a cascata subconta os tokens do juiz | C2 (executor e juiz separados) |
| A13 | ALTO | tecto de custo não garantível na API actual | C5 (admissão pré-call + overshoot) |
| A14 | ALTO | selo RAM-read-only é prosa; grep literal é iludível | §A2 abaixo |
| M1 | MÉDIO | C4 e D1 não partilhavam schema | C0.a (schema único) |
| M2 | MÉDIO | B4 dizia que B6 prosseguia sem ROM | B4/B6 (B6 bloqueado) |
| M3 | MÉDIO | E4 exigia 3 hashes e enumerava 2 | E4 (os três nomeados) |
| M4 | MÉDIO | números do G4 nº1 e "G5 reutilizados" sem `evidence_ref` | cabeçalho (`evidence_ref: n/d`) + rodapé |
| M5 | MÉDIO | âncora pública sem gate próprio | D4 (`anchor_status: pending`) |

**O que o codex tentou refutar e não conseguiu** (registado porque um gate que só acusa não
correu): existe mesmo uma cascata reutilizável de partida (`adaptiveRoute()` mantém tentativas
explícitas e entrega a mesma task ao executor — o problema é integração, proveniência e
contabilidade); o `handoff_from` **é** honesto (só é gravado quando o output anterior foi
mesmo embutido, `seamless.js:1907`); e o append-only **operacional** do bridge no caminho
normal aguenta-se (eventos acrescentados, `collected` idempotente) — o que não prova
monotonicidade, exclusão de escritores concorrentes nem resistência a adulteração.

## Apêndice A2 — o selo RAM-read-only, virado mecanismo (achado A14)

O v1 prometia "nenhuma chamada de escrita a `pyboy.memory`" e teria sido verificado por um
grep. Este repo já usa `eval`/`new Function` e dispatch por propriedade calculada
(`ondaA.test.js:224`, `tools/router/backtest.js:897`, `trilha.js:154`) — um grep literal é
iludível por construção. O selo passa a ser:

1. **Arquitectura:** o PyBoy vive num **controlador exclusivo**. Os adapters recebem só
   `bytes` imutáveis e devolvem uma **action enum**. Nunca vêem o objecto do emulador.
2. **Teste AST** que enumera *todos* os adapters e rejeita: imports de PyBoy · stores/deletes
   sobre aliases de memória · `getattr`/`setattr`/`delattr` · `__dict__` · `__setitem__` ·
   `eval`/`exec`/`compile` · imports dinâmicos · `ctypes` · subprocessos.
3. **Teste runtime** com um proxy cujo `__setitem__` **falha**, exigindo zero escritas ao fim
   de um run de smoke.

---

## Fecho da wave

`SYNC.md` · `mooter_journal` no vault (G15) · `gauntlet:` grep-ável · shas finais (poke-lab +
frugal) · BOARD: pronto `[medido]` / à espera de gesto humano (ROM, §0) / travado.

**MONTAR E SMOKAR: SIM. QUALQUER RUN DE MEDIÇÃO A/B: PROIBIDO ATÉ ORDEM EXPLÍCITA
PÓS-TESTE-Nº2. ONDE UM MOCK CHEGA, O SMOKE USA MOCK.**

---

gauntlet: alto-risco · G4 nº1 painel-ultracode (38 achados, `evidence_ref: n/d`) ·
**G4 nº2 CORRIDO** (`job-msjkgo7y-f72d`, 19 achados, todos incorporados neste v1.1; **um só
motor — a verificação cruzada local não correu**) · G5: PyBoy+pokemon-agent **planeado, não
corrido** — o `poke-lab` ainda não existe · G17: eixo fluxo+recibo+aprendizagem — o jogo é
vitrine · G18: claims com `[medido]`/`n/d` por construção ·
**não corridos: G5 · revisor humano externo · verificação cruzada do G4 nº2**
