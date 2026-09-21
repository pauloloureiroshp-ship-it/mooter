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
