# WAVE "POKE-MOO" — v1

> **Estado:** v1 congelado para ataque. **Bloco A (G4 nº2, codex) é o gate** — nada de B+
> antes de os achados entrarem e este ficheiro passar a v1.1.
>
> `gauntlet: alto-risco` · **G4 nº1** = painel-ultracode do Cowork (21 agentes, 4 lentes de
> ataque + verificação adversarial: 38 achados, 15 altas confirmadas [12 substantivas + 3
> meta-achados do próprio painel, declarados], 2 refutadas — TODAS as substantivas
> incorporadas neste v1, 2026-08-07) · **G4 nº2 OBRIGATÓRIO** = Bloco A (codex via frota)
> ANTES de executar B+.

## Missão

Montar a infra do A/B Pokémon — **braço A** (Fable 5 em todos os passos) vs **braço B′**
(Mooter + cascata por passo) — com marcos verificados por RAM, execução reproduzível e
recibo por lance. **ZERO runs de medição.** Esta wave constrói a pista; a corrida só existe
pós-teste nº2, com §0 assinado pelo Paulo.

## REGRA 0 — a fila não se fura

1. Se o fecho do piloto-1 (`aplicar-item8` → `resultado.md` → `dossier-data.json`) não
   terminou, esta wave **ESPERA**.
2. Zero dispatches concorrentes pela GPU/quota com trabalho do piloto-1 ou da WAVE VANTAGEM vivo.
3. Runs A/B: **TRAVADOS** até pós-nº2 + gesto explícito do Paulo (ficheiro `POKE_GO`, padrão `PILOTO_GO`).

## Regras invioláveis

- `classify.js` intocado (sha `427d8c0b…48f`)
- commits selectivos · push só com payload explícito (`push origin <sha>:branch`)
- teste vermelho antes de cada fix
- campo ausente = `null`, **nunca zero**
- Mooter no talo: blocos via `mooter_work` `wave:"poke-moo"`, **codex** para código, **moo**
  para verificação a $0, `pre_digest:false` + `agent` explícito nas cadeias
- **ROM:** nunca no repo, nunca commitada, nunca distribuída; instruções de dump **NUNCA**
  escritas em ficheiro nenhum (gesto verbal/privado do dono; o repo só regista `rom_sha256`)
- accuracy nunca sem baseline+recall
- propostas numéricas marcadas `[proposta]`, nunca no texto normativo

---

## Bloco A — G4 nº2 (motor distinto, antes de tudo)

`mooter_work` → **codex**, read-only, wave `poke-moo-g4`: ataque a ESTE ficheiro contra o
código real do bridge:

- onde nasce o adapter B′;
- que eventos o ledger suporta;
- o que `seamless.js` expõe por passo;
- **auditoria da fronteira de escrita**: nenhuma chamada de escrita a `pyboy.memory` nos
  adapters — faz parte do selo RAM-read-only.

Incorporar achados, **recommitar v1.1**, só então Bloco B.

**Honestidade de rótulo** (achado do painel): isto chama-se **revisão cruzada interna** —
motor distinto, mesma casa; **nunca vender como auditoria independente**. Antes do 1º run
público: 1 revisor humano externo ao §0.

---

## Bloco B — FUNDAÇÃO (sem LLM; sem ROM da Nintendo até ao gesto humano)

**B0. Inventário do ambiente** `[medido]` (achado do painel): `python --version` · venv
dedicado · `pip install pyboy` pinado + `import pyboy` ok · porta 8765 livre ·
`ffmpeg -version` · cada resultado registado; qualquer falha → **abort com relatório**, nunca
improvisar.

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
**Proibido baixar ROM de qualquer fonte.** Sem ROM → os passos B0-B3 e B5-B6 prosseguem; o
resto aborta limpo.

**B5. ⭐ TESTE VERMELHO DE DETERMINISMO** (achado central do painel — a doc do PyBoy **NÃO**
promete determinismo): mesmo save-state inicial + mesma sequência de inputs **indexada por
`frame_count`** (nunca por relógio; "seed" não existe em Gen 1 — o RNG vem de DIV/timing) →
hash da RAM idêntico em 2 execuções. Passa → o desenho por replay vale. Falha → declarar
`determinismo: n/d`, e o §0 **NÃO** pode usar replay como selo. Este teste entra na suite e
re-corre a cada bump de versão.

**B6. Mapa de verdade da RAM:** endereços de badges/party/espécie verificados contra o
disassembly público `pret/pokered`, fonte citada em comentário + teste que lê um save conhecido.

---

## Bloco C — OS DOIS BRAÇOS (wiring; medição proibida)

**C1. Adapter A (Fable 5):** fonte de custo declarada. **Base contabilística** (achado do
painel): ambos os braços a **preço de lista da API** para tokens metered; T0 local = custo
marginal **MEDIDO** (kWh×tarifa, declarado) ou `n/d` — **NUNCA "$0" apresentado como facto**.

**C2. Adapter B′ (Mooter por passo):** plugado contra o código real (`seamless.js`/bridge).
Recibo por lance no ledger; `escalated` com motivo; `chained` honesto. Guardar
`request_id`/resposta bruta do provider por lance — **o replay prova execução; a proveniência
das decisões prova-se com os recibos brutos** (dois claims separados, nunca fundidos).

**C3. ⭐ Detector de substring — teste vermelho ANTES de tudo** (achado do painel): enviar 10
prompts REAIS do loop do agente ("press A", etc.) pelo Mooter e contar recusas `[medido]`. Se
>0: resolver por **mecanismo explícito no produto** (flag/allowlist de wave de benchmark,
registada no ledger) — **PROIBIDO resolver por eufemismo de vocabulário**; recusa a meio de
run pré-registrado invalidaria o run.

**C4. Política de ação inválida** (congelar antes do §0): parser estrito · máx. retries por
passo **IGUAL** nos dois braços · fallback determinístico (no-op consome o passo) · log:
`action_raw, action_parsed, invalid_count, retries`.

**C5. Tetos em DOIS níveis:** `step_timeout_s` · `max_steps_por_run` · `max_cost_usd_por_run`
com paragem dura; todo run regista causa de término
(`completed|step_timeout|budget|crash|rom_ausente`).

**C6. Retoma:** checkpoint a cada K passos `[proposta: K=500]` (save-state + linha no ledger
com `step_idx, state_hash`); run retomado marca `resumed_from_step`; run não-retomável limpo
**DESCARTA-SE e re-corre** — nunca se remenda.

**C7. Simetria provada, não declarada:** teste que compara **byte-a-byte** o prompt entregue
ao motor em A e B′ para o mesmo estado; política única de retry/timeout; todo
retry/reformatação com recibo.

**C8. Reconciliação recibo↔passo** (herança W1): teste mecânico no fecho de cada run — nº de
linhas do jsonl = nº de recibos, custos somados batem, todo `chained` tem job nascido; ledger
de passos **append-only** com verificação de monotonicidade na retoma.

**C9. Smoke E2E a $0 — matriz, não passeio** (achado do painel):
(a) 50 passos normais com moo local;
(b) kill do processo + retoma do checkpoint com log contíguo;
(c) ação inválida forjada;
(d) timeout forçado de um passo;
(e) em B′, mudança de tier a meio com `escalated` no ledger.
Teto duro; aborta e declara.

---

## Bloco D — TELEMETRIA + VÍDEO (camada de marca própria)

**D1. jsonl por lance:** `ts, passo, state_hash, modelo, tier, tokens_in/out, custo_usd,
custo_base(list_price|marginal|n/d), acao, action_raw, retries, escalada_motivo|null,
t_infer_ms, t_emul_ms, t_total_ms, request_id`.

**D2. Métrica primária** = progresso por **passo de decisão** + custo por passo/marco.
Wall-clock é **SECUNDÁRIA** e reporta-se **decomposta** (inferência vs emulação vs
transporte) — as latências de A (API remota) e B′ (local/misto) são estruturalmente
diferentes; **wall-clock nunca decide vitória no §0**.

**D3. Vídeo:** protótipo com o smoke — timelapse lado-a-lado, HUD com custo acumulado e cor
por decisão (verde=T0 local `custo marginal n/d` até medir · amarelo=T2 · vermelho=T3), fator
de compressão temporal declarado no cartão final.
**Jurídico** (achado do painel): **NENHUM** frame do jogo em material de pitch/publicado sem
parecer jurídico prévio; **plano B construído JÁ**: vídeo só com HUD/telemetria/leaderboard
abstrato, zero áudio do jogo, disclaimer nominativo ("Pokémon/Mew são marcas
Nintendo/Creatures/Game Freak; sem afiliação"). Footage crua: só demo privada ao vivo.
**Naming público = universo próprio** (Moo, Moo Ranch); referência à estrutura, nunca aos assets.

**D4. Leaderboard** HTML estático dos jsonl. **Regra anti-cherry-pick** (achado do painel):
todo run **INICIADO** é publicado (incl. abortados), numerado **ANTES** de correr; hash do
jsonl **ancorado externamente** no fecho (commit público/OpenTimestamps); o leaderboard só
aceita runs com âncora.

---

## Bloco E — §0 DO PILOTO-POKÉ (desenhar, NÃO correr) — entregáveis com critério de aceitação

**E1. `prereg.md`** — campos em branco para o dono: tetos por marco, n de runs
`[proposta: n=3 no M1; headline SEMPRE como intervalo min–max, nunca ponto único]`, critério
de vitória por métrica, base contabilística, régua imutável entre edições (R1). Congela por
sha **SÓ** após gesto do Paulo.

**E2. `judge.py` + testes** — o juiz mecânico (flags de RAM) com endereços citados do `pret/pokered`.

**E3. Schema do `steps.jsonl`** versionado + regra campo-ausente=`null`.

**E4. Kit de reprodução por terceiros** (achado do painel): `rom_sha256` + `sha256` do
save-state inicial + versões pinadas + procedimento "traz a tua ROM com este hash e
re-executa"; **teste que FALHA se um run não registar os três hashes**.

**E5. Estimativa de passos×custo** por braço **ANTES** de qualquer autorização de run.

**E6. Escada de marcos** (jornada completa, valor por degrau): M1 badge Brock (recorrente) →
M2 Misty → … → Liga → M3 "capturar o Moo" (Mew via **glitch do treinador** — mecânica do
jogo, nunca GameShark). **M3 condicionado** no §0 à prova prévia de replay frame-indexado no
M1; até lá, M3 fora de material público.

---

## Fecho da wave

`SYNC.md` · `mooter_journal` no vault (G15) · `gauntlet:` grep-ável · shas finais (poke-lab +
frugal) · BOARD: pronto `[medido]` / à espera de gesto humano (ROM, §0) / travado.

**MONTAR E SMOKAR: SIM. QUALQUER RUN DE MEDIÇÃO A/B: PROIBIDO ATÉ ORDEM EXPLÍCITA
PÓS-TESTE-Nº2. ONDE UM MOCK CHEGA, O SMOKE USA MOCK.**

---

gauntlet: alto-risco · G4 nº1 painel-ultracode (38 achados; determinismo-não-documentado,
harness-sem-releases, reprodução-por-terceiros, proveniência≠replay, contabilidade-de-custo,
jurídico-pitch, ação-inválida, tetos-2-níveis, retoma, latência-decomposta, anti-cherry-pick,
detector-por-mecanismo — todos dentro) · G4 nº2 = Bloco A (codex) **pendente** · G5:
PyBoy+pokemon-agent reutilizados · G17: eixo fluxo+recibo+aprendizagem — o jogo é vitrine ·
G18: claims com `[medido]`/`n/d` por construção · **não corridos: G4 nº2**
