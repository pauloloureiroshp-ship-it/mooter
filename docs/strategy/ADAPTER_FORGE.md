# 🧠🔁 Adapter Forge — continual learning local (o "Learns forever" literal · $0)

> **O que é.** O **motor de aprendizagem** da Mooter Evolution Fleet. A frota
> (`docs/strategy/MOOTER_EVOLUTION_FLEET.md`) produz pares `(contexto → resposta que PROVOU ganho)`;
> o Adapter Forge destila-os, nas horas ociosas da 4090 (overclock), em **adapters** que tornam os
> moos locais e as camadas host-side do routing mais fortes a cada noite — **$0, zero cloud, dados
> nunca saem da máquina**. Faz a missão "**Learns forever**" mecânica, não slogan.
>
> **Estado:** 🔧 F0 (design / source of truth). O *loop* de continual-learning é **greenfield**; a
> *fundação* (trainer QLoRA, forge, registry, harness A/B, allocator) **existe e está em `main`**.
> Este doc está **untracked** — aterrar em `main` (worktree dedicado, docs-only) é passo de gate, não facto.
>
> **Herda todos os guardrails da Fleet (H1-H8)** — este doc só acrescenta os 3 específicos + AF-01…AF-19.
> Relaciona: `MOOTER_EVOLUTION_FLEET.md` (§9 graduação), `OVERCLOCK_MOO_SPEC.md` (allocator),
> `docs/adr/020-adapter-forge-approach.md` (Accepted, Wave 5 D2), ADR 015 (Pastor eixo de domínio).

---

## 0 · Reconciliação honesta (groundedness antes de visão — H7)

O fosso deste produto é a honestidade radical. O masterprompt parte de uma premissa **factualmente
errada**; o design corrige-a à cabeça em vez de a herdar.

| Afirmação do masterprompt | Realidade verificada (fonte no repo) |
|---|---|
| "`pastor distill` já provou **657 decisões → adapter**" | `pastor distill` emite um **`.skill.md`** (features TF-IDF agregadas, determinístico, **sem LLM, sem adapter**). Número real: **656 decisões → skill** (`audit/PASTOR_V2_DEMO_LOG.md:46`). Ver a correcção já registada em `MOOTER_EVOLUTION_FLEET.md:353-363`. |
| Implícito: existe um pipeline `Ledger measured-pairs → adapter` | **Não existe.** O único treinador LoRA (`scripts/train_lora.py`) é alimentado por `audit/lora_train.jsonl` (self-audit pairs, score≥8 → 212), **não** por `decisions.log` nem por pares `measured`. |
| Implícito: os 6 adapters canónicos estão treinados | O `adapter-registry.ts` regista 6 (`coding-{frontend,backend,data}`, `prose-{pt-pt,en}`, `baseline`) mas **todos com `path=""`** = não materializados. Zero `.gguf` no repo. |
| Implícito: `adaptive-learner` densifica a matriz com tráfego real | **Dead-wired** — importado só por `specialization-matrix.ts` + o próprio teste; fora de qualquer caminho de routing vivo. |

**O que ISTO significa para o Forge:** a graduação → adapter é **greenfield**. Mas **não** é
greenfield-no-ar — assenta numa fundação real (§1). O primeiro degrau ($0, sem GPU) é a **curadoria**;
o treino vem depois e **corre sempre na 4090 do Paulo, nunca no CC** (invariante de `train_lora.py:7`).

---

## 1 · O que já existe (reusar 100% — não é greenfield onde diz que não é)

| Peça | Ficheiro | Estado |
|---|---|---|
| **Trainer QLoRA real** | `scripts/train_lora.py` + `train_lora.sh` + `requirements-lora.txt` | ✅ BUILT. Unsloth + TRL + PEFT, 4-bit, early-stopping, seed 3407, r=16 → exporta GGUF Q4_K_M. **Run manual pelo Paulo; CC nunca executa.** |
| **Forge runtime** | `packages/cli/src/commands/forge.ts`, `packages/router/src/adapter/{adapter_manifest,validate}.ts`, `tools/router/adapter_selection.js` | ✅ BUILT. `mooter forge install/benchmark`; manifest v1 build/sign(HMAC)/validate; runtime honra assinatura ou cai para baseline. |
| **Registry dos 6 adapters** | `packages/synthesis/src/lora/adapter-registry.ts` | ✅ BUILT (metadata; `path=""`). classify.js continua dono do tier; adapter só enviesa **dentro** do tier. Autoswap só com `MOOTER_LORA_AUTOSWAP=1`. |
| **Harness A/B medido** | `frugal-council/packages/council/scripts/quality-eval-paired.ts` | ✅ BUILT (no worktree `frugal-council`, **não** em `main`). Verificáveis por execução determinística; abertos por juiz cego cross-vendor; length-neutral; Wilson CI. Mede **council-vs-single** — falta cablar arms **adapter-vs-base**. |
| **Allocator overclock** | `packages/overclock-moo/{allocator,job-catalogue,runner}` | ✅ BUILT (Fase 1, `85e238a`). Knapsack GPU, asymmetry-safe. **Sem kind de treino** — `ASYMMETRY_SAFE_KINDS` rejeita qualquer job não-catalogado. |
| **Distill → skill** | `packages/synthesis/src/distill/*` | ✅ BUILT. Determinístico, produz `.skill.md`. **Não é o Forge** — é o Eixo-3 clássico (features, não pesos). |
| **Golden de tier-safety** | `tools/router/safety_seeds.json` | ✅ BUILT, mas é um golden de **floors de tier**, não de **capacidade**. Não serve AF-01. |
| **Stub honesto do trainer de tarefa** | `packages/synthesis/src/pastor/adapter-trainer-stub.ts` | ⚠️ STUB explícito. `trainStatus()` lê um JSON; **nunca treina**. |

**Greenfield (o que o Forge tem de construir):** ledger de pares `measured-com-ganho` · extractor
curadoria → JSONL · medição real de qualidade adapter-vs-base · DoRA/OSFT/continual · kind de job de
treino no allocator · shadow mode + gate por-slice + revogação + kill-switch · Golden Set de 2 camadas
+ held-out de generalização · AF-16/10/11/12/03/06.

---

## 2 · Stack SOTA confirmado (mid-2026 · `web_search` 2026-07-02 — o campo muda em <30d)

> ⚠️ O CC re-confirma versões **no momento do build** — abaixo é o estado a 2026-07-02.

| Componente | Versão | Fonte | Nota |
|---|---|---|---|
| HF **PEFT** | 0.19.x | pypi.org/project/peft | Traz **`OSFConfig`** + `use_dora` + LoftQ. |
| transformers | 5.x | ai.google.dev/gemma QLoRA guide | 4.x é legado. |
| PyTorch | 2.7.x | (CUDA 12.6/12.8 wheels) | 2.5+ é o piso. |
| CUDA | 12.8 | bitsandbytes releases | 4090 = Ada sm_89. |
| **bitsandbytes** | 0.49.x | pypi.org/project/bitsandbytes | **Wheels nativos Windows (win_amd64)** — WSL2 já **não** é obrigatório. |
| **Unsloth** | 2026.6.9 | pypi.org/project/unsloth | Apache-2.0 core. 500+ modelos. |
| **Training Hub** (Red Hat) | v0.4.0 | developers.redhat.com | Backend Unsloth; primeira impl. OSFT open oficial. |

**Correcções às assunções do masterprompt (não as herdes):**
1. **OSFT NÃO vive só no Training Hub** — está **merged no HF PEFT** como `OSFConfig`/`OSFModel`,
   usável sem o Hub. → **preferir OSFT como base do treino contínuo** (é o que o masterprompt esperava).
2. **API do OSFT — a pegadilha crítica:** `effective_rank` é o rank **PRESERVADO (congelado)**;
   o rank **treinável = `min(W.shape) − effective_rank`** (o **inverso** do `r` do LoRA). Trocar isto
   treina quase nada, ou esquece tudo. Para uma *sequência* de tarefas, re-embrulhar entre tarefas
   (`base = model.unload(); get_peft_model(base, OSFConfig(effective_rank=r+k))`) faz crescer o
   subespaço preservado progressivamente.
3. **DoRA não é default sempre-ligado** — é um upgrade **alvo de +1-2%** (melhor em reasoning) com
   overhead de treino. Baseline = LoRA/PiSSA r=16-32; DoRA só quando se anda a caçar accuracy no eval.
4. **Windows não precisa de WSL2** para QLoRA (wheels nativos bnb 0.49.x). O `train_lora.py` já corre
   na 4090 do Paulo — mantém-se.
5. **NF4 continua o standard de treino** no 4090. MXFP4/NVFP4 são formatos **de inferência Blackwell** —
   o Ada não os executa nativamente; irrelevantes para o path de treino.
6. **LoRA sozinho ESQUECE** (§4). E **LoRA/QLoRA não é privacy-safe por default** — memoriza literais
   raros; o adapter **é** a superfície de exfiltração (AF-10/11).

**Modelo-base local recomendado (4090, mid-2026):**
- **Geral (reasoning/summarize):** **Qwen3-14B dense** (Apache-2.0) — cabe QLoRA folgado em 24 GB,
  treina mais limpo que MoE num só GPU, fica na família que o projeto já usa.
- **Coding:** **Qwen2.5-Coder-14B** (o `train_lora.py` usa hoje `qwen2.5-coder:7b` → caminho de menor
  atrito para F1) ou **Qwen3-Coder-30B-A3B** como alvo de *serving*.
- ⚠️ **Não citar** "Qwen 3.5 / 3.6 27B" — não confirmado em fonte oficial `qwenlm.github.io` (só blogs SEO).

---

## 3 · Tese

A GPU ociosa não só *executa* mão-de-obra — **forja o próprio cérebro-local**. Cada par
`(contexto → resposta que PROVOU ganho medido)` é um exemplo de treino; a 4090 destila-os em adapters
que tornam os moos e o routing host-side mais fortes a cada noite. O router aprende a servir-te melhor
sem te custar um token. **O gargalo não é a GPU — é a tua atenção** (herda a tese da Fleet): o Forge
produz **1 adapter provado** de cada vez, com recibo, não 10 por adivinhar.

---

## 4 · Anti-esquecimento-catastrófico (o risco nº1 — SOTA 2026: LoRA sozinho NÃO chega)

Consenso 2025-2026: LoRA **esquece** sob treino sequencial. Escada de mitigação, do mais barato ao
estruturalmente mais forte:

1. **OSFT (preferido — by construction).** SVD divide cada peso num subespaço de alto-rank **congelado**
   (conhecimento antigo) + baixo-rank **treinável**; gradientes projectados **ortogonais** às direcções
   congeladas. Sem params extra, sem gradientes passados guardados. Reporta esquecimento "quase
   negligenciável" preservando instruction-following/safety (arXiv:2504.07097). **É a base default do
   treino contínuo do Forge.**
2. **Replay buffer.** Cada treino mistura exemplos do **Golden Set congelado** + amostras históricas
   diversas — não só os pares recentes. Baseline fiável, complementa o OSFT.
3. **Merge-before-Forget** (arXiv:2512.23017, Dez 2025): init de base ortogonal + escala time-aware que
   **funde** continuamente cada LoRA nova numa LoRA unificada — memória constante no nº de tarefas.
   Preferir **fundir** o adapter novo no incumbente a re-treinar do zero.
4. **Held-out duplo:** validar contra (a) teste **de domínio** (melhorou na tarefa?) **e** (b) teste
   **de generalização** (não regrediu no geral?). Falha em qualquer um → adapter rejeitado.
5. **Baseline congelado:** treina-se sempre a partir de um checkpoint estável marcado, nunca sobre um
   estado já-derivado por outro treino não-validado (evita drift composto — o "salame" aplicado a pesos).

---

## 5 · O pipeline (5 fases · cada uma um evento no Ledger)

Cada fase emite eventos tipados no Ledger append-only (reusa `handoff-journal.js` + os kinds novos que a
Fleet F1 adiciona: `proposal|gate|apply|measure|incident`). **Se a fase anterior não deixou o seu
evento, a seguinte pára** (groundedness mecânica — H7).

### Fase 1 · Curadoria (mão-de-obra $0, sem GPU) — **o primeiro degrau executável**
- Extrai do Ledger os pares `measured-com-ganho`; **JAMAIS `approved`, jamais a própria saída** (§6, AF-02).
- Dedupe semântico (embedding local); **split por origem/tempo ANTES do dedupe** (AF-19 — held-out
  temporal mede generalização real, não interpolação memorizada); **diversidade forçada** (não
  sobre-representar a tarefa da semana).
- Proveniência: que event-ids, que ganho medido, que harness. **Auto-geração marcada e rejeitada** (AF-02/03).
- **Scrub de PII/secrets ANTES do treino** (AF-10) — par com secret não-redigível é **excluído**.
- **Output:** um `lora_train.jsonl` no formato que `scripts/train_lora.py` já consome (`{prompt,
  completion, score}`), mas **derivado do Ledger**, não do self-audit corpus.
- **Ponte de arranque (F1 sem measured-pairs ainda):** enquanto o ledger de `measured` não tem massa, a
  curadoria corre sobre `audit/lora_train.jsonl` (560 pares reais já pontuados) **como dry-run de
  pipeline** — prova curadoria+split+diversidade $0 sem GPU, sem provar ainda ganho-medido.

### Fase 2 · Treino (overclock, $0)
- O allocator agenda **OSFT+QLoRA** (DoRA opcional, alvo) na GPU ociosa — **asymmetry-safe: preempta o
  trabalho interactivo do Paulo** (herda a preempção foreground da Fleet). **Novo kind de job** no
  `job-catalogue` (greenfield) — um job **longo** (horas), o oposto dos jobs curtos actuais → precisa de
  checkpoint/resume e de sair da lista `ASYMMETRY_SAFE_KINDS` sem quebrar o rejeitador (decisão aberta #2).
- Unsloth (Training Hub v0.4.0 para OSFT). Regista GPU-min, hiperparâmetros, **hash do dataset**, **kWh**.
- **CC nunca dispara o treino** — prepara o comando; o Paulo corre-o na 4090 (invariante `train_lora.py`).

### Fase 3 · Anti-forgetting
- Replay buffer (Golden congelado + históricos diversos) + merge-before-forget + held-out duplo (§4).
- Produz um adapter **candidato** com manifesto (§6, AF-06).

### Fase 4 · Gate (NUNCA auto-promove)
- **Shadow mode:** o candidato corre em paralelo ao incumbente sobre tráfego real, **sem servir** —
  compara decisões/qualidade a frio.
- **Suite adversarial + Golden Set + A/B por-slice** (AF-08/05): ganho **medido**, não opinião.
  ✅ **BUILT** — `scripts/forge_eval.mjs` (+test, 10/10): arms **base vs candidate**, verificáveis
  graduados deterministicamente, abertos por juiz cego pairwise (ambas as ordens, cross-vendor),
  Wilson CI, **gate por-slice** (falha se QUALQUER capacidade regride >ε). Standalone (reusa a
  metodologia do council; **não** modifica `quality-eval-paired.ts` — decisão aberta #4 fica em aberto).
  **Null-calibration ao vivo ($0, Ollama)** provou o harness não-enviesado: base==candidate → `delta=0`,
  gate PASS. Falta só um adapter **real** para medir (depende do Ledger `measured` + treino na 4090).
- **Gate humano** na troca do default de routing (irreversível — H1: 1 item, cool-down, a tua razão
  **antes** do veredito, ≤N/dia).

### Fase 5 · Serving + revogação
- Hot-swap do adapter quantizado (reusa `adapter_selection.js` — honra assinatura ou baseline); janela
  de observação; **`measured-revocation`** se o ganho se inverte → rollback automático + o par volta ao
  dataset como **sinal negativo**.
- **Kill-switch global (AF-18):** flag que faz o serving ignorar TODOS os adapters → base + `classify.js`
  (frozen, seguro por construção). Um comando, imediato, reversível.

---

## 6 · 🔒 Guardrails inquebráveis (Fleet H1-H8 + 3 específicos + AF-01…AF-19)

### Os 3 específicos deste pilar
1. **`classify.js` FROZEN nunca é alvo de treino.** Sha `427d8c0b…4bc48f`, CI-enforced. Os adapters
   melhoram os **moos** (rollup, review, audit, summarize) e as **camadas host-side**
   (specialization-matrix, adaptive-learner, Project-LoRA/Pack-LoRA) — **nunca o core determinístico**.
2. **Treina só de `measured-com-ganho`** (H2), jamais de `approved` nem da própria saída (anti
   model-collapse). Proveniência marcada; auto-geração **rejeitada a nível de pipeline**.
3. **Nenhum adapter serve sem Golden Set (AF-01) + gate.** Trocar o default de routing é **irreversível
   → gate humano com fricção assimétrica (H1)**. `measured-revocation` → rollback automático.

### AF-01…AF-19 (red-team adversarial · cada uma obrigatória)

- **AF-16 · Anti-poisoning na entrada (o mais grave).** O Ledger é alimentado por sessões reais; uma que
  tocou conteúdo hostil (prompt-injection, MCP/repo comprometido) pode inserir um par envenenado que vira
  **backdoor persistente nos pesos**, sobrevive a reinícios, propaga por merge. Defesa: **quarentena de
  pares anómalos** (outliers de embedding, ganho suspeito, marcadores de injection) · **influence-filtering**
  (cluster que degrada a suite adversarial é excluído, não fundido) · **provenance-trust** (pares de
  sessões que tocaram fontes externas/MCP-terceiros nunca entram sozinhos como ganho).
- **AF-08 + AF-05 · Suite adversarial + gate POR-SLICE, não por média.** Shadow mode só vê tráfego real
  (99% benigno) → cego ao 1% crítico. Um corpus curado de entradas perigosas/raras (injection, `rm -rf`,
  edge-cases de segurança, ambíguos-onde-recusar) corre **sempre** no gate. **Gate por pior-caso (P99):**
  falha se **QUALQUER** slice regride >ε (não a média). Replay **estratificado por capacidade** com quota
  mínima para as raras-críticas (recusa de comandos perigosos, reversibilidade).
- **AF-10 + AF-11 · O fosso "local=privado" tinha buracos.** QLoRA **memoriza literais raros** (secrets,
  chaves, IP) — StolenLoRA extrai adapters a 96.6% em 10k queries; o adapter **é** o artefacto
  exfiltrável. Defesa: **scrub de PII/secrets na curadoria ANTES do treino** · **canary de memorização no
  gate** (injectar canários ~0.25% do dataset, tentar extrair; regurgita acima do limiar → rejeitado) ·
  **Ledger cifrado em repouso, fora de iCloud/OneDrive** · **adapter PII-tainted NUNCA gradua para
  dataset partilhável**. Cross-project leakage = decisão de routing, não acidente.
- **AF-01 · Golden Set em DUAS camadas.** (1) **Core-frozen**: ~50-100 exemplos de capacidades
  **atemporais** (raciocínio, formato, não-alucinar, honestidade, recusa) — imutável, gate **DURO**.
  (2) **Domain-rolling**: amostra dos últimos N dias com decay exponencial (τ≈60d), re-amostrada
  semanalmente, gate **SOFT**. Promoção assimétrica: serve só se `core ≥ baseline−ε` **E**
  `domain-rolling > incumbente`. **Detetor de drift** (centroid/KL) → alerta "o teu golden já não
  representa o teu uso, re-ancorar?" (evento versionado, reversível). Golden = artefacto **hasheado e
  versionado**. *(Hoje só existe `safety_seeds.json` = tier-safety; ambas as camadas são greenfield.)*
- **AF-12 + AF-17 · "$0" honesto + saber quando NÃO aprender.** O treino é **horas de 4090 a ~400W** =
  energia real + custo de oportunidade. Contabilizar `kWh×€ + GPU-opportunity` no **mesmo ledger de
  poupança**: ganho de um adapter = `poupança_serving − custo_treino`; **payback gate** (não re-treinar
  se não amortiza). **Detetor de plateau**: N rondas sem net-positive → **hibernação** desse alvo até
  haver massa nova. "Learns forever" nunca vira "burns forever" com o dashboard a reportar poupança.
- **AF-03 · Fechar o loop do avaliador.** O A/B/council **exclui a linhagem do treinando** (merge-tree
  registada). Ganho medido por **sinal exógeno** (testes que JÁ existiam, execução real, correcção
  diferida do dono nas 48h = sinal negativo). **Proibido como ganho:** brevidade pura, aceitação imediata
  não-cega. A/B **cego**.
- **AF-06 · Merge não é grátis.** Budget de merges (re-baseline do zero após K≈8, com replay acumulado) ·
  **behavioral-diff por slice** como o "diff legível" do adapter (`v8: +6% rollup, −30% recusa-perigo`) ·
  **multi-adapter em vez de merge quando os objectivos conflituam** (verboso-docs vs conciso-código →
  deixa o specialization-matrix escolher, não fundir). **Manifesto por adapter:**
  `{base@sha, quant, dataset@sha, hparams, merge-tree, golden@sha, slice-scores, canary, energy, provenance}`.
- **AF-18 · Kill-switch global** (§5 Fase 5). O circuit-breaker do Forge.
- **AF-19 · Split por origem/tempo, não por par** — dedupe **depois** do split, dentro de cada lado.

---

## 7 · O que cada adapter melhora (alvos, por prioridade)

Reusa o `adapter-registry.ts` (6 slots já definidos, `path=""`). Ordem = mais seguro primeiro.

1. **Moos de mão-de-obra (F1 — o mais seguro):** rollup/handoff-summary, review de 1º-passe, audit,
   compressão de contexto. Ficam melhores nas tarefas Mooter reais, $0. **O `train_lora.py` já aponta
   aqui** (`mooter-pastor-v1` = summarizer). É o caminho de menor atrito para provar o pipeline ponta-a-ponta.
2. **Routing host-side (F2):** `specialization-matrix` / `adaptive-learner` aprendem os teus padrões de
   projecto. **Pré-requisito:** ligar o `adaptive-learner` (hoje dead-wired) ao caminho vivo primeiro.
3. **Project-LoRA / Pack-LoRA (F3):** especialização por repo/pack (Eixo 3, ADR 015) — o Mooter "conhece"
   o teu código. Um de cada vez, cada um só depois do anterior provar hit-rate.
4. **Prompt-coach (F3):** sugere reformulações mais baratas (advisory, **nunca reescreve intenção** —
   herda o loop #16 da Fleet).

**NUNCA graduam a adapter** (H3, herdado): as raízes-de-confiança **Eval #14** e **Segurança #2** — um
juiz não pode virar um LoRA treinado a concordar consigo mesmo.

---

## 8 · Metodologia SOTA 2026 (usar em vez das defesas ingénuas onde superior)

- **OSFT** (Red Hat, HF PEFT `OSFConfig`) — base default do treino contínuo (§2.1, §4.1). Estruturalmente
  melhor contra forgetting que replay+merge sozinhos.
- **Training Hub v0.4.0** (backend Unsloth) — ~70% menos VRAM, ~2× mais rápido; a via oficial para OSFT.
- **Multi-LoRA concurrent** (Trajectory C-LoRA / SkyRL, UC Berkeley) — 2.81× throughput de *experiências*.
  ⚠️ O ganho é sobretudo em **inferência** multi-LoRA (vLLM SGMV); o treino continua single-adapter e a
  latência/step sobe (N=8 → ~2.6×). Encaixa no allocator para **saturar a 4090 com vários alvos**, não
  para acelerar um só.
- **High-rank LoRA (r=512)** para continual pretraining quando o ganho justifica (−70% perplexity
  in-domain) — reservar para o caso raro em que o adapter não chega.

---

## 9 · Riscos → mitigação mecânica

| Risco | Mitigação |
|---|---|
| Esquecimento catastrófico | OSFT by-construction + replay + held-out duplo + merge-before-forget (§4) |
| **Model collapse** (treinar da própria saída) | só `measured-com-ganho`; auto-geração marcada e rejeitada (AF-02/03) |
| Overfitting a prompts recentes | diversidade forçada + held-out de generalização + early-stopping (já em `train_lora.py`) |
| Viés (adapter propõe com autoridade) | treina de `measured` não `approved` (H2) + auditoria do dataset |
| Adapter mau em prod | shadow mode + golden set por-slice + rollback (`measured-revocation`) |
| **Poisoning na entrada** | quarentena + influence-filtering + provenance-trust (AF-16) |
| **Exfiltração via pesos** | scrub PII + canary de memorização + Ledger cifrado (AF-10/11) |
| "$0" que vira "burns forever" | payback gate + detetor de plateau + kWh no ledger de poupança (AF-12/17) |
| Privacidade | os pares são teus, o treino é local, nada sai da máquina (**o fosso local-first**) |

---

## 10 · Arranque FASEADO (prova antes de escalar)

| Fase | Entrega | Prova (gate) | BUILT / greenfield |
|---|---|---|---|
| **F1** | **UM adapter, no alvo mais seguro** (moo de mão-de-obra, ex.: rollup/summary = `mooter-pastor-v1`). Curadoria → OSFT+QLoRA → anti-forgetting → shadow → golden set → **ganho medido** → serve. | Ganho de **domínio** medido **sem** regressão de generalização, em shadow mode, **antes** de servir. Ledger mostra cada fase. | trainer ✅ · forge ✅ · **curadoria-do-Ledger / OSFT / golden 2-camadas / arms adapter-vs-base = greenfield** |
| **F2** | Routing host-side (`specialization-matrix`) com o mesmo gate. | hit-rate provado | pré-requisito: **ligar `adaptive-learner`** (dead-wired) |
| **F3** | Project/Pack-LoRA + prompt-coach, um de cada vez. | cada um só depois do anterior provar hit-rate | greenfield |
| **→ Graduação** | Um loop da Fleet que estabiliza vira dataset deste Forge. | é o **mesmo motor** — os pares `measured` da Fleet alimentam a curadoria (§5 F1). | depende da Fleet F1 (ledger de `measured`) |

**Ordem de dependências crítica:** o Forge F1 precisa de pares `measured-com-ganho`, que **só a Fleet F1
produz** (o FSM `drafted→…→measured` + os kinds `proposal|gate|apply|measure|incident` são greenfield na
Fleet). Até lá, o Forge corre a **curadoria em dry-run** sobre `audit/lora_train.jsonl` (§5 F1 ponte) —
prova o pipeline $0/sem-GPU, sem fingir ganho-medido.

---

## 11 · Decisões abertas (precisam do Paulo — não decido sozinho)

1. **Aterrar este doc em `main`** (worktree docs-only, aditivo) + emitir `kind:outcome` no Ledger — fecha F0.
2. **Kind de job de treino no allocator:** um job **longo** (horas) viola o pressuposto de jobs curtos
   asymmetry-safe. Precisa de checkpoint/resume + preempção que **suspende** (não mata) o treino. Desenho a validar.
3. **Base model para F1:** manter `qwen2.5-coder:7b` (menor atrito, o trainer já aponta) ou saltar já para
   **Qwen3-14B dense**? Trade-off: atrito vs qualidade/headroom.
4. **Council em `main`:** o gate F4 foi resolvido com um harness **standalone** (`forge_eval.mjs`, reusa a
   metodologia) → o merge do `quality-eval-paired.ts` do worktree `frugal-council` deixa de ser bloqueante.
   Fica em aberto **só** se quiseres unificar os dois harnesses num só (dedupe de metodologia).
5. **OSFT vs LoRA para F1:** OSFT é a base default do design, mas o `train_lora.py` actual é LoRA r=16.
   F1 arranca em LoRA (prova o loop) e migra para OSFT em F1.1, ou já nasce OSFT?

---

## 12 · Gate (pára e reporta — a disciplina que o Forge exige de si próprio)

- **$0 provado:** todo o treino é GPU local (Ollama/Unsloth); **zero cloud** no treino. `classify.js` sha
  intacta (nunca alvo). — ✅ por construção do design.
- **Demo real (1 adapter treinado dos pares reais do Ledger, ganho medido + zero regressão, shadow):** —
  ⛔ **BLOQUEADO por 2 pré-requisitos**, honestamente:
  1. **Não há pares `measured-com-ganho` no Ledger** — o FSM que os produz é greenfield na Fleet F1.
     Construir o extractor contra um schema inexistente = "construir no ar" (invariante Fleet). Até lá, a
     prova possível é a **curadoria em dry-run** sobre `audit/lora_train.jsonl` (§5 F1 ponte).
  2. **CC nunca executa treino GPU** — é o passo manual do Paulo na 4090 (`train_lora.py:7`).
- **Fundação F1 executável — ✅ BUILT ($0, sem GPU, sem cloud):**
  1. **Extractor de curadoria** — `scripts/forge_curate.mjs` (+test, 8/8). Dry-run real: 560→212→172/40.
  2. **Golden Set de 2 camadas (AF-01)** — `scripts/forge_golden.mjs` + `audit/forge/golden/` (hash-gate).
  3. **Gate F4 A/B por-slice** — `scripts/forge_eval.mjs` (+test, 10/10). Null-calibration ao vivo: `delta=0`.
- **`git add` selectivo · sem push de default de routing sem OK.** Tudo aditivo; `classify.js` intacta.
- **O que falta para a "demo real":** um adapter **treinado** — bloqueado por (a) o Ledger `measured`
  (greenfield na Fleet F1) e (b) treino manual na 4090. O `forge_curate` comuta para `--mode=measured`
  e o `forge_eval` troca `--candidate` do modelo-base para o adapter, sem mais código.

---

## Fontes (SOTA 2026 — CC re-verifica antes de fixar)
- **OSFT:** arXiv:2504.07097 · HF PEFT `OSFConfig` (huggingface.co/docs/peft/main/package_reference/osf) ·
  Red Hat Training Hub v0.4.0 (github.com/Red-Hat-AI-Innovation-Team/training_hub).
- **Merge-before-Forget:** arXiv:2512.23017 (Qiao & Mahdavi, Penn State, Dez 2025).
- **Memorização/canary:** arXiv:2506.20856 (LoRA leaner leakage) · StolenLoRA arXiv:2509.23594.
- **Unsloth** 2026.6.9 (pypi) · **bitsandbytes** 0.49.x nativo Windows · **PEFT** 0.19.x · **DoRA** (PEFT `use_dora`).
- **Multi-LoRA:** Trajectory C-LoRA / NovaSky-AI SkyRL (2.81× throughput).
- **Qwen3** (qwenlm.github.io/blog/qwen3 — dense 0.6/1.7/4/8/14/32B, MoE 30B-A3B/235B-A22B).
</content>
</invoke>
