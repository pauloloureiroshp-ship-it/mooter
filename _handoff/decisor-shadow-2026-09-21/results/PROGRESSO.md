# PROGRESSO — decisor-shadow F1

- 2026-09-21T09:23:46Z · Cowork: pacote escrito, MP1 pronto. À espera do Claude Code.

---

## F1a — Pré-registo

- **2026-09-21T09:30:47Z (06:30 BRT)** · CC: arranque. `git status --porcelain` do pacote e dos bats:
  - `_handoff/decisor-shadow-2026-09-21/` → 12 ficheiros `??` (não versionados), incluindo `results/00-baseline.json` e `results/PROGRESSO.md` já lá do Cowork.
  - os 6 `RUN-DECISOR-*.bat` da raiz saem como **`!!` (ignorados)**, não `??`. Regra:
    `.gitignore:196 RUN-*.bat`. Pré-existente e deliberada (só 12 `.bat` versionados no repo,
    nenhum deles `RUN-*` na raiz). `protocol.json` lido, **não alterado**.
- **2026-09-21T09:31:12Z (06:31 BRT)** · **Commit de pré-registo: `1416884dfd15224daebd8e96ad2b8550e0bf80b4`**
  (`chore(decisor-shadow): pré-registo F1 — protocolo, harness, bats (sem código do motor)`).
  11 ficheiros, zero de `tools/router/`. Sha anotado em `README.md`.
  - **Desvio ao MP1, declarado:** os `RUN-DECISOR-*.bat` **não** entraram. Entrariam só com
    `git add -f`, o que quebrava a regra `RUN-*.bat` do `.gitignore` para ganhar nada — o que o
    pré-registo tem de ancorar é `protocol.json` + harness, e esses entraram todos.
  - Acrescentado ao commit um `.gitignore` do pacote (antecipa o MP1 §F1c passo 5): barra
    `corpus-40-unredacted.json`, `corpus-40b.json`, `labels-40b.json`, `A-40b.json`,
    `C-*.json`, `D-*.json` e `.venv-laya/`. Guarda a montante, antes de existir ficheiro com
    prompts reais dentro.

---

## F1b — Baseline + probe

- **2026-09-21T09:31:38Z (06:31 BRT)** · `node 00-baseline.mjs` (1.ª corrida).
  **`sha_matches_protocol: true`** — `427d8c0b…`, igual ao protocolo. Não há motivo de paragem.
  - `gold-84` (TREINO da regra): **81/84 = 0,964**, p50 in-process **1,96 ms**.
  - `validation-set` (TREINO): **59/70 = 0,843**, p50 **1,97 ms**.
  - Referência P1 copiada, não re-medida: A-key acc40 **0,350** / acc63 0,222 · A-nokey acc40
    0,325 · B juiz acc40 **0,525** / acc63 0,698.
  - **`decisions_log: error` — o bloco da ECE proxy caiu inteiro.** Causa medida:
    `decisions.log` tem **14 linhas literalmente `null`** em 4 467; `JSON.parse("null")` passa
    pelo `try` e devolve `null`, e o `e.tier` seguinte atira. 14 linhas matavam a leitura das
    outras 4 453.
- **2026-09-21T09:32Z** · **Correcção de harness nº1** (pós-pré-registo, declarada):
  `00-baseline.mjs` ganha `if (e === null || typeof e !== 'object') { null_lines++; continue; }`
  e passa a publicar `null_lines`. Não move nenhum gate — a ECE que conta é a dos braços contra
  `labels-63`, e esta é proxy por definição do próprio script. 2.ª corrida do baseline (o
  baseline é determinístico, lê ficheiros; não é braço, não consome a stop rule).
  - Resultado: 4 467 linhas · 14 `null` · 690 `executed` · 676 em bins.
  - **ECE proxy do ledger = `n/d`, não 0,899.** O número 0,899 sai, mas é artefacto: os 676
    `executed` caem **todos** no bin 0,8–1,0 e o `outcome` é `deferred` **675×**, `ok` **1×**,
    ausente 14×. `0,899 ≈ |0,0015 − 0,9|` está a medir «o campo quase nunca é escrito», não
    calibração. Registado como **n/d com a razão**, nunca como «ECE do ledger = 0,90».
  - Achado colateral (fora do âmbito deste MP, `tools/router/` não se toca): algo em
    `tools/router/` escreve `null` no `decisions.log`, e `outcome=ok` é escrito 1× em 690.
- **2026-09-21T09:32:37Z** · `node 01-probe-ollama.mjs --model qwen2.5:3b` (script como
  pré-registado) → **falso negativo confirmado**: `version_error`/`tags_error`/`probe_error` =
  `Failed to parse URL from 127.0.0.1:11434/…`, veredicto «SEM logprobs», **com o Ollama 0.34.2
  vivo a responder** a `curl`. Causa: `OLLAMA_HOST` desta máquina é `127.0.0.1:11434` — **sem
  esquema**, que é o formato canónico do Ollama — e o script fazia
  `process.env.OLLAMA_HOST || 'http://localhost:11434'`. É a mordida já registada no
  `CLAUDE.md` (entrada de 2026-09-01) a repetir-se num harness novo.
  - Sem isto, o braço D corria **inteiro em amostragem** e reprovava o gate de calibração por
    um erro de string.
- **2026-09-21T09:33Z** · **Correcção de harness nº2** (declarada): `lib-common.mjs` exporta
  `OLLAMA_HOST` vindo de `ollamaHostFromEnv()` — **importado por leitura** de
  `tools/router/ollama-host.js`, o normalizador canónico. `tools/router/` **não é alterado**
  (só lido); evita criar a 8.ª verdade sobre a mesma pergunta. `01-probe` e `02-arm-D` passam a
  usá-lo.
- **2026-09-21T09:33:04Z** · probe repetido → **`logprobs_supported: true`**.
  - Ollama **0.34.2**; probe **32 ms**; resposta `A` com `top_logprobs` reais
    (`A` logprob −0,00005 · `B` −12,28).
  - **Veredicto: «D pode ler probabilidade real (logit-head)»** — o braço D **não** cai para
    amostragem.
  - Modelos instalados (10): `qwen2.5:3b` (1,9 GB) · `qwen2.5-coder:14b` (9,0 GB) ·
    `qwen2.5-coder:7b` · `qwen3:30b` · `qwen3.6:27b` · `qwen3.6:35b-a3b` · `gemma3:12b` ·
    `gemma4:e4b` · `deepseek-r1:7b` · `nomic-embed-text`.
  - **`qwen2.5:14b` — o modelo que o MP1 §7-8 nomeia — NÃO está instalado.** O 14b desta
    máquina é `qwen2.5-coder:14b`, que é **exactamente o juiz do braço B do P1**. Substituição
    registada, não silenciosa: é também a melhor escolha científica (D e B passam a partilhar a
    base, isolando «cabeça tipada + logits» de «qualidade do modelo»). Não se descarregou nada
    — puxar 9 GB não estava autorizado e não era preciso.

---

## F1c — Corpus (bloqueio B1) · **DESBLOQUEADO pela via 5, sem reamostragem**

- **2026-09-21T09:35Z** · Varrimento das 4 localizações do MP1 §5 (delegado a um agente de
  leitura, em paralelo; resultado re-verificado por mim antes de usar).
  - `results/bruto-resgatado/` — **não serve**: o `LEIA-ME.md` diz que o resgatado são
    `decisions-home-isolado-*.log` (registos de decisão) e `nettap-*.jsonl` (eventos de rede).
    Nenhum dos dois tipos alguma vez teve texto de prompt.
  - `~/.mooter/` e `~/.claude/tools/router/` — zero ficheiros `corpus*`, zero `sept-transcripts`.
  - `~/.claude/tools/router/decisions.log` — **não serve como fonte**: não tem campo `prompt`.
    Tem `prompt_preview`, **limitado a 80 chars** (p50 37; 593 de 1 514 truncados). Reamostrar
    daí dava prompts cortados a 80 chars — outra tarefa, não a do P1 (os itens do P1 têm
    `chars:222` e afins).
- **2026-09-21T09:36Z** · **Encontrado não-redigido no vault** (localização 4):
  `~/paulo-vault/20-mooter/artifacts/provas-v1-2026-09-09/P1-decidir-custa-zero/corpus-63.json`
  — espelho pré-redacção do pacote inteiro, de 2026-09-09 21:18 (a redacção correu a 09-10 09:39).
  63 itens, **0 redigidos**.
- **Verificação (corrida por mim, não aceite do agente):**
  - por item: `sha256(prompt)[0..12]` **e** `prompt.length` contra os marcadores
    `[[redigido sha256:… chars:…]]` do `corpus-63.json` publicado → **40/40**, sem `trim`, sem
    normalizar CRLF. Zero falhas.
  - **e o ficheiro inteiro:** `sha256(corpus-63.json do vault)` =
    **`fba9ac4898cfe449f0bab66114337e9aac0ff9e0fc6dd592c57fe768dba9d40e`** — que é
    **exactamente** o hash que o `protocol.json` do P1 pré-registou para `corpus-63.json`.
    Não é «um corpus que bate item a item»: é **o** ficheiro em que o P1 correu, byte a byte.
    Isto legitima o McNemar contra as linhas `A-nokey.json` do P1 — mesmos ids, mesmos itens.
- **Gravado:** `results/corpus-40-unredacted.json` (40 itens n01–n40, com `_sha256_12`,
  `_chars` e `_matches_redaction_marker` por item). **NÃO commitado** — confirmado por
  `git check-ignore` (regra `.gitignore` linha 3 do pacote).
- **O MP1 §6 (reamostrar 40b + rotular cego com o Codex) NÃO foi executado — e não devia ser.**
  É o ramo do «se não existir». Existe, e é o original. Reamostrar teria criado um corpus
  diferente, com rótulos novos, e destruído a comparabilidade com os 0,35/0,525 do P1.
- **Achado colateral sobre o registo do P1** (para o adversário, não é deste MP corrigir): dos
  3 hashes de corpus que o `protocol.json` do P1 pré-registou, o `labels-63.json` no `_handoff`
  **bate** (`0bc6edbb…`), mas `corpus-63.json` (`8670e3a8…` vs `fba9ac48…`) e `corpus-40.json`
  (`b5cbc743…` vs `761d5bb3…`) **não batem** — foram redigidos depois do pré-registo. Consequência
  medida: o `amend.mjs` calcula `C2_redaction` lendo o `corpus-40.json` **já redigido**, e
  publica `{"changed":0,"of":40}`. Esse 0 é vazio — procura marcadores `<owner>`/`<email>` num
  ficheiro onde o texto todo já foi substituído por `[[redigido …]]`. Mesma classe do ECE proxy
  acima: o instrumento mediu um campo que não estava lá.

---

## F1d — Shadow · braço D (logit-head)

- **2026-09-21T09:40Z** · Modelos aquecidos (MP1 §7). `ollama ps`: `qwen2.5:3b` (2,1 GB) e
  `qwen2.5-coder:14b` (9,1 GB), ambos **100% GPU**. VRAM 16 124 / 23 028 MiB na RTX 4090 — os
  dois cabem **ao lado um do outro**, não foi preciso serializar.
- **2026-09-21T09:41–09:48Z** · `node 02-arm-D-logit.mjs` — **4 corridas, uma por
  (modelo × corpus), zero repetições.** `logprobs_used: true` nas quatro (probabilidade real,
  não amostragem). Nenhuma falhou; a re-corrida única que a stop rule permite **não foi gasta**.

| Braço | Modelo | Corpus | acc | IC95 | ECE | p50 (4 perguntas) | p50 (só tier) | abstém |
|---|---|---|---|---|---|---|---|---|
| A regra | classify.js `427d8c0b` | **40 reais** | **0,350** (A-key) / 0,325 (A-nokey) | [0,22–0,51] | n/d | ~0,002 in-proc | — | 0 |
| B juiz | qwen2.5-coder:14b | **40 reais** | **0,525** | [0,38–0,67] | n/d | n/d | — | 0 |
| **D** | qwen2.5:3b | **40 reais** | **0,400** (16/40) | [0,263–0,554] | **0,462** | 97,1 ms | 24,8 ms | 0 |
| **D** | **qwen2.5-coder:14b** | **40 reais** | **0,600** (24/40) | [0,446–0,737] | **0,110** | 165,0 ms | 42,3 ms | 3 |
| D | qwen2.5:3b | gold-84 *(TREINO)* | 0,512 (43/84) | [0,407–0,616] | 0,317 | 94,6 ms | 23,9 ms | 1 |
| D | qwen2.5-coder:14b | gold-84 *(TREINO)* | 0,690 (58/84) | [0,585–0,779] | 0,160 | 164,6 ms | 42,1 ms | 0 |

- **O número que conta (acc40, corpus real, fora do treino): D/14b = 0,600.** Bate a regra
  (0,350) e bate o juiz (0,525) — **com o mesmo modelo base do juiz**. A diferença não é o
  modelo, é a forma de perguntar: 4 perguntas tipadas de 1 letra com a probabilidade lida dos
  logits, em vez de texto livre. 165 ms, $0, zero egress.
- **Mas o gate de calibração falha:** ECE **0,110 > 0,10**. Falha por 0,010 — falha à mesma.
- Latência: **165 ms < 250 ms** ✅ (e 42 ms se só se fizer a pergunta do tier).
- **Leitura honesta das matrizes de confusão — os dois braços erram em direcções opostas:**
  - **3b (0,400): não serve, apesar de «bater a regra».** Prevê **T3 em 27 dos 40** (68 %)
    quando só 8 o são, e **nunca** prevê T1. A acurácia vem de escalar quase tudo. Num sistema
    que mede poupança, um decisor que manda 68 % para o topo é uma catástrofe de custo — é
    literalmente o inverso do viés do default barato, e igualmente inaceitável. ECE 0,462
    confirma: confiante e errado.
  - **14b (0,600): erra para baixo.** Prevê T0 19× (rótulo: 11) e T2 8× (rótulo: 18). Desce
    **10 dos 18 T2** (5 para T0, 5 para T1) e **3 dos 8 T3** (2 para T0, 1 para T1). Poupa a
    mais e serve a menos. É o mesmo sentido do erro da regra (T2→T0 13× no P1), menos severo.
  - Ou seja: **nenhum dos dois está pronto para decidir sozinho.** O 0,600 é o melhor número
    local já medido neste corpus, e ainda assim sub-roteia 13 dos 40.

### F1d · braço C (Laya)

- **2026-09-21T09:49Z** · venv `.venv-laya` (Python 3.12.10) · `torch 2.6.0+cu124`,
  `cuda True`, **RTX 4090** detectada · `laya 0.3.4` (+ transformers 5.17, tokenizers 0.23).
- **Divergência de API corrigida** (o MP1 §9 prevê-a): o MP1 manda
  `--subfolder laya-typed-decisions`; isso atira
  `FileNotFoundError: Subfolder 'laya-typed-decisions' not found in 'convaiinnovations/laya'`.
  O nome verdadeiro, lido do `laya.DEFAULT_MODELS`, é **`typed-decisions`**. Corrigido **no
  argumento da linha de comando — o `03-arm-C-laya.py` não foi alterado em linha nenhuma**, o
  schema de saída muito menos. O resto da API bate certo com o que o script assumia
  (`laya.load(model, subfolder=…)`, `agent.predict(state, questions)`, `type`/`instructions`/`criteria`).
- **4 corridas, uma por (variante × corpus).** Nenhuma falhou.

| Braço | Variante | Corpus | acc | IC95 | ECE | p50 | abstém |
|---|---|---|---|---|---|---|---|
| C | laya zero-shot | **40 reais** | **0,400** | [0,263–0,554] | 0,316 | 28,3 ms | **40/40** |
| C | laya `typed-decisions` | **40 reais** | **0,225** | [0,123–0,375] | 0,160 | 28,4 ms | **40/40** |
| C | laya zero-shot | gold-84 *(TREINO)* | 0,238 | [0,160–0,339] | 0,156 | 24,7 ms | 84/84 |
| C | laya `typed-decisions` | gold-84 *(TREINO)* | 0,262 | [0,180–0,365] | 0,214 | 30,8 ms | 84/84 |

- **O braço C é degenerado, e o 0,400 é uma miragem.** Zero-shot prevê **T2 em 33 dos 40**
  (82 %); `typed-decisions` prevê **T3 em 33 dos 40**. E **abstém-se em 40/40 nos dois casos**:
  o `p_max` máximo em todo o corpus é **0,322**, abaixo do limiar de 0,4 — nunca tem confiança
  para decidir nada. A ECE baixa (0,160) não é calibração: é estar uniformemente pouco
  confiante e maioritariamente errado. O aviso do autor do Laya («zero-shot ≈ aleatório»)
  reproduz-se aqui e imprime-se.
- `p50` 28 ms é o único número bom do braço C — e não serve de nada, porque o que ele devolve
  depressa não tem informação.

### F1d · passo 10 — `04-analyse.mjs`

- **2026-09-21T09:50Z** · `results/04-analysis.md` e `04-analysis.json` escritos. Tabela abaixo.
- **Correcção de harness nº3 e nº4 no `04-analyse.mjs`** (declaradas, ambas para não publicar
  número falso):
  1. a linha «ECE proxy do ledger: 0,899» passa a imprimir **`n/d` com a razão** (o campo
     `outcome` é `deferred` em 675 de 676) em vez do artefacto;
  2. **acrescentada a linha do baseline constante**, lida do `analysis-extra.json` do P1 (não
     escrita à mão), porque sem ela a tabela deixa «bate a regra» passar por mérito.
- **A régua que faltava e muda a leitura de tudo: responder sempre `T2` acerta 18/40 = 0,450.**
  O critério pré-registado `acc40_min_to_beat_rule = 0,35` é a **regra**, não a régua. Contra
  0,450:
  - a **regra** (0,350 / 0,325) **perde para uma constante**;
  - **C zero-shot 0,400 — perde**; **C typed 0,225 — perde**; **D/3b 0,400 — perde**;
  - só o **juiz (0,525)** e o **D/14b (0,600)** ficam acima.
- **McNemar** (unilateral, contra **A-nokey**, que é o braço com predições por item; o 0,350 da
  referência é o A-key):
  - **D/14b: b=12, c=1, p=0,002** — ganha à regra em 12 itens, perde em 1. **Significativo.**
  - D/3b: b=10, c=7, **p=0,315** — **não significativo**. O «0,400 > 0,350» do 3b é ruído,
    exactamente como a matriz de confusão fazia suspeitar.
  - C zero-shot: b=14, c=11, **p=0,345** — não significativo. C typed: b=7, c=11, p=0,881.
- **Um só braço sobrevive a tudo: D com `qwen2.5-coder:14b`.** E mesmo esse **falha o gate de
  ECE** (0,110 > 0,10).

---

## F1e — Adversário e fecho

- **2026-09-21T09:52Z** · `codex exec -s danger-full-access` (codex-cli **0.153.4** — motor
  diferente do que produziu a análise). Entrada: `protocol.json` + `04-analysis.md` + o resumo
  de cada braço (summary, confusão, distribuição das previsões, bins). **Nenhum prompt real foi
  enviado** — só ids, contagens e métricas. Prompt exacto guardado em
  `results/adversary-prompt-sent.txt`, saída bruta em `results/adversary-codex-raw.txt`.
- **14 ataques. 10 ACEITES (2 em parte), 4 REFUTADOS.** Ledger completo, ataque a ataque, em
  **`results/adversary-codex-round1.md`**. Ele não aprovou — e apanhou um defeito real.
- **O ataque nº 5 estava certo e obrigou a uma emenda.** O adversário reparou que o `p_max` do
  braço C não podia ser probabilidade sobre 4 tiers (o máximo em 40 itens era 0,123; num argmax
  sobre 4 classes o máximo é sempre ≥ 0,25). Verificado no artefacto: o Laya devolve
  `probabilities` (soma 1) **e** `confidence` (outra quantidade), e o `03-arm-C-laya.py` tomou a
  segunda por `p_max`.
  - Corrigido por **`05-amend-C-pmax.mjs`**, recalculado **a partir do bruto em disco, com zero
    corridas novas** (a stop rule não foi tocada). C nos 40: ECE **0,316 → 0,136**, abstenções
    **40/40 → 5/40**. **A acurácia não muda** (o `choice` é o argmax das `probabilities`).
    Continua a falhar o gate e continua abaixo da régua `always_T2`.
- **Os três *p* que o adversário só conseguiu limitar, calculados exactos** (tenho o
  emparelhamento por item que ele não tinha; também sem corridas novas):

| Comparação (mesmos 40 itens, emparelhado) | acertos | b/c | p unilateral | Leitura |
|---|---|---|---|---|
| D/14b **vs regra A-key** | 24 vs 14 | 11/1 | **0,00317** | **bate a regra, significativo** |
| D/14b vs regra A-nokey | 24 vs 13 | 12/1 | 0,00171 | idem |
| D/14b **vs juiz B** | 24 vs 21 | 5/2 | **0,22656** | **NÃO bate o juiz** |
| D/14b **vs `always_T2`** | 24 vs 18 | 16/10 | **0,16347** | **NÃO bate uma constante** |

  O adversário previu 16/10 e p=0,16347 para a última linha **e acertou ao número**.
- **O que fica por afirmar** (lista completa no ficheiro do adversário): independência dos 40
  (`n` efectivo = **n/d**); que o decisor esteja *calibrado* (ler logprobs não é calibrar);
  latência fria, integral ou sob carga (**n/d** — mediu-se quente, que é o que o protocolo pede);
  e **ausência de egress**, que **não foi medida** nesta ronda — o P1 tinha `nettap`, esta não
  correu nenhum. A afirmação honesta é «os braços foram escritos para falar só com
  `127.0.0.1:11434`», não «verificou-se que não houve egress».
- **Multiplicidade, declarada:** escolheu-se o melhor de **4 configurações** (2 modelos × 2
  braços) sem ajuste. O `p=0,003` não está corrigido para isso.

### Verificações de fecho (MP1 §12)

- **`sha256(tools/router/classify.js)` = `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
  — igual ao protocolo. FROZEN intacto.** ✅
- **`tools/router/` sem um único ficheiro modificado.** Os 4 `??` que lá aparecem
  (`.tmp/`, `ci-validate-manifest.js`, `kimi-wave-g3-validation.test.js`,
  `statusline-oficial.test.js`) são de **Julho e Agosto**, pré-existentes e alheios a esta
  sessão — confirmado por mtime. A única interacção com essa pasta foi **ler**
  `ollama-host.js` para importar o normalizador canónico.
- **Nenhum `git push`.** ✅
- Não commitado, por conter prompts reais ou por não estar na lista do MP1 §12:
  `corpus-40-unredacted.json`, `C-*.json`, `D-*.json` (gitignorados pelo `.gitignore` do
  pacote), e os `log-*.txt` / `adversary-codex-{raw,err}.txt` / `adversary-prompt-sent.txt` /
  `04-analysis.json` (ficam não versionados em `results/`, como o MP1 prevê).

### Estado final dos gates (corpus real de 40, fora do treino)

| Critério pré-registado | Alvo | D/`qwen2.5-coder:14b` | |
|---|---|---|---|
| `acc40_min_to_beat_rule` | > 0,350 | **0,600** | ✅ |
| `mcnemar_vs_rule_one_sided_p` | ≤ 0,05 | **0,00317** | ✅ |
| `p50_ms_max_decisor_quente` | ≤ 250 ms | **165 ms** | ✅ |
| `ece_max` | ≤ 0,10 | **0,110** | ❌ |
| `acc40_target_beats_judge` | > 0,525 | 0,600 nominal, mas **p=0,227** | ❌ (não demonstrado) |

**Leitura em uma frase.** O melhor braço local ($0, 165 ms, zero egress pretendido) acerta
**24/40** contra **14/40** da regra, e essa diferença **é real** (p=0,003). Mas falha a
calibração por 0,010, **não se distingue do juiz** (p=0,227) e **não se distingue de responder
sempre T2** (p=0,163). Bateu a regra; não provou saber decidir. É exactamente o estado
intermédio que o protocolo previu — e a receita que ele próprio prescreve (política v1:
regressão logística sobre as 4 respostas, em vez do argmax v0) é o que estes números pedem,
antes de abrir a F2.

VEREDICTO: ENTRE (REGRA<ACC<JUIZ) → POLÍTICA V1 ANTES DE F2

---

# MP2 — Política v1 + calibração + corpus 60b

## Passo 0 — Pré-registo MP2

- **2026-09-21T09:59Z (06:59 BRT)** · CC: arranque do MP2. Lido `MP2_POLITICA_V1_E_CORPUS_60B_CC.md`,
  `protocol.json`, `lib-common.mjs`, `02-arm-D-logit.mjs`, `04-analyse.mjs`, o `net-tap.cjs` e o
  `redigir-prompts.mjs` do P1, e a forma dos `rows[].answers` do D/14b (as 9 features já lá estão).
  Ollama com `qwen2.5-coder:14b` **ainda residente** (100 % GPU). `codex-cli 0.153.4` disponível.
- **Verificado ANTES de registar (não é ajuste, é contagem):** gold-84 e validation-set têm **4 prompts
  byte-iguais** (`gl-078/079/082/083` = `canonical-11/12/14/17`), rótulos iguais nos 4 → treino efectivo
  **150 únicos**, não 154. Sobreposição treino × 40 reais: **0**. Distribuição de tiers no treino:
  gold T0 46 · T1 4 · T2 20 · T3 14; valset T0 23 · T1 10 · T2 13 · T3 24.
- **2026-09-21T10:01:13Z (07:01 BRT)** · **Commit de pré-registo MP2: `14c205c5b4b0201ee7844a96c2c587c36f1febaf`**
  (`chore(decisor-shadow): pré-registo MP2 — política v1, calibração, corpus 60b`). 3 ficheiros:
  `protocol.json` (bloco `mp2`), `.gitignore` do pacote (brutos do 60b), `MP2_…md`. Zero em `tools/router/`.
  - O bloco fixa, **antes de qualquer corrida**: hipótese; treino = 150 únicos; features (9 + bias);
    os 3 candidatos com **todos** os hiperparâmetros (grid de T 0,30–5,00/0,05; λ ∈ {0,01; 0,1; 1};
    GD full-batch lr 0,1 × 2 000 it., init zeros; z-score do fold); selecção = 5-fold CV estratificada,
    seed 20260921, log-loss → desempate acc; regra de honestidade; elegibilidade, janela, seed e
    anonimização do 60b; ambiente do braço A nos 60b (= A-nokey do P1); gate final nos 100.
  - **Desvio ao MP2, declarado e pré-registado:** a elegibilidade do 60b junta ao que o MP2 lista
    (tool_result, `/…`, < 20 chars, sha no corpus-63) a **mesma régua do P1** — 20–500 chars, sem
    colagens, sem scratchpads/`Temp`, sem `isSidechain`. Razão: o gate é nos **100 juntos**; juntar
    dois corpora com definições de população diferentes seria pior ciência do que juntar dois com a
    mesma. Decidido e escrito antes de existir pool.
  - Janela do 60b: `2026-09-10T00:00Z → 2026-09-21T10:02Z` (fim = hora do pré-registo, 47 s depois
    do commit; nada desta sessão é elegível — o prompt desta sessão tem > 500 chars).

## Passo 1 — Completar o treino (valset)

- **2026-09-21T10:01:52Z → 10:02:02Z (07:01 BRT)** · `lib-common.mjs` ganha o modo `--corpus valset`
  (lê `tools/router/validation-set.json`, canonical/adversarial/historical, `id = <sec>-<nn>`, rótulo
  `expected_tier`; **só lê**). `node 02-arm-D-logit.mjs --model qwen2.5-coder:14b --corpus valset` —
  **uma corrida**, `logprobs_used: true`, 70 prompts em 10 s (modelo já quente).
  Grava `results/D-qwen2.5-coder_14b-valset.json` (gitignorado por `D-*.json`).
  - acc **0,743** (52/70), IC95 [0,63–0,83], ECE **0,054**, p50 **138,9 ms** (4 perguntas) / 35,1 ms (tier), abstém 3.
  - **É TREINO da regra (e para a política): não entra em nenhum gate.** Fica só como o segundo
    bloco do conjunto de treino da política. Nota: a ECE aqui (0,054) já é mais baixa do que nos 40
    (0,110) — a calibração do v0 varia com o corpus, o que é exactamente o que o temperature scaling
    ajustado em dados independentes vai ter de aguentar.

## Passo 2 — `05-policy-v1.mjs` (node puro, zero deps, seed 20260921)

- **2026-09-21T10:04:24Z → 10:04:41Z (07:04 BRT)** · script novo `05-policy-v1.mjs`. Lê **só** os
  `rows[].answers` dos JSON do braço D (gold-84, valset; e os 40 **no fim**). O modelo não se re-corre.
  Treino efectivo **150** (gold 84 + valset 66; os 4 duplicados byte-iguais removidos como
  pré-registado) · distribuição **T0 68 · T1 12 · T2 32 · T3 38**.
- **Tabela de CV (5-fold estratificada no treino, out-of-fold pooled) — escrita aqui antes de o script
  ler os 40** (a ordem no código é: CV → gravar pesos → só então `corpus-40`):

| candidato | log-loss OOF | acc OOF | ECE OOF | T por fold |
|---|---|---|---|---|
| v0 (argmax) | 0,820 | 0,707 | 0,114 | — |
| v0+T | 0,758 | 0,707 | 0,081 | 1,55 · 1,60 · 1,45 · 1,55 · 1,50 |
| **v1 λ=0,01 ← vencedor** | **0,617** | **0,760** | **0,059** | 1,10 · 1,15 · 1,05 · 1,15 · 1,00 |
| v1 λ=0,1 | 0,635 | 0,760 | 0,079 | 0,85 · 0,90 · 0,85 · 0,85 · 0,80 |
| v1 λ=1 | 0,763 | 0,747 | 0,084 | 0,60 · 0,65 · 0,60 · 0,60 · 0,60 |
| v1 λ=0,01 (sem T, diagnóstico) | 0,610 | 0,760 | 0,061 | — |
| v1 λ=0,1 (sem T) | 0,646 | 0,760 | 0,075 | — |
| v1 λ=1 (sem T) | 0,838 | 0,747 | 0,175 | — |

  - **Vencedor da CV, fixado antes de tocar nos 40: `v1 λ=0,01`** (log-loss 0,617 < 0,635 < 0,758;
    acc 0,760). Modelos finais no treino todo: `v0+T` T=**1,55**; `v1` λ=0,01, T=**1,00** (ajustada em
    OOF externo). `results/policy-v1-weights.json` (pesos z-score, scaler, T, λ, folds, tabela de CV).
  - Pesos que a v1 aprendeu (colunas T0..T3): `p_needs_repo` → T2 (+1,35), `p_high_stakes` → T3
    (+0,92), `p_T1` → T1 (+0,99), `p_T2` → T2 (+0,95); **bias T0 +0,76, T1 −1,14** — o prior do
    treino (45 % T0, 8 % T1) entrou nos pesos.
- **Nos 40 reais (teste; nada ajustado aqui), os 3 candidatos:**

| candidato | acc40 | IC95 | log-loss | ECE | abstém | vs «T2 sempre» (b/c, p) | vs regra A-nokey | vs juiz B | previsões |
|---|---|---|---|---|---|---|---|---|---|
| v0 | **0,600** (24/40) | [0,45–0,74] | 1,111 | 0,110 | 3 | 16/10, p=0,163 | 12/1, p=0,002 | 5/2, p=0,227 | T0 19 · T1 7 · T2 8 · T3 6 |
| v0+T (T=1,55) | 0,600 (24/40) | [0,45–0,74] | 1,039 | **0,108** | 10 | 16/10, p=0,163 | 12/1, p=0,002 | 5/2, p=0,227 | idem (T não muda o argmax) |
| **v1 λ=0,01 (vencedor CV)** | **0,550** (22/40) | [0,40–0,69] | 1,232 | **0,233** | 3 | 14/10, p=0,271 | 10/1, p=0,006 | 6/5, p=0,500 | **T0 27** · T1 0 · T2 10 · T3 3 |

- **REGRA DE HONESTIDADE, ACCIONADA: o vencedor da CV (v1 λ=0,01) PERDE para v0 nos 40 — 0,550 < 0,600,
  e a ECE PIORA de 0,110 para 0,233. Imprime-se. Não se troca de candidato.** O candidato que conta
  para o gate dos 100 continua a ser o **v1 λ=0,01**, como fixado.
- **Leitura (não é ajuste, é diagnóstico):** a v1 aprendeu o prior do treino — 45 % T0 — e nos 40
  reais (45 % **T2**) manda **27 de 40 para T0** e **10 dos 18 T2 para T0**. Dentro do treino a CV
  está óptima (0,760 / ECE 0,059) e fora dele degrada: **é deslocamento de distribuição entre os
  prompts canónicos/adversariais/históricos e os prompts reais**, não é over-fit no sentido clássico
  (λ=0,01 e λ=1 têm a mesma acc OOF). A ECE dos 40 sobe porque as probabilidades da v1 são
  confiantes *no T0 errado* (bin 0,8: n=10, acc 0,50, conf 0,86).
- **v0+T também não salva a calibração nos 40:** ECE 0,110 → 0,108 (−0,002), abstenções 3 → 10. A
  temperatura óptima no treino (1,55, «amaciar») quase não mexe na ECE fora do treino — os bins dos 40
  estão errados em direcções diferentes (0,6: acc 0,40 conf 0,65 · 0,9: acc 0,82 conf 0,96), e uma
  temperatura escalar não corrige isso.
- **O que isto já diz antes dos 60b:** a hipótese do MP2 («política aprendida em 154 rotulados que D
  não viu sobe acc nos 40 e baixa ECE ≤ 0,10») **não se confirmou nos 40**. O corpus 60b decide o
  gate nos 100, mas com o candidato fixado — sem trocar.

## Passo 3 — Corpus 60b (segundo teste) + rótulos cegos

- **2026-09-21T10:08:12Z (07:08 BRT)** · `corpus-60b.mjs` (script novo; elegibilidade e seed lidas do
  `protocol.json#mp2.corpus_60b`). Varrimento de `~/.claude/projects/**/*.jsonl` (só sessões de topo;
  sub-agentes vivem em subpastas e ficam fora), janela `2026-09-10T00:00Z → 09-21T10:02Z` pelo
  `timestamp` da linha.
  - **Pool** (linhas `user` com texto, na janela): **386** · **elegíveis: 142** · em **13 sessões**.
    Excluídos: `tool_result` 4 035 · scratchpads `Temp` 132 · > 500 chars 34 · < 20 chars 40 ·
    `isMeta` 20 · `<task-notification>` 16 · colagem 1 · `<ci-monitor-event>` 1 · sem texto 1 ·
    **sha no P1: 0** (nenhum prompt da janela repete os 40).
  - **A regra pré-registada «um prompt por sessão» dá 13, não 60.** Facto do pool, não escolha: em 11
    dias o dono abriu 13 sessões com prompts humanos elegíveis. Decisão tomada **antes de rotular e antes
    de qualquer predição**, e declarada como desvio ao pré-registo: **tecto de 10 por sessão**
    (`--cap-per-session 10`), que dá **57** prompts com **as 13 sessões todas representadas**
    (tecto 12 dava 60 mas deixava 2 sessões de fora; tecto 8 dava 51). n = **57, não 60** — o
    nome «60b» fica por ser o pré-registado; o número que conta é 57, e o «100» passa a **97**.
  - Consequência a declarar já: **os 57 não são 57 observações independentes** — 3 sessões
    contribuem 30. O adversário deve atacar o n efectivo; a análise final reporta também o
    subconjunto estrito «1 por sessão» (13) como sensibilidade.
  - Amostra: PRNG mulberry32(20260921) sobre a ordem estável (timestamp, sessão); dias
    09-10 (7) · 09-11 (14) · 09-12 (19) · 09-13 (4) · 09-14 (2) · 09-18 (5) · 09-20 (5) · 09-21 (1);
    chars min 21 · p50 50 · max 366; projectos elegíveis (sha8 do nome): `189c6960` 55 ·
    `a8937b1a` 52 · `ab068178` 18 · `1d519314` 7 · `966d7227` 6 · `e5d50057` 4.
    **4 dos 57 são prompts despachados** (`[job · S1 · …]`, sessões `claude -p` de um job do
    Mooter — escritos por pessoa, embrulhados pelo despachador): b08–b11. Elegíveis pelas regras
    pré-registadas; marcados `_dispatched` no ficheiro.
  - Anonimização como o P1 (home → `~`, dono → `<owner>`, emails → `<email>`); verificação por
    regex sobre os 57: **0 fugas**. `results/corpus-60b.json` **não commitado** — `git check-ignore`
    confirma (`.gitignore:11` do pacote).
- **2026-09-21T10:09:07Z** · `label-60b.mjs`, 1.ª invocação: **falha de infra, 0 rótulos** —
  `codex` no Windows é um shim `.cmd`, precisa de `shell:true`, e com shell os argumentos com espaço
  (`C:\Users\Paulo Loureiro\…`) chegaram partidos («unexpected argument 'Loureiro\frugal\…'»). É a
  mesma classe da mordida `shell:true come o arg vazio` já em memória. Nenhum lote chegou ao modelo.
  Corrigido (aspas por argumento) e re-corrido — não é braço, não gasta a stop rule.
- **2026-09-21T10:09:28Z → 10:10:45Z (07:09 BRT)** · **Rótulos cegos**: `codex exec` (codex-cli
  **0.153.4**), sandbox `read-only`, cwd isolado vazio em `%TEMP%` (sem o repo), `--ephemeral`,
  `--output-schema` JSON forçado, rubrica do P1 com sha **verificado** `f95958dd…`, **5 lotes**
  (12/12/12/12/9), 13,7–18,1 s cada. **57/57 rotulados, 0 em falta.** O script aborta se existir
  qualquer `D-/A-/policy-*60b*` em `results/` antes de rotular — guarda de cegueira no código, não
  na memória. `results/labels-60b.json` (gitignorado) com `_labeler`, `_rubric_sha256`, `_blind`,
  `_labeled_at`; transcrição dos lotes em `results/labels-60b-transcript/`.
  - **Distribuição: T3 23 · T2 18 · T0 16 · T1 0.** Muito diferente dos 40 (T2 18 · T0 11 · T3 8 ·
    T1 3): esta janela é a do fecho de PRs — «avança com o push», «abre PR», «apaga o branch» — e a
    rubrica manda push/merge/PR para T3. Os 4 despachados: T2 2 · T3 2.
  - **Régua constante nos 57: «T2 sempre» = 18/57 = 0,316; «T3 sempre» = 23/57 = 0,404.** Nos 97
    juntos, T2 continua a classe maioritária (36) por pouco sobre T3 (31) — a referência
    pré-registada («T2 sempre») mantém-se; «T3 sempre» reporta-se também.
- **2026-09-21T10:11:40Z → 10:13:52Z** · **Segundo rotulador (opcional, feito): Sonnet** via subagente
  `model-reasoner` do Claude Code, só com a rubrica + os 57 prompts (instruído a não ler mais nada; as
  predições ainda não existiam). 57/57. `results/labels-60b-rater2-sonnet.json` (gitignorado).
  - **Cohen κ (Codex × Sonnet) = 0,594 · concordância bruta 0,719** (41/57). Sonnet dá T3 21 · T2 19 ·
    T0 11 · **T1 6** (o Codex dá T1 0). Desacordos maiores: T3(Codex)→T2(Sonnet) 4, T0→T1 4,
    T2→T3 3. **O rótulo que conta é o do Codex**, como pré-registado; κ=0,59 é «moderado» — o
    rotulador único é um limite real que fica declarado, não resolvido.

## Passo 4 — Correr nos 60b (=57): uma corrida cada

- **2026-09-21T10:14:01Z (07:14 BRT)** · `A-60b.mjs` (script novo, 22 linhas): sha do `classify.js`
  **verificado** = `427d8c0b…` antes de correr; `classify()` em processo, ambiente **nokey** (sem
  `ANTHROPIC_API_KEY`, `MOOTER_ARBITER_DISABLE=1`, `OLLAMA_HOST` num stub 503 loopback — 0 hits).
  57 itens, p50 **0,41 ms**. `results/A-60b.json` (gitignorado). Previsões: **T0 45 · T3 11 · T2 1**.
  - A regra nos 57: **0,439** (25/57). Nos 40 era 0,325. Sobe porque esta janela tem 23 T3 e a regra
    apanha 10 deles (push/PR/merge são as suas palavras); continua a mandar **31 dos 36 T2 dos 97
    para T0**.
- **2026-09-21T10:14:01Z → 10:14:09Z** · `02-arm-D-logit.mjs --model qwen2.5-coder:14b --corpus
  results/corpus-60b.json --labels results/labels-60b.json` — **uma corrida**, modelo já quente,
  `logprobs_used: true`, 57 prompts em 8 s. **Com atestação de egress**: `NODE_OPTIONS=--require
  <P1 lib/net-tap.cjs>`, `NET_TAP_OUT=results/nettap-D-60b.jsonl`. Self-test do tap feito antes
  (controlo positivo: um `fetch` loopback registado com 181 B out / 143 B in).
  - **Egress: tap carregado · 2 ligações TCP (keep-alive do undici reutiliza o socket) · hosts
    `{"127.0.0.1:11434": 2}` · hosts externos 0 · bytes out 551 529 / in 261 538.** Esta ronda **mediu**
    o que a ronda 1 só afirmava.
  - D v0 nos 57: acc **0,614** (35/57), IC95 [0,48–0,73], **ECE 0,124**, p50 **140,0 ms** (35,9 ms só
    tier), abstém 4. Confusão: T3→T0 **8**, T2→T0 **8**, T2→T2 8, T3→T3 11, T0→T0 16/16. Previsões
    T0 32 · T2 11 · T3 12 · T1 2. Mesmo sentido de erro dos 40: **desce** (16 dos 41 T2/T3 para T0).
- **2026-09-21T10:14:18Z** · `05-policy-v1.mjs --apply` (pesos gravados, **zero ajuste, zero corridas**)
  → `results/policy-v1-60b.json`: v0 0,614 / ECE 0,124 · v0+T 0,614 / 0,128 · **v1 0,544 / 0,174**.
  Segunda vez que o vencedor da CV perde para o v0, agora num corpus que **não existia** quando a CV
  correu.
- **2026-09-21T10:14:36Z** · **Latência fria, uma medição declarada** (`ollama stop qwen2.5-coder:14b`,
  depois as 4 perguntas do b01): 1.ª pergunta **2 447 ms** (inclui carregar 9 GB para a GPU), as três
  seguintes 37 / 34 / 35 ms; total **2 553 ms**. `results/cold-latency-D-60b.json`. O gate é quente
  (o protocolo diz-o); este número existe para ninguém confundir 147 ms com «sempre».

## Passo 5 — Análise final (`06-analyse-mp2.mjs` → `results/06-analysis-mp2.md`)

- **2026-09-21T10:15Z** · script novo; **não corre modelo nenhum**, só junta ficheiros. Nota de
  higiene, declarada: a 1.ª versão importava `mcnemar` de `05-policy-v1.mjs`, o que **re-executava o
  treino** ao importar (módulo ES corre o topo). Corrigido movendo `mcnemar` para `lib-common.mjs`.
  O `05` correu assim **3×** no total (10:04:24 original; 10:15:02 por esse import; 10:15:35 por uma
  verificação de carga minha) — é determinístico (seed fixa, GD full-batch, init zeros): os JSON
  finais batem **número a número** com o log da corrida de 10:04 (`results/log-05-policy-v1.txt`);
  só o campo `at` mudou. Nenhuma decisão foi tomada entre as três.

| Braço | acc40 | acc57 | **acc97** [IC95] | ECE97 | p50 ms | McNemar vs «T2 sempre» (97) | McNemar vs regra (97) |
|---|---|---|---|---|---|---|---|
| regra classify.js (nokey) | 0,325 | 0,439 | **0,392** (38/97) [0,30–0,49] | n/d | 0,49 in-proc | 37/35, p=0,453 | — |
| «T2 sempre» (referência pré-registada) | 0,450 | 0,316 | **0,371** (36/97) [0,28–0,47] | — | — | — | 35/37, p=0,638 |
| «T3 sempre» (extra) | 0,200 | 0,404 | **0,320** (31/97) | — | — | 31/36, p=0,768 | 21/28, p=0,874 |
| juiz B (só 40) | 0,525 | n/d | n/d | n/d | 76 (40) | 14/11, p=0,345 (40) | 12/4, p=0,038 (40) |
| D v0 argmax | 0,600 | 0,614 | **0,608** (59/97) [0,51–0,70] | **0,095** | 147 | **43/20, p=0,0026** | 25/4, p=0,0001 |
| D v0+T (T=1,55) | 0,600 | 0,614 | **0,608** (59/97) [0,51–0,70] | **0,076** | 147 | 43/20, p=0,0026 | 25/4, p=0,0001 |
| **D v1 λ=0,01 — vencedor da CV, conta para o gate** | 0,550 | 0,544 | **0,546** (53/97) [0,45–0,64] | **0,190** | 147 | 38/21, **p=0,018** | 21/6, p=0,003 |

### Gates do pré-registo, no vencedor da CV (v1), nos 97

| Gate | Alvo | v1 (o que conta) | | v0 (transparência) |
|---|---|---|---|---|
| acc > «T2 sempre», McNemar unilateral | p < 0,05 | 0,546 vs 0,371 · 38/21 · **p=0,018** | ✅ | 0,608 · 43/20 · p=0,003 ✅ |
| ECE 10 bins, n=97 | ≤ 0,10 | **0,190** | ❌ | 0,095 ✅ (v0+T: 0,076 ✅) |
| p50 quente, 4 perguntas | ≤ 250 ms | **147 ms** | ✅ | 147 ✅ |
| egress no braço D (60b) | 0 hosts externos | **0** (2 ligações, só `127.0.0.1:11434`) | ✅ | idem ✅ |

- **O candidato que conta (v1) passa 3 gates e chumba a ECE (0,190).** Não há gate verde.
- **O candidato que não conta (v0) passaria os 4** — acc97 0,608, p=0,003 contra «T2 sempre», **ECE 0,095**
  (e v0+T 0,076), 147 ms, egress 0. **Não se troca.** A regra de honestidade existe para isto: se a
  troca fosse permitida depois de ver o teste, o «gate verde» seria a escolha entre 3 candidatos
  olhando para os 97 — e o p=0,003 deixava de ser de um teste, passava a ser de uma selecção.
  O que se pode dizer com honestidade é: **o v0 é um resultado exploratório forte que pede um
  pré-registo próprio para se confirmar**, e a v1 aprendida em rótulos canónicos é pior do que
  não aprender nada.
- **Sensibilidade «1 por sessão» (40 + 13 = 53, a regra pré-registada estrita):** v1 0,509 (27/53),
  vs «T2 sempre» 17/13, **p=0,29**; v0 0,566, 19/12, p=0,14; regra 0,302. Com o n efectivo honesto
  **nenhum** braço separa de uma constante. O p=0,018 dos 97 apoia-se em prompts correlacionados
  (3 sessões = 30 dos 57).
- ECE do v0 nos 97 = 0,095 **é** ≤ 0,10 — mas nos 40 era 0,110 e nos 57 é 0,124: o número junto
  passa porque os erros dos dois corpora se cancelam parcialmente nos bins (0,3–0,5: sub-confiante;
  0,8: sobre-confiante). Não se chama a isso «calibrado».
- Melhor leitura em uma linha: **um decisor tipado local acerta 0,61 em 97 prompts reais ($0, 147 ms,
  0 egress), a política aprendida em cima dele piora-o, e nenhum dos dois é calibrado o suficiente para
  o protocolo.**

## Passo 6 — Adversário round 2

- **2026-09-21T10:17:55Z → 10:19:31Z (07:17 BRT)** · `codex exec` (codex-cli 0.153.4, modelo `gpt-6-astra`
  por config, sandbox `read-only`, cwd isolado vazio, `--ephemeral`). Entrada: bloco `mp2` do protocolo +
  `06-analysis-mp2.md` + `policy-v1-weights.json` + metadados do 60b + 9 factos declarados (tecto,
  n=57, 3 execuções, κ, egress, fria, duplicados). **Zero prompts reais enviados** (prompt exacto em
  `results/adversary-round2-prompt-sent.txt`). Saída bruta: `results/adversary-codex-round2-raw.txt`.
- **29 ataques — 4 críticos · 24 sérios · 1 menor. Aceites 21, aceites em parte 6, refutados 2.**
  Ledger completo, ataque a ataque, em **`results/adversary-codex-round2.md`**. O que foi verificado
  depois de ler os ataques foi **só contagem sobre ficheiros já existentes** (0 corridas de modelo):
  - 60b × treino: **0/57** iguais (sha exacto e normalizado) — sobreposição semântica **n/d**;
  - por sessão, elegíveis 51 · 46 · 18 · 7 · 5 · 5 · 4 · 1×6 → com tecto 10 dá exactamente 57;
  - 0 prompts elegíveis nos 47 s entre o commit (10:01:13Z) e o `_registered_at` escrito à mão (10:02Z) —
    o intervalo está vazio, **mas o timestamp devia ter sido o do commit** (mordida repetida);
  - desempenho contra o 2.º rotulador: v0 **0,614 → 0,491**, v1 0,544 → 0,456 — o «0,61» depende de quem rotula;
  - recall T3 nos 97: **v1 11/31, v0 16/31** — ambos sub-roteiam metade dos T3;
  - só-57: v1 acc 0,544 / ECE 0,174 / vs T2 p=0,021; v0 0,614 / **ECE 0,124** / p=0,004 — nos 57 sozinhos
    **nem o v0 passa a ECE**.
  - **Refutados:** A7 na forma (o 20–500 **está** no bloco committado; o «desvio» é ao texto do MP2, e
    foi pré-registado); A18 na contaminação (T do v1 ajusta-se em OOF **interno** dentro de cada fold
    de treino; o fold de teste nunca entra em nenhum ajuste; as linhas «sem T» estão excluídas no código).
  - **Os quatro críticos ficam de pé:** A1 (gate é conjunção; chumbou), A2 (p=0,018 assume independência
    que 3 sessões/30 prompts não dão), A21 (acurácia simétrica esconde recall T3 de 35 %), A24 (o tap
    cobre o processo Node do cliente, não o daemon Ollama; e só os 57).
- **Veredicto do adversário, aceite:** «ENTRE» só é honesto lido como «o gate registado falhou, a
  superioridade fica por confirmar sob dependência de sessão, e nada avança»; tratá-lo como quase-passagem
  ou como argumento a favor da F6 é generoso demais.

## Passo 7 — Fecho

- **2026-09-21T10:22Z (07:22 BRT)** · Verificações:
  - **`sha256(tools/router/classify.js)` = `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
    — igual ao protocolo. FROZEN intacto.** ✅ (verificado também em runtime pelo `A-60b.mjs` antes de correr.)
  - **`tools/router/`: 0 ficheiros modificados.** Os 4 `??` são os mesmos de Julho/Agosto da ronda 1.
    Única interacção: **ler** `classify.js`, `ollama-host.js`, `gold-labels.json`, `validation-set.json`. ✅
  - **Nenhum `git push`.** 3 commits por push em `main` (`1416884d`, `a01f6250`, `14c205c5`) + o de fecho abaixo. ✅
  - Brutos **fora do git**, confirmado por `git check-ignore` um a um: `corpus-60b.json`, `labels-60b*.json`,
    `labels-60b-transcript/`, `A-60b.json`, `policy-v1-{40,60b}.json`, `nettap-D-60b.jsonl`, `D-*.json`.
    Os ficheiros a commitar foram varridos: o único `<owner>` que aparece é o placeholder na descrição
    da anonimização; zero texto de prompt.
- **Stop rule cumprida:** uma corrida por (braço × corpus) — D/14b × valset, A × 60b, D/14b × 60b; a
  política aplicou-se sem corridas; a latência fria foi 1 medição declarada. A única repetição foi o
  `label-60b.mjs` que **nunca chegou ao modelo** na 1.ª invocação (shim `.cmd` + espaços no caminho).
- **Emendas ao pré-registo, todas declaradas antes de rótulos/predições e nenhuma commitada como
  `AMENDMENT`** (o adversário A3/A28 tem razão em pedir isso): tecto 10/sessão (n=57, não 60); o
  `_registered_at` à mão. Ficam registadas aqui, com hora.
- **O que esta ronda diz, em três linhas:**
  1. A política aprendida (v1) em rótulos canónicos é **pior do que não aprender nada**: aprendeu o prior
     do treino (45 % T0) e sub-roteia; chumba a ECE (0,190) nos 97 e perde para v0 nos dois corpora.
  2. O decisor tipado cru (v0) é o **melhor número local já medido** — 0,608 em 97 reais, $0, 147 ms
     quente, 0 hosts externos no cliente — mas é **exploratório** (não era o candidato), não é calibrado
     (0,110 / 0,124 por coorte), sub-roteia metade dos T3, e sob 1 prompt/sessão não separa de uma constante.
  3. O rótulo é a fronteira: κ=0,59 entre rotuladores e o 0,61 vira 0,49 quando o rotulador muda.
- Encontrados no pacote ao fechar, **não lidos e não commitados** (não são deste MP): `MP3_CONFIRMATORIO_V0_E_F2_SHADOW_CC.md`
  e `MP3_COLAR_NO_CC.txt` (mtime 10:22:03Z, escritos pelo Cowork durante o passo 6).
- Commit de fecho: scripts (`lib-common.mjs`, `05-policy-v1.mjs`, `06-analyse-mp2.mjs`, `corpus-60b.mjs`,
  `label-60b.mjs`, `A-60b.mjs`), `results/06-analysis-mp2.md`, `results/policy-v1-weights.json`,
  `results/adversary-codex-round2.md`, `results/PROGRESSO.md`. `protocol.json` já está no `14c205c5`.
  Sem push.

**Leitura em uma frase.** O gate pré-registado (v1 nos 97) **falhou na ECE** e passou os outros três
com um *p* que depende de prompts correlacionados; o v0 exploratório passaria os quatro no agregado e
nenhum por coorte; nada avança para a F2 sem um confirmatório novo, com corpus novo, 1 prompt por
sessão e o candidato fixado à cabeça — e a F6 não está justificada por estes números.

VEREDICTO: ENTRE → MAIS RÓTULOS (GATE REGISTADO FALHOU NA ECE; SUPERIORIDADE NÃO CONFIRMADA SOB DEPENDÊNCIA DE SESSÃO; NADA AVANÇA PARA F2; F6 NÃO JUSTIFICADA)

---

# MP3 — Confirmatório limpo do v0 + F2-shadow

## A0 — Pré-registo MP3

- **2026-09-21T10:30Z (07:30 BRT)** · CC: arranque do MP3. Lido o MP3, `arbiter.js` (385 linhas),
  `inject_context.js` §907 (arbiter Haiku), `types.d.ts`, `ollama-host.js`, o `kimi-adapter.js` do bridge.
  Verificado que o hook **vivo** está wired em `~/.claude/tools/router/inject_context.js` (`settings.json:115`),
  não no repo — mexer no canónico em `tools/router/` não altera a sessão actual até um `/mooter-update`.
- **Sondas antes de registar (não são corridas):** `MOONSHOT_API_KEY` presente; `kimi-k3` responde
  (`200`, 4,1 s, `json_object` OK; **a API só aceita `temperature=1`** — declarado). `GEMINI/GOOGLE_API_KEY`
  ausentes. → **R3 = Kimi k3** (Moonshot, família diferente de Codex e Sonnet), ordem de substituição
  Opus → Haiku registada.
- **2026-09-21T10:36:44Z (07:36 BRT)** · **Commit de pré-registo MP3: `32e65ac68a18f7caa5dc7f83949e04908a1be8d1`**
  (`chore(decisor-shadow): pré-registo MP3 — confirmatório v0 (60c, 1/sessão) + F2-shadow`). Bloco `mp3`
  escrito por script (timestamp = `new Date()`, não à mão — a mordida do MP2 A28): candidato primário
  **v0 argmax** fixo; v0+T com **T=1,55 herdado**; v0-guard com limiar **0,5**; gate só no 60c; janela
  `08-01→09-09`, **1/sessão estrito, n = o que der**; exclusão por sha dos 63 do P1 + 40 + 57 do 60b;
  3 rotuladores cegos, maioria, empate a 3 → Codex; escopo exacto da Frente B; `amendments[]` + regra
  formal. Nota: o `JSON.stringify(…, 2)` re-indentou as listas do bloco `mp2` (12 linhas, só formato,
  zero conteúdo). `.gitignore` alargado aos brutos do 60c.

## A1 — Corpus 60c (virgem, 1 por sessão ESTRITO)

- **2026-09-21T10:37:18Z (07:37 BRT)** · `corpus-60b.mjs --block mp3` (o sampler ganhou `--block`; o
  caminho `mp2` continua a reproduzir os 57 — verificado a seco antes). Janela `2026-08-01T00:00Z →
  09-09T23:59:59Z`; exclusão por sha de **97** hashes conhecidos (63 P1 + 40 cru + 57 do 60b — os do
  60b e do P1 partilham 40 shas).
  - **Pool** (linhas `user` com texto na janela): **1 324** · **elegíveis 410** em **37 sessões** ·
    excluídos: `tool_result` 18 134 · `<task-notification>` 254 · < 20 chars 209 · scratchpads `Temp`
    172 · > 500 chars 136 · **sha no P1/60b: 74** · `isMeta` 47 · tags de comando 22 · sem texto 1.
  - **1/sessão estrito → n = 37.** Não se sobe o tecto (foi o que o A3 do round 2 atacou). 37 sessões
    únicas, 37 itens; 20 dias distintos (08-01 a 09-09), chars min 24 · p50 166 · max 500; 10 projectos
    (sha8): `61ded45c` 99 · `91b70f25` 85 · `7146253a` 78 · `1d519314` 70 · `f4ca075a` 39 · `a8937b1a` 21 ·
    `189c6960` 10 · `7fbc50b0` 6 · 2×1. **7 dos 37 são despachados** (`[job · S1 · …]`; 6 são as sessões
    `controlled-eval-cc-*` de 09-06, uma por prompt) — elegíveis pelas regras registadas; marcados;
    sensibilidade sem eles reporta-se.
  - Anonimização: **0 fugas** (regex sobre os 37). `results/corpus-60c.json` gitignorado (linha 19).
- **2026-09-21T10:37:41Z** · **AMENDMENT mp3-1, commit `3ce8d61b376ec7ebe6d3b555275b4b3b9b252257`**
  («corpus 60c tem n=37, não 60»), com entrada em `protocol.json#mp3.amendments[]` (`outcome_known:false`),
  **antes de pedir rótulos e antes de qualquer predição**. É a regra formal que o adversário pediu.

## A2 — Rótulos cegos, TRÊS rotuladores, maioria

- Guarda de cegueira nos scripts: abortam se existir `D-/A-/policy-*60c*`. Nenhum existia.
- **R1 Codex** · 10:38:40Z → 10:39:24Z · codex-cli 0.153.4, `read-only`, cwd isolado, `--ephemeral`,
  `--output-schema`, rubrica sha **verificada**, 3 lotes (13/13/11), 13,8–14,6 s cada → **37/37**.
  Distribuição T0 12 · T1 5 · T2 8 · T3 12.
- **R2 Sonnet** · 10:38:28Z → ~10:40Z · subagente `model-reasoner`, só rubrica + 37 prompts → **37/37**.
  T0 9 · T1 6 · T2 9 · T3 13.
- **R3 Kimi k3** · 10:39:24Z → 10:43:39Z · `api.moonshot.ai/v1`, `json_object`, 3 lotes, 49–139 s cada
  (lento, mas 3/3 OK, modelo devolvido `kimi-k3`) → **37/37**. T0 11 · T1 8 · T2 7 · T3 11.
  Limite: `temperature` fixa a 1 pela API — a corrida do Kimi não é reprodutível bit a bit.
- **Maioria (`results/labels-60c.json`, 3 votos por item): T0 10 · T1 6 · T2 9 · T3 12.**
  **Unânimes 27/37 = 73 %** · empate a 3 → Codex: **1** item.
  **κ de Fleiss = 0,743** · Cohen: Codex×Sonnet **0,705** (bruto 0,784) · Codex×Kimi **0,707** (0,784) ·
  Sonnet×Kimi **0,818** (0,865). Bem acima dos 0,59 do MP2 — com 3 rotuladores e prompts mais longos
  (p50 166 chars vs 50), o rótulo fica menos artificial. Os 7 despachados: T1 2 · T2 3 · T3 2.
- **Régua constante nos 37: «T2 sempre» = 9/37 = 0,243 (a referência pré-registada); «T3 sempre» =
  12/37 = 0,324 é a constante mais forte** e reporta-se também, como pré-registado — bater só o T2
  neste corpus é bater a constante **mais fraca**.

## A3 — Correr nos 60c (uma corrida cada)

- **2026-09-21T10:45:06Z (07:45 BRT)** · `A-60b.mjs --corpus results/corpus-60c.json --out results/A-60c.json`
  (ganhou `--out`): sha do `classify.js` **verificado** antes; nokey; stub 503 com 0 hits; 37 itens,
  p50 0,46 ms. Regra prevê **T0 31 · T3 4 · T2 2** → acc **0,324** (12/37).
- **2026-09-21T10:45:06Z → 10:45:15Z** · `02-arm-D-logit.mjs --model qwen2.5-coder:14b --corpus
  results/corpus-60c.json --labels results/labels-60c.json` com net-tap → **uma corrida**, modelo quente,
  `logprobs_used: true`, 37 prompts em 9 s. **Egress:** tap carregado, 2 ligações, só `127.0.0.1:11434`,
  0 externos, 374 413 B out / 170 047 B in.
  - **D v0 nos 37: acc 0,622 (23/37), IC95 [0,46–0,76], ECE 0,146, p50 161,9 ms (45,8 só tier), abstém 3.**
- **2026-09-21T10:45:50Z** · `05-policy-v1.mjs --apply` (só para o T=1,55; o v1 que também sai **não é
  candidato** e fica fora do `policy-60c.json`) + `07-guard.mjs` (script novo, 22 linhas) →
  `results/policy-60c.json` (gitignorado). **v0-guard disparou 0× em 37**: sempre que o D diz T0,
  `p_needs_repo` e `p_high_stakes` ficam abaixo de 0,5 — o guard é idêntico ao v0 neste corpus.
  **v0+T: ECE 0,187 — pior que o v0 (0,146).** A temperatura ajustada no treino canónico amacia probabilidades
  que aqui já estavam sub-confiantes nos bins baixos.

## A4 — Análise (`08-analyse-mp3.mjs` → `results/08-analysis-mp3.md`)

- **2026-09-21T10:46:43Z** · só 60c, 37 itens = 37 sessões (pares independentes por construção).

| Braço | acc37 [IC95] | ECE | p50 | vs «T2 sempre» | vs «T3 sempre» | vs regra |
|---|---|---|---|---|---|---|
| regra (nokey) | 0,324 (12/37) [0,20–0,49] | n/d | 0,46 ms | 12/9, p=0,33 | 10/10, p=0,59 | — |
| «T2 sempre» (referência) | 0,243 (9/37) | — | — | — | 9/12, p=0,81 | 9/12, p=0,81 |
| «T3 sempre» (mais forte) | 0,324 (12/37) | — | — | 12/9, p=0,33 | — | 10/10, p=0,59 |
| **D v0 (primário)** | **0,622** (23/37) [0,46–0,76] | **0,146** | **162** | **18/4, p=0,0022** | **17/6, p=0,017** | **11/0, p=0,0005** |
| D v0+T (T=1,55) | 0,622 | 0,187 | 162 | idem | idem | idem |
| D v0-guard (0,5) | 0,622 | 0,146 | 162 | idem (0 disparos) | idem | idem |

- **Sensibilidade só-unânimes (n=27, o tecto do rótulo): v0 = 0,815 (22/27), vs T2 17/0 p<0,0001, vs T3
  16/4 p=0,006** — onde os 3 rotuladores concordam, o decisor acerta 4 em 5. ECE 0,194 (n pequeno).
- **Sensibilidade sem despachados (n=30): v0 = 0,567, vs T2 15/4 p=0,010, vs T3 12/5 p=0,072** — os 7
  despachados são os itens **mais fáceis** (D acerta 6/7); sem eles o v0 deixa de separar da constante
  mais forte ao nível 0,05.
- **Confusão do v0 nos 37:** T1→T0 **4** (de 6), T3→T0/T1 **3**, T2→T0/T1 **4**, T3→T2 3. Continua a
  errar **para baixo** (11 dos 14 erros). Previsões T0 17 · T2 8 · T3 6 · T1 6 vs rótulo T0 10 · T2 9 · T3 12 · T1 6.
- **Calibração (a razão do chumbo):** bin 0,9: n=12, acc 0,75, conf 0,96 (**sobre-confiante nos T0**);
  bins 0,3–0,5: sub-confiante. ECE 0,146 — o terceiro corpus seguido acima de 0,10 (0,110 · 0,124 · 0,146).
  O decisor **sabe** o tier melhor do que qualquer régua local medida; **não sabe** quanto sabe.

### Gates do pré-registo (v0, só 60c)

| Gate | Alvo | Valor | |
|---|---|---|---|
| acc > «T2 sempre», McNemar | p < 0,05 | 0,622 vs 0,243 · 18/4 · **p=0,0022** | ✅ |
| ECE 10 bins, n=37 | ≤ 0,10 | **0,146** | ❌ |
| p50 quente | ≤ 250 ms | **162 ms** | ✅ |
| egress cliente D | 0 externos | **0** (2 ligações loopback) | ✅ |

**Leitura da Frente A.** Pela primeira vez o resultado é **confirmatório** no sentido estrito: candidato
fixado à cabeça, corpus virgem, 1 prompt/sessão, 3 rotuladores, e o v0 bate a constante **mais forte**
(p=0,017), não só a registada. O que falha é o mesmo de sempre — **calibração** (0,146). O gate é uma
conjunção: **não há gate verde.** «ENTRE → shadow acumula» é a leitura honesta; a Frente B existe para
acumular o 60d sem ninguém rotear por isto.

## Frente B — F2-shadow (primeira mudança de código em `tools/router/`)

- **2026-09-21T10:47:25Z (07:47 BRT)** · **Suite `tools/router` ANTES de tocar em nada:** `npm test` →
  **1 328 testes · 1 324 pass · 3 fail · 1 skipped** (6,1 s). As 3 falhas são pré-existentes e de ambiente
  (`vault receipts are immutable…`, `device lookup is read-only…`, `tuned_demote still works…`); ficam
  registadas nome a nome para comparar no fim.
- **B0 · o que mudou (commit `0017f8f06e47712529f130c836b896c7023ad35e`, `feat(router): decisor sombra
  ollama-logit — regista, não roteia (F2-shadow)`):**
  - `tools/router/arbiter.js` (+282): `ollamaLogit(prompt)` — porta directa do `02-arm-D-logit.mjs`
    (mesma rubrica verbatim, mesmas 4 perguntas, `top_logprobs` via `/v1/chat/completions`, host de
    `ollama-host.js`, modelo `MOOTER_DECISOR_MODEL || qwen2.5-coder:14b`); a chamada HTTP corre num
    processo filho com `spawnSync` (o hook é síncrono — é o mesmo padrão do `callHaikuSync`).
    `shadowDecisor(prompt, decision)`: só com `MOOTER_DECISOR_SHADOW=1`, nunca com `MOOTER_ARBITER_DISABLE=1`;
    **não lê `decision` para decidir nada nem lhe escreve**; escreve `decisor_shadow` no `decisions.log` com
    `prompt_sha12` + preview ≤ 80 chars (sem texto), `tier_regra/confidence/task_category`,
    `tier_D/probs_D/p_max_D/abstained_D/ms_D/aux_D`, `agree_regra`, `outcome`. Devolve o evento; nunca lança.
  - `tools/router/inject_context.js` (**+1 linha**, `git diff --stat` = `1 insertion`): `try { if (env) require('./arbiter.js').shadowDecisor(prompt, decision, {session_id}) } catch {}`
    logo antes da secção «v0.8 HAIKU ARBITER» — apanha todos os prompts, como o MP3 pede. Consequência
    declarada: `tier_arbiter_haiku` é `null` no hook (o Haiku corre depois); o `09-shadow-report.mjs` junta ao
    evento `classified` da mesma sessão (mesmo `prompt_len`, ts ≤ 10 s) para ter o tier final.
  - `tools/router/types.d.ts` (+53): `DecisorShadowResult`, `DecisorShadowEvent`, `ShadowOptions` — tudo opcional
    face ao resto. `npx tsc --noEmit`: **0 erros novos** em `arbiter.js`/`types.d.ts` (o `inject_context.js`
    tem dezenas de erros pré-existentes, nenhum na linha nova).
  - `tools/router/arbiter-shadow.test.js` (novo, **7 testes, 7/7**): (1) sem env → null, 0 eventos, decision
    intacta; (2) env + mock de logprobs → evento com o schema e **decision byte-idêntica** (JSON antes = depois);
    (3) HIGH_RISK: shadow diz T0, rota fica T3; (4) `_mockTimeout` → `outcome:'timeout'`, `tier_D:null`, rota
    intacta; (5) `MOOTER_ARBITER_DISABLE=1` ganha; (6) sem logprobs → `parse_failed`, prompt vazio → null;
    (7) o **hook real** por stdin em HOME isolado, sem env → 0 eventos, e sha do `classify.js` = `427d8c0b…`.
    **Nota:** o teste **não** está na lista explícita do `npm test` (o `package.json` enumera ficheiros e não
    está no allowlist deste MP) — corre com `node --test tools/router/arbiter-shadow.test.js`.
  - **`classify.js` intocado** (sha verificado antes do commit). Nada mais em `tools/router/`.
- **Suite DEPOIS:** `npm test` → **1 328 · 1 324 pass · 3 fail · 1 skipped — as mesmas 3, nome a nome.** ✅
- **Dois defeitos meus apanhados a medir, não a ler** (ambos corrigidos antes do commit):
  1. `node -e` põe o 1.º argumento em `process.argv[1]`, não `[2]` — o filho lia `undefined`; e2e dava
     `outcome:'failed'`. (Achado colateral, **não mexido**: o `callHaikuSync` existente lê `argv[2]`/`[3]` com o
     mesmo padrão — fica como pergunta para o dono, o log real tem 169 `arbiter_call ok`, n/d se vêm de
     mocks de testes.)
  2. **O Ollama 0.34.2 aborta o carregamento do modelo quando o cliente desliga** («client connection closed
     before llama-server finished loading, aborting load»). Um shadow com tecto curto num modelo frio
     **nunca o aquecia**: cada prompt repetia o timeout (medido: 10/10). Corrigido com um aquecimento
     **desligado** do hook em timeout (`warmDecisorDetached`, mesmo padrão do `ollama-warmup.js`): medido a
     frio, 1.º prompt 862 ms `timeout` → 2.º 387 ms ok → 248/246/254 ms, `keep_alive` 29 min.
- **Latência do hook, mediana com e sem shadow (10 prompts cada, `results/shadow-latency-hook.json`):** três
  medições, e só a terceira conta — as duas primeiras foram **artefacto do harness**, declarado:
  - a 400 ms (pré-registo), HOME isolado **sem** `hw-capability.json`: o hook caía para `qwen3:30b` (22 GiB
    previstos), o Ollama despejava o 14b, **7/10 timeouts**. Foi isto que motivou a **AMENDMENT mp3-2 (400→800,
    commit `542438ab`)** — e a razão estava parcialmente errada: **erratum** em `amendments[1].erratum`
    (commit `bce9cf9d`).
  - a 800 ms, harness fiel (`hw-capability.json` + `subscription-profile.json` + `ollama-warmup.js` copiados),
    modelo quente no arranque, aquecimento em timeout: **OFF p50 1 178 ms** (T0 ~1,18 s por causa do Option A;
    T2 ~130 ms) · **ON p50 1 416 ms** · **Δ por prompt com o 14b residente: 232 · 236 · 249 · 251 ms → ~240 ms**;
    `ms_D` p50 **245 ms** (240–249, um de 414). 4 dos 10 saíram `timeout` porque o 14b tinha sido **despejado
    durante a corrida OFF** e o aquecimento levou ~3 s a repor.
- **Achado colateral sério, fora do allowlist (não mexido):** durante as corridas OFF (sem shadow) o
  `server.log` do Ollama mostra pedidos, com abort ao fim de ~1 s, de **todos** os modelos instalados —
  `qwen3:30b` (22,4 GiB previstos → «evicting»), `qwen3.6:27b`, `qwen3.6:35b-a3b`, `gemma4:e4b`, `deepseek-r1:7b`,
  `qwen2.5-coder:7b` — o que despeja o 14b e dá `option_a_miss` (o log real desta máquina tem **266 miss / 22
  hit**). O `hw-capability.json` da runtime diz `hw_tier: apple-silicon`, `vram_mb: 16220`,
  `available_ollama_models: []` — está **errado para este PC** (RTX 4090, 23 GB) e é a razão de o
  `bestOllamaT0()` cair para `qwen3:30b`. **Quem faz o varrimento: n/d** (não é o shadow — o tap e o filho
  do shadow só pedem o 14b). Isto condiciona a Frente B em produção: enquanto o hook despejar o 14b nos T0,
  o shadow sairá `timeout` no prompt seguinte a cada despejo.
- **B1:** `RUN-DECISOR-SHADOW-ON.bat` / `-OFF.bat` na raiz (`setx MOOTER_DECISOR_SHADOW 1` / `""`), **não
  corridos** — `MOOTER_DECISOR_SHADOW` (User) continua vazio, verificado. Gitignorados pela regra `RUN-*.bat`.
  `README.md` do pacote documenta o que fica no log, como desligar, e o **`09-shadow-report.mjs`** (n,
  outcomes, concordância regra×D, distribuições, p50, join com `classified`) — testado contra o log do harness.
- **Sem merge, sem push.** O hook vivo (`~/.claude/tools/router/inject_context.js`) **não tem** o shadow até
  um `/mooter-update` depois de o dono fundir.

## Round 3 do adversário — e a resposta em código

- **2026-09-21T11:06:32Z → 11:08:15Z (08:06 BRT)** · `codex exec` (`gpt-6-astra`, `read-only`, cwd isolado, `--ephemeral`)
  sobre o bloco `mp3` + emendas, `08-analysis-mp3.md`, metadados do 60c e dos rótulos, as medições de latência e o
  **diff completo** da Frente B (1.ª versão, `0017f8f0`). Zero prompts reais enviados. **22 ataques, 3 críticos.**
  Ledger em **`results/adversary-codex-round3.md`** (aceites 14 · em parte 6 · refutados 2).
- **Veredicto dele:** «ENTRE é honesto só como gate falhado + recolha pré-definida; **o F2-shadow não está seguro
  para merge, mesmo opt-in**: fuga de texto (preview de 80 chars), bloqueio do caminho crítico (spawnSync até 800 ms
  dentro dos 5 s do hook), aquecimento sem controlo.» **Aceite, e respondido com código, não com prosa.**
- **2026-09-21T11:16:51Z (08:16 BRT)** · **commit `04c78631b706597153189c7c1d02e991785d3c21`**
  (`fix(router): F2-shadow fora do caminho crítico, sem texto, sem argv (round 3 do adversário)`):
  - **A3 (crítico):** o hook tira um snapshot **por valor** de 4 campos da decisão e lança um **worker desligado**
    (`node arbiter.js --shadow-worker`, `spawn` + `unref`, stdio ignorado, listeners de `error`) — devolve
    `{detached:true}` sem esperar. **Medido em pares ON/OFF alternados (10 prompts, modelo quente, harness fiel):
    Δ mediano do hook = +4 ms** (−22…+19; um −418 de variância do Option A), tiers idênticos 10/10, exit 0 em 20/20,
    10/10 eventos `ok`, worker 200 ms medianos (188–763) por conta própria.
  - **A1 (crítico):** o evento leva **só `prompt_sha12` + `prompt_len`** — sem preview (o `classified` da mesma sessão
    já tem os 80 chars; o shadow não acrescenta texto nenhum). O teste (2) verifica que o evento serializado não contém
    nenhuma palavra do prompt; o teste (8) idem no hook real.
  - **A4 (crítico):** o aquecimento em timeout passa a ser feito **pelo próprio worker**, com lock de 90 s por modelo.
  - **A2:** payload por **stdin**, nunca por argv. **A5:** host validado como loopback (`refused_non_loopback` senão)
    e `redirect:'error'`. **A6:** `decisionSnapshot()` com validação de tipo/tamanho; a descrição «nunca lê decision» do
    1.º commit estava errada e foi corrigida. **A15:** logprobs não finitos / massa 0 → `parse_failed`. **A19:** mock
    corrigido; **teste (8) novo: hook real com `MOOTER_DECISOR_SHADOW=1`** → router-hint idêntico, `hook ON < OFF + 400 ms`,
    evento chega depois, sem texto. **A17:** as medianas anteriores estavam mal calculadas (elemento central superior)
    e condicionadas aos sucessos — corrigido em `shadow-latency-hook.json#final_detached_worker` (mediana convencional,
    todos os 10). **A7:** apanhou um buraco real — os 23 `r01–r23` (template R-24) **não** estavam na exclusão por sha
    (o script só lia marcadores de redacção); verificado: **0** dos 37 do 60c e 0 dos 57 do 60b coincidem com um r.
  - Testes **8/8** · suite `tools/router` **1 328 · 1 324 · 3 pré-existentes · 1 skipped — igual** · `tsc` 0 erros
    novos · `classify.js` `427d8c0b…` intocado · `inject_context.js` continua com **+1 linha** (o diff da Frente B em
    `tools/router/` é `arbiter.js`, `types.d.ts`, `arbiter-shadow.test.js` e essa linha).
- **O que o adversário não viu:** a versão corrigida. Não houve round 4 — é o dono, no reviewer gate, que decide se
  chega. O que fica por provar em teste (declarado): concorrência real com o Option A, redirects, limites do Windows.

## Fecho

- **2026-09-21T11:20Z (08:20 BRT)** · Verificações:
  - **`sha256(tools/router/classify.js)` = `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — FROZEN intacto.** ✅
  - **Em `tools/router/` só mudou o permitido:** `arbiter.js`, `types.d.ts`, `inject_context.js` (**1 linha**), e o
    teste novo `arbiter-shadow.test.js`. `package.json` **não** foi tocado (o teste novo não entra no `npm test` — precisa
    de uma linha no allowlist do dono). Os 4 `??` pré-existentes de Julho/Agosto continuam lá, alheios.
  - **Nenhum `git push`.** Commits por push em `main`: `1416884d` · `a01f6250` · `14c205c5` · `31072892` (MP1/MP2) ·
    `32e65ac6` (pré-registo MP3) · `3ce8d61b` (AMENDMENT mp3-1) · `542438ab` (AMENDMENT mp3-2) · `bce9cf9d` (erratum) ·
    `0017f8f0` (Frente B) · `04c78631` (round 3) · + o de fecho. ✅
  - Brutos fora do git, confirmado um a um: `corpus-60c.json`, `labels-60c*.json`, `labels-60c-transcript/`, `A-60c.json`,
    `policy-60c.json`, `nettap-D-60c.jsonl`, `D-*.json`. Os `.bat` de ON/OFF são locais (`RUN-*.bat` ignorado) e **não
    foram corridos** — `MOOTER_DECISOR_SHADOW` (User) está vazio.
- **Stop rule:** uma corrida por (braço × corpus) — A × 60c, D/14b × 60c; políticas aplicadas sem corridas; rótulos 1×
  por rotulador. Nenhuma re-corrida.
- **Emendas, todas commitadas antes do que condicionavam:** mp3-1 (n=37, antes de rotular); mp3-2 (tecto 800 ms, antes de
  medir com ele) + erratum (a razão inicial era artefacto do harness). O 60d **só pode nascer com pré-registo próprio**
  (n, candidato, população, regra de paragem, papel confirmatório) antes de alguém olhar para os eventos (round 3, A22).
- **Achados colaterais para o dono (fora do allowlist, não mexidos):** (1) o `hw-capability.json` da runtime diz
  `apple-silicon` / `vram_mb 16220` / `available_ollama_models: []` — errado para esta RTX 4090 — e é por isso que
  `bestOllamaT0()` cai para `qwen3:30b`; (2) durante as corridas OFF o `server.log` do Ollama mostra pedidos e aborts de
  **todos** os modelos instalados a cada ~1 s (n/d quem — não é o shadow), despejando o 14b; o log real tem
  **266 `option_a_miss` / 22 hit**; (3) `callHaikuSync` lê `process.argv[2]/[3]` e `node -e` põe o 1.º argumento em
  `argv[1]` — n/d se o arbiter Haiku alguma vez respondeu por esse caminho em produção.
- **O que esta ronda diz, em três linhas:**
  1. **Frente A, confirmatório limpo:** o v0 fixado à cabeça acerta **0,622 em 37 prompts virgens, 1 por sessão, rótulo por
     maioria de 3 (κ Fleiss 0,74)**, bate «T2 sempre» (p=0,002), a regra (p=0,0005) **e a constante mais forte, «T3 sempre»
     (p=0,017)**; nos 27 unânimes acerta 0,815. **Chumba a ECE (0,146) pela terceira vez.** Gate = conjunção → não há verde.
  2. **Frente B:** o decisor existe agora no router **como sombra** — opt-in, fora do caminho crítico (+4 ms), sem texto
     no log, sem tocar na rota, testado no hook real — para acumular o 60d. O adversário recusou a 1.ª versão por três
     razões reais; a 2.ª responde-lhes em código e ninguém a atacou ainda.
  3. Continua a errar **para baixo** (14/14 erros; recall T3 6/12) e a saber **menos do que diz saber** (bin 0,9: acc 0,75).
     Não roteia nada até um 60d pré-registado com n ≥ 60, e mesmo aí só com calibração ≤ 0,10.

VEREDICTO: ENTRE → SHADOW ACUMULA; RE-TESTAR COM 60D (GATE 60C: 3 DE 4 — ECE 0,146 CHUMBA; V0 BATE T2, T3 E A REGRA EM 37 PROMPTS VIRGENS; F2-SHADOW COMMITADO OPT-IN, CORRIGIDO APÓS ROUND 3, SEM MERGE, SEM PUSH; NADA ROTEIA)

---

# MP4-a — Pacote de revisão + 2 bugs de produção antes de ligar o shadow

## 1 — Pacote de revisão

- **2026-09-21T11:34Z (08:34 BRT)** · `results/REVIEW-7-COMMITS.md`: os 7 commits do MP3 (`32e65ac6` … `8aa4d210`), cada um
  com sha, título, 2 frases em português corrente, ficheiros (`git show --stat`), risco com razão, `git revert`, e o que
  **não** muda. Só o commit 5 (`0017f8f0`) e o 6 (`04c78631`) tocam no router — revertem-se juntos. Tabela final: se
  fizer push, **nada** acontece no Claude Code até `MOOTER_DECISOR_SHADOW=1`. Ordem de leitura 1 → 5 → 6 → 7.

## 2 — Bug A: `hw-capability.json` + varrimento de modelos

- **2.1 Quem escreve e porquê «Apple M4 Pro» — evidência, não hipótese:**
  - Ficheiro vivo: `name: Apple M4 Pro`, `vram_mb: 16220`, `hw_tier: apple-silicon`, **`probed_at: 2026-09-17T20:39:03.157Z`**,
    sem `available_ollama_models`. O probe desta máquina, corrido agora: `nvidia · RTX 4090 · 23028 MB`.
  - O único escritor é `gpu-probe.js#buildHwCapability`, que **escrevia sempre** o ficheiro vivo. `gpu-probe.test.js`
    chama `buildHwCapability(apple(16220))` (fixture «Apple M4 Pro», 16220) — o último teste a correr deixa o ficheiro
    do developer com a fixture. O `decisions.log` real tem, **no mesmo segundo**, um burst de eventos `executed` sintéticos
    («deploy this to production right now», «rename foo to bar in retry.ts», …) e um `arbiter_call ok` de mock
    (20:39:04–09Z, sessão `4982059c…`) — foi uma corrida de testes. Hipóteses «copiado do Mac por sync» (o
    `sync-runtime.js` exclui explicitamente `hw-capability.json`; a única outra cópia no disco é a do vault, RTX 4090)
    e «`os.platform()` errado» (o probe acerta): **refutadas**.
  - O hook (`initHwCapability`) só re-sonda quando o ficheiro **não existe** — a fixture ficou 4 dias.
- **2.2 Quem pede loads de todos os modelos:** net-tap no hook real (HOME fiel, 5 prompts T0): os processos Node do hook
  só ligam a `127.0.0.1:11434` via `ollama_call_node.js` (5×) e à porta 7821 do tracker. Sem hook a correr, o `server.log`
  do Ollama só tem `GET /api/tags` a cada 30 s (`savings-tracker.js`, inofensivo). Durante o hook: «predicted 22.4 GiB,
  evicting» — o pedido vem do próprio Option A, porque `user-override-guard.js:170` mete `bestOllamaT0()` em
  `recommended_model`, e `bestOllamaT0()` (inject_context.js:558) caía para **`qwen3:30b`** sempre que
  `available_ollama_models` estava vazio — e **ninguém o escrevia** (`hardware-matcher.js:62` já o dizia). Os aborts de
  `qwen3.6:35b-a3b`/`gemma4:e4b`/`deepseek-r1:7b` no log de 07:56–08:01 BRT foram no harness **infiel** do MP3 (HOME sem
  `hw-capability`); não se reproduziram com harness fiel. «Ficheiro:linha responsável»: `inject_context.js:558-565`
  (`bestOllamaT0` fallback) + `gpu-probe.js:251` (escrita incondicional) + `gpu-probe.test.js:18/39` (fixture).
- **2.3 Correcção da causa (commit `aee71157`, 3 ficheiros, +67/−14 com comentários):** `buildHwCapability(probe, {persist,
  installed})` — testes passam `persist:false` (teste novo prova que o ficheiro do developer fica intacto); o gerador
  escreve `available_ollama_models` via `ollama list` (= `GET /api/tags`, **não carrega nada**) e o `recommended_t0` tem
  de estar instalado além de caber; o leitor `bestOllamaT0()` prefere `recommended_t0`, depois só instalados, e nunca um
  modelo ausente de 18 GB. **Ficheiro vivo regenerado** (`node tools/router/gpu-probe.js`): `RTX 4090 · gpu-high · 23028 ·
  recommended_t0 qwen2.5-coder:14b · 10 modelos`. Cópia do errado em `results/hw-capability.ANTES-2026-09-21.json`.
- **2.4 Medição antes/depois (20 prompts T0 pelo hook, HOME fiel, 14b quente) — honesta:** ANTES (código HEAD + ficheiro
  errado) `option_a` **13 hit / 7 miss**, hook p50 855 ms; DEPOIS (código novo + ficheiro regenerado) **13 hit / 7 miss**,
  p50 792 ms; evicções 0 e 0. **O gate «tem de subir» não se mediu neste harness**: os 7 miss são o orçamento de 1 s do
  Option A a expirar no próprio 14b (`POST /api/generate` 500/499 a 1,0 s), outra causa, fora deste MP. O que se prova é
  que o caminho do `qwen3:30b` deixa de existir (8/8 testes) e que a fixture deixa de escrever o ficheiro vivo. O
  «266 miss / 22 hit» do log real (últimas 3 000 linhas: **470 / 22**) tem mais do que uma causa.
- Suite `tools/router`: **1 328 · 1 324 · 3 pré-existentes · 1 skipped — igual.**

## 3 — Bug B: `callHaikuSync` argv

- **3.1 Reproduzido:** `spawnSync(node, ['-e', script, 'BODY', 'KEY'])` → dentro do script `argv.slice(1) = ['BODY','KEY']`.
  O script lia `argv[2]`/`argv[3]` → corpo = chave, chave = `undefined` → `https.request({headers:{'x-api-key':undefined}})`
  lança **síncronamente `ERR_HTTP_INVALID_HEADER_VALUE`** (medido) → filho morre → `callHaikuSync` devolve `null` →
  `arbiter_call failed`. **Nunca houve um `ok` real**: os 171 `ok` do log são mocks (170 com `duration_ms: 0`, 171 com
  `reasoning: "debug investigation"`, do `backtest.test.js`).
- **3.2 Corrigido (commit `423ca9c6`):** dois índices em `arbiter.js`, resto igual. `arbiter-argv.test.js` (3): reproduz o argv;
  faz o `callHaikuSync` **real** chegar a um servidor local a fingir a Anthropic (preload por `NODE_OPTIONS` no filho desvia
  `https.request`; o servidor corre **noutro processo** — `spawnSync` bloqueia o event loop de quem chama, e a 1.ª versão
  do teste morria em timeout com o pedido já recebido, a mordida da memória «instrumento que devolve nada») e verifica
  `x-api-key` + corpo + `system`; `_mockResponse` intacto. **Mordida verificada:** o teste 2 falha com os índices antigos.
- **3.3 Declaração retroactiva:** `results/ERRATA-ARBITER-HAIKU.md` — P1 `A-key`/`A-hook` **não afectados** (corriam com
  `MOOTER_ARBITER_DISABLE=1`); P5 «20/20 pedidos construídos, nada transmitido» fica **ainda mais verdade** (o pai montava o
  corpo; o filho lançava antes de ligar); Matriz-12 **D15 «arbiter falha mudo sem saldo» era este bug** — com ou sem saldo;
  o «+15 com chave» vem de `classify.js:901`, não do Haiku. 3 linhas na zona humana do `SYNC.md` (177 linhas ≤ 200).

## 4 — Fecho

- **Round 4 do adversário** (codex, sobre os dois diffs): 6 ataques — `results/adversary-codex-round4.md`. O de severidade
  alta (A3: o leitor podia escolher um modelo instalado que **não cabe**) foi **corrigido** (`bestOllamaT0` filtra por
  `can_run`); A4/A5 (robustez do teste do argv) corrigidos; A1/A2 são o desenho pré-existente da cache, declarados. Commit
  `fix(router): bestOllamaT0 só escolhe modelos que cabem; teste do argv robusto (round 4 do adversário)`.
- Suite `tools/router` **1 328 · 1 324 · 3 pré-existentes · 1 skipped — igual** em todos os passos; os 3 ficheiros de teste
  novos/alterados (`arbiter-shadow`, `gpu-probe`, `arbiter-argv`): **19/19**. `sha256(classify.js)` =
  `427d8c0b516315c6…` — FROZEN intacto. Em `tools/router/` só se tocou no allowlist: `arbiter.js` (bug B), `gpu-probe.js` +
  `gpu-probe.test.js` (gerador), `inject_context.js#bestOllamaT0` (leitor), `arbiter-argv.test.js` (novo). Sem push.
- **Não feito, declarado:** os 7 miss do Option A por orçamento de 1 s (outra causa); a invalidação por idade da cache
  `hw-capability.json`; os testes novos **não** estão no `npm test` (`package.json` fora do allowlist) — correm com
  `node --test tools/router/arbiter-shadow.test.js tools/router/gpu-probe.test.js tools/router/arbiter-argv.test.js`.

MP4-a FECHADO — 4 commits (aee71157 · 423ca9c6 · 641281ed · fecho) + 11 do MP1–MP3, sem push. Para o dono: (1) `git push origin main` · (2) `RUN-DECISOR-SHADOW-ON.bat` (duplo clique na raiz do repo; grava `MOOTER_DECISOR_SHADOW=1` para o utilizador) · (3) `/mooter-update` no Claude Code e abrir um terminal NOVO do Claude Code · (4) daqui a 14 dias: `node _handoff/decisor-shadow-2026-09-21/09-shadow-report.mjs --since 2026-09-21`

## 2026-09-21T12:11Z (09:11 BRT) · rebase sobre origin/main + push

- `git fetch origin`: origin/main tinha avançado (`766058e9`, merge do #519 e seguintes) — 15 commits locais por cima de base velha.
- Rebase bloqueado à partida por um ficheiro **untracked** que o remoto passou a seguir (`_handoff/MP_AB_MOO_AUDIT_2026-08-26.md`): verificado byte-a-byte igual ao de origin/main (sha256 `5f204d791701…` dos dois lados) → posto de lado (`$TEMP`), não apagado.
- `git rebase origin/main`: **1 conflito**, só em `SYNC.md` (os dois lados acrescentaram uma secção logo abaixo do cabeçalho — a nossa de 21/09, a do remoto de 13/09). Resolvido mantendo as duas, mais recente primeiro; `arbiter.js` e `inject_context.js` aplicaram limpos. 15/15 commits reaplicados; hashes novos: `72383176` (bug B) · `54779b62` (round 4) · `ec1d4716` (fecho MP4-a); os 12 anteriores ao conflito mantiveram o hash.
- Suite `tools/router` (`npm test`, pós-rebase): **1386 testes · 1382 pass · 3 fail · 1 skipped** — o gate pedia ≥ 1324/1328; origin/main trouxe 58 testes novos, todos verdes. As 3 falhas são as mesmas pré-existentes, nome a nome (vault receipts immutable · device lookup read-only · tuned_demote). Os 3 ficheiros novos fora da lista do `npm test`: `arbiter-shadow` + `gpu-probe` + `arbiter-argv` = **19/19**.
- `sha256 tools/router/classify.js` = `427d8c0b516315c6…` ✓ (intocado).
- `git push origin main`: **`766058e9..ec1d4716`**, 0 por push depois. Esta linha entra num commit próprio a seguir, também empurrado.

# MP5 — Decisor no Mac (7b) · higiene do T0 · pré-registo do MP4 — 2026-09-21T12:25Z (09:25 BRT)

Ponto de partida: `origin/main` = `eb6b1f85`, árvore limpa. Regras: `classify.js` FROZEN; push só no fim, depois de fetch + rebase + suite.

## 1 — O decisor funciona num Mac M4 16 GB? (zero rótulos novos)

- **1.1 Pré-registo** `protocol.json#mp5` em `2c198377` (`_registered_at` 2026-09-21T12:22:41Z; %cI do commit 2026-09-21T09:22:59-03:00) — **antes** de correr o 7b ou o 3b em qualquer corpus. Regra sobre o ponto: serve se acc_7b ≥ acc_14b − 0,05 em cada corpus; não serve se falha em ≥ 2; entre se falha em 1. Corpora separados; referência = os ficheiros D do 14b já existentes (não re-corridos). Declarado: o 7b **já estava instalado** (`ollama list`: 4,7 GB, há 3 meses) — o MP dizia «a puxar»; não houve pull.
- **1.2 Corridas** (`02-arm-D-logit.mjs`, mesmas 4 perguntas, rubrica sha `f95958dd…`, v0 argmax, modelo quente, net-tap no cliente → todos os sockets `127.0.0.1:11434`, 0 hosts externos): 7b × {40, 60b, 60c} e 3b × {60b, 60c}, **uma corrida cada**; o 3b no 40 é o do MP1. Logs `results/log-D-{7b,3b}-*.txt`, brutos `results/D-*.json` (gitignorados). A 1.ª tentativa não correu nada (o `NODE_OPTIONS --require` com caminho POSIX falhou no preload de todos os 5 processos antes de tocar no Ollama) — repetida com caminho Windows; não é uma 2.ª corrida.
- **1.3 Tabela** (`results/11-analysis-mp5.md`, gerada por `11-analyse-mp5.mjs`):

| Corpus | 14b (ref.) | **7b** | 3b |
|---|---|---|---|
| 40 (P1, reuso) | 0.600 (24/40) [0.45–0.74] · ECE 0.110 · p50 165 ms | 0.450 (18/40) [0.31–0.60] · ECE 0.236 · p50 101 ms · Δ -15.0 pp · McNemar 7/1 p=0.070 | 0.400 (16/40) [0.26–0.55] · ECE 0.462 · p50 97 ms · Δ -20.0 pp · McNemar 13/5 p=0.096 |
| 60b (MP2) | 0.614 (35/57) [0.48–0.73] · ECE 0.124 · p50 140 ms | 0.579 (33/57) [0.45–0.70] · ECE 0.105 · p50 97 ms · Δ -3.5 pp · McNemar 9/7 p=0.804 | 0.544 (31/57) [0.42–0.67] · ECE 0.413 · p50 83 ms · Δ -7.0 pp · McNemar 17/13 p=0.585 |
| 60c (MP3, 1/sessão) | 0.622 (23/37) [0.46–0.76] · ECE 0.146 · p50 162 ms | 0.486 (18/37) [0.33–0.64] · ECE 0.156 · p50 107 ms · Δ -13.5 pp · McNemar 9/4 p=0.267 | 0.378 (14/37) [0.24–0.54] · ECE 0.547 · p50 85 ms · Δ -24.3 pp · McNemar 14/5 p=0.064 |

  **Leitura (regra pré-registada): 7b NÃO SERVE** — abaixo de 14b − 5 pp em 2 dos 3 (40: −15,0; 60c: −13,5; só o 60b fica dentro, −3,5). O 3b falha nos 3. Honesto sobre o ponto vs o IC: os McNemar emparelhados **não** separam 7b de 14b a p<0,05 em nenhum corpus (0,070 · 0,804 · 0,267) — com n=37–57 a diferença de 13–15 pp não é estatisticamente distinguível; a regra era sobre o ponto e foi fixada antes, e o padrão é consistente: o 7b **colapsa o T2** (60b: T2→T0 11, T2→T2 2; 60c: T2→T2 0 de 9) e o 3b colapsa tudo em T3 (ECE 0,41/0,55). Implicação para o Mac: latência no Mac **n/d** (nada medido lá); `ESTUDO_LLMS_LOCAIS_MAC_MINI` **não existe no vault** (procurado por nome e por «mac mini / 16 GB»); se o 14b cabe ao lado de outro modelo em 16 GB fica n/d. O que se pode afirmar: se o Mac só correr o 7b, o decisor de lá **não é o que o MP3 mediu** — o 0,622 do 60c não se transfere.
