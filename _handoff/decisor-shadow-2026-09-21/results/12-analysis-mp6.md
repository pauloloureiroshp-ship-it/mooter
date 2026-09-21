# decisor-shadow — análise MP6 · calibração sem aprender · 2026-09-21T13:53:17.087Z

Pré-registo: `protocol.json#mp6` (`_registered_at` 2026-09-21T13:41:18.540Z; conta o %cI do commit `defb9c26`). Regra: exploração em **40 e 57** (separados), validação **só reportada** no 60c, zero ajuste nos três. Referência = D v0 no 14b (ficheiros já existentes, não re-corridos). Sonda antes do pré-registo: os dois qwen3 pensam antes da letra e `think:false` é ignorado no `/v1` (Ollama 0.34.2) — previsão declarada: C2 refutada por no-letter.

| linha | acc 40 | acc 57 | **acc 60c** | ECE 40 | ECE 57 | **ECE 60c** | p50 ms (4 perg.) | cobertura | veredicto |
|---|---|---|---|---|---|---|---|---|---|
| 14b v0 | 0.600 (24/40) | 0.614 (35/57) | 0.622 (23/37) | 0.110 | 0.124 | 0.146 | 165 / 140 / 162 | 100 % | referência |
| 14b TTA | 0.550 (22/40) | 0.632 (36/57) | 0.703 (26/37) | 0.187 | 0.196 | 0.221 | 274 / 239 / 249 | 100 % | C1 REFUTADA |
| 27b v0 | 0.000 (0/40) · 40 no-letter | 0.000 (0/57) · 57 no-letter | 0.000 (0/37) · 37 no-letter | n/d | n/d | n/d | 1071 / 995 / 1036 | 100 % | C2 REFUTADA (no-letter 100 % / 100 %) |
| 30b v0 | 0.000 (0/40) · 40 no-letter | 0.000 (0/57) · 57 no-letter | 0.000 (0/37) · 37 no-letter | n/d | n/d | n/d | 151 / 153 / 158 | 100 % | C2 REFUTADA (no-letter 100 % / 100 %) |
| 14b TTA + selectivo@70 % | 0.536 cob. · 0.450 comb. | 0.675 cob. · 0.544 comb. | 0.692 cob. · 0.486 comb. | 0.247 cob. | 0.164 cob. | 0.174 cob. | como 14b TTA | 70 % (resto → regra) | (d) C1+C3: REFUTADA |
| 14b v0 + selectivo@70 % (informativo) | 0.643 cob. · 0.525 comb. | 0.675 cob. · 0.561 comb. | 0.731 cob. · 0.514 comb. | 0.140 cob. | 0.156 cob. | 0.222 cob. | como 14b v0 | 70 % (resto → regra) | C3 REFUTADA |

`cob.` = acc/ECE nos 70 % mais confiantes; `comb.` = acc combinada (D nos cobertos + regra nos não cobertos). Curvas completas (50–100 %) em `11-selective.md`.

## Veredictos por hipótese (regra pré-registada, decidida em 40 e 57)

- **C1 · TTA por permutação de letras: REFUTADA.** ECE 40 0.110 → 0.187; ECE 57 0.124 → 0.196 (sobe nos dois). Acc 40 0.600 → 0.550 (dentro dos 5 pp, exactamente na fronteira); acc 57 0.614 → 0.632. No 60c (só reportado): acc 0.622 → 0.703, ECE 0.146 → 0.221. A média das 4 rotações não corrige onde a sobre-confiança está: os bins do meio (0,5–0,7) continuam a acertar 29–63 % com confiança 0,55–0,76 (bins abaixo), e o bin 0,9 já estava bem calibrado no v0 (82–91 %). O viés de letra não é a fonte do erro de calibração.
- **C2 · modelo maior: REFUTADA por no-letter, nos dois** — 27b v0: 40/40 · 57/57 · 37/37 itens sem letra (100 %, nas 4 perguntas; 1.º token «The»/«Here»), p50 1071/995/1036 ms; 30b v0: 40/40 · 57/57 · 37/37 itens sem letra (100 %, nas 4 perguntas; 1.º token «We»), p50 151/153/158 ms. Nenhuma previsão existe, logo acc = 0 por construção e ECE n/d. O 27b, mesmo que respondesse, está acima do tecto (p50 ≈ 1 000 ms nas 4 perguntas; 250–270 ms só no tier); o 30b (MoE a3b) seria rápido (p50 ≈ 150 ms). Não se correu variante que force a letra (pré-registado: seria outro harness).
- **C3 · risco selectivo: REFUTADA.** Em nenhum dos dois corpora de exploração existe cobertura ≥ 60 % com acc ≥ 0,75 e ECE ≤ 0,10, nem para o v0 nem para a TTA. A confiança do 14b separa pouco: no 57, os 50 % mais confiantes do v0 acertam 0.655 (todos: 0.614); no 40, 0.700 (todos: 0.600). A ECE nos cobertos é MAIOR que a global (os mais confiantes são os sobre-confiantes). O gate alternativo fica pré-registado para o 60d na mesma — avalia-se lá, e a previsão honesta é que chumba.
- **(d) C1+C3:** REFUTADA (C1 e C3 refutadas separadamente).

## Ordenação para o candidato (b) do mp4 (regra `mp6.step7_candidate_rule`, fixada em 40+57)

| candidato | ECE 40 | ECE 57 | score (média) | acc 40 / 57 | elegível | **60c (só reportado)** ECE · acc |
|---|---|---|---|---|---|---|
| `iso` — v0 + isotónica por classe (ajuste nos 154 canónicos, out-of-sample no 40/57) | 0.311 | 0.320 | 0.316 | 0.600 / 0.614 | sim | 0.266 · 0.622 |
| `tta` — TTA (média das 4 rotações), sem calibração | 0.187 | 0.196 | 0.191 | 0.550 / 0.632 | sim (acc na fronteira dos 5 pp) | 0.221 · 0.703 |
| `tta_iso` — TTA + isotónica por classe (ajuste nas saídas TTA dos 154 canónicos) | 0.168 | 0.239 | 0.204 | 0.550 / 0.632 | sim (acc na fronteira dos 5 pp) | 0.267 · 0.703 |
| `27b` — qwen3.6:27b v0 | n/d | n/d | n/d | 0.000 / 0.000 | fora da lista: letra em 0 % (< 90 %) | n/d · 0.000 |
| *(a) v0 sem calibração — referência, não é candidato do step7* | 0.110 | 0.124 | 0.117 | 0.600 / 0.614 | — | 0.146 · 0.622 |
| *(b)-251 do mp4 (isotónica ajustada nos 251, que incluem o 40 e o 57) — IN-SAMPLE, não comparável* | 0.161 | 0.097 | — | idem v0 | — | 0.126 · 0.622 |

**Vencedor pela regra: `tta`** (score 0.191; o seguinte é `tta_iso` a 0.204). **Leitura honesta, dita antes do 60d:** nenhum candidato do step7 bate o **v0 sem calibração** na exploração (score 0.117) — a TTA sobe a ECE, a isotónica ajustada em prompts canónicos (154) **piora muito** nos reais (0,110 → 0,311 no 40; 0,124 → 0,320 no 57: os canónicos são mais fáceis para o modelo, a curva aprendida lá é sobre-confiante cá), e a (b)-251 do mp4 só parecia servir porque era in-sample no 40 e no 57 (e mesmo assim dá 0,161 no 40, pior que o v0). A emenda mp4-1 aplica a regra tal como foi pré-registada; a decisão de retirar a calibração do mp4 (fazer (b) = (a)) não está na regra e é do dono.

## Latência

- 14b TTA: p50 274 / 239 / 249 ms nas 7 chamadas (tier 4× = 152 / 133 / 143 ms) — vs v0 165 / 140 / 162 ms. Acima do tecto de 250 ms no 40 (274); abaixo por pouco no 57 e no 60c.
- 27b: p50 1071 / 995 / 1036 ms (VRAM 16 GB) · 30b: 151 / 153 / 158 ms (VRAM 18 GB). Um de cada vez; o 14b foi parado antes e re-aquecido (keep_alive −1) depois.

## Bins da TTA (sub-confiança)

- 40 · v0: 0.3:3/33%/0.37 · 0.4:8/50%/0.45 · 0.5:7/57%/0.54 · 0.6:5/40%/0.65 · 0.7:3/67%/0.76 · 0.8:3/67%/0.84 · 0.9:11/82%/0.96
- 40 · TTA: 0.2:1/0%/0.30 · 0.3:3/67%/0.36 · 0.4:6/50%/0.45 · 0.5:7/29%/0.55 · 0.6:5/60%/0.66 · 0.7:6/33%/0.74 · 0.8:2/50%/0.89 · 0.9:10/90%/0.96
- 57 · v0: 0.3:4/50%/0.37 · 0.4:9/44%/0.46 · 0.5:8/50%/0.57 · 0.6:5/80%/0.67 · 0.7:12/58%/0.75 · 0.8:8/50%/0.84 · 0.9:11/91%/0.96
- 57 · TTA: 0.3:5/60%/0.37 · 0.4:7/71%/0.46 · 0.5:7/14%/0.54 · 0.6:5/80%/0.62 · 0.7:16/63%/0.76 · 0.8:6/50%/0.84 · 0.9:11/91%/0.95
- 60c · v0: 0.3:3/33%/0.36 · 0.4:10/50%/0.44 · 0.5:6/67%/0.53 · 0.6:3/33%/0.64 · 0.8:3/100%/0.84 · 0.9:12/75%/0.96
- 60c · TTA: 0.2:1/100%/0.29 · 0.3:5/80%/0.37 · 0.4:6/67%/0.44 · 0.5:7/57%/0.55 · 0.6:2/50%/0.63 · 0.7:1/0%/0.71 · 0.8:3/100%/0.84 · 0.9:12/75%/0.95

⚠️ Nada aqui é decisão: o adversário (codex, round 6) pergunta se a média foi feita no espaço certo, se houve ajuste no 60c e se a curva selectiva usa o mesmo `p_max` do gate.
