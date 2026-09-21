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
