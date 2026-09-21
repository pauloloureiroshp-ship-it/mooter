# Adversário · round 5 (MP5: partes 1 e 3) — ledger ataque a ataque

- **Quando:** 2026-09-21T12:45:36Z → 12:46:33Z (09:45 BRT). **Motor:** `codex exec` (codex-cli 0.153.4, `gpt-6`),
  sandbox `read-only`, cwd isolado vazio, `--ephemeral`. Motor diferente do autor (Claude Code/Opus) e do braço D.
- **Entrada (sem um único prompt real):** `protocol.json#mp5.parte_1_mac_7b`, `11-analysis-mp5.md`, `protocol.json#mp4`
  inteiro, metadados de `calibration-weights.json` (nós resumidos), `calibration-validation-60c.json`, e o **código
  completo** de `05b-calibrate.mjs`, `10-corpus-60d.mjs`, `.gitignore` e o topo de `lib-common.mjs`. Prompt exacto em
  `adversary-round5-prompt-sent.txt`; saída bruta em `adversary-codex-round5-raw.txt`.
- **Três perguntas pedidas pelo MP5:** o 7b foi avaliado nos mesmos corpora, sem ajuste? · a calibração pode ter visto
  o 60c? · o `10-corpus-60d.mjs` pode fugir texto para o git?
- **12 ataques: 0 críticos, 10 sérios, 2 menores. Aceites e corrigidos em código 7 · aceites e verificados 3 ·
  aceites (declaração) 2 · refutados 0.** Tudo o que mudou, mudou ANTES de existir um evento do 60d (0 no log).

| # | Sev. | Alegação atacada | Veredicto | Evidência / resposta |
|---|---|---|---|---|
| A1 | sério | «Mesmos corpora, sem tuning» declarado, não demonstrado | **ACEITE → VERIFICADO** | Comparação dos ficheiros D do 14b e do 7b, por corpus: conjuntos de ids **iguais** (40/57/37), `corpus` igual, `questions` (as 4 perguntas, JSON) **iguais**, `policy` igual, `expected` **igual id a id** (mesmo ficheiro de rótulos — no 40 o caminho difere só por ser absoluto vs relativo), rubrica sha `f95958dd…` intacta. Os `at` mostram 14b às 09:38/10:14/10:45Z (MP1–MP3) e 7b às 12:23–12:24Z: o 14b não foi re-corrido. Sem parâmetros ajustáveis no harness (v0 argmax). |
| A2 | menor | «NÃO SERVE» é operacional, não inferioridade populacional | **ACEITE** | É exactamente o que o pré-registo diz («sobre o ponto, não sobre o IC») e o PROGRESSO repete: os McNemar testam igualdade, não a margem; não se afirma inferioridade estatística. Fica com esse sentido. |
| A3 | sério | 251 sem independência demonstrada do 60c (sobreposição por texto) | **ACEITE → VERIFICADO** | sha12 dos 37 do 60c contra as 4 fontes do ajuste, cru e `trim`: **0/84 gold · 0/70 valset · 0/40 · 0/57**; e por prefixo de 40 chars normalizado (minúsculas, espaços): **0 · 0 · 0 · 0**. O 40 e o 60b já excluíam o 60c por construção (sha a montante no `corpus-60b.mjs --block mp3`). |
| A4 | sério | T=1,55 ou outros ajustes anteriores podem estar nas probabilidades | **ACEITE (declaração)** | `answers.tier.probs` vem do `02-arm-D-logit.mjs` (massa dos top_logprobs normalizada pelas letras, temperatura 0, sem transformação); o v0+T do MP2 vive nos ficheiros `policy-*.json`, nunca reescreve os `D-*.json`. O que o adversário diz de verdadeiro: o 60c **era conhecido** no pré-registo do MP4 — por isso o 60c é validação declarada e o teste virgem é o 60d. |
| A5 | sério | «Sem re-fit» não é imposto pelo código | **ACEITE → CORRIGIDO** | `05b-calibrate.mjs` passa a **recusar** (exit 4) se `results/calibration-weights.json` existir — um re-ajuste obriga a apagar o ficheiro commitado (fica no git diff) e a correr com `--refit-declared`; os pesos guardam o **sha256 de cada ficheiro de entrada** e do ficheiro de validação, além do sha do script. Verificado: a 2.ª invocação recusou com exit 4. |
| A6 | sério | O PAV funde antes de agrupar os empates em x | **ACEITE → CORRIGIDO, mordida provada** | Contra-exemplo do adversário `(0,0),(0,0),(0,1),(1,0),(1,1)`: o PAV antigo (commit `009b509c`, corrido a partir do git) dá `[0–1 → 0,4]`; o correcto é `0 → 1/3, 1 → 1/2`. Agora agrupa por x **antes** de fundir; teste (1b) com o contra-exemplo + invariância à permutação. **Re-ajuste com o PAV corrigido: nós byte-idênticos nas 4 classes (49/45/51/61), ECE 60c 0,1265 → 0,1265, in-sample 0,0153 → 0,0153** — o defeito era real e não mordeu nestes dados (não há empates em x fora dos zeros, que são todos y=0). Declarado: o re-ajuste foi por bug de implementação, não por ter visto o 60c; os números não mudaram. |
| A7 | sério | `--out` escreve prompts em caminhos não ignorados / fora de `results/` | **ACEITE → CORRIGIDO** | `assertSafeOut()`: um caminho **dentro do repo** só é aceite se `git check-ignore` o ignorar; fora do repo (tmp dos testes) é livre. Teste (5): `results/corpus-60d-copia.json` é recusado sem escrever nada. |
| A8 | sério | Guarda de cegueira contornável; `--predictions` re-amostra um log mutável | **ACEITE → CORRIGIDO** | `--predictions` deixa de re-amostrar: lê o **corpus congelado** e os rótulos, exige rótulos válidos (`T0..T3`) para **todos** os ids, exige `_target_reached`, procura cada item pelo seu `event_sha12` **e** pela sessão (sha8), recusa se não houver evento único, e grava o sha256 do corpus e dos rótulos no ficheiro de previsões. Teste (5) cobre: sem rótulos → 3; rótulos incompletos → 3; corpus parcial → 3; completo → 4 linhas ligadas por sha. |
| A9 | sério | Previsões/metadados/consola podem transportar texto | **ACEITE → CORRIGIDO** | `predictionOf()` escolhe **só escalares** (números, tier `T0..T3`, sha12 hex); nada do evento passa por cópia de objecto. Teste (5): nenhuma string ≥ 25 chars nas previsões. Consola: continua a imprimir o caminho de saída e as chaves de `_dropped` (`tag_<nome>`, como no 60c) — declarado, não é texto do prompt. |
| A10 | sério | Exclusões históricas falham em silêncio; índice guarda só a 1.ª ocorrência | **ACEITE → CORRIGIDO** | `knownShas()` regista por fonte `{ok, contagem}` ou `{ok:false, erro}` em `_known_sources`, e o CLI **não fecha** o corpus com uma fonte em falta. O índice guarda **todas** as ocorrências por sha e a escolha exige a sessão do evento (o nome do ficheiro da transcrição **é** o `session_id`); sem sessão, só serve ocorrência única. Teste (1): um `s0.jsonl` com o mesmo texto do s3a não rouba o evento de s3. |
| A11 | sério | Amostra incompleta/degradada pode avançar até às previsões | **ACEITE → CORRIGIDO** | O CLI só fecha o corpus com as 4 fontes, `n ≥ n_target`, não-ok ≤ 10 % e sem-texto ≤ 10 % (denominadores explícitos: `_not_ok_rate = não-ok/eventos`, `_unrecovered_rate = sem-texto/eventos-ok`); senão **exit 5 «NÃO FECHADO»**; `--partial` escreve marcado `_partial:true` só para inspecção, e `--predictions` recusa um corpus parcial. |
| A12 | menor | Fixtures e histórico git podem ter prompts reais | **ACEITE (declaração)** | Os prompts do `10-corpus-60d.test.mjs` são sintéticos (escritos à mão neste MP); os ficheiros commitados do pacote nunca tiveram texto de prompt real (`.gitignore` desde o MP1; os `11-analysis-mp5.*` só têm contagens). A anonimização cobre home/dono/email e não o resto do conteúdo — limite herdado do P1, declarado. |

## Veredicto do adversário (verbatim)

> VERDICT: Q1 — A decisão pontual está correcta; identidade efectiva dos corpora e ausência de tuning não estão
> comprovadas, e "NÃO SERVE" deve conservar o sentido operacional limitado. Q2 — O fluxo separa ajuste e validação
> directamente, mas não garante ausência de contaminação indirecta nem impede re-fit, e contém um erro de PAV com
> empates. Q3 — Há caminhos concretos para escrita fora de `results/`, exposição em ficheiros rastreáveis e contorno
> da guarda de cegueira; uma fuga efectiva para Git não foi demonstrada.

**Aceite.** Q1 verificada (A1, A3); Q2 fechada em código (A5, A6) com re-ajuste byte-idêntico; Q3 fechada em código
(A7–A11) com testes. O que o adversário não viu — a versão corrigida — não foi re-atacado por ele.
